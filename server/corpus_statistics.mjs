import { databaseEnabled, databaseQuery } from "./database.mjs";
import { createFairSearchAdmission } from "./request-budget.mjs";
import { createCoalescedTtlSnapshot, snapshotAbortError } from "./corpus_snapshot.mjs";
import {
  APPROVED_PAGE_EVIDENCE_MAX_AGE_DAYS,
  OFFICIAL_DISCOVERY_RETENTION_HOURS,
} from "./corpus_storage.mjs";

const corpusStatsBackendAdmission = createFairSearchAdmission({
  maximumActive: 2,
  maximumActivePerClient: 1,
  maximumQueue: 8,
  maximumQueuedPerClient: 1,
  maximumWaitMs: 500,
  capacityCode: "CORPUS_CAPACITY",
  capacityLabel: "Corpus statistics backend work",
});
async function readCorpusStats({ signal, deadlineAt } = {}) {
  if (!databaseEnabled()) return { enabled: false, status: "disabled", documents: 0, hydrated: 0 };
  try {
    if (signal?.aborted) throw snapshotAbortError(signal);
    // A public status request must never initiate DDL or migrations. Startup,
    // synchronization and indexing own corpus schema creation; if that has not
    // completed yet, the read-only queries below degrade within their deadline.
    const queryOptions = { signal, deadlineAt, ensureSearchSchema: false };
    const result = await databaseQuery(`
      SELECT
        COUNT(*) FILTER (WHERE document.visible)::INTEGER AS documents,
        COUNT(*) FILTER (WHERE document.visible AND document.content <> '')::INTEGER AS hydrated,
        COUNT(*) FILTER (WHERE document.visible AND document.content = '')::INTEGER AS metadata_only,
        COUNT(DISTINCT document.content_hash) FILTER (WHERE document.visible AND document.content <> '')::INTEGER AS distinct_content,
        -- The robots gate stores its verdict by clearing the body and marking the
        -- row unavailable, so this count has to look outside the visible rows or
        -- it can only ever report zero. Nothing from the row itself is exposed.
        COUNT(*) FILTER (WHERE document.metadata->>'robots_noindex' = 'true')::INTEGER AS robots_excluded,
        COUNT(*) FILTER (WHERE document.visible AND document.source_tier = 'reviewed')::INTEGER AS reviewed,
        COUNT(*) FILTER (WHERE document.visible AND document.source_tier = 'official')::INTEGER AS official,
        COUNT(*) FILTER (WHERE document.visible AND document.source_tier = 'supplementary')::INTEGER AS supplementary,
        COUNT(*) FILTER (WHERE document.visible AND document.source_tier = 'other')::INTEGER AS other,
        COUNT(*) FILTER (WHERE document.visible AND document.source_key = 'reviewed-catalogue-source')::INTEGER AS reviewed_catalogue,
        -- A stored body is not fresh evidence. This counts only official page
        -- hydrations read inside the citation window whose last attempt did not
        -- fail: a missing marker is fine, a marker older than the stored body is
        -- fine, and a marker that is equal, newer, unreadable or null is not.
        COUNT(*) FILTER (
          WHERE document.visible
            AND document.source_key = 'official-page-hydration'
            AND document.content <> ''
            AND document.fetched_at >= NOW() - make_interval(days => ${APPROVED_PAGE_EVIDENCE_MAX_AGE_DAYS})
            AND document.metadata->>'hydrated' = 'true'
            AND (
              NOT (document.metadata ? 'hydration_attempted_at')
              OR CASE
                WHEN pg_input_is_valid(document.metadata->>'hydration_attempted_at', 'timestamptz')
                  THEN (document.metadata->>'hydration_attempted_at')::TIMESTAMPTZ < document.fetched_at
                ELSE FALSE
              END
            )
        )::INTEGER AS fresh_official_pages,
        MAX(document.last_seen_at) FILTER (WHERE document.visible) AS indexed_at
      FROM (
        SELECT practice_corpus_documents.*,
               (
                 is_available = TRUE
                 AND (
                   source_key <> 'official-live-search'
                   OR last_seen_at >= NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS})
                 )
               ) AS visible
        FROM practice_corpus_documents
      ) AS document
    `, [], queryOptions);
    const lastRun = await databaseQuery(`
      SELECT status, finished_at, error_count, details
      FROM practice_corpus_runs
      ORDER BY started_at DESC
      LIMIT 1
    `, [], queryOptions);
    const row = result.rows[0];
    return {
      enabled: true,
      status: "ready",
      documents: Number(row.documents),
      hydrated: Number(row.hydrated),
      metadataOnly: Number(row.metadata_only),
      distinctContent: Number(row.distinct_content),
      robotsExcluded: Number(row.robots_excluded),
      // Stored bodies, not citable sources: a body can be older than the
      // citation window or belong to a failed refresh, so the two numbers are
      // deliberately distinct.
      freshOfficialPages: Number(row.fresh_official_pages || 0),
      reviewed: Number(row.reviewed),
      official: Number(row.official),
      supplementary: Number(row.supplementary),
      other: Number(row.other),
      reviewedCatalogue: Number(row.reviewed_catalogue || 0),
      indexedAt: row.indexed_at,
      lastSync: lastRun.rows[0] ? {
        status: lastRun.rows[0].status,
        finishedAt: lastRun.rows[0].finished_at,
        // A ready run can still have failed most of its work. Expose the count
        // only, never the stored error text or any URL from the run details.
        errorCount: Number(lastRun.rows[0].error_count || 0),
        catalogTotal: Number(lastRun.rows[0].details?.catalogTotal || 0),
        catalogSkipped: lastRun.rows[0].details?.catalogSkipped || null,
        sitemapPages: Number(lastRun.rows[0].details?.sitemapPages || 0),
      } : null,
    };
  } catch {
    return { enabled: true, status: "degraded", documents: 0, hydrated: 0 };
  }
}

const corpusStatsSnapshot = createCoalescedTtlSnapshot({
  load: readCorpusStats,
  acquireWork: ({ clientKey, signal }) => corpusStatsBackendAdmission.acquire(
    clientKey,
    { signal, maximumWaitMs: 500 },
  ),
  ttlMs: 60_000,
  timeoutMs: 1_500,
  shouldCache: (value) => value?.status === "ready",
});

export async function corpusStats(options = {}) {
  if (!databaseEnabled()) return { enabled: false, status: "disabled", documents: 0, hydrated: 0 };
  try {
    return await corpusStatsSnapshot.get(options);
  } catch (error) {
    if (error?.code === "CORPUS_CAPACITY") throw error;
    return { enabled: true, status: "degraded", documents: 0, hydrated: 0 };
  }
}

export function closeCorpusStatsBackendAdmission(reason) {
  corpusStatsSnapshot.clear();
  return corpusStatsBackendAdmission.close(reason);
}
