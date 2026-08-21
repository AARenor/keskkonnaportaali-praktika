import {
  readBoundedResponseText,
} from "../server/upstream.mjs";

export const MAX_AUDIT_RESPONSE_BYTES = 1_000_000;

export async function requestBoundedAuditText(
  url,
  init = {},
  {
    fetchImpl = globalThis.fetch,
    maximumBytes = MAX_AUDIT_RESPONSE_BYTES,
    label = "Audit response",
  } = {},
) {
  if (typeof fetchImpl !== "function") throw new Error("Audit fetch implementation is unavailable");
  const response = await fetchImpl(url, { ...init, redirect: "error" });
  const text = await readBoundedResponseText(response, maximumBytes, label);
  return { response, text };
}

export async function requestBoundedAuditJson(url, init = {}, options = {}) {
  const { response, text } = await requestBoundedAuditText(url, init, options);
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = null;
  }
  return { response, text, body };
}
