import {
  databaseEnabled,
  databaseQuery,
  withDatabaseClient,
} from "./database.mjs";
import { PORTAL_PAGE_SIZE } from "./corpus_document_parsing.mjs";
import { corpusListingWindows } from "./corpus_listing_state.mjs";
import {
  enforceCorpusRetention,
  ensureCorpusSchema,
  startCorpusIndexBackfill,
  upsertDocuments,
  withCorpusCapacityTransaction,
} from "./corpus_storage.mjs";
import {
  addCorpusFailure,
  corpusBackfillHydrateLimit,
  corpusFailureCategory,
  corpusFailureCounters,
  hydrateCorpusBacklog,
  hydratePdfUrls,
  hydrateUrls,
} from "./corpus_hydration.mjs";
import {
  crawlOfficialSitemap,
  crawlPortalSearch,
  crawlPortalSitemap,
  OFFICIAL_SITEMAP_SOURCES,
  isRecoverablePortalSearchError,
  wikipediaDocuments,
} from "./corpus_fetch.mjs";
import {
  isRobotsDisallowedCorpusError,
  saveQuerySnapshot,
  shouldRetirePortalCatalog,
  seedReviewedCatalogueDocuments,
} from "./corpus_ingestion.mjs";
import { normalizeCorpusQuery } from "./corpus_query.mjs";

let backgroundSyncPromise;

export async function syncPortalCorpus({
  mode = "full",
  hydrateLimit = 0,
  pdfHydrateLimit = 10,
  seedQueries = ["mets"],
  includeCatalog = true,
  includeWikipedia = true,
  onProgress,
} = {}) {
  await ensureCorpusSchema();
  // Migration of pre-existing rows runs in the background, bounded and under a
  // shared lock, so startup never rewrites the table or blocks a request.
  startCorpusIndexBackfill();
  if (!databaseEnabled()) return { status: "disabled", indexed: 0, discovered: 0, hydrated: 0, skipped: 0, errors: 0 };
  return withDatabaseClient(async (client) => {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('practice-corpus-sync')) AS locked");
    if (!lock.rows[0]?.locked) return { status: "busy", indexed: 0, discovered: 0, hydrated: 0, skipped: 0, errors: 0 };
    let runId;
    const totals = {
      discovered: 0,
      indexed: 0,
      capacityDropped: 0,
      hydrated: 0,
      skipped: 0,
      errors: 0,
    };
    const details = {
      sitemapPages: 0,
      officialSitemaps: {},
      catalogTotal: 0,
      catalogSkipped: null,
      authoritativeCapacityDropped: 0,
      seedQueries: {},
      wikipedia: 0,
      unavailableMarked: 0,
      // Aggregate counts only: a category is a fixed label, never a URL, a
      // hostname, a body fragment or an exception message.
      sitemapErrorCategories: corpusFailureCounters(),
      hydrationErrorCategories: corpusFailureCounters(),
      pdfErrorCategories: corpusFailureCounters(),
    };
    try {
      const run = await client.query(
        "INSERT INTO practice_corpus_runs (mode, status) VALUES ($1, 'running') RETURNING id",
        [mode],
      );
      runId = run.rows[0].id;

      let sitemapDocuments = [];
      try {
        const sitemap = await crawlPortalSitemap();
        sitemapDocuments = sitemap.documents;
        details.sitemapPages = sitemap.pages;
        totals.discovered += sitemapDocuments.length;
        const sitemapUpsert = await upsertDocuments(client, sitemapDocuments, runId);
        totals.indexed += sitemapUpsert.indexed;
        totals.capacityDropped += sitemapUpsert.capacityDropped;
        details.authoritativeCapacityDropped += sitemapUpsert.capacityDropped;
      } catch (error) {
        // The portal is the primary mirror, not the only scrapeable source.
        // A temporary portal outage must not abort official sitemap refreshes.
        const category = corpusFailureCategory(error);
        details.portalSitemap = { category };
        addCorpusFailure(details.sitemapErrorCategories, category);
        totals.errors += 1;
      }
      const reviewedSeed = await seedReviewedCatalogueDocuments(client, runId);
      details.reviewedCatalogueSeeded = reviewedSeed.seeded;

      // The portal is the primary mirror, not the only scrapeable official
      // source. Each publisher is isolated: a blocked or broken sitemap must
      // not discard the pages already discovered from the others.
      const officialSitemapDocuments = [];
      for (const source of OFFICIAL_SITEMAP_SOURCES) {
        try {
          const crawled = await crawlOfficialSitemap(source);
          officialSitemapDocuments.push(...crawled.documents);
          details.officialSitemaps[new URL(source.url).hostname] = {
            pages: crawled.pages,
            discovered: crawled.documents.length,
          };
          if (crawled.documents.length) {
            const officialUpsert = await upsertDocuments(client, crawled.documents, runId);
            totals.discovered += crawled.documents.length;
            totals.indexed += officialUpsert.indexed;
            totals.capacityDropped += officialUpsert.capacityDropped;
          }
        } catch (error) {
          const category = corpusFailureCategory(error);
          details.officialSitemaps[new URL(source.url).hostname] = { category };
          addCorpusFailure(details.sitemapErrorCategories, category);
          totals.errors += 1;
        }
      }
      onProgress?.({ stage: "sitemap", discovered: totals.discovered, indexed: totals.indexed });

      let catalogUrls = [];
      let catalogSkipped = false;
      if (includeCatalog) {
        try {
          const catalog = await crawlPortalSearch("", async (documents, page) => {
            totals.discovered += documents.length;
            const catalogUpsert = await upsertDocuments(client, documents, runId);
            totals.indexed += catalogUpsert.indexed;
            totals.capacityDropped += catalogUpsert.capacityDropped;
            details.authoritativeCapacityDropped += catalogUpsert.capacityDropped;
            onProgress?.({ stage: "catalog", page: page + 1, discovered: totals.discovered, indexed: totals.indexed });
          });
          details.catalogTotal = catalog.total;
          details.catalogRepeatedPages = catalog.repeatedPages || 0;
          catalogUrls = catalog.orderedUrls;
        } catch (error) {
          // The portal now disallows its search endpoint in robots.txt while
          // keeping the sitemap public. Respect that policy, keep the sitemap
          // and seed-query data, and do not fail the whole synchronization.
          if (!isRecoverablePortalSearchError(error)) throw error;
          catalogSkipped = true;
          details.catalogSkipped = isRobotsDisallowedCorpusError(error) ? "robots-disallowed" : "source-unavailable";
        }
      }

      const hydrationCandidates = [];
      for (const rawQuery of seedQueries) {
        const query = normalizeCorpusQuery(rawQuery);
        if (!query) continue;
        try {
          const snapshot = await crawlPortalSearch(query, async (documents, page) => {
            totals.discovered += documents.length;
            const seedUpsert = await upsertDocuments(client, documents, runId);
            totals.indexed += seedUpsert.indexed;
            totals.capacityDropped += seedUpsert.capacityDropped;
            onProgress?.({ stage: "seed-query", query, page: page + 1, indexed: totals.indexed });
          });
          details.seedQueries[query] = {
            total: snapshot.total,
            pages: snapshot.pages,
            repeatedPages: snapshot.repeatedPages || 0,
            storedOccurrences: snapshot.orderedUrls.length,
            distinctUrls: snapshot.distinctUrls.length,
          };
          await saveQuerySnapshot(client, query, snapshot.total, snapshot.orderedUrls, {
            pageCount: snapshot.pages,
            pageSize: PORTAL_PAGE_SIZE,
            sortOrder: "portal-default",
            querySource: "configured-seed",
          });
          hydrationCandidates.push(...snapshot.distinctUrls);
        } catch (error) {
          if (!isRecoverablePortalSearchError(error)) throw error;
          details.seedQueries[query] = { skipped: isRobotsDisallowedCorpusError(error) ? "robots-disallowed" : "source-unavailable" };
        }
      }
      // Seed-query pages are intentionally first: the initial bounded hydration
      // immediately improves the user's primary topics, then fills from the
      // wider portal catalogue on larger/manual runs.
      hydrationCandidates.push(...catalogUrls);
      hydrationCandidates.push(...sitemapDocuments.map((document) => document.url));
      hydrationCandidates.push(...officialSitemapDocuments.map((document) => document.url));

      if (includeWikipedia) {
        try {
          const wikipedia = await wikipediaDocuments();
          details.wikipedia = wikipedia.length;
          totals.discovered += wikipedia.length;
          const wikipediaUpsert = await upsertDocuments(client, wikipedia, runId);
          totals.indexed += wikipediaUpsert.indexed;
          totals.capacityDropped += wikipediaUpsert.capacityDropped;
        } catch (error) {
          addCorpusFailure(details.sitemapErrorCategories, corpusFailureCategory(error));
          totals.errors += 1;
        }
      }

      const hydration = await hydrateUrls(client, hydrationCandidates, runId, {
        limit: hydrateLimit,
        concurrency: 2,
        delayMs: 400,
        onProgress,
      });
      totals.hydrated += hydration.hydrated;
      totals.skipped += hydration.skipped;
      totals.errors += hydration.errors;
      for (const [category, count] of Object.entries(hydration.errorCategories || {})) {
        if (!count) continue;
        details.hydrationErrorCategories[category] = Number(details.hydrationErrorCategories[category] || 0) + count;
      }
      // PDFs are their own background pass: the byte transport and a converter
      // are heavier than a page read, and a partial extraction must never be
      // stored as a complete index.
      const pdfHydration = await hydratePdfUrls(client, hydrationCandidates, runId, {
        limit: pdfHydrateLimit,
        delayMs: 400,
        onProgress,
      });
      totals.hydrated += pdfHydration.hydrated;
      totals.skipped += pdfHydration.skipped;
      totals.errors += pdfHydration.errors;
      for (const [category, count] of Object.entries(pdfHydration.errorCategories || {})) {
        if (!count) continue;
        details.pdfErrorCategories[category] = Number(details.pdfErrorCategories[category] || 0) + count;
      }
      details.hydrationSkipped = totals.skipped;

      // Only a fully completed catalogue run is authoritative enough to retire
      // disappeared portal records. Failed/partial runs never hide old data.
      if (shouldRetirePortalCatalog({
        includeCatalog,
        catalogSkipped,
        authoritativeCapacityDropped: details.authoritativeCapacityDropped,
      })) {
        const retired = await withCorpusCapacityTransaction(client, () => client.query(`
          UPDATE practice_corpus_documents
          SET is_available = FALSE
          WHERE source_key IN ('portal-sitemap', 'portal-catalog', 'official-page-hydration')
            AND (
              canonical_url LIKE 'https://keskkonnaportaal.ee/%'
              OR canonical_url LIKE 'https://www.keskkonnaportaal.ee/%'
            )
            AND last_seen_run IS DISTINCT FROM $1
            AND is_available = TRUE
        `, [runId]));
        details.unavailableMarked = retired.rowCount;
        if (retired.rowCount) corpusListingWindows.clear();
      }

      // Retire pages that a successfully crawled official sitemap no longer
      // lists. Hosts whose sitemap failed are left untouched.
      const crawledOfficialHosts = Object.entries(details.officialSitemaps)
        .filter(([, value]) => !value.error)
        .map(([hostname]) => hostname);
      if (crawledOfficialHosts.length) {
        const hostPatterns = [...new Set(crawledOfficialHosts.flatMap((hostname) => {
          const base = hostname.replace(/^www\./u, "");
          return [`https://${base}/%`, `https://www.${base}/%`];
        }))];
        const retiredOfficial = await withCorpusCapacityTransaction(client, () => client.query(`
          UPDATE practice_corpus_documents
          SET is_available = FALSE
          WHERE source_key IN ('official-sitemap', 'official-page-hydration')
            AND canonical_url LIKE ANY($2::TEXT[])
            AND last_seen_run IS DISTINCT FROM $1
            AND is_available = TRUE
        `, [runId, hostPatterns]));
        details.unavailableMarked += retiredOfficial.rowCount;
        if (retiredOfficial.rowCount) corpusListingWindows.clear();
      }

      details.retention = await enforceCorpusRetention(client);
      corpusListingWindows.clear();

      await client.query(`
        UPDATE practice_corpus_runs
        SET status = 'ready', discovered_count = $2, indexed_count = $3,
            hydrated_count = $4, error_count = $5, details = $6::JSONB, finished_at = NOW()
        WHERE id = $1
      `, [runId, totals.discovered, totals.indexed, totals.hydrated, totals.errors, JSON.stringify(details)]);
      return { status: "ready", ...totals, details };
    } catch (error) {
      if (runId) {
        await client.query(`
          UPDATE practice_corpus_runs
          SET status = 'failed', discovered_count = $2, indexed_count = $3,
              hydrated_count = $4, error_count = $5, details = $6::JSONB, finished_at = NOW()
          WHERE id = $1
        `, [runId, totals.discovered, totals.indexed, totals.hydrated, totals.errors + 1, JSON.stringify({ ...details, error: error.message })]).catch(() => undefined);
      }
      throw error;
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('practice-corpus-sync'))").catch(() => undefined);
    }
  });
}

// A single startup batch cannot fill a 12k-page index. While the process is
// alive, keep taking bounded batches so every scrapeable page eventually gets
// its body; the advisory lock makes concurrent replicas harmless.
export function startContinuousCorpusBackfill({
  intervalMs = Math.max(30_000, Math.min(Number(process.env.CORPUS_BACKFILL_INTERVAL_MS) || 600_000, 900_000)),
  batchSize = Math.max(10, Math.min(Number(process.env.CORPUS_BACKFILL_BATCH_SIZE) || 150, 1_000)),
} = {}) {
  if (!databaseEnabled() || String(process.env.CORPUS_CONTINUOUS_BACKFILL ?? "true").toLocaleLowerCase("en") === "false") {
    return null;
  }
  let running = false;
  const timer = setInterval(async () => {
    if (running) return;
    running = true;
    try {
      // 150 pages per 10 minutes is a ceiling of 21,600 a day, which outruns the
      // 5,316 a day a six day refresh of the official corpus needs while each
      // pass stays a short burst of two-request batches one second apart.
      await hydrateCorpusBacklog({ limit: batchSize, concurrency: 2, delayMs: 1_000 });
    } catch {
      // A transient database or upstream failure must not stop the loop.
    } finally {
      running = false;
    }
  }, intervalMs);
  timer.unref?.();
  return timer;
}

export async function startCorpusSyncIfStale() {
  if (!databaseEnabled() || String(process.env.CORPUS_SYNC_ON_START ?? "true").toLocaleLowerCase("en") === "false") {
    return { status: "disabled" };
  }
  if (backgroundSyncPromise) return backgroundSyncPromise;
  backgroundSyncPromise = (async () => {
    await ensureCorpusSchema();
    const hours = Math.max(1, Math.min(Number(process.env.CORPUS_SYNC_INTERVAL_HOURS) || 24, 168));
    const recent = await databaseQuery(`
      SELECT 1 FROM practice_corpus_runs
      WHERE status = 'ready' AND finished_at > NOW() - ($1 * INTERVAL '1 hour')
      LIMIT 1
    `, [hours]);
    if (recent?.rowCount) {
      // Between full syncs, keep filling page bodies. A title-only row cannot
      // rank for words that appear only in the page text, nor serve as evidence.
      // The same polite pacing as the continuous loop: two requests per batch,
      // one second apart, up to 300 pages per start.
      const backfill = await hydrateCorpusBacklog({
        limit: corpusBackfillHydrateLimit(),
        concurrency: 2,
        delayMs: 1_000,
      });
      // Reviewed catalogue additions (new laws, standards, terminology) must
      // become searchable immediately, not only after the next 24-hour crawl.
      const reviewedSeed = await withDatabaseClient((client) => seedReviewedCatalogueDocuments(client, null));
      return { status: "fresh", backfill, reviewedCatalogueSeeded: reviewedSeed.seeded };
    }
    const seedQueries = String(process.env.CORPUS_SEED_QUERIES || "mets")
      .split(",").map(normalizeCorpusQuery).filter(Boolean).slice(0, 5);
    return syncPortalCorpus({
      mode: "startup-incremental",
      hydrateLimit: Math.max(0, Math.min(Number(process.env.CORPUS_STARTUP_HYDRATE_LIMIT) || 200, 500)),
      seedQueries,
    });
  })().finally(() => {
    backgroundSyncPromise = undefined;
  });
  return backgroundSyncPromise;
}
