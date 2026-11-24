export const LLM_GATEWAY_BASE_URL = "https://terrapoint.arle.top/v1";
export const LLM_GATEWAY_MODEL = "openai-codex/gpt-6-luna";

// A deployment can name the models it trusts, in order. The gateway exposes
// several providers, so a spent account on the first model must not turn the
// whole answer path deterministic: the next model answers the same request.
export function resolveLlmModelChain(primary = process.env.LLM_MODEL || LLM_GATEWAY_MODEL, fallbacks = process.env.LLM_MODEL_FALLBACKS) {
  const configured = String(fallbacks || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set([String(primary || "").trim(), ...configured].filter(Boolean))];
}

export function isRetryableLlmProviderFailure(error) {
  const status = Number(error?.status);
  if ([401, 402, 403, 404, 408, 429].includes(status)) return true;
  if (Number.isFinite(status) && status >= 500 && status < 600) return true;
  return /usage_limit_reached|insufficient_credits|model_not_granted|no available server|invalid JSON|return JSON/iu
    .test(String(error?.message || ""));
}

export function resolveLlmReasoningEffort(value = "low") {
  if (value !== "low" && value !== "medium") {
    throw new Error("LLM_REASONING_EFFORT must be low or medium");
  }
  return value;
}

export function validateLlmProviderUrl(value) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("LLM_BASE_URL must be a valid approved HTTPS provider URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("LLM_BASE_URL must be credential-free HTTPS without query parameters or fragments");
  }
  const pathname = url.pathname.replace(/\/+$/u, "");
  if (url.port || `${url.origin}${pathname}` !== LLM_GATEWAY_BASE_URL) {
    throw new Error("LLM_BASE_URL must be the approved model gateway /v1 base");
  }
  return LLM_GATEWAY_BASE_URL;
}
