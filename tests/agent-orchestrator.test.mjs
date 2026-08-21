import assert from "node:assert/strict";
import test from "node:test";
import { Runner, Usage } from "@openai/agents";
import {
  ScriptedModel,
  assistantMessage,
  functionCall,
  modelError,
} from "@openai/agents/testing";
import {
  GROUNDED_AGENT_OUTPUT,
  agentOrchestrationEnabled,
  createBoundedOpenAiFetch,
  createGroundedOpenAiClient,
  createGroundedSearchAgents,
  runAgentWithUsage,
} from "../server/agent-orchestrator.mjs";
import {
  createRollingLlmBudget,
  estimatedLlmBudgetUsage,
  llmBudgetDenial,
  settleLlmReservation,
} from "../server/llm-budget.mjs";

function response(output, outputTokens) {
  return {
    output,
    usage: new Usage({
      requests: 1,
      inputTokens: 50,
      outputTokens,
      totalTokens: 50 + outputTokens,
    }),
  };
}

test("Agents SDK manager owns the answer and exposes two bounded specialists as tools", () => {
  const { manager, relevanceAgent, groundingAgent } = createGroundedSearchAgents({
    model: "gpt-5.6-luna",
    reasoningEffort: "low",
    maxTokens: 9_999,
    systemInstructions: "Kasuta ainult evidence'i.",
  });

  assert.equal(manager.name, "Keskkonnaotsingu manager");
  assert.equal(relevanceAgent.name, "Allikarelevantsuse spetsialist");
  assert.equal(groundingAgent.name, "Tõendikriitik");
  assert.deepEqual(manager.tools.map((tool) => tool.name), [
    "rank_evidence_sources",
    "audit_evidence_consistency",
  ]);
  assert.equal(manager.modelSettings.toolChoice, "rank_evidence_sources");
  assert.equal(manager.modelSettings.parallelToolCalls, false);
  assert.equal(manager.modelSettings.store, false);
  assert.equal(manager.modelSettings.maxTokens, 4_000);
  assert.match(manager.instructions, /vastutad lõpliku allikapõhise vastuse/iu);
});

test("agent orchestration is the default but retains an explicit direct escape hatch", () => {
  assert.equal(agentOrchestrationEnabled(undefined), true);
  assert.equal(agentOrchestrationEnabled("agents"), true);
  assert.equal(agentOrchestrationEnabled("direct"), false);
});

test("the SDK runner must call the relevance specialist before the manager can answer", async () => {
  const expected = {
    intro: "Otsene vastus.",
    intro_citations: [1],
    parts: [],
    related_questions: [],
  };
  const model = new ScriptedModel([
    [functionCall(
      "rank_evidence_sources",
      { input: "Küsimus ja piiratud evidence [1]." },
      { callId: "relevance-call" },
    )],
    [assistantMessage("Allikas [1] on otsene tõend.")],
    [assistantMessage(JSON.stringify(expected))],
  ]);
  const { manager } = createGroundedSearchAgents({
    systemInstructions: "Kasuta ainult evidence'i.",
  });
  const runner = new Runner({
    modelProvider: { getModel: () => model },
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
  });

  const result = await runner.run(
    manager,
    "KÜSIMUS: test\nEVIDENCE [1]: ametlik tõend",
    { maxTurns: 6 },
  );

  assert.deepEqual(result.finalOutput, expected);
  assert.equal(model.calls.length, 3);
  assert.equal(model.calls[0].request.modelSettings.toolChoice, "rank_evidence_sources");
  assert.deepEqual(model.calls[0].request.tools.map((tool) => tool.name), [
    "rank_evidence_sources",
    "audit_evidence_consistency",
  ]);
  assert.equal(model.calls[1].request.tools.length, 0);
  assert.equal(model.calls[2].request.modelSettings.toolChoice, undefined);
  model.assertComplete();
});

test("manager output schema rejects unknown fields and invalid citations", () => {
  const valid = {
    intro: "Otsene vastus.",
    intro_citations: [1],
    parts: [{ text: "Selgitus.", citations: [2] }],
    related_questions: ["Mis muutus?"],
  };
  assert.equal(GROUNDED_AGENT_OUTPUT.safeParse(valid).success, true);
  assert.equal(GROUNDED_AGENT_OUTPUT.safeParse({ ...valid, intro_citations: [0] }).success, false);
  assert.equal(GROUNDED_AGENT_OUTPUT.safeParse({ ...valid, extra: true }).success, false);
});

test("explicit RunContext aggregates manager and both specialist model calls", async () => {
  const expected = {
    intro: "Otsene vastus.",
    intro_citations: [1],
    parts: [],
    related_questions: [],
  };
  const model = new ScriptedModel([
    response([functionCall(
      "rank_evidence_sources",
      { input: "Küsimus ja evidence [1]." },
      { callId: "relevance-call" },
    )], 100),
    response([assistantMessage("Allikas [1] on otsene tõend.")], 200),
    response([functionCall(
      "audit_evidence_consistency",
      { input: "Kontrolli evidence [1]." },
      { callId: "grounding-call" },
    )], 300),
    response([assistantMessage("Arv ja aasta on allikas [1] kooskõlas.")], 400),
    response([assistantMessage(JSON.stringify(expected))], 500),
  ]);
  const { manager } = createGroundedSearchAgents();
  const runner = new Runner({
    modelProvider: { getModel: () => model },
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
  });
  let observed;

  const result = await runAgentWithUsage({
    runner,
    manager,
    userInput: "KÜSIMUS: test\nEVIDENCE [1]: ametlik tõend",
    onUsage: (usage) => {
      observed = usage;
    },
  });

  assert.deepEqual(result.output, expected);
  assert.deepEqual(result.usage, {
    requests: 5,
    inputTokens: 250,
    outputTokens: 1_500,
    totalTokens: 1_750,
  });
  assert.deepEqual(observed, result.usage);
  model.assertComplete();
});

test("an abort after completed manager and specialist responses still charges their usage", async () => {
  const abort = new Error("client disconnected");
  abort.name = "AbortError";
  const model = new ScriptedModel([
    response([functionCall(
      "rank_evidence_sources",
      { input: "Küsimus ja evidence [1]." },
      { callId: "relevance-call" },
    )], 120),
    response([assistantMessage("Allikas [1] on otsene tõend.")], 180),
    modelError(abort),
  ]);
  const { manager } = createGroundedSearchAgents();
  const runner = new Runner({
    modelProvider: { getModel: () => model },
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
  });
  const budget = createRollingLlmBudget({ requestBudget: 12, tokenBudget: 30_000 });
  const reservation = budget.reserve(estimatedLlmBudgetUsage({ orchestrated: true }));
  let observed;

  await assert.rejects(
    runAgentWithUsage({
      runner,
      manager,
      userInput: "KÜSIMUS: test\nEVIDENCE [1]: ametlik tõend",
      onUsage: (usage) => {
        observed = usage;
      },
    }),
    { name: "AbortError" },
  );

  assert.deepEqual(observed, {
    requests: 2,
    inputTokens: 100,
    outputTokens: 300,
    totalTokens: 400,
  });
  assert.equal(settleLlmReservation(reservation, observed), true);
  assert.equal(budget.snapshot().requests, 2);
  assert.equal(budget.snapshot().tokens, 400);
  assert.equal(
    budget.reserve(estimatedLlmBudgetUsage({ orchestrated: true })).reason,
    "request-budget-exhausted",
  );
});

test("an aborted scripted run does not pretend that the real provider transport dispatched", async () => {
  const model = new ScriptedModel([]);
  const { manager } = createGroundedSearchAgents();
  const runner = new Runner({
    modelProvider: { getModel: () => model },
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
  });
  const controller = new AbortController();
  controller.abort();
  const budget = createRollingLlmBudget({ requestBudget: 12, tokenBudget: 30_000 });
  const reservation = budget.reserve(estimatedLlmBudgetUsage({ orchestrated: true }));
  let observed;
  let dispatched = false;

  await assert.rejects(runAgentWithUsage({
    runner,
    manager,
    userInput: "KÜSIMUS: test\nEVIDENCE [1]: ametlik tõend",
    signal: controller.signal,
    onUsage: (usage) => {
      observed = usage;
    },
    onDispatch: () => {
      dispatched = true;
    },
  }));

  assert.deepEqual(observed, {
    requests: 0,
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  });
  assert.equal(dispatched, false);
  assert.equal(settleLlmReservation(reservation, observed, { chargeUnknown: dispatched }), true);
  assert.equal(budget.snapshot().requests, 0);
  assert.equal(budget.snapshot().tokens, 0);
});

test("Agents transport rejects redirects, bounds bodies and charges total provider usage", async () => {
  const budget = createRollingLlmBudget({ requestBudget: 10, tokenBudget: 100_000 });
  let calls = 0;
  let observedInit;
  const boundedFetch = createBoundedOpenAiFetch({
    baseUrl: "https://opencode.ai/zen/go/v1",
    fetchImpl: async (_url, init) => {
      calls += 1;
      observedInit = init;
      return new Response(JSON.stringify({
        id: "response-1",
        usage: { input_tokens: 90, output_tokens: 10, total_tokens: 100 },
      }), {
        status: 200,
        headers: { "content-type": "application/json", "x-request-id": "req-safe" },
      });
    },
    reserveProviderRequest: (usage) => budget.reserve(usage),
    settleProviderRequest: (reservation, usage, options) => settleLlmReservation(reservation, usage, options),
  });
  const response = await boundedFetch("https://opencode.ai/zen/go/v1/responses", {
    method: "POST",
    redirect: "follow",
    body: JSON.stringify({ max_output_tokens: 100, input: "bounded" }),
  });
  assert.equal(calls, 1);
  assert.equal(observedInit.redirect, "error");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("x-request-id"), "req-safe");
  assert.equal((await response.json()).id, "response-1");
  assert.equal(budget.snapshot().requests, 1);
  assert.equal(budget.snapshot().tokens, 100);
  await assert.rejects(
    boundedFetch("https://attacker.invalid/collect", {
      method: "POST",
      body: "{}",
    }),
    /approved model provider path/u,
  );
  assert.equal(calls, 1);

  const client = createGroundedOpenAiClient({
    apiKey: "test-key",
    baseUrl: "https://opencode.ai/zen/go/v1",
    fetchImpl: async () => new Response("{}", { status: 503 }),
  });
  assert.equal(client.maxRetries, 0);
  assert.equal(client.baseURL, "https://opencode.ai/zen/go/v1");
});

test("Agents transport denies before dispatch and fully charges unknown oversized responses", async () => {
  let deniedCalls = 0;
  const deniedBudget = createRollingLlmBudget({ requestBudget: 10, tokenBudget: 1_000 });
  const deniedFetch = createBoundedOpenAiFetch({
    baseUrl: "https://opencode.ai/zen/go/v1",
    fetchImpl: async () => {
      deniedCalls += 1;
      return new Response("{}");
    },
    reserveProviderRequest: (usage) => deniedBudget.reserve(usage),
    settleProviderRequest: (reservation, usage, options) => settleLlmReservation(reservation, usage, options),
  });
  await assert.rejects(deniedFetch("https://opencode.ai/zen/go/v1/responses", {
    method: "POST",
    body: JSON.stringify({ max_output_tokens: 4_000 }),
  }), (error) => error?.code === "LLM_BUDGET_EXHAUSTED");
  assert.equal(deniedCalls, 0);

  const chargedBudget = createRollingLlmBudget({ requestBudget: 10, tokenBudget: 100_000 });
  let canceled = false;
  const oversizedFetch = createBoundedOpenAiFetch({
    baseUrl: "https://opencode.ai/zen/go/v1",
    maximumResponseBytes: 8,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("123456"));
        controller.enqueue(new TextEncoder().encode("789"));
      },
      cancel() {
        canceled = true;
      },
    })),
    reserveProviderRequest: (usage) => chargedBudget.reserve(usage),
    settleProviderRequest: (reservation, usage, options) => settleLlmReservation(reservation, usage, options),
  });
  const body = JSON.stringify({ max_output_tokens: 100 });
  await assert.rejects(oversizedFetch("https://opencode.ai/zen/go/v1/responses", {
    method: "POST",
    body,
  }), /too large/u);
  assert.equal(canceled, true);
  assert.equal(chargedBudget.snapshot().requests, 1);
  assert.equal(
    chargedBudget.snapshot().tokens,
    Buffer.byteLength(body, "utf8") + 100 + 512,
  );

  let declaredCanceled = false;
  const declaredFetch = createBoundedOpenAiFetch({
    baseUrl: "https://opencode.ai/zen/go/v1",
    maximumResponseBytes: 8,
    fetchImpl: async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("ok"));
      },
      cancel() {
        declaredCanceled = true;
      },
    }), { headers: { "content-length": "99" } }),
  });
  await assert.rejects(declaredFetch("https://opencode.ai/zen/go/v1/responses", {
    method: "POST",
    body: "{}",
  }), /too large/u);
  assert.equal(declaredCanceled, true);
});

test("wrapped OpenAI connection errors preserve pre-dispatch budget denial", async () => {
  let calls = 0;
  const client = createGroundedOpenAiClient({
    apiKey: "test-key",
    baseUrl: "https://opencode.ai/zen/go/v1",
    fetchImpl: async () => {
      calls += 1;
      return new Response("{}");
    },
    reserveProviderRequest: () => ({
      ok: false,
      reason: "token-budget-exhausted",
    }),
  });
  await assert.rejects(
    client.responses.create({ model: "gpt-5.6-luna", input: "bounded" }),
    (error) => {
      assert.equal(llmBudgetDenial(error), "token-budget-exhausted");
      return true;
    },
  );
  assert.equal(calls, 0);
});

test("Agents transport full-charges output-only or zero-total usage after dispatch", async () => {
  for (const usage of [
    { output_tokens: 10 },
    { input_tokens: 0, output_tokens: 0, total_tokens: 0 },
  ]) {
    const budget = createRollingLlmBudget({ requestBudget: 10, tokenBudget: 100_000 });
    const body = JSON.stringify({ max_output_tokens: 100 });
    const boundedFetch = createBoundedOpenAiFetch({
      baseUrl: "https://opencode.ai/zen/go/v1",
      fetchImpl: async () => new Response(JSON.stringify({ usage }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
      reserveProviderRequest: (requestUsage) => budget.reserve(requestUsage),
      settleProviderRequest: (reservation, observed, options) => (
        settleLlmReservation(reservation, observed, options)
      ),
    });
    await boundedFetch("https://opencode.ai/zen/go/v1/responses", {
      method: "POST",
      body,
    });
    assert.equal(budget.snapshot().requests, 1);
    assert.equal(
      budget.snapshot().tokens,
      Buffer.byteLength(body, "utf8") + 100 + 512,
    );
  }
});

test("structured-output validation failure preserves all completed provider usage", async () => {
  const model = new ScriptedModel([
    response([functionCall(
      "rank_evidence_sources",
      { input: "Küsimus ja evidence [1]." },
      { callId: "relevance-call" },
    )], 110),
    response([assistantMessage("Allikas [1] on otsene tõend.")], 210),
    response([assistantMessage('{"intro":"puudulik"}')], 310),
  ]);
  const { manager } = createGroundedSearchAgents();
  const runner = new Runner({
    modelProvider: { getModel: () => model },
    tracingDisabled: true,
    traceIncludeSensitiveData: false,
  });
  let observed;

  await assert.rejects(runAgentWithUsage({
    runner,
    manager,
    userInput: "KÜSIMUS: test\nEVIDENCE [1]: ametlik tõend",
    onUsage: (usage) => {
      observed = usage;
    },
  }));

  assert.deepEqual(observed, {
    requests: 3,
    inputTokens: 150,
    outputTokens: 630,
    totalTokens: 780,
  });
});
