import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const MAXIMUM_URL_BYTES = 16_384;

function reject() {
  throw new Error("DATABASE_URL must name a private database host");
}

function privateIpv4(host) {
  const octets = host.split(".").map(Number);
  return octets[0] === 127
    || octets[0] === 10
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || (octets[0] === 169 && octets[1] === 254);
}

function privateIpv6(host) {
  const normalized = host.toLocaleLowerCase("en");
  return normalized === "::1"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe80:");
}

export function privateDatabaseHost(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || Buffer.byteLength(raw, "utf8") > MAXIMUM_URL_BYTES) reject();

  let url;
  try {
    url = new URL(raw);
  } catch {
    reject();
  }
  if (!["postgres:", "postgresql:"].includes(url.protocol) || !url.hostname) reject();

  const host = url.hostname.replace(/^\[|\]$/gu, "").toLocaleLowerCase("en");
  const ipVersion = isIP(host);
  const valid = ipVersion === 4
    ? privateIpv4(host)
    : ipVersion === 6
      ? privateIpv6(host)
      : /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(host);
  if (!valid) reject();
  return host;
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (Buffer.byteLength(input, "utf8") > MAXIMUM_URL_BYTES) reject();
  }
  process.stdout.write(privateDatabaseHost(input));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
