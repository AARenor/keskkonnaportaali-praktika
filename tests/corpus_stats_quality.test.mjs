// Behavioural regression for the public corpus status payload (`GET /api/corpus`,
// served by corpusStats). Two completeness gaps have to be closed before this
// payload can be trusted as an operations metric:
//
//   1. Rows excluded by the robots gate are stored with is_available = FALSE, so
//      a count nested inside "available documents" reports zero excluded pages
//      even when the gate removed thousands.
//   2. A sync run can finish with a large error_count and still be reported as
//      ready, so the payload hides how much of the last pass failed.
//
// The payload also needs a fresh-evidence count that cannot be confused with the
// stored-body backlog: `hydrated` keeps its meaning, which is "rows that hold a
// body", not "rows that may be cited now". A body whose last read failed must not
// count as fresh either, because the failure path advances fetched_at while the
// stored text stays stale.
//
// Harness. The test drives the real corpusStats against a throwaway PostgreSQL 17
// container with deterministic rows inserted by SQL, then inspects the exact JSON
// the public route would serve. No request leaves this machine: the schema is
// primed on an empty table, so no page is fetched.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const POSTGRES_IMAGE = "postgres:17-alpine";
const POSTGRES_DATABASE = "keskkonnaportaal_practice";
const FIXTURE_ORIGIN = "https://keskkonnaportaal.ee";
const CORPUS_MODULE_URL = new URL("../server/corpus.mjs", import.meta.url).href;
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const ROBOTS_EXCLUDED_ROWS = 10;

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

function startPostgresContainer(name, port) {
  try {
    execFileSync("docker", [
      "run",
      "--detach",
      "--rm",
      "--name", name,
      "--env", "POSTGRES_HOST_AUTH_METHOD=trust",
      "--env", "POSTGRES_USER=postgres",
      "--env", `POSTGRES_DB=${POSTGRES_DATABASE}`,
      "--publish", `127.0.0.1:${port}:5432`,
      // A tmpfs data directory keeps the cluster off disk and stops Docker from
      // creating the anonymous volume that would survive a --rm container.
      "--tmpfs", "/var/lib/postgresql/data:rw",
      POSTGRES_IMAGE,
      "postgres", "-c", "fsync=off", "-c", "synchronous_commit=off", "-c", "full_page_writes=off",
    ], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (error) {
    const detail = String(error?.stderr || error?.message || "").trim();
    throw new Error(`temporary PostgreSQL container did not start: ${detail}`);
  }
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

function removeContainer(name) {
  try {
    execFileSync("docker", ["rm", "--force", name], { stdio: "ignore" });
  } catch {
    // The container may already be gone; nothing else to clean up.
  }
  try {
    const listing = execFileSync("docker", [
      "ps", "--all", "--filter", `name=^${name}$`, "--format", "{{.Names}}",
    ], { encoding: "utf8" });
    return String(listing).trim() === "";
  } catch {
    return false;
  }
}

async function insertDocument(client, {
  externalId, sourceKey, url, content, fetchedAt, available = true, metadata = {},
}) {
  await client.query(`
    INSERT INTO practice_corpus_documents
      (external_id, source_key, canonical_url, title, summary, content, category,
       organization, topics, source_tier, language, metadata_quality, metadata,
       content_hash, fetched_at, last_seen_at, is_available)
    VALUES ($1, $2, $3, $4, '', $5, 'Uudis', 'Keskkonnaagentuur', ARRAY[]::TEXT[],
            'official', 'et', 3, $6::JSONB, $7, $8::TIMESTAMPTZ, $8::TIMESTAMPTZ, $9)
  `, [
    externalId,
    sourceKey,
    url,
    `Fixture ${externalId}`,
    content,
    JSON.stringify(metadata),
    sha256(content || externalId),
    fetchedAt,
    available,
  ]);
}

async function insertRun(client, { mode, status, errorCount, details, startedAt, finishedAt }) {
  await client.query(`
    INSERT INTO practice_corpus_runs
      (mode, status, discovered_count, indexed_count, hydrated_count, error_count,
       details, started_at, finished_at)
    VALUES ($1, $2, 0, 0, 0, $3, $4::JSONB, $5::TIMESTAMPTZ, $6::TIMESTAMPTZ)
  `, [mode, status, errorCount, JSON.stringify(details), startedAt, finishedAt]);
}

test("the public corpus status reports robots excluded rows, the last sync error count and a fresh evidence count without leaking content", { timeout: 240_000 }, async (t) => {
  if (!dockerImageAvailable(POSTGRES_IMAGE)) {
    t.skip(`Docker image ${POSTGRES_IMAGE} is unavailable, so the isolated PostgreSQL fixture cannot start; the status aggregates cannot be exercised without a real SQL engine`);
    return;
  }
  const containerName = `corpus-stats-quality-${process.pid}-${randomBytes(3).toString("hex")}`;
  const port = await reserveLoopbackPort();
  const databaseUrl = `postgres://postgres@127.0.0.1:${port}/${POSTGRES_DATABASE}`;
  t.diagnostic(`temporary PostgreSQL container: ${containerName} on 127.0.0.1:${port}`);
  let admin;
  try {
    startPostgresContainer(containerName, port);
    await waitForPostgres(databaseUrl);
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL_MODE = "disable";
    process.env.SEARCH_HASH_SECRET = createHash("sha512").update("corpus-stats-quality-fixture").digest("base64");
    const corpus = await import(CORPUS_MODULE_URL);

    // The corpus schema belongs to startup and sync code, so prime it with an
    // empty backlog pass. Nothing is fetched because the table is empty.
    const primed = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    assert.equal(primed.status, "ready", "the isolated database must be reachable before the fixtures are inserted");
    assert.equal(primed.remainingChecked, 0, "an empty corpus has no backlog, so the fixtures are the only rows");

    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    const now = Date.now();

    // Seven available documents. Only the first one is a freshly read official
    // page: the second body is older than the evidence window, the third never
    // carried a successful refresh marker, the fourth is a discovery row, the
    // fifth holds a body whose last read failed, and the last two carry attempt
    // markers that cannot be read at all.
    const freshBody = "Värske ametlik lehekülg metsaseire kohta. STATS-KEHA-MARKER raiemaht ja juurdekasv on siin tõendina olemas.";
    const oldBody = "Vana ametlik lehekülg metsaseire kohta, mille keha on üheksa päeva vana ja jääb seetõttu värskete hulka arvestamata.";
    const unmarkedBody = "Ametlik lehekülg, mille keha on värske, aga millel puudub edukat värskendust märkiv metaandmeväli.";
    const catalogBody = "Kataloogirida, mille keha on värske, aga mis ei ole hüdratsioonikirje ja jääb seetõttu värskete hulka arvestamata.";
    const failedRefreshBody = "Ametlik lehekülg, mille viimane lugemine ebaõnnestus ja mis jääb seetõttu suunavaks, kuigi keha on alles.";
    const malformedMarkerBody = "Ametlik lehekülg, mille katseaja märge ei ole ajatempel ja mida ei tohi lugeda värskelt loetuks.";
    const nullMarkerBody = "Ametlik lehekülg, mille katseaja märge on tühi väärtus ja mida ei tohi samuti lugeda värskelt loetuks.";
    // The production failure path writes the attempt time and fetched_at in one
    // statement, so a failed row looks recent on fetched_at alone.
    const failedRefreshAt = new Date(now - DAY_MS).toISOString();
    const documents = [
      {
        externalId: "stats-fresh-hydrated",
        sourceKey: "official-page-hydration",
        url: `${FIXTURE_ORIGIN}/et/mets/stat-test-varske`,
        content: freshBody,
        fetchedAt: new Date(now - 2 * DAY_MS).toISOString(),
        metadata: { hydrated: true, source_kind: "official-page-hydration" },
      },
      {
        externalId: "stats-old-hydrated",
        sourceKey: "official-page-hydration",
        url: `${FIXTURE_ORIGIN}/et/mets/stat-test-vana`,
        content: oldBody,
        fetchedAt: new Date(now - 9 * DAY_MS).toISOString(),
        metadata: { hydrated: true, source_kind: "official-page-hydration" },
      },
      {
        externalId: "stats-unmarked-body",
        sourceKey: "official-page-hydration",
        url: `${FIXTURE_ORIGIN}/et/mets/stat-test-marketa`,
        content: unmarkedBody,
        fetchedAt: new Date(now - 2 * DAY_MS).toISOString(),
        metadata: {},
      },
      {
        externalId: "stats-catalog-body",
        sourceKey: "portal-catalog",
        url: `${FIXTURE_ORIGIN}/et/mets/stat-test-kataloog`,
        content: catalogBody,
        fetchedAt: new Date(now - DAY_MS).toISOString(),
        metadata: {},
      },
      {
        externalId: "stats-failed-refresh",
        sourceKey: "official-page-hydration",
        url: `${FIXTURE_ORIGIN}/et/mets/stat-test-ebaonnestunud`,
        content: failedRefreshBody,
        fetchedAt: failedRefreshAt,
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          hydration_attempted_at: failedRefreshAt,
        },
      },
      {
        externalId: "stats-malformed-marker",
        sourceKey: "official-page-hydration",
        url: `${FIXTURE_ORIGIN}/et/mets/stat-test-rikutud-marge`,
        content: malformedMarkerBody,
        fetchedAt: new Date(now - 2 * DAY_MS).toISOString(),
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          hydration_attempted_at: "teadmata",
        },
      },
      {
        externalId: "stats-null-marker",
        sourceKey: "official-page-hydration",
        url: `${FIXTURE_ORIGIN}/et/mets/stat-test-tuhi-marge`,
        content: nullMarkerBody,
        fetchedAt: new Date(now - 2 * DAY_MS).toISOString(),
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          hydration_attempted_at: null,
        },
      },
    ];
    for (const document of documents) await insertDocument(admin, document);

    // The robots gate stores its verdict by clearing the body and marking the row
    // unavailable, so these rows are invisible to a count nested in available rows.
    for (let index = 1; index <= ROBOTS_EXCLUDED_ROWS; index += 1) {
      await insertDocument(admin, {
        externalId: `stats-robots-excluded-${index}`,
        sourceKey: "official-page-hydration",
        url: `${FIXTURE_ORIGIN}/et/mets/robots-excluded-${index}`,
        content: "",
        fetchedAt: new Date(now).toISOString(),
        available: false,
        metadata: { robots_noindex: true, hydrated: true, source_kind: "official-page-hydration" },
      });
    }

    // The last sync finished ready while a large part of its work failed, and its
    // details carry an error sentence and a URL that must never reach the public
    // payload. An older run with a different error count proves "last" means the
    // newest started run.
    const olderRunStartedAt = new Date(now - 2 * HOUR_MS).toISOString();
    const olderRunFinishedAt = new Date(now - 2 * HOUR_MS + 60_000).toISOString();
    const lastRunStartedAt = new Date(now - 10 * 60_000).toISOString();
    const lastRunFinishedAt = new Date(now - 9 * 60_000).toISOString();
    await insertRun(admin, {
      mode: "startup-incremental",
      status: "ready",
      errorCount: 5,
      details: { catalogTotal: 100, catalogSkipped: false, sitemapPages: 3 },
      startedAt: olderRunStartedAt,
      finishedAt: olderRunFinishedAt,
    });
    await insertRun(admin, {
      mode: "startup-incremental",
      status: "ready",
      errorCount: 296,
      details: {
        catalogTotal: 1234,
        catalogSkipped: false,
        sitemapPages: 45,
        error: "ühendus ebaõnnestus https://keskkonnaportaal.ee/et/salajane",
        firstError: "ECONNREFUSED 10.1.2.3:5432",
      },
      startedAt: lastRunStartedAt,
      finishedAt: lastRunFinishedAt,
    });

    const stats = await corpus.corpusStats();

    // Deployment readiness means "the database answered", not "the last run was
    // clean", so a run with errors must not flip the public status.
    assert.equal(
      stats.status,
      "ready",
      "a reachable database keeps the public status ready even when the last run recorded errors, and an unreadable attempt marker must not abort the aggregate",
    );
    assert.equal(stats.enabled, true, "the status payload is enabled");

    // Stored bodies stay backwards compatible: `hydrated` counts rows that hold a
    // body, not rows that may be cited now.
    assert.equal(stats.documents, 7, "documents counts available rows only");
    assert.equal(stats.hydrated, 7, "hydrated keeps counting stored bodies, not citable sources, so failed and unreadable markers still count here");

    // The robots verdict is counted where it is stored, outside the available rows.
    assert.equal(
      stats.robotsExcluded,
      ROBOTS_EXCLUDED_ROWS,
      "the status must count the noindex rows the robots gate excluded even though they are unavailable",
    );

    // Fresh evidence is its own number so a stored body cannot pass for it. A body
    // whose last read failed must not count, because the failure path advanced
    // fetched_at while the text stayed stale, and a marker that cannot be read
    // proves nothing either.
    assert.equal(
      stats.freshOfficialPages,
      1,
      "freshOfficialPages counts only available official page hydrations inside the seven day window whose marker is absent or older than fetched_at, so failed, malformed and null markers are excluded",
    );
    assert.ok(
      stats.freshOfficialPages < stats.hydrated,
      "a fresh evidence count must stay separate from the stored body count",
    );

    // The last sync reports what actually happened.
    assert.equal(stats.lastSync.status, "ready", "the last sync status is reported as stored");
    assert.equal(stats.lastSync.errorCount, 296, "the last sync error count must be visible instead of hidden behind a ready status");
    assert.equal(stats.lastSync.catalogTotal, 1234, "the last sync keeps reporting its catalog total");
    assert.equal(stats.lastSync.sitemapPages, 45, "the last sync keeps reporting its sitemap page count");
    assert.equal(
      new Date(stats.lastSync.finishedAt).getTime(),
      Date.parse(lastRunFinishedAt),
      "the last sync reports the finished time of the newest run, not the older run",
    );
    assert.notEqual(
      new Date(stats.lastSync.finishedAt).getTime(),
      Date.parse(olderRunFinishedAt),
      "the last sync must not report the older run's finished time",
    );

    // Nothing from the database rows may reach the public payload: no URL, no
    // error sentence, no host, no page text.
    const serialized = JSON.stringify(stats);
    for (const forbidden of [
      "keskkonnaportaal", "stat-test", "robots-excluded", "salajane",
      "ECONNREFUSED", "10.1.2.3", "STATS-KEHA-MARKER",
      freshBody, oldBody, unmarkedBody, catalogBody, failedRefreshBody,
      malformedMarkerBody, nullMarkerBody,
    ]) {
      assert.equal(
        serialized.includes(forbidden),
        false,
        `the public status payload must not contain ${JSON.stringify(forbidden)}`,
      );
    }
    assert.doesNotMatch(serialized, /https?:\/\//u, "the public status payload must not contain a URL");
  } finally {
    if (admin) await admin.end().catch(() => undefined);
    const containerRemoved = removeContainer(containerName);
    t.diagnostic(`temporary PostgreSQL container ${containerName}: ${containerRemoved ? "removed" : "STILL PRESENT"}`);
  }
});
