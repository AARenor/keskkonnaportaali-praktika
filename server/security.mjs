import { isIP } from "node:net";

function firstHeaderValue(value) {
  return String(value || "").split(",")[0].trim();
}

export function requestRateLimitAddress(request = {}) {
  const headers = request.headers || {};
  const cloudflareAddress = firstHeaderValue(headers["cf-connecting-ip"]);
  const cloudflareRay = firstHeaderValue(headers["cf-ray"]);
  if (cloudflareRay && isIP(cloudflareAddress)) return cloudflareAddress;

  const socketAddress = firstHeaderValue(request.socket?.remoteAddress || request.connection?.remoteAddress);
  return isIP(socketAddress) ? socketAddress : "unknown";
}
