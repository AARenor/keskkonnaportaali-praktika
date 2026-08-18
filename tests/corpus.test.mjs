import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  buildPrefixTsQuery,
  deduplicateCorpusDocuments,
  extractReadablePage,
  isApprovedCorpusRedirect,
  pageRobotsPolicy,
  parsePortalSearchPage,
  parsePortalSitemap,
  parseRobotsTxt,
  robotsAllowsUrl,
  summarizeUrlOccurrences,
} from "../server/corpus.mjs";

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
  assert.equal(documents[0].modifiedAt, "2026-08-16T12:00:00Z");
  assert.equal(documents[0].sourceTier, "official");
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
  assert.match(server, /app\.get\("\/api\/search\/results"/u);
  assert.match(server, /app\.post\("\/api\/search\/results"/u);
  assert.match(server, /prepareRankedSearchResults/u);
  assert.match(server, /publicSearchListing/u);
  assert.match(server, /app\.post\("\/api\/search\/follow-up"/u);
  assert.match(server, /settleWithinDeadline/u);
  assert.match(app, /Lai portaaliotsing/u);
  assert.match(app, /Otsingutulemused/u);
  assert.match(app, /Vastuse allikad/u);
  assert.match(server, /searchPage\(request, "page_size", 12, 50\)/u);
  assert.match(server, /app\.post\("\/api\/search\/stream"/u);
  assert.match(server, /application\/x-ndjson/u);
  assert.match(server, /if \(!resultsWritten\) \{[\s\S]*?writeSearchStreamEvent\(response, "results"/u);
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
