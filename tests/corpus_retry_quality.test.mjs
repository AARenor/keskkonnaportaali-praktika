// Behavioural regression: a portal page that was read successfully once must be
// read again after a failed refresh, otherwise the corpus can only ever cite the
// pages downloaded in its first week.
//
// Harness. The test drives the real hydrateCorpusBacklog against a real,
// throwaway PostgreSQL cluster and reads the rows back with real SQL:
//
//   1. a temporary postgres:17-alpine container on a free loopback port, removed
//      in the finally block (no volume survives, nothing else is touched);
//   2. the real schema, created by hydrateCorpusBacklog itself;
//   3. deterministic rows inserted with SQL, so the only thing under test is the
//      production selection and persistence code path;
//   4. a canned HTTPS transport, installed before the corpus module is imported,
//      so the robots.txt and page reads stay on this machine. An unexpected URL
//      gets a 404 instead of a body, and no request reaches a real host.
//
// The row shapes mirror what production recorded: fetched_at carries the time of
// the last attempt, and metadata.hydration_attempted_at marks that attempt as a
// failure or a skip rather than a successful body refresh. Such a row keeps its
// stored body but loses its evidence rights, so it is a route only until a later
// read succeeds.
//
// A citable row also carries the source use witness of the read that produced its
// stored body, bound to that resource and to that body hash. That witness is what
// the delivery layer re-checks, so a row whose last attempt failed carries none
// and stays route-only, while a row whose last read succeeded starts citable.
//
// The second phase covers historical markers that are not timestamps at all: an
// unreadable marker must not abort the pass, must not block a row that has no
// body, and must not authorise a re-read of a body that is still fresh.
//
// The third phase covers the refresh clock: a successful body must be read again
// before the seven day evidence window closes, a younger body stays untouched,
// and the failed retry cooldown and the noindex exclusion are unchanged.
//
// The fourth phase covers the robots boundary: rules parsed from an answer served
// by a different approved origin may not authorise the queried publisher, while a
// directly answered robots.txt still does.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createServer } from "node:net";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import { observeSourcePolicy } from "../server/source_policy.mjs";
import { sourceResourceKey } from "../server/source-identity.mjs";

const require = createRequire(import.meta.url);
const { Client } = require("pg");

const POSTGRES_IMAGE = "postgres:17-alpine";
const POSTGRES_DATABASE = "keskkonnaportaal_practice";
const FIXTURE_ORIGIN = "https://keskkonnaportaal.ee";
const DAY_MS = 86_400_000;
const MINIMUM_EVIDENCE_LENGTH = 80;
const CORPUS_MODULE_URL = new URL("../server/corpus.mjs", import.meta.url).href;
// A recorded run can name its container and loopback port so the exact
// resources of that run are auditable afterwards. Teardown removes the container
// by the id Docker returned, so a name override cannot delete anything this run
// did not create.
const CONTAINER_NAME_OVERRIDE = String(process.env.CORPUS_RETRY_TEST_CONTAINER_NAME || "").trim();
const PORT_OVERRIDE = Number(process.env.CORPUS_RETRY_TEST_PORT || 0);

const PREVIOUS_BODY = "Varasemalt loetud ametlik lehekülg metsa raiemahtude kohta. SMI 2025 andmetel oli 2024. aasta raiemaht 12 500 tuh m3 ja juurdekasv 15 458 tuh m3.";

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

// The witness a successful read of this exact body at this exact time would have
// stored: same resource, same body hash, robots allowed for its own origin.
function bodyWitness(url, body, observedAt) {
  return observeSourcePolicy({
    requestedUrl: url,
    finalUrl: url,
    observedAt,
    contentKind: "fetched-html",
    bodyHash: sha256(body),
    artifactHash: sha256(body),
    robotsObservation: { status: "allowed", origin: new URL(url).origin, checkedAt: observedAt },
    html: `<main><p>${body}</p></main>`,
    headerInstances: [],
  });
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
    const created = execFileSync("docker", [
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
    ], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return String(created).trim();
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

function removeContainer(identifier) {
  const target = String(identifier || "").trim();
  if (!target) return false;
  try {
    execFileSync("docker", ["rm", "--force", target], { stdio: "ignore" });
  } catch {
    // The container may already be gone; nothing else to clean up.
  }
  // Verified from outside by asking Docker about that exact object, which works
  // for an id and for a name: an inspect that fails means it is gone.
  try {
    execFileSync("docker", ["container", "inspect", "--format", "{{.Id}}", target], { stdio: "ignore" });
    return false;
  } catch {
    return true;
  }
}

// The corpus transport uses node:https directly. Replacing that function before
// the corpus module is imported keeps every robots.txt and page read in memory.
function installCannedTransport() {
  const httpsModule = require("node:https");
  const originalRequest = httpsModule.request;
  const responses = new Map();
  const requestedUrls = [];
  httpsModule.request = (target, _options, callback) => {
    const href = String(target);
    requestedUrls.push(href);
    const request = new EventEmitter();
    request.destroy = (error) => {
      if (error) request.emit("error", error);
    };
    request.end = () => {
      const spec = responses.get(href) || {
        status: 404,
        contentType: "text/html; charset=utf-8",
        body: "<html><body><p>Puudub</p></body></html>",
      };
      setImmediate(() => {
        const incoming = new EventEmitter();
        incoming.statusCode = spec.status;
        incoming.headers = {
          "content-type": spec.contentType,
          ...(spec.location ? { location: spec.location } : {}),
        };
        incoming.destroy = () => incoming.emit("close");
        callback(incoming);
        setImmediate(() => {
          incoming.emit("data", Buffer.from(spec.body || "", "utf8"));
          incoming.emit("end");
        });
      });
    };
    return request;
  };
  return {
    responses,
    requestedUrls,
    restore: () => {
      httpsModule.request = originalRequest;
    },
  };
}

function portalPage(heading, paragraph) {
  return `<!doctype html><html lang="et"><head><title>${heading}</title></head>`
    + `<body><main><h1>${heading}</h1><p>${paragraph}</p></main></body></html>`;
}

const fixtures = [
  {
    key: "retry-eight-days",
    label: "a previously hydrated page whose refresh failed 8 days ago",
    path: "/et/mets/raiemaht-2025",
    attemptedDaysAgo: 8,
    previousContent: PREVIOUS_BODY,
    response: {
      status: 200,
      body: portalPage("Metsa raiemaht 2025", "Ametlik lehekülg metsa raiemahtude kohta. SMI 2025 töövihiku järgi oli 2024. aasta raiemaht 12 500 tuh m3 ja juurdekasv 15 458 tuh m3."),
    },
  },
  {
    key: "retry-eight-days-failing",
    label: "a previously hydrated page whose refresh failed 8 days ago and whose official page currently fails",
    path: "/et/mets/katkine-varskendus",
    attemptedDaysAgo: 8,
    previousContent: "Varasemalt loetud ametlik lehekülg, mille värskendus ebaõnnestub serverivea tõttu ja mis peab jääma ainult suunavaks tulemuseks.",
    response: { status: 500, body: portalPage("Serveriviga", "Seda lehekülge ei saa praegu lugeda.") },
  },
  {
    key: "cooldown-six-days",
    label: "a previously hydrated page whose refresh failed 6 days ago",
    path: "/et/mets/kuuenda-paeva-leht",
    attemptedDaysAgo: 6,
    previousContent: "Varasemalt loetud ametlik lehekülg, mille värskendus ebaõnnestus kuus päeva tagasi ja mis ootab seitsmepäevase ootperioodi lõppu.",
    response: {
      status: 200,
      body: portalPage("Kuuenda päeva lehekülg", "Värskendus ebaõnnestus kuus päeva tagasi ja ootab seitsmepäevase ootperioodi lõppu."),
    },
  },
  {
    key: "fresh-success",
    label: "a page successfully refreshed 1 day ago",
    path: "/et/mets/varske-leht",
    fetchedDaysAgo: 1,
    previousContent: "Varasemalt loetud ametlik lehekülg, mis loeti edukalt üks päev tagasi ja mille keha on tõendina kehtiv.",
    response: {
      status: 200,
      body: portalPage("Värske lehekülg", "See lehekülg loeti edukalt üks päev tagasi ja seda ei pea veel uuesti lugema."),
    },
  },
  {
    key: "aged-success",
    label: "a page successfully refreshed 40 days ago",
    path: "/et/mets/nadalavanune-leht",
    fetchedDaysAgo: 40,
    previousContent: "Varasemalt loetud ametlik lehekülg, mille keha on nelikümmend päeva vana ja mille tõendusaken on seetõttu aegunud.",
    response: {
      status: 200,
      body: portalPage("Neljakümne päeva lehekülg", "See lehekülg loeti nelikümmend päeva tagasi ja selle keha tuleb tõendusakna aegumise tõttu uuesti lugeda."),
    },
  },
  {
    key: "noindex-page",
    label: "a route-only row marked robots_noindex",
    path: "/et/mets/noindex-leht",
    fetchedDaysAgo: 45,
    noindex: true,
    previousContent: "",
    response: {
      status: 200,
      body: portalPage("Noindex lehekülg", "Seda lehekülge ei tohi korjata, sest robots_noindex märge keelab selle lugemise."),
    },
  },
  {
    key: "unwitnessed-recent",
    label: "a recent body stored before the source use witness existed",
    path: "/et/mets/tunnistuseta-leht",
    fetchedDaysAgo: 2,
    unwitnessed: true,
    previousContent: "Varasemalt loetud ametlik lehekülg, mille keha on värske, kuid mille lugemisel ei salvestatud allika kasutusluba ja mis on seetõttu ainult suunav.",
    response: {
      status: 200,
      body: portalPage("Tunnistuseta lehekülg", "See lehekülg loeti enne kasutusloa tunnistust ja tuleb tunnistuse saamiseks turvaliselt uuesti lugeda."),
    },
  },
  {
    key: "unwitnessed-recent-failed",
    label: "an unwitnessed recent body whose last attempt failed yesterday",
    path: "/et/mets/tunnistuseta-ootepaev",
    attemptedDaysAgo: 1,
    unwitnessed: true,
    previousContent: "Varasemalt loetud ametlik lehekülg, mille keha on värske ja mille viimane lugemiskatse ebaõnnestus eile, mistõttu kehtib seitsmepäevane ootepäev.",
    response: {
      status: 200,
      body: portalPage("Ootepäev", "Seda lehekülge ei tohi ootepäeva ajal uuesti lugeda."),
    },
  },
  {
    key: "missing-body",
    label: "a route-only row that never carried a body",
    path: "/et/mets/ilma-kehata-leht",
    fetchedDaysAgo: 60,
    previousContent: "",
    response: {
      status: 200,
      body: portalPage("Ilma kehata lehekülg", "Selle lehekülje keha puudus ja seetõttu peab ta alati uuesti lugemise järjekorda kuuluma."),
    },
  },
];

const fixtureByKey = new Map(fixtures.map((fixture) => [fixture.key, fixture]));

function describeFixture(key) {
  return fixtureByKey.get(key).label;
}

function fixtureUrl(key) {
  return `${FIXTURE_ORIGIN}${fixtureByKey.get(key).path}`;
}

// The row state production stores for these pages: the last attempt time in
// fetched_at, an explicit failed attempt marker when the refresh did not produce
// a body, and the provenance fields a successful hydration writes.
function fixtureRow(fixture, now) {
  const attemptedAt = fixture.attemptedDaysAgo === undefined
    ? null
    : new Date(now - fixture.attemptedDaysAgo * DAY_MS).toISOString();
  const fetchedAt = new Date(now - (fixture.attemptedDaysAgo ?? fixture.fetchedDaysAgo) * DAY_MS).toISOString();
  const hydrated = fixture.previousContent.length >= MINIMUM_EVIDENCE_LENGTH;
  const url = `${FIXTURE_ORIGIN}${fixture.path}`;
  // A body is citable only through the witness its own read produced. A row whose
  // last attempt failed, a row that never had a body, and a row explicitly marked
  // unwitnessed (a body stored before the witness existed) carry none; a row whose
  // last read succeeded carries the witness of that read, bound to this resource
  // and to the body it stored.
  const witness = hydrated && fixture.attemptedDaysAgo === undefined && !fixture.unwitnessed
    ? bodyWitness(url, fixture.previousContent, fetchedAt)
    : null;
  return {
    externalId: `fixture-${fixture.key}`,
    url,
    fetchedAt,
    contentHash: fixture.noindex
      ? sha256(JSON.stringify([url, "robots-noindex"]))
      : sha256(fixture.previousContent),
    metadata: {
      ...(hydrated ? { hydrated: true, source_kind: "official-page-hydration" } : {}),
      ...(attemptedAt ? { hydration_attempted_at: attemptedAt } : {}),
      ...(fixture.noindex ? { robots_noindex: true } : {}),
      ...(witness ? { source_policy: witness, sourceResourceKey: sourceResourceKey(url) } : {}),
    },
  };
}

async function readRows(client) {
  const { rows } = await client.query(`
    SELECT id, source_key, canonical_url, title, content, content_hash, fetched_at,
           metadata, is_available, source_tier
    FROM practice_corpus_documents
    ORDER BY canonical_url
  `);
  return new Map(rows.map((row) => [row.canonical_url, row]));
}

async function insertRow(client, { externalId, url, title, content, contentHash, fetchedAt, metadata }) {
  await client.query(`
    INSERT INTO practice_corpus_documents
      (external_id, source_key, canonical_url, title, summary, content, category,
       organization, topics, source_tier, language, metadata_quality, metadata,
       content_hash, fetched_at, last_seen_at, is_available)
    VALUES ($1, 'official-page-hydration', $2, $3, '', $4, 'Uudis',
            'Keskkonnaagentuur', ARRAY[]::TEXT[], 'official', 'et', 3, $5::JSONB,
            $6, $7::TIMESTAMPTZ, $7::TIMESTAMPTZ, TRUE)
  `, [externalId, url, title, content, JSON.stringify(metadata), contentHash, fetchedAt]);
}

test("the corpus backlog refreshes bodies before the seven day evidence window closes, retries failed reads after the seven day cooldown, survives unreadable attempt markers and refuses cross origin robots answers", { timeout: 240_000 }, async (t) => {
  if (!dockerImageAvailable(POSTGRES_IMAGE)) {
    t.skip(`Docker image ${POSTGRES_IMAGE} is unavailable, so the isolated PostgreSQL fixture cannot start; the retry selection cannot be exercised without a real SQL engine`);
    return;
  }
  const containerName = CONTAINER_NAME_OVERRIDE
    || `corpus-retry-quality-${process.pid}-${randomBytes(3).toString("hex")}`;
  const port = Number.isInteger(PORT_OVERRIDE) && PORT_OVERRIDE > 0
    ? PORT_OVERRIDE
    : await reserveLoopbackPort();
  const databaseUrl = `postgres://postgres@127.0.0.1:${port}/${POSTGRES_DATABASE}`;
  // Recorded here so a run log names the exact container; teardown removes it
  // automatically and reports the verified result below.
  t.diagnostic(`temporary PostgreSQL container: ${containerName} on 127.0.0.1:${port}`);
  let admin;
  let transport;
  let createdContainerId = null;
  try {
    createdContainerId = startPostgresContainer(containerName, port);
    await waitForPostgres(databaseUrl);
    process.env.DATABASE_URL = databaseUrl;
    process.env.DATABASE_SSL_MODE = "disable";
    process.env.SEARCH_HASH_SECRET = createHash("sha512").update("corpus-retry-quality-fixture").digest("base64");
    transport = installCannedTransport();
    const corpus = await import(CORPUS_MODULE_URL);

    // A real backlog pass on an empty table creates the schema the fixtures need.
    const primed = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    assert.equal(primed.status, "ready", "the isolated database must be reachable before the fixture rows are inserted");

    transport.responses.set(`${FIXTURE_ORIGIN}/robots.txt`, {
      status: 200,
      contentType: "text/plain",
      body: "User-agent: *\nAllow: /\n",
    });
    for (const fixture of fixtures) {
      transport.responses.set(`${FIXTURE_ORIGIN}${fixture.path}`, {
        status: fixture.response.status,
        contentType: "text/html; charset=utf-8",
        body: fixture.response.body,
      });
    }

    admin = new Client({ connectionString: databaseUrl });
    await admin.connect();
    const now = Date.now();
    for (const fixture of fixtures) {
      const row = fixtureRow(fixture, now);
      await insertRow(admin, {
        externalId: row.externalId,
        url: row.url,
        title: `Fixture ${fixture.key}`,
        content: fixture.previousContent,
        contentHash: row.contentHash,
        fetchedAt: row.fetchedAt,
        metadata: row.metadata,
      });
    }

    const before = await readRows(admin);
    const beforeRow = (key) => before.get(fixtureUrl(key));

    // Precondition: the failed refreshes kept a verified body, and the failed
    // attempt is what takes its evidence rights away (attempt time equals the
    // stored fetched_at, so nothing renews the citation).
    for (const key of ["retry-eight-days", "retry-eight-days-failing", "cooldown-six-days"]) {
      const row = beforeRow(key);
      assert.ok(row.content.length >= MINIMUM_EVIDENCE_LENGTH, `${describeFixture(key)} must still hold the previously read body`);
      assert.match(row.content_hash, /^[a-f0-9]{64}$/u, `${describeFixture(key)} must hold a hashed body version`);
      assert.equal(row.is_available, true, `${describeFixture(key)} stays available as a route`);
      const item = corpus.publicSearchItem(row, true);
      assert.equal(item._answerEvidenceEligible, false, `${describeFixture(key)} is route-only while its last attempt failed`);
      assert.equal(item.evidencePolicy, "route-only", `${describeFixture(key)} must not cite a failed refresh`);
    }
    assert.equal(beforeRow("retry-eight-days").content, PREVIOUS_BODY, "the 8 day old failure keeps the body that was read successfully before");
    assert.equal(beforeRow("retry-eight-days").content_hash, sha256(PREVIOUS_BODY), "the 8 day old failure keeps the body version read successfully before");
    for (const key of ["fresh-success", "aged-success"]) {
      const item = corpus.publicSearchItem(beforeRow(key), true);
      assert.equal(item._answerEvidenceEligible, true, `${describeFixture(key)} starts as citable evidence`);
      assert.equal(item.evidencePolicy, "versioned", `${describeFixture(key)} starts with versioned evidence policy`);
    }
    assert.equal(beforeRow("noindex-page").content, "", "the noindex fixture stays route-only");
    assert.equal(corpus.publicSearchItem(beforeRow("noindex-page"), true)._answerEvidenceEligible, false, "the noindex fixture is never answer evidence");
    assert.equal(beforeRow("missing-body").content, "", "the missing body fixture is route-only until a read succeeds");
    // Negative twin of the citable case: a body stored without the witness of its
    // own read has no publication proof, however fresh it is.
    assert.ok(
      beforeRow("unwitnessed-recent").content.length >= MINIMUM_EVIDENCE_LENGTH,
      "the unwitnessed recent body is stored like any other body",
    );
    assert.equal(
      corpus.publicSearchItem(beforeRow("unwitnessed-recent"), true).evidencePolicy,
      "route-only",
      "a recent hydrated body without a source use witness is route-only",
    );
    assert.equal(
      corpus.publicSearchItem(beforeRow("unwitnessed-recent"), true)._answerEvidenceEligible,
      false,
      "a recent hydrated body without a source use witness is not answer evidence",
    );
    assert.equal(
      corpus.publicSearchItem(beforeRow("unwitnessed-recent-failed"), true)._answerEvidenceEligible,
      false,
      "an unwitnessed body whose last attempt failed is route-only too",
    );

    const runStartedAt = Date.now();
    const run = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    // A failed read is attempted twice by the transport retry, so compare the
    // distinct set of pages that were read.
    const requestedPages = [...new Set(transport.requestedUrls
      .filter((href) => href.startsWith(FIXTURE_ORIGIN) && !href.endsWith("/robots.txt")))];

    // Selection. The two 8 day old failures and the rows whose body is missing or
    // older than the refresh window are due; the 6 day old failure, the fresh body
    // and the noindex row are not.
    assert.ok(
      requestedPages.includes(fixtureUrl("retry-eight-days")),
      "a previously hydrated page whose refresh failed 8 days ago must be retried once the 7 day cooldown has passed",
    );
    assert.ok(
      requestedPages.includes(fixtureUrl("retry-eight-days-failing")),
      "a previously hydrated page whose refresh failed 8 days ago must be retried even when the official page currently fails",
    );
    assert.ok(
      !requestedPages.includes(fixtureUrl("cooldown-six-days")),
      "a page whose refresh failed 6 days ago must respect the 7 day cooldown",
    );
    assert.ok(
      !requestedPages.includes(fixtureUrl("fresh-success")),
      "a page refreshed successfully 1 day ago must not be read again",
    );
    assert.ok(
      !requestedPages.includes(fixtureUrl("noindex-page")),
      "a robots_noindex row must stay excluded from hydration",
    );
    // Safe rehydration. A witnessed page needs no read while its body is fresh,
    // but an unwitnessed body cannot be cited at all, so it is re-read first and
    // is not held behind pages that are merely due.
    const unwitnessedIndex = requestedPages.indexOf(fixtureUrl("unwitnessed-recent"));
    const agedIndex = requestedPages.indexOf(fixtureUrl("aged-success"));
    assert.ok(
      unwitnessedIndex >= 0,
      "an unwitnessed recent body must be re-read so that a witness can be recorded",
    );
    assert.ok(
      unwitnessedIndex < (agedIndex === -1 ? Number.POSITIVE_INFINITY : agedIndex),
      "an unwitnessed body must be prioritized ahead of a witnessed page that is only due by age",
    );
    assert.ok(
      !requestedPages.includes(fixtureUrl("unwitnessed-recent-failed")),
      "an unwitnessed body whose last attempt failed yesterday must respect the 7 day cooldown",
    );
    assert.ok(
      requestedPages.includes(fixtureUrl("aged-success")),
      "a body older than the 30 day refresh window must still be read again",
    );
    assert.deepEqual(
      [...requestedPages].sort(),
      [
        fixtureUrl("retry-eight-days"),
        fixtureUrl("retry-eight-days-failing"),
        fixtureUrl("aged-success"),
        fixtureUrl("missing-body"),
        fixtureUrl("unwitnessed-recent"),
      ].sort(),
      "the backlog must select exactly the rows whose refresh is due",
    );
    assert.equal(run.status, "ready", "the backlog pass itself must complete");
    assert.equal(run.remainingChecked, 5, "five rows are due for a read");
    assert.equal(run.hydrated, 4, "four reads return a usable official page");
    assert.equal(run.errors, 1, "one read fails at the official page");
    assert.equal(run.skipped, 0, "no selected row is skipped");

    const after = await readRows(admin);
    const afterRow = (key) => after.get(fixtureUrl(key));

    // A successful refresh replaces the body and restores evidence rights.
    const refreshed = afterRow("retry-eight-days");
    const expectedPage = corpus.extractReadablePage(
      fixtureByKey.get("retry-eight-days").response.body,
      fixtureUrl("retry-eight-days"),
    );
    assert.equal(refreshed.content, expectedPage.content, "the retried page stores the freshly read body");
    assert.equal(refreshed.content_hash, sha256(expectedPage.content), "the stored body keeps its provenance hash");
    assert.ok(refreshed.fetched_at.getTime() >= runStartedAt - 5_000, "the retried row records the new read time");
    assert.equal(refreshed.metadata.source_kind, "official-page-hydration", "the refreshed row keeps its hydration provenance");
    const refreshedItem = corpus.publicSearchItem(refreshed, true);
    assert.equal(refreshedItem._answerEvidenceEligible, true, "a successful refresh restores evidence rights");
    assert.equal(refreshedItem.evidencePolicy, "versioned", "a successful refresh is versioned evidence");
    assert.equal(refreshedItem._contentHash, refreshed.content_hash, "the citation points at the refreshed body version");
    // The unwitnessed body was re-read for exactly this reason: the new read
    // records the witness, so the same row becomes citable without waiting out
    // the seven day window.
    const rehydrated = afterRow("unwitnessed-recent");
    assert.notEqual(rehydrated.metadata?.source_policy, undefined, "a re-read stores the source use witness");
    const rehydratedItem = corpus.publicSearchItem(rehydrated, true);
    assert.equal(rehydratedItem._answerEvidenceEligible, true, "an unwitnessed body becomes citable after its own read");
    assert.equal(rehydratedItem.evidencePolicy, "versioned", "the re-read body is versioned evidence");

    // A failed retry records the attempt and keeps the old body route-only: an
    // attempt is not evidence, so the citation must not be renewed.
    const failed = afterRow("retry-eight-days-failing");
    assert.equal(failed.content, beforeRow("retry-eight-days-failing").content, "a failed retry must not discard the previously stored body");
    assert.equal(failed.content_hash, beforeRow("retry-eight-days-failing").content_hash, "a failed retry must not re-version the stored body");
    assert.ok(failed.fetched_at.getTime() >= runStartedAt - 5_000, "the failed retry records the attempt time");
    const failedAttemptAt = Date.parse(failed.metadata.hydration_attempted_at);
    assert.ok(Number.isFinite(failedAttemptAt) && failedAttemptAt >= runStartedAt - 5_000, "the failed retry records hydration_attempted_at");
    assert.equal(failed.is_available, true, "a failed refresh keeps the row available as a route");
    const failedItem = corpus.publicSearchItem(failed, true);
    assert.equal(failedItem._answerEvidenceEligible, false, "a failed refresh leaves the body route-only");
    assert.equal(failedItem.evidencePolicy, "route-only", "a failed refresh is not versioned evidence");
    assert.equal(failedItem._contentHash, failed.content_hash, "the route still exposes the stored body version for inspection");

    // Rows that are not due stay untouched.
    for (const key of ["cooldown-six-days", "fresh-success"]) {
      const untouched = afterRow(key);
      const original = beforeRow(key);
      assert.equal(untouched.content, original.content, `${describeFixture(key)} must keep its stored body`);
      assert.equal(untouched.content_hash, original.content_hash, `${describeFixture(key)} must keep its body version`);
      assert.equal(untouched.fetched_at.getTime(), original.fetched_at.getTime(), `${describeFixture(key)} must not record a new read`);
      assert.deepEqual(untouched.metadata, original.metadata, `${describeFixture(key)} must keep its attempt metadata`);
      assert.equal(untouched.is_available, true, `${describeFixture(key)} stays available as a route`);
    }
    assert.equal(corpus.publicSearchItem(afterRow("cooldown-six-days"), true)._answerEvidenceEligible, false, "a 6 day old failed refresh stays route-only");
    assert.equal(corpus.publicSearchItem(afterRow("fresh-success"), true)._answerEvidenceEligible, true, "a 1 day old successful body stays citable");

    // The noindex row is never read and never rewritten.
    const noindex = afterRow("noindex-page");
    const noindexBefore = beforeRow("noindex-page");
    assert.equal(noindex.content, "", "the noindex row keeps an empty body");
    assert.equal(noindex.content_hash, noindexBefore.content_hash, "the noindex row keeps its route-only version");
    assert.equal(noindex.fetched_at.getTime(), noindexBefore.fetched_at.getTime(), "the noindex row records no read");
    assert.deepEqual(noindex.metadata, noindexBefore.metadata, "the noindex row keeps its metadata");
    assert.equal(noindex.is_available, true, "the noindex row stays available as a route");
    assert.equal(corpus.publicSearchItem(noindex, true)._answerEvidenceEligible, false, "the noindex row is never answer evidence");

    // The remaining rows prove the pass really wrote to this database, so the
    // negative assertions above cannot pass on an idle run.
    for (const key of ["missing-body", "aged-success"]) {
      const hydrated = afterRow(key);
      assert.ok(hydrated.content.length >= MINIMUM_EVIDENCE_LENGTH, `${describeFixture(key)} must be hydrated by the pass`);
      assert.ok(hydrated.fetched_at.getTime() >= runStartedAt - 5_000, `${describeFixture(key)} must record the new read time`);
      assert.equal(hydrated.metadata.hydrated, true, `${describeFixture(key)} must be marked hydrated`);
      assert.equal(corpus.publicSearchItem(hydrated, true)._answerEvidenceEligible, true, `${describeFixture(key)} becomes citable evidence`);
    }

    // Second phase: historical attempt markers that are not timestamps must not
    // abort the pass, and they must not decide either clock by themselves.
    transport.requestedUrls.length = 0;
    const malformedFreshUrl = `${FIXTURE_ORIGIN}/et/mets/rikutud-varske`;
    const malformedEmptyUrl = `${FIXTURE_ORIGIN}/et/mets/rikutud-kehata`;
    const malformedFreshBody = "Varasemalt loetud ametlik lehekülg, mille katseaja märge on rikutud ja mille keha on veel värske.";
    const malformedEmptyPage = portalPage("Rikutud kehata", "Selle lehekülje keha puudus ja rikutud katseaja märge ei tohi takistada uuesti lugemist.");
    transport.responses.set(malformedEmptyUrl, { status: 200, contentType: "text/html; charset=utf-8", body: malformedEmptyPage });
    // The witness belongs to the successful read that stored this body three days
    // ago; the later attempt marker is unreadable, which is the state this phase
    // is about. Without the witness the row would be an unwitnessed body and the
    // rehydration rule would rightly take it first, which would hide the clock
    // behaviour the assertions below describe.
    const malformedFreshAt = new Date(Date.now() - 3 * DAY_MS).toISOString();
    await insertRow(admin, {
      externalId: "fixture-malformed-fresh-body",
      url: malformedFreshUrl,
      title: "Fixture malformed fresh body",
      content: malformedFreshBody,
      contentHash: sha256(malformedFreshBody),
      fetchedAt: malformedFreshAt,
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        hydration_attempted_at: "teadmata",
        source_policy: bodyWitness(malformedFreshUrl, malformedFreshBody, malformedFreshAt),
        sourceResourceKey: sourceResourceKey(malformedFreshUrl),
      },
    });
    await insertRow(admin, {
      externalId: "fixture-malformed-empty-body",
      url: malformedEmptyUrl,
      title: "Fixture malformed empty body",
      content: "",
      contentHash: sha256(""),
      fetchedAt: new Date(Date.now() - 20 * DAY_MS).toISOString(),
      metadata: { hydration_attempted_at: "2026-02-30T00:00:00Z" },
    });
    const beforeSecondRun = await readRows(admin);
    const secondRunStartedAt = Date.now();
    const secondRun = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 }).catch((error) => {
      assert.fail(`an unreadable hydration attempt marker aborted the whole backlog pass: ${error.message}`);
    });
    const secondRunPages = [...new Set(transport.requestedUrls
      .filter((href) => href.startsWith(FIXTURE_ORIGIN) && !href.endsWith("/robots.txt")))];
    assert.equal(secondRun.status, "ready", "the pass survives an unreadable attempt marker");
    assert.deepEqual(
      [...secondRunPages].sort(),
      [malformedEmptyUrl],
      "a body-less row with an unreadable attempt marker is still due, and a fresh body with one is not re-read",
    );
    assert.equal(secondRun.remainingChecked, 1, "only the body-less row with an unreadable marker is due");
    assert.equal(secondRun.hydrated, 1, "that row is hydrated");
    assert.equal(secondRun.errors, 0, "the pass reports no errors");
    assert.equal(secondRun.skipped, 0, "the pass skips nothing");

    const afterSecondRun = await readRows(admin);
    const malformedFresh = afterSecondRun.get(malformedFreshUrl);
    const malformedFreshBefore = beforeSecondRun.get(malformedFreshUrl);
    assert.equal(malformedFresh.content, malformedFreshBefore.content, "a fresh body with an unreadable marker is not replaced");
    assert.equal(malformedFresh.fetched_at.getTime(), malformedFreshBefore.fetched_at.getTime(), "it records no read");
    assert.deepEqual(malformedFresh.metadata, malformedFreshBefore.metadata, "its metadata is left as it was");
    assert.equal(
      corpus.publicSearchItem(malformedFresh, true)._answerEvidenceEligible,
      false,
      "an unreadable marker proves no successful refresh, so the stored body stays route-only",
    );
    const malformedEmpty = afterSecondRun.get(malformedEmptyUrl);
    const malformedEmptyPageContent = corpus.extractReadablePage(malformedEmptyPage, malformedEmptyUrl).content;
    assert.equal(malformedEmpty.content, malformedEmptyPageContent, "the body-less row stores the freshly read body");
    assert.equal(malformedEmpty.metadata.hydration_attempted_at, undefined, "a successful read clears the unreadable marker");
    assert.equal(malformedEmpty.metadata.hydrated, true, "the refreshed row is marked hydrated");
    assert.ok(malformedEmpty.fetched_at.getTime() >= secondRunStartedAt - 5_000, "the refreshed row records the new read time");
    assert.equal(
      corpus.publicSearchItem(malformedEmpty, true)._answerEvidenceEligible,
      true,
      "the freshly read body is citable evidence",
    );
    assert.equal(
      afterSecondRun.get(fixtureUrl("retry-eight-days")).fetched_at.getTime(),
      afterRow("retry-eight-days").fetched_at.getTime(),
      "a page refreshed by the previous pass is not read again on the next pass",
    );

    // Third phase: a successful body must be read again before the seven day
    // evidence window closes, and the failed retry cooldown must not shorten.
    transport.requestedUrls.length = 0;
    const refreshSixUrl = `${FIXTURE_ORIGIN}/et/mets/kuue-paeva-keha`;
    const refreshFiveUrl = `${FIXTURE_ORIGIN}/et/mets/viie-paeva-keha`;
    const refreshSixPage = portalPage("Kuue päeva keha", "See lehekülg loeti kuus päeva tagasi ja selle tõendusaken sulgub homme, seega tuleb keha uuesti lugeda.");
    const refreshFivePage = portalPage("Viie päeva keha", "See lehekülg loeti viis päeva tagasi ja selle tõendusaknas on veel kaks päeva, seega piisab senisest kehast.");
    const refreshSixBody = "Varasemalt loetud ametlik lehekülg, mille keha on kuus päeva vana ja mille tõendusaken sulgub homme, mistõttu tuleb see enne lõppu uuesti lugeda.";
    const refreshFiveBody = "Varasemalt loetud ametlik lehekülg, mille keha on viis päeva vana ja mille tõendusaknas on veel kaks päeva, mistõttu see jääb esialgu puutumata.";
    transport.responses.set(refreshSixUrl, { status: 200, contentType: "text/html; charset=utf-8", body: refreshSixPage });
    transport.responses.set(refreshFiveUrl, { status: 200, contentType: "text/html; charset=utf-8", body: refreshFivePage });
    // Both bodies were read successfully under a witness; the phase is about the
    // age clock, so each row carries the witness of its own read.
    const refreshSixAt = new Date(Date.now() - 6 * DAY_MS).toISOString();
    const refreshFiveAt = new Date(Date.now() - 5 * DAY_MS).toISOString();
    await insertRow(admin, {
      externalId: "fixture-refresh-six-days",
      url: refreshSixUrl,
      title: "Fixture refresh six days",
      content: refreshSixBody,
      contentHash: sha256(refreshSixBody),
      fetchedAt: refreshSixAt,
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        source_policy: bodyWitness(refreshSixUrl, refreshSixBody, refreshSixAt),
        sourceResourceKey: sourceResourceKey(refreshSixUrl),
      },
    });
    await insertRow(admin, {
      externalId: "fixture-refresh-five-days",
      url: refreshFiveUrl,
      title: "Fixture refresh five days",
      content: refreshFiveBody,
      contentHash: sha256(refreshFiveBody),
      fetchedAt: refreshFiveAt,
      metadata: {
        hydrated: true,
        source_kind: "official-page-hydration",
        source_policy: bodyWitness(refreshFiveUrl, refreshFiveBody, refreshFiveAt),
        sourceResourceKey: sourceResourceKey(refreshFiveUrl),
      },
    });
    const beforeThirdRun = await readRows(admin);
    assert.equal(
      corpus.publicSearchItem(beforeThirdRun.get(refreshSixUrl), true)._answerEvidenceEligible,
      true,
      "a six day old official body is still citable, so the refresh has to happen before the window closes",
    );
    const thirdRunStartedAt = Date.now();
    const thirdRun = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    const thirdRunPages = [...new Set(transport.requestedUrls
      .filter((href) => href.startsWith(FIXTURE_ORIGIN) && !href.endsWith("/robots.txt")))];
    assert.ok(
      thirdRunPages.includes(refreshSixUrl),
      "a successfully fetched official page that is 6 days old must be read again before its 7 day evidence window closes",
    );
    assert.ok(
      !thirdRunPages.includes(refreshFiveUrl),
      "a successfully fetched page that is 5 days old must not be read again yet",
    );
    assert.ok(
      !thirdRunPages.includes(fixtureUrl("cooldown-six-days")),
      "a failed retry 6 days ago must keep its 7 day cooldown",
    );
    assert.ok(
      !thirdRunPages.includes(fixtureUrl("noindex-page")),
      "a robots_noindex row must stay out of the refresh queue",
    );
    assert.deepEqual(
      [...thirdRunPages].sort(),
      [refreshSixUrl],
      "the refresh pass must select exactly the body whose evidence window is about to close",
    );
    assert.equal(thirdRun.status, "ready", "the refresh pass completes");
    assert.equal(thirdRun.remainingChecked, 1, "one body is due for a refresh before its window closes");
    assert.equal(thirdRun.hydrated, 1, "that body is read again");
    assert.equal(thirdRun.errors, 0, "the refresh reports no errors");
    assert.equal(thirdRun.skipped, 0, "the refresh skips nothing");

    const afterThirdRun = await readRows(admin);
    const refreshedSix = afterThirdRun.get(refreshSixUrl);
    const refreshedSixPageContent = corpus.extractReadablePage(refreshSixPage, refreshSixUrl).content;
    assert.equal(refreshedSix.content, refreshedSixPageContent, "the 6 day old body is replaced with the freshly read body");
    assert.equal(refreshedSix.content_hash, sha256(refreshedSixPageContent), "the refreshed body carries its new version hash");
    assert.ok(refreshedSix.fetched_at.getTime() >= thirdRunStartedAt - 5_000, "the refreshed row records the new read time");
    assert.equal(
      corpus.publicSearchItem(refreshedSix, true)._answerEvidenceEligible,
      true,
      "the refreshed body stays citable after the read",
    );
    const untouchedFive = afterThirdRun.get(refreshFiveUrl);
    const untouchedFiveBefore = beforeThirdRun.get(refreshFiveUrl);
    assert.equal(untouchedFive.content, untouchedFiveBefore.content, "a 5 day old body keeps its stored text");
    assert.equal(untouchedFive.content_hash, untouchedFiveBefore.content_hash, "a 5 day old body keeps its version");
    assert.equal(untouchedFive.fetched_at.getTime(), untouchedFiveBefore.fetched_at.getTime(), "a 5 day old body records no read");
    assert.deepEqual(untouchedFive.metadata, untouchedFiveBefore.metadata, "a 5 day old body keeps its metadata");
    assert.equal(
      corpus.publicSearchItem(untouchedFive, true)._answerEvidenceEligible,
      true,
      "a 5 day old body stays citable without a new read",
    );
    const cooledFailure = afterThirdRun.get(fixtureUrl("cooldown-six-days"));
    assert.equal(cooledFailure.content, beforeRow("cooldown-six-days").content, "the cooling failed row keeps its body");
    assert.equal(cooledFailure.fetched_at.getTime(), beforeRow("cooldown-six-days").fetched_at.getTime(), "the cooling failed row records no read");
    assert.equal(
      corpus.publicSearchItem(cooledFailure, true)._answerEvidenceEligible,
      false,
      "the cooling failed row stays route-only",
    );
    const noindexAfterRefresh = afterThirdRun.get(fixtureUrl("noindex-page"));
    assert.equal(noindexAfterRefresh.content, "", "the noindex row still has no body");
    assert.equal(
      noindexAfterRefresh.fetched_at.getTime(),
      beforeRow("noindex-page").fetched_at.getTime(),
      "the noindex row records no read",
    );

    // Fourth phase: the robots gate has to be bound to the publisher origin. An
    // answer served by a different approved origin, for example through a www
    // redirect, may not authorise this publisher's pages, while an answer served
    // directly by the queried origin still does.
    transport.requestedUrls.length = 0;
    const redirectedPublisherUrl = "https://keskkonnaagentuur.ee/et/mets/robots-piir";
    const redirectedRobotsUrl = "https://keskkonnaagentuur.ee/robots.txt";
    const redirectTargetRobotsUrl = "https://www.keskkonnaagentuur.ee/robots.txt";
    const controlPublisherUrl = "https://keskkonnaharidus.ee/et/mets/robots-kontroll";
    const controlRobotsUrl = "https://keskkonnaharidus.ee/robots.txt";
    const redirectedPage = portalPage("Robots piir", "See lehekülg kuulub teisele avaldajale ja seda ei tohi lugeda võõra robots.txt loa põhjal.");
    const controlPage = portalPage("Robots kontroll", "See lehekülg kuulub samale avaldajale ja seda tohib lugeda sama originiga robots.txt loa põhjal.");
    transport.responses.set(redirectedRobotsUrl, { status: 301, location: redirectTargetRobotsUrl });
    transport.responses.set(redirectTargetRobotsUrl, { status: 200, contentType: "text/plain", body: "User-agent: *\nAllow: /\n" });
    transport.responses.set(controlRobotsUrl, { status: 200, contentType: "text/plain", body: "User-agent: *\nAllow: /\n" });
    transport.responses.set(redirectedPublisherUrl, { status: 200, contentType: "text/html; charset=utf-8", body: redirectedPage });
    transport.responses.set(controlPublisherUrl, { status: 200, contentType: "text/html; charset=utf-8", body: controlPage });
    for (const [externalId, url, title] of [
      ["fixture-robots-redirected", redirectedPublisherUrl, "Fixture robots redirected"],
      ["fixture-robots-control", controlPublisherUrl, "Fixture robots control"],
    ]) {
      await insertRow(admin, {
        externalId,
        url,
        title,
        content: "",
        contentHash: sha256(""),
        fetchedAt: new Date(Date.now() - 60 * DAY_MS).toISOString(),
        metadata: {},
      });
    }
    const fourthRunStartedAt = Date.now();
    const fourthRun = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    const fourthRunPages = [...new Set(transport.requestedUrls)]
      .filter((href) => !href.endsWith("/robots.txt"));
    assert.ok(
      !fourthRunPages.includes(redirectedPublisherUrl),
      "a robots.txt answered by another approved origin must not authorise this publisher's page",
    );
    assert.ok(
      fourthRunPages.includes(controlPublisherUrl),
      "a robots.txt answered directly by the queried origin still authorises that origin's page",
    );
    assert.deepEqual([...fourthRunPages].sort(), [controlPublisherUrl], "only the page whose own origin answered robots.txt is read");
    assert.ok(
      transport.requestedUrls.includes(redirectTargetRobotsUrl),
      "the cross origin robots redirect is followed, so this phase exercises the origin binding instead of a blocked transport",
    );
    assert.equal(fourthRun.remainingChecked, 2, "both body-less rows are due");
    assert.equal(fourthRun.hydrated, 1, "only the page with an own-origin robots answer yields a body");
    assert.equal(fourthRun.errors, 1, "the cross origin robots answer refuses the other publisher");
    assert.equal(fourthRun.skipped, 0, "no due row is skipped");
    const afterFourthRun = await readRows(admin);
    const refused = afterFourthRun.get(redirectedPublisherUrl);
    assert.equal(refused.content, "", "the refused page is not read, so it keeps no body");
    assert.equal(refused.metadata.hydrated, undefined, "the refused page is not marked hydrated");
    assert.equal(refused.is_available, true, "the refused page stays available as a route");
    assert.ok(refused.fetched_at.getTime() >= fourthRunStartedAt - 5_000, "the refused page records the attempt");
    assert.equal(corpus.publicSearchItem(refused, true)._answerEvidenceEligible, false, "the refused page is never answer evidence");
    const hydratedControl = afterFourthRun.get(controlPublisherUrl);
    const controlPageContent = corpus.extractReadablePage(controlPage, controlPublisherUrl).content;
    assert.equal(hydratedControl.content, controlPageContent, "the own-origin page stores its freshly read body");
    assert.equal(hydratedControl.content_hash, sha256(controlPageContent), "the own-origin body carries its version hash");
    assert.equal(corpus.publicSearchItem(hydratedControl, true)._answerEvidenceEligible, true, "the own-origin page becomes citable evidence");

    // Fifth phase: the backlog settles robots.txt for the URL it was given, and
    // the transport may then follow an approved same-resource redirect from the
    // publisher's bare host to its www host. The destination origin's own policy
    // decides whether that page may be read, so a page the destination disallows
    // keeps no body, is never marked hydrated and never becomes evidence, while a
    // page the destination allows hydrates exactly as it did before.
    transport.requestedUrls.length = 0;
    const destinationPolicyUrl = `${FIXTURE_ORIGIN}/uudised/sihtkoha-piir`;
    const destinationTargetUrl = "https://www.keskkonnaportaal.ee/uudised/sihtkoha-piir";
    const destinationTargetRobotsUrl = "https://www.keskkonnaportaal.ee/robots.txt";
    const allowedDestinationUrl = `${FIXTURE_ORIGIN}/uudised/lubatud-sihtkoht`;
    const allowedDestinationTargetUrl = "https://www.keskkonnaportaal.ee/uudised/lubatud-sihtkoht";
    const deniedDestinationPage = portalPage(
      "Sihtkoha piir",
      "Selle lehekülje keha pärineb aadressilt, mille enda robots.txt keelab selle lugemise, seega ei tohi seda keha salvestada ega tsiteerida.",
    );
    const allowedDestinationPage = portalPage(
      "Sihtkoha luba",
      "Selle lehekülje keha pärineb aadressilt, mille enda robots.txt lubab selle lugemise, seega võib selle keha salvestada ja tsiteerida.",
    );
    transport.responses.set(destinationPolicyUrl, { status: 302, location: destinationTargetUrl });
    transport.responses.set(allowedDestinationUrl, { status: 301, location: allowedDestinationTargetUrl });
    transport.responses.set(destinationTargetRobotsUrl, {
      status: 200,
      contentType: "text/plain",
      body: "User-agent: *\nDisallow: /uudised/sihtkoha-piir\n",
    });
    transport.responses.set(destinationTargetUrl, { status: 200, contentType: "text/html; charset=utf-8", body: deniedDestinationPage });
    transport.responses.set(allowedDestinationTargetUrl, { status: 200, contentType: "text/html; charset=utf-8", body: allowedDestinationPage });
    for (const [externalId, url, title] of [
      ["fixture-destination-robots-denied", destinationPolicyUrl, "Fixture destination robots denied"],
      ["fixture-destination-robots-allowed", allowedDestinationUrl, "Fixture destination robots allowed"],
    ]) {
      await insertRow(admin, {
        externalId,
        url,
        title,
        content: "",
        contentHash: sha256(""),
        fetchedAt: new Date(Date.now() - 60 * DAY_MS).toISOString(),
        metadata: {},
      });
    }
    const fifthRunStartedAt = Date.now();
    const fifthRun = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    const fifthRunPages = [...new Set(transport.requestedUrls)]
      .filter((href) => !href.endsWith("/robots.txt"));
    assert.equal(fifthRun.status, "ready", "the backlog pass itself must complete");
    assert.ok(
      !fifthRunPages.includes(destinationTargetUrl),
      "a page its redirect destination disallows must not be requested at that destination",
    );
    assert.ok(
      transport.requestedUrls.includes(destinationTargetRobotsUrl),
      "the destination origin's own robots.txt is read before the redirect is followed",
    );
    assert.ok(
      fifthRunPages.includes(allowedDestinationTargetUrl),
      "a page its redirect destination allows is still read at that destination",
    );
    assert.equal(fifthRun.remainingChecked, 2, "both body-less rows are due");
    assert.equal(fifthRun.hydrated, 1, "only the page the destination allows yields a body");

    const afterFifthRun = await readRows(admin);
    const refusedDestination = afterFifthRun.get(destinationPolicyUrl);
    assert.equal(refusedDestination.content, "", "the disallowed destination leaves no body behind");
    assert.equal(refusedDestination.metadata.hydrated, undefined, "the refused page is not marked hydrated");
    assert.equal(refusedDestination.is_available, true, "the refused page stays available as a route");
    assert.ok(refusedDestination.fetched_at.getTime() >= fifthRunStartedAt - 5_000, "the refused page records the attempt");
    assert.equal(
      corpus.publicSearchItem(refusedDestination, true)._answerEvidenceEligible,
      false,
      "the refused page is never answer evidence",
    );

    const hydratedDestination = afterFifthRun.get(allowedDestinationUrl);
    const allowedDestinationContent = corpus.extractReadablePage(allowedDestinationPage, allowedDestinationUrl).content;
    assert.equal(hydratedDestination.content, allowedDestinationContent, "the allowed destination stores its freshly read body");
    assert.equal(hydratedDestination.content_hash, sha256(allowedDestinationContent), "the allowed body carries its version hash");
    assert.equal(hydratedDestination.metadata.hydrated, true, "the allowed destination is marked hydrated");
    assert.equal(
      corpus.publicSearchItem(hydratedDestination, true)._answerEvidenceEligible,
      true,
      "the allowed destination becomes citable evidence",
    );

    // Sixth phase: an absent robots.txt is not a failed read. Only 404 and 410
    // state that the origin published no policy file, so there is no rule to
    // obey and the page has to hydrate exactly as an empty policy allows. The
    // live reader already reads the status that way, while fetchCorpusText
    // reports every non 2xx answer as a transport failure, so the crawler skips
    // a publisher who simply has no robots.txt. The answer still has to come
    // from the origin that was asked: a robots.txt that redirects to another
    // origin and is answered 404 or 410 there says nothing about the requested
    // origin, and every other non 2xx answer is about the reader rather than
    // about the file, so both of those stay closed. Each origin carries exactly
    // one cached policy verdict per process, so every case below gets its own
    // approved publisher.
    transport.requestedUrls.length = 0;
    const policyCases = [
      {
        key: "own-404",
        label: "a robots.txt that answers 404 on its own origin",
        origin: "https://keskkonnaamet.ee",
        path: "/et/mets/robots-puudub",
        robots: { status: 404 },
        expected: "hydrated",
      },
      {
        key: "own-410",
        label: "a robots.txt that answers 410 on its own origin",
        origin: "https://kliimaministeerium.ee",
        path: "/et/mets/robots-kadunud",
        robots: { status: 410 },
        expected: "hydrated",
      },
      {
        key: "foreign-404",
        label: "a robots.txt that redirects to another origin and answers 404 there",
        origin: "https://rmk.ee",
        path: "/et/mets/robots-voorsilt-puudub",
        robots: { status: 301, location: "https://www.rmk.ee/robots.txt" },
        foreignRobotsUrl: "https://www.rmk.ee/robots.txt",
        foreignRobots: { status: 404 },
        expected: "closed",
      },
      {
        key: "foreign-410",
        label: "a robots.txt that redirects to another origin and answers 410 there",
        origin: "https://stat.ee",
        path: "/et/mets/robots-voorsilt-kadunud",
        robots: { status: 302, location: "https://www.stat.ee/robots.txt" },
        foreignRobotsUrl: "https://www.stat.ee/robots.txt",
        foreignRobots: { status: 410 },
        expected: "closed",
      },
      {
        key: "own-503",
        label: "a robots.txt that answers 503",
        origin: "https://terviseamet.ee",
        path: "/et/mets/robots-hoivatud",
        robots: { status: 503 },
        expected: "closed",
      },
    ].map((entry) => ({
      ...entry,
      pageUrl: `${entry.origin}${entry.path}`,
      robotsUrl: `${entry.origin}/robots.txt`,
      body: portalPage(
        `Robots ${entry.key}`,
        "See lehekülg kuulub avaldajale, kelle robots.txt ei ole tavalisel viisil loetav ja mille lehe lugemine sõltub sellest, kuidas puuduv või kättesaamatu policy fail tõlgendatakse.",
      ),
    }));
    for (const policyCase of policyCases) {
      transport.responses.set(policyCase.robotsUrl, {
        status: policyCase.robots.status,
        contentType: "text/plain",
        ...(policyCase.robots.location ? { location: policyCase.robots.location } : {}),
      });
      if (policyCase.foreignRobotsUrl) {
        transport.responses.set(policyCase.foreignRobotsUrl, {
          status: policyCase.foreignRobots.status,
          contentType: "text/plain",
        });
      }
      transport.responses.set(policyCase.pageUrl, {
        status: 200,
        contentType: "text/html; charset=utf-8",
        body: policyCase.body,
      });
      await insertRow(admin, {
        externalId: `fixture-${policyCase.key}`,
        url: policyCase.pageUrl,
        title: `Fixture ${policyCase.key}`,
        content: "",
        contentHash: sha256(""),
        fetchedAt: new Date(Date.now() - 60 * DAY_MS).toISOString(),
        metadata: {},
      });
    }
    const sixthRunStartedAt = Date.now();
    const sixthRun = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    const sixthRequests = [...transport.requestedUrls];
    t.diagnostic(`robots status requests: ${sixthRequests.join(" | ")}`);
    const sixthPages = [...new Set(sixthRequests.filter((href) => !href.endsWith("/robots.txt")))];
    assert.equal(sixthRun.status, "ready", "the policy pass itself must complete");
    assert.equal(sixthRun.remainingChecked, policyCases.length, "every body-less row with an unknown policy verdict is checked");
    assert.equal(sixthRun.hydrated, 2, "both rows whose own origin published no policy file are hydrated");
    assert.equal(sixthRun.errors, 3, "the foreign and the unavailable policy answers leave their rows unread");
    assert.equal(sixthRun.skipped, 0, "no due row is skipped");
    const afterSixthRun = await readRows(admin);
    for (const policyCase of policyCases) {
      const policyRow = afterSixthRun.get(policyCase.pageUrl);
      assert.ok(sixthRequests.includes(policyCase.robotsUrl), `${policyCase.label}: its policy is read`);
      if (policyCase.expected === "hydrated") {
        assert.ok(
          sixthPages.includes(policyCase.pageUrl),
          `${policyCase.label}: an absent policy file publishes no rule, so the page is read instead of the source being skipped`,
        );
        const policyContent = corpus.extractReadablePage(policyCase.body, policyCase.pageUrl).content;
        assert.equal(policyRow.content, policyContent, `${policyCase.label}: the page body is stored`);
        assert.equal(policyRow.content_hash, sha256(policyContent), `${policyCase.label}: the stored body carries its version hash`);
        assert.equal(policyRow.metadata.hydrated, true, `${policyCase.label}: the row is marked hydrated`);
        assert.equal(
          corpus.publicSearchItem(policyRow, true)._answerEvidenceEligible,
          true,
          `${policyCase.label}: the row becomes citable evidence`,
        );
      } else {
        assert.ok(
          !sixthPages.includes(policyCase.pageUrl),
          `${policyCase.label}: the source stays closed, so the page is not requested`,
        );
        assert.equal(policyRow.content, "", `${policyCase.label}: the closed row keeps no body`);
        assert.equal(policyRow.metadata.hydrated, undefined, `${policyCase.label}: the closed row is not marked hydrated`);
        assert.equal(policyRow.is_available, true, `${policyCase.label}: the closed row stays available as a route`);
        assert.ok(policyRow.fetched_at.getTime() >= sixthRunStartedAt - 5_000, `${policyCase.label}: the closed row records the attempt`);
        assert.equal(
          corpus.publicSearchItem(policyRow, true)._answerEvidenceEligible,
          false,
          `${policyCase.label}: the closed row is never answer evidence`,
        );
        if (policyCase.foreignRobotsUrl) {
          assert.ok(
            sixthRequests.includes(policyCase.foreignRobotsUrl),
            `${policyCase.label}: the approved redirect is followed, so the closed verdict comes from the foreign answer and not from a refused transport`,
          );
        }
      }
    }

    // Seventh phase: a witness that cannot bind to this row is no witness. A null
    // policy, an unknown version, another resource or another body version all
    // leave the stored body uncitable, so those rows must be re-read. A
    // well-formed expired publisher decision is not retried immediately, because
    // re-reading usually returns the same date; it waits for the age schedule. A
    // recent failed attempt still holds its row inside the cooldown.
    transport.requestedUrls.length = 0;
    const brokenWitnessAt = new Date(Date.now() - 2 * DAY_MS).toISOString();
    const brokenBody = "Varasemalt loetud ametlik lehekülg, mille tunnistus ei seostu selle kehaga ja mida seetõttu ei tohi enne uut lugemist tsiteerida.";
    const brokenPage = (label) => portalPage(
      `Tunnistuse ${label}`,
      "See lehekülg loeti uuesti, et salvestada selle kehaga seotud allika kasutusloa tunnistus.",
    );
    // Every shape that cannot bind, including the shapes whose fields are absent
    // or JSON null. Those compare as SQL NULL, so a predicate that is not total
    // would make them invisible to rehydration instead of due.
    const brokenCases = [
      { key: "puudub", build: null },
      { key: "tundmatu-versioon", build: (witness) => ({ ...witness, version: "source-policy-v0" }) },
      { key: "teine-resurss", build: (witness) => ({ ...witness, resourceKey: `${FIXTURE_ORIGIN}/et/mets/teine-resurss` }) },
      { key: "teine-keha", build: (witness) => ({ ...witness, artifactHash: sha256("muu-keha") }) },
      // A publisher witness without the hash of the bytes that were read is invalid
      // in JavaScript, so the row is route-only and must be re-read once the SQL
      // side agrees that this is not a usable witness.
      { key: "puudub-kehahash", build: (witness) => ({ ...witness, bodyHash: null }) },
      // The JavaScript validator refuses a whole witness when a legacy-unknown kind
      // carries any copy permission, so the row is route-only and must be re-read
      // once the SQL side agrees that this witness is not usable.
      // Every shape the JavaScript validator rejects. The first group is accepted
      // by the index gate today, the second is refused by it but still counts as
      // witnessed, so none of them is ever repaired without this selection rule.
      {
        key: "legacy-kasutus",
        build: (witness) => ({
          ...witness,
          contentKind: "legacy-unknown",
          use: { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: true },
        }),
      },
      { key: "osaline-kasutus", build: (witness) => ({ ...witness, use: { indexBody: true } }) },
      { key: "noarchive-keha", build: (witness) => ({ ...witness, directives: { ...witness.directives, noarchive: true } }) },
      { key: "nosnippet-luba", build: (witness) => ({ ...witness, directives: { ...witness.directives, nosnippet: true } }) },
      { key: "toend-ilma-lubata", build: (witness) => ({ ...witness, use: { ...witness.use, displaySnippet: false } }) },
      { key: "vigane-pikkus", build: (witness) => ({ ...witness, directives: { ...witness.directives, maxSnippetChars: "120" } }) },
      { key: "tuhi-juhised", build: (witness) => ({ ...witness, directives: {} }) },
      { key: "tuhi-robots", build: (witness) => ({ ...witness, robots: {} }) },
      // Delivery binds the witness through the canonical resource key it derives
      // from the row URL, so this row is citable even though the redundant
      // metadata field is missing. The index side cannot verify that binding
      // without the field, so the row is still read once, which records it.
      { key: "puudub-ressursivoti", build: (witness) => witness, omitResourceKey: true, citableBefore: true },
      { key: "puudub-artefaktirasi", build: (witness) => ({ ...witness, artifactHash: null }) },
      { key: "puudub-vaatlusaeg", build: (witness) => ({ ...witness, observedAt: null }) },
      { key: "tuhi-tunnistus", build: () => ({}) },
    ].map((entry) => {
      const url = `${FIXTURE_ORIGIN}/et/mets/tunnistus-${entry.key}`;
      const witness = entry.build === null
        ? null
        : entry.build(bodyWitness(url, brokenBody, brokenWitnessAt));
      return { ...entry, url, witness };
    });
    for (const entry of brokenCases) {
      transport.responses.set(entry.url, { status: 200, contentType: "text/html; charset=utf-8", body: brokenPage(entry.key) });
      await insertRow(admin, {
        externalId: `fixture-witness-${entry.key}`,
        url: entry.url,
        title: `Fixture witness ${entry.key}`,
        content: brokenBody,
        contentHash: sha256(brokenBody),
        fetchedAt: brokenWitnessAt,
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          // A property that exists but cannot bind is the state under test, so the
          // null case keeps the property rather than omitting it.
          source_policy: entry.witness,
          ...(entry.omitResourceKey ? {} : { sourceResourceKey: sourceResourceKey(entry.url) }),
        },
      });
    }
    // Valid restrictive witnesses. Both are legitimate policies that withhold some
    // use, so the witness predicate must treat them as usable and the pass must not
    // read them again.
    const restrictiveControls = [
      {
        key: "luba-noarchive",
        build: (url) => ({
          ...bodyWitness(url, brokenBody, brokenWitnessAt),
          directives: { ...bodyWitness(url, brokenBody, brokenWitnessAt).directives, noarchive: true },
          use: { retainBody: false, indexBody: true, displaySnippet: true, answerEvidence: false },
        }),
      },
      {
        key: "luba-nosnippet",
        build: (url) => ({
          ...bodyWitness(url, brokenBody, brokenWitnessAt),
          directives: { ...bodyWitness(url, brokenBody, brokenWitnessAt).directives, nosnippet: true },
          use: { retainBody: true, indexBody: false, displaySnippet: false, answerEvidence: false },
        }),
      },
      {
        // A large integer limit is legitimate: Number.isInteger(1e20) is true. The
        // fixture proves the SQL side does not impose a smaller arbitrary bound.
        key: "luba-suur-pikkus",
        build: (url) => {
          const witness = bodyWitness(url, brokenBody, brokenWitnessAt);
          return {
            ...witness,
            directives: { ...witness.directives, maxSnippetChars: 1e20 },
            use: { retainBody: true, indexBody: true, displaySnippet: true, answerEvidence: false },
          };
        },
      },
    ].map((entry) => {
      const url = `${FIXTURE_ORIGIN}/et/mets/tunnistus-${entry.key}`;
      return { ...entry, url, witness: entry.build(url) };
    });
    for (const control of restrictiveControls) {
      transport.responses.set(control.url, { status: 200, contentType: "text/html; charset=utf-8", body: brokenPage(control.key) });
      await insertRow(admin, {
        externalId: `fixture-witness-${control.key}`,
        url: control.url,
        title: `Fixture witness ${control.key}`,
        content: brokenBody,
        contentHash: sha256(brokenBody),
        fetchedAt: brokenWitnessAt,
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          source_policy: control.witness,
          sourceResourceKey: sourceResourceKey(control.url),
        },
      });
    }
    const expiredWitnessUrl = `${FIXTURE_ORIGIN}/et/mets/tunnistus-aegunud`;
    const validWitnessUrl = `${FIXTURE_ORIGIN}/et/mets/tunnistus-kehtiv`;
    const cooldownWitnessUrl = `${FIXTURE_ORIGIN}/et/mets/tunnistus-ootepaev`;
    const expiredWitness = {
      ...bodyWitness(expiredWitnessUrl, brokenBody, brokenWitnessAt),
      directives: {
        ...bodyWitness(expiredWitnessUrl, brokenBody, brokenWitnessAt).directives,
        unavailableAfter: new Date(Date.now() - 3_600_000).toISOString(),
      },
    };
    for (const [externalId, url, witness, extra] of [
      ["fixture-witness-expired", expiredWitnessUrl, expiredWitness, {}],
      ["fixture-witness-valid", validWitnessUrl, bodyWitness(validWitnessUrl, brokenBody, brokenWitnessAt), {}],
      ["fixture-witness-cooldown", cooldownWitnessUrl, null, {
        hydration_attempted_at: new Date(Date.now() - DAY_MS).toISOString(),
      }],
    ]) {
      transport.responses.set(url, { status: 200, contentType: "text/html; charset=utf-8", body: brokenPage(externalId) });
      await insertRow(admin, {
        externalId,
        url,
        title: `Fixture ${externalId}`,
        content: brokenBody,
        contentHash: sha256(brokenBody),
        fetchedAt: brokenWitnessAt,
        metadata: {
          hydrated: true,
          source_kind: "official-page-hydration",
          source_policy: witness,
          sourceResourceKey: sourceResourceKey(url),
          ...extra,
        },
      });
    }

    const beforeSeventhRun = await readRows(admin);
    for (const entry of brokenCases) {
      const item = corpus.publicSearchItem(beforeSeventhRun.get(entry.url), true);
      if (entry.citableBefore) {
        // The witness names the canonical resource key itself, so delivery can bind
        // it without the redundant metadata field.
        assert.equal(item.evidencePolicy, "versioned", `a witness bound through its own resource key (${entry.key}) is citable`);
        assert.equal(item._answerEvidenceEligible, true, `a witness bound through its own resource key (${entry.key}) is evidence`);
        continue;
      }
      assert.equal(
        item.evidencePolicy,
        "route-only",
        `a witness that cannot bind to this row (${entry.key}) authorises no copied text`,
      );
      assert.equal(item._answerEvidenceEligible, false, `a witness that cannot bind to this row (${entry.key}) is not evidence`);
    }
    assert.equal(
      corpus.publicSearchItem(beforeSeventhRun.get(expiredWitnessUrl), true)._answerEvidenceEligible,
      false,
      "an expired publisher decision is route-only",
    );
    assert.equal(
      corpus.publicSearchItem(beforeSeventhRun.get(validWitnessUrl), true)._answerEvidenceEligible,
      true,
      "the control row with a bound witness starts citable",
    );

    const seventhRun = await corpus.hydrateCorpusBacklog({ limit: 20, concurrency: 1, delayMs: 0 });
    const seventhPages = [...new Set(transport.requestedUrls
      .filter((href) => href.startsWith(FIXTURE_ORIGIN) && !href.endsWith("/robots.txt")))];
    assert.equal(seventhRun.status, "ready", "the witness pass itself must complete");
    assert.deepEqual(
      [...seventhPages].sort(),
      brokenCases.map((entry) => entry.url).sort(),
      "only bodies whose witness cannot bind are re-read",
    );
    assert.ok(
      !seventhPages.includes(expiredWitnessUrl),
      "an expired publisher decision waits for the age schedule instead of looping immediately",
    );
    assert.ok(!seventhPages.includes(validWitnessUrl), "a bound fresh witness needs no read");
    assert.ok(!seventhPages.includes(cooldownWitnessUrl), "a recent failed attempt keeps its cooldown");

    const afterSeventhRun = await readRows(admin);
    for (const entry of brokenCases) {
      const item = corpus.publicSearchItem(afterSeventhRun.get(entry.url), true);
      assert.equal(
        item.evidencePolicy,
        "versioned",
        `a mismatched body (${entry.key}) becomes citable only after a successful fresh read`,
      );
      assert.equal(item._answerEvidenceEligible, true, `a mismatched body (${entry.key}) is evidence after its own read`);
      assert.notEqual(afterSeventhRun.get(entry.url).metadata.source_policy, null, `a re-read stores a bound witness (${entry.key})`);
    }
    assert.equal(
      corpus.publicSearchItem(afterSeventhRun.get(expiredWitnessUrl), true)._answerEvidenceEligible,
      false,
      "an expired decision keeps its body route-only until the age schedule reads it again",
    );
    assert.equal(
      corpus.publicSearchItem(afterSeventhRun.get(validWitnessUrl), true).evidencePolicy,
      "versioned",
      "the control row keeps its bound witness",
    );
    for (const control of restrictiveControls) {
      assert.ok(
        !seventhPages.includes(control.url),
        `a valid restrictive witness (${control.key}) must not be retried`,
      );
      assert.equal(
        corpus.publicSearchItem(afterSeventhRun.get(control.url), true).evidencePolicy,
        "route-only",
        `a valid restrictive witness (${control.key}) withholds copied use but stays witnessed`,
      );
    }

  } finally {
    if (admin) await admin.end().catch(() => undefined);
    transport?.restore();
    // Removal is attempted only for a container this run actually created. When
    // the start failed, for example because the name is already taken, no id is
    // returned and nothing is deleted: a name collision must never remove someone
    // else's container.
    if (createdContainerId) {
      const containerRemoved = removeContainer(createdContainerId);
      t.diagnostic(`temporary PostgreSQL container ${containerName} (${createdContainerId}): ${containerRemoved ? "removed" : "STILL PRESENT"}`);
    } else {
      t.diagnostic(`temporary PostgreSQL container ${containerName}: not created by this run, nothing removed`);
    }
  }
});
