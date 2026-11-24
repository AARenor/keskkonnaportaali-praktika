import assert from "node:assert/strict";
import test from "node:test";
import { registerHooks } from "node:module";

import { observeSourcePolicy } from "../server/source_policy.mjs";
// The audit is the read-only proof that every URL advertised by the approved
// public sitemaps is in the database and carries body text. These tests drive
// it with an injected crawler and an injected database client, so nothing here
// opens a socket or reaches a production database.

// Recorded before the audit module is loaded: a resolve of the sitemap crawler
// module means the audit reached for a network source, which a database-only
// run must never do.
const corpusFetchResolutions = [];
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.includes("corpus_fetch")) corpusFetchResolutions.push(specifier);
    return nextResolve(specifier, context);
  },
});
// The standalone audit environment holds no search secret. The crawler module
// reaches server/database.mjs, which validates SEARCH_HASH_SECRET, so loading it
// eagerly would break the default run.
delete process.env.SEARCH_HASH_SECRET;

const {
  EXIT_COVERAGE_GAP,
  parseAuditArgs,
  runDatabaseAudit,
} = await import("../scripts/audit-corpus-coverage.mjs");

const NOW = new Date("2026-11-24T12:00:00.000Z");
const FRESH = new Date("2026-11-24T09:00:00.000Z");
const STALE = new Date("2026-11-18T09:00:00.000Z");

const PORTAL_DOCS = [
  "https://keskkonnaportaal.ee/et/teemad/mets",
  "https://keskkonnaportaal.ee/et/teemad/vesi",
];
const AGENTUUR_DOCS = [
  "https://keskkonnaagentuur.ee/uudised/ilmaennustus",
  "https://keskkonnaagentuur.ee/teenused/keskkonnaluba",
];
const AMET_DOCS = ["https://keskkonnaamet.ee/uudised/luba"];

const OFFICIAL_SOURCES = [
  { url: "https://keskkonnaagentuur.ee/sitemap.xml", sourceKey: "official-sitemap" },
  { url: "https://keskkonnaamet.ee/sitemap.xml", sourceKey: "official-sitemap" },
];

const PORTAL_ID = "portal-sitemap";
const AGENTUUR_ID = "official-sitemap:keskkonnaagentuur.ee";
const AMET_ID = "official-sitemap:keskkonnaamet.ee";

function fakeCrawlers({ portal = PORTAL_DOCS, official = {}, officialResult } = {}) {
  const calls = [];
  return {
    calls,
    async crawlPortalSitemap(options) {
      calls.push({ kind: "portal", options });
      if (portal instanceof Error) throw portal;
      return { documents: portal.map((url) => ({ url })), pages: portal.length ? 2 : 0 };
    },
    async crawlOfficialSitemap({ url, sourceKey } = {}) {
      calls.push({ kind: "official", url, sourceKey });
      if (officialResult) return officialResult;
      const entry = official[url];
      if (entry instanceof Error) throw entry;
      const documents = entry ?? (url.includes("keskkonnaagentuur") ? AGENTUUR_DOCS : AMET_DOCS);
      return { documents: documents.map((value) => ({ url: value })), pages: documents.length ? 1 : 0, sitemaps: 1 };
    },
  };
}
function sourcePolicy(url, { directives = "", robotsStatus = "allowed", observedAt = FRESH.toISOString() } = {}) {
  return observeSourcePolicy({
    requestedUrl: url,
    finalUrl: url,
    observedAt,
    contentKind: "fetched-html",
    bodyHash: "a".repeat(64),
    artifactHash: "b".repeat(64),
    robotsObservation: {
      status: robotsStatus,
      origin: new URL(url).origin,
      checkedAt: observedAt,
    },
    html: `<!doctype html><html><head><meta name="robots" content="${directives}"></head><body><p>Available page</p></body></html>`,
    headerInstances: [],
  });
}

function hostOf(value) {
  try {
    return new URL(value).hostname.toLocaleLowerCase("en");
  } catch {
    return "unknown";
  }
}

function groupRows(rows, keyOf) {
  const groups = new Map();
  for (const row of rows) {
    const key = keyOf(row);
    const entry = groups.get(key) ?? { total: 0, available: 0, hydrated: 0, empty: 0 };
    entry.total += 1;
    if (row.is_available) entry.available += 1;
    if (row.content !== "") entry.hydrated += 1;
    else entry.empty += 1;
    groups.set(key, entry);
  }
  return groups;
}

// The fake answers the audit's own statements: the unchanged coverage queries
// from practice_corpus_documents, the URL presence lookup, and the per-source
// database-only lookup. Any other statement is a bug in the audit.
function createFakeClient(rows) {
  const statements = [];
  const client = {
    statements,
    async query(sql, params = []) {
      const text = String(sql);
      statements.push({ sql: text, params });
      const trimmed = text.trim();
      if (/^(?:BEGIN|COMMIT|ROLLBACK)\b/iu.test(trimmed) || /^SET LOCAL\b/iu.test(trimmed)) {
        return { rows: [] };
      }
      if (text.includes("official_sitemap_missing_content")) {
        const hydrated = rows.filter((row) => row.content !== "").length;
        return {
          rows: [{
            total: rows.length,
            available: rows.filter((row) => row.is_available).length,
            hydrated,
            empty: rows.length - hydrated,
            official_sitemap_missing_content: rows.filter(
              (row) => row.source_key === "official-sitemap" && row.content === "",
            ).length,
          }],
        };
      }
      if (text.includes("GROUP BY source_key")) {
        return {
          rows: [...groupRows(rows, (row) => row.source_key)]
            .map(([sourceKey, value]) => ({ source_key: sourceKey, ...value })),
        };
      }
      if (text.includes("GROUP BY host")) {
        return {
          rows: [...groupRows(rows, (row) => hostOf(row.canonical_url))]
            .map(([host, value]) => ({ host, ...value })),
        };
      }
      if (text.includes("GROUP BY source_tier")) {
        return {
          rows: [...groupRows(rows, (row) => row.source_tier ?? "other")]
            .map(([sourceTier, value]) => ({ source_tier: sourceTier, total: value.total, hydrated: value.hydrated })),
        };
      }
      if (text.includes("practice_corpus_runs")) return { rows: [] };
      if (text.includes("has_content")) {
        const wanted = new Set(params[0] ?? []);
        return {
          rows: rows
            .filter((row) => wanted.has(row.canonical_url))
            .map((row) => ({
              canonical_url: row.canonical_url,
              is_available: row.is_available !== false,
              robots_noindex: row.robots_noindex === true || row.metadata?.robots_noindex === true,
              source_policy: row.metadata?.source_policy ?? null,
              source_resource_key: row.metadata?.sourceResourceKey ?? null,
              fetched_at: row.fetched_at ?? null,
              content_hash: row.content_hash ?? null,
              retained: row.metadata?.retained ?? null,
              has_content: row.content !== "",
              last_seen_at: row.last_seen_at,
            })),
        };
      }
      if (text.includes("source_key = ANY($1::TEXT[])") && text.includes("COUNT(*)")) {
        const keys = new Set(params[0] ?? []);
        const hosts = new Set(params[1] ?? []);
        const advertised = new Set(params[2] ?? []);
        const matches = [...new Set(rows
          .filter((row) => keys.has(row.source_key) && hosts.has(hostOf(row.canonical_url)))
          .map((row) => row.canonical_url)
          .filter((url) => !advertised.has(url)))]
          .sort();
        return { rows: [{ total: matches.length, sample: matches.slice(0, params[3]) }] };
      }
      throw new Error(`fake client received an unexpected statement: ${trimmed.slice(0, 90)}`);
    },
    release() {},
  };
  return client;
}

function baseRows() {
  return [
    ...PORTAL_DOCS.map((url) => ({
      canonical_url: url, source_key: "portal-sitemap", content: "Portaali sisu", is_available: true, last_seen_at: FRESH,
    })),
    ...AGENTUUR_DOCS.map((url) => ({
      canonical_url: url, source_key: "official-sitemap", content: "Ametlik sisu", is_available: true, last_seen_at: FRESH,
    })),
    ...AMET_DOCS.map((url) => ({
      canonical_url: url, source_key: "official-sitemap", content: "Ametlik sisu", is_available: true, last_seen_at: FRESH,
    })),
  ];
}

async function audit({ rows = baseRows(), argv, crawlers = fakeCrawlers(), officialSources, deadlineMs } = {}) {
  const client = createFakeClient(rows);
  const outcome = await runDatabaseAudit({
    client,
    argv,
    now: NOW,
    crawlers,
    officialSources: officialSources ?? OFFICIAL_SOURCES,
    deadlineMs,
  });
  return { ...outcome, client };
}

function sourceOf(report, id) {
  const source = report.publicSitemapCoverage.sources.find((entry) => entry.id === id);
  assert.ok(source, `expected a report for ${id}`);
  return source;
}

// No statement may write, and the transaction has to say READ ONLY.
function assertReadOnly(statements) {
  for (const statement of statements) {
    assert.doesNotMatch(
      statement.sql,
      /\b(?:INSERT|UPDATE|DELETE|MERGE|CREATE|ALTER|DROP|TRUNCATE|GRANT|REVOKE|COPY)\b/iu,
    );
  }
  assert.match(statements[0].sql.trim(), /^BEGIN TRANSACTION READ ONLY$/u);
  assert.ok(statements.some((statement) => /^SET LOCAL statement_timeout/iu.test(statement.sql.trim())));
  assert.ok(statements.some((statement) => statement.sql.trim() === "COMMIT"));
  assert.ok(!statements.some((statement) => statement.sql.trim() === "ROLLBACK"));
}

test("loads the sitemap crawler only when compare mode needs it", async () => {
  assert.equal(process.env.SEARCH_HASH_SECRET, undefined);
  assert.deepEqual(corpusFetchResolutions, []);

  // Default database-only path: no crawler injection, no compare flag.
  const client = createFakeClient(baseRows());
  const plain = await runDatabaseAudit({ client, argv: [], now: NOW });
  assert.equal(plain.exitCode, 0);
  assert.equal(plain.report.documents.total, baseRows().length);
  assert.deepEqual(corpusFetchResolutions, []);

  // Compare mode with both dependencies injected stays offline too.
  const injected = await audit({ argv: ["--compare-public"] });
  assert.equal(injected.report.publicSitemapCoverage.totals.discovered, 5);
  assert.deepEqual(corpusFetchResolutions, []);

  // Control: the hook sees a deliberate import, so the empty list above proves
  // laziness rather than a broken hook.
  await import("../server/corpus_fetch.mjs");
  assert.equal(corpusFetchResolutions.length, 1);
});

test("reports complete public coverage and exits zero", async () => {
  const rows = baseRows();
  rows.push({
    canonical_url: "https://keskkonnaportaal.ee/et/teemad/kliima",
    source_key: "portal-sitemap",
    content: "Kliima sisu",
    is_available: true,
    last_seen_at: FRESH,
  });
  const { report, exitCode, client } = await audit({
    rows,
    argv: ["--compare-public", "--fail-on-gap"],
  });

  const portal = sourceOf(report, PORTAL_ID);
  assert.equal(portal.discovered, 2);
  assert.equal(portal.present, 2);
  assert.equal(portal.missingFromDatabase, 0);
  assert.equal(portal.missingContent, 0);
  assert.equal(portal.staleLastSeen, 0);
  assert.equal(portal.databaseOnly, 1);
  assert.deepEqual(portal.samples.databaseOnly, ["https://keskkonnaportaal.ee/et/teemad/kliima"]);
  assert.deepEqual(portal.errors, []);

  assert.equal(sourceOf(report, AGENTUUR_ID).discovered, 2);
  assert.equal(sourceOf(report, AGENTUUR_ID).present, 2);
  assert.equal(sourceOf(report, AMET_ID).discovered, 1);
  assert.equal(sourceOf(report, AMET_ID).present, 1);

  assert.deepEqual(report.publicSitemapCoverage.totals, {
    sources: 3,
    sourcesWithErrors: 0,
    discovered: 5,
    present: 5,
    missingFromDatabase: 0,
    missingContent: 0,
    policyExcludedContent: 0,
    staleLastSeen: 0,
    databaseOnly: 1,
  });
  assert.equal(report.publicSitemapCoverage.gap.exceeded, false);
  assert.equal(exitCode, 0);

  assert.equal(report.documents.total, rows.length);
  assert.equal(report.documents.hydrated, rows.length);
  assert.equal(report.hydrationCoveragePercent, 100);
  assertReadOnly(client.statements);
});

test("flags an advertised URL that is absent from the database", async () => {
  const rows = baseRows().filter((row) => row.canonical_url !== AGENTUUR_DOCS[1]);
  const failing = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });

  const agentuur = sourceOf(failing.report, AGENTUUR_ID);
  assert.equal(agentuur.discovered, 2);
  assert.equal(agentuur.present, 1);
  assert.equal(agentuur.missingFromDatabase, 1);
  assert.deepEqual(agentuur.samples.missingFromDatabase, [AGENTUUR_DOCS[1]]);
  assert.equal(agentuur.databaseOnly, 0);
  assert.equal(failing.report.publicSitemapCoverage.gap.exceeded, true);
  assert.equal(failing.exitCode, EXIT_COVERAGE_GAP);
  assert.equal(EXIT_COVERAGE_GAP, 2);

  const gated = await audit({ rows, argv: ["--compare-public"] });
  assert.equal(gated.report.publicSitemapCoverage.totals.missingFromDatabase, 1);
  assert.equal(gated.exitCode, 0);
});

test("flags a present row whose body text is empty", async () => {
  const rows = baseRows().map((row) => (row.canonical_url === AMET_DOCS[0] ? { ...row, content: "" } : row));
  const { report, exitCode } = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });

  const amet = sourceOf(report, AMET_ID);
  assert.equal(amet.discovered, 1);
  assert.equal(amet.present, 1);
  assert.equal(amet.missingFromDatabase, 0);
  assert.equal(amet.missingContent, 1);
  assert.deepEqual(amet.samples.missingContent, [AMET_DOCS[0]]);
  assert.equal(report.publicSitemapCoverage.gap.missingContent, 1);
  assert.equal(report.publicSitemapCoverage.gap.exceeded, true);
  assert.equal(exitCode, EXIT_COVERAGE_GAP);
  assert.equal(report.documents.empty, 1);
  assert.equal(report.hydrationCoveragePercent, 80);
});

test("keeps an advertised retired row as a gated gap", async () => {
  const rows = baseRows().map(
    (row) => (row.canonical_url === PORTAL_DOCS[0]
      ? { ...row, content: "", is_available: false }
      : row),
  );
  const { report, exitCode } = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });

  const portal = sourceOf(report, PORTAL_ID);
  assert.equal(portal.present, 2);
  assert.equal(portal.missingFromDatabase, 0);
  assert.equal(portal.missingContent, 1);
  assert.equal(portal.policyExcludedContent, 0);
  assert.deepEqual(portal.samples.missingContent, [PORTAL_DOCS[0]]);
  assert.deepEqual(portal.samples.policyExcludedContent, []);
  assert.equal(report.publicSitemapCoverage.gap.missingContent, 1);
  assert.equal(report.publicSitemapCoverage.gap.exceeded, true);
  assert.equal(exitCode, EXIT_COVERAGE_GAP);
});

test("reports a robots_noindex row separately and still gates a real empty body", async () => {
  const rows = baseRows().map((row) => {
    if (row.canonical_url === AGENTUUR_DOCS[0]) return { ...row, content: "", robots_noindex: true };
    if (row.canonical_url === AGENTUUR_DOCS[1]) return { ...row, content: "" };
    return row;
  });
  const { report, exitCode } = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });

  const agentuur = sourceOf(report, AGENTUUR_ID);
  assert.equal(agentuur.present, 2);
  assert.equal(agentuur.missingFromDatabase, 0);
  assert.equal(agentuur.missingContent, 1);
  assert.deepEqual(agentuur.samples.missingContent, [AGENTUUR_DOCS[1]]);
  assert.equal(agentuur.policyExcludedContent, 1);
  assert.deepEqual(agentuur.samples.policyExcludedContent, [AGENTUUR_DOCS[0]]);
  assert.equal(report.publicSitemapCoverage.totals.missingContent, 1);
  assert.equal(report.publicSitemapCoverage.totals.policyExcludedContent, 1);
  assert.equal(report.publicSitemapCoverage.gap.exceeded, true);
  assert.equal(exitCode, EXIT_COVERAGE_GAP);
});

test("exempts an empty noarchive row only when its policy is valid and bound", async () => {
  const rows = baseRows().map((row) => {
    if (row.canonical_url !== AGENTUUR_DOCS[0]) return row;
    const policy = sourcePolicy(row.canonical_url, { directives: "noarchive" });
    return {
      ...row,
      content: "",
      fetched_at: FRESH,
      content_hash: "c".repeat(64),
      metadata: { retained: false, sourceResourceKey: policy.resourceKey, source_policy: policy },
    };
  });
  const permitted = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });
  const agentuur = sourceOf(permitted.report, AGENTUUR_ID);
  assert.equal(agentuur.missingContent, 0);
  assert.equal(agentuur.policyExcludedContent, 1);
  assert.deepEqual(agentuur.samples.policyExcludedContent, [AGENTUUR_DOCS[0]]);
  assert.equal(permitted.report.publicSitemapCoverage.gap.exceeded, false);
  assert.equal(permitted.exitCode, 0);

  const malformed = baseRows().map((row) => {
    if (row.canonical_url !== AGENTUUR_DOCS[0]) return row;
    const policy = sourcePolicy(row.canonical_url, { directives: "noarchive" });
    return {
      ...row,
      content: "",
      fetched_at: FRESH,
      metadata: { retained: false, sourceResourceKey: policy.resourceKey, source_policy: { ...policy, version: "source-policy-v0" } },
    };
  });
  const rejected = await audit({ rows: malformed, argv: ["--compare-public", "--fail-on-gap"] });
  assert.equal(sourceOf(rejected.report, AGENTUUR_ID).missingContent, 1);
  assert.equal(sourceOf(rejected.report, AGENTUUR_ID).policyExcludedContent, 0);
  assert.equal(rejected.exitCode, EXIT_COVERAGE_GAP);

  const retained = baseRows().map((row) => {
    if (row.canonical_url !== AGENTUUR_DOCS[0]) return row;
    const policy = sourcePolicy(row.canonical_url, { directives: "noarchive" });
    return {
      ...row,
      content: "",
      fetched_at: FRESH,
      metadata: { retained: true, sourceResourceKey: policy.resourceKey, source_policy: policy },
    };
  });
  const retainedGap = await audit({ rows: retained, argv: ["--compare-public", "--fail-on-gap"] });
  assert.equal(sourceOf(retainedGap.report, AGENTUUR_ID).missingContent, 1);
  assert.equal(sourceOf(retainedGap.report, AGENTUUR_ID).policyExcludedContent, 0);
  assert.equal(retainedGap.exitCode, EXIT_COVERAGE_GAP);
});

test("gates a noarchive policy bound to another resource", async () => {
  const rows = baseRows().map((row) => {
    if (row.canonical_url !== AGENTUUR_DOCS[0]) return row;
    const policy = sourcePolicy(AGENTUUR_DOCS[1], { directives: "noarchive" });
    return {
      ...row,
      content: "",
      fetched_at: FRESH,
      metadata: { retained: false, sourceResourceKey: policy.resourceKey, source_policy: policy },
    };
  });
  const { report, exitCode } = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });
  const agentuur = sourceOf(report, AGENTUUR_ID);
  assert.equal(agentuur.missingContent, 1);
  assert.equal(agentuur.policyExcludedContent, 0);
  assert.deepEqual(agentuur.samples.missingContent, [AGENTUUR_DOCS[0]]);
  assert.equal(exitCode, EXIT_COVERAGE_GAP);
});

test("gates a noarchive policy whose observation does not match fetched_at", async () => {
  const rows = baseRows().map((row) => {
    if (row.canonical_url !== AGENTUUR_DOCS[0]) return row;
    const policy = sourcePolicy(row.canonical_url, { directives: "noarchive", observedAt: STALE.toISOString() });
    return {
      ...row,
      content: "",
      fetched_at: FRESH,
      metadata: { retained: false, sourceResourceKey: policy.resourceKey, source_policy: policy },
    };
  });
  const { report, exitCode } = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });
  const agentuur = sourceOf(report, AGENTUUR_ID);
  assert.equal(agentuur.missingContent, 1);
  assert.equal(agentuur.policyExcludedContent, 0);
  assert.deepEqual(agentuur.samples.missingContent, [AGENTUUR_DOCS[0]]);
  assert.equal(exitCode, EXIT_COVERAGE_GAP);
});

test("exempts an empty body denied by a validated robots policy", async () => {
  const rows = baseRows().map((row) => {
    if (row.canonical_url !== AMET_DOCS[0]) return row;
    const policy = sourcePolicy(row.canonical_url, { robotsStatus: "disallowed" });
    return {
      ...row,
      content: "",
      fetched_at: FRESH,
      metadata: { sourceResourceKey: policy.resourceKey, source_policy: policy },
    };
  });
  const { report, exitCode } = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });
  const amet = sourceOf(report, AMET_ID);
  assert.equal(amet.missingContent, 0);
  assert.equal(amet.policyExcludedContent, 1);
  assert.deepEqual(amet.samples.policyExcludedContent, [AMET_DOCS[0]]);
  assert.equal(report.publicSitemapCoverage.gap.exceeded, false);
  assert.equal(exitCode, 0);
});

test("reports a stale last_seen_at without failing the gate", async () => {
  const rows = baseRows().map(
    (row) => (row.canonical_url === AGENTUUR_DOCS[0] ? { ...row, last_seen_at: STALE } : row),
  );
  const fresh = await audit({ rows, argv: ["--compare-public", "--fail-on-gap"] });
  const agentuur = sourceOf(fresh.report, AGENTUUR_ID);
  assert.equal(agentuur.present, 2);
  assert.equal(agentuur.staleLastSeen, 1);
  assert.deepEqual(agentuur.samples.staleLastSeen, [AGENTUUR_DOCS[0]]);
  assert.equal(agentuur.missingFromDatabase, 0);
  assert.equal(agentuur.missingContent, 0);
  assert.equal(fresh.report.publicSitemapCoverage.gap.exceeded, false);
  assert.equal(fresh.exitCode, 0);

  const widened = await audit({ rows, argv: ["--compare-public", "--stale-hours", "240"] });
  assert.equal(sourceOf(widened.report, AGENTUUR_ID).staleLastSeen, 0);
});

test("keeps other sources when one sitemap fails, and records the error", async () => {
  const crawlers = fakeCrawlers({
    official: { [OFFICIAL_SOURCES[0].url]: new Error("sitemap fetch failed: 503") },
  });
  const { report, exitCode } = await audit({
    rows: baseRows(),
    argv: ["--compare-public", "--fail-on-gap"],
    crawlers,
  });

  const agentuur = sourceOf(report, AGENTUUR_ID);
  assert.deepEqual(agentuur.errors, ["sitemap fetch failed: 503"]);
  assert.equal(agentuur.discovered, 0);
  assert.equal(agentuur.missingFromDatabase, 0);
  assert.equal(agentuur.databaseOnly, 0);
  assert.equal(agentuur.pages, null);

  const portal = sourceOf(report, PORTAL_ID);
  assert.equal(portal.discovered, 2);
  assert.equal(portal.present, 2);
  assert.deepEqual(portal.errors, []);
  assert.equal(sourceOf(report, AMET_ID).present, 1);

  const coverage = report.publicSitemapCoverage;
  assert.equal(coverage.totals.sourcesWithErrors, 1);
  assert.equal(coverage.totals.discovered, 3);
  assert.equal(coverage.gap.sourcesWithErrors, 1);
  assert.equal(coverage.gap.exceeded, true);
  assert.equal(exitCode, EXIT_COVERAGE_GAP);

  const ungated = await audit({ rows: baseRows(), argv: ["--compare-public"], crawlers });
  assert.equal(ungated.exitCode, 0);
  assert.equal(ungated.report.publicSitemapCoverage.totals.sourcesWithErrors, 1);
});

test("gates a successful sitemap crawl that discovers no URLs", async () => {
  const crawlers = fakeCrawlers({ official: { [OFFICIAL_SOURCES[0].url]: [] } });
  const { report, exitCode } = await audit({
    rows: baseRows(),
    argv: ["--compare-public", "--fail-on-gap"],
    crawlers,
  });

  const agentuur = sourceOf(report, AGENTUUR_ID);
  assert.equal(agentuur.discovered, 0);
  assert.equal(agentuur.databaseOnly, 0);
  assert.deepEqual(agentuur.errors, ["Sitemap crawl succeeded but discovered no URLs"]);
  assert.equal(report.publicSitemapCoverage.totals.sourcesWithErrors, 1);
  assert.equal(report.publicSitemapCoverage.gap.exceeded, true);
  assert.equal(exitCode, EXIT_COVERAGE_GAP);

  const approvedSources = OFFICIAL_SOURCES.map((source, index) => (
    index === 0 ? { ...source, emptyUrlPolicy: "approved" } : source
  ));
  const approved = await audit({
    rows: baseRows(),
    argv: ["--compare-public", "--fail-on-gap"],
    crawlers,
    officialSources: approvedSources,
  });
  assert.deepEqual(sourceOf(approved.report, AGENTUUR_ID).errors, []);
  assert.equal(approved.report.publicSitemapCoverage.totals.sourcesWithErrors, 0);
  assert.equal(approved.exitCode, 0);
});

test("attributes hydrated and portal catalogue rows to their host source", async () => {
  const portalCatalogueUrl = "https://keskkonnaportaal.ee/et/teemad/raie";
  const hydratedUrl = "https://www.keskkonnaagentuur.ee/uudised/uuendus";
  const rows = [
    ...baseRows(),
    { canonical_url: portalCatalogueUrl, source_key: "portal-catalog", content: "Catalogue body", is_available: true, last_seen_at: FRESH },
    { canonical_url: hydratedUrl, source_key: "official-page-hydration", content: "Hydrated body", is_available: true, last_seen_at: FRESH },
  ];
  const { report } = await audit({ rows, argv: ["--compare-public"] });

  const portal = sourceOf(report, PORTAL_ID);
  assert.deepEqual(portal.sourceKeys, ["portal-sitemap", "portal-catalog", "official-page-hydration"]);
  assert.equal(portal.databaseOnly, 1);
  assert.deepEqual(portal.samples.databaseOnly, [portalCatalogueUrl]);

  const agentuur = sourceOf(report, AGENTUUR_ID);
  assert.deepEqual(agentuur.sourceKeys, ["official-sitemap", "official-page-hydration"]);
  assert.equal(agentuur.databaseOnly, 1);
  assert.deepEqual(agentuur.samples.databaseOnly, [hydratedUrl]);
});

test("bounds the databaseOnly query and keeps the exact count", async () => {
  const extra = Array.from({ length: 25 }, (_, index) => ({
    canonical_url: `https://keskkonnaportaal.ee/et/teemad/lisa-${index}`,
    source_key: "portal-sitemap",
    content: "Additional body",
    is_available: true,
    last_seen_at: FRESH,
  }));
  const { report, client } = await audit({ rows: [...baseRows(), ...extra], argv: ["--compare-public"] });
  const portal = sourceOf(report, PORTAL_ID);
  assert.equal(portal.databaseOnly, 25);
  assert.equal(portal.samples.databaseOnly.length, 10);

  const statement = client.statements.find((entry) => entry.sql.includes("COUNT(*)") && entry.sql.includes("source_key = ANY($1::TEXT[])"));
  assert.ok(statement);
  assert.match(statement.sql, /LIMIT \$4/u);
  assert.equal(statement.params[3], 10);
});

test("enforces one deadline across crawling and database work", async () => {
  const crawlers = {
    async crawlPortalSitemap() {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return { documents: PORTAL_DOCS.map((url) => ({ url })), pages: 2 };
    },
    async crawlOfficialSitemap({ url }) {
      const documents = url.includes("keskkonnaagentuur") ? AGENTUUR_DOCS : AMET_DOCS;
      return { documents: documents.map((value) => ({ url: value })), pages: 1 };
    },
  };
  await assert.rejects(
    () => audit({ argv: ["--compare-public"], crawlers, deadlineMs: 5 }),
    /audit deadline exceeded/u,
  );
});

test("keeps the database coverage output unchanged without --compare-public", async () => {
  const crawlers = fakeCrawlers();
  const plain = await audit({ argv: [], crawlers });
  assert.ok(!("publicSitemapCoverage" in plain.report));
  assert.equal(plain.report.documents.total, baseRows().length);
  assert.equal(plain.report.hydrationCoveragePercent, 100);
  assert.deepEqual(crawlers.calls, []);
  assert.equal(plain.exitCode, 0);

  const compared = await audit({ argv: ["--compare-public"], crawlers });
  const { publicSitemapCoverage, ...coverageOnly } = compared.report;
  assert.ok(publicSitemapCoverage);
  assert.deepEqual(coverageOnly, plain.report);
  assert.notDeepEqual(crawlers.calls, []);
});

test("parses only the documented flags", () => {
  assert.deepEqual(parseAuditArgs([]), {
    comparePublic: false,
    failOnGap: false,
    staleAfterHours: 24,
  });
  assert.deepEqual(parseAuditArgs(["--compare-public", "--fail-on-gap", "--stale-hours", "48"]), {
    comparePublic: true,
    failOnGap: true,
    staleAfterHours: 48,
  });
  assert.equal(parseAuditArgs(["--compare-public", "--stale-hours=12"]).staleAfterHours, 12);
  assert.throws(() => parseAuditArgs(["--nope"]), /Unknown argument/u);
  assert.throws(() => parseAuditArgs(["--fail-on-gap"]), /requires --compare-public/u);
  assert.throws(() => parseAuditArgs(["--compare-public", "--stale-hours"]), /stale-hours/u);
  assert.throws(() => parseAuditArgs(["--compare-public", "--stale-hours", "0"]), /stale-hours/u);
});
