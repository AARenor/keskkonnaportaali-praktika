export const CORPUS_SEARCH_QUERY_VERSION = "corpus-search-window-v1";

export function buildCorpusCandidateQuery({
  vectorLayout,
  officialDiscoveryRetentionHours,
  indexAllowedSql,
  orderClause,
}) {
  // The caller passes the stored-flag expression, so each repeated use below
  // stays identical and unbackfilled rows still evaluate the static witness.
  const indexAllowed = indexAllowedSql;
  return `
      WITH parameters AS (
        SELECT
          websearch_to_tsquery('simple', public.unaccent($1)) AS web_query,
          to_tsquery('simple', public.unaccent($2)) AS prefix_query,
          to_tsquery('simple', public.unaccent($11)) AS any_prefix_query,
          lower($1) AS raw_query,
          $3::TEXT[] AS rank_terms,
          $7::BOOLEAN AS freshness_intent
      ), candidate_ids AS MATERIALIZED (
        -- Filter before the fixed candidate cap. Keep only ids while matching
        -- the broad query, then load and score at most this bounded window.
        SELECT document.id
        FROM practice_corpus_documents document, parameters
        WHERE document.is_available = TRUE
          AND COALESCE(document.metadata->>'robots_noindex', 'false') <> 'true'
          AND (
            document.source_key <> 'official-live-search'
            OR document.last_seen_at >= NOW() - make_interval(hours => ${officialDiscoveryRetentionHours})
          )
          AND (cardinality($4::TEXT[]) = 0 OR document.source_tier = ANY($4::TEXT[]))
          AND ($5::TEXT IS NULL OR document.category = $5::TEXT)
          AND ($6::INTEGER IS NULL OR EXTRACT(YEAR FROM document.published_at)::INTEGER = $6::INTEGER)
          AND (
            cardinality($9::TEXT[]) = 0
            OR COALESCE(CASE
              WHEN document.metadata->>'sourceIdentityVersion' = $10
                THEN document.metadata->>'sourceResourceKey'
            END, '') <> ALL($9::TEXT[])
          )
          AND (
            -- The safe navigation vector is readable for any migrated row. A row
            -- that has not been migrated yet is matched by its title only, so its
            -- old mixed vector can never affect matching; the copied-text vector
            -- is read only while the permission that produced it still holds.
            ((document.search_vector_policy = '${vectorLayout}')
              AND (
                document.search_vector @@ parameters.any_prefix_query
                OR document.search_vector @@ parameters.web_query
                OR (${indexAllowed}
                  AND (
                    document.search_vector_body @@ parameters.any_prefix_query
                    OR document.search_vector_body @@ parameters.web_query
                  ))
              ))
            OR lower(document.title) % parameters.raw_query
            OR lower(document.title) LIKE '%' || parameters.raw_query || '%'
          )
        -- Use a cheap lexical score to choose IDs before full weighted ranking.
        ORDER BY CASE WHEN document.search_vector_policy = '${vectorLayout}'
                   THEN CASE WHEN ${indexAllowed}
                             THEN ts_rank(document.search_vector || document.search_vector_body, parameters.any_prefix_query)
                             ELSE ts_rank(document.search_vector, parameters.any_prefix_query) END
                   ELSE 0 END DESC,
                 document.published_at DESC NULLS LAST, document.id ASC
        LIMIT $8
      ), ranked AS (
        SELECT document.*,
          ${indexAllowed} AS index_allowed,
          (
            -- Rank the bounded candidate window with the established weighted
            -- lexical score, preserving curated source and freshness priority.
            CASE WHEN document.search_vector_policy = '${vectorLayout}'
              AND (CASE WHEN ${indexAllowed}
                        THEN (document.search_vector || document.search_vector_body) @@ parameters.prefix_query
                        ELSE document.search_vector @@ parameters.prefix_query END)
              THEN ts_rank_cd(ARRAY[0.08, 0.2, 0.6, 1.0],
                     CASE WHEN ${indexAllowed}
                          THEN document.search_vector || document.search_vector_body
                          ELSE document.search_vector END,
                     parameters.prefix_query, 32) * 6.0
              ELSE 0 END
            + CASE WHEN document.search_vector_policy = '${vectorLayout}'
              AND (CASE WHEN ${indexAllowed}
                        THEN (document.search_vector || document.search_vector_body) @@ parameters.web_query
                        ELSE document.search_vector @@ parameters.web_query END)
              THEN ts_rank_cd(ARRAY[0.08, 0.2, 0.6, 1.0],
                     CASE WHEN ${indexAllowed}
                          THEN document.search_vector || document.search_vector_body
                          ELSE document.search_vector END,
                     parameters.web_query, 32) * 2.0
              ELSE 0 END
            + GREATEST(
                similarity(public.unaccent(lower(document.title)), public.unaccent(parameters.raw_query)),
                word_similarity(public.unaccent(parameters.raw_query), public.unaccent(lower(document.title)))
              ) * 4.0
            + CASE WHEN public.unaccent(lower(document.title)) LIKE '%' || public.unaccent(parameters.raw_query) || '%' THEN 3.0 ELSE 0 END
            + COALESCE((
                SELECT COUNT(*)::DOUBLE PRECISION * 2.4
                FROM unnest(parameters.rank_terms) AS term
                WHERE public.unaccent(lower(document.title)) LIKE '%' || public.unaccent(term) || '%'
              ), 0)
            + CASE WHEN ${indexAllowed} THEN COALESCE((
                SELECT COUNT(*)::DOUBLE PRECISION * 0.9
                FROM unnest(parameters.rank_terms) AS term
                WHERE public.unaccent(lower(document.summary)) LIKE '%' || public.unaccent(term) || '%'
              ), 0) ELSE 0 END
            + CASE WHEN document.search_vector_policy = '${vectorLayout}'
              AND (document.search_vector @@ parameters.prefix_query
                OR (${indexAllowed}
                  AND document.search_vector_body @@ parameters.prefix_query)) THEN 8.0 ELSE 0 END
            + CASE document.source_tier WHEN 'official' THEN 0.45 WHEN 'reviewed' THEN 0.3 WHEN 'supplementary' THEN 0.05 ELSE 0 END
            + CASE WHEN ${indexAllowed} AND document.content <> '' THEN 0.3 ELSE 0 END
            + CASE WHEN COALESCE(document.metadata->>'placeholder', 'false') = 'true' THEN -0.75 ELSE 0 END
            + CASE
                WHEN document.published_at > CURRENT_DATE THEN -0.5
                WHEN document.published_at IS NULL THEN 0
                WHEN parameters.freshness_intent THEN GREATEST(0, 1.0 - ((CURRENT_DATE - document.published_at)::DOUBLE PRECISION / 2190.0)) * 1.6
                ELSE GREATEST(0, 1.0 - ((CURRENT_DATE - document.published_at)::DOUBLE PRECISION / 3650.0)) * 0.35
              END
          ) AS relevance
        FROM practice_corpus_documents document
        JOIN candidate_ids USING (id)
        CROSS JOIN parameters
      ), bucketed AS (
        SELECT ranked.*, FLOOR(GREATEST(relevance, 0) / 5.0) AS relevance_bucket
        FROM ranked
      )
      SELECT id, source_key, canonical_url, title, summary, content, organization, category,
             published_at, published_label, topics, source_tier, content_hash, fetched_at, metadata,
             index_allowed, relevance
      FROM bucketed
      ORDER BY ${orderClause}
    `;
}
