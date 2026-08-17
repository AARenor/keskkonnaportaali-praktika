import { syncPortalCorpus } from "./corpus.mjs";

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : fallback;
}

const hydrateLimit = Math.max(0, Math.min(Number(argument("hydrate-limit", "1000")) || 0, 10_000));
const seedQueries = String(argument("seed-queries", "mets")).split(",").map((value) => value.trim()).filter(Boolean);

const result = await syncPortalCorpus({
  mode: "manual-full",
  hydrateLimit,
  seedQueries,
  onProgress(progress) {
    if (progress.stage === "hydrate" && progress.completed % 50 !== 0 && progress.completed !== progress.total) return;
    process.stderr.write(`[corpus] ${JSON.stringify(progress)}\n`);
  },
});

process.stdout.write(`${JSON.stringify(result)}\n`);
if (!["ready", "busy"].includes(result.status)) process.exitCode = 1;
