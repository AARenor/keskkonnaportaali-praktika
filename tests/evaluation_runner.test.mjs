import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { analyzeQueryIntent } from "../server/query_intent.mjs";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const RUNNER_PATH = fileURLToPath(new URL("../scripts/evaluate_search_improvements.mjs", import.meta.url));
const FILTERS = { source: "all", category: "", year: null, sort: "relevance" };
const REVISION_A = "a".repeat(40);
const REVISION_B = "b".repeat(40);

function sendJson(response, status, value) {
  response.writeHead(status, {
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(value));
}

async function readJson(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
}

function fixtureSource(id = "fixture-source") {
  return {
    id,
    citation: 1,
    title: "Test source",
    organization: "Test organization",
    type: "Test source",
    url: "https://example.test/source",
  };
}

function listing(page = 1, windowId = null) {
  return {
    page,
    pageSize: 12,
    total: 2,
    totalRelation: "exact",
    truncated: false,
    hasMore: page === 1,
    ...(windowId ? { windowId } : {}),
    items: [fixtureSource(`fixture-page-${page}`)],
  };
}

function answerResponse(usageTelemetry, pageWindowId = "window-default") {
  const source = fixtureSource();
  return {
    answer: {
      intro: "Fixture answer",
      introCitations: [1],
      parts: [],
    },
    sources: [source],
    searchResults: listing(1, pageWindowId),
    usage_telemetry: usageTelemetry,
  };
}

function baselineFor(queries) {
  const cases = queries.map((q) => ({
    request: { q, filters: FILTERS, page: 1, page_size: 12 },
    http: { status: 200, elapsedMs: 10, responseBytesUtf8: 100 },
    response: {
      answer: { intro: "Earlier answer", parts: [] },
      sources: [fixtureSource("baseline-source")],
      searchResults: { items: [fixtureSource("baseline-result")] },
    },
  }));
  return {
    measurement: {
      questionCount: cases.length,
      minimumIntervalMs: 0,
      searchRequestCount: cases.length + 1,
      healthBefore: { body: { revision: REVISION_A } },
    },
    cases,
    pagination: {
      comparisonCase: queries[0],
      secondPage: {
        request: { ...cases[0].request, page: 2 },
      },
    },
  };
}

async function makeFixture(t, handleRequest) {
  const directory = await mkdtemp(join(tmpdir(), "evaluation_runner_"));
  const runners = [];
  const server = createServer((request, response) => {
    void (async () => {
      const body = request.method === "POST" ? await readJson(request) : null;
      await handleRequest({ request, response, body });
    })().catch(() => {
      if (!response.destroyed && !response.headersSent) sendJson(response, 500, { error: "Fixture error" });
    });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  const fixture = {
    directory,
    baseUrl: `http://127.0.0.1:${address.port}`,
    server,
    runners,
  };
  t.after(async () => {
    for (const runner of runners) await stopRunner(runner);
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeAllConnections?.();
    });
    await rm(directory, { recursive: true, force: true });
  });
  return fixture;
}

function watchRunner(child) {
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const closed = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", (code, signal) => resolve({ code, signal }));
  });
  return { child, closed, get stdout() { return stdout; }, get stderr() { return stderr; } };
}

async function waitForClose(runner, timeoutMs = 10_000) {
  let timer;
  try {
    return await Promise.race([
      runner.closed,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Evaluator child did not exit in time. Stderr: ${runner.stderr || "(empty)"}`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
async function waitForPromise(promise, timeoutMs, message, diagnostic = () => "") {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          const details = diagnostic();
          reject(new Error(details ? `${message}\n${details}` : message));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function stopRunner(runner) {
  if (!runner || runner.child.exitCode !== null || runner.child.signalCode !== null) return;
  runner.child.kill("SIGTERM");
  try {
    await waitForClose(runner, 7_000);
  } catch {
    runner.child.kill("SIGKILL");
    await runner.closed;
  }
}

async function launchRunner(fixture, queries, { async = false, name = "result" } = {}) {
  const baselinePath = join(fixture.directory, `${name}_baseline.json`);
  const outputPath = join(fixture.directory, `${name}_output.json`);
  await writeFile(baselinePath, `${JSON.stringify(baselineFor(queries))}\n`, { mode: 0o600 });
  const args = [
    RUNNER_PATH,
    `--base-url=${fixture.baseUrl}`,
    `--output=${outputPath}`,
    `--baseline=${baselinePath}`,
    "--interval-ms=0",
    ...(async ? ["--async"] : []),
  ];
  const runner = watchRunner(spawn(process.execPath, args, {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: process.env.PATH || "",
      HOME: fixture.directory,
      TMPDIR: fixture.directory,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }));
  fixture.runners.push(runner);
  return { runner, outputPath };
}

async function readReport(runner, outputPath) {
  try {
    return JSON.parse(await readFile(outputPath, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const exit = runner.child.exitCode === null
      ? "still running"
      : `exit ${runner.child.exitCode}, signal ${runner.child.signalCode}`;
    throw new Error(`Evaluator report missing, ${exit}. Stderr: ${runner.stderr || "(empty)"}`, { cause: error });
  }
}

function actualUsage(requests, inputTokens, amount) {
  return {
    status: "actual",
    requests,
    input_tokens: inputTokens,
    cached_input_tokens: 0,
    reasoning_tokens: 4,
    output_tokens: 20,
    total_tokens: inputTokens + 20,
    cost_estimate: {
      amount,
      currency: "USD",
      rate_provenance: "fixture rate card",
      status: "estimated",
    },
  };
}

function deterministicZeroUsage() {
  return {
    status: "deterministic_zero",
    requests: 0,
    input_tokens: 0,
    cached_input_tokens: 0,
    reasoning_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_estimate: { amount: 0, currency: null, rate_provenance: null, status: "zero_new_work" },
  };
}

function unknownUsage() {
  return {
    status: "unknown",
    requests: 1,
    input_tokens: null,
    cached_input_tokens: null,
    reasoning_tokens: null,
    output_tokens: null,
    total_tokens: null,
    cost_estimate: { amount: null, currency: null, rate_provenance: null, status: "unavailable" },
  };
}

test("CLI distinguishes unknown usage from zero and reports measured means and failed page two metrics", { timeout: 15_000 }, async (t) => {
  const queries = ["kuidas esitada raieteatist", "actual four", "unknown usage", "deterministic zero"];
  const events = [];
  const pageTwoRequests = [];
  let healthCount = 0;
  const fixture = await makeFixture(t, async ({ request, response, body }) => {
    if (request.url === "/api/health") {
      events.push("health");
      healthCount += 1;
      return sendJson(response, 200, {
        status: "ok",
        service: "fixture",
        revision: REVISION_A,
        timestamp: new Date().toISOString(),
      });
    }
    if (request.url === "/api/search") {
      events.push(`search:${body.q}`);
      const usage = body.q === queries[0]
        ? actualUsage(2, 100, 0.0002)
        : body.q === "actual four"
          ? actualUsage(4, 200, 0.0004)
          : body.q === "deterministic zero" ? deterministicZeroUsage() : unknownUsage();
      return sendJson(response, 200, answerResponse(usage, "window-first"));
    }
    if (request.url === "/api/search/results") {
      events.push("page-two");
      pageTwoRequests.push(body);
      setTimeout(() => response.destroy(), 60);
      return;
    }
    sendJson(response, 404, { error: "Not found" });
  });

  const { runner, outputPath } = await launchRunner(fixture, queries);
  const childResult = await waitForClose(runner);
  const report = await readReport(runner, outputPath);

  const intentRow = report.cases.find((row) => row.request.q === queries[0]);
  assert.deepEqual(intentRow.intent, analyzeQueryIntent(queries[0]));
  assert.equal(intentRow.intentSource, "local_evaluator");
  assert.equal(report.graphicComparison.cases[0].intentSource, "local_evaluator");
  assert.equal(JSON.parse(runner.stdout).intentSource, "local_evaluator");
  assert.equal(childResult.code, 1);
  assert.equal(report.measurement.healthBefore.body.revision, REVISION_A);
  assert.equal(report.measurement.healthAfter.body.revision, REVISION_A);
  assert.equal(report.measurement.revisionStability.status, "stable");
  assert.equal(healthCount, 2);
  assert.equal(report.measurement.httpRequestCount, 7);
  assert.equal(report.usageSummary.statusCounts.actual, 2);
  assert.equal(report.usageSummary.statusCounts.unknown, 1);
  assert.equal(report.usageSummary.statusCounts.deterministic_zero, 1);
  const unknown = report.cases.find((row) => row.request.q === "unknown usage");
  const zero = report.cases.find((row) => row.request.q === "deterministic zero");
  assert.equal(unknown.usageTelemetry.status, "unknown");
  assert.equal(unknown.usageTelemetry.input_tokens, null);
  assert.equal(zero.usageTelemetry.status, "deterministic_zero");
  assert.equal(zero.usageTelemetry.input_tokens, 0);
  assert.equal(report.usageSummary.knownZeroNewWork.deterministicSearches, 1);
  assert.deepEqual(report.usageSummary.scenarios.map((scenario) => [
    scenario.searchCount,
    scenario.modelRequestsPerSearch,
    scenario.totalModelRequests,
  ]), [[1, 3, 3], [10, 3, 30], [100, 3, 300]]);
  assert.equal(report.pagination.secondPage.http.transportRequests, 1);
  assert.ok(report.pagination.secondPage.http.elapsedMs >= 40);
  assert.equal(report.pagination.secondPage.failure.kind, "request");
  assert.equal(pageTwoRequests[0].window_id, "window-first");
  assert.deepEqual(events.slice(0, 4), ["health", `search:${queries[0]}`, "page-two", "search:actual four"]);
});

test("CLI records runtime revision drift and window expiration without accepting an empty page", { timeout: 15_000 }, async (t) => {
  const events = [];
  const pageTwoRequests = [];
  const revisions = [REVISION_A, REVISION_B, "development", "development"];
  let healthCount = 0;
  let searchCount = 0;
  let pageTwoCount = 0;
  const fixture = await makeFixture(t, async ({ request, response, body }) => {
    if (request.url === "/api/health") {
      events.push("health");
      const revision = revisions[healthCount] || "development";
      healthCount += 1;
      return sendJson(response, 200, {
        status: "ok",
        service: "fixture",
        revision,
        timestamp: new Date().toISOString(),
      });
    }
    if (request.url === "/api/search") {
      events.push("search");
      searchCount += 1;
      const windowId = searchCount === 1 ? `window-${searchCount}` : null;
      return sendJson(response, 200, answerResponse(unknownUsage(), windowId));
    }
    if (request.url === "/api/search/results") {
      events.push("page-two");
      pageTwoCount += 1;
      pageTwoRequests.push(body);
      return sendJson(response, 200, pageTwoCount === 1
        ? {
          page: 2,
          pageSize: 12,
          total: 2,
          windowExpired: true,
          queryRevision: "expired-window-revision",
          appliedFilters: FILTERS,
          items: [],
        }
        : {
          ...listing(2),
          queryRevision: "current-window-revision",
          appliedFilters: {
            ...FILTERS,
            source: "official",
            category: "c".repeat(150),
            sort: "newest",
            accessToken: "fixture-only",
          },
        });
    }
    sendJson(response, 404, { error: "Not found" });
  });

  const first = await launchRunner(fixture, ["revision drift"], { name: "drift" });
  const firstExit = await waitForClose(first.runner);
  const driftReport = await readReport(first.runner, first.outputPath);
  const second = await launchRunner(fixture, ["unknown runtime revision"], { name: "unknown_revision" });
  const secondExit = await waitForClose(second.runner);
  const unknownRevisionReport = await readReport(second.runner, second.outputPath);

  assert.equal(firstExit.code, 1);
  assert.equal(driftReport.measurement.revisionStability.status, "changed");
  assert.deepEqual([
    driftReport.measurement.revisionStability.beforeRevision,
    driftReport.measurement.revisionStability.afterRevision,
  ], [REVISION_A, REVISION_B]);
  assert.equal(driftReport.pagination.secondPage.http.status, 200);
  assert.equal(driftReport.pagination.secondPage.resultPage.windowExpired, true);
  assert.equal(driftReport.pagination.secondPage.resultPage.items.length, 0);
  assert.equal(driftReport.pagination.secondPage.failure.kind, "window_expired");
  assert.equal(driftReport.pagination.secondPage.resultPage.queryRevision, "expired-window-revision");
  assert.deepEqual(driftReport.pagination.secondPage.resultPage.appliedFilters, FILTERS);
  assert.equal(unknownRevisionReport.pagination.secondPage.resultPage.queryRevision, "current-window-revision");
  assert.deepEqual(unknownRevisionReport.pagination.secondPage.resultPage.appliedFilters, {
    source: "official",
    category: "c".repeat(120),
    year: null,
    sort: "newest",
  });
  assert.equal(
    Object.hasOwn(unknownRevisionReport.pagination.secondPage.resultPage.appliedFilters, "accessToken"),
    false,
  );
  assert.equal(secondExit.code, 1);
  assert.equal(unknownRevisionReport.measurement.revisionStability.status, "unknown");
  assert.equal(unknownRevisionReport.measurement.healthBefore.body.revision, "development");
  assert.equal(unknownRevisionReport.measurement.healthAfter.body.revision, "development");
  assert.equal(unknownRevisionReport.pagination.secondPage.failure, null);
  assert.equal(pageTwoRequests[0].window_id, "window-1");
  assert.equal(Object.hasOwn(pageTwoRequests[1], "window_id"), false);
  assert.deepEqual(events.slice(0, 4), ["health", "search", "page-two", "health"]);
  assert.deepEqual(events.slice(4), ["health", "search", "page-two", "health"]);
});

test("SIGTERM cancels the active async job and prevents a later case from being admitted", { timeout: 12_000 }, async (t) => {
  const queries = ["signal first", "signal second"];
  const events = [];
  let resolvePollSeen;
  const pollSeen = new Promise((resolve) => { resolvePollSeen = resolve; });
  let jobCreates = 0;
  let pollRequests = 0;
  let cancelRequests = 0;
  let createdJobId = null;
  let cancelledJobId = null;
  const fixture = await makeFixture(t, async ({ request, response, body }) => {
    if (request.url === "/api/health") {
      events.push("health");
      return sendJson(response, 200, {
        status: "ok",
        service: "fixture",
        revision: REVISION_A,
        timestamp: new Date().toISOString(),
      });
    }
    if (request.url === "/api/search/jobs") {
      events.push("create");
      jobCreates += 1;
      createdJobId = body.job_id;
      return sendJson(response, 201, { state: "running", retry_after_ms: 100, events: [] });
    }
    if (request.url === "/api/search/jobs/poll") {
      events.push("poll");
      pollRequests += 1;
      resolvePollSeen();
      setTimeout(() => sendJson(response, 200, {
        state: "running",
        retry_after_ms: 100,
        events: [],
      }), 100);
      return;
    }
    if (request.url === "/api/search/jobs/cancel") {
      events.push("cancel");
      cancelRequests += 1;
      cancelledJobId = body.job_id;
      setTimeout(() => sendJson(response, 200, { state: "cancelled" }), 300);
      return;
    }
    if (request.url === "/api/search/results") {
      events.push("page-two");
      return sendJson(response, 200, listing(2, "signal-window"));
    }
    sendJson(response, 404, { error: "Not found" });
  });

  const { runner } = await launchRunner(fixture, queries, { async: true, name: "signal" });
  await waitForPromise(pollSeen, 5_000, "Async job did not reach polling", () => `Evaluator stderr: ${runner.stderr || "(empty)"}`);
  runner.child.kill("SIGTERM");
  const childResult = await waitForClose(runner, 5_000);

  assert.equal(childResult.code, 143);
  assert.equal(childResult.signal, null);
  assert.equal(cancelRequests, 1);
  assert.equal(cancelledJobId, createdJobId);
  assert.equal(jobCreates, 1);
  assert.equal(pollRequests, 1);
  assert.deepEqual(events.slice(0, 4), ["health", "create", "poll", "cancel"]);
});
