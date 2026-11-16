import { randomBytes, randomUUID } from "node:crypto";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeQueryIntent } from "../server/query_intent.mjs";
import { estimateLlmUsageScenarios } from "../server/llm_usage.mjs";
import {
  MAX_AUDIT_RESPONSE_BYTES,
  requestBoundedAuditJson,
} from "./audit-http.mjs";

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_BASELINE = resolve(PROJECT_ROOT, "evaluation/search_improvements_before_20261113.json");
const MAX_BASELINE_BYTES = 2_000_000;
const MAX_REQUEST_BYTES = 16_384;
const MAX_CASES = 50;
const MAX_JOB_POLLS = 320;
const MAX_JOB_POLL_DELAY_MS = 5_000;
const MINIMUM_JOB_POLL_DELAY_MS = 100;
const SEARCH_TRANSPORT_TIMEOUT_MS = 300_000;
const HEALTH_TIMEOUT_MS = 10_000;
const JOB_CANCELLATION_TIMEOUT_MS = 5_000;
const USAGE_STATUSES = new Set(["actual", "unknown", "deterministic_zero", "cache_hit"]);
const TOKEN_FIELDS = [
  "input_tokens",
  "cached_input_tokens",
  "reasoning_tokens",
  "output_tokens",
  "total_tokens",
];

function evaluationError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function parseArguments(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (!argument.startsWith("--")) throw evaluationError("INVALID_ARGUMENTS");
    const separator = argument.indexOf("=");
    const name = argument.slice(2, separator === -1 ? undefined : separator);
    let value = separator === -1 ? undefined : argument.slice(separator + 1);
    if (separator === -1 && name !== "async" && args[index + 1] && !args[index + 1].startsWith("--")) {
      value = args[index + 1];
      index += 1;
    }
    if (!["base-url", "output", "baseline", "interval-ms", "async"].includes(name)) {
      throw evaluationError("INVALID_ARGUMENTS");
    }
    if (Object.hasOwn(parsed, name)) throw evaluationError("INVALID_ARGUMENTS");
    if (name === "async") {
      if (value !== undefined) throw evaluationError("INVALID_ARGUMENTS");
      parsed[name] = true;
    } else {
      if (typeof value !== "string" || !value.trim()) throw evaluationError("INVALID_ARGUMENTS");
      parsed[name] = value;
    }
  }
  if (!parsed["base-url"] || !parsed.output) throw evaluationError("INVALID_ARGUMENTS");
  return parsed;
}

function searchOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw evaluationError("INVALID_BASE_URL");
  }
  if (!["http:", "https:"].includes(parsed.protocol) || parsed.username || parsed.password
    || parsed.search || parsed.hash) {
    throw evaluationError("INVALID_BASE_URL");
  }
  return new URL(parsed.origin);
}

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function boundedString(value, maximumLength = 300) {
  return typeof value === "string" ? value.slice(0, maximumLength) : null;
}

const SEARCH_FILTER_SOURCES = new Set(["all", "trusted", "official", "reviewed", "supplementary", "other"]);

function projectAppliedFilters(value) {
  if (!isObject(value)) return null;
  const source = boundedString(value.source, 20);
  const category = boundedString(value.category, 120);
  const year = value.year === null
    ? null
    : Number.isSafeInteger(value.year)
      && value.year >= 1990
      && value.year <= new Date().getUTCFullYear() + 1
      ? value.year
      : null;
  return {
    source: SEARCH_FILTER_SOURCES.has(source) ? source : null,
    category,
    year,
    sort: value.sort === "newest" || value.sort === "relevance" ? value.sort : null,
  };
}

function nonNegativeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function finiteNonNegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function missingUsageTelemetry() {
  return {
    status: "missing",
    requests: null,
    input_tokens: null,
    cached_input_tokens: null,
    reasoning_tokens: null,
    output_tokens: null,
    total_tokens: null,
    cost_estimate: {
      amount: null,
      currency: null,
      rate_provenance: null,
      status: "missing",
    },
  };
}

function normalizeUsageTelemetry(value) {
  if (!isObject(value)) return missingUsageTelemetry();
  const status = USAGE_STATUSES.has(value.status) ? value.status : "unrecognized";
  const cost = isObject(value.cost_estimate) ? value.cost_estimate : {};
  return {
    status,
    requests: nonNegativeInteger(value.requests),
    input_tokens: nonNegativeInteger(value.input_tokens),
    cached_input_tokens: nonNegativeInteger(value.cached_input_tokens),
    reasoning_tokens: nonNegativeInteger(value.reasoning_tokens),
    output_tokens: nonNegativeInteger(value.output_tokens),
    total_tokens: nonNegativeInteger(value.total_tokens),
    cost_estimate: {
      amount: finiteNonNegative(cost.amount),
      currency: boundedString(cost.currency, 8),
      rate_provenance: boundedString(cost.rate_provenance, 240),
      status: boundedString(cost.status, 40),
    },
  };
}

function publicResponseHeaders(headers) {
  const age = headers.get("age");
  return {
    cacheControl: boundedString(headers.get("cache-control"), 120),
    cdnCacheStatus: boundedString(headers.get("cf-cache-status"), 40),
    ageSeconds: age !== null && /^\d+$/u.test(age) ? Number(age) : null,
    appBuild: boundedString(headers.get("x-app-build"), 120),
  };
}

function projectCitationSource(source) {
  if (!isObject(source)) return null;
  return {
    id: boundedString(source.id, 240),
    citation: source.citation ?? null,
    title: boundedString(source.title, 400),
    organization: boundedString(source.organization, 200),
    type: boundedString(source.type, 160),
    url: boundedString(source.url, 2_000),
    locator: boundedString(source.locator, 400),
    published: boundedString(source.published, 120),
    sourceTier: boundedString(source.sourceTier, 80),
  };
}

function citationReferences(answer) {
  if (!isObject(answer)) return [];
  const citations = [];
  if (Array.isArray(answer.introCitations)) {
    citations.push({ location: "intro", refs: answer.introCitations.slice(0, 24) });
  }
  for (const [index, part] of (Array.isArray(answer.parts) ? answer.parts : []).entries()) {
    if (!Array.isArray(part?.citations)) continue;
    citations.push({
      location: "part",
      partIndex: index,
      title: boundedString(part.title, 300),
      refs: part.citations.slice(0, 24),
    });
  }
  return citations;
}

function projectResultPage(listing, fallbackPage) {
  const items = Array.isArray(listing?.items) ? listing.items : [];
  return {
    page: nonNegativeInteger(listing?.page) ?? fallbackPage,
    pageSize: nonNegativeInteger(listing?.pageSize),
    total: nonNegativeInteger(listing?.total),
    totalRelation: boundedString(listing?.totalRelation, 12),
    truncated: typeof listing?.truncated === "boolean" ? listing.truncated : null,
    hasMore: typeof listing?.hasMore === "boolean" ? listing.hasMore : null,
    windowId: boundedString(listing?.windowId, 128),
    windowExpired: listing?.windowExpired === true,
    items: items.slice(0, 50).map(projectCitationSource).filter(Boolean),
  };
}

function answerChart(body) {
  return body?.chart
    ?? body?.result?.chart
    ?? body?.answer?.chart
    ?? body?.visualization?.chart
    ?? null;
}

function answerTable(body) {
  return body?.table
    ?? body?.tables
    ?? body?.result?.table
    ?? body?.answer?.table
    ?? body?.answer?.tables
    ?? body?.visualization?.table
    ?? null;
}

function projectSearchCase(index, request, outcome) {
  const body = outcome.body;
  const answer = isObject(body?.answer) ? body.answer : null;
  const telemetry = normalizeUsageTelemetry(body?.usage_telemetry);
  const listing = body?.searchResults;
  const sources = (Array.isArray(body?.sources) ? body.sources : [])
    .slice(0, 50)
    .map(projectCitationSource)
    .filter(Boolean);
  const chart = answerChart(body);
  const table = answerTable(body);
  const record = {
    caseIndex: index + 1,
    intent: analyzeQueryIntent(request.q),
    intentSource: "local_evaluator",
    request,
    transport: outcome.transport,
    http: outcome.http,
    cache: {
      answerCacheHit: telemetry?.status === "cache_hit" ? true : null,
      responseHeaders: outcome.responseHeaders,
    },
    usageTelemetry: telemetry,
    answer,
    citations: citationReferences(answer),
    sources,
    resultPage: projectResultPage(listing, request.page),
    presentation: {
      chart,
      table,
    },
    failure: outcome.failure || null,
  };
  return record;
}

function safeFailure(error) {
  const name = typeof error?.name === "string" && /^[A-Za-z][A-Za-z0-9]*$/u.test(error.name)
    ? error.name.slice(0, 80)
    : "Error";
  const code = typeof error?.code === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(error.code)
    ? error.code
    : null;
  return { name, code };
}

function roundScenario(value) {
  return value === null ? null : Number(value.toFixed(6));
}

function sumMeasuredField(rows, field) {
  const knownValues = rows
    .map((row) => row.usageTelemetry?.[field])
    .filter((value) => Number.isSafeInteger(value) && value >= 0);
  const totalKnown = knownValues.reduce((sum, value) => sum + value, 0);
  return {
    total: knownValues.length === rows.length && rows.length > 0 ? totalKnown : null,
    knownTotal: totalKnown,
    measuredSearches: knownValues.length,
    complete: knownValues.length === rows.length && rows.length > 0,
    meanPerSearch: knownValues.length === rows.length && rows.length > 0
      ? totalKnown / rows.length
      : null,
  };
}

function summarizeUsage(rows) {
  const statusCounts = { actual: 0, unknown: 0, deterministic_zero: 0, cache_hit: 0, missing: 0, unrecognized: 0 };
  for (const row of rows) {
    const status = row.usageTelemetry?.status || "missing";
    statusCounts[Object.hasOwn(statusCounts, status) ? status : "unrecognized"] += 1;
  }
  const actualRows = rows.filter((row) => row.usageTelemetry?.status === "actual");
  const tokenTotals = Object.fromEntries(TOKEN_FIELDS.map((field) => [field, sumMeasuredField(actualRows, field)]));
  const actualModelRequestTotals = sumMeasuredField(actualRows, "requests");
  const configuredEstimates = actualRows.map((row) => row.usageTelemetry?.cost_estimate);
  const completeUsdEstimates = configuredEstimates.length > 0
    && configuredEstimates.every((cost) => cost?.status === "estimated"
      && cost.currency === "USD"
      && typeof cost.rate_provenance === "string"
      && cost.rate_provenance.length > 0
      && typeof cost.amount === "number");
  const usdEstimateTotal = completeUsdEstimates
    ? configuredEstimates.reduce((sum, cost) => sum + cost.amount, 0)
    : null;
  const provenances = [...new Set(configuredEstimates
    .map((cost) => cost?.rate_provenance)
    .filter((value) => typeof value === "string" && value))];
  const scenarioCounts = [1, 10, 100];
  const measuredUsageScenarios = actualRows.map((row) => estimateLlmUsageScenarios(
    row.usageTelemetry,
    scenarioCounts,
    null,
  ));
  const scenarios = scenarioCounts.map((searchCount, scenarioIndex) => {
    const projectedRows = actualRows.map((_, index) => {
      const scaledUsage = measuredUsageScenarios[index][scenarioIndex].usage_telemetry;
      return {
        usageTelemetry: {
          requests: actualModelRequestTotals.complete ? scaledUsage.requests : null,
          ...Object.fromEntries(TOKEN_FIELDS.map((field) => [
            field,
            tokenTotals[field].complete ? scaledUsage[field] : null,
          ])),
        },
      };
    });
    const projectedRequestTotals = sumMeasuredField(projectedRows, "requests");
    const projectedTokenTotals = Object.fromEntries(TOKEN_FIELDS.map((field) => [
      field,
      sumMeasuredField(projectedRows, field),
    ]));
    return {
      searchCount,
      measuredSearches: actualRows.length,
      basis: actualRows.length ? "mean of per-search usage_telemetry.status=actual rows" : null,
      modelRequestsPerSearch: actualModelRequestTotals.meanPerSearch === null
        ? null
        : roundScenario(actualModelRequestTotals.meanPerSearch),
      totalModelRequests: projectedRequestTotals.meanPerSearch === null
        ? null
        : roundScenario(projectedRequestTotals.meanPerSearch),
      tokens: Object.fromEntries(TOKEN_FIELDS.map((field) => {
        const mean = projectedTokenTotals[field].meanPerSearch;
        return [field, mean === null ? null : roundScenario(mean)];
      })),
      configuredIllustrativeUsd: completeUsdEstimates
        ? roundScenario((usdEstimateTotal / actualRows.length) * searchCount)
        : null,
      costStatus: completeUsdEstimates ? "illustrative_configured_rate" : "unavailable",
      currency: completeUsdEstimates ? "USD" : null,
      rateProvenance: completeUsdEstimates ? provenances : [],
      actualBillUsd: null,
      actualBillStatus: "unknown",
    };
  });
  const knownRequests = rows
    .map((row) => row.usageTelemetry?.requests)
    .filter((value) => Number.isSafeInteger(value) && value >= 0);
  return {
    statusCounts,
    actualMeasuredSearches: actualRows.length,
    actualTokenTotals: tokenTotals,
    actualModelRequestTotals,
    knownModelRequests: {
      total: knownRequests.length ? knownRequests.reduce((sum, value) => sum + value, 0) : null,
      responsesWithKnownCount: knownRequests.length,
    },
    knownZeroNewWork: {
      deterministicSearches: statusCounts.deterministic_zero,
      answerCacheHits: statusCounts.cache_hit,
    },
    configuredEstimate: {
      amountUsd: completeUsdEstimates ? roundScenario(usdEstimateTotal) : null,
      measuredSearches: completeUsdEstimates ? actualRows.length : configuredEstimates.filter((cost) => cost?.status === "estimated").length,
      rateProvenance: provenances,
      actualBillUsd: null,
      actualBillStatus: "unknown",
    },
    scenarios,
  };
}

function baselineSummary(caseData) {
  const answer = caseData?.response?.answer;
  const sourceItems = caseData?.response?.searchResults?.items;
  return {
    status: caseData?.http?.status ?? null,
    elapsedMs: caseData?.http?.elapsedMs ?? null,
    responseBytesUtf8: caseData?.http?.responseBytesUtf8 ?? null,
    answerPartCount: Array.isArray(answer?.parts) ? answer.parts.length : null,
    sourceCount: Array.isArray(caseData?.response?.sources) ? caseData.response.sources.length : null,
    firstResultId: Array.isArray(sourceItems) ? sourceItems[0]?.id ?? null : null,
    usageTelemetry: normalizeUsageTelemetry(caseData?.response?.usage_telemetry),
  };
}

function compareCase(current, baselineCase) {
  if (!baselineCase) return null;
  const before = baselineSummary(baselineCase);
  return {
    before,
    changes: {
      elapsedMs: Number.isFinite(before.elapsedMs) && Number.isFinite(current.http.elapsedMs)
        ? current.http.elapsedMs - before.elapsedMs
        : null,
      responseBytesUtf8: Number.isFinite(before.responseBytesUtf8)
        && Number.isFinite(current.http.responseBytesUtf8)
        ? current.http.responseBytesUtf8 - before.responseBytesUtf8
        : null,
      answerPartCount: Number.isFinite(before.answerPartCount)
        && Array.isArray(current.answer?.parts)
        ? current.answer.parts.length - before.answerPartCount
        : null,
      firstResultIdChanged: before.firstResultId && current.resultPage.items[0]?.id
        ? before.firstResultId !== current.resultPage.items[0].id
        : null,
    },
  };
}

function chartComparison(rows) {
  const comparedIntents = new Set(["definition", "procedure", "quantitative"]);
  const compared = rows
    .map((row) => ({
      row,
      group: comparedIntents.has(row.intent.intent)
        ? row.intent.intent
        : row.presentation.chart !== null || row.presentation.table !== null ? "quantitative" : null,
    }))
    .filter((item) => item.group);
  const groups = {};
  for (const intent of comparedIntents) {
    groups[intent] = summarizeUsage(compared
      .filter((item) => item.group === intent)
      .map((item) => item.row));
  }
  return {
    purpose: "Compare numeric answers and validated chart or table payloads with definition and procedure answers. No chart is generated by this runner.",
    cases: compared.map(({ row, group }) => ({
      caseIndex: row.caseIndex,
      query: row.request.q,
      intent: row.intent.intent,
      intentSource: row.intentSource,
      comparisonGroup: group,
      hasChart: row.presentation.chart !== null,
      hasTable: row.presentation.table !== null,
      usageStatus: row.usageTelemetry?.status || "missing",
      modelRequests: row.usageTelemetry?.requests ?? null,
      actualTokens: row.usageTelemetry?.status === "actual" ? {
        input_tokens: row.usageTelemetry.input_tokens,
        cached_input_tokens: row.usageTelemetry.cached_input_tokens,
        reasoning_tokens: row.usageTelemetry.reasoning_tokens,
        output_tokens: row.usageTelemetry.output_tokens,
        total_tokens: row.usageTelemetry.total_tokens,
      } : null,
      costEstimate: row.usageTelemetry?.cost_estimate ?? null,
      citationGroupCount: row.citations.length,
      sourceCount: row.sources.length,
      answerCaptured: row.answer !== null,
    })),
    groupedUsage: groups,
  };
}

function validateCaseRequest(value) {
  if (!isObject(value) || typeof value.q !== "string" || !value.q.trim()
    || Buffer.byteLength(value.q, "utf8") > 2_000 || !isObject(value.filters)) {
    throw evaluationError("BASELINE_REQUEST_INVALID");
  }
  const filters = value.filters;
  const source = filters.source ?? "all";
  const category = filters.category ?? "";
  const year = filters.year ?? null;
  const sort = filters.sort ?? "relevance";
  const page = value.page ?? 1;
  const pageSize = value.page_size ?? 12;
  const windowId = value.window_id ?? undefined;
  if (!["all", "trusted", "official", "reviewed", "supplementary", "other"].includes(source)
    || typeof category !== "string" || Buffer.byteLength(category, "utf8") > 120
    || (year !== null && (!Number.isInteger(year) || year < 1990))
    || !["relevance", "newest"].includes(sort)
    || !Number.isInteger(page) || page < 1 || page > 500
    || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 50
    || (windowId !== undefined && (typeof windowId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/u.test(windowId)))) {
    throw evaluationError("BASELINE_REQUEST_INVALID");
  }
  const request = {
    q: value.q,
    filters: { source, category, year, sort },
    page,
    page_size: pageSize,
    ...(windowId ? { window_id: windowId } : {}),
  };
  if (Buffer.byteLength(JSON.stringify(request), "utf8") > MAX_REQUEST_BYTES) {
    throw evaluationError("BASELINE_REQUEST_INVALID");
  }
  return request;
}

async function loadBaseline(path) {
  const details = await stat(path);
  if (!details.isFile() || details.size > MAX_BASELINE_BYTES) throw evaluationError("BASELINE_FILE_INVALID");
  let source;
  try {
    source = await readFile(path, "utf8");
  } catch {
    throw evaluationError("BASELINE_FILE_INVALID");
  }
  if (Buffer.byteLength(source, "utf8") > MAX_BASELINE_BYTES) throw evaluationError("BASELINE_FILE_INVALID");
  let baseline;
  try {
    baseline = JSON.parse(source);
  } catch {
    throw evaluationError("BASELINE_FILE_INVALID");
  }
  if (!Array.isArray(baseline?.cases) || baseline.cases.length === 0 || baseline.cases.length > MAX_CASES) {
    throw evaluationError("BASELINE_CASES_INVALID");
  }
  const cases = baseline.cases.map((item) => validateCaseRequest(item?.request));
  return { baseline, cases };
}

let lastTopLevelRequestStartedAt = 0;
let httpRequestCount = 0;
let activeSearchJob = null;
let terminationPromise = null;

async function waitForNextTopLevelRequest(intervalMs) {
  const waitMs = Math.max(0, intervalMs - (Date.now() - lastTopLevelRequestStartedAt));
  if (waitMs) await new Promise((resolvePromise) => setTimeout(resolvePromise, waitMs));
  lastTopLevelRequestStartedAt = Date.now();
}

async function postJson(baseUrl, pathname, payload, timeoutMs = SEARCH_TRANSPORT_TIMEOUT_MS) {
  const bodyText = JSON.stringify(payload);
  if (Buffer.byteLength(bodyText, "utf8") > MAX_REQUEST_BYTES) throw evaluationError("REQUEST_BODY_TOO_LARGE");
  httpRequestCount += 1;
  const startedAt = Date.now();
  const { response, text, body } = await requestBoundedAuditJson(new URL(pathname, baseUrl), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": "Keskkonnaportaali-praktika-search-evaluation/1.0",
    },
    body: bodyText,
    credentials: "omit",
    signal: AbortSignal.timeout(Math.max(1, Math.floor(timeoutMs))),
  }, {
    label: "Search improvement evaluation response",
    maximumBytes: MAX_AUDIT_RESPONSE_BYTES,
  });
  return {
    status: response.status,
    elapsedMs: Date.now() - startedAt,
    responseBytesUtf8: Buffer.byteLength(text, "utf8"),
    responseHeaders: publicResponseHeaders(response.headers),
    body,
  };
}

async function getPublicHealth(baseUrl) {
  const startedAt = Date.now();
  httpRequestCount += 1;
  try {
    const { response, text, body } = await requestBoundedAuditJson(new URL("/api/health", baseUrl), {
      method: "GET",
      headers: {
        Accept: "application/json",
        "User-Agent": "Keskkonnaportaali-praktika-search-evaluation/1.0",
      },
      credentials: "omit",
      signal: AbortSignal.timeout(HEALTH_TIMEOUT_MS),
    }, {
      label: "Public health evaluation response",
      maximumBytes: MAX_AUDIT_RESPONSE_BYTES,
    });
    const publicBody = isObject(body) ? {
      status: boundedString(body.status, 32),
      service: boundedString(body.service, 160),
      revision: boundedString(body.revision, 100),
      timestamp: boundedString(body.timestamp, 80),
    } : null;
    return {
      httpStatus: response.status,
      elapsedMs: Date.now() - startedAt,
      responseBytesUtf8: Buffer.byteLength(text, "utf8"),
      body: publicBody,
      failure: response.status === 200 && publicBody?.revision
        ? null
        : { kind: "http_or_contract", status: response.status },
    };
  } catch (error) {
    return {
      httpStatus: null,
      elapsedMs: Date.now() - startedAt,
      responseBytesUtf8: null,
      body: null,
      failure: { kind: "request", ...safeFailure(error) },
    };
  }
}

function compareHealthRevisions(before, after) {
  const beforeRevision = before?.body?.revision ?? null;
  const afterRevision = after?.body?.revision ?? null;
  const isCommitRevision = (revision) => typeof revision === "string" && /^[a-f0-9]{40}$/iu.test(revision);
  const revisionsAvailable = before?.httpStatus === 200 && after?.httpStatus === 200
    && isCommitRevision(beforeRevision) && isCommitRevision(afterRevision);
  return {
    status: !revisionsAvailable ? "unknown" : beforeRevision === afterRevision ? "stable" : "changed",
    beforeRevision,
    afterRevision,
  };
}

async function runSingleSearch(baseUrl, request) {
  const startedAt = Date.now();
  try {
    const result = await postJson(baseUrl, "/api/search", request, SEARCH_TRANSPORT_TIMEOUT_MS);
    const failure = result.status === 200 && isObject(result.body) ? null : {
      kind: "http_or_contract",
      status: result.status,
      error: result.body ? null : "invalid_json",
    };
    return {
      body: result.body,
      transport: "single_post_api_search",
      http: {
        status: result.status,
        elapsedMs: Date.now() - startedAt,
        responseBytesUtf8: result.responseBytesUtf8,
        transportRequests: 1,
      },
      responseHeaders: result.responseHeaders,
      failure,
    };
  } catch (error) {
    return {
      body: null,
      transport: "single_post_api_search",
      http: { status: null, elapsedMs: Date.now() - startedAt, responseBytesUtf8: null, transportRequests: 1 },
      responseHeaders: null,
      failure: { kind: "request", ...safeFailure(error) },
    };
  }
}

function collectJobEvents(responseBody, accumulator) {
  let cursor = accumulator.cursor;
  for (const entry of Array.isArray(responseBody?.events) ? responseBody.events : []) {
    const sequence = nonNegativeInteger(entry?.seq);
    if (sequence !== null) cursor = Math.max(cursor, sequence);
    const event = entry?.event;
    if (!isObject(event)) continue;
    if (event.type === "results" && isObject(event.searchResults)) accumulator.searchResults = event.searchResults;
    if (event.type === "answer" && isObject(event.result)) accumulator.answer = event.result;
  }
  accumulator.cursor = cursor;
}

async function cancelSearchJob(baseUrl, jobId, jobKey) {
  try {
    const result = await postJson(baseUrl, "/api/search/jobs/cancel", {
      job_id: jobId,
      job_key: jobKey,
    }, JOB_CANCELLATION_TIMEOUT_MS);
    return { cancelled: result.status === 200, responseBytesUtf8: result.responseBytesUtf8 };
  } catch {
    return { cancelled: false, responseBytesUtf8: null };
  }
}

function cancelTrackedSearchJob(activeJob) {
  if (!activeJob.cancelPromise) {
    activeJob.cancelPromise = cancelSearchJob(activeJob.baseUrl, activeJob.jobId, activeJob.jobKey);
  }
  return activeJob.cancelPromise;
}

function handleTerminationSignal(signal) {
  if (terminationPromise) return;
  const exitCode = signal === "SIGINT" ? 130 : 143;
  process.exitCode = exitCode;
  terminationPromise = (async () => {
    if (activeSearchJob) await cancelTrackedSearchJob(activeSearchJob);
    process.exit(exitCode);
  })();
}

process.on("SIGINT", () => handleTerminationSignal("SIGINT"));
process.on("SIGTERM", () => handleTerminationSignal("SIGTERM"));

async function runJobSearch(baseUrl, request) {
  const startedAt = Date.now();
  const deadlineAt = startedAt + SEARCH_TRANSPORT_TIMEOUT_MS;
  const jobId = randomUUID();
  const jobKey = randomBytes(32).toString("base64url");
  const activeJob = { baseUrl, jobId, jobKey, cancelPromise: null };
  activeSearchJob = activeJob;
  const accumulator = { cursor: 0, searchResults: null, answer: null };
  let totalResponseBytes = 0;
  let responseBytesKnown = true;
  let transportRequests = 0;
  let latest = null;
  let jobCreated = false;
  let jobCreateAttempted = false;
  let cancelledAfterFailure = null;
  try {
    jobCreateAttempted = true;
    transportRequests += 1;
    try {
      latest = await postJson(baseUrl, "/api/search/jobs", {
        job_id: jobId,
        job_key: jobKey,
        kind: "search",
        request,
      }, Math.max(1, deadlineAt - Date.now()));
    } catch (error) {
      responseBytesKnown = false;
      throw error;
    }
    totalResponseBytes += latest.responseBytesUtf8;
    jobCreated = [200, 201].includes(latest.status);
    if (!jobCreated || !isObject(latest.body)) throw evaluationError("JOB_CREATE_FAILED");
    let state = latest.body.state;
    for (let poll = 0; state === "running" && poll < MAX_JOB_POLLS; poll += 1) {
      if (terminationPromise) throw evaluationError("JOB_INTERRUPTED");
      const remainingMs = deadlineAt - Date.now();
      if (remainingMs <= 0) throw evaluationError("JOB_TIMEOUT");
      const retryAfterMs = nonNegativeInteger(latest.body.retry_after_ms) ?? 1_000;
      const delayMs = Math.max(MINIMUM_JOB_POLL_DELAY_MS, Math.min(MAX_JOB_POLL_DELAY_MS, retryAfterMs));
      await new Promise((resolvePromise) => setTimeout(resolvePromise, Math.min(delayMs, remainingMs)));
      if (terminationPromise) throw evaluationError("JOB_INTERRUPTED");
      const remainingAfterDelayMs = deadlineAt - Date.now();
      if (remainingAfterDelayMs <= 0) throw evaluationError("JOB_TIMEOUT");
      transportRequests += 1;
      try {
        latest = await postJson(baseUrl, "/api/search/jobs/poll", {
          job_id: jobId,
          job_key: jobKey,
          after: accumulator.cursor,
        }, remainingAfterDelayMs);
      } catch (error) {
        responseBytesKnown = false;
        throw error;
      }
      totalResponseBytes += latest.responseBytesUtf8;
      if (latest.status !== 200 || !isObject(latest.body)) throw evaluationError("JOB_POLL_FAILED");
      collectJobEvents(latest.body, accumulator);
      state = latest.body.state;
    }
    if (state === "running") throw evaluationError("JOB_POLL_LIMIT");
    if (state !== "complete" || !accumulator.answer) throw evaluationError("JOB_NO_FINAL_ANSWER");
    const body = accumulator.answer;
    if (!body.searchResults && accumulator.searchResults) body.searchResults = accumulator.searchResults;
    return {
      body,
      transport: "async_search_job",
      http: {
        status: latest.status,
        elapsedMs: Date.now() - startedAt,
        responseBytesUtf8: totalResponseBytes,
        transportRequests,
      },
      responseHeaders: latest.responseHeaders,
      failure: null,
    };
  } catch (error) {
    if (jobCreated || (jobCreateAttempted && latest === null)) {
      transportRequests += 1;
      const cancellation = await cancelTrackedSearchJob(activeJob);
      cancelledAfterFailure = cancellation.cancelled;
      if (cancellation.responseBytesUtf8 === null) responseBytesKnown = false;
      else totalResponseBytes += cancellation.responseBytesUtf8;
    }
    return {
      body: null,
      transport: "async_search_job",
      http: {
        status: latest?.status ?? null,
        elapsedMs: Date.now() - startedAt,
        responseBytesUtf8: responseBytesKnown ? totalResponseBytes : null,
        transportRequests,
      },
      responseHeaders: latest?.responseHeaders ?? null,
      failure: {
        kind: "job",
        ...safeFailure(error),
        cancelledAfterFailure,
      },
    };
  }
  finally {
    if (activeSearchJob === activeJob) activeSearchJob = null;
  }
}

function paginationItems(body) {
  return Array.isArray(body?.searchResults?.items)
    ? body.searchResults.items
    : Array.isArray(body?.items) ? body.items : [];
}

function paginationPage(body, requestedPage) {
  const metadata = isObject(body?.searchResults) ? body.searchResults : body;
  return {
    page: nonNegativeInteger(metadata?.page) ?? requestedPage,
    pageSize: nonNegativeInteger(metadata?.pageSize) ?? nonNegativeInteger(metadata?.page_size),
    total: nonNegativeInteger(metadata?.total),
    totalRelation: boundedString(metadata?.totalRelation, 12),
    truncated: typeof metadata?.truncated === "boolean" ? metadata.truncated : null,
    windowId: boundedString(metadata?.windowId, 128),
    queryRevision: boundedString(metadata?.queryRevision, 128),
    appliedFilters: projectAppliedFilters(metadata?.appliedFilters),
    hasMore: typeof metadata?.hasMore === "boolean" ? metadata.hasMore : null,
    windowExpired: metadata?.windowExpired === true,
    items: paginationItems(body).slice(0, 50).map(projectCitationSource).filter(Boolean),
  };
}

async function runSecondPage(baseUrl, pageRequest) {
  const startedAt = Date.now();
  let requestAttempted = false;
  try {
    requestAttempted = true;
    const response = await postJson(baseUrl, "/api/search/results", pageRequest);
    const resultPage = paginationPage(response.body, pageRequest.page);
    const failure = response.status !== 200 || !isObject(response.body)
      ? { kind: "http_or_contract", status: response.status }
      : resultPage.windowExpired ? { kind: "window_expired" } : null;
    return {
      request: pageRequest,
      transport: "post_api_search_results",
      http: {
        status: response.status,
        elapsedMs: response.elapsedMs,
        responseBytesUtf8: response.responseBytesUtf8,
        transportRequests: 1,
      },
      responseHeaders: response.responseHeaders,
      resultPage,
      failure,
    };
  } catch (error) {
    return {
      request: pageRequest,
      transport: "post_api_search_results",
      http: {
        status: null,
        elapsedMs: Date.now() - startedAt,
        responseBytesUtf8: null,
        transportRequests: requestAttempted ? 1 : 0,
      },
      responseHeaders: null,
      resultPage: paginationPage(null, pageRequest.page),
      failure: { kind: "request", ...safeFailure(error) },
    };
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const baseUrl = searchOrigin(options["base-url"]);
  const baselinePath = resolve(options.baseline || DEFAULT_BASELINE);
  const outputPath = resolve(options.output);
  if (baselinePath === outputPath) throw evaluationError("OUTPUT_OVERWRITES_BASELINE");
  const { baseline, cases } = await loadBaseline(baselinePath);
  const declaredCaseCount = nonNegativeInteger(baseline.measurement?.questionCount);
  let minimumIntervalMs;
  if (options["interval-ms"] === undefined) {
    minimumIntervalMs = Math.min(10_000, Math.max(0, nonNegativeInteger(baseline.measurement?.minimumIntervalMs) ?? 3_200));
  } else {
    const requestedInterval = Number(options["interval-ms"]);
    if (!Number.isFinite(requestedInterval)) throw evaluationError("INVALID_INTERVAL");
    minimumIntervalMs = Math.min(10_000, Math.max(0, requestedInterval));
  }
  const baselineByIndex = baseline.cases;
  const paginationBaseline = isObject(baseline.pagination) ? baseline.pagination : {};
  const comparisonQuery = typeof paginationBaseline.comparisonCase === "string"
    ? paginationBaseline.comparisonCase
    : cases[0].q;
  let pageCaseIndex = cases.findIndex((item) => item.q === comparisonQuery);
  if (pageCaseIndex < 0) pageCaseIndex = 0;
  const baselinePageRequest = validateCaseRequest({
    ...(paginationBaseline.secondPage?.request || cases[pageCaseIndex]),
    page: 2,
  });
  let secondPage = null;
  const healthBefore = await getPublicHealth(baseUrl);
  const measuredAt = new Date().toISOString();
  const results = [];
  let failedCases = 0;

  for (const [index, request] of cases.entries()) {
    if (terminationPromise) return;
    await waitForNextTopLevelRequest(minimumIntervalMs);
    if (terminationPromise) return;
    let outcome;
    try {
      outcome = options.async
        ? await runJobSearch(baseUrl, request)
        : await runSingleSearch(baseUrl, request);
    } catch (error) {
      outcome = {
        body: null,
        transport: options.async ? "async_search_job" : "single_post_api_search",
        http: { status: null, elapsedMs: null, responseBytesUtf8: null, transportRequests: 0 },
        responseHeaders: null,
        failure: { kind: "request", ...safeFailure(error), cancelledAfterFailure: null },
      };
    }
    const row = projectSearchCase(index, request, outcome);
    row.baselineComparison = compareCase(row, baselineByIndex[index]);
    if (row.failure || row.http.status !== 200 || !row.answer) failedCases += 1;
    results.push(row);
    if (terminationPromise) return;
    if (index === pageCaseIndex) {
      const pageRequest = validateCaseRequest({
        ...baselinePageRequest,
        ...(row.resultPage.windowId ? { window_id: row.resultPage.windowId } : {}),
      });
      secondPage = await runSecondPage(baseUrl, pageRequest);
    }
  }

  const healthAfter = await getPublicHealth(baseUrl);
  const revisionStability = compareHealthRevisions(healthBefore, healthAfter);

  const usageSummary = summarizeUsage(results);
  const baselineMeasurement = baseline.measurement || {};
  const report = {
    schemaVersion: 1,
    measurement: {
      target: baseUrl.origin,
      startedAt: measuredAt,
      completedAt: new Date().toISOString(),
      baselinePath: relative(PROJECT_ROOT, baselinePath),
      baselineRevision: boundedString(baselineMeasurement.healthBefore?.body?.revision, 100),
      healthBefore,
      healthAfter,
      revisionStability,
      healthTimeoutMs: HEALTH_TIMEOUT_MS,
      cancellationTimeoutMs: JOB_CANCELLATION_TIMEOUT_MS,
      baselineDeclaredCaseCount: declaredCaseCount,
      baselineObservedCaseCount: cases.length,
      baselineSearchRequestCount: nonNegativeInteger(baselineMeasurement.searchRequestCount),
      caseCount: cases.length,
      concurrency: 1,
      minimumIntervalMs,
      maxResponseBytes: MAX_AUDIT_RESPONSE_BYTES,
      requestTimeoutMs: SEARCH_TRANSPORT_TIMEOUT_MS,
      retries: 0,
      credentials: "omitted",
      transport: options.async ? "async_search_job" : "single_post_api_search",
      httpRequestCount,
    },
    baselineWarnings: declaredCaseCount !== null && declaredCaseCount !== cases.length
      ? ["measurement.questionCount differs from cases.length; all cases were evaluated"]
      : [],
    cases: results,
    pagination: {
      comparisonCase: comparisonQuery,
      firstPage: {
        caseIndex: pageCaseIndex + 1,
        transport: results[pageCaseIndex].transport,
        http: {
          status: results[pageCaseIndex].http.status,
          elapsedMs: results[pageCaseIndex].http.elapsedMs,
          responseBytesUtf8: results[pageCaseIndex].http.responseBytesUtf8,
        },
        resultPage: results[pageCaseIndex].resultPage,
      },
      secondPage,
    },
    usageSummary,
    graphicComparison: chartComparison(results),
    failures: [
      ...results.flatMap((row) => row.failure || row.http.status !== 200 || !row.answer
        ? [{ caseIndex: row.caseIndex, status: row.http.status, failure: row.failure }]
        : []),
      ...(secondPage.failure ? [{ paginationPage: 2, failure: secondPage.failure }] : []),
      ...(revisionStability.status !== "stable" ? [{
        kind: "health_revision_stability",
        ...revisionStability,
      }] : []),
    ],
  };

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  const hasFailures = failedCases > 0 || Boolean(secondPage.failure) || revisionStability.status !== "stable";
  process.stdout.write(`${JSON.stringify({
    output: relative(PROJECT_ROOT, outputPath),
    intentSource: "local_evaluator",
    cases: cases.length,
    failedCases: failedCases + (secondPage.failure ? 1 : 0),
    usageStatuses: usageSummary.statusCounts,
    revisionStability: revisionStability.status,
  })}\n`);
  if (hasFailures) process.exitCode = 1;
}

main().catch((error) => {
  const code = typeof error?.code === "string" && /^[A-Za-z0-9_-]{1,80}$/u.test(error.code)
    ? error.code
    : "EVALUATION_FAILED";
  process.stderr.write(`Search evaluation failed (${code}).\n`);
  process.exitCode = 2;
});
