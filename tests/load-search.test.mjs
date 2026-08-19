import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

test("loopback capacity audits include URL-normalized IPv6 localhost", async () => {
  const source = await readFile(path.join(projectRoot, "scripts/load-search.mjs"), "utf8");
  assert.match(source, /\["localhost", "127\.0\.0\.1", "\[::1\]"\]/u);
});

function runLoadAudit(baseUrl, options = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [
      "scripts/load-search.mjs",
      `--base-url=${baseUrl}`,
      "--endpoint=results",
      "--server-concurrency=8",
      "--availability-tail-ms=0",
      ...options,
    ], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.once("error", reject);
    child.once("close", (code) => resolve({ code, stdout, stderr }));
  });
}

async function withAuditServer(successfulBurstResponses, execute, { failRootAfterRateLimitProbe = false } = {}) {
  let resultRequests = 0;
  let rootRequests = 0;
  let healthRequests = 0;
  const server = createServer((request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (request.method === "GET" && url.pathname === "/") {
      rootRequests += 1;
      if (failRootAfterRateLimitProbe && resultRequests > 20) {
        response.statusCode = 503;
        response.setHeader("content-type", "text/plain; charset=utf-8");
        response.end("no available server");
        return;
      }
      response.setHeader("content-type", "text/html; charset=utf-8");
      response.end("<!doctype html><title>ready</title>");
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/health") {
      healthRequests += 1;
      response.setHeader("content-type", "application/json");
      response.end('{"status":"ok"}');
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/search/results") {
      resultRequests += 1;
      if (resultRequests <= successfulBurstResponses) {
        response.setHeader("content-type", "application/json");
        response.end('{"items":[]}');
        return;
      }
      response.setHeader("content-type", "application/json");
      response.setHeader("retry-after", resultRequests <= 20 ? "2" : "60");
      response.statusCode = 429;
      response.end('{"retryable":true}');
      return;
    }
    response.statusCode = 404;
    response.end();
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  try {
    const outcome = await execute(`http://127.0.0.1:${address.port}`);
    return { outcome, resultRequests, rootRequests, healthRequests };
  } finally {
    server.close();
    await once(server, "close");
  }
}

test("results load audit keeps an exact origin capacity check and availability probes", async () => {
  const { outcome: audit, resultRequests, rootRequests, healthRequests } = await withAuditServer(8, (baseUrl) => runLoadAudit(baseUrl));
  assert.equal(audit.code, 0, audit.stderr);
  const report = JSON.parse(audit.stdout);
  assert.equal(report.strictCapacity, true);
  assert.equal(report.capacityBackpressureCount, 12);
  assert.equal(report.expectedCapacityBackpressureCount, 12);
  assert.deepEqual(report.postBurstRateLimit, {
    status: 429,
    responseClass: "rate_limited",
    retryAfter: "60",
    contentType: "application/json",
    bodyCategory: "json",
  });
  assert.equal(report.availability.root.failures.length, 0);
  assert.equal(report.availability.health.failures.length, 0);
  assert.ok(report.availability.root.probeCount >= 1);
  assert.ok(report.availability.health.probeCount >= 1);
  assert.equal(resultRequests, 21);
  assert.ok(rootRequests >= 1);
  assert.ok(healthRequests >= 1);
});

test("public results audit treats a staggered valid capacity distribution as informational", async () => {
  const { outcome } = await withAuditServer(14, (baseUrl) => runLoadAudit(baseUrl, ["--strict-capacity=false"]));
  assert.equal(outcome.code, 0, outcome.stderr);
  const report = JSON.parse(outcome.stdout);
  assert.equal(report.strictCapacity, false);
  assert.equal(report.expectedCapacityBackpressureCount, 12);
  assert.equal(report.capacityBackpressureCount, 6);
  assert.deepEqual(report.statusCounts, { "200": 14, "429": 6 });
  assert.equal(report.postBurstRateLimit.status, 429);
  assert.equal(report.postBurstRateLimit.retryAfter, "60");
});

test("availability tail catches a post-burst root failure without exposing its body", async () => {
  const { outcome } = await withAuditServer(
    8,
    (baseUrl) => runLoadAudit(baseUrl, ["--availability-tail-ms=350"]),
    { failRootAfterRateLimitProbe: true },
  );
  assert.equal(outcome.code, 1);
  const report = JSON.parse(outcome.stdout);
  assert.ok(report.availability.root.failures.some((failure) => (
    failure.status === 503
    && failure.contentType === "text/plain; charset=utf-8"
    && failure.bodyCategory === "text"
    && !Object.hasOwn(failure, "body")
  )));
});
