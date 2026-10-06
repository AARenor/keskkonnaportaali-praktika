export const LLM_GATEWAY_BASE_URL = "https://terrapoint.arleserver.cfd/v1";
export const LLM_GATEWAY_MODEL = "openai-codex/gpt-6-luna";

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
