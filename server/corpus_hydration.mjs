import { createHash } from "node:crypto";
import { databaseEnabled, withDatabaseClient } from "./database.mjs";
import { requestApprovedPublicHttpsBytes, validateApprovedPublicHttpsUrl } from "./public-https.mjs";
import { extractPdfPages, isPdfContentType } from "./pdf_extraction.mjs";
import {
  boundedText,
  cleanText,
  corpusOriginsForUrl,
  CORPUS_HTTPS_ORIGINS,
  hash,
  extractReadablePage,
  hydrationResourceMatches,
  OFFICIAL_HOSTS,
} from "./corpus_document_parsing.mjs";
import { sourceResourceKey, SOURCE_IDENTITY_VERSION } from "./source-identity.mjs";
import { observeSourcePolicy } from "./source_policy.mjs";
import { corpusListingWindows } from "./corpus_listing_state.mjs";
import {
  APPROVED_PAGE_REFRESH_DAYS,
  CORPUS_MAX_BYTES,
  corpusPolicyWitnessSql,
  ensureCorpusSchema,
  startCorpusIndexBackfill,
  throwIfCorpusAborted,
} from "./corpus_storage.mjs";
import {
  assertPortalRobotsAllowed,
  fetchCorpusText,
  MAX_FETCH_BYTES,
  portalRobotsRedirectGate,
} from "./corpus_fetch.mjs";

export async function persistHydratedCorpusDocument(
  client,
  {
    url,
    title,
    content,
    contentHash,
    metadata,
    runId,
    publishedAt = null,
    organization = "",
    fetchedAt = null,
  },
  { signal, maximumBytes = CORPUS_MAX_BYTES } = {},
) {
  const byteCeiling = Math.max(0, Math.trunc(Number(maximumBytes) || 0));
  throwIfCorpusAborted(signal);
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL statement_timeout = '10000ms'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('practice-corpus-retention-capacity'))");
    const updated = await client.query(`
      UPDATE practice_corpus_documents
      SET title = CASE WHEN $2 <> '' THEN $2 ELSE title END,
          source_key = 'official-page-hydration',
          summary = LEFT($3, 500),
          content = $3,
          topics = ARRAY[]::TEXT[],
          content_hash = $4,
          -- A successful read replaces the failure marker: from here the stored
          -- body and its fetched_at are the record of the last attempt. Keeping
          -- an old or unreadable marker would withhold citation rights from a
          -- body that was just read, and would make the row look retryable on
          -- every backlog pass.
          metadata = (metadata - 'robots_noindex' - 'hydration_attempted_at') || $5::JSONB,
          metadata_quality = GREATEST(metadata_quality, 3),
          published_at = COALESCE($7::DATE, published_at),
          published_label = CASE WHEN $7::DATE IS NOT NULL THEN to_char($7::DATE, 'DD.MM.YYYY') ELSE published_label END,
          organization = CASE WHEN $8 <> '' THEN $8 ELSE organization END,
          -- The policy of this read is bound to this instant: a later failed
          -- attempt moves fetched_at, so the older policy stops matching and the
          -- body it described loses its evidence standing.
          fetched_at = COALESCE($9::TIMESTAMPTZ, NOW()),
          last_seen_at = NOW(),
          last_seen_run = COALESCE($6::BIGINT, last_seen_run),
          is_available = TRUE
      WHERE canonical_url = $1
      RETURNING id
    `, [url, title, content, contentHash, JSON.stringify({
      ...(typeof metadata === "string" ? JSON.parse(metadata) : metadata),
      sourceResourceKey: sourceResourceKey(url),
      sourceIdentityVersion: SOURCE_IDENTITY_VERSION,
    }), runId, publishedAt, organization, fetchedAt]);
    throwIfCorpusAborted(signal);
    if (!updated.rowCount) {
      await client.query("COMMIT");
      return false;
    }
    // Measure the actual replacement, including the generated search vector,
    // while the shared capacity lock excludes every insert and hydration in
    // every replica. Rollback makes an over-cap update completely invisible.
    const aggregate = await client.query(`
      SELECT COALESCE(SUM(pg_column_size(document)), 0)::BIGINT AS total_bytes
      FROM practice_corpus_documents AS document
    `);
    throwIfCorpusAborted(signal);
    if (Math.max(0, Number(aggregate.rows[0]?.total_bytes) || 0) > byteCeiling) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("COMMIT");
    corpusListingWindows.clear();
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export function corpusHydrationCandidates(urls = []) {
  return [...new Set(urls)].filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port
        && OFFICIAL_HOSTS.has(parsed.hostname)
        && !/\.(?:pdf|xlsx?|docx?|zip|csv)$/iu.test(parsed.pathname);
    } catch {
      return false;
    }
  });
}

export function corpusPdfHydrationCandidates(urls = []) {
  return [...new Set(urls)].filter((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === "https:" && !parsed.username && !parsed.password && !parsed.port
        && OFFICIAL_HOSTS.has(parsed.hostname)
        && /\.pdf$/iu.test(parsed.pathname);
    } catch {
      return false;
    }
  });
}
function responseHeaderInstances(headers, name) {
  if (!headers || typeof headers !== "object") return [];
  const key = Object.keys(headers).find((entry) => entry.toLocaleLowerCase("en") === name);
  if (key === undefined) return [];
  const value = headers[key];
  if (Array.isArray(value)) return value.map((entry) => String(entry ?? ""));
  if (value === undefined || value === null) return [];
  return [String(value)];
}

// Background PDF indexing. The bytes go through the same approved transport and
// the robots gate settles before any request, so a disallowed source costs
// nothing. Only a full extraction becomes a document: every non success status
// the extractor reports returns no document and no permission, which is how a
// partial or textless read is kept out of the index instead of being described
// as complete.
export async function hydrateCorpusPdfSource(url, {
  observedAt = new Date().toISOString(),
  robotsObservation = null,
  title = "",
  requestBytes = requestApprovedPublicHttpsBytes,
  extractPages = extractPdfPages,
  signal,
  maximumBytes = MAX_FETCH_BYTES,
  maximumPages,
  maximumTextBytes,
  timeoutMs,
  limiter,
  lookupImpl,
  requestImpl,
  assertRedirectAllowed,
} = {}) {
  const requestedUrl = validateApprovedPublicHttpsUrl(url, CORPUS_HTTPS_ORIGINS).toString();
  const origin = new URL(requestedUrl).origin;
  let robots = robotsObservation;
  if (!robots) {
    try {
      await assertPortalRobotsAllowed(requestedUrl, { signal, lookupImpl, requestImpl });
      robots = { status: "allowed", origin, checkedAt: observedAt };
    } catch (error) {
      if (error?.code === "CORPUS_ROBOTS_DISALLOWED") {
        return { status: "denied", policy: null, document: null, detail: "robots", pageCount: null };
      }
      return {
        status: "robots-unreadable",
        policy: null,
        document: null,
        detail: error?.message || "robots",
        pageCount: null,
      };
    }
  }
  if (!["allowed", "absent"].includes(String(robots.status || ""))) {
    return { status: "denied", policy: null, document: null, detail: "robots", pageCount: null };
  }

  const response = await requestBytes(requestedUrl, {
    approvedOrigins: corpusOriginsForUrl(requestedUrl),
    headers: { Accept: "application/pdf,application/x-pdf" },
    signal,
    maximumBytes: Math.max(1_024, Math.min(Number(maximumBytes) || MAX_FETCH_BYTES, MAX_FETCH_BYTES)),
    maximumRedirects: 3,
    lookupImpl,
    requestImpl,
    assertRedirectAllowed,
  });
  if (!(Number(response.status) >= 200 && Number(response.status) < 300)) {
    return {
      status: "fetch-failed",
      policy: null,
      document: null,
      detail: `status ${Number(response.status) || 0}`,
      pageCount: null,
    };
  }
  const finalUrl = validateApprovedPublicHttpsUrl(
    response.url || requestedUrl,
    corpusOriginsForUrl(requestedUrl),
  ).toString();
  // A same-origin redirect may name a different resource, and a PDF body is
  // never promoted under the pre-redirect row.
  if (!hydrationResourceMatches(requestedUrl, finalUrl)) {
    return {
      status: "resource-changed",
      policy: null,
      document: null,
      detail: "redirect target is not this resource",
      pageCount: null,
    };
  }
  const headerInstances = responseHeaderInstances(response.headers, "x-robots-tag");
  const contentType = responseHeaderInstances(response.headers, "content-type")[0] || "";
  if (!isPdfContentType(contentType)) {
    return {
      status: "unsupported-content-type",
      policy: null,
      document: null,
      detail: contentType.slice(0, 120),
      pageCount: null,
    };
  }

  const extraction = await extractPages(response.body, {
    contentType,
    signal,
    maximumPages,
    maximumTextBytes,
    timeoutMs,
    limiter,
  });
  if (extraction?.status !== "ok") {
    return {
      status: String(extraction?.status || "failed"),
      policy: null,
      document: null,
      detail: extraction?.detail ?? null,
      pageCount: Number.isInteger(extraction?.pageCount) ? extraction.pageCount : null,
    };
  }

  // Page breaks are the locator this module publishes, so the assembled body
  // keeps one space between pages and every locator addresses the stored text.
  let content = "";
  let indexedPages = 0;
  const pageLocators = [];
  for (const page of extraction.pages) {
    const text = cleanText(page.text);
    if (text === "") continue;
    if (content !== "") content += " ";
    const start = content.length;
    content += text;
    indexedPages += 1;
    pageLocators.push({
      pageNumber: Number(page.pageNumber) || indexedPages,
      start,
      end: content.length,
    });
  }
  if (content === "") {
    return {
      status: "textless",
      policy: null,
      document: null,
      detail: null,
      pageCount: Number.isInteger(extraction.pageCount) ? extraction.pageCount : 0,
    };
  }

  const bodyHash = createHash("sha256").update(response.body).digest("hex");
  const policy = observeSourcePolicy({
    requestedUrl,
    finalUrl,
    observedAt,
    contentKind: "fetched-pdf",
    bodyHash,
    artifactHash: createHash("sha256").update(content).digest("hex"),
    robotsObservation: {
      status: robots.status,
      origin: robots.origin || origin,
      checkedAt: robots.checkedAt || observedAt,
    },
    html: "",
    headerInstances,
  });
  const retained = policy.use.retainBody;
  const pageCount = Number.isInteger(extraction.pageCount) && extraction.pageCount > 0
    ? extraction.pageCount
    : indexedPages;
  const pdf = {
    pageCount,
    indexedPages,
    // A complete extraction covers exactly the pages the document declares.
    complete: extraction.pages.length === pageCount,
    extractorVersion: extraction.extractorVersion ?? null,
    retained,
  };
  const document = {
    url: finalUrl,
    requestedUrl,
    title: boundedText(title, 500),
    content: retained ? content : "",
    contentHash: hash(retained ? content : ""),
    publishedAt: null,
    organization: "",
    observedAt,
    retained,
    pageLocators: retained ? pageLocators : [],
    pdf,
    metadata: {
      hydrated: true,
      source_kind: "official-pdf-hydration",
      source_policy: policy,
      source_body_hash: bodyHash,
      pdf,
      page_locators: retained ? pageLocators : [],
      retained,
    },
  };
  return { status: "indexed", policy, document, detail: null, pageCount };
}

// Failure diagnostics stay aggregate and bounded. A category is a fixed label
// from this list, never a URL, a hostname, a body fragment or an exception
// message, so a stored run can be triaged without keeping publisher data or
// personal data around.
export const CORPUS_FAILURE_CATEGORIES = Object.freeze([
  "aborted",
  "busy",
  "content-type",
  "database",
  "dns",
  "extraction",
  "http-status",
  "network",
  "parse",
  "resource-changed",
  "robots-disallowed",
  "robots-unreadable",
  "timeout",
  "tls",
  "too-large",
  "unknown",
]);

export function corpusFailureCounters() {
  return Object.fromEntries(CORPUS_FAILURE_CATEGORIES.map((category) => [category, 0]));
}

export function addCorpusFailure(counters, category) {
  if (!counters || typeof counters !== "object") return counters;
  const key = CORPUS_FAILURE_CATEGORIES.includes(category) ? category : "unknown";
  counters[key] = Number(counters[key] || 0) + 1;
  return counters;
}

export function corpusFailureCategory(error) {
  const code = String(error?.code || "").toUpperCase();
  const name = String(error?.name || "");
  const message = String(error?.message || "");
  if (code === "CORPUS_ROBOTS_DISALLOWED") return "robots-disallowed";
  if (name === "AbortError" || code === "ABORT_ERR" || code === "ABORTED") return "aborted";
  if (code === "ETIMEDOUT" || /time[d ]?\s?out/iu.test(message)) return "timeout";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN") return "dns";
  if (/CERT|TLS|SSL/u.test(code) || /certificate|\btls\b|\bssl\b/iu.test(message)) return "tls";
  if (/ECONN|EHOSTUNREACH|ENETUNREACH|EPIPE/u.test(code)) return "network";
  if (/^Corpus source returned \d+/u.test(message)) return "http-status";
  if (/too large|exceeds the configured byte/iu.test(message)) return "too-large";
  if (/content type|not a PDF|invalid-signature/iu.test(message)) return "content-type";
  if (/redirect|not this resource/iu.test(message)) return "resource-changed";
  if (/robots/iu.test(message)) return "robots-unreadable";
  if (/\bpg_\b|postgres|relation|constraint|database/iu.test(`${code} ${message}`)) return "database";
  if (/sitemap|parse|XML/iu.test(`${code} ${message}`)) return "parse";
  return "unknown";
}

// A PDF extractor status is already a closed vocabulary, and it is folded into
// the same bounded set so one run report has one shape.
export function pdfFailureCategory(status) {
  switch (String(status || "")) {
    case "aborted": return "aborted";
    case "busy": return "busy";
    case "timeout": return "timeout";
    case "too-large":
    case "text-too-large": return "too-large";
    case "invalid-signature":
    case "unsupported-content-type": return "content-type";
    case "robots-unreadable":
    case "denied": return "robots-unreadable";
    case "fetch-failed": return "http-status";
    case "resource-changed": return "resource-changed";
    case "encrypted":
    case "corrupt":
    case "textless":
    case "too-many-pages":
    case "unavailable":
    case "extraction": return "extraction";
    default: return "unknown";
  }
}

async function selectHydrationCandidates(client, rawCandidates, safeLimit) {
  const prioritized = await client.query(`
    WITH candidates AS (
      SELECT canonical_url, position
      FROM unnest($1::TEXT[]) WITH ORDINALITY AS candidate(canonical_url, position)
    )
    SELECT document.canonical_url
    FROM practice_corpus_documents document
    JOIN candidates USING (canonical_url)
    WHERE document.is_available = TRUE OR document.metadata->>'robots_noindex' = 'true'
    ORDER BY
      CASE
        WHEN document.content = '' AND NOT (document.metadata ? 'hydration_attempted_at') THEN 0
        WHEN document.content = '' THEN 1
        -- A body stored without the witness of its own read cannot be published,
        -- so it is useless until it is read again, while a witnessed body that is
        -- merely due can still answer. Unusable rows are taken first.
        WHEN NOT ${corpusPolicyWitnessSql("document")} THEN 2
        ELSE 3
      END,
      CASE
        WHEN document.content = '' AND NOT (document.metadata ? 'hydration_attempted_at')
          THEN candidates.position
        WHEN NOT ${corpusPolicyWitnessSql("document")}
          THEN candidates.position
      END ASC NULLS LAST,
      document.fetched_at ASC,
      candidates.position ASC
    LIMIT $2
  `, [rawCandidates, safeLimit]);
  return prioritized.rows.map((row) => row.canonical_url);
}

// The PDF pass runs after the page pass, one document at a time, because a
// converter is the expensive part of the run and the extractor already bounds
// how many may run at once.
export async function hydratePdfUrls(client, urls, runId, {
  limit = 0,
  delayMs = 400,
  onProgress,
} = {}) {
  const rawCandidates = corpusPdfHydrationCandidates(urls);
  const safeLimit = Math.max(0, Number(limit) || 0);
  if (!safeLimit || !rawCandidates.length) {
    return { hydrated: 0, skipped: 0, errors: 0, errorCategories: corpusFailureCounters() };
  }
  const candidates = await selectHydrationCandidates(client, rawCandidates, safeLimit);
  let hydrated = 0;
  let skipped = 0;
  let errors = 0;
  const errorCategories = corpusFailureCounters();
  for (const [index, url] of candidates.entries()) {
    try {
      const result = await hydrateCorpusPdfSource(url, { observedAt: new Date().toISOString() });
      if (result.status !== "indexed" || !result.document) {
        skipped += 1;
        addCorpusFailure(errorCategories, pdfFailureCategory(result.status));
        // A failed or refused read is an attempt, so the older body keeps its
        // bytes but loses the match with its policy and stops being evidence.
        await client.query(`
          UPDATE practice_corpus_documents
          SET fetched_at = NOW(),
              metadata = metadata || jsonb_build_object(
                'hydration_attempted_at', NOW(),
                'pdf_status', $2::TEXT
              )
          WHERE canonical_url = $1
        `, [url, result.status]);
        corpusListingWindows.clear();
      } else if (result.policy?.directives?.noindex) {
        skipped += 1;
        await client.query(`
          UPDATE practice_corpus_documents
          SET content = '', content_hash = $2, is_available = FALSE,
              fetched_at = $4::TIMESTAMPTZ,
              metadata = metadata || $3::JSONB
          WHERE canonical_url = $1
        `, [
          url,
          hash(JSON.stringify([url, "pdf-noindex"])),
          JSON.stringify({
            robots_noindex: true,
            pdf_status: "noindex",
            source_policy: result.policy,
          }),
          result.document.observedAt,
        ]);
        corpusListingWindows.clear();
      } else {
        const stored = await persistHydratedCorpusDocument(client, {
          url,
          title: result.document.title,
          content: result.document.content,
          contentHash: result.document.contentHash,
          publishedAt: result.document.publishedAt,
          organization: result.document.organization,
          fetchedAt: result.document.observedAt,
          metadata: JSON.stringify({ ...result.document.metadata, pdf_status: "indexed" }),
          runId,
        });
        if (stored) hydrated += 1;
        else skipped += 1;
      }
    } catch (error) {
      errors += 1;
      addCorpusFailure(errorCategories, corpusFailureCategory(error));
    }
    onProgress?.({ stage: "pdf", completed: index + 1, total: candidates.length, hydrated, skipped, errors });
    if (index + 1 < candidates.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { hydrated, skipped, errors, errorCategories };
}

export async function hydrateUrls(client, urls, runId, { limit = 0, concurrency = 2, delayMs = 2_000, onProgress } = {}) {
  const rawCandidates = corpusHydrationCandidates(urls);
  const safeLimit = Math.max(0, Number(limit) || 0);
  if (!safeLimit || !rawCandidates.length) return { hydrated: 0, skipped: 0, errors: 0 };
  const candidates = await selectHydrationCandidates(client, rawCandidates, safeLimit);
  let hydrated = 0;
  let skipped = 0;
  let errors = 0;
  const errorCategories = corpusFailureCounters();
  let databaseMutationQueue = Promise.resolve();
  const serializeDatabaseMutation = (operation) => {
    const queued = databaseMutationQueue.then(operation, operation);
    databaseMutationQueue = queued.catch(() => undefined);
    return queued;
  };
  for (let offset = 0; offset < candidates.length; offset += concurrency) {
    const batch = candidates.slice(offset, offset + concurrency);
    const results = await Promise.allSettled(batch.map(async (url) => {
      const observedAt = new Date().toISOString();
      await assertPortalRobotsAllowed(url);
      // The transport may follow an approved same-resource redirect from the
      // publisher's bare host to its www host; the gate settles the destination
      // origin's own policy before that destination is requested.
      const response = await fetchCorpusText(url, {
        retries: 1,
        assertRedirectAllowed: portalRobotsRedirectGate,
      });
      if (!response.contentType.includes("text/html")) return false;
      // The transport may follow only approved HTTPS origins, but a same-origin
      // redirect can still name a different resource. Never promote that body
      // under the pre-redirect row's title, organization, category, or URL.
      if (!hydrationResourceMatches(url, response.finalUrl)) return false;
      const extracted = extractReadablePage(response.text, url);
      // The policy is observed for this exact response and stored with the body,
      // so the decision can be rechecked later without holding the page.
      const policy = observeSourcePolicy({
        requestedUrl: url,
        finalUrl: response.finalUrl,
        observedAt,
        contentKind: "fetched-html",
        bodyHash: hash(response.text),
        artifactHash: hash(extracted.content),
        robotsObservation: {
          status: "allowed",
          origin: new URL(url).origin,
          checkedAt: observedAt,
        },
        html: response.text,
        headerInstances: response.robotsTags,
      });
      if (policy.directives.noindex) {
        await serializeDatabaseMutation(() => client.query(`
          UPDATE practice_corpus_documents
          SET content = '', content_hash = $2, is_available = FALSE, fetched_at = $4::TIMESTAMPTZ,
              metadata = metadata || $3::JSONB
          WHERE canonical_url = $1
        `, [
          url,
          hash(JSON.stringify([url, "robots-noindex"])),
          JSON.stringify({ robots_noindex: true, source_policy: policy }),
          observedAt,
        ]));
        corpusListingWindows.clear();
        return false;
      }
      if (!policy.use.retainBody) {
        // noarchive: the page stays discoverable, but no copy of its body is
        // kept, so there is nothing here that could be quoted later.
        await serializeDatabaseMutation(() => client.query(`
          UPDATE practice_corpus_documents
          SET content = '', summary = '', content_hash = $2, is_available = TRUE,
              fetched_at = $4::TIMESTAMPTZ,
              metadata = (metadata - 'robots_noindex' - 'hydration_attempted_at') || $3::JSONB
          WHERE canonical_url = $1
        `, [
          url,
          hash(JSON.stringify([url, "no-retained-body"])),
          JSON.stringify({ hydrated: true, retained: false, source_policy: policy }),
          observedAt,
        ]));
        corpusListingWindows.clear();
        return false;
      }
      if (extracted.content.length < 80) return false;
      return serializeDatabaseMutation(() => persistHydratedCorpusDocument(client, {
        url,
        title: extracted.title,
        content: extracted.content,
        publishedAt: extracted.publishedAt,
        organization: extracted.organization,
        contentHash: hash(extracted.content),
        fetchedAt: observedAt,
        metadata: JSON.stringify({
          hydrated: true,
          source_kind: "official-page-hydration",
          source_updated_at: extracted.updatedAt,
          source_body_hash: hash(response.text),
          source_policy: policy,
        }),
        runId,
      }));
    }));
    hydrated += results.filter((result) => result.status === "fulfilled" && result.value).length;
    skipped += results.filter((result) => result.status === "fulfilled" && !result.value).length;
    errors += results.filter((result) => result.status === "rejected").length;
    for (const result of results) {
      if (result.status === "rejected") {
        addCorpusFailure(errorCategories, corpusFailureCategory(result.reason));
      }
    }
    const notHydrated = results.flatMap((result, index) => (
      result.status === "fulfilled" && result.value ? [] : [batch[index]]
    ));
    if (notHydrated.length) {
      await client.query(`
        UPDATE practice_corpus_documents
        SET fetched_at = NOW(),
            metadata = metadata || jsonb_build_object('hydration_attempted_at', NOW())
        WHERE canonical_url = ANY($1::TEXT[])
      `, [notHydrated]);
      corpusListingWindows.clear();
    }
    onProgress?.({ stage: "hydrate", completed: Math.min(offset + batch.length, candidates.length), total: candidates.length, hydrated, skipped, errors });
    if (offset + concurrency < candidates.length && delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  return { hydrated, skipped, errors, errorCategories };
}

export function corpusBackfillHydrateLimit(value = process.env.CORPUS_BACKFILL_HYDRATE_LIMIT) {
  const parsed = Number(value);
  return Math.max(0, Math.min(Number.isFinite(parsed) && String(value ?? "").trim() !== "" ? parsed : 300, 1_000));
}

// Hydrate missing bodies and repair provenance overwritten by older sitemap
// merges. Damaged rows remain route-only until a new approved fetch succeeds;
// retaining a body or its old hash never restores evidence rights by itself.
//
// Selection keeps two clocks apart. A failed or skipped read, recorded as
// metadata.hydration_attempted_at at or after the stored body time, becomes due
// again once the seven day cooldown has passed, even though the row still holds
// the body read before that attempt. A body that was replaced successfully is
// due again one day before its seven day evidence window closes. Without the
// retry clock a page whose first read succeeded and whose later refreshes all
// failed could never be read again: the failed attempt moved fetched_at forward
// while the body stayed stale. An unreadable attempt marker cannot prove either
// clock, so it neither blocks a body-less row nor forces a re-read, and it must
// not abort the whole pass. A successful read clears the marker, so only a page
// still waiting for a read that works carries one.
export async function hydrateCorpusBacklog({ limit = 300, concurrency = 2, delayMs = 1_000 } = {}) {
  await ensureCorpusSchema();
  startCorpusIndexBackfill();
  const safeLimit = Math.max(0, Math.trunc(Number(limit) || 0));
  if (!databaseEnabled() || !safeLimit) return { status: "disabled", hydrated: 0, skipped: 0, errors: 0 };
  return withDatabaseClient(async (client) => {
    const lock = await client.query("SELECT pg_try_advisory_lock(hashtext('practice-corpus-sync')) AS locked");
    if (!lock.rows[0]?.locked) return { status: "busy", hydrated: 0, skipped: 0, errors: 0 };
    try {
      const backlog = await client.query(`
        SELECT document.canonical_url
        FROM practice_corpus_documents AS document
        CROSS JOIN LATERAL (
          -- Attempt markers were written by several code generations and a
          -- historical value can be absent, JSON null or not a timestamp at all.
          -- Validate before casting so one unreadable row cannot abort the pass.
          -- pg_input_is_valid needs PostgreSQL 16 or newer; the deployed image
          -- is postgres:17.
          SELECT CASE
            WHEN pg_input_is_valid(document.metadata->>'hydration_attempted_at', 'timestamptz')
              THEN (document.metadata->>'hydration_attempted_at')::TIMESTAMPTZ
            ELSE NULL
          END AS attempted_at
        ) AS attempt
        WHERE document.is_available = TRUE
          AND document.source_key IN ('portal-sitemap', 'portal-catalog', 'official-sitemap', 'official-live-search', 'official-page-hydration')
          AND NOT (document.metadata ? 'robots_noindex')
          AND (
            document.content = ''
            -- A stored body without the witness of its own read has no publication
            -- proof, so delivery keeps it route-only. Re-read it instead of letting
            -- it wait for the age window that only renews bodies it could cite.
            OR (document.content <> '' AND NOT ${corpusPolicyWitnessSql("document")})
            OR document.source_key IN ('official-sitemap', 'official-live-search')
            OR (document.source_key = 'official-page-hydration'
              AND document.metadata->>'source_kind' IS DISTINCT FROM 'official-page-hydration')
            -- A citable page is renewed one day before its seven day evidence
            -- window closes, so a body is replaced while it can still answer
            -- instead of lapsing first and waiting for the next slow cycle.
            OR document.fetched_at < NOW() - make_interval(days => ${APPROVED_PAGE_REFRESH_DAYS})
            -- The last attempt is at least as new as the stored body, so the
            -- body was never refreshed after it and the page is still waiting
            -- for a read that works. Retry it after the cooldown instead of the
            -- thirty day window. A body newer than its attempt was refreshed
            -- successfully afterwards and falls back to that window, which keeps
            -- a successful read from being fetched again on every pass.
            OR (
              attempt.attempted_at >= document.fetched_at
              AND attempt.attempted_at < NOW() - INTERVAL '7 days'
            )
          )
          AND (
            -- Cooldown. An unreadable marker has no proof of a recent attempt,
            -- so it cannot hold back a body-less row.
            attempt.attempted_at IS NULL
            OR attempt.attempted_at < NOW() - INTERVAL '7 days'
          )
        ORDER BY
          -- An unwitnessed body is unusable today, while a witnessed body is merely
          -- due for renewal, so the unusable rows are taken first. The cooldown and
          -- the robots and source guards above still decide whether a row may be
          -- read at all; this only orders the rows that already qualify.
          CASE WHEN document.content <> '' AND NOT ${corpusPolicyWitnessSql("document")} THEN 0 ELSE 1 END,
          CASE WHEN document.source_key = 'official-page-hydration' THEN 0 ELSE 1 END,
          CASE WHEN document.canonical_url ~ '/(uudised|teemad)/' THEN 0 ELSE 1 END,
          CASE
            WHEN document.canonical_url LIKE 'https://keskkonnaportaal.ee/%'
              OR document.canonical_url LIKE 'https://www.keskkonnaportaal.ee/%' THEN 0
            ELSE 1
          END,
          CASE
            WHEN document.canonical_url ~ '/(?:juhend|juhised|kasiraamat|kkk|kysimused|teemad|keskkonnakasutus|jaatmed|vesi|valisohk|kliima|radoon|hallitus|metsloom|loomahaig)' THEN 0
            ELSE 1
          END,
          -- Inside one authority class the oldest stored body is read first, so
          -- a page cannot starve behind fresher bodies in the same class while
          -- its own evidence window closes.
          document.fetched_at ASC,
          document.published_at DESC NULLS LAST,
          document.id DESC
        LIMIT $1
      `, [safeLimit]);
      const urls = backlog.rows.map((row) => row.canonical_url);
      const result = await hydrateUrls(client, urls, null, { limit: safeLimit, concurrency, delayMs });
      return { status: "ready", remainingChecked: urls.length, ...result };
    } finally {
      await client.query("SELECT pg_advisory_unlock(hashtext('practice-corpus-sync'))").catch(() => undefined);
    }
  });
}
