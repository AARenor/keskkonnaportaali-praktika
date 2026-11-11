import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import net from "node:net";
import test from "node:test";
import { fileURLToPath } from "node:url";

// Actual HTTP behaviour of the public search routes, against a real server
// process: the browser's own headers decide whether the expensive search route
// runs at all, and every search endpoint shares one request budget. Nothing here
// inspects source text.
const REPOSITORY_ROOT = fileURLToPath(new URL("..", import.meta.url));
const NEW_FOLLOW_UP_STREAM = "/api/search/follow-up/stream";
// A private-person lookup is refused by the follow-up scope check before
// admission and retrieval, and that refusal still streams a results event
// first. The valid control therefore proves the guard admits real traffic
// without making a single outbound source request or model call.
const FOLLOW_UP_BODY = JSON.stringify({
  root_query: "Jaan Tamme metsa omanik",
  question: "kas see on avalik?",
  previous_questions: [],
  previous_answers: [],
});

// PRAKTIKA_ROUTE_TEST_PORT pins the listener so the exact loopback port can be
// recorded before the run; without it a free port is reserved at random.
async function resolveTestPort() {
  const override = Number(process.env.PRAKTIKA_ROUTE_TEST_PORT);
  if (Number.isInteger(override) && override > 0 && override <= 65_535) return override;
  return reserveLoopbackPort();
}

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
  const killed = await Promise.race([
    closed.then(() => true),
    new Promise((resolve) => setTimeout(() => resolve(false), 4_000)),
  ]);
  if (killed) return;
  child.kill("SIGKILL");
  await Promise.race([
    closed,
    new Promise((resolve) => setTimeout(resolve, 4_000)),
  ]);
}

function request(port, { path: requestPath, headers = {}, body = "", method = "POST" }) {
  return new Promise((resolve, reject) => {
    const payload = Buffer.from(String(body), "utf8");
    const outgoing = http.request({
      host: "127.0.0.1",
      port,
      method,
      path: requestPath,
      headers: {
        "Content-Length": payload.length,
        Connection: "close",
        ...headers,
      },
    }, (response) => {
      const chunks = [];
      response.on("data", (chunk) => chunks.push(chunk));
      response.on("end", () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks).toString("utf8"),
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

// Starts the real application on a loopback port with only the variables listed
// here plus the caller's overrides, so no switch leaks in from the parent shell.
async function startRouteServer(t, extraEnv = {}) {
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
      ...extraEnv,
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
  return { port, origin };
}

test("the streamed follow-up route keeps the search route guards and rate limit", { timeout: 120_000 }, async (t) => {
  const { port, origin } = await startRouteServer(t);
  t.diagnostic(`route test listener: ${origin}${process.env.PRAKTIKA_ROUTE_TEST_PORT ? " (pinned by PRAKTIKA_ROUTE_TEST_PORT)" : " (random)"}`);

  await t.test("a cross-site browser POST is refused before the route runs", async () => {
    const crossSite = await request(port, {
      path: NEW_FOLLOW_UP_STREAM,
      headers: browserHeaders(origin, { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" }),
      body: FOLLOW_UP_BODY,
    });
    assert.equal(
      crossSite.status,
      403,
      `a cross-site follow-up must be refused before retrieval, got ${crossSite.status}: ${crossSite.body.slice(0, 240)}`,
    );
    assert.match(String(crossSite.headers["content-type"] || ""), /application\/json/u);
    assert.match(crossSite.body, /Ristdomeeni otsingupäring ei ole lubatud/u);
    assert.equal(
      crossSite.headers["x-accel-buffering"],
      undefined,
      "the stream route must not have started: a refusal carries no streaming headers",
    );
    assert.doesNotMatch(crossSite.body, /"type":"results"/u);

    // The established stream route answers the identical request the same way,
    // so the new route is judged by the same boundary and not by a new rule.
    const control = await request(port, {
      path: "/api/search/stream",
      headers: browserHeaders(origin, { "Sec-Fetch-Site": "cross-site", Origin: "https://evil.example" }),
      body: JSON.stringify({ q: "metsateatis" }),
    });
    assert.equal(control.status, crossSite.status);
    assert.match(control.body, /Ristdomeeni otsingupäring ei ole lubatud/u);

    // A browser request that claims a foreign origin is refused as well.
    const foreignOrigin = await request(port, {
      path: NEW_FOLLOW_UP_STREAM,
      headers: browserHeaders("https://evil.example"),
      body: FOLLOW_UP_BODY,
    });
    assert.equal(foreignOrigin.status, 403);
    assert.match(foreignOrigin.body, /Ristdomeeni otsingupäring ei ole lubatud/u);
    assert.equal(foreignOrigin.headers["x-accel-buffering"], undefined);
  });

  await t.test("an inappropriate content type is refused before the route runs", async () => {
    const wrongType = await request(port, {
      path: NEW_FOLLOW_UP_STREAM,
      headers: { "Content-Type": "text/plain", Origin: origin, "Sec-Fetch-Site": "same-origin" },
      body: "root_query=metsateatis",
    });
    assert.equal(wrongType.status, 415, `expected 415, got ${wrongType.status}: ${wrongType.body.slice(0, 240)}`);
    assert.match(wrongType.body, /Päring peab kasutama JSON-vormingut/u);
    assert.equal(wrongType.headers["x-accel-buffering"], undefined);

    const control = await request(port, {
      path: "/api/search/results",
      headers: { "Content-Type": "text/plain", Origin: origin, "Sec-Fetch-Site": "same-origin" },
      body: "q=metsateatis",
    });
    assert.equal(control.status, wrongType.status);
  });

  await t.test("a same-origin JSON request still streams a results event", async () => {
    const accepted = await request(port, {
      path: NEW_FOLLOW_UP_STREAM,
      headers: browserHeaders(origin),
      body: FOLLOW_UP_BODY,
    });
    assert.equal(accepted.status, 200, `a same-origin follow-up must be served, got ${accepted.status}: ${accepted.body.slice(0, 240)}`);
    assert.match(String(accepted.headers["content-type"] || ""), /application\/x-ndjson/u);
    const firstEvent = accepted.body.split("\n").find((line) => line.trim());
    assert.match(String(firstEvent), /"type":"results"/u, "the ordinary listing is the first event");
    assert.equal(
      accepted.headers["x-accel-buffering"],
      "no",
      "the accepted request must have reached the streaming route",
    );
  });

  await t.test("the new route shares the search rate limit", async () => {
    // Cheap rejected queries count against the same search budget, so the
    // budget can be exhausted without touching retrieval or the model.
    let exhausted = null;
    for (let index = 0; index < 25 && exhausted === null; index += 1) {
      const response = await request(port, {
        path: "/api/search",
        headers: browserHeaders(origin),
        body: JSON.stringify({}),
      });
      if (response.status === 429) exhausted = response;
      else assert.equal(response.status, 400, `unexpected search status ${response.status}: ${response.body.slice(0, 160)}`);
    }
    assert.ok(exhausted, "the search budget must run out within 25 requests");
    assert.equal(exhausted.headers["retry-after"], "60");

    const viaNewRoute = await request(port, {
      path: NEW_FOLLOW_UP_STREAM,
      headers: browserHeaders(origin),
      body: FOLLOW_UP_BODY,
    });
    assert.equal(
      viaNewRoute.status,
      429,
      `the follow-up stream must share the search budget, got ${viaNewRoute.status}: ${viaNewRoute.body.slice(0, 240)}`,
    );
    assert.match(viaNewRoute.body, /Liiga palju päringuid/u);
    assert.equal(viaNewRoute.headers["retry-after"], "60");
  });
});

test("RATE_LIMIT_WINDOWS_ENABLED=false turns off the public request windows", { timeout: 120_000 }, async (t) => {
  const { port, origin } = await startRouteServer(t, { RATE_LIMIT_WINDOWS_ENABLED: "false" });

  await t.test("25 same-origin empty search requests all reach validation", async () => {
    // The default-on test above spends a 20 request search window on this same
    // cheap request. With the switch off the budget must never run out.
    for (let index = 1; index <= 25; index += 1) {
      const response = await request(port, {
        path: "/api/search",
        headers: browserHeaders(origin),
        body: JSON.stringify({}),
      });
      assert.equal(
        response.status,
        400,
        `search request ${index} must reach validation with the windows off, got ${response.status}: ${response.body.slice(0, 160)}`,
      );
      assert.equal(response.headers["retry-after"], undefined);
    }
  });

  await t.test("35 empty terrapoint lookups all reach validation", async () => {
    // The terrapoint window allows 30 requests. A lookup without a query is
    // refused by the route itself before any upstream call is made.
    for (let index = 1; index <= 35; index += 1) {
      const response = await request(port, {
        path: "/api/terrapoint/address",
        method: "GET",
        headers: { Origin: origin, "Sec-Fetch-Site": "same-origin" },
      });
      assert.equal(
        response.status,
        400,
        `terrapoint lookup ${index} must reach validation with the windows off, got ${response.status}: ${response.body.slice(0, 160)}`,
      );
      assert.match(response.body, /Sisesta aadress või kohanimi/u);
    }
  });
});
