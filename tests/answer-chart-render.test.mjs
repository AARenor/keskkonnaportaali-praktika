import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";

test("line chart endpoint labels remain inside the plot instead of spilling past the last point", async () => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  try {
    const { default: AnswerChart } = await vite.ssrLoadModule("/src/AnswerChart.jsx");
    for (const values of [[493809, 466242], [466242, 493809]]) {
      const chart = { kind: "line", title: "Metsamaa tagavara", unit: "tuhat m³", series: [{
        id: "stock", label: "Metsamaa tagavara", points: values.map((y, index) => ({ x: 2024 + index, y })),
      }] };
      const $ = load(renderToStaticMarkup(createElement(AnswerChart, { chart })));
      const label = $("svg .answer-chart__value").first();
      const endpoint = $("svg circle.answer-chart__hit").last();
      assert.equal(label.text().replace(/\s/gu, ""), String(values.at(-1)));
      assert.equal(label.attr("text-anchor"), "end", "the label must grow left, not past the right SVG boundary");
      assert.ok(Number(label.attr("x")) < Number(endpoint.attr("cx")), "keep the number left of the final point");
      assert.ok(Number(label.attr("y")) >= 16, "reserve enough top space for the label's glyphs");
      assert.ok(Number(label.attr("y")) < Number($("svg").attr("height")));
    }
  } finally {
    await vite.close();
  }
});
