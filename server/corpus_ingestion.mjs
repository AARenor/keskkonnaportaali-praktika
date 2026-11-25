import { createHash } from "node:crypto";
import { databaseEnabled, withDatabaseClient } from "./database.mjs";
import { createOfficialDiscoveryIndexQueue } from "./live-index-queue.mjs";
import {
  canonicalCatalogueUrl,
  deduplicateCorpusDocuments,
  hash,
  OFFICIAL_HOSTS,
  PORTAL_PAGE_SIZE,
  parsePortalDate,
} from "./corpus_document_parsing.mjs";
import { validateApprovedPublicHttpsUrl } from "./public-https.mjs";
import { sourceResourceKey } from "./source-identity.mjs";
import { officialServiceCatalogueDocuments } from "./search_catalogue.mjs";
import { corpusListingWindows } from "./corpus_listing_state.mjs";
import {
  OFFICIAL_DISCOVERY_DELETE_SQL,
  OFFICIAL_DISCOVERY_RETIRE_SQL,
  OFFICIAL_DISCOVERY_RETENTION_HOURS,
  CORPUS_VECTOR_LAYOUT,
  corpusIndexPolicySql,
  REVIEWED_CATALOGUE_SOURCE_KEY,
  ensureCorpusSchema,
  planCorpusDocumentAdmission,
  readCorpusCapacity,
  throwIfCorpusAborted,
  upsertDocuments,
  withCorpusCapacityTransaction,
} from "./corpus_storage.mjs";
import { normalizeCorpusQuery, summarizeUrlOccurrences } from "./corpus_query.mjs";

const OFFICIAL_DISCOVERY_MAX_ROWS = Math.max(
  1_000,
  Math.min(Math.trunc(Number(process.env.OFFICIAL_DISCOVERY_MAX_ROWS) || 20_000), 100_000),
);
const OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET = Math.max(
  100,
  Math.min(
    Math.trunc(Number(process.env.OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET) || 10_000),
    OFFICIAL_DISCOVERY_MAX_ROWS,
  ),
);
const OFFICIAL_DISCOVERY_CLIENT_URL_BUDGET = Math.max(
  25,
  Math.min(
    Math.trunc(Number(process.env.OFFICIAL_DISCOVERY_CLIENT_URL_BUDGET) || 500),
    OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET,
  ),
);
const OFFICIAL_DISCOVERY_ORIGINS = new Set([...OFFICIAL_HOSTS].map((host) => `https://${host}`));
function approvedOfficialDiscoveryUrl(value = "") {
  try {
    const original = new URL(typeof value === "object" ? value?.url : value);
    const fragment = original.hash;
    original.hash = "";
    const url = validateApprovedPublicHttpsUrl(original, OFFICIAL_DISCOVERY_ORIGINS);
    if (/\.pdf$/iu.test(url.pathname)) url.hash = fragment;
    return url.toString();
  } catch {
    return "";
  }
}

function officialDiscoveryQueueKey(document = {}) {
  const approvedUrl = approvedOfficialDiscoveryUrl(document?.url);
  return approvedUrl ? sourceResourceKey(approvedUrl) : null;
}

const officialDiscoveryIndexQueue = createOfficialDiscoveryIndexQueue({
  keyOf: officialDiscoveryQueueKey,
  acceptanceWindowMs: OFFICIAL_DISCOVERY_RETENTION_HOURS * 60 * 60_000,
  maximumAcceptedPerWindow: OFFICIAL_DISCOVERY_PROCESS_URL_BUDGET,
  maximumAcceptedPerClient: OFFICIAL_DISCOVERY_CLIENT_URL_BUDGET,
  writeBatch: (documents, { signal, maintenance }) => indexOfficialDiscoveryDocuments(documents, {
    signal,
    retireStale: maintenance,
  }),
});
async function retireStaleOfficialDiscoveryDocuments(client, signal) {
  throwIfCorpusAborted(signal);
  const retired = await client.query(OFFICIAL_DISCOVERY_RETIRE_SQL, [OFFICIAL_DISCOVERY_RETENTION_HOURS]);
  throwIfCorpusAborted(signal);
  const deleted = await client.query(OFFICIAL_DISCOVERY_DELETE_SQL, [OFFICIAL_DISCOVERY_RETENTION_HOURS * 2]);
  throwIfCorpusAborted(signal);
  return { retired: Number(retired.rowCount || 0), deleted: Number(deleted.rowCount || 0) };
}

export function limitOfficialDiscoveryDocuments(
  documents = [],
  existingUrls = [],
  currentRowCount = 0,
  maximumRows = OFFICIAL_DISCOVERY_MAX_ROWS,
) {
  const existing = new Set(existingUrls.map((value) => String(value || "")));
  const safeMaximum = Math.max(0, Math.trunc(Number(maximumRows) || 0));
  let newSlots = Math.max(0, safeMaximum - Math.max(0, Math.trunc(Number(currentRowCount) || 0)));
  return documents.filter((document) => {
    if (existing.has(String(document?.url || ""))) return true;
    if (newSlots <= 0) return false;
    newSlots -= 1;
    return true;
  });
}

export function normalizeOfficialDiscoveryDocuments(rawDocuments = []) {
  return deduplicateCorpusDocuments(rawDocuments.flatMap((document) => {
    const url = approvedOfficialDiscoveryUrl(document?.url);
    if (!url) return [];
    return [{
      sourceKey: "official-live-search",
      externalId: hash(url).slice(0, 24),
      url,
      title: document?.title,
      summary: document?.summary,
      content: document?.content,
      category: document?.type,
      organization: document?.organization,
      publishedAt: parsePortalDate(document?.published),
      publishedLabel: document?.published,
      topics: document?.tags || document?.topics || [],
      sourceTier: "official",
      quality: 4,
      metadata: { source_kind: "official-live-search", placeholder: false },
    }];
  }));
}

export async function indexOfficialDiscoveryDocuments(rawDocuments = [], { signal, retireStale = false } = {}) {
  if (!databaseEnabled()) return { status: "disabled", indexed: 0 };
  throwIfCorpusAborted(signal);
  const documents = normalizeOfficialDiscoveryDocuments(rawDocuments);
  if (!documents.length && !retireStale) return { status: "empty", indexed: 0 };
  try {
    await ensureCorpusSchema();
    const result = await withDatabaseClient(async (client) => {
      throwIfCorpusAborted(signal);
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL statement_timeout = '2000ms'");
        // Aggregate capacity is always locked first, then the narrower live
        // ceiling. This order is shared across replicas and prevents deadlocks.
        await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-corpus-retention-capacity'))");
        await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-official-discovery-capacity'))");
        const maintenance = retireStale || documents.length
          ? await retireStaleOfficialDiscoveryDocuments(client, signal)
          : { retired: 0, deleted: 0 };
        let admittedDocuments = documents;
        if (documents.length) {
          const countResult = await client.query(`
            SELECT COUNT(*)::INTEGER AS total
            FROM practice_corpus_documents
            WHERE source_key = 'official-live-search'
          `);
          const existingResult = await client.query(`
            SELECT canonical_url
            FROM practice_corpus_documents
            WHERE source_key = 'official-live-search'
              AND canonical_url = ANY($1::TEXT[])
          `, [documents.map((document) => document.url)]);
          throwIfCorpusAborted(signal);
          admittedDocuments = limitOfficialDiscoveryDocuments(
            documents,
            existingResult.rows.map((row) => row.canonical_url),
            countResult.rows[0]?.total,
            OFFICIAL_DISCOVERY_MAX_ROWS,
          );
        }
        const upsert = admittedDocuments.length
          ? await upsertDocuments(client, admittedDocuments, null, {
            signal,
            discoveryOnly: true,
            inTransaction: true,
          })
          : { indexed: 0, capacityDropped: 0 };
        throwIfCorpusAborted(signal);
        await client.query("COMMIT");
        if (maintenance.retired || maintenance.deleted) corpusListingWindows.clear();
        else corpusListingWindows.clearFreshness();
        return {
          indexed: upsert.indexed,
          capacityDropped: Math.max(0, documents.length - admittedDocuments.length)
            + upsert.capacityDropped,
          ...maintenance,
        };
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      }
    });
    return {
      status: documents.length ? "ready" : "empty",
      indexed: Number(result?.indexed || 0),
      retired: Number(result?.retired || 0),
      deleted: Number(result?.deleted || 0),
      capacityDropped: Number(result?.capacityDropped || 0),
    };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "degraded", indexed: 0 };
  }
}

export function enqueueOfficialDiscoveryDocuments(documents = [], options = {}) {
  return officialDiscoveryIndexQueue.enqueue(documents, options);
}

export function scheduleOfficialDiscoveryMaintenance(options = {}) {
  return officialDiscoveryIndexQueue.scheduleMaintenance(options);
}

export function stopOfficialDiscoveryIndexing(reason) {
  return officialDiscoveryIndexQueue.stop(reason);
}

export function officialDiscoveryIndexStats() {
  return officialDiscoveryIndexQueue.stats();
}
export async function saveQuerySnapshot(client, query, total, urls, {
  pageCount = Math.ceil(total / PORTAL_PAGE_SIZE),
  pageSize = PORTAL_PAGE_SIZE,
  sortOrder = "portal-default",
  querySource = "configured-seed",
} = {}) {
  const normalized = normalizeCorpusQuery(query);
  const summary = summarizeUrlOccurrences(urls);
  await client.query(`
    INSERT INTO practice_corpus_query_snapshots
      (query_hash, normalized_query, query_source, upstream_total, page_count,
       page_size, sort_order, stored_occurrence_count, distinct_url_count,
       document_urls, captured_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::JSONB, NOW())
    ON CONFLICT (query_hash) DO UPDATE SET
      normalized_query = EXCLUDED.normalized_query,
      query_source = EXCLUDED.query_source,
      upstream_total = EXCLUDED.upstream_total,
      page_count = EXCLUDED.page_count,
      page_size = EXCLUDED.page_size,
      sort_order = EXCLUDED.sort_order,
      stored_occurrence_count = EXCLUDED.stored_occurrence_count,
      distinct_url_count = EXCLUDED.distinct_url_count,
      document_urls = EXCLUDED.document_urls,
      captured_at = NOW()
  `, [
    hash(normalized),
    normalized,
    querySource,
    total,
    pageCount,
    pageSize,
    sortOrder,
    summary.occurrenceCount,
    summary.distinctCount,
    JSON.stringify(summary.occurrences),
  ]);
}

export function reviewedCatalogueCorpusRecords() {
  const records = officialServiceCatalogueDocuments()
    // Law sections are read fresh from the feed; a saved copy could go out of date.
    .filter((document) => !document._lawSection)
    .filter((document) => typeof (document?.content || document?.summary) === "string"
      && (document.content || document.summary).length >= 40
      && /^https:\/\//u.test(String(document?.url || "")))
    .map((document) => {
      const reviewedAt = document._evidenceStatusAt || document._catalogueReviewedAt || new Date().toISOString();
      const content = document.content || document.summary || "";
      const evidencePolicy = document.evidencePolicy || "versioned";
      const recordUrl = canonicalCatalogueUrl(document.url);
      return {
        // The catalogue id alone is not unique per canonical URL: a reviewed
        // source can move from `/path` to `/path/` between releases, and the
        // old row keeps its id. Binding the external id to the URL keeps the
        // `(source_key, external_id)` constraint stable and lets the URL
        // conflict path update the existing row instead of aborting the sync.
        external_id: `reviewed:${document.id}:${hash(recordUrl).slice(0, 16)}`,
        source_key: REVIEWED_CATALOGUE_SOURCE_KEY,
        canonical_url: recordUrl,
        title: document.title || document.id,
        summary: document.summary || "",
        content,
        category: document.type || "Ametlik allikas",
        organization: document.organization || "",
        published_at: document._publishedAt || "",
        published_label: document.published || "",
        modified_at: "",
        topics: document.tags || document.topics || [],
        source_tier: "official",
        language: "et",
        metadata_quality: evidencePolicy === "route-only" ? 3 : 4,
        metadata: {
          source_kind: "reviewed-catalogue",
          hydrated: true,
          evidence_policy: evidencePolicy,
          reviewed_at: reviewedAt,
          catalogue_id: document.id,
          locator: document.locator || "",
          url: document.url,
        },
        content_hash: createHash("sha256").update(content).digest("hex"),
      };
    });
  // Several reviewed entries deliberately share a public landing URL (for
  // example an annual publication and its regeneration chapter). PostgreSQL
  // accepts one row per canonical URL, so keep the richest extract.
  const byUrl = new Map();
  for (const record of records) {
    const existing = byUrl.get(record.canonical_url);
    if (!existing || record.content.length > existing.content.length) byUrl.set(record.canonical_url, record);
  }
  return [...byUrl.values()];
}

// Reviewed catalogue rows are versioned seeds, not crawl results. Refresh
// them on every process start so a deploy cannot leave old identities or an
// expired review window in the database until the next 24-hour crawl.
export async function refreshReviewedCatalogue() {
  if (!databaseEnabled()) return { status: "disabled", seeded: 0 };
  await ensureCorpusSchema();
  return withDatabaseClient(async (client) => {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('practice-corpus-sync')) AS locked");
    if (!lock.rows[0]?.locked) return { status: "busy", seeded: 0 };
    try {
      const seeded = await seedReviewedCatalogueDocuments(client, null);
      return { status: "ready", ...seeded };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('practice-corpus-sync'))").catch(() => undefined);
    }
  });
}

// The portal crawl is a mirror, not the complete reviewed source registry.
// Persist reviewed catalogue documents that have no portal row so a database
// search can also reach external laws, UN terminology and file-only sources.
// Existing crawled rows are never overwritten; empty metadata-only rows are
// filled with the reviewed extract.
export async function seedReviewedCatalogueDocuments(client, runId, options = {}) {
  const records = reviewedCatalogueCorpusRecords();
  if (!records.length) return { seeded: 0, capacityDropped: 0 };
  const admissionDocuments = records.map((record) => ({
    externalId: record.external_id,
    sourceKey: record.source_key,
    url: record.canonical_url,
    title: record.title,
    summary: record.summary,
    content: record.content,
    category: record.category,
    organization: record.organization,
    publishedAt: record.published_at,
    publishedLabel: record.published_label,
    modifiedAt: record.modified_at,
    topics: record.topics,
    sourceTier: record.source_tier,
    language: record.language,
    quality: record.metadata_quality,
    metadata: record.metadata,
    contentHash: record.content_hash,
  }));
  const result = await withCorpusCapacityTransaction(client, async () => {
    const capacity = await readCorpusCapacity(client);
    const existingResult = await client.query(`
      SELECT canonical_url,
             pg_column_size(document)::BIGINT AS existing_bytes
      FROM practice_corpus_documents AS document
      WHERE canonical_url = ANY($1::TEXT[])
    `, [records.map((record) => record.canonical_url)]);
    const admission = planCorpusDocumentAdmission(
      admissionDocuments,
      existingResult.rows,
      capacity.rowCount,
      capacity.totalBytes,
    );
    const admittedUrls = new Set(admission.admittedDocuments.map((document) => document.url));
    const admittedRecords = records.filter((record) => admittedUrls.has(record.canonical_url));
    if (admission.livenessOnlyUrls.length) {
      await client.query(`
        UPDATE practice_corpus_documents
        SET last_seen_at = NOW(),
            last_seen_run = COALESCE($2::BIGINT, last_seen_run),
            is_available = TRUE
        WHERE canonical_url = ANY($1::TEXT[])
      `, [admission.livenessOnlyUrls, runId]);
    }
    let seeded = 0;
    if (admittedRecords.length) {
      const inserted = await client.query(`
        INSERT INTO practice_corpus_documents AS current (
          external_id, source_key, canonical_url, title, summary, content, category,
          organization, published_at, published_label, modified_at, topics, source_tier,
          language, metadata_quality, metadata, content_hash, body_index_allowed, last_seen_run
        )
        SELECT
          incoming.external_id,
          incoming.source_key,
          incoming.canonical_url,
          incoming.title,
          incoming.summary,
          incoming.content,
          incoming.category,
          incoming.organization,
          NULLIF(incoming.published_at, '')::DATE,
          incoming.published_label,
          NULLIF(incoming.modified_at, '')::TIMESTAMPTZ,
          COALESCE(ARRAY(SELECT jsonb_array_elements_text(incoming.topics)), ARRAY[]::TEXT[]),
          incoming.source_tier,
          incoming.language,
          incoming.metadata_quality,
          incoming.metadata,
          incoming.content_hash,
          ${corpusIndexPolicySql("incoming", { staticOnly: true })},
          $2
        FROM (
          SELECT
            item.*,
            '${CORPUS_VECTOR_LAYOUT}'::TEXT AS search_vector_policy,
            NOW()::TIMESTAMPTZ AS fetched_at
          FROM jsonb_to_recordset($1::JSONB) AS item(
            external_id TEXT,
            source_key TEXT,
            canonical_url TEXT,
            title TEXT,
            summary TEXT,
            content TEXT,
            category TEXT,
            organization TEXT,
            published_at TEXT,
            published_label TEXT,
            modified_at TEXT,
            topics JSONB,
            source_tier TEXT,
            language TEXT,
            metadata_quality SMALLINT,
            metadata JSONB,
            content_hash TEXT
          )
        ) AS incoming
        ON CONFLICT (canonical_url) DO UPDATE SET
          external_id = EXCLUDED.external_id,
          source_key = EXCLUDED.source_key,
          title = EXCLUDED.title,
          summary = CASE WHEN current.summary <> '' THEN current.summary ELSE EXCLUDED.summary END,
          content = CASE WHEN current.content <> '' THEN current.content ELSE EXCLUDED.content END,
          category = EXCLUDED.category,
          organization = EXCLUDED.organization,
          published_at = EXCLUDED.published_at,
          published_label = EXCLUDED.published_label,
          topics = EXCLUDED.topics,
          source_tier = EXCLUDED.source_tier,
          metadata_quality = GREATEST(current.metadata_quality, EXCLUDED.metadata_quality),
          metadata = current.metadata || EXCLUDED.metadata,
          content_hash = CASE WHEN current.content <> '' THEN current.content_hash ELSE EXCLUDED.content_hash END,
          fetched_at = CASE WHEN current.content <> '' THEN current.fetched_at ELSE NOW() END,
          -- The vector trigger recomputes this from the merged row afterward.
          body_index_allowed = EXCLUDED.body_index_allowed,
          last_seen_at = NOW(),
          last_seen_run = COALESCE($2, current.last_seen_run),
          is_available = TRUE
        WHERE current.content = ''
          OR current.source_key IN ('portal-catalog', 'portal-sitemap')
          OR current.source_key = 'reviewed-catalogue-source'
      `, [JSON.stringify(admittedRecords), runId]);
      seeded = Number(inserted.rowCount || 0);
    }
    // Retire pre-hash reviewed identities left by the earlier `reviewed:<id>`
    // scheme. Their slashed URL may also differ from the canonical row, so
    // leaving them available would answer from a duplicate page.
    await client.query(`
      UPDATE practice_corpus_documents
      SET is_available = FALSE
      WHERE source_key = 'reviewed-catalogue-source'
        AND is_available = TRUE
        AND external_id !~ '^reviewed:[^:]+:[0-9a-f]{16}$'
    `);
    return { seeded, capacityDropped: admission.capacityDropped };
  }, options);
  corpusListingWindows.clear();
  return result;
}

export function isRobotsDisallowedCorpusError(error) {
  return error?.code === "CORPUS_ROBOTS_DISALLOWED"
    || error?.message === "Corpus source is disallowed by robots.txt";
}
export function shouldRetirePortalCatalog({
  includeCatalog = false,
  catalogSkipped = false,
  authoritativeCapacityDropped = 0,
} = {}) {
  return Boolean(includeCatalog)
    && !catalogSkipped
    && Math.max(0, Math.trunc(Number(authoritativeCapacityDropped) || 0)) === 0;
}
