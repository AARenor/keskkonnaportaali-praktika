function boundedInteger(value, fallback, minimum, maximum) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) return fallback;
  return Math.max(minimum, Math.min(parsed, maximum));
}

export const AGENT_MANAGER_MAX_TURNS = 6;
export const AGENT_SPECIALIST_MAX_TURNS = 1;
export const AGENT_SPECIALIST_MAX_TOKENS = 700;

export function resolveLlmRollingBudget({
  windowMs = process.env.LLM_BUDGET_WINDOW_MS,
  requestBudget = process.env.LLM_ROLLING_REQUEST_BUDGET,
  tokenBudget = process.env.LLM_ROLLING_TOKEN_BUDGET,
} = {}) {
  return {
    windowMs: boundedInteger(windowMs, 60 * 60_000, 60_000, 24 * 60 * 60_000),
    requestBudget: boundedInteger(requestBudget, 60, 1, 10_000),
    tokenBudget: boundedInteger(tokenBudget, 240_000, 1_000, 100_000_000),
  };
}

export function resolveLlmClientBudget({
  windowMs = process.env.LLM_BUDGET_WINDOW_MS,
  requestBudget = process.env.LLM_CLIENT_REQUEST_BUDGET,
  tokenBudget = process.env.LLM_CLIENT_TOKEN_BUDGET,
  maximumClients = process.env.LLM_CLIENT_BUDGET_KEYS,
} = {}) {
  return {
    windowMs: boundedInteger(windowMs, 60 * 60_000, 60_000, 24 * 60 * 60_000),
    requestBudget: boundedInteger(requestBudget, 15, 1, 1_000),
    tokenBudget: boundedInteger(tokenBudget, 120_000, 1_000, 10_000_000),
    maximumClients: boundedInteger(maximumClients, 2_000, 100, 100_000),
  };
}

export function estimatedLlmBudgetUsage({ orchestrated = false, maxTokens = 3_200, inputBytes = 0 } = {}) {
  const managerTokens = boundedInteger(maxTokens, 3_200, 256, 4_000);
  const boundedInputBytes = Math.min(nonnegativeInteger(inputBytes) ?? 0, 256_000);
  const inputReservation = boundedInputBytes > 0 ? boundedInputBytes + 512 : 0;
  if (!orchestrated) return { requests: 1, tokens: managerTokens + inputReservation };

  // parallelToolCalls=false bounds a manager turn to one specialist call. A
  // sixth (last) manager turn can still invoke a tool before maxTurns stops the
  // run, so reserve one single-turn specialist for every possible manager turn.
  return {
    requests: AGENT_MANAGER_MAX_TURNS * (1 + AGENT_SPECIALIST_MAX_TURNS),
    tokens: AGENT_MANAGER_MAX_TURNS
      * (managerTokens + AGENT_SPECIALIST_MAX_TOKENS * AGENT_SPECIALIST_MAX_TURNS)
      + inputReservation,
  };
}

function nonnegativeInteger(value) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function normalizedProviderUsage(value, { defaultRequests = 0 } = {}) {
  const usage = value?.usage && typeof value.usage === "object" ? value.usage : value || {};
  const tokenCandidates = [usage.tokens, usage.totalTokens, usage.total_tokens]
    .map(nonnegativeInteger)
    .filter((candidate) => candidate !== null);
  const input = [usage.inputTokens, usage.input_tokens, usage.prompt_tokens]
    .map(nonnegativeInteger)
    .find((candidate) => candidate !== null);
  const output = [usage.outputTokens, usage.output_tokens, usage.completion_tokens]
    .map(nonnegativeInteger)
    .find((candidate) => candidate !== null);
  if (input !== undefined && output !== undefined) tokenCandidates.push(input + output);
  const requests = nonnegativeInteger(usage.requests);
  return {
    requests: requests ?? Math.max(0, Number(defaultRequests) || 0),
    ...(tokenCandidates.length ? { tokens: Math.max(...tokenCandidates) } : {}),
  };
}

export function llmBudgetDenial(error, maximumDepth = 4) {
  const seen = new Set();
  let current = error;
  const depthLimit = Math.max(1, Math.min(Number(maximumDepth) || 4, 8));
  for (let depth = 0; depth < depthLimit && current && !seen.has(current); depth += 1) {
    seen.add(current);
    if (current.code === "LLM_BUDGET_EXHAUSTED") {
      return String(current.reason || "token-budget-exhausted").slice(0, 80);
    }
    current = current.cause;
  }
  return null;
}

export function estimatedLlmBudgetTokens(options = {}) {
  return estimatedLlmBudgetUsage(options).tokens;
}

function reservationUsage(value, limits) {
  const candidate = typeof value === "number" ? { requests: 1, tokens: value } : value || {};
  return {
    requests: boundedInteger(candidate.requests, 1, 1, 1_000_000),
    tokens: boundedInteger(candidate.tokens, limits.tokenBudget, 1, Number.MAX_SAFE_INTEGER),
  };
}

function settledUsage(value, fallback) {
  const candidate = value && typeof value === "object" ? value : {};
  return {
    requests: boundedInteger(candidate.requests, fallback.requests, 0, Number.MAX_SAFE_INTEGER),
    tokens: boundedInteger(candidate.tokens, fallback.tokens, 0, Number.MAX_SAFE_INTEGER),
  };
}

export function settleLlmReservation(reservation, usage, { chargeUnknown = false } = {}) {
  if (!reservation?.ok) return false;
  const normalized = normalizedProviderUsage(usage);
  const requests = boundedInteger(normalized.requests, 0, 0, Number.MAX_SAFE_INTEGER);
  const hasObservedTokens = normalized.tokens !== undefined
    && !(chargeUnknown && requests > 0 && normalized.tokens === 0);
  const tokens = hasObservedTokens ? normalized.tokens : 0;
  if (requests > 0 || tokens > 0) {
    return reservation.commit({
      requests: Math.max(requests, tokens > 0 ? 1 : 0),
      ...(hasObservedTokens ? { tokens } : {}),
    });
  }
  return chargeUnknown ? reservation.commit() : reservation.release();
}

export function createRollingLlmBudget({
  windowMs = 60 * 60_000,
  requestBudget = 60,
  tokenBudget = 240_000,
  now = () => Date.now(),
} = {}) {
  const limits = resolveLlmRollingBudget({ windowMs, requestBudget, tokenBudget });
  const events = [];
  const reservations = new Map();
  let reservationId = 0;

  const prune = (at) => {
    const threshold = at - limits.windowMs;
    while (events.length && events[0].at <= threshold) events.shift();
  };

  const totals = (at) => {
    prune(at);
    const spent = events.reduce((sum, event) => ({
      requests: sum.requests + event.requests,
      tokens: sum.tokens + event.tokens,
    }), { requests: 0, tokens: 0 });
    for (const reservation of reservations.values()) {
      spent.requests += reservation.requests;
      spent.tokens += reservation.tokens;
    }
    return spent;
  };

  return {
    reserve(requestedUsage) {
      const at = Number(now());
      const requested = reservationUsage(requestedUsage, limits);
      const usage = totals(at);
      if (usage.requests + requested.requests > limits.requestBudget) {
        return { ok: false, reason: "request-budget-exhausted", usage: { ...usage }, limits: { ...limits } };
      }
      if (usage.tokens + requested.tokens > limits.tokenBudget) {
        return { ok: false, reason: "token-budget-exhausted", usage: { ...usage }, limits: { ...limits } };
      }
      const id = ++reservationId;
      reservations.set(id, requested);
      let settled = false;
      return {
        ok: true,
        commit(observedUsage) {
          if (settled) return false;
          settled = true;
          const reservation = reservations.get(id);
          reservations.delete(id);
          if (reservation) {
            const observed = settledUsage(observedUsage, reservation);
            if (observed.requests > 0 || observed.tokens > 0) {
              events.push({ at: Number(now()), ...observed });
            }
          }
          return Boolean(reservation);
        },
        release() {
          if (settled) return false;
          settled = true;
          return reservations.delete(id);
        },
      };
    },
    snapshot() {
      const at = Number(now());
      return { ...totals(at), reservations: reservations.size, limits: { ...limits } };
    },
  };
}

export function createClientScopedLlmBudget({
  globalBudget,
  windowMs = 60 * 60_000,
  requestBudget = 15,
  tokenBudget = 120_000,
  maximumClients = 2_000,
  now = () => Date.now(),
} = {}) {
  if (!globalBudget?.reserve) throw new TypeError("A global LLM budget is required");
  const limits = resolveLlmClientBudget({ windowMs, requestBudget, tokenBudget, maximumClients });
  const clients = new Map();
  const overflowBudget = createRollingLlmBudget({ ...limits, now });

  const clientBudget = (rawKey) => {
    const at = Number(now());
    const key = String(rawKey || "unknown").slice(0, 128) || "unknown";
    const existing = clients.get(key);
    if (existing) {
      existing.lastSeenAt = at;
      return existing.budget;
    }
    if (clients.size >= limits.maximumClients) {
      for (const [candidateKey, entry] of clients) {
        if (at - entry.lastSeenAt >= limits.windowMs && entry.budget.snapshot().reservations === 0) {
          clients.delete(candidateKey);
        }
      }
    }
    if (clients.size >= limits.maximumClients) return overflowBudget;
    const budget = createRollingLlmBudget({ ...limits, now });
    clients.set(key, { budget, lastSeenAt: at });
    return budget;
  };

  return {
    reserve(clientKey, requestedUsage) {
      const globalReservation = globalBudget.reserve(requestedUsage);
      if (!globalReservation.ok) return globalReservation;
      const scopedBudget = clientBudget(clientKey);
      const scopedReservation = scopedBudget.reserve(requestedUsage);
      if (!scopedReservation.ok) {
        globalReservation.release();
        return { ...scopedReservation, reason: `client-${scopedReservation.reason}` };
      }
      let settled = false;
      return {
        ok: true,
        commit(observedUsage) {
          if (settled) return false;
          settled = true;
          const globalCommitted = globalReservation.commit(observedUsage);
          const clientCommitted = scopedReservation.commit(observedUsage);
          return globalCommitted && clientCommitted;
        },
        release() {
          if (settled) return false;
          settled = true;
          const globalReleased = globalReservation.release();
          const clientReleased = scopedReservation.release();
          return globalReleased && clientReleased;
        },
      };
    },
    snapshot(clientKey) {
      return {
        global: globalBudget.snapshot(),
        client: clientBudget(clientKey).snapshot(),
        clientScopes: clients.size,
        limits: { ...limits },
      };
    },
  };
}
