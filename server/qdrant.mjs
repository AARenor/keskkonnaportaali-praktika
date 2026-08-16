import { createHash } from "node:crypto";

const VECTOR_SIZE = 256;
const qdrantUrl = String(process.env.QDRANT_URL || "").replace(/\/+$/, "");
const qdrantApiKey = String(process.env.QDRANT_API_KEY || "");
const collection = String(process.env.QDRANT_COLLECTION || "keskkonnaportaali_praktika_sources");
let readyPromise;

function hash32(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokens(value) {
  const clean = String(value)
    .toLocaleLowerCase("et")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const words = clean.split(/\s+/).filter((word) => word.length > 1);
  const grams = words.flatMap((word) => {
    const wrapped = `^${word}$`;
    const parts = [];
    for (let index = 0; index <= wrapped.length - 3; index += 1) parts.push(wrapped.slice(index, index + 3));
    return parts;
  });
  return [...words.map((word) => `w:${word}`), ...grams.map((gram) => `g:${gram}`)];
}

export function localEmbedding(value) {
  const vector = Array(VECTOR_SIZE).fill(0);
  for (const token of tokens(value)) {
    const hash = hash32(token);
    const index = hash % VECTOR_SIZE;
    vector[index] += hash & 1 ? 1 : -1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0)) || 1;
  return vector.map((item) => item / magnitude);
}

function pointId(id) {
  const hash = createHash("sha256").update(String(id)).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

async function qdrantRequest(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await fetch(`${qdrantUrl}${path}`, {
      ...options,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(qdrantApiKey ? { "api-key": qdrantApiKey } : {}),
        ...options.headers,
      },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`Qdrant returned ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function ensureCollection() {
  if (!qdrantUrl) return false;
  if (!readyPromise) {
    readyPromise = (async () => {
      try {
        await qdrantRequest(`/collections/${encodeURIComponent(collection)}`);
      } catch {
        await qdrantRequest(`/collections/${encodeURIComponent(collection)}`, {
          method: "PUT",
          body: JSON.stringify({ vectors: { size: VECTOR_SIZE, distance: "Cosine" } }),
        });
      }
      return true;
    })().catch((error) => {
      readyPromise = undefined;
      throw error;
    });
  }
  return readyPromise;
}

function documentText(document) {
  return [document.title, document.summary, document.organization, ...(document.tags || [])].filter(Boolean).join(" ");
}

export async function rerankWithQdrant(query, documents, limit = 8) {
  if (!qdrantUrl || !documents.length) {
    return { documents, status: qdrantUrl ? "empty" : "disabled", collection: qdrantUrl ? collection : null };
  }

  try {
    await ensureCollection();
    await qdrantRequest(`/collections/${encodeURIComponent(collection)}/points?wait=true`, {
      method: "PUT",
      body: JSON.stringify({
        points: documents.map((document) => ({
          id: pointId(document.id),
          vector: localEmbedding(documentText(document)),
          payload: {
            sourceId: document.id,
            title: document.title,
            url: document.url,
            sourceSystem: document.sourceSystem || document.organization,
          },
        })),
      }),
    });
    const result = await qdrantRequest(`/collections/${encodeURIComponent(collection)}/points/query`, {
      method: "POST",
      body: JSON.stringify({ query: localEmbedding(query), limit: Math.max(limit, documents.length), with_payload: true }),
    });
    const points = result?.result?.points || result?.result || [];
    const semantic = new Map(points.map((point) => [point?.payload?.sourceId, Number(point.score || 0)]));
    const maxLexical = Math.max(...documents.map((document) => Number(document.score || 0)), 1);
    const ranked = [...documents]
      .map((document) => ({
        ...document,
        semanticScore: semantic.get(document.id) || 0,
        combinedScore: (Number(document.score || 0) / maxLexical) * 0.68 + (semantic.get(document.id) || 0) * 0.32,
      }))
      .sort((a, b) => b.combinedScore - a.combinedScore || Number(b.score || 0) - Number(a.score || 0));
    return { documents: ranked, status: "ready", collection };
  } catch (error) {
    return { documents, status: "degraded", collection, error: error.message };
  }
}

export function qdrantConfiguration() {
  return { enabled: Boolean(qdrantUrl), collection };
}
