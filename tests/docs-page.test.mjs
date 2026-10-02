import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";

test("documentation routes render separate guides with working navigation and unknown-page recovery", async (t) => {
  const vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  try {
    let Docs;
    let documentationRoute;
    try {
      ({ default: Docs } = await vite.ssrLoadModule("/src/Docs.jsx"));
      ({ documentationRoute } = await vite.ssrLoadModule("/src/docs-route.js"));
    } catch {
      assert.fail("The public documentation renderer and route boundary must exist.");
    }
    const render = (pathname) => load(renderToStaticMarkup(createElement(Docs, { pathname })));

    await t.test("the route boundary does not replace normal application paths", () => {
      for (const pathname of ["/", "/docs-other", "/search", "/api/search"]) {
        assert.equal(documentationRoute(pathname), null);
      }
      assert.equal(documentationRoute("/docs"), "overview");
      assert.equal(documentationRoute("/docs/"), "overview");
      assert.equal(documentationRoute("/docs/kasutajale/"), "user");
      assert.equal(documentationRoute("/docs/arendajale"), "developer");
      assert.equal(documentationRoute("/docs/missing"), "not-found");
      assert.equal(documentationRoute("/docs/arendajale/missing"), "not-found");
    });

    await t.test("the hub exposes both audience guides without loading the search app", () => {
      const $ = render("/docs");
      assert.equal($("main h1").length, 1);
      assert.ok($("main a[href='/docs/kasutajale']").length);
      assert.ok($("main a[href='/docs/arendajale']").length);
      assert.equal($("iframe, form[role='search']").length, 0);
    });

    for (const pathname of ["/docs/kasutajale", "/docs/arendajale"]) {
      await t.test(`${pathname} has a usable section index and unique anchor targets`, () => {
        const $ = render(pathname);
        assert.equal($("main h1").length, 1);
        assert.equal($(`nav[aria-label='Juhendid'] a[aria-current='page']`).attr("href"), pathname);
        const ids = $("[id]").map((_index, element) => $(element).attr("id")).get();
        assert.equal(new Set(ids).size, ids.length, "duplicate IDs break shareable anchors");
        const anchors = $("nav[aria-label='Sisukord'] a");
        assert.ok(anchors.length >= 5, "each guide needs an actual section index");
        anchors.each((_index, element) => {
          const href = $(element).attr("href");
          assert.ok(href.startsWith("#"));
          assert.equal($(href).length, 1, `missing target ${href}`);
          assert.equal($(href).find("h2").length, 1);
        });
        assert.equal($("a[href='#docs-main']").length, 1, "keyboard skip link");
        assert.equal($("#docs-main").attr("tabindex"), "-1");
        assert.equal($("a[href^='javascript:'], a[href^='http:']").length, 0);
        assert.equal($("img:not([alt]), button:not([type])").length, 0);
      });
    }

    await t.test("a missing documentation page offers recovery instead of a misleading guide", () => {
      const $ = render("/docs/missing");
      assert.equal($("main h1").text(), "Juhendit ei leitud");
      assert.ok($("main a[href='/docs']").length);
      assert.equal($("nav[aria-label='Juhendid'] a[aria-current='page']").length, 0);
    });
  } finally {
    await vite.close();
  }
});
