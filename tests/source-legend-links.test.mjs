import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";

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
    const https = catalogue.find((item) => item.id === "protected-forest-share");
    const insecure = {
      ...catalogue.find((item) => item.id === "forest-area"),
      citation: 2,
      url: "http://insecure.example/forest-area",
    };
    // An answer whose intro carries no citation (for example the
    // "nähtavad tõendilõigud ei kata küsimust" notice) still lists its
    // sources: those legend rows are the only way to reach the originals.
    const $ = load(renderToStaticMarkup(createElement(SourceLegend, {
      sources: [{ ...https, citation: 1 }, insecure],
    })));
    const links = $("ul.source-legend li a.source-legend__link");
    assert.equal(links.length, 1, "only the HTTPS source becomes a link");
    assert.equal(links.first().attr("href"), https.url);
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
