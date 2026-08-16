import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SEARCH_DOCUMENTS, searchEnvironment } from "./search.mjs";

const app = express();
const port = Number(process.env.PORT || 3000);
const terrapointBase = String(process.env.TERRAPOINT_API_URL || "https://terrapoint.ee").replace(/\/$/, "");
const publicOrigin = String(process.env.PUBLIC_ORIGIN || "").replace(/\/+$/, "");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const clientRoot = path.join(root, "dist", "client");
const cache = new Map();
const requestWindows = new Map();

app.disable("x-powered-by");
app.set("trust proxy", 1);
app.use((request, response, next) => {
  const forwardedProto = String(request.headers["x-forwarded-proto"] || "")
    .split(",")[0]
    .trim()
    .toLowerCase();
  let cloudflareProto = "";
  try {
    cloudflareProto = String(JSON.parse(String(request.headers["cf-visitor"] || "{}"))?.scheme || "")
      .trim()
      .toLowerCase();
  } catch {
    cloudflareProto = "";
  }
  if (publicOrigin && (forwardedProto === "http" || cloudflareProto === "http")) {
    return response.redirect(308, `${publicOrigin}${request.originalUrl}`);
  }
  return next();
});
app.use(express.json({ limit: "32kb" }));
app.use((request, response, next) => {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader("X-Robots-Tag", "noindex, nofollow");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; img-src 'self' data: https://tile.openstreetmap.org; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-src 'self' https://www.openstreetmap.org; frame-ancestors 'self'; base-uri 'self'; form-action 'self'",
  );
  next();
});

function rateLimit(request, response, next) {
  const now = Date.now();
  const key = request.ip || "unknown";
  const current = requestWindows.get(key);
  if (!current || now - current.startedAt > 60_000) {
    requestWindows.set(key, { startedAt: now, count: 1 });
    return next();
  }
  current.count += 1;
  if (current.count > 120) {
    response.setHeader("Retry-After", "60");
    return response.status(429).json({ error: "Liiga palju päringuid. Proovi minuti pärast uuesti." });
  }
  return next();
}

app.use("/api", rateLimit);

app.get("/api/health", (_request, response) => {
  response.json({
    status: "ok",
    service: "keskkonnaportaali-praktika",
    searchDocuments: SEARCH_DOCUMENTS.length,
    terrapointProxy: true,
    timestamp: new Date().toISOString(),
  });
});

app.get("/api/search", (request, response) => {
  const query = String(request.query.q || "").trim();
  if (!query) return response.status(400).json({ error: "Sisesta otsingusõna." });
  if (query.length > 180) return response.status(400).json({ error: "Otsing on liiga pikk." });
  response.setHeader("Cache-Control", "public, max-age=60, stale-while-revalidate=300");
  return response.json(searchEnvironment(query));
});

function safePathSegment(value, maxLength = 180) {
  const clean = String(value || "").trim();
  if (!clean || clean.length > maxLength) return null;
  return encodeURIComponent(clean);
}

async function cachedJson(url, ttlMs) {
  const now = Date.now();
  const cached = cache.get(url);
  if (cached && now - cached.savedAt < ttlMs) {
    return { data: cached.data, cache: "hit", stale: false };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 22_000);
  try {
    const upstream = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "Keskkonnaportaali-praktika/1.0" },
      signal: controller.signal,
    });
    if (!upstream.ok) {
      const error = new Error(`Terrapoint vastas staatusega ${upstream.status}`);
      error.upstreamStatus = upstream.status;
      throw error;
    }
    const data = await upstream.json();
    cache.set(url, { savedAt: now, data });
    return { data, cache: "miss", stale: false };
  } catch (error) {
    if (cached && now - cached.savedAt < 24 * 60 * 60 * 1000) {
      return { data: cached.data, cache: "stale", stale: true };
    }
    error.isTimeout = error.name === "AbortError";
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function terrapointError(response, error) {
  const timeout = Boolean(error.isTimeout);
  return response.status(timeout ? 504 : 502).json({
    code: timeout ? "TERRAPOINT_TIMEOUT" : "TERRAPOINT_UNAVAILABLE",
    error: timeout
      ? "Terrapointi päring võttis liiga kaua. Proovi uuesti; ülejäänud portaal töötab edasi."
      : "Terrapointi andmeallikas ei vastanud. Proovi hetke pärast uuesti.",
    retryable: true,
  });
}

app.get("/api/terrapoint/address", async (request, response) => {
  const query = safePathSegment(request.query.q, 120);
  if (!query) return response.status(400).json({ error: "Sisesta aadress või kohanimi." });
  try {
    const result = await cachedJson(`${terrapointBase}/api/address/${query}`, 10 * 60 * 1000);
    response.setHeader("Cache-Control", "public, max-age=300");
    return response.json({ ...result.data, proxy: { cache: result.cache, stale: result.stale } });
  } catch (error) {
    return terrapointError(response, error);
  }
});

app.get("/api/terrapoint/parcel/:number", async (request, response) => {
  const number = String(request.params.number || "").trim();
  if (!/^\d{5}:\d{3}:\d{4}$/.test(number)) {
    return response.status(400).json({ error: "Katastritunnus peab olema kujul 12345:678:9012." });
  }
  try {
    const encoded = encodeURIComponent(number);
    const result = await cachedJson(
      `${terrapointBase}/api/search/${encoded}?include_map_layers=false`,
      30 * 60 * 1000,
    );
    response.setHeader("Cache-Control", "public, max-age=600");
    return response.json({ ...result.data, proxy: { cache: result.cache, stale: result.stale } });
  } catch (error) {
    return terrapointError(response, error);
  }
});

app.use(
  express.static(clientRoot, {
    etag: true,
    index: false,
    maxAge: "7d",
    setHeaders(response, filePath) {
      if (filePath.endsWith("index.html")) response.setHeader("Cache-Control", "no-cache");
    },
  }),
);

app.use((request, response, next) => {
  if (!["GET", "HEAD"].includes(request.method) || !request.accepts("html")) return next();
  response.setHeader("Cache-Control", "no-cache");
  return response.sendFile(path.join(clientRoot, "index.html"));
});

app.use((_request, response) => response.status(404).json({ error: "Lehte ei leitud." }));

app.listen(port, "0.0.0.0", () => {
  process.stdout.write(`Keskkonnaportaali praktika listening on ${port}\n`);
});
