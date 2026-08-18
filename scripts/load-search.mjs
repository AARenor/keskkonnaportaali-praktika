const options = Object.fromEntries(process.argv.slice(2).map((argument) => {
  const [key, ...rest] = argument.replace(/^--/u, "").split("=");
  return [key, rest.join("=") || true];
}));
const baseUrl = new URL(String(options["base-url"] || "http://127.0.0.1:4317"));
if (!["http:", "https:"].includes(baseUrl.protocol) || baseUrl.username || baseUrl.password) {
  throw new Error("--base-url must be an HTTP(S) origin without credentials");
}
const concurrency = Math.max(1, Math.min(Number(options.concurrency) || 20, 20));
const timeoutMs = Math.max(1_000, Math.min(Number(options["timeout-ms"]) || 20_000, 30_000));
const expectFallback = String(options["expect-fallback"] || "false").toLowerCase() === "true";
const testOverLimit = String(options["test-over-limit"] || "true").toLowerCase() !== "false";
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

async function request(query) {
  const startedAt = Date.now();
  try {
    const response = await fetch(new URL("/api/search", baseUrl), {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": "Keskkonnaportaali-praktika-load-audit/1.0",
      },
      body: JSON.stringify({ q: query }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return {
      status: response.status,
      durationMs: Date.now() - startedAt,
      fallback: [
        "Otsing võttis liiga kaua",
        "Osa allikaid ei vastanud",
        "Otsing on praegu koormatud",
      ].includes(body?.answer?.eyebrow),
      fallbackKind: body?.answer?.eyebrow || null,
      retryAfter: response.headers.get("retry-after"),
    };
  } catch (error) {
    return { status: null, durationMs: Date.now() - startedAt, fallback: false, error: error.name };
  }
}

function percentile(values, fraction) {
  if (!values.length) return null;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * fraction) - 1))];
}

const wallStartedAt = Date.now();
const results = await Promise.all(Array.from({ length: concurrency }, (_, index) => request(fixtures[index % fixtures.length])));
const wallDurationMs = Date.now() - wallStartedAt;
const overLimit = testOverLimit ? await request(fixtures[0]) : null;
const durations = results.map((result) => result.durationMs).sort((left, right) => left - right);
const statusCounts = Object.fromEntries([...new Set(results.map((result) => String(result.status || result.error || "unknown")))]
  .sort()
  .map((status) => [status, results.filter((result) => String(result.status || result.error || "unknown") === status).length]));
const report = {
  baseUrl: baseUrl.origin,
  evaluatedAt: new Date().toISOString(),
  concurrency,
  requestCount: results.length,
  wallDurationMs,
  latencyMs: {
    p50: percentile(durations, 0.5),
    p95: percentile(durations, 0.95),
    p99: percentile(durations, 0.99),
    max: durations.at(-1) || null,
  },
  statusCounts,
  fallbackCount: results.filter((result) => result.fallback).length,
  fallbackKinds: Object.fromEntries([...new Set(results.filter((result) => result.fallback).map((result) => result.fallbackKind))]
    .sort()
    .map((kind) => [kind, results.filter((result) => result.fallbackKind === kind).length])),
  timeoutCount: results.filter((result) => result.error === "TimeoutError").length,
  fiveHundredCount: results.filter((result) => Number(result.status) >= 500).length,
  status504Count: results.filter((result) => result.status === 504).length,
  overLimit: overLimit ? { status: overLimit.status, retryAfter: overLimit.retryAfter } : null,
  configuredClientTimeoutMs: timeoutMs,
  configuredRequestRetries: 0,
};
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);

const baselineOk = results.every((result) => result.status === 200)
  && results.every((result) => expectFallback ? result.fallback : true)
  && report.fiveHundredCount === 0
  && report.status504Count === 0
  && report.timeoutCount === 0;
const backpressureOk = !testOverLimit || (overLimit?.status === 429 && Boolean(overLimit.retryAfter));
if (!baselineOk || !backpressureOk) process.exitCode = 1;
