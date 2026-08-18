const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.join("=") || true];
}));
const baseUrl = new URL(String(options["base-url"] || "http://127.0.0.1:4317"));
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error("--base-url must be an HTTP(S) origin without credentials");
}
const endpoint = String(options.endpoint || "search").toLowerCase();
if (!["search", "results"].includes(endpoint)) throw new Error("--endpoint must be search or results");
const endpointPath = endpoint === "results" ? "/api/search/results" : "/api/search";
const resultsEndpoint = endpoint === "results";
const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 20, 20));
const serverConcurrency = options["server-concurrency"] === undefined
  ? null
  : Math.max(1, Math.min(Number(options["server-concurrency"]) || 8, 20));
const timeoutMs = Math.max(1_000, Math.min(Number(options["timeout-ms"]) || 20_000, 30_000));
const expectFallback = String(options["expect-fallback"] || "false").toLowerCase() === "true";
const expectAi = String(options["expect-ai"] || "false").toLowerCase() === "true";
const testOverLimit = String(options["test-over-limit"] || "true").toLowerCase() !== "false";
const spoofForwarded = String(options["spoof-forwarded"] || "false").toLowerCase() === "true";
const fixtures = [
  "Kas Eestis tohib vanu rehve põletada?",
  "Natura 2000 piirangud ehitamisel",
  "jäätmete ringlussevõtu määr Eestis 2023",
  "kliimamuutuse mõju sademetele Eestis",
  "elektriauto keskkonnamõju",
  "mere seisund Läänemeres 2024",
  "kaevandamise keskkonnamõju Ida-Virumaal",
  "kiirgusseire tulemused Eestis",
  "ajalooline temperatuur Tartus 2020",
  "keskkonnamõju hindamine tuulepargile",
  "keskkonnaloa taotlemine ettevõttele",
  "KESE keskkonnaseire mõõtmistulemused",
  "mullaseire tulemused Eestis",
  "jäätmekäitluskohad Pärnumaal",
  "hüdroloogilised seireandmed Emajõel 2025",
  "pohjavee seisund Harjumaal 2024",
  "keskkonnaloa taotlemne ettevõtele",
  "elektriautode keskkonnamõjud kogu elutsükli jooksul",
  "kuhu ma vanad rehvid viin või kas võin neid lõkkes põletada",
  "Kas elektriauto on kogu elutsükli jooksul sisepõlemisautost keskkonnasõbralikum?"
];

function citationCount(body) {
  const citations = new Set([
    ...(body?.answer?.introCitations || []),
    ...(body?.answer?.parts || []).flatMap((part) => part.citations || []),
  ].filter((value) => Number.isInteger(value) && value > 0));
  return citations.size;
}

function responseClass(status, body, retryAfter) {
  if (status === 429 && resultsEndpoint && retryAfter === "2") return "capacity_backpressure";
  if (status === 429) return "rate_limited";
  if (status !== 200) return "http_error";
  if (resultsEndpoint) return Array.isArray(body?.items) ? "results_ready" : "unknown_success";
  const eyebrow = String(body?.answer?.eyebrow || "");
  if (eyebrow === "AI koondvastus") return "ai_ready";
  if (eyebrow === "Otsing on praegu koormatud") return "capacity_fallback";
  if (["Otsing võttis liiga kaua", "Osa allikaid ei vastanud", "Allikapõhine kokkuvõte", "Kontrollitud allikaotsing"].includes(eyebrow)) {
    return "evidence_fallback";
  }
  if (eyebrow) return "deterministic_route";
  return "unknown_success";
}

async function request(query, index = 0) {
  const startedAt = Date.now();
  try {
    const headers = {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Keskkonnaportaali-praktika-load-audit/1.0",
    };
    if (spoofForwarded) headers["X-Forwarded-For"] = `198.51.100.${(index % 200) + 1}`;
    const response = await fetch(new URL(endpointPath, baseUrl), {
      method: "POST",
      headers,
      body: JSON.stringify({ q: query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    const retryAfter = response.headers.get("retry-after");
    return {
      index,
      status: response.status,
      durationMs: Date.now() - startedAt,
      fallback: [
        "Otsing võttis liiga kaua",
        "Osa allikaid ei vastanud",
        "Otsing on praegu koormatud",
      ].includes(body?.answer?.eyebrow),
      fallbackKind: body?.answer?.eyebrow || null,
      aiReady: body?.answer?.eyebrow === "AI koondvastus",
      eyebrow: body?.answer?.eyebrow || null,
      responseClass: responseClass(response.status, body, retryAfter),
      citationCount: citationCount(body),
      sourceCount: Array.isArray(body?.sources) ? body.sources.length : 0,
      itemCount: Array.isArray(body?.items) ? body.items.length : 0,
      retryAfter,
    };
  } catch (error) {
    return {
      index,
      status: null,
      durationMs: Date.now() - startedAt,
      fallback: false,
      responseClass: "network_error",
      citationCount: 0,
      sourceCount: 0,
      error: error.name,
    };
  }
}

function percentile(values, fraction) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1))];
}

const wallStartedAt = Date.now();
const results = await Promise.all(Array.from({ length: concurrency }, (_, index) => request(fixtures[index % fixtures.length], index)));
const wallDurationMs = Date.now() - wallStartedAt;
const overLimit = testOverLimit ? await request(fixtures[0], concurrency) : null;
const durations = results.map((result) => result.durationMs).sort((left, right) => left - right);
const statusCounts = Object.fromEntries([...new Set(results.map((result) => String(result.status || result.error || "unknown")))]
  .sort()
  .map((status) => [status, results.filter((result) => String(result.status || result.error || "unknown") === status).length]));
const responseClasses = Object.fromEntries([...new Set(results.map((result) => result.responseClass))]
  .sort()
  .map((kind) => [kind, results.filter((result) => result.responseClass === kind).length]));
const report = {
  baseUrl: baseUrl.origin,
  endpoint: endpointPath,
  evaluatedAt: new Date().toISOString(),
  concurrency,
  serverConcurrency,
  requestCount: results.length,
  wallDurationMs,
  latencyMs: {
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    max: durations.at(-1) || null,
  },
  statusCounts,
  responseClasses,
  capacityBackpressureCount: results.filter((result) => result.responseClass === "capacity_backpressure").length,
  expectedCapacityBackpressureCount: serverConcurrency === null
    ? null
    : Math.max(0, concurrency - serverConcurrency),
  fallbackCount: results.filter((result) => result.fallback).length,
  aiReadyCount: results.filter((result) => result.aiReady).length,
  fallbackKinds: Object.fromEntries([...new Set(results.filter((result) => result.fallback).map((result) => result.fallbackKind))]
    .sort()
    .map((kind) => [kind, results.filter((result) => result.fallbackKind === kind).length])),
  timeoutCount: results.filter((result) => result.error === "TimeoutError").length,
  fiveHundredCount: results.filter((result) => Number(result.status) >= 500).length,
  status504Count: results.filter((result) => result.status === 504).length,
  rows: results.map((result) => ({
    index: result.index + 1,
    status: result.status,
    responseClass: result.responseClass,
    eyebrow: result.eyebrow || null,
    citationCount: result.citationCount,
    sourceCount: result.sourceCount,
    itemCount: result.itemCount,
    durationMs: result.durationMs,
  })),
  overLimit: overLimit ? {
    status: overLimit.status,
    responseClass: overLimit.responseClass,
    retryAfter: overLimit.retryAfter,
  } : null,
  configuredClientTimeoutMs: timeoutMs,
  configuredRequestRetries: 0,
  spoofedForwardedAddresses: spoofForwarded ? concurrency + Number(testOverLimit) : 0,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

const resultsBoundaryOk = !resultsEndpoint || (
  results.every((result) => ["results_ready", "capacity_backpressure"].includes(result.responseClass))
  && (serverConcurrency === null
    || report.capacityBackpressureCount === report.expectedCapacityBackpressureCount)
);
const searchBoundaryOk = resultsEndpoint || (
  results.every((result) => result.status === 200)
  && results.every((result) => result.responseClass !== "unknown_success")
  && results.every((result) => expectFallback ? result.fallback : true)
  && (!expectAi || results.some((result) => result.aiReady))
);
const baselineOk = resultsBoundaryOk
  && searchBoundaryOk
  && report.fiveHundredCount === 0
  && report.status504Count === 0
  && report.timeoutCount === 0;
const backpressureOk = !testOverLimit || (overLimit?.status === 429 && Boolean(overLimit.retryAfter));
if (!baselineOk || !backpressureOk) process.exitCode = 1;
