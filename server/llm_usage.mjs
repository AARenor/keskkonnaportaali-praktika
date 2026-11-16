const TOKEN_FIELDS = [
  ["tokens", ["tokens", "totalTokens", "total_tokens"]],
  ["inputTokens", ["inputTokens", "input_tokens", "prompt_tokens"]],
  ["cachedInputTokens", ["cachedInputTokens", "cached_input_tokens"]],
  ["outputTokens", ["outputTokens", "output_tokens", "completion_tokens"]],
  ["reasoningTokens", ["reasoningTokens", "reasoning_tokens"]],
];
const TELEMETRY_STATUSES = new Set(["actual", "unknown", "deterministic_zero", "cache_hit"]);

function nonnegativeInteger(value) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function firstInteger(...values) {
  for (const value of values) {
    const parsed = nonnegativeInteger(value);
    if (parsed !== null) return parsed;
  }
  return undefined;
}


export function normalizedProviderUsage(value, { defaultRequests = 0 } = {}) {
  const usage = value?.usage && typeof value.usage === "object" ? value.usage : value || {};
  const input = firstInteger(usage.inputTokens, usage.input_tokens, usage.prompt_tokens);
  const output = firstInteger(usage.outputTokens, usage.output_tokens, usage.completion_tokens);
  const cachedInput = firstInteger(
    usage.cachedInputTokens,
    usage.cached_input_tokens,
    usage.inputTokensDetails?.cachedTokens,
    usage.input_tokens_details?.cached_tokens,
    usage.promptTokensDetails?.cachedTokens,
    usage.prompt_tokens_details?.cached_tokens,
  );
  const reasoning = firstInteger(
    usage.reasoningTokens,
    usage.reasoning_tokens,
    usage.outputTokensDetails?.reasoningTokens,
    usage.output_tokens_details?.reasoning_tokens,
    usage.completionTokensDetails?.reasoningTokens,
    usage.completion_tokens_details?.reasoning_tokens,
  );
  const tokenCandidates = [usage.tokens, usage.totalTokens, usage.total_tokens]
    .map(nonnegativeInteger)
    .filter((candidate) => candidate !== null);
  if (input !== undefined && output !== undefined) tokenCandidates.push(input + output);
  const requests = nonnegativeInteger(usage.requests);
  const tokens = tokenCandidates.length ? Math.max(...tokenCandidates) : undefined;
  const requestFloor = Math.max(0, Number(defaultRequests) || 0);
  return {
    requests: requests === undefined ? requestFloor : Math.max(requests, requestFloor),
    ...(tokens !== undefined ? { tokens, totalTokens: tokens } : {}),
    ...(input !== undefined ? { inputTokens: input } : {}),
    ...(cachedInput !== undefined ? { cachedInputTokens: cachedInput } : {}),
    ...(output !== undefined ? { outputTokens: output } : {}),
    ...(reasoning !== undefined ? { reasoningTokens: reasoning } : {}),
  };
}

export function extractLlmBudgetUsage(payload) {
  const usage = payload?.usage;
  if (!usage || typeof usage !== "object") return { requests: 1 };
  return normalizedProviderUsage(usage, { defaultRequests: 1 });
}

export function extractLlmText(payload) {
  return payload?.output_text
    || payload?.output?.flatMap((item) => item?.content || []).find((item) => item?.type === "output_text")?.text
    || "";
}

export function createUsageAccumulator() {
  let requests = 0;
  let dispatchedRequests = 0;
  let pendingRequests = 0;
  let count = 0;
  let unknownUsage = false;
  const totals = Object.fromEntries(TOKEN_FIELDS.map(([field]) => [field, 0]));
  const known = Object.fromEntries(TOKEN_FIELDS.map(([field]) => [field, true]));
  return {
    markDispatched(requestCount = 1) {
      const amount = nonnegativeInteger(requestCount) ?? 1;
      dispatchedRequests += amount;
      pendingRequests += amount;
    },
    add(value) {
      const normalized = normalizedProviderUsage(value, { defaultRequests: 1 });
      requests += normalized.requests;
      dispatchedRequests = Math.max(dispatchedRequests, requests);
      pendingRequests = Math.max(0, pendingRequests - normalized.requests);
      count += 1;
      if (!TOKEN_FIELDS.some(([field]) => normalized[field] !== undefined)) unknownUsage = true;
      for (const [field] of TOKEN_FIELDS) {
        if (normalized[field] === undefined) {
          known[field] = false;
        } else if (known[field]) {
          totals[field] += normalized[field];
        }
      }
    },
    snapshot() {
      const totalRequests = Math.max(requests, dispatchedRequests);
      if (pendingRequests > 0) return { requests: totalRequests };
      if (!count) {
        return {
          requests: totalRequests,
          tokens: 0,
          totalTokens: 0,
          inputTokens: 0,
          cachedInputTokens: 0,
          outputTokens: 0,
          reasoningTokens: 0,
        };
      }
      return {
        requests: totalRequests,
        ...Object.fromEntries(TOKEN_FIELDS.flatMap(([field]) => (
          known[field] ? [[field, totals[field]]] : []
        ))),
        ...(known.tokens ? { totalTokens: totals.tokens } : {}),
      };
    },
    status() {
      if (pendingRequests > 0) return "unknown";
      return !count && !requests && !dispatchedRequests
        ? "deterministic_zero"
        : unknownUsage ? "unknown" : "actual";
    },
  };
}

function rateAmount(value) {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function safeRateProvenance(value) {
  const text = String(value || "").trim();
  if (!text || text.length > 160 || /(?:api[_ -]?key|secret|bearer|token|sk-[a-z\d])/iu.test(text)) return null;
  return text;
}

function resolveLlmCostRates({
  inputPerMillion = process.env.LLM_INPUT_RATE_PER_MILLION,
  cachedInputPerMillion = process.env.LLM_CACHED_INPUT_RATE_PER_MILLION,
  outputPerMillion = process.env.LLM_OUTPUT_RATE_PER_MILLION,
  currency = process.env.LLM_RATE_CURRENCY,
  provenance = process.env.LLM_RATE_PROVENANCE,
} = {}) {
  const input = rateAmount(inputPerMillion);
  const output = rateAmount(outputPerMillion);
  const cachedInput = rateAmount(cachedInputPerMillion);
  const normalizedCurrency = String(currency || "").trim().toUpperCase();
  const safeProvenance = safeRateProvenance(provenance);
  if (input === null || output === null || !/^[A-Z]{3}$/u.test(normalizedCurrency) || !safeProvenance) return null;
  return {
    inputPerMillion: input,
    ...(cachedInput !== null ? { cachedInputPerMillion: cachedInput } : {}),
    outputPerMillion: output,
    currency: normalizedCurrency,
    provenance: safeProvenance,
  };
}

function unavailableCost() {
  return {
    amount: null,
    currency: null,
    rate_provenance: null,
    status: "unavailable",
  };
}

function estimateCost(usage, rates) {
  const resolved = rates === undefined
    ? resolveLlmCostRates()
    : rates && typeof rates === "object" ? resolveLlmCostRates(rates) : null;
  if (!resolved
    || usage.inputTokens === undefined
    || usage.cachedInputTokens === undefined
    || usage.outputTokens === undefined
    || usage.cachedInputTokens > usage.inputTokens
    || (usage.cachedInputTokens > 0 && resolved.cachedInputPerMillion === undefined)) {
    return unavailableCost();
  }
  const uncachedInput = usage.inputTokens - usage.cachedInputTokens;
  const cachedRate = resolved.cachedInputPerMillion ?? resolved.inputPerMillion;
  const amount = (
    uncachedInput * resolved.inputPerMillion
    + usage.cachedInputTokens * cachedRate
    + usage.outputTokens * resolved.outputPerMillion
  ) / 1_000_000;
  if (!Number.isFinite(amount)) return unavailableCost();
  return {
    amount: Number(amount.toFixed(8)),
    currency: resolved.currency,
    rate_provenance: resolved.provenance,
    status: "estimated",
  };
}

function zeroTelemetry(status) {
  return {
    status,
    requests: 0,
    input_tokens: 0,
    cached_input_tokens: 0,
    reasoning_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_estimate: {
      amount: 0,
      currency: null,
      rate_provenance: null,
      status: "zero_new_work",
    },
  };
}

export function createUsageTelemetry({ status, usage, rates } = {}) {
  if (status === "deterministic_zero" || status === "cache_hit") return zeroTelemetry(status);
  const normalized = normalizedProviderUsage(usage);
  const hasTokens = TOKEN_FIELDS.some(([field]) => normalized[field] !== undefined);
  const resolvedStatus = TELEMETRY_STATUSES.has(status)
    ? status
    : hasTokens ? "actual" : "unknown";
  if (resolvedStatus === "deterministic_zero" || resolvedStatus === "cache_hit") return zeroTelemetry(resolvedStatus);
  const cost = resolvedStatus === "actual" ? estimateCost(normalized, rates) : unavailableCost();
  return {
    status: resolvedStatus,
    requests: normalized.requests,
    input_tokens: normalized.inputTokens ?? null,
    cached_input_tokens: normalized.cachedInputTokens ?? null,
    reasoning_tokens: normalized.reasoningTokens ?? null,
    output_tokens: normalized.outputTokens ?? null,
    total_tokens: normalized.totalTokens ?? normalized.tokens ?? null,
    cost_estimate: cost,
  };
}

function scaledUsage(usage, count) {
  const normalized = normalizedProviderUsage(usage);
  const scaled = { requests: normalized.requests * count };
  for (const [field] of TOKEN_FIELDS) {
    if (normalized[field] !== undefined) scaled[field] = normalized[field] * count;
  }
  if (normalized.tokens !== undefined) scaled.totalTokens = normalized.tokens * count;
  return scaled;
}

export function estimateLlmUsageScenarios(sampleUsage, counts = [1, 10, 100], rates) {
  const source = sampleUsage?.usage_telemetry || sampleUsage || {};
  const status = TELEMETRY_STATUSES.has(source.status) ? source.status : undefined;
  return counts.map((value) => {
    const searches = nonnegativeInteger(value);
    if (searches === null) throw new TypeError("Scenario counts must be nonnegative integers");
    const usage = scaledUsage(source, searches);
    return {
      searches,
      usage_telemetry: createUsageTelemetry({ status, usage, rates }),
    };
  });
}
