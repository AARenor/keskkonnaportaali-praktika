import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { validateGroundedAnswer } from "../server/llm.mjs";
import { searchEnvironmentLive } from "../server/pipeline.mjs";
import { officialServiceCatalogueDocuments } from "../server/search.mjs";

// Synthetic, harmless probe text. It stands in for anything a reader types or
// a page injects, so a leak is provable without using real user data.
const PRIVACY_MARKER = "ZQXPRIVACY9931MARKER";
const PROTECTED_AREA_QUERY = "Kui suur osa metsadest on kaitse all?";
const ATTEMPT_KEYS = ["reason", "status"];

function protectedForestSource() {
  const source = officialServiceCatalogueDocuments()
    .find((document) => document.id === "protected-forest-share");
  assert.ok(source, "the protected forest share fixture must exist");
  return source;
}

// Two real validation rejections that carry raw text: one unbound negation in
// the introduction, and one reversed polarity where the validator records both
// the rejected claim and the source sentence it compared against.
const REJECTED_PAYLOADS = [
  {
    name: "unbound negation",
    proposal: (draft) => ({
      intro: `${PRIVACY_MARKER} Kaitse all ei ole ükski Eesti mets.`,
      intro_citations: [1],
      parts: draft.answer.parts.map((part) => ({
        title: part.title, text: part.text, citations: part.citations,
      })),
    }),
    expectClaimText: true,
    expectSourceText: false,
    markerInDetail: true,
  },
  {
    name: "reversed polarity",
    proposal: (draft) => ({
      intro: `Kaitse all on 87,4% Eesti metsadest ja ${PRIVACY_MARKER}.`,
      intro_citations: [1],
      parts: [{ title: "Kontroll", text: `${PRIVACY_MARKER} kobras ehitab kivimüüre.`, citations: [1] }],
    }),
    expectClaimText: true,
    expectSourceText: true,
    markerInDetail: false,
  },
];

async function rejectedModelAttempt(scenario) {
  const source = protectedForestSource();
  const startedAt = Date.now();
  const captured = { validated: null, streamed: null, persisted: null };
  const result = await searchEnvironmentLive(PROTECTED_AREA_QUERY, {
    startedAt,
    deadlineAt: startedAt + 8_000,
    useCache: false,
    searchResults: { total: 1, items: [source] },
    onDraft(draft) { captured.streamed = structuredClone(draft); },
    async recordSearch(record) { captured.persisted = structuredClone(record); },
    generateAnswer(providerQuery, providerDraft, { evidencePack }) {
      const validated = validateGroundedAnswer(
        scenario.proposal(providerDraft),
        providerDraft,
        providerQuery,
        evidencePack,
      );
      captured.validated = validated;
      return {
        answer: validated.answer,
        acceptedClaims: validated.acceptedClaims,
        attempt: {
          provider: "test-provider",
          status: validated.answer ? "ready" : "degraded",
          reason: validated.rejectionReason || "none",
          ...(validated.rejectionDetail ? { detail: validated.rejectionDetail } : {}),
        },
      };
    },
  });
  return { ...captured, result };
}

for (const scenario of REJECTED_PAYLOADS) {
  test(`a rejected model answer (${scenario.name}) keeps its status codes but not the validation text`, async () => {
    const { validated, streamed, persisted, result } = await rejectedModelAttempt(scenario);

    // The validator really did produce raw claim and source text. Without this
    // the published response would be clean for the wrong reason.
    const rejectionDetail = validated?.rejectionDetail || "";
    assert.equal(validated?.answer, null);
    assert.equal(validated?.rejectionReason, "local-rejected");
    if (scenario.expectClaimText) assert.match(rejectionDetail, /claim: /u);
    if (scenario.expectSourceText) assert.match(rejectionDetail, /source: /u);
    assert.equal(rejectionDetail.includes(PRIVACY_MARKER), scenario.markerInDetail);

    // Status words stay. PROJEKT.md documents answerAttempt as status, reason
    // and an optional check code, so no field may carry provider or evidence prose.
    assert.ok(result.answerAttempt);
    assert.deepEqual(
      Object.keys(result.answerAttempt).filter((key) => key !== "check").sort(),
      ATTEMPT_KEYS,
      `answerAttempt carries status, reason and a check code only (PROJEKT.md), got ${JSON.stringify(result.answerAttempt).slice(0, 300)}`,
    );
    if (result.answerAttempt.check !== undefined) {
      assert.match(result.answerAttempt.check, /^[a-z-]{1,80}$/u);
      assert.doesNotMatch(result.answerAttempt.check, /zqxprivacy|claim|source-/u);
    }
    assert.equal(result.answerAttempt.status, "degraded");
    assert.equal(result.answerAttempt.reason, "local-rejected");

    const publicJson = JSON.stringify(result);
    assert.doesNotMatch(publicJson, new RegExp(PRIVACY_MARKER, "u"));
    assert.doesNotMatch(publicJson, /\bclaim: /u);
    assert.doesNotMatch(publicJson, /\bsource: /u);

    // The safe fallback is untouched: the cited deterministic answer, not the
    // rejected model text and not an empty card.
    assert.notEqual(result.answer?.eyebrow, "AI koondvastus");
    assert.ok(result.answer?.intro);
    assert.ok(result.answer.introCitations.length > 0);
    assert.ok(result.sources.length > 0);
    assert.doesNotMatch(result.answer.intro, new RegExp(PRIVACY_MARKER, "u"));

    // The database keeps the allowlisted attempt, never the validator text.
    assert.deepEqual(persisted?.attempt, {
      provider: "test-provider",
      status: "degraded",
      reason: "local-rejected",
    });

    // The streamed draft is published before the model runs, so it must never
    // gain attempt metadata or provider text either.
    assert.ok(streamed);
    assert.equal("answerAttempt" in streamed, false);
    assert.doesNotMatch(JSON.stringify(streamed), new RegExp(PRIVACY_MARKER, "u"));
  });
}

// The deployed entrypoint cannot be imported: it exports nothing, starts
// listening at load time and kicks off background maintenance. The only
// consumer-visible check therefore runs it the way the container does, as a
// child process with a private environment and a loopback port of its own. The
// in-process guard forces the entrypoint's wildcard listen onto 127.0.0.1
// without touching its handlers, and refuses every non-loopback connection, so
// the listener is never exposed and no external service is contacted.
const NETWORK_GUARD_SOURCE = [
  'import { appendFileSync } from "node:fs";',
  'import http from "node:http";',
  'import https from "node:https";',
  'import net from "node:net";',
  "",
  "const LOG = process.env.PRIVACY_GUARD_LOG;",
  'const LOOPBACK = new Set(["", "0.0.0.0", "::", "::1", "127.0.0.1", "localhost"]);',
  "",
  "function record(kind, target) {",
  '  const label = kind + " " + String(target || "unknown");',
  '  try { appendFileSync(LOG, "BLOCKED " + label + "\\n"); } catch {}',
  '  const error = new Error("PRIVACY_GUARD_BLOCKED " + label);',
  '  error.code = "PRIVACY_GUARD_BLOCKED";',
  "  return error;",
  "}",
  "",
  "function externalHost(value) {",
  '  const text = String(value || "").trim().replace(/^\\[|\\]$/gu, "").toLocaleLowerCase("en");',
  '  return LOOPBACK.has(text) ? "" : text;',
  "}",
  "",
  'appendFileSync(LOG, "GUARD-LOADED\\n");',
  "",
  "function wildcardHost(value) {",
  '  const text = String(value || "").trim().toLocaleLowerCase("en").replace(/^\\[|\\]$/gu, "");',
  '  return text === "" || text === "0.0.0.0" || text === "::" || /^0+(:0+)*$/u.test(text);',
  "}",
  "",
  "function recordListen(requested) {",
  '  try { appendFileSync(LOG, "LISTEN 127.0.0.1 requested=" + String(requested || "default") + "\\n"); } catch {}',
  "}",
  "",
  // The entrypoint binds a wildcard address. Rewrite only the host, keep the
  // port, the backlog, the signal and the listening callback, so the real
  // handlers and the readiness line stay exactly as shipped while the socket
  // never leaves loopback.
  "const realListen = net.Server.prototype.listen;",
  "net.Server.prototype.listen = function guardedListen(...args) {",
  "  const first = args[0];",
  '  if (first && typeof first === "object" && !Array.isArray(first) && first.path === undefined) {',
  '    if (wildcardHost(first.host)) { recordListen(first.host); return realListen.call(this, { ...first, host: "127.0.0.1" }, ...args.slice(1)); }',
  "    return realListen.call(this, ...args);",
  "  }",
  '  if (typeof first === "string" && !/^\\d+$/u.test(first)) return realListen.call(this, ...args);',
  "  const rest = args.slice(1);",
  '  const hostIndex = rest.findIndex((value) => typeof value === "string");',
  '  if (hostIndex === -1) { recordListen(""); return realListen.call(this, first, "127.0.0.1", ...rest); }',
  "  if (!wildcardHost(rest[hostIndex])) return realListen.call(this, ...args);",
  "  recordListen(rest[hostIndex]);",
  "  const rewritten = rest.slice();",
  '  rewritten[hostIndex] = "127.0.0.1";',
  "  return realListen.call(this, first, ...rewritten);",
  "};",
  "",
  "const realConnect = net.Socket.prototype.connect;",
  "net.Socket.prototype.connect = function guardedConnect(...args) {",
  "  const first = args[0];",
  '  if (first && typeof first === "object" && (first.path || first.fd !== undefined)) return realConnect.apply(this, args);',
  '  const host = first && typeof first === "object" ? externalHost(first.host)',
  '    : typeof args[1] === "string" ? externalHost(args[1]) : "";',
  '  if (host) throw record("tcp", host);',
  "  return realConnect.apply(this, args);",
  "};",
  "",
  "for (const module of [http, https]) {",
  '  for (const name of ["request", "get"]) {',
  "    const original = module[name];",
  "    module[name] = function guardedRequest(...args) {",
  "      const first = args[0];",
  '      let host = "";',
  '      if (typeof first === "string") { try { host = externalHost(new URL(first).hostname); } catch { host = ""; } }',
  '      else if (first && typeof first === "object") host = externalHost(first.hostname || first.host);',
  '      if (host) throw record(name, host);',
  "      return original.apply(this, args);",
  "    };",
  "  }",
  "}",
  "",
  "const realFetch = globalThis.fetch;",
  "globalThis.fetch = function guardedFetch(input, init) {",
  '  let host = "";',
  '  try { host = externalHost(new URL(typeof input === "string" ? input : String(input && input.url)).hostname); } catch { host = ""; }',
  '  if (host) return Promise.reject(record("fetch", host));',
  "  return realFetch.call(this, input, init);",
  "};",
  "",
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

function localNonLoopbackAddress() {
  for (const entries of Object.values(os.networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family !== "IPv4" || entry.internal) continue;
      return entry.address;
    }
  }
  return null;
}

function connectOnce(host, port) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host, port });
    socket.setTimeout(1_500);
    socket.once("connect", () => {
      socket.destroy();
      resolve();
    });
    socket.once("timeout", () => {
      socket.destroy();
      reject(Object.assign(new Error(`no answer from ${host}:${port}`), { code: "ETIMEDOUT" }));
    });
    socket.once("error", (error) => {
      socket.destroy();
      reject(error);
    });
  });
}

function settlesWithin(promise, milliseconds) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(false), milliseconds);
    const settle = () => { clearTimeout(timer); resolve(true); };
    promise.then(settle, settle);
  });
}

function waitForListening(child, output) {
  return new Promise((resolve, reject) => {
    const timer = setInterval(() => {
      if (/listening on \d+/u.test(output())) {
        clearInterval(timer);
        clearTimeout(deadline);
        resolve();
      } else if (child.exitCode !== null) {
        clearInterval(timer);
        clearTimeout(deadline);
        reject(new Error(`the server exited before it listened: ${output().slice(-800)}`));
      }
    }, 20);
    const deadline = setTimeout(() => {
      clearInterval(timer);
      reject(new Error(`the server did not listen within 30 s: ${output().slice(-800)}`));
    }, 30_000);
    child.once("error", (error) => {
      clearInterval(timer);
      clearTimeout(deadline);
      reject(error);
    });
  });
}

async function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = new Promise((resolve) => child.once("close", resolve));
  child.kill("SIGTERM");
  if (await settlesWithin(closed, 4_000)) return;
  child.kill("SIGKILL");
  await settlesWithin(closed, 4_000);
}

function postJson(port, { body, contentType, path = "/api/search" }) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: "127.0.0.1",
      port,
      method: "POST",
      path,
      headers: {
        "Content-Type": contentType,
        "Content-Length": Buffer.byteLength(body),
        Connection: "close",
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        contentType: response.headers["content-type"] || "",
        body: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    request.on("error", reject);
    request.end(body);
  });
}

test("the isolated server protects request bodies and handles cited follow-ups", { timeout: 90_000 }, async (t) => {
  const workspace = await mkdtemp(path.join(os.tmpdir(), "privacy_boundary_"));
  const guardLogPath = path.join(workspace, "network_guard.log");
  const guardPath = path.join(workspace, "network_guard.mjs");
  const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
  let child = null;
  let responses = null;
  let listeningPort = null;
  let guardLog = "";
  let stdoutText = "";
  let stderrText = "";
  // Teardown record for the reporter: assets, process identity, and whether
  // both are gone. Paths, pid, port and record kinds only, never request text.
  const teardown = {
    workspace,
    guardPath,
    guardLogPath,
    pid: null,
    port: null,
    childExited: false,
    exitCode: null,
    signalCode: null,
    workspaceRemoved: false,
    guardRecordKinds: [],
  };
  try {
    await writeFile(guardPath, NETWORK_GUARD_SOURCE, "utf8");
    const port = await reserveLoopbackPort();
    listeningPort = port;
    // Private fixture environment: no database, no model, no proxy trust, plus
    // the explicit loopback origin and mode that production configuration
    // requires. Nothing is inherited from the caller beyond PATH.
    const childEnvironment = {
      PATH: process.env.PATH || "",
      HOME: workspace,
      TMPDIR: workspace,
      NODE_ENV: "production",
      PORT: String(port),
      PROXY_MODE: "direct",
      PUBLIC_ORIGIN: `http://127.0.0.1:${port}`,
      LLM_ENABLED: "false",
      PRIVACY_GUARD_LOG: guardLogPath,
    };
    child = spawn(process.execPath, ["--import", pathToFileURL(guardPath).href, "server/index.mjs"], {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: ["ignore", "pipe", "pipe"],
    });
    teardown.pid = child.pid ?? null;
    teardown.port = port;
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => { stdoutText += chunk; });
    child.stderr.on("data", (chunk) => { stderrText += chunk; });
    await waitForListening(child, () => `${stdoutText}${stderrText}`);
    await t.test("a follow-up can reuse a directly relevant cited answer", async () => {
      const send = async (path, body) => {
        const response = await postJson(port, {
          path,
          body: JSON.stringify(body),
          contentType: "application/json",
        });
        assert.equal(response.status, 200);
        return JSON.parse(response.body);
      };
      const rootQuestion = "Millal tuleb metsateatis esitada?";
      const question = "Kas valgustusraie puhul on metsateatist vaja?";
      const root = await send("/api/search", { q: rootQuestion });
      const priorAnswer = [
        root.answer?.title,
        root.answer?.intro,
        ...(root.answer?.parts || []).map((part) => part.text),
      ].filter(Boolean).join(" ");
      assert.match(priorAnswer, /valgustusraie/iu);
      const followUp = await send("/api/search/follow-up", {
        root_query: rootQuestion,
        question,
        previous_questions: [],
        previous_answers: [priorAnswer],
      });
      assert.notEqual(followUp.answer?.eyebrow, "Vastust ei leitud");
      assert.match(followUp.answer?.intro || "", /valgustusraie/iu);
      assert.ok(followUp.answer?.introCitations?.length > 0);
      assert.ok(followUp.sources?.length > 0);
      assert.match(followUp.answer?.note || "", /üldjuhise väljavõte/iu);
      assert.match(followUp.answer?.note || "", /kordab/iu);
      const unsupported = await send("/api/search/follow-up", {
        root_query: rootQuestion,
        question: "Kui kaua keskkonnaamet metsateatist menetleb?",
        previous_questions: [],
        previous_answers: [priorAnswer],
      });
      assert.equal(unsupported.answer?.eyebrow, "Vastust ei leitud");
    });
    responses = {
      malformed: await postJson(port, { body: PRIVACY_MARKER, contentType: "application/json" }),
      oversize: await postJson(port, { body: `{"query":"${"a".repeat(40 * 1024)}"}`, contentType: "application/json" }),
      charset: await postJson(port, { body: `{"query":"${PRIVACY_MARKER}"}`, contentType: "application/json; charset=iso-8859-1" }),
      mediaType: await postJson(port, { body: `{"query":"${PRIVACY_MARKER}"}`, contentType: "text/plain" }),
    };
  } finally {
    if (child) await stopChild(child);
    teardown.childExited = Boolean(child) && (child.exitCode !== null || child.signalCode !== null);
    teardown.exitCode = child?.exitCode ?? null;
    teardown.signalCode = child?.signalCode ?? null;
    guardLog = await readFile(guardLogPath, "utf8").catch(() => "");
    await rm(workspace, { recursive: true, force: true });
    teardown.workspaceRemoved = await access(workspace).then(() => false, () => true);
    teardown.guardRecordKinds = guardLog.split("\n")
      .filter((entry) => entry && entry !== "GUARD-LOADED");
    t.diagnostic(`workspace ${teardown.workspace}`);
    t.diagnostic(`guard ${teardown.guardPath}`);
    t.diagnostic(`guard log ${teardown.guardLogPath} (${teardown.guardRecordKinds.length} records)`);
    t.diagnostic(`child pid ${teardown.pid}, loopback port ${teardown.port}`);
    t.diagnostic(`child exited ${teardown.childExited}, exitCode ${teardown.exitCode}, signalCode ${teardown.signalCode}`);
    t.diagnostic(`workspace removed ${teardown.workspaceRemoved}`);
    for (const record of teardown.guardRecordKinds.slice(0, 8)) t.diagnostic(`guard record ${record}`);
  }

  // Teardown must hold no matter what the disclosure assertions decide.
  assert.equal(teardown.childExited, true, `the child process ${teardown.pid} did not exit`);
  assert.equal(teardown.workspaceRemoved, true, `the workspace ${teardown.workspace} was not removed`);

  assert.ok(responses, "the server answered the probe requests");
  assert.equal(responses.malformed.status, 400, `malformed JSON body: ${responses.malformed.body.slice(0, 200)}`);
  assert.equal(responses.oversize.status, 413, `oversize body: ${responses.oversize.body.slice(0, 200)}`);
  assert.equal(responses.charset.status, 415, `unsupported charset: ${responses.charset.body.slice(0, 200)}`);
  assert.equal(responses.mediaType.status, 415, `wrong media type: ${responses.mediaType.body.slice(0, 200)}`);

  // Every rejected body answers the API contract: a JSON object with a string
  // error field. Wording is the server's to choose, so it is not pinned here.
  for (const [name, response] of Object.entries(responses)) {
    let parsed = null;
    try {
      parsed = JSON.parse(response.body);
    } catch {
      parsed = null;
    }
    assert.ok(
      parsed && typeof parsed === "object" && !Array.isArray(parsed),
      `${name}: the rejected body answers a JSON object, got ${response.body.slice(0, 160)}`,
    );
    assert.equal(typeof parsed.error, "string", `${name}: the JSON carries a string error field`);
  }

  // Isolation evidence: the guard loaded inside the server process, forced the
  // wildcard bind onto loopback, and refused every other network attempt
  // before a socket was dialled.
  assert.match(guardLog, /^GUARD-LOADED$/mu, "the network guard ran inside the server process");
  assert.match(
    guardLog,
    /^LISTEN 127\.0\.0\.1 requested=0\.0\.0\.0$/mu,
    "the entrypoint wildcard bind was rewritten onto loopback instead of refusing to start",
  );
  for (const line of guardLog.split("\n").filter((entry) => entry && entry !== "GUARD-LOADED")) {
    assert.match(line, /^(?:BLOCKED (?:tcp|fetch|request|get) |LISTEN 127\.0\.0\.1 requested=)/u, `unexpected guard record: ${line}`);
  }

  // The listener must not answer on any non-loopback interface address.
  const externalAddress = localNonLoopbackAddress();
  if (externalAddress && listeningPort) {
    await assert.rejects(
      connectOnce(externalAddress, listeningPort),
      (error) => ["ECONNREFUSED", "EHOSTUNREACH", "ENETUNREACH", "ETIMEDOUT", "EADDRNOTAVAIL", "EACCES"].includes(error.code),
      `the test listener answered on ${externalAddress}, but it must stay on loopback`,
    );
  }

  // The disclosure boundary: the raw request body, the client supplied charset
  // and an internal path or stack frame must reach neither the reader nor a log.
  const forbidden = [
    ["the request body", new RegExp(PRIVACY_MARKER, "u")],
    ["the client charset", /iso-8859-1/iu],
    ["an internal path or stack frame", /node_modules|\.mjs:\d+/u],
  ];
  for (const [name, response] of Object.entries(responses)) {
    for (const [label, pattern] of forbidden) {
      assert.doesNotMatch(response.body, pattern, `${name}: the reader sees ${label}: ${response.body.slice(0, 160)}`);
    }
  }
  const serverLogs = `${stdoutText}\n${stderrText}`;
  for (const [label, pattern] of forbidden) {
    assert.doesNotMatch(serverLogs, pattern, `the server logs carry ${label}: ${stderrText.slice(0, 800)}`);
  }
});
