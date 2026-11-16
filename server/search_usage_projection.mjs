import { createUsageTelemetry } from "./llm_usage.mjs";

const USAGE_STATUSES = new Set(["actual", "unknown", "deterministic_zero", "cache_hit"]);
const ZERO_USAGE_STATUSES = new Set(["deterministic_zero", "cache_hit"]);
const COUNT_FIELDS = [
  "requests",
  "input_tokens",
  "cached_input_tokens",
  "reasoning_tokens",
  "output_tokens",
  "total_tokens",
];
const RATE_PROVENANCE_PATTERN = /^[A-Za-z0-9_. -]{1,64}$/u;
const RATE_SECRET_PATTERN = /(?:https?:|api[_ -]?key|secret|token|bearer|sk-[a-z0-9])/iu;

function safeCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
function hasMalformedCounter(value) {
  return COUNT_FIELDS.some((field) => value[field] !== undefined
    && value[field] !== null
    && safeCount(value[field]) === null);
}

function hasTokenCount(value) {
  return COUNT_FIELDS.slice(1).some((field) => safeCount(value[field]) !== null);
}


function publicCostEstimate(value, usageStatus) {
  if (ZERO_USAGE_STATUSES.has(usageStatus)) {
    return { amount: 0, currency: null, rate_provenance: null, status: "zero_new_work" };
  }
  if (usageStatus === "unknown") {
    return { amount: null, currency: null, rate_provenance: null, status: "unavailable" };
  }
  const cost = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const amount = typeof cost.amount === "number" && Number.isFinite(cost.amount) && cost.amount >= 0
    ? cost.amount
    : null;
  const currency = typeof cost.currency === "string" && /^[A-Z]{3}$/u.test(cost.currency)
    ? cost.currency
    : null;
  const rateProvenance = typeof cost.rate_provenance === "string"
    && RATE_PROVENANCE_PATTERN.test(cost.rate_provenance)
    && !RATE_SECRET_PATTERN.test(cost.rate_provenance)
    ? cost.rate_provenance
    : null;
  if (cost.status !== "estimated" || amount === null || !currency || !rateProvenance) {
    return { amount: null, currency: null, rate_provenance: null, status: "unavailable" };
  }
  return { amount, currency, rate_provenance: rateProvenance, status: "estimated" };
}

export function publicUsageTelemetry(value) {
  if (!value || typeof value !== "object" || Array.isArray(value) || !USAGE_STATUSES.has(value.status)) return null;
  const status = value.status === "actual" && (hasMalformedCounter(value) || !hasTokenCount(value))
    ? "unknown"
    : value.status;
  const usage = ZERO_USAGE_STATUSES.has(status)
    ? Object.fromEntries(COUNT_FIELDS.map((field) => [field, 0]))
    : Object.fromEntries(COUNT_FIELDS.map((field) => [field, safeCount(value[field])]));
  if (status === "unknown") {
    for (const field of COUNT_FIELDS.slice(1)) usage[field] = null;
  }
  return {
    status,
    ...usage,
    cost_estimate: publicCostEstimate(value.cost_estimate, status),
  };
}

export function searchUsageTelemetry(result, { modelStarted = false } = {}) {
  const supplied = publicUsageTelemetry(result?.usage_telemetry);
  if (supplied) return supplied;
  return publicUsageTelemetry(modelStarted
    ? createUsageTelemetry({ status: "unknown", usage: { requests: 1 } })
    : createUsageTelemetry({ status: "deterministic_zero" }));
}

export function cacheHitUsageTelemetry() {
  return publicUsageTelemetry(createUsageTelemetry({ status: "cache_hit" }));
}

