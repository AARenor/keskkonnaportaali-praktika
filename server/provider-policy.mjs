const APPROVED_LLM_ORIGINS = new Set([
  "https://opencode.ai",
]);

export function validateLlmProviderUrl(value, { approvedOrigins = APPROVED_LLM_ORIGINS } = {}) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("LLM_BASE_URL must be a valid approved HTTPS provider URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) {
    throw new Error("LLM_BASE_URL must be credential-free HTTPS without query parameters or fragments");
  }
  if (url.port || !approvedOrigins.has(url.origin)) {
    throw new Error("LLM_BASE_URL origin is not an approved model provider");
  }
  const pathname = url.pathname.replace(/\/+$/u, "") || "/";
  return `${url.origin}${pathname === "/" ? "" : pathname}`;
}
