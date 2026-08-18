export const DEFAULT_SEARCH_DEADLINE_MS = 15_000;
export const JSON_SEARCH_DEADLINE_CEILING_MS = 12_000;
export const DEFAULT_SEARCH_CONCURRENCY = 8;

export function configuredSearchBudgetMs(
  value = process.env.SEARCH_DEADLINE_MS,
  ceilingMs = DEFAULT_SEARCH_DEADLINE_MS,
) {
  const ceiling = Math.max(1_000, Math.min(Number(ceilingMs) || DEFAULT_SEARCH_DEADLINE_MS, DEFAULT_SEARCH_DEADLINE_MS));
  return Math.max(1_000, Math.min(Number(value) || DEFAULT_SEARCH_DEADLINE_MS, ceiling));
}

export function searchDeadline(startedAt, ceilingMs = DEFAULT_SEARCH_DEADLINE_MS, value = process.env.SEARCH_DEADLINE_MS) {
  return Number(startedAt) + configuredSearchBudgetMs(value, ceilingMs);
}

export function configuredSearchConcurrency(value = process.env.SEARCH_MAX_CONCURRENCY) {
  return Math.max(1, Math.min(Number(value) || DEFAULT_SEARCH_CONCURRENCY, 20));
}
