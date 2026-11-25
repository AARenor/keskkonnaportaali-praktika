// Behavioural regression: copied text may only match and rank when a current
// source use policy allows indexing it, and the title and navigation metadata
// stay searchable for every row, including rows not yet migrated.
//
// Harness. The test drives a real, throwaway PostgreSQL cluster and the real
// production schema, trigger, search query and backfill with real SQL:
//
//   1. a temporary postgres:17-alpine container on a free loopback port, with a
//      tmpfs data directory and --rm, removed in the finally block; no volume and
//      no other container is touched;
//   2. the schema and trigger created by the production path (searchCorpus runs
//      ensureCorpusSchema);
//   3. deterministic rows inserted with SQL, so the trigger and the query are the
//      only things under test;
//   4. no transport is involved: nothing leaves this machine.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";

import { sourceResourceKey } from "../server/source-identity.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const POSTGRES_IMAGE = "postgres:17-alpine";
const POSTGRES_DATABASE = "keskkonnaportaal_index_policy";
const ORIGIN = "https://keskkonnaportaal.ee";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

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

// Starts a fresh container and returns its id. A name that is already in use
// makes docker fail here, so an existing container is reported and left alone
// rather than deleted.
function startPostgresContainer(name, port) {
  let containerId;
  try {
    containerId = String(execFileSync("docker", [
      "run", "--detach", "--rm", "--pull=never", "--name", name,
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env", "POSTGRES_USER=postgres",
      "--env", `POSTGRES_DB=${POSTGRES_DATABASE}`,
      "--publish", `127.0.0.1:${port}:5432`,
      "--tmpfs", "/var/lib/postgresql/data:rw",
      POSTGRES_IMAGE,
      "postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off",
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })).trim();
  } catch (error) {
    const detail = String(error?.stderr || error?.message || "").trim();
    throw new Error(`temporary PostgreSQL container did not start: ${detail}`);
  }
  if (!containerId) throw new Error("temporary PostgreSQL container returned no container id");
  return containerId;
}

async function waitForPostgres(connectionString, { timeoutMs = 90_000 } = {}) {
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

function removeContainer(containerId) {
  try {
    execFileSync("docker", ["rm", "--force", containerId], { stdio: "ignore" });
  } catch {
    // The container may already be gone.
  }
  try {
    const listing = execFileSync("docker", [
      "ps", "--all", "--filter", `id=${containerId}`, "--format", "{{.ID}}",
    ], { encoding: "utf8" });
    return String(listing).trim() === "";
  } catch {
    return false;
  }
}

function currentPolicy(fetchedAt, overrides = {}) {
  return {
    version: "source-policy-v1",
    contentKind: "fetched-html",
    resourceKey: `${ORIGIN}/et/mets`,
    bodyHash: sha256("fixture-body"),
    artifactHash: sha256("fixture-artifact"),
    product: "keskkonnaportaali-praktika-corpus",
    observedAt: fetchedAt,
    robots: { status: "allowed", origin: ORIGIN, checkedAt: fetchedAt },
    directives: {
      noindex: false,
      nosnippet: false,
      noarchive: false,
      maxSnippetChars: null,
      unavailableAfter: null,
      readable: true,
    },
    use: { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: true },
    rightsReview: { status: "unreviewed", reference: null },
    ...overrides,
  };
}

async function insertRow(client, {
  externalId,
  path,
  title,
  content,
  sourceKey = "official-page-hydration",
  fetchedAt,
  metadata = {},
  bindPolicy = true,
  category = "Uudis",
}) {
  const url = `${ORIGIN}${path}`;
  const boundMetadata = bindPolicy && metadata.source_policy
    ? {
      ...metadata,
      sourceResourceKey: sourceResourceKey(url),
      // A hydrated row binds its policy to its own resource and to the hash of
      // the body that was stored, exactly as the production writer does.
      source_policy: {
        ...metadata.source_policy,
        resourceKey: sourceResourceKey(url),
        artifactHash: sha256(content),
      },
    }
    : metadata;
  await client.query(`
    INSERT INTO practice_corpus_documents
      (external_id, source_key, canonical_url, title, summary, content, category,
       organization, topics, source_tier, language, metadata_quality, metadata,
       content_hash, fetched_at, last_seen_at, is_available)
    VALUES ($1, $2, $3, $4, '', $5, $9,
            'Keskkonnaagentuur', ARRAY['mets']::TEXT[], 'official', 'et', 3, $6::JSONB,
            $7, $8::TIMESTAMPTZ, $8::TIMESTAMPTZ, TRUE)
  `, [
    externalId,
    sourceKey,
    url,
    title,
    content,
    JSON.stringify(boundMetadata),
    sha256(content),
    fetchedAt,
    category,
  ]);
}

async function searchUrls(corpusRuntime, query) {
  const result = await corpusRuntime.searchCorpus(query, {
    pageSize: 50,
    includeContent: false,
    preferSnapshot: false,
  });
  return result.items.map((item) => item.url);
}

test("copied text matches and ranks only under a current allowing index policy", { timeout: 300_000 }, async (t) => {
  if (!dockerImageAvailable(POSTGRES_IMAGE)) {
    const message = `Docker image ${POSTGRES_IMAGE} is required for the isolated PostgreSQL index policy fixture`;
    if (process.env.ALLOW_POSTGRES_TEST_SKIP === "1") {
      t.skip(message);
      return;
    }
    throw new Error(`${message}. Pull the image or set ALLOW_POSTGRES_TEST_SKIP=1 to skip explicitly.`);
  }
  // The name and port can be pinned before the run so the exact container is
  // recorded in advance. Unset, both stay random so parallel suite runs never
  // collide.
  const requestedName = String(process.env.PRAKTIKA_TEST_CONTAINER_NAME || "").trim();
  const containerName = requestedName
    || `corpus-index-policy-${process.pid}-${randomBytes(3).toString("hex")}`;
  const requestedPort = Number(process.env.PRAKTIKA_TEST_PORT);
  const port = Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65_536
    ? requestedPort
    : await reserveLoopbackPort();
  const databaseUrl = `postgres://postgres@127.0.0.1:${port}/${POSTGRES_DATABASE}`;
  // Every row below is synthetic, the container is reachable only on loopback,
  // and the test opens no external network connection. A name that is already in
  // use fails the start and is never touched.
  t.diagnostic(`temporary PostgreSQL container: ${containerName} on 127.0.0.1:${port}, removed in finally`);
  let admin;
  let createdContainerId = null;
  try {
    createdContainerId = startPostgresContainer(containerName, port);
    await waitForPostgres(databaseUrl);
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL_MODE = "disable";
    process.env.SEARCH_HASH_SECRET = createHash("sha512").update("corpus-index-policy-fixture").digest("base64");
    const [corpusRuntime, corpusStorage] = await Promise.all([
      import(new URL("../server/corpus_runtime.mjs", import.meta.url).href),
      import(new URL("../server/corpus_storage.mjs", import.meta.url).href),
    ]);
    const { CORPUS_VECTOR_LAYOUT } = corpusStorage;
    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    // The production path creates the table, the trigger and the backfill column.
    await corpusRuntime.searchCorpus("soojendus", { preferSnapshot: false });

    const fetchedAt = new Date(Date.now() - 60_000).toISOString();
    const staleAt = new Date(Date.now() - 86_400_000).toISOString();
    const policy = currentPolicy(fetchedAt);
    const stalePolicy = currentPolicy(staleAt);

    const rows = [
      {
        externalId: "index-allowed",
        path: "/et/mets/lubatud",
        title: "Lubatud lehekülg",
        content: `Ametlik lubatud lehekülg, mille kehas on ainult siia kuuluv märksõna markerlubatud ja muu ametlik tekst.`,
        metadata: { hydrated: true, source_kind: "official-page-hydration", source_policy: policy },
      },
      {
        externalId: "index-legacy",
        path: "/et/mets/parand",
        title: "Pärandi pealkiri",
        content: `Vana keha, mis sisaldab märksõna markerparand ja mida ei tohi enam otsingus näha olla.`,
        metadata: { hydrated: true, source_kind: "official-page-hydration" },
      },
      {
        externalId: "index-nosnippet",
        path: "/et/mets/nosnippet",
        title: "Nosnippet lehekülg",
        content: `Keha, millel on nosnippet direktiiv ja märksõna markernosnippet, kuid indekseerimine on lubatud.`,
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          source_policy: currentPolicy(fetchedAt, {
            directives: { ...policy.directives, nosnippet: true },
            use: { retainBody: true, indexBody: true, displaySnippet: false, answerEvidence: false },
          }),
        },
      },
      {
        externalId: "index-noindex",
        path: "/et/mets/noindex",
        title: "Noindex pealkiri",
        content: `Keha märksõnaga markernoindex, mida ei tohi otsingus näha olla.`,
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          source_policy: currentPolicy(fetchedAt, {
            directives: { ...policy.directives, noindex: true },
            use: { retainBody: false, indexBody: false, displaySnippet: false, answerEvidence: false },
          }),
        },
      },
      {
        externalId: "index-stale",
        path: "/et/mets/vananenud",
        title: "Vananev pealkiri",
        content: `Keha märksõnaga markervananenud, mille poliitika ei vasta enam värskendusajale.`,
        metadata: { hydrated: true, source_kind: "official-page-hydration", source_policy: stalePolicy },
      },
      {
        externalId: "index-reviewed",
        path: "/et/mets/kinntatud",
        title: "Kinnitatud õigusakt",
        content: `Ülevaadatud ametlik tekst märksõnaga markerkinnitatud, mis on kinnitatud tõendina.`,
        sourceKey: "reviewed-catalogue-source",
        metadata: {
          hydrated: true,
          source_kind: "reviewed-catalogue",
          evidence_policy: "versioned",
          reviewed_at: fetchedAt,
        },
      },
      {
        externalId: "index-reviewed-route",
        path: "/et/mets/kinntatud-suunatud",
        title: "Suunatud õigusakt",
        content: `Ülevaadatud tekst märksõnaga markerkinnitatudsuunatud, mis on ainult suunav.`,
        sourceKey: "reviewed-catalogue-source",
        metadata: {
          hydrated: true,
          source_kind: "reviewed-catalogue",
          evidence_policy: "route-only",
          reviewed_at: fetchedAt,
        },
      },
      {
        externalId: "rank-allowed",
        path: "/et/mets/jarjestus-lubatud",
        title: "Raiemaht lubatud",
        content: `Raiemaht raiemaht raiemaht raiemaht raiemaht raiemaht raiemaht raiemaht ametlik keha.`,
        metadata: { hydrated: true, source_kind: "official-page-hydration", source_policy: policy },
      },
      {
        externalId: "rank-restricted",
        path: "/et/mets/jarjestus-piiratud",
        title: "Raiemaht piiratud",
        content: `Raiemaht raiemaht raiemaht raiemaht raiemaht raiemaht raiemaht raiemaht keelatud keha.`,
        metadata: { hydrated: true, source_kind: "official-page-hydration" },
      },
    ];
    for (const row of rows) await insertRow(admin, { ...row, fetchedAt });

    // Simulate the state production holds today for rows that must not expose
    // their body: a body-derived vector with no policy marker. The marker is
    // what tells the query whether that vector may be read.
    await admin.query(`
      UPDATE practice_corpus_documents
      SET search_vector =
            setweight(to_tsvector('simple', public.unaccent(COALESCE(title, ''))), 'A') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(content, ''))), 'D'),
          search_vector_policy = NULL
      WHERE canonical_url = ANY($1::TEXT[])
    `, [[
      "/et/mets/parand",
      "/et/mets/noindex",
      "/et/mets/vananenud",
      "/et/mets/kinntatud-suunatud",
      "/et/mets/jarjestus-piiratud",
    ].map((path) => `${ORIGIN}${path}`)]);

    const urlOf = (path) => `${ORIGIN}${path}`;
    const expectIn = async (marker, path, label) => {
      const urls = await searchUrls(corpusRuntime, marker);
      assert.ok(urls.includes(urlOf(path)), `${label}: ${marker} must find ${path}`);
    };
    const expectOut = async (marker, path, label) => {
      const urls = await searchUrls(corpusRuntime, marker);
      assert.equal(urls.includes(urlOf(path)), false, `${label}: ${marker} must not find ${path}`);
    };

    // 1. A current allowing policy indexes the body.
    await expectIn("markerlubatud", "/et/mets/lubatud", "allowed body");
    // 2. A body with no policy never matches on its content.
    await expectOut("markerparand", "/et/mets/parand", "legacy body");
    // 3. Its title and navigation metadata still match, before any migration.
    await expectIn("pärandi", "/et/mets/parand", "legacy title");
    // 4. nosnippet keeps indexing.
    await expectIn("markernosnippet", "/et/mets/nosnippet", "nosnippet body");
    // 5. noindex never matches, but its title still does.
    await expectOut("markernoindex", "/et/mets/noindex", "noindex body");
    await expectIn("noindex pealkiri", "/et/mets/noindex", "noindex title");
    // 6. A policy that no longer matches the fetch time never matches.
    await expectOut("markervananenud", "/et/mets/vananenud", "stale body");
    await expectIn("vananev", "/et/mets/vananenud", "stale title");
    // 7. Reviewed rules are explicit: versioned content is searchable, route-only is not.
    await expectIn("markerkinnitatud", "/et/mets/kinntatud", "reviewed body");
    await expectOut("markerkinnitatudsuunatud", "/et/mets/kinntatud-suunatud", "reviewed route body");

    // 8. Ranking. Both rows match the title, so both appear; only the allowed row
    // may be lifted by its body, and the restricted one must never be.
    const ranked = await searchUrls(corpusRuntime, "raiemaht");
    const allowedIndex = ranked.indexOf(urlOf("/et/mets/jarjestus-lubatud"));
    const restrictedIndex = ranked.indexOf(urlOf("/et/mets/jarjestus-piiratud"));
    assert.ok(allowedIndex >= 0, "the allowed title match must be present");
    assert.ok(restrictedIndex >= 0, "the restricted title match must be present");
    assert.ok(allowedIndex < restrictedIndex, "the body must not lift a restricted row above an allowed one");

    // 9. A policy change rebuilds the vector: the same row stops matching.
    await admin.query(`
      UPDATE practice_corpus_documents
      SET metadata = jsonb_set(
        metadata,
        '{source_policy}',
        $2::JSONB
      )
      WHERE canonical_url = $1
    `, [
      urlOf("/et/mets/lubatud"),
      JSON.stringify(currentPolicy(fetchedAt, {
        directives: { ...policy.directives, noindex: true },
        use: { retainBody: false, indexBody: false, displaySnippet: false, answerEvidence: false },
      })),
    ]);
    await expectOut("markerlubatud", "/et/mets/lubatud", "policy changed to noindex");

    await expectIn("markernosnippet", "/et/mets/nosnippet", "allowed before expiry");
    const policyExpiry = new Date(Date.now() + 1_000).toISOString();
    await admin.query(`
      UPDATE practice_corpus_documents
      SET metadata = jsonb_set(
        metadata,
        '{source_policy,directives,unavailableAfter}',
        to_jsonb($2::TEXT),
        TRUE
      )
      WHERE canonical_url = $1
    `, [urlOf("/et/mets/nosnippet"), policyExpiry]);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    await expectOut("markernosnippet", "/et/mets/nosnippet", "index policy expired");

    // 10. Backfill is bounded, restartable and idempotent.
    const first = await corpusStorage.backfillCorpusIndexVectors(admin, { limit: 2, timeBudgetMs: 10_000 });
    assert.ok(first.processed <= 2, `a bounded batch processed ${first.processed} rows`);
    assert.equal(typeof first.lastId, "number");
    const second = await corpusStorage.backfillCorpusIndexVectors(admin, {
      limit: 2,
      timeBudgetMs: 10_000,
      afterId: first.lastId,
    });
    assert.ok(second.processed > 0 || second.complete, "the cursor must continue, not restart");
    let pass = 0;
    let cursor = second.lastId;
    for (;;) {
      const batch = await corpusStorage.backfillCorpusIndexVectors(admin, {
        limit: 2,
        timeBudgetMs: 10_000,
        afterId: cursor,
      });
      cursor = batch.lastId;
      pass += 1;
      if (batch.complete || pass > 100) break;
    }
    const remaining = await admin.query(`
      SELECT COUNT(*)::INTEGER AS remaining
      FROM practice_corpus_documents
      WHERE search_vector_policy IS DISTINCT FROM '${CORPUS_VECTOR_LAYOUT}'
    `);
    assert.equal(remaining.rows[0].remaining, 0, "the drain must finish");

    // 11. After the drain the restricted bodies still never match, and the
    // titles still do.
    await expectOut("markerparand", "/et/mets/parand", "legacy body after backfill");
    await expectIn("pärandi", "/et/mets/parand", "legacy title after backfill");
    await expectOut("markernoindex", "/et/mets/noindex", "noindex body after backfill");
    await expectIn("noindex pealkiri", "/et/mets/noindex", "noindex title after backfill");

    // 12. Concurrent batches and a failed batch. Two drains must not double
    // process a row, and a failing client must leave the row for a retry.
    await insertRow(admin, {
      externalId: "concurrent-a",
      path: "/et/mets/korra-a",
      title: "Korra A",
      content: "Keha märksõnaga markerkorraa, mis on piiratud.",
      metadata: {},
      fetchedAt,
    });
    await insertRow(admin, {
      externalId: "concurrent-b",
      path: "/et/mets/korra-b",
      title: "Korra B",
      content: "Keha märksõnaga markerkorrab, mis on piiratud.",
      metadata: {},
      fetchedAt,
    });
    // Both fixtures stand in for rows written before the migration.
    await admin.query(`
      UPDATE practice_corpus_documents
      SET search_vector_policy = NULL
      WHERE canonical_url = ANY($1::TEXT[])
    `, [[urlOf("/et/mets/korra-a"), urlOf("/et/mets/korra-b")]]);
    const [left, right] = await Promise.all([
      corpusStorage.backfillCorpusIndexVectors(admin, { limit: 1, timeBudgetMs: 10_000 }),
      corpusStorage.backfillCorpusIndexVectors(admin, { limit: 1, timeBudgetMs: 10_000 }),
    ]);
    assert.ok(left.processed + right.processed <= 2, "concurrent drains must not double process");
    assert.deepEqual(
      left.processedIds.filter((id) => right.processedIds.includes(id)),
      [],
      "two drains must not process the same row",
    );

    let failedOnce = false;
    const failingClient = {
      async query(sql, values) {
        if (!failedOnce && String(sql).includes("UPDATE practice_corpus_documents")) {
          failedOnce = true;
          throw new Error("simulated batch failure");
        }
        return admin.query(sql, values);
      },
    };
    await insertRow(admin, {
      externalId: "concurrent-c",
      path: "/et/mets/korra-c",
      title: "Korra C",
      content: "Keha märksõnaga markerkorrac, mis on piiratud.",
      metadata: {},
      fetchedAt,
    });
    await admin.query(`
      UPDATE practice_corpus_documents
      SET search_vector_policy = NULL
      WHERE canonical_url = $1
    `, [urlOf("/et/mets/korra-c")]);
    await assert.rejects(
      corpusStorage.backfillCorpusIndexVectors(failingClient, { limit: 10, timeBudgetMs: 10_000 }),
      /simulated batch failure/u,
    );
    const retried = await corpusStorage.backfillCorpusIndexVectors(admin, { limit: 10, timeBudgetMs: 10_000 });
    assert.ok(retried.processed >= 1, "a failed batch must be retryable");

    // 13. A policy whose unavailableAfter has passed stops the body even when the
    // stored vector still carries it from before the expiry, and the title stays
    // navigable. No write happens at the moment of expiry, so only the query can
    // enforce this.
    const expiredUrl = urlOf("/et/mets/aegunud");
    // The body was fetched and indexed two hours ago, its availability ended one
    // hour ago, and nothing has written the row since, so only a query can see
    // that it has expired.
    const expiredFetchedAt = new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString();
    const expiredAt = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
    await insertRow(admin, {
      externalId: "index-expired",
      path: "/et/mets/aegunud",
      title: "Aegunud pealkiri",
      content: "Keha märksõnaga markeraegunud, mille lubatud aeg on möödas.",
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        source_policy: currentPolicy(expiredFetchedAt, {
          directives: { ...policy.directives, unavailableAfter: expiredAt },
        }),
      },
      fetchedAt: expiredFetchedAt,
    });
    // The stale state is a migrated row whose copied-text vector still holds the
    // body it indexed while the policy allowed it.
    await admin.query(`
      UPDATE practice_corpus_documents
      SET search_vector =
            setweight(to_tsvector('simple', public.unaccent(COALESCE(title, ''))), 'A') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(category, '') || ' ' || COALESCE(organization, ''))), 'B'),
          search_vector_body =
            setweight(to_tsvector('simple', public.unaccent(COALESCE(summary, ''))), 'C') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(content, ''))), 'D'),
          search_vector_policy = '${CORPUS_VECTOR_LAYOUT}'
      WHERE canonical_url = $1
    `, [expiredUrl]);
    await expectOut("markeraegunud", "/et/mets/aegunud", "expired body");
    await expectIn("aegunud", "/et/mets/aegunud", "expired title");

    // 14. A policy bound to another resource must not index this body.
    const mismatchUrl = urlOf("/et/mets/resurss");
    await insertRow(admin, {
      externalId: "index-mismatch-resource",
      path: "/et/mets/resurss",
      title: "Resurss pealkiri",
      content: "Keha märksõnaga markerresurss, mille poliitika kuulub teisele aadressile.",
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        sourceResourceKey: mismatchUrl,
        source_policy: { ...policy, resourceKey: `${ORIGIN}/et/mets/teine-aadress` },
      },
      fetchedAt,
      bindPolicy: false,
    });
    await expectOut("markerresurss", "/et/mets/resurss", "mismatched resource");
    await expectIn("resurss", "/et/mets/resurss", "mismatched resource title");

    // 15. A policy whose artifact hash does not match the stored body must not
    // index that body.
    const artifactUrl = urlOf("/et/mets/artefakt");
    await insertRow(admin, {
      externalId: "index-mismatch-artifact",
      path: "/et/mets/artefakt",
      title: "Artefakt pealkiri",
      content: "Keha märksõnaga markerartefakt, mille räsi ei vasta salvestatud kehale.",
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        sourceResourceKey: artifactUrl,
        source_policy: {
          ...policy,
          resourceKey: artifactUrl,
          artifactHash: sha256("muu-keha"),
        },
      },
      fetchedAt,
      bindPolicy: false,
    });
    await expectOut("markerartefakt", "/et/mets/artefakt", "mismatched artifact");
    await expectIn("artefakt", "/et/mets/artefakt", "mismatched artifact title");

    // 15b. A publisher witness without the hash of the bytes that were read is
    // invalid in JavaScript, so delivery refuses it. The SQL gate has to agree and
    // refuse to index that body, otherwise the same row is citable nowhere and
    // searchable here.
    const bodyHashMissingUrl = urlOf("/et/mets/keharasi-puudub");
    await insertRow(admin, {
      externalId: "index-body-hash-missing",
      path: "/et/mets/keharasi-puudub",
      title: "Keharäsi pealkiri",
      content: "Keha märksõnaga markerkehahäsi, mille tunnistusel puudub loetud baitide räsi.",
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        source_policy: { ...currentPolicy(fetchedAt), bodyHash: null },
      },
      fetchedAt,
    });
    const missingBodyHashRow = await admin.query(
      "SELECT * FROM practice_corpus_documents WHERE canonical_url = $1",
      [bodyHashMissingUrl],
    );
    assert.equal(
      corpusRuntime.publicSearchItem(missingBodyHashRow.rows[0], true).evidencePolicy,
      "route-only",
      "delivery rejects a publisher witness without a body hash",
    );
    await expectOut("markerkehahäsi", "/et/mets/keharasi-puudub", "witness without a body hash");
    await expectIn("keharäsi", "/et/mets/keharasi-puudub", "witness without a body hash title");

    // 15c. `legacy-unknown` may never carry a copy permission: the JavaScript
    // validator refuses the whole witness when any use flag is true for that kind,
    // so delivery is route-only and the SQL gate must not index the body either.
    const legacyUnknownUrl = urlOf("/et/mets/legacy-kasutus");
    const legacyUnknownPolicy = {
      ...currentPolicy(fetchedAt),
      contentKind: "legacy-unknown",
      use: { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: true },
    };
    await insertRow(admin, {
      externalId: "index-legacy-unknown-copy",
      path: "/et/mets/legacy-kasutus",
      title: "Pärandi kasutus pealkiri",
      content: "Keha märksõnaga markerlegacykasutus, mille tunnistus lubab kasutust tundmatu päritolu korral.",
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        source_policy: legacyUnknownPolicy,
      },
      fetchedAt,
    });
    const legacyUnknownRow = await admin.query(
      "SELECT * FROM practice_corpus_documents WHERE canonical_url = $1",
      [legacyUnknownUrl],
    );
    assert.equal(
      corpusRuntime.publicSearchItem(legacyUnknownRow.rows[0], true).evidencePolicy,
      "route-only",
      "delivery refuses a legacy-unknown witness that carries a copy permission",
    );
    await expectOut("markerlegacykasutus", "/et/mets/legacy-kasutus", "legacy-unknown copy permission");
    await expectIn("pärandi kasutus", "/et/mets/legacy-kasutus", "legacy-unknown title");

    // 15d. Every witness shape the JavaScript validator rejects but the SQL gate
    // used to accept. Each row carries a fresh body and a bound witness, so the
    // only reason its body may not be indexed is the invalid shape itself. The
    // shapes are the legacy-unknown kind with copy flags, a partial use object,
    // noarchive with retainBody, nosnippet with displaySnippet, answerEvidence
    // without displaySnippet, and a maxSnippetChars that is not an integer.
    const invalidWitnessShapes = [
      ["legacykasutus", (base) => ({
        ...base,
        contentKind: "legacy-unknown",
        use: { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: true },
      })],
      ["osalinekasutus", (base) => ({ ...base, use: { indexBody: true } })],
      ["noarchivekeha", (base) => ({ ...base, directives: { ...base.directives, noarchive: true } })],
      ["nosnippetluba", (base) => ({ ...base, directives: { ...base.directives, nosnippet: true } })],
      ["toendilubata", (base) => ({ ...base, use: { ...base.use, displaySnippet: false } })],
      ["vigastepikkus", (base) => ({ ...base, directives: { ...base.directives, maxSnippetChars: "120" } })],
    ];
    for (const [index, [key, build]] of invalidWitnessShapes.entries()) {
      const path = `/et/mets/kehtetu-${key}`;
      // The title and the body term must not share trigrams: a similar title would
      // be found by the title fallback and the body assertion would prove nothing.
      const titleTerm = `pealkiri${index}`;
      const bodyTerm = `sisu${index}x`;
      await insertRow(admin, {
        externalId: `index-invalid-${key}`,
        path,
        title: `${titleTerm} ${key}`,
        content: `Keha märksõnaga ${bodyTerm}, mille tunnistus on kehtetu ja mida ei tohi indekseerida.`,
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          source_policy: build(currentPolicy(fetchedAt)),
        },
        fetchedAt,
      });
      const invalidRow = await admin.query(
        "SELECT * FROM practice_corpus_documents WHERE canonical_url = $1",
        [urlOf(path)],
      );
      assert.equal(
        corpusRuntime.publicSearchItem(invalidRow.rows[0], true).evidencePolicy,
        "route-only",
        `delivery refuses the invalid witness shape ${key}`,
      );
      await expectOut(bodyTerm, path, `invalid witness shape ${key} body`);
      await expectIn(titleTerm, path, `invalid witness shape ${key} title`);
    }

    // 16. A drain that skips a locked row must not report completion while that
    // row is still unmigrated. Two real connections: one holds the row lock, the
    // other runs the batched update exactly as the background drain does.
    const lockedPaths = ["/et/mets/lukustatud", "/et/mets/jargmine", "/et/mets/viimane"];
    for (const [index, path] of lockedPaths.entries()) {
      await insertRow(admin, {
        externalId: `index-locked-${index + 1}`,
        path,
        title: `Ootel pealkiri ${index + 1}`,
        content: `Keha ilma poliitikata number ${index + 1}, mis ootab migreerimist.`,
        metadata: { hydrated: true, source_kind: "official-page-hydration" },
        fetchedAt,
      });
    }
    const lockedUrl = urlOf(lockedPaths[0]);
    // The rows above were inserted while the policy-aware trigger was already
    // active, so they arrived migrated. Reset them to the pre-migration shape:
    // a body-bearing vector with no policy marker, exactly like a row written
    // before the marker existed.
    await admin.query(`
      UPDATE practice_corpus_documents
      SET search_vector =
            setweight(to_tsvector('simple', public.unaccent(COALESCE(title, ''))), 'A') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(content, ''))), 'D'),
          search_vector_policy = NULL
      WHERE external_id LIKE 'index-locked-%'
    `);
    const lockedRow = await admin.query(
      "SELECT id FROM practice_corpus_documents WHERE canonical_url = $1",
      [lockedUrl],
    );
    const lockedId = Number(lockedRow.rows[0].id);
    const lockClient = new Client({ connectionString: databaseUrl });
    const drainClient = new Client({ connectionString: databaseUrl });
    await lockClient.connect();
    await drainClient.connect();
    try {
      await lockClient.query("BEGIN");
      await lockClient.query("SELECT 1 FROM practice_corpus_documents WHERE id = $1 FOR UPDATE", [lockedId]);
      const first = await corpusStorage.backfillCorpusIndexVectors(drainClient, { limit: 100, timeBudgetMs: 5_000 });
      const second = await corpusStorage.backfillCorpusIndexVectors(drainClient, {
        limit: 100,
        timeBudgetMs: 5_000,
        afterId: first.lastId,
      });
      const skipped = await admin.query(
        "SELECT search_vector_policy FROM practice_corpus_documents WHERE id = $1",
        [lockedId],
      );
      assert.notEqual(
        skipped.rows[0].search_vector_policy,
        CORPUS_VECTOR_LAYOUT,
        "the locked row is still unprocessed",
      );
      assert.equal(
        second.complete,
        false,
        "a drain must not report completion while a skipped row remains",
      );
    } finally {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      await lockClient.end().catch(() => undefined);
      await drainClient.end().catch(() => undefined);
    }
    // Once the lock is released the next drain from zero migrates it.
    const afterRelease = await corpusStorage.startCorpusIndexBackfill({
      batchSize: 100,
      intervalMs: 1,
      maximumPasses: 20,
    });
    const migrated = await admin.query(
      "SELECT search_vector_policy FROM practice_corpus_documents WHERE id = $1",
      [lockedId],
    );
    assert.equal(
      migrated.rows[0].search_vector_policy,
      CORPUS_VECTOR_LAYOUT,
      "the next drain migrates the previously locked row",
    );
    assert.equal(afterRelease, undefined, "the drain reports through the table, not a return value");

    // 17. Safe navigation metadata is not copied body text, so a row without body
    // permission must still be matchable by its category and organization while
    // its body stays unmatched.
    await insertRow(admin, {
      externalId: "index-navigation",
      path: "/et/mets/navigatsioon",
      title: "Qzxv",
      content: "Keha märksõnaga pealkirjataust, millel puudub kasutusluba.",
      metadata: { hydrated: true, source_kind: "official-page-hydration" },
      category: "NavigationMarker",
      fetchedAt,
    });
    await corpusStorage.startCorpusIndexBackfill({ batchSize: 100, intervalMs: 1, maximumPasses: 20 });
    const navigation = await searchUrls(corpusRuntime, "NavigationMarker");
    assert.ok(
      navigation.includes(urlOf("/et/mets/navigatsioon")),
      "safe category metadata stays matchable without body permission",
    );
    const navigationBody = await searchUrls(corpusRuntime, "pealkirjataust");
    assert.ok(
      !navigationBody.includes(urlOf("/et/mets/navigatsioon")),
      "an unpermitted body never matches",
    );
    await admin.query(`
      INSERT INTO practice_corpus_documents
        (external_id, source_key, canonical_url, title, category, organization,
         topics, source_tier, language, metadata_quality, content_hash)
      SELECT
        'listing-window-' || item.number,
        'official-page-hydration',
        '${ORIGIN}/et/listing-window/' || item.number,
        'listingwindowtoken',
        CASE WHEN item.number > 130 THEN 'Eelistatud' ELSE 'Muu' END,
        'Keskkonnaagentuur',
        ARRAY['mets']::TEXT[],
        'official',
        'et',
        1,
        md5('listing-window-' || item.number)
      FROM generate_series(1, 140) AS item(number)
    `);
    const expectedListingUrls = (await admin.query(`
      SELECT canonical_url
      FROM practice_corpus_documents
      WHERE external_id LIKE 'listing-window-%'
      ORDER BY id ASC
    `)).rows.map((row) => row.canonical_url);
    const listingQuery = "listingwindowtoken";
    const firstListingPage = await corpusRuntime.searchCorpus(listingQuery, {
      page: 1,
      pageSize: 12,
      includeContent: false,
      preferSnapshot: false,
      returnRankedWindow: true,
    });
    const secondListingPage = await corpusRuntime.searchCorpus(listingQuery, {
      page: 2,
      pageSize: 12,
      includeContent: false,
      preferSnapshot: false,
      returnRankedWindow: true,
    });
    assert.equal(firstListingPage.total, 140);
    assert.equal(firstListingPage.totalRelation, "eq");
    assert.equal(firstListingPage.truncated, true);
    assert.equal(firstListingPage.rankedWindow.length, 128);
    assert.deepEqual(
      firstListingPage.rankedWindow.map((item) => item.id),
      secondListingPage.rankedWindow.map((item) => item.id),
      "page two uses the same bounded ranked window as page one",
    );
    assert.equal(firstListingPage.windowId, secondListingPage.windowId);
    assert.equal(firstListingPage.queryRevision, secondListingPage.queryRevision);
    assert.equal(firstListingPage.pageCount, 2);
    assert.equal(firstListingPage.hasMore, true);
    assert.deepEqual(firstListingPage.items.map((item) => item.url), expectedListingUrls.slice(0, 12));
    assert.deepEqual(secondListingPage.items.map((item) => item.url), expectedListingUrls.slice(12, 24));
    assert.equal(secondListingPage.hasMore, false);
    const inaccessiblePage = await corpusRuntime.searchCorpus(listingQuery, {
      page: 3,
      pageSize: 12,
      preferSnapshot: false,
    });
    assert.deepEqual(inaccessiblePage.items, []);
    assert.equal(inaccessiblePage.hasMore, false);

    const filteredListing = await corpusRuntime.searchCorpus(listingQuery, {
      pageSize: 50,
      includeContent: false,
      preferSnapshot: false,
      filters: { category: "Eelistatud" },
    });
    assert.equal(filteredListing.total, 10);
    assert.deepEqual(filteredListing.items.map((item) => item.url), expectedListingUrls.slice(130));
    const emptyListing = await corpusRuntime.searchCorpus("   ", { preferSnapshot: false });
    assert.equal(emptyListing.total, 0);
    assert.deepEqual(emptyListing.items, []);

    await admin.query(`
      INSERT INTO practice_corpus_documents
        (external_id, source_key, canonical_url, title, category, source_tier, content_hash)
      VALUES ('listing-window-refresh', 'official-page-hydration',
        '${ORIGIN}/et/listing-window/refresh', 'listingwindowtoken', 'Muu', 'official',
        md5('listing-window-refresh'))
    `);
    await admin.query(`
      INSERT INTO practice_corpus_runs (mode, status, finished_at)
      VALUES ('fixture-refresh', 'ready', NOW())
    `);
    const refreshedListing = await corpusRuntime.searchCorpus(listingQuery, {
      page: 1,
      pageSize: 12,
      includeContent: false,
      preferSnapshot: false,
      returnRankedWindow: true,
    });
    assert.equal(refreshedListing.total, 141);
    assert.notEqual(refreshedListing.queryRevision, firstListingPage.queryRevision);
    assert.notEqual(refreshedListing.windowId, firstListingPage.windowId);
    // A retained item must validate each stored field independently. Its short
    // summary is deliberately different from its long evidence body.
    const longBody = "Pikk ametlik metsateabe sisu. ".repeat(30).trim();
    const shortSummary = "Lühike ametlik kokkuvõte.";
    const longUrl = urlOf("/et/mets/retained-long");
    await insertRow(admin, {
      externalId: "retained-long",
      path: "/et/mets/retained-long",
      title: "retainedlongtoken",
      content: longBody,
      fetchedAt,
      metadata: { hydrated: true, source_kind: "official-page-hydration", source_policy: policy },
    });
    await admin.query("UPDATE practice_corpus_documents SET summary = $2 WHERE canonical_url = $1", [longUrl, shortSummary]);
    const longListing = await corpusRuntime.searchCorpus("retainedlongtoken", {
      includeContent: true, preferSnapshot: false, returnRankedWindow: true,
    });
    const longItem = longListing.rankedWindow.find((item) => item.url === longUrl);
    assert.ok(longItem?._sourcePolicy);
    assert.equal(longItem.summary, shortSummary);
    assert.equal(longItem.content, longBody);
    assert.ok(longItem.content.length > 500);
    assert.deepEqual(longListing._corpusWindow.indexAllowed, [true]);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(
      longListing._corpusWindow, {}, { items: longListing.rankedWindow },
    ), true);

    // A fallback-only listing must survive a genuine failed corpus read and
    // recovery, while a listing retaining corpus text still needs permission.
    const { prepareRankedSearchResults } = await import(new URL("../server/retrieval.mjs", import.meta.url).href);
    const overviewQuery = "metsa ülevaade";
    const overviewUrl = urlOf("/et/mets/overview_window_fixture");
    await insertRow(admin, {
      externalId: "overview_window_fixture",
      path: "/et/mets/overview_window_fixture",
      title: "Metsa ülevaade",
      content: "Metsa ülevaade sisaldab ametlikku metsateavet.",
      fetchedAt,
      metadata: { hydrated: true, source_kind: "official-page-hydration", source_policy: policy },
    });
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { throw new Error("External transport disabled in fixture"); };
    try {
      const options = { pageSize: 12, clientKey: "corpus-window-regression", deadlineAt: Date.now() + 60_000 };
      const healthy = await prepareRankedSearchResults(overviewQuery, options);
      assert.ok(healthy.windowId);
      assert.equal(healthy.pageCount, 2);
      assert.ok(healthy.evidenceCandidates.some((item) => item.url === overviewUrl && item.content));
      await admin.query("ALTER TABLE practice_corpus_documents RENAME TO practice_corpus_documents_pagination_fixture");
      let fallback;
      try {
        const degraded = await corpusRuntime.searchCorpus(overviewQuery, { preferSnapshot: false });
        assert.equal(degraded.status, "degraded");
        const rejected = await prepareRankedSearchResults(overviewQuery, {
          ...options, page: 2, windowId: healthy.windowId,
        });
        assert.equal(rejected.windowExpired, true, "corpus-backed text fails closed during a degraded read");
        fallback = await prepareRankedSearchResults(overviewQuery, options);
        assert.ok(fallback.windowId);
        assert.equal(fallback.pageCount, 2);
        assert.ok(fallback.evidenceCandidates.every((item) => item.url !== overviewUrl));
        const wrongQuery = await prepareRankedSearchResults("metsa pindala", {
          ...options, page: 2, windowId: fallback.windowId,
        });
        assert.equal(wrongQuery.windowExpired, true);
        const duringFailure = await prepareRankedSearchResults(overviewQuery, {
          ...options, page: 2, windowId: fallback.windowId,
        });
        assert.equal(duringFailure.windowId, fallback.windowId);
        assert.deepEqual(duringFailure.items.map((item) => item.id),
          fallback.evidenceCandidates.slice(12, 24).map((item) => item.id));
        assert.ok(duringFailure.items.length);
      } finally {
        await admin.query("ALTER TABLE practice_corpus_documents_pagination_fixture RENAME TO practice_corpus_documents");
      }
      const recovered = await corpusRuntime.searchCorpus(overviewQuery, { preferSnapshot: false });
      assert.equal(recovered.status, "ready");
      const afterRecovery = await prepareRankedSearchResults(overviewQuery, {
        ...options, page: 2, windowId: fallback.windowId,
      });
      assert.equal(afterRecovery.windowId, fallback.windowId);
      assert.deepEqual(afterRecovery.items.map((item) => item.id),
        fallback.evidenceCandidates.slice(12, 24).map((item) => item.id));
      await admin.query(
        "UPDATE practice_corpus_documents SET metadata = metadata - 'source_policy' WHERE canonical_url = $1",
        [overviewUrl],
      );
      const withdrawn = await prepareRankedSearchResults(overviewQuery, {
        ...options, page: 2, windowId: healthy.windowId,
      });
      assert.equal(withdrawn.windowExpired, true, "withdrawn corpus permission cannot reuse retained text");
    } finally {
      globalThis.fetch = originalFetch;
    }
    const hydration = await import(new URL("../server/corpus_hydration.mjs", import.meta.url).href);

    const pendingUrl = urlOf("/et/mets/retained_pending");
    await insertRow(admin, {
      externalId: "retained_pending", path: "/et/mets/retained_pending",
      title: "retainedpendingtoken", content: "", fetchedAt,
    });
    const pendingListing = await corpusRuntime.searchCorpus("retainedpendingtoken", {
      includeContent: true, preferSnapshot: false, returnRankedWindow: true,
    });
    const pendingItem = pendingListing.rankedWindow.find((item) => item.url === pendingUrl);
    assert.ok(pendingItem);
    assert.equal(Boolean(pendingItem.summary || pendingItem.content), false);
    const pendingPosition = pendingListing._corpusWindow.ids.findIndex((id) => pendingItem.id === `corpus-${id}`);
    assert.equal(pendingListing._corpusWindow.indexAllowed[pendingPosition], false);
    const grantedAt = new Date().toISOString();
    const grantedBody = "Nüüd kontrollitud ja lubatud metsateabe sisu.";
    assert.equal(await hydration.persistHydratedCorpusDocument(admin, {
      url: pendingUrl, title: "retainedpendingtoken", content: grantedBody,
      contentHash: sha256(grantedBody), fetchedAt: grantedAt, runId: null,
      metadata: {
        hydrated: true, source_kind: "official-page-hydration",
        source_policy: currentPolicy(grantedAt, {
          resourceKey: sourceResourceKey(pendingUrl), artifactHash: sha256(grantedBody),
        }),
      },
    }), true);
    const grantedListing = await corpusRuntime.searchCorpus("retainedpendingtoken", {
      includeContent: true, preferSnapshot: false, returnRankedWindow: true,
    });
    const grantedPosition = grantedListing._corpusWindow.ids.findIndex((id) => pendingItem.id === `corpus-${id}`);
    assert.equal(grantedListing._corpusWindow.indexAllowed[grantedPosition], true);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(
      pendingListing._corpusWindow, {}, { items: pendingListing.rankedWindow },
    ), true, "newly permitted content must not expire the earlier title-only snapshot");

    const nextBody = "Värskendatud ametlik metsateave. ".repeat(30).trim();
    const nextAt = new Date().toISOString();
    assert.equal(await hydration.persistHydratedCorpusDocument(admin, {
      url: longUrl,
      title: "retainedlongtoken",
      content: nextBody,
      contentHash: sha256(nextBody),
      fetchedAt: nextAt,
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        source_policy: { ...currentPolicy(nextAt), resourceKey: sourceResourceKey(longUrl), artifactHash: sha256(nextBody) },
      },
      runId: null,
    }), true);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(
      longListing._corpusWindow, {}, { items: longListing.rankedWindow },
    ), true);

    await admin.query(
      "UPDATE practice_corpus_documents SET metadata = metadata - 'source_policy' WHERE canonical_url = $1",
      [longUrl],
    );
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(
      longListing._corpusWindow, {}, { items: longListing.rankedWindow },
    ), false, "a missing current policy cannot authorize an older retained policy");
    await admin.query(`
      UPDATE practice_corpus_documents SET metadata = jsonb_set(metadata, '{source_policy}', $2::JSONB)
      WHERE canonical_url = $1
    `, [longUrl, JSON.stringify({
      ...currentPolicy(nextAt), resourceKey: sourceResourceKey(longUrl), artifactHash: sha256(nextBody),
    })]);

    // A reviewed original needs no policy until a later read supplies one.
    const reviewedUrl = urlOf("/et/mets/kinntatud");
    const reviewedListing = await corpusRuntime.searchCorpus("markerkinnitatud", {
      includeContent: true, preferSnapshot: false, returnRankedWindow: true,
    });
    const reviewedItem = reviewedListing.rankedWindow.find((item) => item.url === reviewedUrl);
    assert.ok(reviewedItem?.content);
    assert.equal(reviewedItem._sourcePolicy, undefined);
    assert.equal(reviewedListing._corpusWindow.indexAllowed[
      reviewedListing.rankedWindow.findIndex((item) => item.id === reviewedItem.id)
    ], true);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(
      reviewedListing._corpusWindow, {}, { items: reviewedListing.rankedWindow },
    ), true);
    const restrictedAt = new Date().toISOString();
    const restrictedBody = "Värskelt loetud metsateave, mida ei tohi väljavõttena näidata.";
    assert.equal(await hydration.persistHydratedCorpusDocument(admin, {
      url: reviewedUrl,
      title: reviewedItem.title,
      content: restrictedBody,
      contentHash: sha256(restrictedBody),
      fetchedAt: restrictedAt,
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        source_policy: {
          ...currentPolicy(restrictedAt),
          resourceKey: sourceResourceKey(reviewedUrl),
          artifactHash: sha256(restrictedBody),
          directives: { ...policy.directives, nosnippet: true },
          use: { retainBody: true, indexBody: true, displaySnippet: false, answerEvidence: false },
        },
      },
      runId: null,
    }), true);
    const restrictedRow = await admin.query(`
      SELECT ${corpusStorage.corpusIndexPolicySql("document")} AS index_allowed
      FROM practice_corpus_documents AS document WHERE canonical_url = $1
    `, [reviewedUrl]);
    assert.equal(restrictedRow.rows[0].index_allowed, true);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(
      reviewedListing._corpusWindow, {}, { items: reviewedListing.rankedWindow },
    ), false);

    // A database error invalidates sibling windows and prevents an older
    // in-flight write from putting a retained ID back into the cache.
    const { createListingWindowCache } = await import(new URL("../server/listing_window.mjs", import.meta.url).href);
    const { corpusListingWindows } = await import(new URL("../server/corpus_listing_state.mjs", import.meta.url).href);
    const siblingCache = createListingWindowCache();
    const binding = { query: "retainedlongtoken", filters: {}, windowId: longListing.windowId };
    const generationBeforeError = siblingCache.generation();
    const corpusGenerationBeforeError = corpusListingWindows.generation();
    assert.equal(siblingCache.setWindow(binding, { windowId: longListing.windowId }), true);
    assert.ok(siblingCache.getWindow(binding));
    await admin.query("ALTER TABLE practice_corpus_documents RENAME TO practice_corpus_documents_validation_fixture");
    try {
      assert.equal(await corpusRuntime.validateRetainedCorpusWindow(
        longListing._corpusWindow, {}, { items: longListing.rankedWindow },
      ), false);
    } finally {
      await admin.query("ALTER TABLE practice_corpus_documents_validation_fixture RENAME TO practice_corpus_documents");
    }
    assert.equal(siblingCache.getWindow(binding), null);
    assert.equal(siblingCache.setWindow(binding, { windowId: longListing.windowId }, {
      expectedGeneration: generationBeforeError,
    }), false);
    assert.equal(corpusListingWindows.set("pre-error-write", longListing._corpusWindow, {
      expectedGeneration: corpusGenerationBeforeError,
    }), false);
    const afterError = await corpusRuntime.searchCorpus("retainedlongtoken", {
      includeContent: true, preferSnapshot: false, returnRankedWindow: true,
    });
    assert.notEqual(afterError.windowId, longListing.windowId);
    assert.equal(afterError.items.find((item) => item.url === longUrl)?.content, nextBody);

    const retained = firstListingPage._corpusWindow;
    const retainedItems = firstListingPage.rankedWindow;
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(retained, {}, { items: retainedItems }), true);

    const hydratedUrl = expectedListingUrls[0];
    const hydratedBody = "Uuendatud metsateabe sisu ".repeat(8);
    assert.equal(await hydration.persistHydratedCorpusDocument(admin, {
      url: hydratedUrl,
      title: "listingwindowtoken",
      content: hydratedBody,
      contentHash: sha256(hydratedBody),
      metadata: {},
      runId: null,
    }), true);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(retained, {}, { items: retainedItems }), true);
    await admin.query("UPDATE practice_corpus_documents SET is_available = FALSE WHERE canonical_url = $1", [hydratedUrl]);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(retained, {}, { items: retainedItems }), false);
    await admin.query(`
      UPDATE practice_corpus_documents
      SET is_available = TRUE, metadata = metadata || '{"robots_noindex": true}'::JSONB
      WHERE canonical_url = $1
    `, [hydratedUrl]);
    assert.equal(await corpusRuntime.validateRetainedCorpusWindow(retained, {}, { items: retainedItems }), false);

    // The stored decision must agree with the old static witness, including a
    // legacy row whose readable directive is absent. A flag-only update then
    // denies copied-text indexing without changing the visible policy witness.
    const legacyPolicy = currentPolicy(fetchedAt);
    delete legacyPolicy.directives.readable;
    const allowedUrl = `${ORIGIN}/et/mets/markerbodyallowed`;
    const deniedUrl = `${ORIGIN}/et/mets/markerbodydenied`;
    const legacyUrl = `${ORIGIN}/et/mets/markerbodylegacy`;
    for (const [externalId, path, body, sourcePolicy] of [
      ["body-flag-allowed", "/et/mets/markerbodyallowed", "Ametlik lubatud keha, mille ainus otsingumärk on markerbodyallowed koos muu tekstiga.", policy],
      ["body-flag-denied", "/et/mets/markerbodydenied", "Ametlik keha, mille ainus otsingumärk on markerbodydenied koos muu tekstiga.", policy],
      ["body-flag-legacy", "/et/mets/markerbodylegacy", "Ametlik keha, mille ainus otsingumärk on markerbodylegacy koos muu tekstiga.", legacyPolicy],
    ]) {
      await insertRow(admin, {
        externalId,
        path,
        title: "Ametlik indeksileht",
        content: body,
        fetchedAt,
        metadata: { hydrated: true, source_kind: "official-page-hydration", source_policy: sourcePolicy },
      });
    }
    const parity = await admin.query(`
      SELECT document.canonical_url AS url,
             document.body_index_allowed AS stored,
             ${corpusStorage.corpusIndexPolicyStaticSql("document")} AS expected
      FROM practice_corpus_documents AS document
      WHERE document.canonical_url = ANY($1::TEXT[])
      ORDER BY document.canonical_url
    `, [[allowedUrl, deniedUrl, legacyUrl]]);
    assert.equal(parity.rows.length, 3);
    for (const row of parity.rows) {
      const expected = row.url === legacyUrl ? false : true;
      assert.equal(row.stored, expected);
      assert.equal(row.expected, expected);
    }
    await admin.query(`
      UPDATE practice_corpus_documents
      SET body_index_allowed = FALSE
      WHERE canonical_url = $1
    `, [deniedUrl]);
    const deniedDecision = await admin.query(`
      SELECT document.body_index_allowed AS stored,
             ${corpusStorage.corpusIndexPolicySql("document")} AS full_policy
      FROM practice_corpus_documents AS document
      WHERE canonical_url = $1
    `, [deniedUrl]);
    assert.equal(deniedDecision.rows[0].stored, false);
    assert.equal(deniedDecision.rows[0].full_policy, false);
    const allowedListing = await corpusRuntime.searchCorpus("markerbodyallowed", { preferSnapshot: false });
    assert.ok(allowedListing.items.some((item) => item.url === allowedUrl));
    const deniedListing = await corpusRuntime.searchCorpus("markerbodydenied", { preferSnapshot: false });
    assert.equal(deniedListing.items.some((item) => item.url === deniedUrl), false);
  } finally {
    await admin?.end().catch(() => undefined);
    // Only the container this run created is removed. A failed start, including
    // a name collision, leaves whatever else held the name untouched.
    if (createdContainerId) {
      assert.equal(
        removeContainer(createdContainerId),
        true,
        `container ${createdContainerId} must be removed`,
      );
    }
  }
});

test("corpus index backfill yields when the capacity lock is busy", async () => {
  const { backfillCorpusIndexVectors } = await import("../server/corpus_storage.mjs");
  const statements = [];
  const client = {
    async query(query) {
      const text = typeof query === "string" ? query : String(query?.text || "");
      statements.push(text);
      if (text === "BEGIN" || text === "COMMIT" || text === "ROLLBACK"
        || text.startsWith("SET LOCAL statement_timeout")) {
        return { rows: [] };
      }
      if (text.includes("pg_try_advisory_xact_lock")) {
        return { rows: [{ locked: false }] };
      }
      if (text.includes("pg_advisory_xact_lock")) {
        throw new Error("Query read timeout");
      }
      assert.fail(`backfill wrote rows while the capacity lock was busy: ${text}`);
    },
  };

  const batch = await backfillCorpusIndexVectors(client, { limit: 1 });
  assert.equal(batch.processed, 0);
  assert.deepEqual(batch.processedIds, []);
  assert.equal(batch.lastId, 0);
  assert.equal(batch.complete, false);
  assert.equal(batch.pending, true);
  assert.ok(statements.some((text) => text.includes("pg_try_advisory_xact_lock")));
  assert.ok(statements.every((text) => !text.includes("UPDATE practice_corpus_documents")));
});
