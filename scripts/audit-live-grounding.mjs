import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { load } from "cheerio";

const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.join("=") || true];
}));
const baseUrl = new URL(String(options["base-url"] || "http://127.0.0.1:4317"));
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error("--base-url must be an HTTP(S) origin without credentials");
}
const intervalMs = Math.max(0, Math.min(Number(options["interval-ms"]) || 3_200, 10_000));
const dataset = JSON.parse(await readFile(
  new URL("../evaluation/grounding_audit_v1.json", import.meta.url),
  "utf8",
));
const failures = [];
const fetchedSources = new Map();
let lastRequestAt = 0;
let claimsAudited = 0;
let citedUrlsChecked = 0;

const stopWords = new Set([
  "aasta", "aastal", "eesti", "eestis", "ja", "et", "kui", "kus", "mis", "ning", "on", "oli",
  "oma", "see", "selle", "seda", "või", "voi", "ning", "kohta", "järgi", "jargi", "tuleb", "saab",
]);

function normalize(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^\p{L}\p{N}%]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function roots(value) {
  return [...new Set(normalize(value).split(" ")
    .filter((token) => token.length >= 4 && !stopWords.has(token) && !/^\d/u.test(token))
    .map((token) => token.slice(0, Math.min(6, token.length))))];
}

function measurements(value) {
  return [...new Set((String(value || "").match(/\b\d+(?:[.,]\d+)?\s*%?/gu) || [])
    .map((token) => token.replace(/\s+/gu, "").replace(/%$/u, "").replace(",", ".")))];
}

function citations(body) {
  return [
    ...(body?.answer?.introCitations || []),
    ...(body?.answer?.parts || []).flatMap((part) => part.citations || []),
  ];
}

function claims(body) {
  return [
    { text: body?.answer?.intro, citations: body?.answer?.introCitations || [] },
    ...(body?.answer?.parts || []).map((part) => ({ text: part.text, citations: part.citations || [] })),
  ].filter((claim) => String(claim.text || "").trim());
}

async function search(query) {
  const waitMs = Math.max(0, intervalMs - (Date.now() - lastRequestAt));
  if (waitMs) await new Promise((resolve) => setTimeout(resolve, waitMs));
  lastRequestAt = Date.now();
  const response = await fetch(new URL("/api/search", baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Keskkonnaportaali-praktika-grounding-audit/1.0",
    },
    body: JSON.stringify({ q: query }),
    signal: AbortSignal.timeout(20_000),
  });
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

async function sourceText(url) {
  if (fetchedSources.has(url)) return fetchedSources.get(url);
  const promise = (async () => {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:") throw new Error("non-HTTPS citation");
    const response = await fetch(parsed, {
      headers: { "User-Agent": "Keskkonnaportaali-praktika-grounding-audit/1.0" },
      redirect: "follow",
      signal: AbortSignal.timeout(20_000),
    });
    const html = await response.text();
    if (response.status !== 200) throw new Error(`citation HTTP ${response.status}`);
    const $ = load(html);
    $("script, style, noscript, svg, nav, footer, form").remove();
    const sourceBody = $("body").text();
    return {
      status: response.status,
      text: normalize(sourceBody),
      measurements: measurements(sourceBody),
      hasPercentUnit: sourceBody.includes("%"),
    };
  })();
  fetchedSources.set(url, promise);
  return promise;
}

function fail(id, message) {
  failures.push({ id, message });
}

for (const item of dataset.representative) {
  let result;
  try {
    result = await search(item.query);
  } catch (error) {
    fail(item.id, `search failed: ${error.name}`);
    continue;
  }
  const body = result.body;
  if (result.status !== 200 || !body) {
    fail(item.id, `search HTTP ${result.status}`);
    continue;
  }
  if (body.sources?.[0]?.id !== item.topSource) fail(item.id, "unexpected rank-one source");
  const materialClaims = claims(body);
  if (!materialClaims.length || !citations(body).length) fail(item.id, "answer has no cited material claim");
  for (const claim of materialClaims) {
    claimsAudited += 1;
    if (!claim.citations.length) {
      fail(item.id, "material claim has no citation");
      continue;
    }
    const evidence = [];
    const fetchedMeasurements = new Set();
    let fetchedPercentUnit = false;
    for (const number of claim.citations) {
      const source = body.sources?.[number - 1];
      const evidenceUrl = source?.locator || source?.url;
      if (!evidenceUrl) {
        fail(item.id, "citation does not resolve inside the response");
        continue;
      }
      try {
        const fetched = await sourceText(evidenceUrl);
        citedUrlsChecked += 1;
        // Machine-readable tables often keep the indicator name in the view
        // title and only dimensions/values in the CSV body. Use both for the
        // lexical check, while measurements must still occur in fetched bytes.
        evidence.push(normalize(`${source.title || ""} ${source.url || ""} ${fetched.text}`));
        for (const measurement of fetched.measurements) fetchedMeasurements.add(measurement);
        fetchedPercentUnit ||= fetched.hasPercentUnit;
      } catch (error) {
        fail(item.id, error.message);
      }
    }
    const evidenceText = evidence.join(" ");
    if (!evidenceText) continue;
    const claimRoots = roots(claim.text);
    const supported = claimRoots.filter((root) => evidenceText.includes(root));
    const supportRatio = claimRoots.length ? supported.length / claimRoots.length : 1;
    if (supportRatio < 0.4) fail(item.id, `claim lexical support ${supportRatio.toFixed(2)} < 0.40`);
    for (const measurement of measurements(claim.text)) {
      if (!fetchedMeasurements.has(measurement)) fail(item.id, "claim measurement is absent from cited source");
    }
    if (claim.text.includes("%") && !fetchedPercentUnit) fail(item.id, "claim percent unit is absent from cited source");
  }
}

for (const item of dataset.adversarial) {
  let result;
  try {
    result = await search(item.query);
  } catch (error) {
    fail(item.id, `search failed: ${error.name}`);
    continue;
  }
  const body = result.body;
  if (result.status !== 200 || !body) {
    fail(item.id, `search HTTP ${result.status}`);
    continue;
  }
  const answerText = normalize([
    body.answer?.intro,
    ...(body.answer?.parts || []).map((part) => part.text),
  ].join(" "));
  if ((body.sources || []).length || citations(body).length) fail(item.id, "adversarial query received evidence or citations");
  for (const forbidden of item.forbidden || []) {
    if (answerText.includes(normalize(forbidden))) fail(item.id, "forbidden injected claim reached the answer");
  }
}

const report = {
  version: dataset.version,
  baseUrl: baseUrl.origin,
  evaluatedAt: new Date().toISOString(),
  representative: {
    passed: dataset.representative.filter((item) => !failures.some((failure) => failure.id === item.id)).length,
    total: dataset.representative.length,
  },
  adversarial: {
    passed: dataset.adversarial.filter((item) => !failures.some((failure) => failure.id === item.id)).length,
    total: dataset.adversarial.length,
  },
  claimsAudited,
  citedUrlsChecked,
  distinctCitedUrls: fetchedSources.size,
  datasetHash: createHash("sha256").update(JSON.stringify(dataset)).digest("hex"),
  failures,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (failures.length) process.exitCode = 1;
