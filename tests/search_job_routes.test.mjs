import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Actual HTTP behaviour of the asynchronous search job routes against a real server
// process. Everything is synthetic: no database, no model, no outbound source
// request. The tests speak only the public contract, so they stay valid while
// the job registry implementation changes underneath.
const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const JOBS = "/api/search/jobs";
const POLL = "/api/search/jobs/poll";
const CANCEL = "/api/search/jobs/cancel";
const PUBLIC_EVENT_TYPES = new Set(["results", "draft", "answer"]);
// A private-person lookup is refused by the follow-up scope check before
// admission and retrieval, and that refusal still produces a results and an
// answer event. Confirmed directly: blockedFollowUpAssessment returns
// out-of-scope/personal-data-lookup for this root query.
const BLOCKED_FOLLOW_UP = {
  root_query: "Jaan Tamme metsa omanik",
  question: "kas see on avalik?",
  previous_questions: [],
  previous_answers: [],
};

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

// PRAKTIKA_JOB_ROUTE_TEST_PORT pins this fixture's listener so the exact
// loopback port can be recorded before the run. It is a separate variable from
// the route-guard fixture on purpose: the full suite runs both files at the same
// time, and one shared variable would hand them the same port. Without it a free
// port is reserved at random.
async function resolveTestPort() {
  const override = Number(process.env.PRAKTIKA_JOB_ROUTE_TEST_PORT);
  if (Number.isInteger(override) && override > 0 && override <= 65_535) return override;
  return reserveLoopbackPort();
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
  const stopped = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 4_000)),
  ]);
  if (stopped) return;
  child.kill("SIGKILL");
  await Promise.race([closed, new Promise((resolve) => setTimeout(resolve, 4_000))]);
}

function postJson(port, { path, headers = {}, body = "" }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(String(body), "utf8");
    const outgoing = http.request({
      host: "127.0.0.1",
      port,
      method: "POST",
      path,
      headers: { "Content-Length": payload.length, Connection: "close", ...headers },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        text: Buffer.concat(chunks).toString("utf8"),
      }));
    });
    outgoing.on("error", reject);
    outgoing.end(payload);
  });
}

function browserHeaders(origin, extra = {}) {
  return {
    "Content-Type": "application/json",
    Origin: origin,
    "Sec-Fetch-Site": "same-origin",
    ...extra,
  };
}

function jsonOf(response) {
  try {
    return JSON.parse(response.text);
  } catch {
    return null;
  }
}

// Events are read by shape rather than by exact nesting, so a poll body that
// wraps them differently still reports what the reader received.
function publicEvents(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((entry) => publicEvents(entry, found));
  } else if (node && typeof node === "object") {
    if (typeof node.type === "string" && PUBLIC_EVENT_TYPES.has(node.type)) found.push(node);
    else Object.values(node).forEach((value) => publicEvents(value, found));
  }
  return found;
}

// The documented poll shape is {events: [{seq, event}]} with dense sequence
// numbers from 1. The cursor is the last sequence number seen, so an empty poll
// must never advance it: doing that would silently skip a later event.
function readPoll(body) {
  const entries = Array.isArray(body?.events) ? body.events : [];
  const events = [];
  let lastSeq = null;
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") continue;
    const seq = Number(entry.seq);
    if (Number.isInteger(seq) && seq > 0) lastSeq = lastSeq === null ? seq : Math.max(lastSeq, seq);
    const event = entry.event && typeof entry.event === "object" ? entry.event : entry;
    if (PUBLIC_EVENT_TYPES.has(event?.type)) events.push({ ...event, seq });
  }
  if (!entries.length) return { events: publicEvents(body), lastSeq: null };
  return { events, lastSeq };
}

async function startJob(port, origin, { id, key, kind = "search", request }) {
  return postJson(port, {
    path: JOBS,
    headers: browserHeaders(origin),
    body: JSON.stringify({ job_id: id, job_key: key, kind, request }),
  });
}

async function pollJob(port, origin, { id, key, after }) {
  return postJson(port, {
    path: POLL,
    headers: browserHeaders(origin),
    body: JSON.stringify({ job_id: id, job_key: key, after }),
  });
}

// Poll until an answer event appears (the job finished) or the time budget runs
// out. The delay backs off so a slow answer costs a few polls, not hundreds,
// and the poll budget stays inside the route's own control limit.
async function drainJob(port, origin, { id, key, budgetMs = 20_000 }) {
  const events = [];
  let after = 0;
  let delay = 25;
  let last = null;
  const stopAt = Date.now() + budgetMs;
  while (Date.now() < stopAt) {
    const response = await pollJob(port, origin, { id, key, after });
    assert.ok(response.status < 400, `poll failed with ${response.status}: ${response.text.slice(0, 200)}`);
    last = jsonOf(response);
    const { events: received, lastSeq } = readPoll(last);
    events.push(...received);
    if (lastSeq !== null) after = lastSeq;
    if (events.some((event) => event.type === "answer")) break;
    await new Promise((resolve) => setTimeout(resolve, delay));
    delay = Math.min(500, Math.round(delay * 1.5));
  }
  return { events, last };
}

function isIsoOrNull(value) {
  if (value === null) return true;
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

test("the asynchronous search job routes keep the search contract", { timeout: 180_000 }, async (t) => {
  const port = await resolveTestPort();
  const origin = `http://127.0.0.1:${port}`;
  let outputText = "";
  const child = spawn(process.execPath, ["server/index.mjs"], {
    cwd: REPOSITORY_ROOT,
    env: {
      PATH: process.env.PATH || "",
      NODE_ENV: "production",
      PORT: String(port),
      PROXY_MODE: "direct",
      PUBLIC_ORIGIN: origin,
      LLM_ENABLED: "false",
      // Explicitly offline: no database and no model, and the only successful
      // domain path is the scope-blocked pair that returns before retrieval.
      DATABASE_URL: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { outputText += chunk; });
  child.stderr.on("data", (chunk) => { outputText += chunk; });
  t.after(async () => {
    await stopChild(child);
  });
  await waitForListening(child, () => outputText);
  t.diagnostic(`job route test listener: ${origin}${process.env.PRAKTIKA_JOB_ROUTE_TEST_PORT ? " (pinned)" : " (random)"}`);

  await t.test("all three job routes reject cross-site and non-JSON requests before any work", async () => {
    for (const path of [JOBS, POLL, CANCEL]) {
      const crossSite = await postJson(port, {
        path,
        headers: browserHeaders(origin, { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" }),
        body: JSON.stringify({ job_id: "a", job_key: "b", kind: "search", request: { q: "mets" }, after: 0 }),
      });
      assert.equal(crossSite.status, 403, `${path} must refuse a cross-site browser request, got ${crossSite.status}: ${crossSite.text.slice(0, 200)}`);
      assert.match(crossSite.text, /Ristdomeeni otsingupäring ei ole lubatud/u);

      const wrongType = await postJson(port, {
        path,
        headers: { "Content-Type": "text/plain", Origin: origin, "Sec-Fetch-Site": "same-origin" },
        body: "job_id=a",
      });
      assert.equal(wrongType.status, 415, `${path} must refuse a non-JSON body, got ${wrongType.status}: ${wrongType.text.slice(0, 200)}`);
      assert.match(wrongType.text, /Päring peab kasutama JSON-vormingut/u);
    }
  });

  await t.test("creating a job returns a documented handle and polling replays the events in order", async () => {
    // The scope-blocked query is the one fixture whose whole run is decided
    // before retrieval, admission and model work, so this route test never
    // reaches an external source: the job answers with the safe pair offline.
    const id = "test-job-search-1";
    const key = "test-job-key-0001";
    const created = await startJob(port, origin, {
      id,
      key,
      kind: "search",
      request: { q: "Jaan Tamme metsa omanik", page: 1, page_size: 12, filters: { source: "all", category: "", year: null, sort: "relevance" } },
    });
    assert.ok([200, 201, 202].includes(created.status), `job creation failed with ${created.status}: ${created.text.slice(0, 240)}`);
    const handle = jsonOf(created);
    assert.ok(handle && typeof handle === "object", "job creation must answer with a JSON handle");
    assert.equal(handle.job_id, id, "the handle must carry the job identifier the client chose");
    assert.equal(handle.state, "running", `a new job must report the running state, got ${handle.state}`);
    assert.ok(isIsoOrNull(handle.deadline_at), `deadline_at must be an ISO timestamp or null, got ${handle.deadline_at}`);
    assert.ok(
      Number.isInteger(handle.retry_after_ms) && handle.retry_after_ms > 0,
      `a running job must report a positive retry_after_ms, got ${handle.retry_after_ms}`,
    );
    assert.ok(Array.isArray(handle.events), "the poll events must be an array");
    assert.deepEqual(handle.events, [], "the creating response must not carry stored events; the job outlives that response");

    const drainStartedAt = Date.now();
    const { events } = await drainJob(port, origin, { id, key });
    const drainElapsedMs = Date.now() - drainStartedAt;
    const types = events.map((event) => event.type);
    assert.ok(
      drainElapsedMs < 5_000,
      `an out-of-scope job must not wait on an external source, it took ${drainElapsedMs} ms`,
    );
    assert.deepEqual(
      types,
      ["results", "answer"],
      `an out-of-scope job must publish exactly the safe pair, got ${JSON.stringify(types)}`,
    );
    assert.doesNotMatch(
      JSON.stringify(events),
      /"items":\[\{/u,
      "no retrieval may run for an out-of-scope job, so the listing stays empty",
    );

    // The answer is emitted before the run returns, so the terminal state can
    // arrive one poll later; the job must still end in exactly one terminal
    // state without asking the reader to retry any more.
    let terminal = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      terminal = jsonOf(await pollJob(port, origin, { id, key, after: 2 }));
      if (terminal?.state !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.equal(terminal?.job_id, id, "the poll body must name the job it belongs to");
    assert.equal(terminal?.state, "complete", `a finished job must report complete, got ${terminal?.state}`);
    assert.equal(terminal?.retry_after_ms, 0, "a finished job must stop asking for a retry");
    assert.ok(isIsoOrNull(terminal?.deadline_at), `deadline_at must stay an ISO timestamp or null, got ${terminal?.deadline_at}`);

    // Sequence numbers are dense from 1, so a replay from zero must return the
    // same two events in the same order and lose nothing.
    const replayResponse = await pollJob(port, origin, { id, key, after: 0 });
    assert.equal(replayResponse.status, 200, `a full replay must succeed, got ${replayResponse.status}`);
    const replayed = readPoll(jsonOf(replayResponse)).events;
    assert.deepEqual(
      replayed.map((event) => event.seq),
      [1, 2],
      `the stored events must be numbered densely from 1, got ${JSON.stringify(replayed.map((event) => event.seq))}`,
    );
    assert.deepEqual(
      replayed.map((event) => event.type),
      ["results", "answer"],
      "a replay must repeat the listing before the answer",
    );

    // The store keeps an internal expiry bound and a safe replacement per event
    // that carried copied text. Neither may surface, and neither may be
    // reconstructible from a poll body.
    assert.doesNotMatch(
      replayResponse.text,
      /expiresAt|expiryAt|fallback|unavailable_after|_sourcePolicy|source_policy|_contentHash/u,
      "the expiry mechanism and its witnesses must never appear in a poll body",
    );
  });

  await t.test("a blocked follow-up job returns the safe event pair without retrieval", async () => {
    const created = await startJob(port, origin, {
      id: "test-job-blocked-1",
      key: "test-job-key-blocked-0001",
      kind: "follow-up",
      request: BLOCKED_FOLLOW_UP,
    });
    assert.ok(created.status < 400, `blocked follow-up creation failed with ${created.status}: ${created.text.slice(0, 240)}`);

    const { events } = await drainJob(port, origin, { id: "test-job-blocked-1", key: "test-job-key-blocked-0001" });
    const types = events.map((event) => event.type);
    assert.deepEqual(
      types,
      ["results", "answer"],
      `a blocked job must publish exactly the scope pair, got ${JSON.stringify(types)}`,
    );
    assert.doesNotMatch(
      JSON.stringify(events),
      /"items":\[\{/u,
      "a blocked job must not carry retrieved listing items",
    );
  });

  await t.test("an unknown job is reported, not regenerated", async () => {
    const first = await pollJob(port, origin, { id: "no-such-job-0001", key: "no-such-key-000001", after: 0 });
    const second = await pollJob(port, origin, { id: "no-such-job-0001", key: "no-such-key-000001", after: 0 });
    for (const response of [first, second]) {
      const reported = response.status >= 400 || ["missing", "unknown", "expired"].includes(jsonOf(response)?.status);
      assert.ok(reported, `an unknown job must be reported, got ${response.status}: ${response.text.slice(0, 200)}`);
      assert.equal(publicEvents(jsonOf(response)).length, 0, "an unknown job must not produce events");
    }
    assert.equal(first.status, second.status, "polling a missing job twice must not start it");

    // A wrong key must be indistinguishable from an unknown job: it can neither
    // read nor cancel work that belongs to another client, and the real owner
    // keeps exactly the events it already received.
    const wrongKey = "test-job-key-wrong-000001";
    const wrongKeyPoll = await pollJob(port, origin, { id: "test-job-search-1", key: wrongKey, after: 0 });
    assert.equal(wrongKeyPoll.status, first.status, `a wrong key must be reported like an unknown job, got ${wrongKeyPoll.status}: ${wrongKeyPoll.text.slice(0, 200)}`);
    assert.equal(wrongKeyPoll.text, first.text, "a wrong key must not be distinguishable from an unknown job");
    assert.equal(publicEvents(jsonOf(wrongKeyPoll)).length, 0, "a wrong key must never reveal another job's events");

    const wrongKeyCancel = await postJson(port, {
      path: CANCEL,
      headers: browserHeaders(origin),
      body: JSON.stringify({ job_id: "test-job-search-1", job_key: wrongKey }),
    });
    assert.equal(wrongKeyCancel.status, first.status, `a wrong key must not cancel another job, got ${wrongKeyCancel.status}: ${wrongKeyCancel.text.slice(0, 200)}`);
    assert.equal(wrongKeyCancel.text, first.text, "a wrong-key cancel must read like an unknown job");

    const ownerPoll = await pollJob(port, origin, { id: "test-job-search-1", key: "test-job-key-0001", after: 0 });
    assert.ok(ownerPoll.status < 400, `the owner must still read its job, got ${ownerPoll.status}: ${ownerPoll.text.slice(0, 200)}`);
    assert.ok(
      publicEvents(jsonOf(ownerPoll)).some((event) => event.type === "answer"),
      "a refused wrong-key cancel must not withdraw the owner's answer",
    );
  });

  await t.test("a late cancel cannot rewrite a finished job, and an unknown cancel blocks generation", async () => {
    const finishedId = "test-job-blocked-1";
    const finishedKey = "test-job-key-blocked-0001";
    // Wait until the job has left the running state, so the cancel below cannot
    // race a live run: a terminal state is immutable, and cancelling a job that
    // already finished must report that same state back.
    let before = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      before = jsonOf(await pollJob(port, origin, { id: finishedId, key: finishedKey, after: 0 }));
      if (before?.state !== "running") break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    assert.ok(
      ["complete", "failed", "cancelled"].includes(before?.state),
      `the blocked job must have finished, got ${before?.state}`,
    );

    const known = await postJson(port, {
      path: CANCEL,
      headers: browserHeaders(origin),
      body: JSON.stringify({ job_id: finishedId, job_key: finishedKey }),
    });
    assert.ok(known.status < 400, `cancelling a finished job must still be accepted, got ${known.status}: ${known.text.slice(0, 200)}`);
    const cancelled = jsonOf(known);
    assert.equal(cancelled?.state, before?.state, `a late cancel must not rewrite the terminal state, got ${cancelled?.state} for ${before?.state}`);
    assert.equal(cancelled?.job_id, finishedId, "the cancel body must name the job it addressed");
    assert.equal(cancelled?.retry_after_ms, 0, "a finished job must not ask for a retry");
    assert.ok(isIsoOrNull(cancelled?.deadline_at), `deadline_at must stay an ISO timestamp or null, got ${cancelled?.deadline_at}`);
    const afterCancel = jsonOf(await pollJob(port, origin, { id: finishedId, key: finishedKey, after: 0 }));
    assert.equal(afterCancel?.state, before?.state, "a late cancel must leave the stored state and events alone");
    assert.deepEqual(readPoll(afterCancel).events.map((event) => event.type), ["results", "answer"], "a late cancel must not withdraw the delivered events");

    // A reader that navigates away cancels an identifier the store may not know
    // yet, and that cancel must win: the identifier is tombstoned, so a create
    // that arrives afterwards can never start generation.
    const unknownId = "no-such-job-0002";
    const unknownKey = "no-such-key-000002";
    const unknown = await postJson(port, {
      path: CANCEL,
      headers: browserHeaders(origin),
      body: JSON.stringify({ job_id: unknownId, job_key: unknownKey }),
    });
    assert.ok(unknown.status < 400, `cancelling an unknown job must be answered, got ${unknown.status}: ${unknown.text.slice(0, 200)}`);
    assert.equal(jsonOf(unknown)?.state, "cancelled", "an unknown job cancel must report cancelled");
    assert.equal(publicEvents(jsonOf(unknown)).length, 0, "cancelling must not produce events");

    const late = await postJson(port, {
      path: JOBS,
      headers: browserHeaders(origin),
      body: JSON.stringify({
        job_id: unknownId,
        job_key: unknownKey,
        kind: "search",
        request: { q: "Jaan Tamme metsa omanik" },
      }),
    });
    assert.equal(jsonOf(late)?.state, "cancelled", `a create after a cancel must not start a job, got ${late.status}: ${late.text.slice(0, 200)}`);
    assert.equal(jsonOf(late)?.deadline_at, null, "a job that was cancelled before it existed has no deadline");
    assert.equal(jsonOf(late)?.retry_after_ms, 0, "a cancelled-before-create job must not ask for a retry");
    assert.equal(publicEvents(jsonOf(late)).length, 0, "a cancelled-before-create job must not produce events");
    const latePoll = await pollJob(port, origin, { id: unknownId, key: unknownKey, after: 0 });
    assert.equal(publicEvents(jsonOf(latePoll)).length, 0, "a cancelled job must never generate a late answer");
  });

  await t.test("creation spends the search limit while polling and cancel do not", async () => {
    // Cheap rejected searches exhaust the shared 20/minute search budget.
    let exhausted = false;
    for (let attempt = 0; attempt < 30 && !exhausted; attempt += 1) {
      const response = await postJson(port, {
        path: "/api/search",
        headers: browserHeaders(origin),
        body: JSON.stringify({}),
      });
      if (response.status === 429) exhausted = true;
    }
    assert.ok(exhausted, "the search budget must be exhausted by the cheap search requests");

    const blockedCreation = await startJob(port, origin, {
      id: "test-job-limited-1",
      key: "test-job-key-limited-00001",
      kind: "search",
      request: { q: "Jaan Tamme metsa omanik" },
    });
    assert.equal(
      blockedCreation.status,
      429,
      `job creation must spend the search limit, got ${blockedCreation.status}: ${blockedCreation.text.slice(0, 200)}`,
    );

    const poll = await pollJob(port, origin, { id: "no-such-job-0001", key: "no-such-key-000001", after: 0 });
    assert.notEqual(poll.status, 429, "polling must not spend the search limit");
    const cancel = await postJson(port, {
      path: CANCEL,
      headers: browserHeaders(origin),
      body: JSON.stringify({ job_id: "no-such-job-0001", job_key: "no-such-key-000001" }),
    });
    assert.notEqual(cancel.status, 429, "cancel must not spend the search limit");

    // Polling is still bounded: its own control limit and the global API limit
    // reject a client that keeps asking.
    let controlLimitHit = false;
    for (let attempt = 0; attempt < 300 && !controlLimitHit; attempt += 1) {
      const response = await pollJob(port, origin, { id: "no-such-job-0001", key: "no-such-key-000001", after: 0 });
      if (response.status === 429) controlLimitHit = true;
    }
    assert.ok(controlLimitHit, "polling must be bounded and eventually answer 429");
  });
});
