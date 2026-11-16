import { createHmac, randomBytes } from "node:crypto";
import { evidencePackMatchesSources } from "./evidence-pack.mjs";
import {
  agentOrchestrationEnabled,
  PROVIDER_ANSWER_TIMEOUT_CEILING_MS,
  PROVIDER_ANSWER_TIMEOUT_DEFAULT_MS,
  runGroundedSearchOrchestration,
} from "./agent-orchestrator.mjs";
import {
  createRollingLlmBudget,
  createClientScopedLlmBudget,
  estimatedLlmBudgetUsage,
  llmBudgetDenial,
  resolveLlmRollingBudget,
  resolveLlmClientBudget,
  settleLlmReservation,
} from "./llm-budget.mjs";
import {
  LLM_GATEWAY_BASE_URL,
  LLM_GATEWAY_MODEL,
  resolveLlmReasoningEffort,
  validateLlmProviderUrl,
} from "./provider-policy.mjs";
import { requestApprovedPublicHttpsJsonPost } from "./public-https.mjs";
import { buildLlmRequest } from "./llm_prompt.mjs";
import { createUsageAccumulator, createUsageTelemetry, extractLlmBudgetUsage, extractLlmText } from "./llm_usage.mjs";
import { validCitations } from "./llm_claim_grounding.mjs";
import { validateGroundedAnswer } from "./llm_answer_validation.mjs";
import { parseLlmJson } from "./llm_response_parser.mjs";

const baseUrl = validateLlmProviderUrl(process.env.LLM_BASE_URL || LLM_GATEWAY_BASE_URL);
const LLM_PROVIDER_ORIGINS = new Set([new URL(baseUrl).origin]);
const model = String(process.env.LLM_MODEL || LLM_GATEWAY_MODEL);
const llmReasoningEffort = resolveLlmReasoningEffort(process.env.LLM_REASONING_EFFORT);
// Read the credential only after the destination has passed the startup
// invariant, so an invalid deployment can never attach it to a request.
const apiKey = String(process.env.LLM_API_KEY || "");
// The provider needs a long, bounded clock of its own. The earlier 45 s default
// with a 60 s ceiling aborted finished answers mid-generation, and the reader
// received the shorter deterministic draft instead. The caller's remaining
// answer budget still bounds each attempt; these values are only the ceiling.
// The numbers live in agent-orchestrator.mjs so both provider paths share one
// clock, and no smaller ceiling can sit behind this one.
export const LLM_TIMEOUT_DEFAULT_MS = PROVIDER_ANSWER_TIMEOUT_DEFAULT_MS;
export const LLM_TIMEOUT_CEILING_MS = PROVIDER_ANSWER_TIMEOUT_CEILING_MS;
export function resolveLlmTimeout(value = process.env.LLM_TIMEOUT_MS) {
  return Math.max(500, Math.min(Number(value) || LLM_TIMEOUT_DEFAULT_MS, LLM_TIMEOUT_CEILING_MS));
}
const timeoutMs = resolveLlmTimeout();
const llmRollingLimits = resolveLlmRollingBudget();
const llmRollingBudget = createRollingLlmBudget(llmRollingLimits);
const llmClientLimits = resolveLlmClientBudget();
const llmClientScopeSecret = randomBytes(32);
const llmScopedBudget = createClientScopedLlmBudget({
  globalBudget: llmRollingBudget,
  ...llmClientLimits,
});
function llmClientScopeKey(value) {
  return createHmac("sha256", llmClientScopeSecret)
    .update(String(value || "unknown").slice(0, 256))
    .digest("hex");
}
const circuitBreakMs = Math.max(60_000, Math.min(Number(process.env.LLM_CIRCUIT_BREAK_MS) || 15 * 60_000, 60 * 60_000));
export function resolveLlmConcurrency(value = process.env.LLM_MAX_CONCURRENCY) {
  // Keep provider work bounded; excess searches use the current-evidence draft.
  return Math.max(1, Math.min(Number(value) || 2, 8));
}
const maxConcurrentRequests = resolveLlmConcurrency();
let circuitOpenUntil = 0;
let consecutiveTimeouts = 0;
let activeRequests = 0;









export async function generateGroundedAnswer(query, draft, options = {}) {
  const attemptedProvider = `${agentOrchestrationEnabled() ? "openai-agents" : "codex-gateway"}/${model}`;
  const rejected = (
    status,
    reason,
    detail = "",
    usageTelemetry = createUsageTelemetry({ status: "deterministic_zero" }),
  ) => ({
    answer: null,
    acceptedClaims: [],
    attempt: { provider: attemptedProvider, status, reason, ...(detail ? { detail } : {}) },
    usage_telemetry: usageTelemetry,
  });
  const evidencePack = options.evidencePack;
  if (!evidencePackMatchesSources(evidencePack, draft?.sources)) return rejected("degraded", "evidence-insufficient");
  if (!apiKey || String(process.env.LLM_ENABLED || "true").toLowerCase() === "false") {
    return rejected("disabled", "disabled");
  }
  if (Date.now() < circuitOpenUntil) {
    return rejected("circuit-open", "capacity");
  }
  if (activeRequests >= maxConcurrentRequests) {
    return rejected("capacity-fallback", "capacity");
  }

  activeRequests += 1;
  try {
    const clientScopeKey = llmClientScopeKey(options.clientKey);
    const evidence = evidencePack.entries;
    const requestTimeoutMs = Math.max(250, Math.min(Number(options.timeoutMs) || timeoutMs, timeoutMs));
    if (requestTimeoutMs < 500 || options.signal?.aborted) {
      return rejected("degraded", "budget");
    }
    const request = buildLlmRequest({
      selectedModel: model,
      query,
      evidence,
      conversationContext: options.conversationContext || "",
      directIntroCitations: validCitations(draft.answer?.introCitations, draft.sources.length),
      directIntro: draft.answer?.intro || "",
      reasoningEffort: llmReasoningEffort,
    });
    const orchestrated = agentOrchestrationEnabled() && evidence.length > 1;
    const requestBody = JSON.stringify(request.body);
    let reservation = null;
    if (!orchestrated) {
      reservation = llmScopedBudget.reserve(clientScopeKey, estimatedLlmBudgetUsage({
        orchestrated: false,
        inputBytes: Buffer.byteLength(requestBody, "utf8"),
      }));
      if (!reservation.ok) {
        return rejected("budget-exhausted", "budget", reservation.reason);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    const signal = options.signal && typeof AbortSignal.any === "function"
      ? AbortSignal.any([controller.signal, options.signal])
      : controller.signal;
    let observedUsage;
    let providerRequestDispatched = false;
    const providerUsage = createUsageAccumulator();
    const telemetryForAttempt = () => {
      if (!providerRequestDispatched) return createUsageTelemetry({ status: "deterministic_zero" });
      const usage = orchestrated ? providerUsage.snapshot() : observedUsage || { requests: 1 };
      const hasTokens = usage && ["tokens", "totalTokens", "inputTokens", "outputTokens"]
        .some((field) => usage[field] !== undefined);
      const status = orchestrated
        ? providerUsage.status()
        : hasTokens ? "actual" : "unknown";
      return createUsageTelemetry({ status, usage });
    };
    try {
      let parsed;
      if (orchestrated) {
        const systemInstructions = request.body.input[0].content[0].text;
        const userInput = request.body.input[1].content[0].text;
        const agentRun = await runGroundedSearchOrchestration({
          apiKey,
          baseUrl,
          model,
          reasoningEffort: request.body.reasoning.effort,
          systemInstructions,
          userInput,
          signal,
          timeoutMs: requestTimeoutMs,
          onDispatch: () => {
            providerRequestDispatched = true;
            providerUsage.markDispatched();
          },
          onProviderUsage: (usage) => {
            providerUsage.add(usage);
          },
          reserveProviderRequest: (usage) => llmScopedBudget.reserve(clientScopeKey, usage),
          settleProviderRequest: (providerReservation, usage, settleOptions) => (
            settleLlmReservation(providerReservation, usage, settleOptions)
          ),
        });
        parsed = typeof agentRun.output === "string" ? parseLlmJson(agentRun.output) : agentRun.output;
      } else {
        providerRequestDispatched = true;
        const response = await requestApprovedPublicHttpsJsonPost(`${baseUrl}${request.endpoint}`, {
          approvedOrigins: LLM_PROVIDER_ORIGINS,
          headers: { Authorization: `Bearer ${apiKey}` },
          body: requestBody,
          signal,
          maximumRequestBytes: 256_000,
          maximumBytes: 1_000_000,
        });
        let payload;
        try {
          payload = JSON.parse(response.body);
        } catch {
          payload = null;
        }
        observedUsage = extractLlmBudgetUsage(payload);
        if (response.status < 200 || response.status >= 300) {
          const responseError = new Error(`LLM returned ${response.status}`);
          responseError.status = response.status;
          throw responseError;
        }
        if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
          throw new Error("LLM response returned invalid JSON");
        }
        parsed = parseLlmJson(extractLlmText(payload));
      }
      const validated = validateGroundedAnswer(parsed, draft, query, evidencePack);
      consecutiveTimeouts = 0;
      return {
        answer: validated.answer,
        acceptedClaims: validated.acceptedClaims,
        usage_telemetry: telemetryForAttempt(),
        attempt: {
          provider: `${orchestrated ? "openai-agents" : "codex-gateway"}/${model}`,
          status: validated.answer ? "ready" : "degraded",
          reason: validated.rejectionReason || "none",
          ...(validated.rejectionDetail ? { detail: validated.rejectionDetail } : {}),
        },
      };
    } catch (error) {
      const denial = llmBudgetDenial(error);
      if (denial) {
        return rejected("budget-exhausted", "budget", denial, telemetryForAttempt());
      }
      const locallyTimedOut = error.name === "AbortError"
        && controller.signal.aborted
        && !options.signal?.aborted;
      if (error.status === 429) {
        circuitOpenUntil = Date.now() + circuitBreakMs;
      } else if (locallyTimedOut) {
        consecutiveTimeouts += 1;
        if (consecutiveTimeouts >= 3) {
          circuitOpenUntil = Date.now() + 60_000;
          consecutiveTimeouts = 0;
        }
      } else if (error.name !== "AbortError") {
        consecutiveTimeouts = 0;
      }
      return rejected(
        "degraded",
        locallyTimedOut ? "timeout" : /invalid JSON|return JSON/iu.test(error.message) ? "invalid-output" : "provider-error",
        "",
        telemetryForAttempt(),
      );
    } finally {
      if (reservation) {
        settleLlmReservation(reservation, observedUsage, {
          chargeUnknown: providerRequestDispatched,
        });
      }
      clearTimeout(timer);
    }
  } finally {
    activeRequests = Math.max(0, activeRequests - 1);
  }
}

export function llmConfiguration() {
  return {
    enabled: Boolean(apiKey),
    provider: apiKey
      ? `${agentOrchestrationEnabled() ? "openai-agents" : "codex-gateway"}/${model}`
      : "deterministic-current-evidence",
    circuitOpen: Date.now() < circuitOpenUntil,
    rollingBudget: llmRollingBudget.snapshot(),
  };
}
