// Real PostgreSQL regressions for the corpus capacity counter and bounded
// hydration selection. The fixture uses a throwaway postgres:17-alpine container
// on loopback with tmpfs storage, then removes that exact container in finally.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const POSTGRES_IMAGE = "postgres:17-alpine";
const POSTGRES_DATABASE = "keskkonnaportaal_capacity";
const FIXTURE_ORIGIN = "https://keskkonnaportaal.ee";

function dockerImageAvailable(image) {
  try {
    execFileSync("docker", ["image", "inspect", image], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startPostgresContainer(name, port) {
  const containerId = String(execFileSync("docker", [
    "run", "--detach", "--rm", "--pull=never", "--name", name,
    "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
    "--env", "POSTGRES_USER=postgres",
    "--env", `POSTGRES_DB=${POSTGRES_DATABASE}`,
    "--publish", `127.0.0.1:${port}:5432`,
    "--tmpfs", "/var/lib/postgresql/data:rw",
    POSTGRES_IMAGE,
    "postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off",
  ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim();
  if (!containerId) throw new Error("temporary PostgreSQL container returned no id");
  return containerId;
}

async function waitForPostgres(connectionString, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError = new Error("temporary PostgreSQL never answered");
  while (Date.now() < deadline) {
    const probe = new Client({ connectionString, connectionTimeoutMillis: 1_000 });
    try {
      await probe.connect();
      await probe.query("SELECT 1");
      await probe.end();
      return;
    } catch (error) {
      lastError = error;
      await probe.end().catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  throw new Error(`temporary PostgreSQL never answered: ${lastError.message}`);
}

function removeContainer(identifier) {
  if (!identifier) return false;
  try {
    execFileSync("docker", ["rm", "--force", identifier], { stdio: "ignore" });
  } catch {
    // The container may already be gone.
  }
  try {
    execFileSync("docker", ["container", "inspect", "--format", "{{.Id}}", identifier], { stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
}

function recordQueries(client) {
  const statements = [];
  const calls = [];
  return {
    statements,
    calls,
    client: new Proxy(client, {
      get(target, property) {
        if (property === "query") {
          return async (query, values) => {
            const text = typeof query === "string" ? query : String(query?.text || "");
            statements.push(text);
            calls.push({ text, values });
            return target.query(query, values);
          };
        }
        const value = Reflect.get(target, property, target);
        return typeof value === "function" ? value.bind(target) : value;
      },
    }),
  };
}

function aggregateCapacitySql() {
  return `SELECT COUNT(*)::BIGINT AS row_count,
                 COALESCE(SUM(pg_column_size(document)), 0)::BIGINT AS total_bytes
          FROM practice_corpus_documents AS document`;
}

async function readCapacity(client) {
  const result = await client.query(
    "SELECT row_count, total_bytes, version FROM practice_corpus_capacity WHERE id = TRUE",
  );
  assert.equal(result.rowCount, 1);
  return {
    rowCount: Number(result.rows[0].row_count),
    totalBytes: Number(result.rows[0].total_bytes),
    version: Number(result.rows[0].version),
  };
}

async function assertCapacityMatchesAggregate(client, expectedVersion) {
  const [counter, aggregate] = await Promise.all([
    readCapacity(client),
    client.query(aggregateCapacitySql()),
  ]);
  assert.equal(counter.version, expectedVersion);
  assert.equal(counter.rowCount, Number(aggregate.rows[0].row_count));
  assert.equal(counter.totalBytes, Number(aggregate.rows[0].total_bytes));
  return counter;
}

async function waitForAdvisoryWait(admin, pid, timeoutMs = 3_000) {
  const deadline = Date.now() + timeoutMs;
  const key = Number((await admin.query(
    "SELECT hashtext('practice-corpus-retention-capacity') AS key",
  )).rows[0].key);
  let locks = [];
  do {
    const result = await admin.query(`
      SELECT lock.classid, lock.objid, lock.objsubid, lock.granted,
             activity.wait_event_type, activity.wait_event, activity.state, activity.query
      FROM pg_locks AS lock
      LEFT JOIN pg_stat_activity AS activity ON activity.pid = lock.pid
      WHERE lock.pid = $1
        AND lock.locktype = 'advisory'
    `, [pid]);
    locks = result.rows;
    if (result.rows.some((lock) => lock.granted === false
      && Number(lock.classid) === 0
      && Number(lock.objid) === key
      && Number(lock.objsubid) === 1
      && lock.wait_event_type === "Lock")) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  } while (Date.now() < deadline);
  throw new Error(`upsert did not queue on the corpus capacity advisory lock: ${JSON.stringify(locks)}`);
}

async function insertDocument(client, {
  externalId,
  path,
  url: suppliedUrl,
  title = "Ametlik lehekülg",
  content = "Ametlik sisu metsa ja keskkonna kohta.",
  contentHash = createHash("sha256").update(content).digest("hex"),
  sourceKey = "official-page-hydration",
  runId = 7,
  metadata = {},
  fetchedAt = new Date().toISOString(),
}) {
  const url = suppliedUrl || `${FIXTURE_ORIGIN}${path}`;
  await client.query(`
    INSERT INTO practice_corpus_documents
      (external_id, source_key, canonical_url, title, summary, content, category,
       organization, topics, source_tier, language, metadata_quality, metadata,
       content_hash, fetched_at, last_seen_at, last_seen_run, is_available)
    VALUES ($1, $2, $3, $4, '', $5, 'Uudis', 'Keskkonnaagentuur', ARRAY['mets']::TEXT[],
            'official', 'et', 3, $6::JSONB, $9, $7::TIMESTAMPTZ, $7::TIMESTAMPTZ, $8, TRUE)
  `, [externalId, sourceKey, url, title, content, JSON.stringify(metadata), fetchedAt, runId, contentHash]);
  return url;
}

function planNodes(plan) {
  const nodes = [];
  const visit = (node) => {
    nodes.push(node);
    for (const child of node.Plans || []) visit(child);
  };
  visit(plan);
  return nodes;
}

test("corpus capacity stays exact and hydration selection uses a bounded indexed plan", { timeout: 300_000 }, async (t) => {
  if (!dockerImageAvailable(POSTGRES_IMAGE)) {
    const message = `Docker image ${POSTGRES_IMAGE} is required for the isolated PostgreSQL capacity fixture`;
    if (process.env.ALLOW_POSTGRES_TEST_SKIP === "1") {
      t.skip(message);
      return;
    }
    throw new Error(`${message}. Pull the image or set ALLOW_POSTGRES_TEST_SKIP=1 to skip explicitly.`);
  }
  const containerName = `corpus-capacity-${process.pid}-${randomBytes(3).toString("hex")}`;
  const port = await reserveLoopbackPort();
  const databaseUrl = `postgres://postgres@127.0.0.1:${port}/${POSTGRES_DATABASE}`;
  t.diagnostic(`temporary PostgreSQL container: ${containerName} on 127.0.0.1:${port}, removed in finally`);
  let admin;
  let createdContainerId = null;
  try {
    createdContainerId = startPostgresContainer(containerName, port);
    await waitForPostgres(databaseUrl);
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL_MODE = "disable";
    process.env.SEARCH_HASH_SECRET = randomBytes(32).toString("base64");
    process.env.CORPUS_MAX_ROWS = "20000";
    const [storage, hydration, ingestion] = await Promise.all([
      import("../server/corpus_storage.mjs"),
      import("../server/corpus_hydration.mjs"),
      import("../server/corpus_ingestion.mjs"),
    ]);
    const {
      CORPUS_CAPACITY_VERSION,
      REVIEWED_CATALOGUE_SOURCE_KEY,
      ensureCorpusCapacity,
      ensureCorpusSchema,
      enforceCorpusRetention,
      upsertDocuments,
    } = storage;
    const {
      buildHydrationCandidateQuery,
      persistHydratedCorpusDocument,
      recordCorpusHydrationAttempt,
      selectHydrationCandidates,
    } = hydration;
    const {
      reviewedCatalogueCorpusRecords,
      seedReviewedCatalogueDocuments,
    } = ingestion;
    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    await ensureCorpusSchema();

    await t.test("counter follows insert update delete and repairs only a stale version", async () => {
      const first = await insertDocument(admin, { externalId: "capacity-1", path: "/et/capacity-1" });
      const second = await insertDocument(admin, { externalId: "capacity-2", path: "/et/capacity-2" });
      await insertDocument(admin, { externalId: "capacity-3", path: "/et/capacity-3" });
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);

      await admin.query(
        "UPDATE practice_corpus_documents SET content = $1, title = $2 WHERE canonical_url = $3",
        ["Uuendatud ametlik sisu.".repeat(20), "Uuendatud pealkiri", first],
      );
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);

      await admin.query("DELETE FROM practice_corpus_documents WHERE canonical_url = $1", [second]);
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);

      await admin.query(
        "UPDATE practice_corpus_capacity SET row_count = 0, total_bytes = 0, version = version - 1 WHERE id = TRUE",
      );
      await ensureCorpusCapacity(admin);
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);

      const currentVersion = recordQueries(admin);
      await ensureCorpusCapacity(currentVersion.client);
      assert.equal(currentVersion.statements.some((sql) => /SUM\s*\(\s*pg_column_size\s*\(\s*document\s*\)/iu.test(sql)), false);
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
    });

    await t.test("a current counter with a missing trigger is recomputed and repaired", async () => {
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
      await admin.query("DROP TRIGGER practice_corpus_capacity_trigger ON practice_corpus_documents");
      const recorder = recordQueries(admin);
      const repaired = await ensureCorpusCapacity(recorder.client);
      assert.equal(repaired.initialized, true);
      assert.ok(recorder.statements.some((sql) => /SUM\s*\(\s*row_bytes\s*\)/iu.test(sql)));
      const trigger = await admin.query(`
        SELECT EXISTS (
          SELECT 1 FROM pg_trigger
          WHERE tgrelid = 'practice_corpus_documents'::REGCLASS
            AND tgname = 'practice_corpus_capacity_trigger'
            AND tgenabled = 'O'
        ) AS present
      `);
      assert.equal(trigger.rows[0].present, true);
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
      await insertDocument(admin, { externalId: "capacity-trigger", path: "/et/capacity-trigger" });
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
    });

    await t.test("hydration rollback restores the counter and a commit keeps it exact", async () => {
      const url = await insertDocument(admin, { externalId: "capacity-hydration", path: "/et/capacity-hydration" });
      const before = await readCapacity(admin);
      const original = await admin.query("SELECT content FROM practice_corpus_documents WHERE canonical_url = $1", [url]);
      const persisted = await persistHydratedCorpusDocument(admin, {
        url,
        title: "Värskendatud lehekülg",
        content: "Värskendatud ametlik leheküljesisu.".repeat(20),
        contentHash: "a".repeat(64),
        metadata: JSON.stringify({ hydrated: true, source_kind: "official-page-hydration" }),
        runId: 8,
      }, { maximumBytes: 0 });
      assert.equal(persisted, false);
      assert.equal((await readCapacity(admin)).totalBytes, before.totalBytes);
      assert.equal((await admin.query("SELECT content FROM practice_corpus_documents WHERE canonical_url = $1", [url])).rows[0].content, original.rows[0].content);

      const committed = await persistHydratedCorpusDocument(admin, {
        url,
        title: "Värskendatud lehekülg",
        content: "Värskendatud ametlik leheküljesisu.".repeat(20),
        contentHash: "b".repeat(64),
        metadata: JSON.stringify({ hydrated: true, source_kind: "official-page-hydration" }),
        runId: 8,
      }, { maximumBytes: 1_000_000_000 });
      assert.equal(committed, true);
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
    });

    await t.test("repeated upserts read the singleton instead of aggregating the corpus", async () => {
      const recorder = recordQueries(admin);
      const documents = [
        { sourceKey: "official-sitemap", url: `${FIXTURE_ORIGIN}/et/upsert-a`, title: "Upsert A", content: "" },
        { sourceKey: "official-sitemap", url: `${FIXTURE_ORIGIN}/et/upsert-b`, title: "Upsert B", content: "" },
      ];
      await upsertDocuments(recorder.client, documents, 9);
      await upsertDocuments(recorder.client, documents, 9);
      assert.equal(recorder.statements.some((sql) => /SUM\s*\(\s*pg_column_size\s*\(\s*document\s*\)/iu.test(sql)), false);
      assert.ok(recorder.statements.filter((sql) => /FROM\s+practice_corpus_capacity/iu.test(sql)).length >= 2);
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
    });

    await t.test("a hydration marker racing an upsert queues on the capacity lock", async () => {
      assert.equal(typeof recordCorpusHydrationAttempt, "function");
      const url = await insertDocument(admin, {
        externalId: "capacity-marker-race",
        path: "/et/capacity-marker-race",
      });
      const markerClient = new Client({ connectionString: databaseUrl });
      const upsertClient = new Client({ connectionString: databaseUrl });
      await markerClient.connect();
      await upsertClient.connect();
      let releaseCommit;
      const upsertPid = Number((await upsertClient.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
      const commitGate = new Promise((resolve) => { releaseCommit = resolve; });
      let markerAtCommit;
      const markerReady = new Promise((resolve) => { markerAtCommit = resolve; });
      const gatedMarkerClient = new Proxy(markerClient, {
        get(target, property) {
          if (property === "query") {
            return async (query, values) => {
              const text = typeof query === "string" ? query : String(query?.text || "");
              if (text.trim() === "COMMIT") {
                markerAtCommit();
                await commitGate;
              }
              return target.query(query, values);
            };
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      const markerPromise = recordCorpusHydrationAttempt(gatedMarkerClient, [url], {
        pdf_status: "fetch-failed",
      });
      let upsertPromise;
      try {
        await markerReady;
        upsertPromise = upsertDocuments(upsertClient, [{
          sourceKey: "official-page-hydration",
          url,
          content: "Fresh body written after the failed hydration attempt.".repeat(4),
          quality: 5,
        }], 11).then(
          (value) => ({ value }),
          (error) => ({ error }),
        );
        await waitForAdvisoryWait(admin, upsertPid);
        releaseCommit();
        const [marker, upsert] = await Promise.all([markerPromise, upsertPromise]);
        assert.equal(marker.rowCount, 1);
        assert.equal(upsert.error, undefined);
        assert.equal(upsert.value.indexed, 1);
        const row = await admin.query(`
          SELECT content, metadata->>'pdf_status' AS pdf_status,
                 metadata ? 'hydration_attempted_at' AS attempted
          FROM practice_corpus_documents
          WHERE canonical_url = $1
        `, [url]);
        assert.match(row.rows[0].content, /Fresh body/u);
        assert.equal(row.rows[0].pdf_status, "fetch-failed");
        assert.equal(row.rows[0].attempted, true);
        await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
      } finally {
        releaseCommit();
        await Promise.allSettled([markerPromise, upsertPromise]);
        await markerClient.query("ROLLBACK").catch(() => undefined);
        await upsertClient.query("ROLLBACK").catch(() => undefined);
        await markerClient.end().catch(() => undefined);
        await upsertClient.end().catch(() => undefined);
      }
    });

    await t.test("catalogue seeding admits new rows under the shared capacity rules", async () => {
      const records = reviewedCatalogueCorpusRecords();
      assert.ok(records.length > 1);
      const crawled = records[0];
      const crawledContent = "Crawled portal body must survive reviewed catalogue seeding.";
      const crawledHash = createHash("sha256").update(crawledContent).digest("hex");
      const fetchedAt = "2026-01-01T00:00:00.000Z";
      const url = await insertDocument(admin, {
        externalId: "catalogue-crawled",
        url: crawled.canonical_url,
        path: new URL(crawled.canonical_url).pathname,
        title: "Crawled portal title",
        content: crawledContent,
        contentHash: crawledHash,
        sourceKey: "portal-catalog",
        fetchedAt,
      });
      await seedReviewedCatalogueDocuments(admin, null);
      const preserved = await admin.query(`
        SELECT content, content_hash, fetched_at
        FROM practice_corpus_documents
        WHERE canonical_url = $1
      `, [url]);
      assert.equal(preserved.rows[0].content, crawledContent);
      assert.equal(preserved.rows[0].content_hash, crawledHash);
      assert.equal(preserved.rows[0].fetched_at.getTime(), Date.parse(fetchedAt));

      await admin.query(`
        DELETE FROM practice_corpus_documents
        WHERE source_key = $1
          AND canonical_url <> $2
      `, [REVIEWED_CATALOGUE_SOURCE_KEY, url]);
      const beforeFill = await readCapacity(admin);
      const fillerRows = 20_000 - beforeFill.rowCount;
      assert.ok(fillerRows > 0);
      await admin.query(`
        INSERT INTO practice_corpus_documents
          (external_id, source_key, canonical_url, title, summary, content, category,
           organization, topics, source_tier, language, metadata_quality, metadata,
           content_hash, fetched_at, last_seen_at, last_seen_run, is_available)
        SELECT
          'capacity-filler-' || g,
          'capacity-filler',
          $1 || '/et/capacity-filler-' || g,
          'Capacity filler ' || g,
          '',
          'Filler',
          'Uudis',
          'Keskkonnaagentuur',
          ARRAY['mets']::TEXT[],
          'official',
          'et',
          1,
          '{}'::JSONB,
          md5('Filler'),
          NOW(),
          NOW(),
          NULL,
          TRUE
        FROM generate_series(1, $2) AS g
      `, [FIXTURE_ORIGIN, fillerRows]);
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
      const beforeUrls = new Set((await admin.query(
        "SELECT canonical_url FROM practice_corpus_documents",
      )).rows.map((row) => row.canonical_url));

      const seeded = await seedReviewedCatalogueDocuments(admin, null);
      assert.equal(seeded.seeded, 1);
      assert.equal(seeded.capacityDropped, records.length - 1);
      const afterUrls = new Set((await admin.query(
        "SELECT canonical_url FROM practice_corpus_documents",
      )).rows.map((row) => row.canonical_url));
      assert.deepEqual([...afterUrls].filter((value) => !beforeUrls.has(value)), []);
      const afterCrawled = await admin.query(`
        SELECT content, content_hash, fetched_at
        FROM practice_corpus_documents
        WHERE canonical_url = $1
      `, [url]);
      assert.equal(afterCrawled.rows[0].content, crawledContent);
      assert.equal(afterCrawled.rows[0].content_hash, crawledHash);
      assert.equal(afterCrawled.rows[0].fetched_at.getTime(), Date.parse(fetchedAt));
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);
    });

    await t.test("top K hydration keeps microseconds across candidate slices", async () => {
      const olderUrl = await insertDocument(admin, {
        externalId: "capacity-precision-older",
        path: "/et/capacity-time-older",
        fetchedAt: "2026-11-24T10:00:00.000500Z",
      });
      const newerUrl = await insertDocument(admin, {
        externalId: "capacity-precision-newer",
        path: "/et/capacity-time-newer",
        fetchedAt: "2026-11-24T10:00:00.000900Z",
      });
      const rawCandidates = [
        olderUrl,
        ...Array.from({ length: 499 }, (_value, index) => `${FIXTURE_ORIGIN}/et/missing-${index}`),
        newerUrl,
      ];
      const selected = await selectHydrationCandidates(admin, rawCandidates, 1, { backlog: true });
      assert.deepEqual(selected, [olderUrl]);
    });

    await t.test("backlog fills empty bodies before refreshing unwitnessed bodies", async () => {
      const existingBodyUrl = await insertDocument(admin, {
        externalId: "capacity-backlog-existing-body",
        path: "/et/capacity-backlog-existing-body",
        fetchedAt: "2026-11-24T09:00:00.000000Z",
      });
      const emptyBodyUrl = await insertDocument(admin, {
        externalId: "capacity-backlog-empty-body",
        path: "/et/capacity-backlog-empty-body",
        content: "",
        fetchedAt: "2026-11-24T10:00:00.000000Z",
      });
      const selected = await selectHydrationCandidates(
        admin,
        [existingBodyUrl, emptyBodyUrl],
        1,
        { backlog: true },
      );
      assert.deepEqual(selected, [emptyBodyUrl]);
    });

    await t.test("retention closes stale running corpus runs with a bounded interrupted error", async () => {
      await admin.query(`
        INSERT INTO practice_corpus_runs (mode, status, started_at, finished_at, details)
        VALUES
          ('fixture', 'running', NOW() - INTERVAL '7 hours', NULL, '{}'::JSONB),
          ('fixture', 'running', NOW() - INTERVAL '1 hour', NULL, '{}'::JSONB)
      `);
      await enforceCorpusRetention(admin);
      const result = await admin.query(`
        SELECT status, error_count, details->>'error' AS error
        FROM practice_corpus_runs
        WHERE mode = 'fixture'
        ORDER BY started_at
      `);
      assert.equal(result.rows[0].status, "failed");
      assert.equal(Number(result.rows[0].error_count), 1);
      assert.equal(result.rows[0].error, "Corpus run interrupted after six hours");
      assert.equal(result.rows[1].status, "running");
    });

    await t.test("candidate selection stays below the request timeout and rotates after failed attempts", async () => {
      await admin.query(`
        INSERT INTO practice_corpus_documents
          (external_id, source_key, canonical_url, title, summary, content, category,
           organization, topics, source_tier, language, metadata_quality, metadata,
           content_hash, fetched_at, last_seen_at, last_seen_run, is_available)
        SELECT
          'bulk-' || g,
          CASE WHEN g % 5 = 0 THEN 'official-sitemap' WHEN g % 2 = 0 THEN 'portal-catalog' ELSE 'official-page-hydration' END,
          '${FIXTURE_ORIGIN}/et/bulk-' || g || '-run-' || CASE WHEN g % 10 = 0 THEN 99 ELSE 42 END,
          'Bulk ' || g,
          '',
          CASE WHEN g % 3 = 0 THEN '' ELSE repeat('Ametlik metsa ja keskkonna sisu. ', 8) END,
          'Uudis',
          'Keskkonnaagentuur',
          ARRAY['mets']::TEXT[],
          'official',
          'et',
          3,
          jsonb_build_object('hydrated', true, 'source_kind', 'official-page-hydration')
            || CASE WHEN g % 113 = 0 THEN '{"robots_noindex":true}'::JSONB ELSE '{}'::JSONB END
            || CASE WHEN g % 7 = 0 THEN jsonb_build_object('hydration_attempted_at', (NOW() - INTERVAL '1 day')::TEXT) ELSE '{}'::JSONB END,
          md5(CASE WHEN g % 3 = 0 THEN '' ELSE repeat('Ametlik metsa ja keskkonna sisu. ', 8) END),
          NOW() - (g % 60) * INTERVAL '1 day',
          NOW(),
          CASE WHEN g % 10 = 0 THEN 99 ELSE 42 END,
          TRUE
        FROM generate_series(1, 30000) AS g
      `);
      await admin.query("ANALYZE practice_corpus_documents");
      await assertCapacityMatchesAggregate(admin, CORPUS_CAPACITY_VERSION);

      const rawResult = await admin.query(`
        SELECT canonical_url
        FROM practice_corpus_documents
        WHERE last_seen_run = 42
        ORDER BY id ASC
      `);
      const rawCandidates = rawResult.rows.map((row) => row.canonical_url);
      assert.ok(rawCandidates.length > 25_000);

      const sql = buildHydrationCandidateQuery({ htmlOnly: true });
      const explained = await admin.query(
        `EXPLAIN (ANALYZE, TIMING OFF, FORMAT JSON) ${sql}`,
        [rawCandidates.slice(0, 500), 200],
      );
      const plan = explained.rows[0]["QUERY PLAN"][0];
      const nodes = planNodes(plan.Plan);
      const corpusScans = nodes.filter((node) => node["Relation Name"] === "practice_corpus_documents");
      const sequentialCorpusScans = corpusScans.filter((node) => node["Node Type"] === "Seq Scan");
      const indexedCorpusScans = corpusScans.filter((node) => /Index|Bitmap/iu.test(node["Node Type"]));
      assert.equal(sequentialCorpusScans.length, 0, JSON.stringify(sequentialCorpusScans));
      assert.ok(indexedCorpusScans.some((node) => node["Index Name"] === "practice_corpus_documents_canonical_url_key"));
      assert.ok(plan["Execution Time"] < 8_000, `candidate selection took ${plan["Execution Time"]} ms`);
      t.diagnostic(`500 URL candidate EXPLAIN: ${plan["Execution Time"]} ms, ${indexedCorpusScans.length} indexed corpus scans, 0 sequential corpus scans`);

      const recorder = recordQueries(admin);
      const startedAt = Date.now();
      const first = await selectHydrationCandidates(recorder.client, rawCandidates, 200, { htmlOnly: true });
      const selectionMs = Date.now() - startedAt;
      const candidateQueries = recorder.calls.filter((call) => call.text.includes("unnest($1::TEXT[])"));
      assert.equal(candidateQueries.length, Math.ceil(rawCandidates.length / 500));
      assert.ok(candidateQueries.every((call) => call.values[0].length <= 500));
      assert.ok(selectionMs < 30_000, `chunked candidate selection took ${selectionMs} ms`);
      assert.equal(first.length, 200);
      assert.equal(new Set(first).size, 200);
      assert.equal(first.some((url) => url.includes("-run-99")), false);
      t.diagnostic(`chunked selection: ${rawCandidates.length} URLs, ${candidateQueries.length} queries, ${selectionMs} ms`);

      await admin.query(`
        UPDATE practice_corpus_documents
        SET fetched_at = NOW(),
            metadata = metadata || jsonb_build_object('hydration_attempted_at', NOW())
        WHERE canonical_url = ANY($1::TEXT[])
      `, [first]);
      const second = await selectHydrationCandidates(admin, rawCandidates, 200, { htmlOnly: true });
      assert.equal(second.length, 200);
      assert.equal(second.some((url) => first.includes(url)), false, "attempted rows must yield to newer candidates during cooldown");
    });
  } finally {
    await admin?.end().catch(() => undefined);
    if (createdContainerId) {
      const removed = removeContainer(createdContainerId);
      t.diagnostic(`temporary PostgreSQL container removed: ${removed}`);
    }
  }
});
