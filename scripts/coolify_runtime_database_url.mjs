import { pathToFileURL } from "node:url";

const MAXIMUM_INPUT_BYTES = 1_048_576;

function reject(message) {
  throw new Error(message);
}

export function runtimeDatabaseUrl(entries) {
  if (!Array.isArray(entries)) reject("Coolify environment response must be an array");
  const rows = entries.filter((entry) => (
    entry && entry.key === "DATABASE_URL" && entry.is_preview === false && entry.is_runtime === true
  ));
  if (rows.length !== 1) {
    reject("Coolify application must have exactly one runtime DATABASE_URL and no preview duplicate");
  }
  const value = typeof rows[0].value === "string" && rows[0].value.trim()
    ? rows[0].value
    : rows[0].real_value;
  if (typeof value !== "string" || !value.trim()) {
    reject("Coolify runtime DATABASE_URL must have a literal value");
  }
  return value.trim();
}

async function main() {
  let input = "";
  for await (const chunk of process.stdin) {
    input += chunk.toString("utf8");
    if (Buffer.byteLength(input, "utf8") > MAXIMUM_INPUT_BYTES) {
      reject("Coolify environment response is too large");
    }
  }
  let entries;
  try {
    entries = JSON.parse(input);
  } catch {
    reject("Coolify environment response must be valid JSON");
  }
  process.stdout.write(runtimeDatabaseUrl(entries));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}
