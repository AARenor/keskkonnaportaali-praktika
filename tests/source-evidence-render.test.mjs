import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";
import { officialServiceCatalogueDocuments, splitTextPassages } from "../server/search.mjs";
import { sourceDateMeta } from "../src/source-label.js";

test("the answer shows only its clickable official sources and never an evidence excerpt disclosure", async () => {
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
    const excerpt = buildFakeEvidenceExcerpt(source);
    const unused = { ...catalogue.find((item) => item.id === "forest-area"), citation: 2, evidenceExcerpt: "UNUSED_SOURCE_BODY" };
    const render = (sources, answer = { introCitations: [1], parts: [] }, chart) => load(renderToStaticMarkup(
      createElement(SourceLegend, { sources, answer, chart }),
    ));
    const displayed = { ...source, evidenceExcerpt: excerpt };
    const $ = render([displayed, unused]);
    assert.equal($("details.answer-evidence").length, 0,
      "The legend of clickable sources has replaced the evidence excerpt disclosure");
    assert.doesNotMatch($("body").text(), /Kasutatud tõendilõigud/u);
    assert.doesNotMatch($("body").text(), /UNUSED_SOURCE_BODY/u);
    const legendLink = $("ul.source-legend li a.source-legend__link");
    assert.equal(legendLink.attr("href"), source.url, "the citation legend stays clickable");
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
    // "nähtav tõend ei kata küsimust" notice) still lists its
    // sources: those legend rows are the way to reach the originals.
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

function buildFakeEvidenceExcerpt(source) {
  // A long bounded excerpt proves the old disclosure body would not leak back
  // through any other render path.
  let text = `Figures about ${source.title} from the evidence pack. `.repeat(3);
  text += splitTextPassages("Täiendavasisu kaardiandmestik ETAK projekteeritav alad kaitsealune mets 2011–2025." + " Lisasõnadetail. ".repeat(40))[0] || "";
  return text.slice(0, 4_000);
}
