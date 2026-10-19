import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";
import { officialServiceCatalogueDocuments, splitTextPassages } from "../server/search.mjs";
import { buildEvidencePack } from "../server/evidence-pack.mjs";
import { sourceDateMeta } from "../src/source-label.js";

test("used source evidence renders its complete bounded body in a native disclosure, not just a tooltip", async () => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  try {
    const { SourceLegend } = await vite.ssrLoadModule("/src/App.jsx");
    const catalogue = officialServiceCatalogueDocuments();
    const source = { ...catalogue.find((item) => item.id === "protected-forest-share"), citation: 1 };
    const pack = buildEvidencePack({ sources: [source], query: "õietolm" });
    const excerpt = pack.entries[0].content;
    assert.ok(excerpt.length <= 4_000);
    const late = splitTextPassages(excerpt).find((passage) => excerpt.indexOf(passage) >= 1_200);
    assert.ok(late, "The real published body must exercise the former clipping defect");
    const unused = { ...catalogue.find((item) => item.id === "forest-area"), citation: 2, evidenceExcerpt: "UNUSED_SOURCE_BODY" };
    const render = (sources, answer = { introCitations: [1], parts: [] }, chart) => load(renderToStaticMarkup(
      createElement(SourceLegend, { sources, answer, chart }),
    ));
    const displayed = { ...source, evidenceExcerpt: excerpt };
    const $ = render([displayed, unused]);
    const disclosure = $("details");
    assert.equal(disclosure.find("summary").text(), "Kasutatud tõendilõigud");
    assert.ok(disclosure.text().includes(excerpt));
    assert.ok(disclosure.text().includes(late));
    assert.match(disclosure.text(), /kaardiandmestik/iu);
    assert.match(disclosure.text(), /ETAK/iu);
    assert.match(disclosure.text(), /projekteeritav/iu);
    assert.ok(disclosure.text().includes(source.locator));
    assert.ok(disclosure.text().includes(sourceDateMeta(source)));
    assert.equal(disclosure.find("h3 a").attr("href"), source.url);
    assert.doesNotMatch(disclosure.text(), /UNUSED_SOURCE_BODY/u);

    const chartOnly = render([displayed], { introCitations: [], parts: [] }, { citation: 1 });
    assert.ok(chartOnly("details").text().includes(excerpt));
    assert.equal(render([displayed], { introCitations: [], parts: [] })("details").length, 0);
    assert.equal(render([{ ...source, evidenceExcerpt: undefined }])("details").length, 0,
      "A title, date, locator or summary must not manufacture an evidence body");

    const untrusted = `${excerpt}\n<img src=x onerror=alert(1)>`;
    const escaped = render([{ ...source, evidenceExcerpt: untrusted }]);
    assert.equal(escaped("details img").length, 0);
    assert.ok(escaped("details").text().includes("<img src=x onerror=alert(1)>"));
  } finally {
    await vite.close();
  }
});

test("every visible source legend row opens its official HTTPS source, even without an inline citation", async () => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  try {
    const { SourceLegend } = await vite.ssrLoadModule("/src/App.jsx");
    const catalogue = officialServiceCatalogueDocuments();
    const http = catalogue.find((item) => item.id === "protected-forest-share");
    const insecure = {
      ...catalogue.find((item) => item.id === "forest-area"),
      citation: 2,
      url: "http://insecure.example/forest-area",
    };
    // An answer whose intro carries no citation (for example the
    // "nähtavad tõendilõigud ei kata küsimust" notice) still lists its
    // sources: those legend rows are the only way to reach the originals.
    const answer = { introCitations: [], parts: [] };
    const $ = load(renderToStaticMarkup(createElement(SourceLegend, {
      sources: [{ ...http, citation: 1 }, insecure],
      answer,
    })));
    const links = $("ul.source-legend li a.source-legend__link");
    assert.equal(links.length, 1, "only the HTTPS source becomes a link");
    assert.equal(links.first().attr("href"), http.url);
    assert.equal(links.first().attr("target"), "_blank");
    assert.match(links.first().attr("rel") || "", /noreferrer/u);
    assert.match(links.first().attr("aria-label") || "", /Allikas 1: .*\(avaneb uuel vahelehel\)/u);
    assert.match($("ul.source-legend").text(), /Keskkonnaagentuur/u);
    const inertRow = $("ul.source-legend li").eq(1);
    assert.equal(inertRow.find("a").length, 0, "a non-HTTPS url never renders as a link");
    assert.ok(inertRow.text().includes("Avaldatud:") || inertRow.text().includes("Andmed:"));
  } finally {
    await vite.close();
  }
});
