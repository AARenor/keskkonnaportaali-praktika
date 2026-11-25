import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const ORIGIN = "https://keskkonnaagentuur.ee";
const ROOT = `${ORIGIN}/sitemap.xml`;
const CHILD = `${ORIGIN}/child-sitemap.xml`;
const ROOT_PAGE = `${ORIGIN}/et/root-page`;
const CHILD_PAGE = `${ORIGIN}/et/child-page`;
const CORPUS_FETCH_MODULE_URL = new URL("../server/corpus_fetch.mjs", import.meta.url).href;

function installSyntheticTransport(routes) {
  const httpsModule = require("node:https");
  const originalRequest = httpsModule.request;
  const requestedUrls = [];
  httpsModule.request = (target, _options, callback) => {
    const href = String(target);
    requestedUrls.push(href);
    const spec = routes[href] || { status: 404, contentType: "text/plain", body: "missing" };
    const request = new EventEmitter();
    request.destroy = (error) => {
      if (error) request.emit("error", error);
    };
    request.end = () => {
      setImmediate(() => {
        const incoming = new EventEmitter();
        incoming.statusCode = spec.status;
        incoming.headers = { "content-type": spec.contentType };
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
    requestedUrls,
    restore() {
      httpsModule.request = originalRequest;
    },
  };
}

test("official sitemap keeps URL entries that sit beside sitemap index entries", { timeout: 30_000 }, async () => {
  const mixedSitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>${CHILD}</loc></sitemap>
      <url><loc>${ROOT_PAGE}</loc><lastmod>2026-11-20</lastmod></url>
    </sitemapindex>`;
  const childSitemap = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <url><loc>${CHILD_PAGE}</loc></url>
    </urlset>`;
  const transport = installSyntheticTransport({
    [`${ORIGIN}/robots.txt`]: {
      status: 200,
      contentType: "text/plain",
      body: "User-agent: *\nAllow: /\n",
    },
    [ROOT]: {
      status: 200,
      contentType: "application/xml",
      body: mixedSitemap,
    },
    [CHILD]: {
      status: 200,
      contentType: "application/xml",
      body: childSitemap,
    },
  });
  try {
    const { crawlOfficialSitemap } = await import(CORPUS_FETCH_MODULE_URL);
    const result = await crawlOfficialSitemap({ url: ROOT, sourceKey: "official-sitemap", delayMs: 0 });
    assert.deepEqual(
      result.documents.map((document) => document.url).sort(),
      [CHILD_PAGE, ROOT_PAGE].sort(),
      JSON.stringify({ requestedUrls: transport.requestedUrls }),
    );
    assert.equal(
      result.documents.find((document) => document.url === ROOT_PAGE)?.modifiedAt,
      "2026-11-20T00:00:00.000Z",
    );
  } finally {
    transport.restore();
  }
});
