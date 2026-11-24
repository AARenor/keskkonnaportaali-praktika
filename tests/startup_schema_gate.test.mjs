import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));

// The real entrypoint runs in a child process with no database. The storage
// fixture supplies the schema gate and inert exports needed by module linking;
// the listener wrapper records bind attempts and keeps the socket on loopback.
const STARTUP_GUARD_SOURCE = [
  'import { registerHooks } from "node:module";',
  'import net from "node:net";',
  "",
  'const stubSource = `',
  'export const OFFICIAL_DISCOVERY_RETENTION_HOURS = 168;',
  'export const APPROVED_PAGE_EVIDENCE_MAX_AGE_DAYS = 7;',
  'export const APPROVED_PAGE_EVIDENCE_MAX_AGE_MS = 604800000;',
  'export const APPROVED_PAGE_REFRESH_DAYS = 6;',
  'export const REVIEWED_CATALOGUE_MAX_AGE_MS = 31622400000;',
  'export const REVIEWED_CATALOGUE_SOURCE_KEY = "reviewed-catalogue-source";',
  'export const CORPUS_VECTOR_LAYOUT = "index-layout-v2";',
  'export const CORPUS_CAPACITY_VERSION = 1;',
  'export const CORPUS_MAX_BYTES = 1000000;',
  'export const OFFICIAL_DISCOVERY_RETIRE_SQL = "";',
  'export const OFFICIAL_DISCOVERY_DELETE_SQL = "";',
  'export const PORTAL_UNAVAILABLE_DELETE_SQL = "";',
  'export const CORPUS_OVERFLOW_DELETE_SQL = "";',
  'export const corpusPolicyWitnessSql = () => "false";',
  'export const corpusIndexPolicySql = () => "";',
  'export const startCorpusIndexBackfill = () => null;',
  'export const readCorpusCapacity = async () => ({ totalBytes: 0 });',
  'export const withCorpusCapacityTransaction = async () => { throw new Error("unexpected corpus transaction"); };',
  'export const ensureCorpusCapacity = async () => ({ totalBytes: 0 });',
  'export const enforceCorpusRetention = async () => ({ deleted: 0 });',
  'export const upsertDocuments = async () => { throw new Error("unexpected corpus write"); };',
  'export const backfillCorpusSourceIdentity = async () => { throw new Error("unexpected corpus backfill"); };',
  'export const backfillCorpusIndexVectors = async () => { throw new Error("unexpected corpus backfill"); };',
  'export const limitCorpusDocumentsByAggregateCapacity = () => { throw new Error("unexpected corpus admission"); };',
  'export const planCorpusDocumentAdmission = () => { throw new Error("unexpected corpus admission"); };',
  'export function throwIfCorpusAborted(signal) { if (signal?.aborted) throw signal.reason; }',
  'export async function ensureCorpusSchema() {',
  '  console.log("schema-started");',
  '  const delay = Number(process.env.STARTUP_SCHEMA_DELAY_MS || 0);',
  '  if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));',
  '  if (process.env.STARTUP_SCHEMA_MODE === "fail") {',
  '    throw new Error("synthetic corpus capacity migration failure");',
  '  }',
  '  console.log("schema-finished");',
  '  return true;',
  '}`;',
  'const stubUrl = `data:text/javascript,${encodeURIComponent(stubSource)}`;',
  "",
  "registerHooks({",
  "  resolve(specifier, context, nextResolve) {",
  '    if (specifier === "./corpus_storage.mjs" && String(context.parentURL || "").includes("/server/")) {',
  "      return { url: stubUrl, shortCircuit: true };",
  "    }",
  "    return nextResolve(specifier, context);",
  "  },",
  "});",
  "",
  'process.on("unhandledRejection", () => console.log("unhandled-rejection"));',
  "",
  "const realListen = net.Server.prototype.listen;",
  "net.Server.prototype.listen = function guardedListen(...args) {",
  '  console.log("listen-called");',
  '  const hostIndex = args.indexOf("0.0.0.0");',
  '  if (hostIndex >= 0) args[hostIndex] = "127.0.0.1";',
  "  return realListen.apply(this, args);",
  "};",
  "",
  'globalThis.fetch = async () => { throw new Error("STARTUP_TEST_NETWORK_DISABLED"); };',
].join("\n");

function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function waitForOutput(child, output, pattern, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(timer);
      reject(new Error(`server output did not match ${pattern}: ${output().slice(-1_000)}`));
    }, timeoutMs);
    const timer = setInterval(() => {
      if (pattern.test(output())) {
        clearInterval(timer);
        clearTimeout(deadline);
        resolve();
      } else if (child.exitCode !== null || child.signalCode !== null) {
        clearInterval(timer);
        clearTimeout(deadline);
        reject(new Error(`server exited before matching ${pattern}: ${output().slice(-1_000)}`));
      }
    }, 20);
  });
}

function waitForClose(child, timeoutMs = 5_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("server did not exit after schema failure")), timeoutMs);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code, signal });
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  const closed = new Promise((resolve) => child.once("close", resolve));
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 500)),
  ]);
  if (!stopped) {
    child.kill("SIGKILL");
    await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 2_000))]);
  }
}

function canConnect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: "127.0.0.1", port });
    const finish = (connected) => {
      socket.destroy();
      resolve(connected);
    };
    socket.setTimeout(250);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", (error) => {
      if (error.code === "ECONNREFUSED") finish(false);
      else reject(error);
    });
  });
}

function getHealth(port) {
  return new Promise((resolve, reject) => {
    const request = http.get({
      host: "127.0.0.1",
      port,
      path: "/api/health",
      headers: { Connection: "close" },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.setTimeout(2_000, () => request.destroy(new Error("health request timed out")));
    request.once("error", reject);
  });
}

async function startFixture({ mode, delayMs }) {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "praktika_startup_schema_"));
  const guardPath = path.join(workspace, "startup_guard.mjs");
  await writeFile(guardPath, STARTUP_GUARD_SOURCE, "utf8");
  const port = await reserveLoopbackPort();
  let stdout = "";
  let stderr = "";
  const child = spawn(process.execPath, ["--import", pathToFileURL(guardPath).href, "server/index.mjs"], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: process.env.PATH || "",
      HOME: workspace,
      TMPDIR: workspace,
      NODE_ENV: "production",
      PORT: String(port),
      PROXY_MODE: "direct",
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      DATABASE_URL: "",
      SEARCH_HASH_SECRET: "",
      LLM_ENABLED: "false",
      LLM_API_KEY: "",
      OPENAI_API_KEY: "",
      CORPUS_ENABLED: "false",
      CORPUS_SYNC_ON_START: "false",
      CORPUS_CONTINUOUS_BACKFILL: "false",
      STARTUP_SCHEMA_MODE: mode,
      STARTUP_SCHEMA_DELAY_MS: String(delayMs),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  return {
    child,
    port,
    output: () => `${stdout}${stderr}`,
    stdout: () => stdout,
    stderr: () => stderr,
    async close() {
      await stopChild(child);
      await rm(workspace, { recursive: true, force: true });
    },
  };
}

test("startup keeps the public port closed until corpus schema and capacity checks finish", async () => {
  const fixture = await startFixture({ mode: "success", delayMs: 700 });
  try {
    await waitForOutput(fixture.child, fixture.output, /schema-started/u);
    assert.equal(
      await canConnect(fixture.port),
      false,
      "no health endpoint or public handler can answer while the schema gate is pending",
    );
    await waitForOutput(fixture.child, fixture.output, new RegExp(`listening on ${fixture.port}`, "u"));
    const health = await getHealth(fixture.port);
    assert.equal(health.status, 200);
    assert.equal(JSON.parse(health.body).status, "ok");
    const output = fixture.stdout();
    assert.ok(output.indexOf("schema-finished") < output.indexOf("listen-called"), "schema completion precedes the bind");
    assert.ok(output.indexOf("listen-called") < output.indexOf(`listening on ${fixture.port}`), "the bind precedes readiness");
    assert.doesNotMatch(output, /unhandled-rejection/u);
  } finally {
    await fixture.close();
  }
});

test("corpus schema or capacity failure exits startup without a health listener", async () => {
  const fixture = await startFixture({ mode: "fail", delayMs: 100 });
  try {
    const result = await waitForClose(fixture.child);
    assert.equal(result.code, 1, "failed migration gives the process a failing exit code");
    assert.equal(result.signal, null, "startup failure is not a signal or timeout");
    assert.doesNotMatch(fixture.stdout(), /listen-called|listening on/u, "the public port never opens");
    assert.match(fixture.stderr(), /corpus-schema-startup-failed/u, "the failure log names the startup gate");
    assert.match(fixture.stderr(), /synthetic corpus capacity migration failure/u, "the failure log keeps the migration error useful");
    assert.doesNotMatch(fixture.stdout(), /unhandled-rejection/u, "the rejection is handled by startup");
  } finally {
    await fixture.close();
  }
});
