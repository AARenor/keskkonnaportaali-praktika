import { databaseEnabled, withDatabaseClient } from "./database.mjs";
import { deduplicateCorpusDocuments, PORTAL_PAGE_SIZE } from "./corpus_document_parsing.mjs";
import { SOURCE_IDENTITY_VERSION, sourceResourceKey } from "./source-identity.mjs";
import {
  SOURCE_CONTENT_KINDS,
  SOURCE_ROBOTS_ALLOWING_STATUSES,
  SOURCE_ROBOTS_STATUSES,
} from "./source_policy.mjs";
import { corpusListingWindows } from "./corpus_listing_state.mjs";

export const OFFICIAL_DISCOVERY_RETENTION_HOURS = Math.max(
  24,
  Math.min(Number(process.env.OFFICIAL_DISCOVERY_RETENTION_HOURS) || 168, 720),
);
export const APPROVED_PAGE_EVIDENCE_MAX_AGE_DAYS = 7;
export const APPROVED_PAGE_EVIDENCE_MAX_AGE_MS = APPROVED_PAGE_EVIDENCE_MAX_AGE_DAYS * 24 * 60 * 60 * 1_000;
// A citable page is read again one day before its citation window closes, so a
// successful body is renewed while it can still answer instead of lapsing first
// and waiting for a slow refresh cycle.
export const APPROVED_PAGE_REFRESH_DAYS = APPROVED_PAGE_EVIDENCE_MAX_AGE_DAYS - 1;
// Kinds whose body was read from a publisher. Such a witness carries the hash of
// the bytes that were read; the authored kinds may carry none. The list mirrors
// PUBLISHER_KINDS in source_policy.mjs, and the known kinds come from there too,
// so an unknown kind cannot pass as an authored one.
const CORPUS_PUBLISHER_CONTENT_KINDS = Object.freeze(["fetched-html", "fetched-pdf", "reviewed-extract"]);
const CORPUS_SQL_CONTENT_KINDS = SOURCE_CONTENT_KINDS.map((kind) => `'${kind}'`).join(", ");
const CORPUS_SQL_PUBLISHER_KINDS = CORPUS_PUBLISHER_CONTENT_KINDS.map((kind) => `'${kind}'`).join(", ");
const CORPUS_SQL_HASH_PATTERN = "^[a-f0-9]{64}$";
const CORPUS_SQL_ROBOTS_STATUSES = SOURCE_ROBOTS_STATUSES.map((status) => `'${status}'`).join(", ");
const CORPUS_SQL_ALLOWING_ROBOTS_STATUSES = SOURCE_ROBOTS_ALLOWING_STATUSES.map((status) => `'${status}'`).join(", ");
// The canonical instant form the witness timestamps use, so a looser date format
// is not silently accepted where the validator demands this one.
const CORPUS_SQL_CANONICAL_TIMESTAMP_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\\.[0-9]{3}Z$";
// `Number.isInteger` in the validator accepts any normalized integer, so 120.0 and
// 1e20 are fine and 120.5 is not. The only bound is the JavaScript number itself:
// an integer with more than 309 digits parses as Infinity there, which
// Number.isInteger rejects, so it is rejected here too without casting.
const CORPUS_SQL_SNIPPET_LIMIT_PATTERN = "^[0-9]+(\\.[0]+)?$";
const CORPUS_SQL_SNIPPET_LIMIT_MAX_DIGITS = 309;

export const REVIEWED_CATALOGUE_MAX_AGE_MS = 366 * 24 * 60 * 60 * 1_000;
export const REVIEWED_CATALOGUE_SOURCE_KEY = "reviewed-catalogue-source";
// `search_vector_policy` holds the vector layout, not the policy witness version.
// The two vectors are split (safe navigation fields, then permitted copied text),
// the version of the witness inside metadata and keeps its own meaning.
export const CORPUS_VECTOR_LAYOUT = "index-layout-v2";
export const CORPUS_CAPACITY_VERSION = 1;
const CORPUS_CAPACITY_LOCK_SQL = "SELECT pg_advisory_xact_lock(hashtext('practice-corpus-retention-capacity'))";
const corpusCapacityTransactions = new WeakMap();

// What the search index may contain for one row. The trigger writes the same
// decision it returns here, and the queries read it back, so copied text is
// indexed, matched and ranked only when a current source use policy allows
// indexing it. A reviewed catalogue row is a reviewed extract with its own
// recorded review, so it is the one explicit carve-out. The decision covers the
// copied-text vector only: title, category, organization and topics are authored
// navigation metadata, never copied body text, so they stay matchable without a
// body permission.
// Whether a row carries a usable source use witness: a well-formed record bound to
// this exact row, meaning the same observation time as its stored read, the same
// resource and the hash of the body that is stored. Availability is deliberately
// not part of this test. An expired publisher decision is the publisher's answer,
// so it must not trigger an immediate re-read on every pass; it refreshes on the
// ordinary age schedule. A null, malformed, unknown-version or mismatched witness
// is not usable, and only a fresh successful read can replace one.
//
// The expression is total on purpose. Every term compares JSON text, so a missing
// or JSON null field yields SQL NULL rather than false, and `NOT (NULL)` is NULL,
// which would silently drop the row from both the rehydration queue and the
// ordering instead of making it due. COALESCE folds that NULL into "not usable",
// which is the same answer a malformed witness gets.
export function corpusPolicyWitnessSql(alias) {
  const row = String(alias);
  const policy = `${row}.metadata->'source_policy'`;
  const use = `${policy}->'use'`;
  const directives = `${policy}->'directives'`;
  const robots = `${policy}->'robots'`;
  const kind = `${policy}->>'contentKind'`;
  const bodyHash = `${policy}->>'bodyHash'`;
  const status = `${robots}->>'status'`;
  const anyUse = `(${use}->'retainBody' = 'true'::JSONB
        OR ${use}->'indexBody' = 'true'::JSONB
        OR ${use}->'displaySnippet' = 'true'::JSONB
        OR ${use}->'answerEvidence' = 'true'::JSONB)`;
  return `COALESCE((${row}.metadata ? 'source_policy'
    AND jsonb_typeof(${policy}) = 'object'
    AND ${policy}->>'version' = 'source-policy-v1'
    AND ${policy}->>'observedAt' = to_char(${row}.fetched_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
    AND ${policy}->>'resourceKey' = ${row}.metadata->>'sourceResourceKey'
    AND length(${policy}->>'resourceKey') BETWEEN 1 AND 2000
    AND ${policy}->>'artifactHash' = ${row}.content_hash
    -- A body read from a publisher is bound to the bytes that were read, so a
    -- publisher witness must carry a real hash. An authored kind may omit it, but
    -- a value that is present and not a hash is a malformed record. An unknown kind
    -- is malformed too, exactly as the JavaScript validator treats it.
    AND ${kind} IN (${CORPUS_SQL_CONTENT_KINDS})
    AND (
      (${kind} IN (${CORPUS_SQL_PUBLISHER_KINDS}) AND ${bodyHash} ~ '${CORPUS_SQL_HASH_PATTERN}')
      OR (${kind} NOT IN (${CORPUS_SQL_PUBLISHER_KINDS})
        AND (COALESCE(${bodyHash}, '') = '' OR ${bodyHash} ~ '${CORPUS_SQL_HASH_PATTERN}'))
    )
    -- use is an object whose four flags must all be present and boolean.
    AND jsonb_typeof(${use}) = 'object'
    AND jsonb_typeof(${use}->'retainBody') = 'boolean'
    AND jsonb_typeof(${use}->'indexBody') = 'boolean'
    AND jsonb_typeof(${use}->'displaySnippet') = 'boolean'
    AND jsonb_typeof(${use}->'answerEvidence') = 'boolean'
    -- directives requires the three booleans, a maxSnippetChars that is present
    -- as null or a nonnegative integer, an optional boolean readable and an
    -- optional canonical unavailableAfter.
    AND jsonb_typeof(${directives}) = 'object'
    AND jsonb_typeof(${directives}->'noindex') = 'boolean'
    AND jsonb_typeof(${directives}->'nosnippet') = 'boolean'
    AND jsonb_typeof(${directives}->'noarchive') = 'boolean'
    AND (${directives} ? 'maxSnippetChars')
    AND (
      jsonb_typeof(${directives}->'maxSnippetChars') = 'null'
      OR (jsonb_typeof(${directives}->'maxSnippetChars') = 'number'
        AND (${directives}->>'maxSnippetChars') ~ '${CORPUS_SQL_SNIPPET_LIMIT_PATTERN}'
        AND length(split_part(${directives}->>'maxSnippetChars', '.', 1)) <= ${CORPUS_SQL_SNIPPET_LIMIT_MAX_DIGITS})
    )
    AND (NOT (${directives} ? 'readable') OR jsonb_typeof(${directives}->'readable') = 'boolean')
    AND (NOT (${directives} ? 'unavailableAfter')
      OR jsonb_typeof(${directives}->'unavailableAfter') = 'null'
      OR (jsonb_typeof(${directives}->'unavailableAfter') = 'string'
        AND (${directives}->>'unavailableAfter') ~ '${CORPUS_SQL_CANONICAL_TIMESTAMP_PATTERN}'))
    -- robots requires a known status, with an optional string origin and an
    -- optional canonical checkedAt.
    AND jsonb_typeof(${robots}) = 'object'
    AND ${status} IN (${CORPUS_SQL_ROBOTS_STATUSES})
    AND (NOT (${robots} ? 'origin') OR jsonb_typeof(${robots}->'origin') IN ('null', 'string'))
    AND (NOT (${robots} ? 'checkedAt')
      OR jsonb_typeof(${robots}->'checkedAt') = 'null'
      OR (jsonb_typeof(${robots}->'checkedAt') = 'string'
        AND (${robots}->>'checkedAt') ~ '${CORPUS_SQL_CANONICAL_TIMESTAMP_PATTERN}'))
    -- The stored flags may be more conservative than the directives, never more
    -- permissive: a copy permission is invalid when the witness itself refuses the
    -- copy, and the internal contradictions the validator rejects are rejected here.
    AND (
      (${status} IN (${CORPUS_SQL_ALLOWING_ROBOTS_STATUSES})
        AND COALESCE(${directives}->'readable', 'true'::JSONB) <> 'false'::JSONB
        AND ${directives}->'noindex' = 'false'::JSONB
        AND ${kind} <> 'legacy-unknown')
      OR NOT ${anyUse}
    )
    AND NOT (${directives}->'noarchive' = 'true'::JSONB AND ${use}->'retainBody' = 'true'::JSONB)
    AND NOT ((${directives}->'nosnippet' = 'true'::JSONB
        OR ${directives}->'maxSnippetChars' = '0'::JSONB)
      AND (${use}->'displaySnippet' = 'true'::JSONB OR ${use}->'answerEvidence' = 'true'::JSONB))
    AND NOT (${use}->'answerEvidence' = 'true'::JSONB AND ${use}->'displaySnippet' = 'false'::JSONB)
    AND NOT (${use}->'displaySnippet' = 'true'::JSONB AND ${use}->'indexBody' = 'false'::JSONB)
    ), false)`;
}

export function corpusIndexPolicySql(alias) {
  const row = String(alias);
  return `((${row}.search_vector_policy = '${CORPUS_VECTOR_LAYOUT}'
    AND ${corpusPolicyWitnessSql(row)}
    AND ${row}.metadata->'source_policy'->'directives'->>'noindex' = 'false'
    AND ${row}.metadata->'source_policy'->'directives'->>'readable' = 'true'
    AND ${row}.metadata->'source_policy'->'use'->>'indexBody' = 'true'
    AND ${row}.metadata->'source_policy'->'robots'->>'status' IN ('allowed', 'absent', 'not-applicable')
    -- Availability is a clock, not a write. A body indexed before its deadline
    -- stops qualifying at the deadline even when no later write touches the row.
    -- pg_input_is_valid needs PostgreSQL 16 or newer; the deployed image is 17.
    AND CASE WHEN COALESCE(${row}.metadata->'source_policy'->'directives'->>'unavailableAfter', '') = ''
             THEN TRUE
             WHEN pg_input_is_valid(${row}.metadata->'source_policy'->'directives'->>'unavailableAfter', 'timestamptz')
               THEN (${row}.metadata->'source_policy'->'directives'->>'unavailableAfter')::timestamptz > NOW()
             ELSE FALSE
        END)
  OR (${row}.source_key = '${REVIEWED_CATALOGUE_SOURCE_KEY}'
    AND ${row}.metadata->>'source_kind' = 'reviewed-catalogue'
    AND COALESCE(${row}.metadata->>'evidence_policy', 'versioned') <> 'route-only'))`;
}
const PORTAL_UNAVAILABLE_RETENTION_HOURS = Math.max(
  24,
  Math.min(Math.trunc(Number(process.env.PORTAL_UNAVAILABLE_RETENTION_HOURS) || 720), 8_760),
);
const CORPUS_MAX_ROWS = Math.max(
  20_000,
  Math.min(Math.trunc(Number(process.env.CORPUS_MAX_ROWS) || 150_000), 250_000),
);
export const CORPUS_MAX_BYTES = Math.max(
  256_000_000,
  Math.min(Math.trunc(Number(process.env.CORPUS_MAX_BYTES) || 2_000_000_000), 12_000_000_000),
);
const CORPUS_RUN_MAX_ROWS = 1_000;
const CORPUS_RETENTION_DELETE_BATCH = 10_000;
const CORPUS_RETENTION_MAX_BATCHES = 20;
export const OFFICIAL_DISCOVERY_RETIRE_SQL = `
  UPDATE practice_corpus_documents
  SET is_available = FALSE,
      metadata = metadata || '{"retired_reason":"official-live-search-ttl"}'::JSONB
  WHERE source_key = 'official-live-search'
    AND is_available = TRUE
    AND last_seen_at < NOW() - make_interval(hours => $1)
`;

export const OFFICIAL_DISCOVERY_DELETE_SQL = `
  DELETE FROM practice_corpus_documents
  WHERE source_key = 'official-live-search'
    AND last_seen_at < NOW() - make_interval(hours => $1)
`;

export const PORTAL_UNAVAILABLE_DELETE_SQL = `
  WITH stale AS (
    SELECT id
    FROM practice_corpus_documents
    WHERE is_available = FALSE
      AND source_key IN ('portal-sitemap', 'portal-catalog', 'official-page-hydration')
      AND last_seen_at < NOW() - make_interval(hours => $1)
    ORDER BY last_seen_at ASC, id ASC
    LIMIT $2
  )
  DELETE FROM practice_corpus_documents document
  USING stale
  WHERE document.id = stale.id
`;

export const CORPUS_OVERFLOW_DELETE_SQL = `
  WITH totals AS (
    SELECT
      GREATEST(row_count - $1, 0)::BIGINT AS excess_rows,
      GREATEST(total_bytes - $2, 0)::BIGINT AS excess_bytes
    FROM practice_corpus_capacity
    WHERE id = TRUE
  ), ordered AS (
    SELECT document.id,
           pg_column_size(document)::BIGINT AS row_bytes,
           ROW_NUMBER() OVER (ORDER BY document.last_seen_at ASC, document.id ASC) AS row_position,
           COALESCE(SUM(pg_column_size(document)) OVER (
             ORDER BY document.last_seen_at ASC, document.id ASC
             ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
           ), 0)::BIGINT AS bytes_before
    FROM practice_corpus_documents AS document
    WHERE document.is_available = FALSE
  ), victims AS (
    SELECT ordered.id
    FROM ordered CROSS JOIN totals
    WHERE ordered.row_position <= totals.excess_rows
       OR ordered.bytes_before < totals.excess_bytes
    ORDER BY ordered.row_position
    LIMIT $3
  )
  DELETE FROM practice_corpus_documents document
  USING victims
  WHERE document.id = victims.id
`;
let corpusSchemaPromise;
export async function backfillCorpusSourceIdentity(client, {
  signal,
  batchSize = 250,
  maximumBytes = CORPUS_MAX_BYTES,
} = {}) {
  const boundedBatchSize = Math.max(1, Math.min(Math.trunc(Number(batchSize) || 250), 250));
  let updatedRows = 0;
  for (;;) {
    throwIfCorpusAborted(signal);
    await client.query("BEGIN");
    try {
      await client.query("SET LOCAL statement_timeout = '10000ms'");
      await client.query({ text: CORPUS_CAPACITY_LOCK_SQL, query_timeout: 15_000 });
      const pending = await client.query(`
        SELECT id, canonical_url, jsonb_typeof(metadata) AS metadata_type
        FROM practice_corpus_documents
        WHERE metadata->>'sourceIdentityVersion' IS DISTINCT FROM $1
          OR NOT (metadata ? 'sourceResourceKey')
        ORDER BY id
        LIMIT $2
        FOR UPDATE
      `, [SOURCE_IDENTITY_VERSION, boundedBatchSize]);
      throwIfCorpusAborted(signal);
      if (!pending.rows.length) {
        await client.query("COMMIT");
        return { updatedRows, sourceIdentityVersion: SOURCE_IDENTITY_VERSION };
      }
      const invalidMetadataRow = pending.rows.find((row) => row.metadata_type !== "object");
      if (invalidMetadataRow) {
        throw new Error(`Corpus source identity migration requires object metadata (document ${invalidMetadataRow.id})`);
      }
      // Every row is examined; invalid legacy URLs get an explicit null key,
      // not a fabricated identity or a silent omission from migration.
      const identities = pending.rows.map((row) => ({
        id: row.id,
        resource_key: sourceResourceKey(row.canonical_url),
        identity_version: SOURCE_IDENTITY_VERSION,
      }));
      await client.query(`
        UPDATE practice_corpus_documents AS document
        SET metadata = document.metadata || jsonb_build_object(
          'sourceResourceKey', item.resource_key,
          'sourceIdentityVersion', item.identity_version
        )
        FROM jsonb_to_recordset($1::JSONB) AS item(
          id BIGINT, resource_key TEXT, identity_version TEXT
        )
        WHERE document.id = item.id
      `, [JSON.stringify(identities)]);
      const capacity = await readCorpusCapacity(client);
      throwIfCorpusAborted(signal);
      if (capacity.totalBytes > maximumBytes) {
        throw new Error("Corpus source identity migration exceeds aggregate storage capacity");
      }
      await client.query("COMMIT");
      corpusListingWindows.clear();
      updatedRows += pending.rows.length;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
}
export async function ensureCorpusSchema() {
  if (!databaseEnabled()) return false;
  if (!corpusSchemaPromise) {
    corpusSchemaPromise = withDatabaseClient(async (client) => {
      await withCorpusCapacityTransaction(client, async () => {
        await client.query({
          text: `
        CREATE EXTENSION IF NOT EXISTS pg_trgm;
        CREATE EXTENSION IF NOT EXISTS unaccent;

        CREATE TABLE IF NOT EXISTS practice_corpus_documents (
          id BIGSERIAL PRIMARY KEY,
          external_id TEXT NOT NULL,
          source_key TEXT NOT NULL,
          canonical_url TEXT NOT NULL UNIQUE,
          title TEXT NOT NULL,
          summary TEXT NOT NULL DEFAULT '',
          content TEXT NOT NULL DEFAULT '',
          category TEXT NOT NULL DEFAULT '',
          organization TEXT NOT NULL DEFAULT '',
          published_at DATE,
          published_label TEXT NOT NULL DEFAULT '',
          modified_at TIMESTAMPTZ,
          topics TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
          source_tier TEXT NOT NULL DEFAULT 'other'
            CHECK (source_tier IN ('official', 'reviewed', 'supplementary', 'other')),
          language TEXT NOT NULL DEFAULT 'et',
          metadata_quality SMALLINT NOT NULL DEFAULT 1,
          metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
          content_hash TEXT NOT NULL,
          search_vector TSVECTOR NOT NULL DEFAULT ''::TSVECTOR,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_seen_run BIGINT,
          is_available BOOLEAN NOT NULL DEFAULT TRUE,
          UNIQUE (source_key, external_id)
        );

        -- An earlier importer converted a missing JS value into the literal
        -- string "null". Keep this idempotent migration beside the schema so
        -- every existing Coolify database is repaired on first new startup.
        UPDATE practice_corpus_documents
        SET published_label = ''
        WHERE lower(trim(published_label)) = 'null';

        -- The first prototype copied its reviewed forestry answer corpus into
        -- the general search index with a privileged tier. Keep the official
        -- URLs discoverable, but remove the prewritten answer text and the
        -- ranking privilege; fresh portal/live metadata can now replace it.
        UPDATE practice_corpus_documents
        SET source_key = 'legacy-official-url',
            content = '',
            source_tier = 'official',
            metadata_quality = 1,
            metadata = jsonb_build_object('source_kind', 'legacy-official-url'),
            content_hash = md5(canonical_url)
        WHERE source_key = 'reviewed-forestry';

        -- The marker says the stored vector was built under the source use
        -- policy gate. Adding a nullable column is a metadata-only change, so a
        -- production table with tens of thousands of rows is not rewritten here.
        ALTER TABLE practice_corpus_documents
          ADD COLUMN IF NOT EXISTS search_vector_policy TEXT;

        -- The safe navigation fields and the permitted copied text live in two
        -- vectors, so withdrawing permission never removes title, category,
        -- organization or topic navigation from search. A constant default makes
        -- this a metadata-only change on a large table.
        ALTER TABLE practice_corpus_documents
          ADD COLUMN IF NOT EXISTS search_vector_body TSVECTOR NOT NULL DEFAULT ''::TSVECTOR;

        CREATE OR REPLACE FUNCTION practice_corpus_vector_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        DECLARE
          policy_allows_copy boolean;
        BEGIN
          -- The marker is written first because the shared gate reads it; a row
          -- being written now always carries the current vector layout.
          NEW.search_vector_policy := '${CORPUS_VECTOR_LAYOUT}';
          policy_allows_copy := ${corpusIndexPolicySql("NEW")};
          -- Title and the independently authored navigation columns are always
          -- indexed, so a restricted or not yet migrated row stays findable by
          -- its title, category, organization and topics.
          NEW.search_vector :=
            setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.title, ''))), 'A') ||
            setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.category, '') || ' ' || COALESCE(NEW.organization, '') || ' ' || array_to_string(COALESCE(NEW.topics, ARRAY[]::TEXT[]), ' '))), 'B');
          -- Summary and body are copied text. They keep their old weights (C and
          -- D) but their own vector, which is read only while the permission that
          -- allowed the copy still holds at query time.
          NEW.search_vector_body := CASE WHEN policy_allows_copy THEN
              setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.summary, ''))), 'C') ||
              setweight(to_tsvector('simple', public.unaccent(COALESCE(NEW.content, ''))), 'D')
            ELSE ''::tsvector END;
          RETURN NEW;
        END
        $$;

        DROP TRIGGER IF EXISTS practice_corpus_vector_trigger ON practice_corpus_documents;
        CREATE TRIGGER practice_corpus_vector_trigger
          BEFORE INSERT OR UPDATE OF title, summary, content, category, organization, topics, metadata, fetched_at
          ON practice_corpus_documents
          FOR EACH ROW EXECUTE FUNCTION practice_corpus_vector_update();

        CREATE INDEX IF NOT EXISTS practice_corpus_search_vector_idx
          ON practice_corpus_documents USING GIN (search_vector);
        CREATE INDEX IF NOT EXISTS practice_corpus_search_vector_body_idx
          ON practice_corpus_documents USING GIN (search_vector_body);
        CREATE INDEX IF NOT EXISTS practice_corpus_title_trgm_idx
          ON practice_corpus_documents USING GIN (lower(title) gin_trgm_ops);
        CREATE INDEX IF NOT EXISTS practice_corpus_published_idx
          ON practice_corpus_documents (published_at DESC NULLS LAST);
        CREATE INDEX IF NOT EXISTS practice_corpus_tier_idx
          ON practice_corpus_documents (source_tier, is_available);
        CREATE INDEX IF NOT EXISTS practice_corpus_available_source_idx
          ON practice_corpus_documents (source_key, last_seen_at DESC)
          WHERE is_available = TRUE;
        CREATE INDEX IF NOT EXISTS practice_corpus_live_seen_idx
          ON practice_corpus_documents (last_seen_at)
          WHERE source_key = 'official-live-search';

        UPDATE practice_corpus_documents
        SET is_available = FALSE,
            metadata = metadata || '{"retired_reason":"official-live-search-ttl"}'::JSONB
        WHERE source_key = 'official-live-search'
          AND is_available = TRUE
          AND last_seen_at < NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS});
        DELETE FROM practice_corpus_documents
        WHERE source_key = 'official-live-search'
          AND last_seen_at < NOW() - make_interval(hours => ${OFFICIAL_DISCOVERY_RETENTION_HOURS * 2});

        CREATE TABLE IF NOT EXISTS practice_corpus_runs (
          id BIGSERIAL PRIMARY KEY,
          mode TEXT NOT NULL,
          status TEXT NOT NULL,
          discovered_count INTEGER NOT NULL DEFAULT 0,
          indexed_count INTEGER NOT NULL DEFAULT 0,
          hydrated_count INTEGER NOT NULL DEFAULT 0,
          error_count INTEGER NOT NULL DEFAULT 0,
          details JSONB NOT NULL DEFAULT '{}'::JSONB,
          started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          finished_at TIMESTAMPTZ
        );
        CREATE INDEX IF NOT EXISTS practice_corpus_runs_finished_idx
          ON practice_corpus_runs (finished_at DESC);

        CREATE TABLE IF NOT EXISTS practice_corpus_query_snapshots (
          query_hash TEXT PRIMARY KEY,
          normalized_query TEXT NOT NULL,
          query_source TEXT NOT NULL DEFAULT 'configured-seed',
          upstream_total INTEGER NOT NULL,
          page_count INTEGER NOT NULL DEFAULT 0,
          page_size INTEGER NOT NULL DEFAULT ${PORTAL_PAGE_SIZE},
          sort_order TEXT NOT NULL DEFAULT 'portal-default',
          stored_occurrence_count INTEGER NOT NULL DEFAULT 0,
          distinct_url_count INTEGER NOT NULL DEFAULT 0,
          document_urls JSONB NOT NULL,
          captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        ALTER TABLE practice_corpus_query_snapshots
          ADD COLUMN IF NOT EXISTS query_source TEXT NOT NULL DEFAULT 'configured-seed',
          ADD COLUMN IF NOT EXISTS page_count INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS page_size INTEGER NOT NULL DEFAULT ${PORTAL_PAGE_SIZE},
          ADD COLUMN IF NOT EXISTS sort_order TEXT NOT NULL DEFAULT 'portal-default',
          ADD COLUMN IF NOT EXISTS stored_occurrence_count INTEGER NOT NULL DEFAULT 0,
          ADD COLUMN IF NOT EXISTS distinct_url_count INTEGER NOT NULL DEFAULT 0;
        UPDATE practice_corpus_query_snapshots
        SET page_count = CASE
              WHEN page_count > 0 THEN page_count
              ELSE CEIL(upstream_total::NUMERIC / NULLIF(page_size, 0))::INTEGER
            END,
            stored_occurrence_count = CASE
              WHEN stored_occurrence_count > 0 THEN stored_occurrence_count
              ELSE jsonb_array_length(document_urls)
            END,
            distinct_url_count = CASE
              WHEN distinct_url_count > 0 THEN distinct_url_count
              ELSE (SELECT COUNT(DISTINCT value) FROM jsonb_array_elements_text(document_urls))
            END;
        DO $$
        BEGIN
          IF NOT EXISTS (
            SELECT 1 FROM pg_constraint
            WHERE conname = 'practice_corpus_query_source_check'
          ) THEN
            ALTER TABLE practice_corpus_query_snapshots
              ADD CONSTRAINT practice_corpus_query_source_check
              CHECK (query_source = 'configured-seed');
          END IF;
        END
        $$;
        `,
          query_timeout: 65_000,
        });
      }, { statementTimeoutMs: 60_000 });
      await ensureCorpusCapacity(client);
      await enforceCorpusRetention(client);
      return true;
    }).catch((error) => {
      corpusSchemaPromise = undefined;
      throw error;
    });
  }
  return corpusSchemaPromise;
}
export function throwIfCorpusAborted(signal) {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Corpus indexing was aborted", "AbortError");
}

async function runCorpusCapacityTransaction(client, operation, signal, statementTimeoutMs) {
  await client.query("BEGIN");
  try {
    await client.query(`SET LOCAL statement_timeout = '${statementTimeoutMs}ms'`);
    await client.query({ text: CORPUS_CAPACITY_LOCK_SQL, query_timeout: statementTimeoutMs + 5_000 });
    throwIfCorpusAborted(signal);
    const result = await operation();
    throwIfCorpusAborted(signal);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export function withCorpusCapacityTransaction(
  client,
  operation,
  { inTransaction = false, signal, statementTimeoutMs = 10_000 } = {},
) {
  throwIfCorpusAborted(signal);
  const timeout = Math.max(100, Math.min(Math.trunc(Number(statementTimeoutMs) || 10_000), 60_000));
  if (inTransaction) {
    return (async () => {
      await client.query(CORPUS_CAPACITY_LOCK_SQL);
      throwIfCorpusAborted(signal);
      return operation();
    })();
  }
  // A pg Client serializes its own protocol, but two callers can still overlap
  // at the promise level. Queue owned transactions so neither issues a nested
  // BEGIN on the same connection.
  const previous = corpusCapacityTransactions.get(client) || Promise.resolve();
  const current = previous.catch(() => undefined)
    .then(() => runCorpusCapacityTransaction(client, operation, signal, timeout));
  const tracked = current.finally(() => {
    if (corpusCapacityTransactions.get(client) === tracked) corpusCapacityTransactions.delete(client);
  });
  corpusCapacityTransactions.set(client, tracked);
  return tracked;
}

export async function readCorpusCapacity(client) {
  const result = await client.query(`
    SELECT row_count, total_bytes, version
    FROM practice_corpus_capacity
    WHERE id = TRUE
  `);
  const row = result.rows[0];
  const rowCount = Number(row?.row_count);
  const totalBytes = Number(row?.total_bytes);
  if (!row || Number(row.version) !== CORPUS_CAPACITY_VERSION
    || !Number.isSafeInteger(rowCount) || rowCount < 0
    || !Number.isSafeInteger(totalBytes) || totalBytes < 0) {
    throw new Error("Corpus capacity counter is unavailable or stale");
  }
  return { rowCount, totalBytes };
}

export async function ensureCorpusCapacity(client) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '60000ms'");
    await client.query({ text: CORPUS_CAPACITY_LOCK_SQL, query_timeout: 65_000 });
    await client.query(`
      CREATE TABLE IF NOT EXISTS practice_corpus_capacity (
        id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
        row_count BIGINT NOT NULL CHECK (row_count >= 0),
        total_bytes BIGINT NOT NULL CHECK (total_bytes >= 0),
        version INTEGER NOT NULL CHECK (version >= 0)
      );
      INSERT INTO practice_corpus_capacity (id, row_count, total_bytes, version)
      VALUES (TRUE, 0, 0, 0)
      ON CONFLICT (id) DO NOTHING;
    `);
    const current = await client.query(`
      SELECT capacity.version,
             EXISTS (
               SELECT 1
               FROM pg_trigger
               WHERE tgrelid = 'practice_corpus_documents'::REGCLASS
                 AND tgname = 'practice_corpus_capacity_trigger'
                 AND tgenabled = 'O'
             ) AS trigger_present
      FROM practice_corpus_capacity AS capacity
      WHERE capacity.id = TRUE
    `);
    const versionCurrent = Number(current.rows[0]?.version) === CORPUS_CAPACITY_VERSION;
    const triggerPresent = current.rows[0]?.trigger_present === true;
    await client.query({
      text: `
        CREATE OR REPLACE FUNCTION practice_corpus_capacity_update()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
          IF TG_OP = 'INSERT' THEN
            UPDATE practice_corpus_capacity
            SET row_count = row_count + 1,
                total_bytes = total_bytes + pg_column_size(NEW)
            WHERE id = TRUE;
          ELSIF TG_OP = 'UPDATE' THEN
            UPDATE practice_corpus_capacity
            SET total_bytes = total_bytes - pg_column_size(OLD) + pg_column_size(NEW)
            WHERE id = TRUE;
          ELSE
            UPDATE practice_corpus_capacity
            SET row_count = row_count - 1,
                total_bytes = total_bytes - pg_column_size(OLD)
            WHERE id = TRUE;
          END IF;
          IF NOT FOUND THEN
            RAISE EXCEPTION 'Corpus capacity counter row is missing';
          END IF;
          RETURN NULL;
        END
        $$;

        CREATE OR REPLACE TRIGGER practice_corpus_capacity_trigger
        AFTER INSERT OR UPDATE OR DELETE ON practice_corpus_documents
        FOR EACH ROW EXECUTE FUNCTION practice_corpus_capacity_update();
        ALTER TABLE practice_corpus_documents
        ENABLE TRIGGER practice_corpus_capacity_trigger;
      `,
      query_timeout: 65_000,
    });
    if (versionCurrent && triggerPresent) {
      await client.query("COMMIT");
      return { initialized: false, version: CORPUS_CAPACITY_VERSION };
    }

    // The trigger must never observe a missing counter. The table lock also
    // keeps the scanned bytes stable until the replacement counter is committed.
    await client.query({ text: "LOCK TABLE practice_corpus_documents IN SHARE ROW EXCLUSIVE MODE", query_timeout: 65_000 });
    await client.query("UPDATE practice_corpus_capacity SET row_count = 0, total_bytes = 0 WHERE id = TRUE");

    let rowCount = 0;
    let totalBytes = 0;
    let afterUrl = null;
    for (;;) {
      const result = await client.query(afterUrl === null ? `
        SELECT COUNT(*) AS row_count,
               COALESCE(SUM(row_bytes), 0) AS total_bytes,
               MAX(canonical_url) AS last_url
        FROM (
          SELECT canonical_url, pg_column_size(document) AS row_bytes
          FROM practice_corpus_documents AS document
          ORDER BY canonical_url
          LIMIT 500
        ) AS batch
      ` : `
        SELECT COUNT(*) AS row_count,
               COALESCE(SUM(row_bytes), 0) AS total_bytes,
               MAX(canonical_url) AS last_url
        FROM (
          SELECT canonical_url, pg_column_size(document) AS row_bytes
          FROM practice_corpus_documents AS document
          WHERE canonical_url > $1
          ORDER BY canonical_url
          LIMIT 500
        ) AS batch
      `, afterUrl === null ? [] : [afterUrl]);
      const batch = result.rows[0];
      rowCount += Number(batch.row_count);
      totalBytes += Number(batch.total_bytes);
      if (Number(batch.row_count) < 500) break;
      afterUrl = batch.last_url;
    }
    await client.query(`
      UPDATE practice_corpus_capacity
      SET row_count = $1, total_bytes = $2, version = $3
      WHERE id = TRUE
    `, [rowCount, totalBytes, CORPUS_CAPACITY_VERSION]);
    await client.query("COMMIT");
    return { initialized: true, version: CORPUS_CAPACITY_VERSION };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export async function enforceCorpusRetention(client, { signal } = {}) {
  throwIfCorpusAborted(signal);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    // Every replica and both ingestion paths share one database-scoped lock,
    // so retention and cumulative capacity decisions cannot race each other.
    await client.query({ text: CORPUS_CAPACITY_LOCK_SQL, query_timeout: 15_000 });
    let unavailableDeleted = 0;
    for (let batch = 0; batch < CORPUS_RETENTION_MAX_BATCHES; batch += 1) {
      throwIfCorpusAborted(signal);
      const deleted = await client.query(PORTAL_UNAVAILABLE_DELETE_SQL, [
        PORTAL_UNAVAILABLE_RETENTION_HOURS,
        CORPUS_RETENTION_DELETE_BATCH,
      ]);
      unavailableDeleted += Number(deleted.rowCount || 0);
      if (Number(deleted.rowCount || 0) < CORPUS_RETENTION_DELETE_BATCH) break;
    }

    let overflowDeleted = 0;
    for (let batch = 0; batch < CORPUS_RETENTION_MAX_BATCHES; batch += 1) {
      throwIfCorpusAborted(signal);
      const deleted = await client.query(CORPUS_OVERFLOW_DELETE_SQL, [
        CORPUS_MAX_ROWS,
        CORPUS_MAX_BYTES,
        CORPUS_RETENTION_DELETE_BATCH,
      ]);
      overflowDeleted += Number(deleted.rowCount || 0);
      if (Number(deleted.rowCount || 0) < CORPUS_RETENTION_DELETE_BATCH) break;
    }

    const interrupted = await client.query(`
      UPDATE practice_corpus_runs
      SET status = 'failed',
          finished_at = NOW(),
          error_count = error_count + 1,
          details = jsonb_set(details, '{error}', '"Corpus run interrupted after six hours"'::JSONB, TRUE)
      WHERE status = 'running'
        AND started_at < NOW() - INTERVAL '6 hours'
    `);
    const runsDeleted = await client.query(`
      WITH old_runs AS (
        SELECT id
        FROM practice_corpus_runs
        WHERE status <> 'running'
        ORDER BY id DESC
        OFFSET $1
      )
      DELETE FROM practice_corpus_runs run
      USING old_runs
      WHERE run.id = old_runs.id
    `, [CORPUS_RUN_MAX_ROWS]);
    await client.query("COMMIT");
    return {
      unavailableDeleted,
      overflowDeleted,
      interrupted: Number(interrupted.rowCount || 0),
      runsDeleted: Number(runsDeleted.rowCount || 0),
    };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

function estimatedCorpusDocumentBytes(document) {
  try {
    // The JSON representation includes every variable-width field. Eight KiB
    // of tuple/index overhead makes this deliberately larger than the stored
    // row estimate used by the aggregate cap.
    return Buffer.byteLength(JSON.stringify(document) || "", "utf8") + 8_192;
  } catch {
    return Number.MAX_SAFE_INTEGER;
  }
}

export function limitCorpusDocumentsByAggregateCapacity(
  documents = [],
  existingDocuments = [],
  currentRowCount = 0,
  currentBytes = 0,
  maximumRows = CORPUS_MAX_ROWS,
  maximumBytes = CORPUS_MAX_BYTES,
) {
  return planCorpusDocumentAdmission(
    documents,
    existingDocuments,
    currentRowCount,
    currentBytes,
    maximumRows,
    maximumBytes,
  ).admittedDocuments;
}

export function planCorpusDocumentAdmission(
  documents = [],
  existingDocuments = [],
  currentRowCount = 0,
  currentBytes = 0,
  maximumRows = CORPUS_MAX_ROWS,
  maximumBytes = CORPUS_MAX_BYTES,
) {
  const existing = new Map();
  for (const value of existingDocuments) {
    const isDescriptor = value && typeof value === "object";
    const url = String(isDescriptor ? value.canonical_url || value.url || "" : value || "");
    if (!url) continue;
    const rawBytes = isDescriptor
      ? value.existing_bytes ?? value.existingBytes ?? value.stored_bytes ?? value.storedBytes
      : undefined;
    const parsedBytes = Number(rawBytes);
    existing.set(url, Number.isFinite(parsedBytes) && parsedBytes >= 0
      ? Math.trunc(parsedBytes)
      : undefined);
  }
  const safeMaximumRows = Math.max(0, Math.trunc(Number(maximumRows) || 0));
  const safeMaximumBytes = Math.max(0, Math.trunc(Number(maximumBytes) || 0));
  let newRowSlots = Math.max(0, safeMaximumRows - Math.max(0, Math.trunc(Number(currentRowCount) || 0)));
  let remainingBytes = Math.max(0, safeMaximumBytes - Math.max(0, Math.trunc(Number(currentBytes) || 0)));
  const admittedDocuments = [];
  const livenessOnlyUrls = [];
  for (const document of documents) {
    const url = String(document?.url || "");
    const isExisting = existing.has(url);
    const estimatedBytes = estimatedCorpusDocumentBytes(document);
    const existingBytes = existing.get(url);
    const additionalBytes = isExisting && existingBytes !== undefined
      ? Math.max(0, estimatedBytes - existingBytes)
      : estimatedBytes;
    if (additionalBytes > remainingBytes || (!isExisting && newRowSlots <= 0)) {
      if (isExisting) livenessOnlyUrls.push(url);
      continue;
    }
    remainingBytes -= additionalBytes;
    if (!isExisting) newRowSlots -= 1;
    admittedDocuments.push(document);
  }
  return {
    admittedDocuments,
    livenessOnlyUrls,
    capacityDropped: documents.length - admittedDocuments.length,
  };
}

export async function upsertDocuments(
  client,
  rawDocuments,
  runId,
  { signal, discoveryOnly = false, inTransaction = false } = {},
) {
  const documents = deduplicateCorpusDocuments(rawDocuments);
  let indexed = 0;
  let capacityDropped = 0;
  for (let offset = 0; offset < documents.length; offset += 250) {
    throwIfCorpusAborted(signal);
    const batch = documents.slice(offset, offset + 250);
    const ownsTransaction = !inTransaction;
    if (ownsTransaction) await client.query("BEGIN");
    try {
      if (ownsTransaction) await client.query("SET LOCAL statement_timeout = '10000ms'");
      // Full sync, live discovery and retention all take this transaction lock.
      // Aggregate admission therefore observes a stable capacity snapshot and
      // no replica can insert between the count and the write.
      await client.query({ text: CORPUS_CAPACITY_LOCK_SQL, query_timeout: 15_000 });
      const capacity = await readCorpusCapacity(client);
      const existingResult = await client.query(`
        SELECT canonical_url,
               pg_column_size(document)::BIGINT AS existing_bytes
        FROM practice_corpus_documents AS document
        WHERE canonical_url = ANY($1::TEXT[])
      `, [batch.map((document) => document.url)]);
      throwIfCorpusAborted(signal);
      const admission = planCorpusDocumentAdmission(
        batch,
        existingResult.rows,
        capacity.rowCount,
        capacity.totalBytes,
        CORPUS_MAX_ROWS,
        CORPUS_MAX_BYTES,
      );
      const admittedBatch = admission.admittedDocuments;
      capacityDropped += admission.capacityDropped;
      if (admission.livenessOnlyUrls.length) {
        await client.query(`
          UPDATE practice_corpus_documents
          SET last_seen_at = NOW(),
              last_seen_run = COALESCE($2::BIGINT, last_seen_run),
              is_available = TRUE
          WHERE canonical_url = ANY($1::TEXT[])
          ${discoveryOnly ? "AND source_key = 'official-live-search'" : ""}
        `, [admission.livenessOnlyUrls, runId]);
        throwIfCorpusAborted(signal);
      }
      if (!admittedBatch.length) {
        if (ownsTransaction) await client.query("COMMIT");
        if (ownsTransaction && admission.livenessOnlyUrls.length) corpusListingWindows.clear();
        continue;
      }
      const result = await client.query(`
      INSERT INTO practice_corpus_documents AS current (
        external_id, source_key, canonical_url, title, summary, content, category,
        organization, published_at, published_label, modified_at, topics, source_tier,
        language, metadata_quality, metadata, content_hash, last_seen_run
      )
      SELECT
        item.external_id,
        item.source_key,
        item.canonical_url,
        item.title,
        item.summary,
        item.content,
        item.category,
        item.organization,
        NULLIF(item.published_at, '')::DATE,
        item.published_label,
        NULLIF(item.modified_at, '')::TIMESTAMPTZ,
        COALESCE(ARRAY(SELECT jsonb_array_elements_text(item.topics)), ARRAY[]::TEXT[]),
        item.source_tier,
        item.language,
        item.metadata_quality,
        item.metadata,
        item.content_hash,
        $2
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
      ON CONFLICT (canonical_url) DO UPDATE SET
        external_id = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search'
            THEN current.external_id
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search'
            THEN EXCLUDED.external_id
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.external_id
          ELSE current.external_id
        END,
        source_key = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search'
            THEN current.source_key
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search'
            THEN EXCLUDED.source_key
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.source_key
          ELSE current.source_key
        END,
        title = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.title
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.title
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.title ELSE current.title END,
        summary = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.summary
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.summary
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.summary <> '' THEN EXCLUDED.summary ELSE current.summary END,
        content = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.content
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.content
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.content <> '' THEN EXCLUDED.content ELSE current.content END,
        category = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.category
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.category
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.category <> '' THEN EXCLUDED.category ELSE current.category END,
        organization = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.organization
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.organization
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.organization <> '' THEN EXCLUDED.organization ELSE current.organization END,
        published_at = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.published_at
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.published_at
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN COALESCE(EXCLUDED.published_at, current.published_at) ELSE current.published_at END,
        published_label = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.published_label
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.published_label
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.published_label <> '' THEN EXCLUDED.published_label ELSE current.published_label END,
        modified_at = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.modified_at
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.modified_at
          ELSE GREATEST(current.modified_at, EXCLUDED.modified_at) END,
        topics = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.topics
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.topics
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND cardinality(EXCLUDED.topics) > 0 THEN EXCLUDED.topics ELSE current.topics END,
        source_tier = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.source_tier
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.source_tier
          WHEN current.source_tier = 'reviewed' OR EXCLUDED.source_tier = 'reviewed' THEN 'reviewed'
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.source_tier
          ELSE current.source_tier
        END,
        language = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.language
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.language
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.language ELSE current.language END,
        metadata_quality = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.metadata_quality
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.metadata_quality
          ELSE GREATEST(current.metadata_quality, EXCLUDED.metadata_quality) END,
        metadata = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search'
            THEN current.metadata
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search'
            THEN EXCLUDED.metadata
          WHEN EXCLUDED.source_key = 'official-live-search'
            THEN (current.metadata - 'retired_reason') || EXCLUDED.metadata
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality
            THEN current.metadata || EXCLUDED.metadata
          ELSE EXCLUDED.metadata || current.metadata
        END,
        content_hash = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.content_hash
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN EXCLUDED.content_hash
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality THEN EXCLUDED.content_hash ELSE current.content_hash END,
        fetched_at = CASE
          WHEN EXCLUDED.source_key = 'official-live-search' AND current.source_key <> 'official-live-search' THEN current.fetched_at
          WHEN current.source_key = 'official-live-search' AND EXCLUDED.source_key <> 'official-live-search' THEN NOW()
          WHEN EXCLUDED.metadata_quality >= current.metadata_quality AND EXCLUDED.content <> '' THEN NOW() ELSE current.fetched_at END,
        last_seen_at = NOW(),
        last_seen_run = EXCLUDED.last_seen_run,
        is_available = TRUE
      ${discoveryOnly ? "WHERE current.source_key = 'official-live-search'" : ""}
      RETURNING id
    `, [JSON.stringify(admittedBatch.map((document) => ({
      external_id: document.externalId,
      source_key: document.sourceKey,
      canonical_url: document.url,
      title: document.title,
      summary: document.summary,
      content: document.content,
      category: document.category,
      organization: document.organization,
      published_at: document.publishedAt || "",
      published_label: document.publishedLabel,
      modified_at: document.modifiedAt || "",
      topics: document.topics,
      source_tier: document.sourceTier,
      language: document.language,
      metadata_quality: document.quality,
      metadata: document.metadata,
      content_hash: document.contentHash,
    }))), runId]);
      throwIfCorpusAborted(signal);
      indexed += result.rowCount;
      if (ownsTransaction) {
        await client.query("COMMIT");
        if (result.rowCount || admission.livenessOnlyUrls.length) corpusListingWindows.clear();
      }
    } catch (error) {
      if (ownsTransaction) await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    }
  }
  return { indexed, capacityDropped };
}
// Bounded, restartable index migration. One statement selects and rewrites a
// small batch, so two workers never take the same row (SKIP LOCKED) and no long
// table lock is held. The trigger recomputes the vector from the row's current
// values, so a concurrent content or policy change is preserved.
export async function backfillCorpusIndexVectors(client, {
  limit = 200,
  timeBudgetMs = 1_000,
  afterId = 0,
} = {}) {
  const boundedLimit = Math.max(1, Math.min(Math.trunc(Number(limit) || 200), 1_000));
  const budgetMs = Math.max(50, Math.min(Number(timeBudgetMs) || 1_000, 30_000));
  const cursor = Number.isFinite(Number(afterId)) ? Math.max(0, Math.trunc(Number(afterId))) : 0;
  const startedAt = Date.now();
  const { processedIds, pending } = await withCorpusCapacityTransaction(client, async () => {
    const updated = await client.query(`
      WITH batch AS (
        SELECT id
        FROM practice_corpus_documents
        WHERE id > $1
          AND search_vector_policy IS DISTINCT FROM '${CORPUS_VECTOR_LAYOUT}'
        ORDER BY id
        LIMIT $2
        FOR UPDATE SKIP LOCKED
      )
      UPDATE practice_corpus_documents AS document
      SET title = document.title
      FROM batch
      WHERE document.id = batch.id
      RETURNING document.id
    `, [cursor, boundedLimit]);
    const ids = updated.rows
      .map((row) => Number(row.id))
      .filter((id) => Number.isFinite(id))
      .sort((left, right) => left - right);
    // A short or empty batch does not prove the table is clean: SKIP LOCKED hides
    // rows that another writer holds, and those sit below the cursor. Completion is
    // "no unmigrated row remains anywhere", asked directly rather than inferred.
    const pendingRow = await client.query(`
      SELECT EXISTS (
        SELECT 1
        FROM practice_corpus_documents
        WHERE search_vector_policy IS DISTINCT FROM '${CORPUS_VECTOR_LAYOUT}'
        LIMIT 1
      ) AS pending
    `);
    return { processedIds: ids, pending: pendingRow.rows[0]?.pending === true };
  });
  if (processedIds.length) corpusListingWindows.clear();
  const elapsedMs = Date.now() - startedAt;
  return {
    processed: processedIds.length,
    processedIds,
    lastId: processedIds.length ? processedIds[processedIds.length - 1] : cursor,
    complete: !pending,
    pending,
    elapsedMs,
    budgetSpent: elapsedMs >= budgetMs,
  };
}

let corpusIndexBackfillRun = null;

// One bounded drain per process at a time, under a shared advisory lock so
// replicas do not duplicate the work. It yields between batches and never throws
// into a caller; an unfinished drain simply resumes on the next start.
export function startCorpusIndexBackfill({
  batchSize = 200,
  timeBudgetMs = 750,
  intervalMs = 250,
  maximumPasses = 400,
} = {}) {
  if (corpusIndexBackfillRun || !databaseEnabled()) return corpusIndexBackfillRun;
  corpusIndexBackfillRun = (async () => {
    try {
      await withDatabaseClient(async (client) => {
        const lock = await client.query(
          "SELECT pg_try_advisory_lock(hashtext('practice-corpus-index-backfill')) AS locked",
        );
        if (!lock.rows[0]?.locked) return;
        try {
          let afterId = 0;
          for (let pass = 0; pass < maximumPasses; pass += 1) {
            const batch = await backfillCorpusIndexVectors(client, {
              limit: batchSize,
              timeBudgetMs,
              afterId,
            });
            afterId = batch.lastId;
            if (batch.complete) return;
            if (batch.processed === 0) {
              // Work remains but this forward pass saw nothing, which is what a
              // row held by another writer looks like. Start again from the first
              // id so a row skipped below the cursor is not left behind until the
              // next drain; the pass budget keeps this bounded.
              afterId = 0;
            }
            if (intervalMs > 0) {
              await new Promise((resolve) => {
                const timer = setTimeout(resolve, intervalMs);
                timer.unref?.();
              });
            }
          }
        } finally {
          await client.query("SELECT pg_advisory_unlock(hashtext('practice-corpus-index-backfill'))")
            .catch(() => undefined);
        }
      });
    } catch {
      // A drain must never break a request; the next start resumes it.
    }
  })().finally(() => {
    corpusIndexBackfillRun = null;
  });
  return corpusIndexBackfillRun;
}
