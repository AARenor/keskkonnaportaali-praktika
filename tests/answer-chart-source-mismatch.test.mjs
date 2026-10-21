import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";

test("chart warns with a hover note only when its source differs from the text's sources", async () => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  try {
    const { default: AnswerChart, chartSourceDiffers, SOURCE_MISMATCH_NOTE } = await vite.ssrLoadModule("/src/AnswerChart.jsx");
    const sources = [
      { citation: 1, url: "https://keskkonnaagentuur.ee/smi-aruanne", organization: "Keskkonnaagentuur" },
      { citation: 2, url: "https://keskkonnaagentuur.ee/smi-tooleht", organization: "Keskkonnaagentuur" },
      { citation: 3, url: "https://example.ee/muu", organization: "Muu Asutus" },
      { citation: 4, url: "https://example.ee/a" },
      { citation: 5, url: "https://example.ee/a" },
      { citation: 6, url: "https://example.ee/b" },
    ];
    const cites = (...numbers) => ({ introCitations: numbers });
    assert.equal(chartSourceDiffers(cites(1), { citation: 1 }, sources), false, "same citation");
    assert.equal(chartSourceDiffers(cites(1), { citation: 2 }, sources), false, "two documents from one publisher");
    assert.equal(chartSourceDiffers(cites(1), { citation: 3 }, sources), true, "different publisher");
    assert.equal(chartSourceDiffers({ parts: [{ citations: [3, 2] }] }, { citation: 1 }, sources), false, "publisher cited anywhere in the text");
    assert.equal(chartSourceDiffers(cites(4), { citation: 5 }, sources), false, "unlabelled sources on the same page");
    assert.equal(chartSourceDiffers(cites(4), { citation: 6 }, sources), true, "unlabelled sources on different pages");
    assert.equal(chartSourceDiffers({ introCitations: [], parts: [] }, { citation: 3 }, sources), false, "nothing to compare");

    const chart = { kind: "line", title: "Raiemaht", unit: "tuhat m³", series: [{ id: "h", label: "Raiemaht", points: [{ x: 2023, y: 1 }, { x: 2024, y: 2 }] }] };
    const plain = load(renderToStaticMarkup(createElement(AnswerChart, { chart })));
    assert.equal(plain(".answer-chart__mismatch").length, 0);
    const warned = load(renderToStaticMarkup(createElement(AnswerChart, { chart, sourceDiffers: true })));
    assert.equal(warned(".answer-chart__caption .answer-chart__mismatch-icon").text(), "!");
    assert.equal(warned(".answer-chart__mismatch-icon").attr("aria-label"), SOURCE_MISMATCH_NOTE);
    assert.equal(warned(".answer-chart__mismatch-tip").text(), SOURCE_MISMATCH_NOTE);
    const share = { ...chart, kind: "share", series: [{ id: "s", label: "Maa", points: [{ x: "a", label: "Mets", y: 2, emphasis: true }, { x: "b", label: "Muu", y: 1 }] }] };
    assert.equal(load(renderToStaticMarkup(createElement(AnswerChart, { chart: share, sourceDiffers: true })))(".answer-chart__mismatch").length, 1);
  } finally {
    await vite.close();
  }
});
