import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { readFile } from "node:fs/promises";
import { Readable } from "node:stream";
import test from "node:test";
import {
  buildPrefixTsQuery,
  canonicalOfficialDiscoveryUrl,
  deduplicateCorpusDocuments,
  extractReadablePage,
  fetchCorpusText,
  hydrationResourceMatches,
  isApprovedCorpusRedirect,
  limitCorpusDocumentsByAggregateCapacity,
  limitOfficialDiscoveryDocuments,
  normalizeOfficialDiscoveryDocuments,
  planCorpusDocumentAdmission,
  CORPUS_OVERFLOW_DELETE_SQL,
  OFFICIAL_DISCOVERY_DELETE_SQL,
  OFFICIAL_DISCOVERY_RETIRE_SQL,
  PORTAL_UNAVAILABLE_DELETE_SQL,
  pageRobotsPolicy,
  parsePortalReportedTotal,
  parsePortalSearchPage,
  parsePortalSitemap,
  parsePortalSitemapPage,
  parseRobotsTxt,
  persistHydratedCorpusDocument,
  publicSearchItem,
  robotsAllowsUrl,
  shouldRetirePortalCatalog,
  summarizeUrlOccurrences,
} from "../server/corpus.mjs";
import { sourceEvidenceEligibility } from "../server/source-registry.mjs";
import * as corpus from "../server/corpus.mjs";

test("full corpus hydration includes sitemap-only pages but excludes files and external hosts", () => {
  assert.equal(typeof corpus.corpusHydrationCandidates, "function");
  assert.deepEqual(corpus.corpusHydrationCandidates([
    "https://keskkonnaportaal.ee/et/mets",
    "https://keskkonnaportaal.ee/et/mets",
    "https://keskkonnaportaal.ee/et/sitemap-only-seire",
    "https://keskkonnaportaal.ee/sites/default/files/aruanne.pdf",
    "https://keskkonnaportaal.ee/sites/default/files/andmed.xlsx",
    "https://example.test/leht",
    "http://keskkonnaportaal.ee/et/mets",
    "https://user:password@keskkonnaportaal.ee/et/mets",
  ]), ["https://keskkonnaportaal.ee/et/mets", "https://keskkonnaportaal.ee/et/sitemap-only-seire"]);
});

test("portal hydration preserves source dates and publisher without treating retrieval or prose dates as updates", () => {
  const page = extractReadablePage(`<main><h1>Puidubilanss</h1>
    <div class="publication-date-author"><span class="card-item__author">Andis välja <a>Keskkonnaagentuur</a></span>
    <span class="card-item__date">Avaldatud: 15.12.2021 / Uuendatud: 01.10.2026</span></div>
    <article><p>Puiduallikad ja kasutamine 2023. aastal.</p></article></main>`, "https://keskkonnaportaal.ee/et/puidubilanss");
  assert.equal(page.publishedAt, "2021-12-15");
  assert.equal(page.updatedAt, "2026-10-01");
  assert.equal(page.organization, "Keskkonnaagentuur");
  const missing = extractReadablePage(`<main><h1>Seire</h1><article><p>Aruanne uuendatud: 31.02.2026. Üritus 01.10.2026.</p></article></main>`, "https://keskkonnaportaal.ee/et/seire");
  assert.equal(missing.updatedAt, null);
  assert.equal(missing.publishedAt, null);
});

test("portal article extraction separates navigation and source metadata from claim passages", () => {
  const page = extractReadablePage(`<main><article><h1>Kuuse-kooreürask</h1>
    <div class="share_socials"><span>Jaga</span></div>
    <span class="card-item__label--type">Publikatsioonid</span>
    <div class="kem-page__field-kem-topic">Keskkonnaseire Mets</div>
    <div class="publication-date-author"><span class="card-item__author">Andis välja <a>Kliimaministeerium</a></span>
      <span class="card-item__date">Avaldatud: 19.04.2024 / Uuendatud: 27.05.2025</span></div>
    <p>Kuuse-kooreürask toitub koore niineosast ja põhjustab kuuskede kuivamist.</p>
    <p>Seotud juhendmaterjal: kahjustuse tuvastamine.</p></article></main>`, "https://keskkonnaportaal.ee/et/urask");
  assert.equal(page.organization, "Kliimaministeerium");
  assert.equal(page.publishedAt, "2024-04-19");
  assert.equal(page.updatedAt, "2025-05-27");
  assert.doesNotMatch(page.content, /Jaga|Publikatsioonid|Keskkonnaseire|Andis välja|Avaldatud|Uuendatud/u);
  assert.match(page.content, /niineosast[\s\S]*Seotud juhendmaterjal/u);
});

test("news without its own body cannot hydrate related cards or comment UI as factual evidence", () => {
  const related = `<section class="card-column-front"><h2>Samal teemal</h2><article class="kem-news--kem-content-page-block"><div class="field--name-field-kem-introduction">Kõrvalartikli pikk väide metsamaa, lindude ja kaitsealade kohta.</div></article></section>`;
  const comments = `<div class="card-item__info-wrap"><button class="card-item__button">Kommenteeri või avalda arvamust</button><div class="form-wrap"><form id="comment-form">Lisa kommentaar</form></div></div>`;
  const empty = extractReadablePage(`<main><h1>Juurepess</h1><article class="kem-news--full"><div class="card-item__info-wrapper">Keskkonnaagentuur | 15.01.2025</div>${comments}${related}<section class="rating-card-section">Palun hinnake</section></article></main>`, "https://keskkonnaportaal.ee/et/uudised/juurepess");
  assert.equal(empty.content, "");
  const own = "Juurepess kahjustab puude juuri. Käesolev väide pärineb artikli enda tekstist.";
  const article = extractReadablePage(`<main><h1>Juurepess</h1><article class="kem-news--full"><div class="field--name-body">${own}</div>${comments}${related}</article></main>`, "https://keskkonnaportaal.ee/et/uudised/juurepess");
  assert.equal(article.content, own);
});

test("comment controls sharing the article wrapper cannot delete the actual rich-text body", () => {
  const own = "Keskkonnaportaali kaardikiht annab ülevaate vee-ettevõtete teeninduspiirkondadest ja veeteenustest.";
  const html = `<main><h1>Veeteenused</h1><article><div class="card-item__info-wrap"><div class="field--name-field-kem-rich-text"><p>${own}</p></div><button class="card-item__button">Kommenteeri või avalda arvamust</button><div class="form-wrap"><form id="comment-form">Lisa kommentaar</form></div></div></article></main>`;
  assert.equal(extractReadablePage(html, "https://keskkonnaportaal.ee/et/uudised/veeteenused").content, own);
});

test("old news scaffold bodies stay route-only until clean hydration replaces them", () => {
  const row = { id: 123, title: "Juurepess", source_key: "official-page-hydration", canonical_url: "https://keskkonnaportaal.ee/et/uudised/juurepess", source_tier: "official", content_hash: "a".repeat(64), fetched_at: new Date().toISOString(), metadata: { hydrated: true, source_kind: "official-page-hydration" }, content: "Kommenteeri või avalda arvamust Lisa kommentaar Samal teemal Vaata kõiki Kõrvalartikli väide metsamaa ja liikide kohta.", summary: "Kommenteeri või avalda arvamust" };
  const item = publicSearchItem(row, true);
  assert.equal(item._answerEvidenceEligible, false);
  assert.equal(item.evidencePolicy, "route-only");
  assert.equal(item.content, "");
  assert.equal(item.summary, "");
  const clean = publicSearchItem({ ...row, summary: "Juurepess kahjustab puude juuri.", content: "Juurepess kahjustab puude juuri. See puu tervisliku seisundi selgitus pärineb artikli enda tekstist." }, true);
  assert.equal(clean._answerEvidenceEligible, true);
});

test("public corpus source exposes only explicit page update provenance, never sitemap or fetch time", () => {
  const row = { id: 1, source_key: "official-page-hydration", canonical_url: "https://keskkonnaportaal.ee/et/puidubilanss", title: "Puidubilanss", published_label: "15.12.2021", source_tier: "official", fetched_at: "2026-10-02T12:00:00Z", modified_at: "2026-10-02T10:00:00Z", metadata: { source_updated_at: "2026-10-01" } };
  assert.equal(publicSearchItem(row).updated, "01.10.2026");
  assert.equal(publicSearchItem({ ...row, metadata: {} }).updated, undefined);
  assert.equal(publicSearchItem({ ...row, metadata: { source_updated_at: "2026-02-31" } }).updated, undefined);
});

function mockCorpusHttpsRequest(responses, calls = []) {
  return (url, options, callback) => {
    const request = new EventEmitter();
    let response;
    request.end = () => queueMicrotask(() => {
      const spec = responses.shift();
      calls.push({ url: url.toString(), options });
      response = spec.stream || Readable.from(spec.chunks || [spec.body || ""]);
      response.statusCode = spec.status;
      response.headers = spec.headers || {};
      callback(response);
    });
    request.destroy = (error) => {
      response?.destroy();
      if (error) queueMicrotask(() => request.emit("error", error));
    };
    return request;
  };
}

test("live discovery persistence has explicit retirement and deletion bounds", async () => {
  assert.match(OFFICIAL_DISCOVERY_RETIRE_SQL, /source_key = 'official-live-search'/u);
  assert.match(OFFICIAL_DISCOVERY_RETIRE_SQL, /is_available = FALSE/u);
  assert.match(OFFICIAL_DISCOVERY_RETIRE_SQL, /make_interval\(hours => \$1\)/u);
  assert.match(OFFICIAL_DISCOVERY_DELETE_SQL, /DELETE FROM practice_corpus_documents/u);
  assert.match(OFFICIAL_DISCOVERY_DELETE_SQL, /source_key = 'official-live-search'/u);
  assert.match(PORTAL_UNAVAILABLE_DELETE_SQL, /is_available = FALSE/u);
  assert.match(PORTAL_UNAVAILABLE_DELETE_SQL, /portal-sitemap/u);
  assert.match(PORTAL_UNAVAILABLE_DELETE_SQL, /make_interval\(hours => \$1\)/u);
  assert.match(CORPUS_OVERFLOW_DELETE_SQL, /GREATEST\(COUNT\(\*\) - \$1, 0\)/u);
  assert.match(CORPUS_OVERFLOW_DELETE_SQL, /SUM\(pg_column_size\(document\)\)/u);

  const [corpus, retrieval, server] = await Promise.all([
    readFile(new URL("../server/corpus.mjs", import.meta.url), "utf8"),
    readFile(new URL("../server/retrieval.mjs", import.meta.url), "utf8"),
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(corpus, /SET LOCAL statement_timeout = '2000ms'/u);
  assert.match(corpus, /await client\.query\("BEGIN"\)/u);
  assert.match(corpus, /await client\.query\("ROLLBACK"\)/u);
  assert.match(corpus, /document\.source_key <> 'official-live-search'[\s\S]*?document\.last_seen_at >= NOW\(\)/u);
  assert.match(corpus, /discoveryOnly \? "WHERE current\.source_key = 'official-live-search'"/u);
  assert.match(corpus, /source_key = 'official-page-hydration'/u);
  assert.match(corpus, /source_kind: "official-page-hydration"/u);
  assert.match(corpus, /source_key IN \('portal-sitemap', 'portal-catalog', 'official-page-hydration'\)/u);
  assert.match(corpus, /pg_advisory_xact_lock\(hashtext\('practice-official-discovery-capacity'\)\)/u);
  assert.match(corpus, /pg_advisory_xact_lock\(hashtext\('practice-corpus-retention-capacity'\)\)/u);
  assert.match(corpus, /pg_column_size\(document\)::BIGINT AS existing_bytes/u);
  assert.match(corpus, /last_seen_run = COALESCE\(\$2::BIGINT, last_seen_run\)/u);
  assert.ok(corpus.indexOf("last_seen_run = COALESCE($2::BIGINT, last_seen_run)")
    < corpus.indexOf("if (!admittedBatch.length)"));
  assert.match(corpus, /details\.retention = await enforceCorpusRetention\(client\)/u);
  assert.match(corpus, /OFFSET \$1[\s\S]*?DELETE FROM practice_corpus_runs/u);
  assert.match(corpus, /OFFICIAL_DISCOVERY_MAX_ROWS/u);
  assert.match(retrieval, /enqueueOfficialDiscoveryDocuments\(filteredLive, \{ signal, clientKey \}\)/u);
  assert.doesNotMatch(retrieval, /void indexOfficialDiscoveryDocuments/u);
  assert.match(server, /stopOfficialDiscoveryIndexing\(new DOMException/u);
  assert.match(server, /clearInterval\(officialDiscoveryMaintenanceTimer\)/u);
});

test("live discovery row admission preserves existing URLs and caps new rows", () => {
  const documents = [
    { url: "https://example.test/new-a" },
    { url: "https://example.test/existing" },
    { url: "https://example.test/new-b" },
  ];
  assert.deepEqual(limitOfficialDiscoveryDocuments(
    documents,
    ["https://example.test/existing"],
    2,
    3,
  ).map((item) => item.url), [
    "https://example.test/new-a",
    "https://example.test/existing",
  ]);
  assert.deepEqual(limitOfficialDiscoveryDocuments(
    documents,
    ["https://example.test/existing"],
    3,
    3,
  ).map((item) => item.url), ["https://example.test/existing"]);
});

test("live discovery uses one canonical identity for queueing and persistence", () => {
  const reordered = "https://keskkonnaagentuur.ee/teema?b=2&utm_source=live&a=1#section";
  const canonical = "https://keskkonnaagentuur.ee/teema?a=1&b=2";
  assert.equal(canonicalOfficialDiscoveryUrl(reordered), canonical);
  assert.equal(canonicalOfficialDiscoveryUrl(canonical), canonical);
  assert.equal(canonicalOfficialDiscoveryUrl("http://keskkonnaagentuur.ee/teema?a=1&b=2"), "");
  assert.notEqual(
    canonicalOfficialDiscoveryUrl("https://keskkonnaagentuur.ee/teema?a=1&a=2"),
    canonicalOfficialDiscoveryUrl("https://keskkonnaagentuur.ee/teema?a=2&a=1"),
  );

  const first = normalizeOfficialDiscoveryDocuments([{ url: reordered, title: "Esimene" }]);
  const second = normalizeOfficialDiscoveryDocuments([{ url: canonical, title: "Teine" }]);
  const combined = normalizeOfficialDiscoveryDocuments([
    { url: reordered, title: "Esimene" },
    { url: canonical, title: "Teine" },
  ]);
  assert.equal(first[0].url, canonical);
  assert.equal(first[0].externalId, second[0].externalId);
  assert.equal(combined.length, 1);
  assert.equal(combined[0].url, canonical);
  assert.deepEqual(limitOfficialDiscoveryDocuments(combined, [canonical], 20_000, 20_000), combined);
});

test("aggregate corpus admission includes available rows, bytes and existing updates", () => {
  const documents = [
    { url: "https://example.test/new-a", content: "a" },
    { url: "https://example.test/existing", content: "b" },
    { url: "https://example.test/new-b", content: "c" },
  ];
  assert.deepEqual(limitCorpusDocumentsByAggregateCapacity(
    documents,
    ["https://example.test/existing"],
    2,
    0,
    3,
    100_000,
  ).map((item) => item.url), [
    "https://example.test/new-a",
    "https://example.test/existing",
  ]);
  assert.deepEqual(limitCorpusDocumentsByAggregateCapacity(
    documents,
    ["https://example.test/existing"],
    3,
    0,
    3,
    100_000,
  ).map((item) => item.url), ["https://example.test/existing"]);
  assert.deepEqual(limitCorpusDocumentsByAggregateCapacity(
    documents,
    ["https://example.test/existing"],
    0,
    95_000,
    3,
    100_000,
  ), []);
});

test("aggregate corpus admission charges existing rows only for conservative positive growth", () => {
  const existing = { url: "https://example.test/existing", content: "replacement" };
  const newDocument = { url: "https://example.test/new", content: "new" };
  const estimatedExistingBytes = Buffer.byteLength(JSON.stringify(existing), "utf8") + 8_192;
  const oldBytes = 1_000;
  const positiveDelta = estimatedExistingBytes - oldBytes;

  assert.deepEqual(limitCorpusDocumentsByAggregateCapacity(
    [existing, newDocument],
    [{ canonical_url: existing.url, existing_bytes: estimatedExistingBytes }],
    1,
    100_000,
    2,
    100_000,
  ).map((item) => item.url), [existing.url]);

  assert.deepEqual(limitCorpusDocumentsByAggregateCapacity(
    [existing],
    [{ canonical_url: existing.url, existing_bytes: oldBytes }],
    1,
    100_000 - positiveDelta,
    2,
    100_000,
  ).map((item) => item.url), [existing.url]);

  assert.deepEqual(limitCorpusDocumentsByAggregateCapacity(
    [existing],
    [{ canonical_url: existing.url, existing_bytes: oldBytes }],
    1,
    100_001 - positiveDelta,
    2,
    100_000,
  ), []);

  assert.deepEqual(limitCorpusDocumentsByAggregateCapacity(
    [existing],
    [existing.url],
    1,
    100_000,
    2,
    100_000,
  ), []);
});

test("capacity rejection preserves only existing document liveness", () => {
  const existingUrl = "https://example.test/existing";
  const plan = planCorpusDocumentAdmission(
    [
      { url: existingUrl, content: "replacement" },
      { url: "https://example.test/new", content: "new" },
    ],
    [{ canonical_url: existingUrl, existing_bytes: 0 }],
    1,
    100_000,
    2,
    100_000,
  );
  assert.deepEqual(plan.admittedDocuments, []);
  assert.deepEqual(plan.livenessOnlyUrls, [existingUrl]);
  assert.equal(plan.capacityDropped, 2);
});

test("authoritative portal retirement is suppressed only by truncated portal discovery", () => {
  assert.equal(shouldRetirePortalCatalog({ includeCatalog: true }), true);
  assert.equal(shouldRetirePortalCatalog({
    includeCatalog: true,
    authoritativeCapacityDropped: 1,
  }), false);
  assert.equal(shouldRetirePortalCatalog({
    includeCatalog: false,
    authoritativeCapacityDropped: 0,
  }), false);
});

test("hydration commits only when the locked post-update aggregate stays below the byte ceiling", async () => {
  const run = async (totalBytes) => {
    const calls = [];
    const client = {
      async query(sql) {
        const text = String(sql).trim();
        calls.push(text);
        if (text.startsWith("UPDATE practice_corpus_documents")) return { rowCount: 1, rows: [{ id: 1 }] };
        if (text.startsWith("SELECT COALESCE(SUM(pg_column_size")) {
          return { rows: [{ total_bytes: String(totalBytes) }] };
        }
        return { rowCount: 0, rows: [] };
      },
    };
    const persisted = await persistHydratedCorpusDocument(client, {
      url: "https://keskkonnaportaal.ee/et/test",
      title: "Test",
      content: "Sisuline ametlik lehekülg.",
      contentHash: "a".repeat(64),
      metadata: JSON.stringify({ hydrated: true }),
      runId: 1,
    }, { maximumBytes: 1_000 });
    return { calls, persisted };
  };

  const accepted = await run(1_000);
  assert.equal(accepted.persisted, true);
  assert.equal(accepted.calls.at(-1), "COMMIT");
  assert.ok(accepted.calls.findIndex((sql) => sql.includes("practice-corpus-retention-capacity"))
    < accepted.calls.findIndex((sql) => sql.startsWith("UPDATE practice_corpus_documents")));

  const rejected = await run(1_001);
  assert.equal(rejected.persisted, false);
  assert.equal(rejected.calls.at(-1), "ROLLBACK");
  assert.equal(rejected.calls.includes("COMMIT"), false);
});

test("duplicate URLs are merged before a PostgreSQL upsert batch", () => {
  const documents = deduplicateCorpusDocuments([
    {
      url: "https://keskkonnaportaal.ee/et/mets",
      title: "Mets",
      summary: "",
      organization: null,
      publishedLabel: null,
      topics: ["Mets"],
      quality: 1,
      metadata: { placeholder: true },
    },
    {
      url: "https://www.keskkonnaportaal.ee/et/mets/",
      title: "Metsa ülevaade",
      summary: "Sisuline kokkuvõte.",
      topics: ["Seire"],
      quality: 3,
      metadata: { placeholder: false },
    },
  ]);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].title, "Metsa ülevaade");
  assert.equal(documents[0].summary, "Sisuline kokkuvõte.");
  assert.deepEqual(documents[0].topics, ["Mets", "Seire"]);
  assert.equal(documents[0].metadata.placeholder, false);
  assert.notEqual(documents[0].organization, "null");
  assert.notEqual(documents[0].publishedLabel, "null");
});

test("federated snippets can never replace a non-live page body or its provenance", () => {
  const url = "https://keskkonnaportaal.ee/et/vesi/provenance";
  const hydrated = {
    sourceKey: "portal-catalog",
    url,
    title: "Hüdreeritud leht",
    summary: "Ametliku lehe kokkuvõte.",
    content: "OFFICIAL_PAGE_BODY kontrollitud lehesisu.",
    topics: ["lehe teema"],
    sourceTier: "official",
    quality: 2,
    metadata: { source_kind: "portal-catalog", hydrated: true },
  };
  const live = {
    sourceKey: "official-live-search",
    url,
    title: "LIVE_INDEX_TITLE",
    summary: "LIVE_INDEX_SUMMARY",
    content: `LIVE_INDEX_BODY ${"otsinguindeksi tekst ".repeat(50)}`,
    topics: ["LIVE_INDEX_TOPIC"],
    sourceTier: "reviewed",
    quality: 5,
    metadata: { source_kind: "official-live-search", injected: true },
  };
  const left = deduplicateCorpusDocuments([hydrated, live])[0];
  const right = deduplicateCorpusDocuments([live, hydrated])[0];
  for (const merged of [left, right]) {
    assert.equal(merged.sourceKey, "portal-catalog");
    assert.equal(merged.title, "Hüdreeritud leht");
    assert.equal(merged.summary, "Ametliku lehe kokkuvõte.");
    assert.equal(merged.content, "OFFICIAL_PAGE_BODY kontrollitud lehesisu.");
    assert.deepEqual(merged.topics, ["lehe teema"]);
    assert.equal(merged.sourceTier, "official");
    assert.deepEqual(merged.metadata, { source_kind: "portal-catalog", hydrated: true });
    assert.doesNotMatch(JSON.stringify(merged), /LIVE_INDEX/u);
  }
  assert.deepEqual(left, right);

  const emptyNonLive = {
    ...hydrated,
    summary: "",
    content: "",
    topics: [],
    metadata: { source_kind: "portal-sitemap" },
  };
  for (const order of [[emptyNonLive, live], [live, emptyNonLive]]) {
    const merged = deduplicateCorpusDocuments(order)[0];
    assert.equal(merged.sourceKey, "portal-catalog");
    assert.equal(merged.content, "");
    assert.equal(merged.summary, "");
    assert.deepEqual(merged.metadata, { source_kind: "portal-sitemap" });
  }
});

test("only an atomically validated corpus hydration row becomes answer evidence", () => {
  const base = {
    id: 7,
    source_key: "portal-catalog",
    canonical_url: "https://keskkonnaportaal.ee/et/kontrollitud-leht",
    title: "Kontrollitud leht",
    summary: "Ametlik kokkuvõte",
    content: "Kontrollitud ametliku lehe tõendikeha. ".repeat(4),
    organization: "Keskkonnaportaal",
    category: "Artikkel",
    published_at: "2026-08-19",
    published_label: "19.08.2026",
    topics: ["keskkond"],
    source_tier: "official",
    content_hash: "a".repeat(64),
    fetched_at: "2026-08-20T12:00:00Z",
    metadata: {},
  };
  for (const row of [
    base,
    { ...base, source_key: "portal-sitemap" },
    { ...base, source_key: "official-live-search" },
    { ...base, source_key: "official-page-hydration", metadata: { hydrated: true } },
    { ...base, source_key: "official-page-hydration", content_hash: "invalid", metadata: { hydrated: true, source_kind: "official-page-hydration" } },
    ...[base.fetched_at,"2026-08-21T12:00:00Z","invalid"].map((attempt) => ({...base,source_key:"official-page-hydration",metadata:{hydrated:true,source_kind:"official-page-hydration",hydration_attempted_at:attempt}})),
  ]) {
    const item = publicSearchItem(row, true);
    assert.equal(item.evidencePolicy, "route-only");
    assert.equal(item._answerEvidenceEligible, false);
    assert.equal(sourceEvidenceEligibility(item).eligible, false);
  }
  const item = publicSearchItem({
    ...base,
    source_key: "official-page-hydration",
    metadata: { hydrated: true, source_kind: "official-page-hydration" },
  }, true);
  assert.equal(item.retrieval, "approved-page-hydration");
  assert.equal(item.evidencePolicy, "versioned");
  assert.equal(item._answerEvidenceEligible, true);
  assert.equal(item._evidenceVersion, base.content_hash);
  assert.equal(item._evidenceStatusAt, "2026-08-20T12:00:00.000Z");
  assert.equal(sourceEvidenceEligibility(item, {
    now: Date.parse("2026-08-21T12:00:00Z"),
  }).eligible, true);

  const recovered = publicSearchItem({...base,source_key:"official-page-hydration",metadata:{hydrated:true,source_kind:"official-page-hydration",hydration_attempted_at:"2026-08-19T12:00:00Z"}},true);
  assert.equal(sourceEvidenceEligibility(recovered,{now:Date.parse("2026-08-21T12:00:00Z")}).eligible,true);

  const stale = publicSearchItem({
    ...base,
    source_key: "official-page-hydration",
    fetched_at: "2026-08-01T12:00:00Z",
    metadata: { hydrated: true, source_kind: "official-page-hydration" },
  }, true);
  assert.equal(sourceEvidenceEligibility(stale, {
    now: Date.parse("2026-08-21T12:00:00Z"),
  }).eligible, false);
  const missingStatus = publicSearchItem({
    ...base,
    source_key: "official-page-hydration",
    fetched_at: null,
    metadata: { hydrated: true, source_kind: "official-page-hydration" },
  }, true);
  assert.equal(sourceEvidenceEligibility(missingStatus, {
    now: Date.parse("2026-08-21T12:00:00Z"),
  }).eligible, false);
});

test("portal search parser preserves upstream total and card metadata", () => {
  const html = `
    <main>
      <h1>Tulemused otsingule (953)</h1>
      <div class="search-results__item-wrap">
        <div class="search-results__category">Uudis</div>
        <div class="search-results__item"><a href="/et/uudised/metsa-seire">
          <h2 class="search-results__title">Metsa seire</h2>
          <p class="search-results__text">Ametlik kokkuvõte metsade seisundist.</p>
        </a></div>
        <div class="search-results__author">Keskkonnaagentuur</div>
        <div class="search-results__date">17.08.2026</div>
        <div class="search-results__topic"><a>Mets</a><a>Seire</a></div>
      </div>
    </main>`;
  const result = parsePortalSearchPage(html);
  assert.equal(result.total, 953);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].url, "https://keskkonnaportaal.ee/et/uudised/metsa-seire");
  assert.equal(result.documents[0].title, "Metsa seire");
  assert.equal(result.documents[0].organization, "Keskkonnaagentuur");
  assert.equal(result.documents[0].publishedAt, "2026-08-17");
  assert.deepEqual(result.documents[0].topics, ["Mets", "Seire"]);
  assert.equal(result.documents[0].sourceTier, "official");
});

test("portal search parser rejects placeholder result URLs", () => {
  const card = (href, title) => `
    <div class="search-results__item-wrap">
      <div class="search-results__item"><a href="${href}">
        <h2 class="search-results__title">${title}</h2>
      </a></div>
    </div>`;
  const result = parsePortalSearchPage(`
    <main>
      <h1>Tulemused otsingule (5)</h1>
      ${card("/et/kehtiv", "Kehtiv tulemus")}
      ${card("/et/undefined", "Undefined placeholder")}
      ${card("undefined", "Relative placeholder")}
      ${card("/et/null?source=portal", "Null placeholder")}
      ${card("/et/%75ndefined", "Encoded placeholder")}
    </main>`);
  assert.deepEqual(result.documents.map((document) => document.url), [
    "https://keskkonnaportaal.ee/et/kehtiv",
  ]);
});

test("portal search parser accepts links nested inside result titles", () => {
  const result = parsePortalSearchPage(`
    <main>
      <h1>Tulemused otsingule (1)</h1>
      <div class="search-results__item-wrap">
        <div class="search-results__category">Mõõdik</div>
        <div class="search-results__item">
          <h2 class="search-results__title">
            <a href="/et/riigivalitsemine">Riigivalitsemine</a>
          </h2>
          <p class="search-results__text">Keskkonna valdkonna mõõdiku kaart.</p>
        </div>
      </div>
    </main>`);
  assert.equal(result.documents.length, 1);
  assert.equal(result.documents[0].url, "https://keskkonnaportaal.ee/et/riigivalitsemine");
  assert.equal(result.documents[0].title, "Riigivalitsemine");
});

test("portal result counts are bounded before they can control crawl work", () => {
  assert.equal(parsePortalReportedTotal("953"), 953);
  assert.throws(() => parsePortalReportedTotal("999999"), /configured result limit/u);
  assert.throws(() => parsePortalSearchPage("<main><h1>Tulemused otsingule (999999)</h1></main>"), /configured result limit/u);
  assert.throws(() => parsePortalReportedTotal("9007199254740993"), /invalid result count/u);
});

test("portal snapshot preserves upstream occurrences but pages distinct URLs", () => {
  const summary = summarizeUrlOccurrences([
    "https://keskkonnaportaal.ee/et/a",
    "https://keskkonnaportaal.ee/et/a",
    "https://keskkonnaportaal.ee/et/b",
  ]);
  assert.equal(summary.occurrenceCount, 3);
  assert.equal(summary.distinctCount, 2);
  assert.deepEqual(summary.distinctUrls, [
    "https://keskkonnaportaal.ee/et/a",
    "https://keskkonnaportaal.ee/et/b",
  ]);
});

test("sitemap parser canonicalizes portal URLs and keeps modification time", () => {
  const documents = parsePortalSitemap(`
    <urlset>
      <url><loc>http://keskkonnaportaal.ee/et/mets/</loc><lastmod>2026-08-16T12:00:00Z</lastmod></url>
      <url><loc>javascript:alert(1)</loc></url>
    </urlset>`);
  assert.equal(documents.length, 1);
  assert.equal(documents[0].url, "https://keskkonnaportaal.ee/et/mets");
  assert.equal(documents[0].modifiedAt, "2026-08-16T12:00:00.000Z");
  assert.equal(documents[0].sourceTier, "official");
});

test("corpus dates are calendar-valid before PostgreSQL casts", () => {
  const sitemap = parsePortalSitemap(`
    <urlset>
      <url><loc>https://keskkonnaportaal.ee/et/kehtiv</loc><lastmod>2024-02-29T12:30:00+02:00</lastmod></url>
      <url><loc>https://keskkonnaportaal.ee/et/vigane</loc><lastmod>2024-02-30T12:30:00Z</lastmod></url>
    </urlset>
  `);
  assert.equal(sitemap[0].modifiedAt, "2024-02-29T10:30:00.000Z");
  assert.equal(sitemap[1].modifiedAt, null);

  const [invalidPublished] = deduplicateCorpusDocuments([{
    url: "https://keskkonnaportaal.ee/et/vigane-kuupaev",
    title: "Kirje",
    publishedAt: "2024-02-30",
  }]);
  assert.equal(invalidPublished.publishedAt, null);
});

test("portal sitemap cannot delegate its official tier to off-host entries", () => {
  const xml = `
    <urlset>
      <url><loc>https://keskkonnaportaal.ee/et/vesi</loc></url>
      <url><loc>https://example.com/copied-official-page</loc></url>
      <url><loc>https://keskkonnaamet.ee/uudised/ametlik-kuid-mitte-portaali-sitemap</loc></url>
    </urlset>`;
  const documents = parsePortalSitemap(xml);
  assert.deepEqual(documents.map((document) => document.url), ["https://keskkonnaportaal.ee/et/vesi"]);
  assert.equal(documents[0].sourceTier, "official");
  assert.deepEqual(
    { entryCount: parsePortalSitemapPage(xml).entryCount, rejectedCount: parsePortalSitemapPage(xml).rejectedCount },
    { entryCount: 3, rejectedCount: 2 },
  );
});

test("PostgreSQL prefix query drops conversational stop words", () => {
  assert.equal(buildPrefixTsQuery("Kas meie metsad muutuvad nooremaks?"), "mets:* & (muut:* | trend:*) & (noor:* | vanus:*)");
  assert.equal(buildPrefixTsQuery("Kas see on Eestis?"), "");
  assert.equal(
    buildPrefixTsQuery("Eesti kasvuhoonegaaside heide 2022"),
    "kasvuhoonegaas:* & (heit:* | heid:*) & 2022:*",
  );
  assert.equal(
    buildPrefixTsQuery("põhjavee seisund Harjumaal 2024"),
    "põhjave:* & seisund:* & harjumaa:* & 2024:*",
  );
  assert.equal(
    buildPrefixTsQuery("metsastatistika vanuseline jaotus"),
    "mets:* & statist:* & (vanus:* | noor:* | vana:*) & jaotus:*",
  );
  assert.equal(
    buildPrefixTsQuery("kaitsealuse liigi elupaiga andmed"),
    "kait:* & (liik:* | liig:*) & (elupaik:* | elupaig:*) & andmed:*",
  );
});

test("readable page extraction removes navigation, forms and scripts", () => {
  const result = extractReadablePage(`
    <html><head><title>Varupealkiri</title></head><body>
      <nav>Menüü salatekst</nav>
      <main><h1>Metsade ülevaade</h1><form>Otsi</form>
        <article><p>Metsade seisundit hinnatakse pika aegrea põhjal.</p><script>steal()</script></article>
      </main>
    </body></html>`, "https://keskkonnaportaal.ee/et/mets");
  assert.equal(result.title, "Metsade ülevaade");
  assert.match(result.content, /pika aegrea/iu);
  assert.doesNotMatch(result.content, /Menüü|Otsi|steal/iu);
});

test("crawler enforces the portal robots allow/disallow precedence", () => {
  const rules = parseRobotsTxt(`
    User-agent: *
    Allow: /core/*.css$
    Disallow: /core/
    Disallow: /admin/
    Disallow: /search/
  `);
  assert.equal(robotsAllowsUrl("https://keskkonnaportaal.ee/et/search?search_api_fulltext=mets", rules), true);
  assert.equal(robotsAllowsUrl("https://keskkonnaportaal.ee/admin/config", rules), false);
  assert.equal(robotsAllowsUrl("https://keskkonnaportaal.ee/core/app.css", rules), true);
  assert.equal(robotsAllowsUrl("https://keskkonnaportaal.ee/core/app.js", rules), false);
});

test("crawler bounds robots rules and matches wildcards without dynamic regular expressions", () => {
  const rules = parseRobotsTxt(`
    User-agent: *
    Disallow: /*/private/*/export$
    Allow: /public/*
  `);
  assert.equal(robotsAllowsUrl("https://keskkonnaportaal.ee/a/private/b/export", rules), false);
  assert.equal(robotsAllowsUrl("https://keskkonnaportaal.ee/a/private/b/export/more", rules), true);
  assert.throws(
    () => parseRobotsTxt(`User-agent: *\nDisallow: /${"*x".repeat(9)}`),
    /over-complex rule/u,
  );
  assert.throws(
    () => parseRobotsTxt(`User-agent: *\nDisallow: /${"x".repeat(600)}`),
    /oversized line/u,
  );
});

test("crawler validates every redirect target before following it", () => {
  assert.equal(isApprovedCorpusRedirect(
    "https://keskkonnaportaal.ee/et/mets",
    "https://www.keskkonnaportaal.ee/et/mets",
  ), true);
  assert.equal(isApprovedCorpusRedirect(
    "https://keskkonnaportaal.ee/et/mets",
    "https://example.com/private",
  ), false);
  assert.equal(isApprovedCorpusRedirect(
    "https://et.wikipedia.org/w/api.php",
    "http://et.wikipedia.org/w/api.php",
  ), false);
  assert.equal(isApprovedCorpusRedirect(
    "https://keskkonnaportaal.ee/et/mets",
    "https://10.0.0.1/internal",
  ), false);
  assert.equal(isApprovedCorpusRedirect(
    "https://keskkonnaportaal.ee/et/mets",
    "https://keskkonnaportaal.ee:444/internal",
  ), false);
  assert.equal(isApprovedCorpusRedirect(
    "https://keskkonnaportaal.ee/et/mets",
    "https://user:secret@keskkonnaportaal.ee/internal",
  ), false);
});

test("corpus fetch uses the shared public-only HTTPS transport on every hop", async () => {
  let redirectDestroyed = false;
  let redirectReads = 0;
  const redirectBody = new Readable({
    read() {
      redirectReads += 1;
      this.push(Buffer.alloc(64 * 1024));
    },
    destroy(error, callback) {
      redirectDestroyed = true;
      callback(error);
    },
  });
  const calls = [];
  const result = await fetchCorpusText("https://keskkonnaportaal.ee/et/start", {
    retries: 0,
    requestImpl: mockCorpusHttpsRequest([
      {
        status: 302,
        headers: { location: "https://www.keskkonnaportaal.ee/et/final" },
        stream: redirectBody,
      },
      {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "index, follow" },
        body: "<main>Avalik kontrollitud leht</main>",
      },
    ], calls),
  });
  assert.equal(result.finalUrl, "https://www.keskkonnaportaal.ee/et/final");
  assert.equal(result.contentType, "text/html; charset=utf-8");
  assert.equal(result.robotsTag, "index, follow");
  assert.equal(redirectDestroyed, true);
  assert.equal(redirectReads, 0);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.headers["Accept-Encoding"] === "identity"));

  let unsafeCalls = 0;
  const mustNotRun = () => {
    unsafeCalls += 1;
    throw new Error("unsafe corpus URL reached the transport");
  };
  await assert.rejects(fetchCorpusText("https://keskkonnaportaal.ee:444/private", {
    retries: 0,
    requestImpl: mustNotRun,
  }), /approved HTTPS origins/u);
  await assert.rejects(fetchCorpusText("https://user:secret@keskkonnaportaal.ee/private", {
    retries: 0,
    requestImpl: mustNotRun,
  }), /approved HTTPS origins/u);
  assert.equal(unsafeCalls, 0);

  const dnsAwareRequest = (url, options, callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => options.lookup(url.hostname, {}, (error) => {
      if (error) {
        request.emit("error", error);
        return;
      }
      const response = Readable.from(["must not reach response"]);
      response.statusCode = 200;
      response.headers = {};
      callback(response);
    }));
    request.destroy = (error) => {
      if (error) queueMicrotask(() => request.emit("error", error));
    };
    return request;
  };
  await assert.rejects(fetchCorpusText("https://keskkonnaportaal.ee/private-dns", {
    retries: 0,
    requestImpl: dnsAwareRequest,
    lookupImpl: (_hostname, _options, callback) => callback(null, [
      { address: "8.8.8.8", family: 4 },
      { address: "10.0.0.1", family: 4 },
    ]),
  }), /non-public DNS answer/u);

  const privatePeerRequest = (_url, _options, _callback) => {
    const request = new EventEmitter();
    request.end = () => queueMicrotask(() => {
      const socket = new EventEmitter();
      socket.remoteAddress = "127.0.0.1";
      request.emit("socket", socket);
    });
    request.destroy = (error) => queueMicrotask(() => request.emit("error", error));
    return request;
  };
  await assert.rejects(fetchCorpusText("https://keskkonnaportaal.ee/private-peer", {
    retries: 0,
    requestImpl: privatePeerRequest,
  }), /non-public address/u);
});

test("corpus hydration binds fetched content to the canonical final resource", async () => {
  assert.equal(hydrationResourceMatches(
    "https://keskkonnaportaal.ee/et/mets/",
    "https://www.keskkonnaportaal.ee/et/mets?utm_source=redirect",
  ), true);
  assert.equal(hydrationResourceMatches(
    "https://keskkonnaportaal.ee/et/mets",
    "https://keskkonnaportaal.ee/et/muu-leht",
  ), false);
  assert.equal(hydrationResourceMatches(
    "https://keskkonnaportaal.ee/et/mets",
    "https://keskkonnaamet.ee/et/mets",
  ), false);

  const corpus = await readFile(new URL("../server/corpus.mjs", import.meta.url), "utf8");
  assert.match(corpus, /if \(!hydrationResourceMatches\(url, response\.finalUrl\)\) return false;[\s\S]*?extractReadablePage/u);
});

test("crawler refuses HTML or response headers marked noindex", () => {
  assert.equal(pageRobotsPolicy(`
    <html><head><meta name="robots" content="noindex, follow"></head><body>Avalik sisu</body></html>
  `).noindex, true);
  assert.equal(pageRobotsPolicy("<html><body>Avalik sisu</body></html>", "none").noindex, true);
  assert.equal(pageRobotsPolicy("<html><body>Avalik sisu</body></html>", "index, follow").noindex, false);
});

test("progressive answer endpoint and broad result pagination remain separate contracts", async () => {
  const [server, app, corpus] = await Promise.all([
    readFile(new URL("../server/index.mjs", import.meta.url), "utf8"),
    readFile(new URL("../src/App.jsx", import.meta.url), "utf8"),
    readFile(new URL("../server/corpus.mjs", import.meta.url), "utf8"),
  ]);
  assert.doesNotMatch(server, /app\.get\("\/api\/search\/results"/u);
  assert.match(server, /app\.post\("\/api\/search\/results"/u);
  assert.match(server, /prepareRankedSearchResults/u);
  assert.match(server, /publicSearchListing/u);
  assert.match(server, /app\.post\("\/api\/search\/follow-up"/u);
  assert.match(server, /settleWithinDeadline/u);
  assert.match(app, /Lai portaaliotsing/u);
  assert.match(app, /Otsingutulemused/u);
  assert.doesNotMatch(app, /Vastuses viidatud allikad/u);
  const resultsView = app.match(/function SearchResults[\s\S]*?function PrivacyDisclosure/u)?.[0] || "";
  assert.match(resultsView, /<BroadSearchResults/u);
  assert.doesNotMatch(resultsView, /sources-section|sources-list|Kõik viidatud allikad/u);
  assert.match(server, /searchPage\(request, "page_size", 12, 50\)/u);
  assert.match(server, /app\.post\("\/api\/search\/stream"/u);
  assert.match(server, /application\/x-ndjson/u);
  assert.match(server, /if \(!resultsWritten\) \{[\s\S]*?await stream\.write\("results"/u);
  assert.match(server, /createBoundedNdjsonWriter\(response[\s\S]*?await stream\.finish\(\)[\s\S]*?cleanupLease\.finish\(\)/u);
  assert.match(app, /fetch\("\/api\/search\/stream", \{[\s\S]*?method: "POST"/u);
  assert.match(app, /readSearchStream\(response/u);
  assert.match(app, /\{!busy && focused && suggestions\.length \? \(/u);
  assert.match(app, /fetch\("\/api\/suggestions", \{[\s\S]*?method: "POST"/u);
  assert.match(server, /app\.post\("\/api\/suggestions"/u);
  assert.match(app, /pushState\(\{ practiceSearchId: rememberNavigationSearch\(clean, filters\) \}, "", "\/otsi"\)/u);
  assert.match(app, /navigationSearches = new globalThis\.Map\(\)/u);
  assert.doesNotMatch(app, /pushState\([^\n]+\/otsi\?/u);
  assert.doesNotMatch(app, /document\.title = `\$\{result\.answer\.title\}/u);
  assert.match(corpus, /distinctTotal/u);
  assert.match(corpus, /CHECK \(query_source = 'configured-seed'\)/u);
  assert.match(corpus, /keskkonnaportaal\[\.\]ee\/et\(\/\|\$\)[\s\S]*?<> ALL\(\$10::TEXT\[\]\)/u);
});
