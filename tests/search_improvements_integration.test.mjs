import assert from "node:assert/strict";
import test from "node:test";
import { observeSourcePolicy } from "../server/source_policy.mjs";
import { projectSourceCacheCopy } from "../server/source-registry.mjs";

import { validateGroundedAnswer } from "../server/llm_answer_validation.mjs";
import { officialServiceCatalogueDocuments } from "../server/search_catalogue.mjs";
import { attachEvidenceExcerpts } from "../server/search_answer_evidence.mjs";
import { createPortalDraft, searchEnvironmentLive } from "../server/pipeline.mjs";
import { prepareSearchAnswerCacheResponse } from "../server/search_cache_stage.mjs";
import { publicResponse } from "../server/search_public_response.mjs";
import { publicSearchListing } from "../server/retrieval_listing.mjs";
import { parseSearchPagination } from "../server/search_route_input.mjs";
import { finalizeFollowUpResult } from "../server/search_followup_result.mjs";
import {
  CURRENT_WEATHER_OBSERVATIONS_XML_URL,
  composeCurrentWeatherObservationResponse,
  currentWeatherObservationFromXml,
} from "../server/indicators.mjs";

const DEFAULT_FILTERS = { source: "all", category: "", year: null, sort: "relevance" };
const DEFINITION_TEXT = "Lageraie on uuendusraie, mille korral raiutakse langilt korraga põhiliselt kõik puud, välja arvatud säilikpuud. See kirjeldab raieviisi, mitte konkreetse kinnistu raieluba.";
const PERMISSION_TEXT = "Lageraie on lubatud üksnes juhul, kui kasvukoht ja muud seaduse tingimused seda lubavad.";
const CLEARCUT_LAW_TEXT = "(1) Lageraie korral raiutakse raielangilt ühe aasta jooksul raie algusest arvates kõik puud, välja arvatud: 1) seemnepuudeks jäetavad 20–70 hajali või mõnepuuliste gruppidena paiknevat mändi, arukaske, saart, tamme, sangleppa, künnapuud või jalakat ühe hektari kohta ja elujõuline järelkasv; 3) säilikpuud ehk elustiku mitmekesisuse tagamiseks vajalikud puud või nende säilinud püstiseisvad osad tüvepuidu kogumahuga vähemalt viis tihumeetrit ühe hektari kohta, üle viie hektari suurusel raielangil vähemalt kümme tihumeetrit ühe hektari kohta. (4) Lageraie on lubatud puistus, mis vastab vähemalt ühele järgmistest tingimustest: 1) puistu koosseisu põhjal kaalutud esimese rinde keskmine vanus on võrdne puistu koosseisu põhjal kaalutud esimese rinde raievanusega või sellest suurem; 2) puistu on saavutanud käesoleva paragrahvi lõike 6 punkti 1 alusel kehtestatud keskmise rinnasdiameetri; 3) puistu rinnaspindala või täius on väiksem käesoleva paragrahvi lõike 6 punkti 2 alusel kehtestatust.";
const FOREST_LAW_TEXT = "(1) Mets on ökosüsteem, mis koosneb metsamaast, sellel kasvavast taimestikust ja seal elunevast loomastikust. (2) Metsamaa on maa, mis vastab vähemalt ühele järgmistest nõuetest: 1) on metsamaa kõlvikuna kantud maakatastrisse; 2) on maatükk pindalaga vähemalt 0,1 hektarit, millel kasvavad puittaimed kõrgusega vähemalt 1,3 meetrit ja puuvõrade liitusega vähemalt 30 protsenti. (3) Metsamaaks käesoleva seaduse tähenduses ei loeta õuemaad, elamumaad, pargi, kalmistu, haljasala, marja- ja viljapuuaia, puukooli, aiandi, dendraariumi ning puu- ja põõsaistandike maad.";

function officialSource(id, title, content, path, extra = {}) {
  return {
    id,
    title,
    organization: "Keskkonnaamet",
    type: "Ametlik metsanduse teave",
    published: "2025",
    url: `https://keskkonnaamet.ee${path}`,
    sourceTier: "official",
    retrieval: "reviewed-official-source",
    evidencePolicy: "claim-specific",
    _answerEvidenceEligible: true,
    summary: content,
    content,
    ...extra,
  };
}

const definitionSource = officialSource(
  "clearcut-definition-fixture",
  "Metsaseadus § 29",
  CLEARCUT_LAW_TEXT,
  "/akt/MS#para29",
  { organization: "Riigi Teataja", url: "https://www.riigiteataja.ee/akt/MS#para29" },
);
const answerSource = officialSource(
  "clearcut-answer-fixture",
  "Lageraie mõiste",
  DEFINITION_TEXT,
  "/metsandus/lageraie-moiste",
);
const permissionSource = officialSource(
  "clearcut-permission-fixture",
  "Metsaseaduse lageraie tingimused",
  PERMISSION_TEXT,
  "/metsandus/lageraie-tingimused",
  { _focusedLawTerm: "lageraie", _lawDefinition: PERMISSION_TEXT },
);
const conditionsLawSource = officialSource(
  "clearcut-conditions-law-fixture",
  "Metsaseadus § 29",
  CLEARCUT_LAW_TEXT,
  "/akt/MS#para29",
  { organization: "Riigi Teataja", url: "https://www.riigiteataja.ee/akt/MS#para29" },
);
const noticeGuidanceSource = officialSource(
  "forest-notice-guidance",
  "Lageraie ja metsateatis",
  "Metsateatis esitatakse kavandatavate raiete kohta, välja arvatud valgustusraie, ning metsaregistrisse kandmata oluliste metsakahjustuste kohta. Esitamise sammud Metsaregistris: (1) Ava metsaregister. (2) Logi sisse ID-kaardi, Mobiil-ID või Smart-IDga. (3) Vali oma kinnistu. (4) Täida metsateatise vorm ja esita see. Keskkonnaamet vaatab teatise läbi 15 tööpäeva jooksul; kui vaja kooskõlastust või ekspertiisi, võib menetlus kesta kuni 30 tööpäeva. Töödega võib alustada 10 päeva pärast raiet lubavat otsust ning raie tuleb teha 24 kuu jooksul metsateatise metsaregistris registreerimisest. Keskkonnaameti kehtiva juhise järgi võib metsaomanik metsateatist esitamata raiuda kuni 20 tihumeetrit puitu kinnisasja kohta aastas. Konkreetse kinnistu inventeerimisandmete, eraldiste ja teatiste vaatamiseks tuleb kasutada riiklikku Metsaregistrit ehk Metsaportaali. Alates 1. juulist 2024 tuleb uuendusraie ja raadamise iga metsateatise läbivaatamise eest tasuda 30 eurot riigilõivu; muud raietüübid ei ole selle juhise järgi tasulised. Teatise esitamine, menetlemine või raiet lubav otsus ei tõenda, et raie on looduses juba tehtud.",
  "/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister",
);

const forestLawSource = officialSource(
  "forest-criteria-fixture",
  "Metsaseadus § 3",
  FOREST_LAW_TEXT,
  "/akt/MS#para3",
  { organization: "Riigi Teataja", url: "https://www.riigiteataja.ee/akt/MS#para3" },
);
const NOARCHIVE_HASH = "c".repeat(64);
const POLICY_OBSERVED_AT = new Date(Date.now() - 60 * 60 * 1_000).toISOString();

function noarchiveSource(source) {
  const url = new URL(source.url);
  const policy = observeSourcePolicy({
    requestedUrl: source.url,
    finalUrl: source.url,
    observedAt: POLICY_OBSERVED_AT,
    contentKind: "fetched-html",
    bodyHash: NOARCHIVE_HASH,
    artifactHash: NOARCHIVE_HASH,
    robotsObservation: {
      status: "allowed",
      origin: url.origin,
      checkedAt: POLICY_OBSERVED_AT,
    },
    html: `<main><p>${source.content}</p></main><meta name="robots" content="noarchive">`,
  });
  return { ...source, _sourcePolicy: policy, _contentHash: NOARCHIVE_HASH };
}
const CACHEABLE_HASH = "d".repeat(64);

function cacheableObservedSource(source) {
  const url = new URL(source.url);
  const policy = observeSourcePolicy({
    requestedUrl: source.url,
    finalUrl: source.url,
    observedAt: POLICY_OBSERVED_AT,
    contentKind: "fetched-html",
    bodyHash: CACHEABLE_HASH,
    artifactHash: CACHEABLE_HASH,
    robotsObservation: {
      status: "allowed",
      origin: url.origin,
      checkedAt: POLICY_OBSERVED_AT,
    },
    html: `<main><p>${source.content}</p></main>`,
  });
  return { ...source, _sourcePolicy: policy, _contentHash: CACHEABLE_HASH };
}
const pageTwoSource = officialSource(
  "clearcut-page-two-fixture",
  "Raieviiside juhis",
  "Raieliigi kirjeldus ja ametlik juhis.",
  "/metsandus/raieviisid",
);
const MODEL_QUERY = "Kui suur osa metsadest on kaitse all?";
const MODEL_CONTEXT = "ETAK on kaardiandmestik, mille maa on jaotatud kõlvikuteks. ETAKi metsamaa ei vasta Eesti metsa definitsioonile.";
const MODEL_SOURCE = officialServiceCatalogueDocuments().find((source) => source.id === "protected-forest-share");
assert.ok(MODEL_SOURCE);

function listing({
  page = 1,
  filters = DEFAULT_FILTERS,
  queryRevision = "corpus-r1",
  windowId = "window-r1",
  items,
  evidenceCandidates,
} = {}) {
  return {
    total: 97,
    totalRelation: "gte",
    truncated: true,
    page,
    pageSize: 12,
    pageCount: 2,
    hasMore: page === 1,
    queryRevision,
    windowId,
    updatedAt: "2026-11-13T12:00:00.000Z",
    appliedFilters: filters,
    facets: { sources: [], categories: [], years: [] },
    items: items ?? (page === 1 ? [answerSource] : [pageTwoSource]),
    evidenceCandidates: evidenceCandidates ?? [answerSource],
  };
}

function answerText(answer) {
  return [answer?.intro, ...(answer?.parts || []).map((part) => part?.text)].filter(Boolean).join(" ");
}

function actualUsage() {
  return {
    status: "actual",
    requests: 1,
    input_tokens: 120,
    cached_input_tokens: 32,
    reasoning_tokens: 10,
    output_tokens: 30,
    total_tokens: 160,
    cost_estimate: {
      amount: 0.0002,
      currency: "USD",
      rate_provenance: "test_rate_card_v1",
      status: "estimated",
    },
    provider_secret: "PRIVATE_PROVIDER_SECRET",
    base_url: "https://private.example",
  };
}

function generatedAnswer(usageTelemetry = actualUsage()) {
  return async (query, draft, { evidencePack }) => {
    const validated = validateGroundedAnswer({
      intro: draft.answer.intro,
      intro_citations: [1],
      parts: [
        ...(draft.answer.parts || []).map((part) => ({
          title: part.title,
          text: part.text,
          citations: part.citations,
        })),
        { title: "Metsamaa määratlus", text: MODEL_CONTEXT, citations: [1] },
      ],
    }, draft, query, evidencePack);
    return {
      answer: validated.answer,
      acceptedClaims: validated.acceptedClaims,
      attempt: {
        provider: "test-provider",
        status: validated.answer ? "ready" : "degraded",
        reason: validated.rejectionReason || "none",
      },
      usage_telemetry: usageTelemetry,
    };
  };
}

async function runSearch({
  query = "Mis on lageraie?",
  page = 1,
  filters = DEFAULT_FILTERS,
  queryRevision = "corpus-r1",
  windowId = "window-r1",
  items,
  evidenceCandidates,
  readCache,
  recordSearch = async () => ({ status: "disabled" }),
  generateAnswer = generatedAnswer(),
  useCache = true,
} = {}) {
  const startedAt = Date.now();
  const searchResults = listing({ page, filters, queryRevision, windowId, items, evidenceCandidates });
  const result = await searchEnvironmentLive(query, {
    startedAt,
    deadlineAt: startedAt + 5_000,
    searchResults,
    filters,
    useCache,
    ...(readCache ? { readCache } : {}),
    recordSearch,
    generateAnswer,
  });
  return { result, searchResults };
}

function runModelSearch(options = {}) {
  return runSearch({
    query: MODEL_QUERY,
    items: options.page === 2 ? [pageTwoSource] : [MODEL_SOURCE],
    evidenceCandidates: [MODEL_SOURCE],
    ...options,
  });
}

test("definition and criteria templates do not use a focused permission paragraph", async () => {
  for (const [query, format] of [
    ["Mis on lageraie?", "definition"],
    ["Mida loetakse lageraieks?", "criteria"],
    ["Mida loetakse lageraiks?", "criteria"],
  ]) {
    const conceptListing = {
      ...listing(),
      items: [permissionSource, definitionSource],
      evidenceCandidates: [permissionSource, definitionSource],
    };
    const draft = await createPortalDraft(query, {
      deadlineAt: Date.now() + 1_000,
      searchResults: conceptListing,
    });
    assert.equal(draft.answer.format, format, query);
    assert.equal(publicResponse(draft).answer.format, format, query);
    assert.equal(draft.sources.some((source) => source.id === permissionSource.id), false, query);
    assert.doesNotMatch(answerText(draft.answer), /Lageraie on lubatud/u, query);
    const liveResult = await searchEnvironmentLive(query, {
      startedAt: Date.now(),
      deadlineAt: Date.now() + 5_000,
      searchResults: conceptListing,
      filters: DEFAULT_FILTERS,
      useCache: false,
      generateAnswer: async () => assert.fail("reviewed law templates must not be replaced by model output"),
    });
    const liveResponse = liveResult;
    assert.equal(liveResponse.answer.format, format, query);
    assert.equal(liveResponse.sources.some((source) => source.id === permissionSource.id), false, query);
    assert.doesNotMatch(answerText(liveResponse.answer), /Lageraie on lubatud/u, query);
    assert.equal(liveResponse.usage_telemetry.status, "deterministic_zero", query);
  }
});
test("conditions template survives the full search response path", async () => {
  const conditionsListing = {
    ...listing(),
    items: [conditionsLawSource, noticeGuidanceSource],
    evidenceCandidates: [conditionsLawSource, noticeGuidanceSource],
  };
  const conditions = await searchEnvironmentLive("Millal on lageraie lubatud?", {
    startedAt: Date.now(),
    deadlineAt: Date.now() + 5_000,
    searchResults: conditionsListing,
    filters: DEFAULT_FILTERS,
    useCache: false,
    generateAnswer: async () => assert.fail("reviewed conditions must not be replaced by model output"),
  });
  const response = conditions;
  assert.equal(response.answer.format, "conditions");
  assert.match(answerText(response.answer), /Töödega võib alustada 10 päeva pärast raiet lubavat otsust/u);
  assert.match(answerText(response.answer), /24 kuu jooksul metsateatise metsaregistris registreerimisest/u);
  assert.match(answerText(response.answer), /vanus/u);
  assert.equal(response.usage_telemetry.status, "deterministic_zero");
  assert.ok(response.sources.some((source) => source.id === noticeGuidanceSource.id));
  assert.equal(conditions.answer.format, "conditions");
  assert.match(answerText(conditions.answer), /10 päeva/u);
  assert.match(answerText(conditions.answer), /vanus/u);
  assert.equal(conditions.sources.some((source) => source.id === permissionSource.id), false);
});

test("forest definition noun phrase returns the cited ecosystem definition", async () => {
  const query = "metsa definitsioon";
  const searchResults = {
    ...listing(),
    items: [forestLawSource],
    evidenceCandidates: [forestLawSource],
  };
  const response = await searchEnvironmentLive(query, {
    startedAt: Date.now(),
    deadlineAt: Date.now() + 5_000,
    searchResults,
    filters: DEFAULT_FILTERS,
    useCache: false,
    generateAnswer: async () => assert.fail("the cited law defines the forest"),
  });
  assert.match(answerText(response.answer), /Mets on ökosüsteem[\s\S]*metsamaast[\s\S]*taimestikust[\s\S]*loomastikust/u);
  assert.ok(response.sources.some((source) => source.url === forestLawSource.url));
  assert.ok(response.answer.introCitations.some((citation) => response.sources.some((source) => source.citation === citation && source.url === forestLawSource.url)));
});

test("forest criteria template survives witness finalization and the public response", async () => {
  const query = "Mida loetakse metsaks?";
  const searchResults = {
    ...listing(),
    items: [forestLawSource],
    evidenceCandidates: [forestLawSource],
  };
  const result = await searchEnvironmentLive(query, {
    startedAt: Date.now(),
    deadlineAt: Date.now() + 5_000,
    searchResults,
    filters: DEFAULT_FILTERS,
    useCache: false,
    generateAnswer: async () => assert.fail("reviewed forest criteria must not be replaced by model output"),
  });
  const response = result;

  assert.equal(response.answer.format, "criteria");
  assert.match(answerText(response.answer), /0,1 hektarit/u);
  assert.match(answerText(response.answer), /Metsamaaks käesoleva seaduse tähenduses ei loeta/u);
  assert.deepEqual(response.sources.map((source) => source.id), [forestLawSource.id]);
  assert.equal(response.usage_telemetry.status, "deterministic_zero");
});

test("numbered notice instructions survive evidence finalization and public response", async () => {
  const query = "Kuidas esitada metsateatist?";
  const searchResults = {
    ...listing(),
    items: [noticeGuidanceSource],
    evidenceCandidates: [noticeGuidanceSource],
  };
  const result = await searchEnvironmentLive(query, {
    startedAt: Date.now(),
    deadlineAt: Date.now() + 5_000,
    searchResults,
    filters: DEFAULT_FILTERS,
    useCache: false,
    generateAnswer: async () => assert.fail("reviewed notice instructions must not be replaced by model output"),
  });
  const response = result;

  assert.equal(response.answer.format, "procedure");
  assert.match(answerText(response.answer), /Logi sisse ID-kaardi, Mobiil-ID või Smart-IDga\./u);
  assert.ok(response.sources.some((source) => source.id === noticeGuidanceSource.id));
  assert.equal(response.usage_telemetry.status, "deterministic_zero");
});

test("notice review duration survives the public answer path with its official citation", async () => {
  const searchResults = {
    ...listing(),
    items: [noticeGuidanceSource],
    evidenceCandidates: [noticeGuidanceSource],
  };
  for (const question of [
    "Kui kaua metsateatist menetletakse?",
    "Kui kaua menetlus kestab? Kuidas esitada metsateatist?",
  ]) {
    let modelRequests = 0;
    const response = await searchEnvironmentLive(question, {
      startedAt: Date.now(),
      deadlineAt: Date.now() + 5_000,
      searchResults,
      filters: DEFAULT_FILTERS,
      useCache: false,
      generateAnswer: async () => {
        modelRequests += 1;
        throw new Error("Reviewed processing time must not need model generation");
      },
    });
    assert.equal(modelRequests, 0, question);
    assert.equal(response.usage_telemetry.status, "deterministic_zero", question);
    const text = answerText(response.answer);
    assert.notEqual(response.answer.eyebrow, "Vastust ei leitud", question);
    assert.match(text, /15 tööpäeva/u, question);
    assert.match(text, /kuni 30 tööpäeva/u, question);
    assert.doesNotMatch(text, /Ava metsaregister|24 kuu/u, question);
    const citations = [...(response.answer.introCitations || []), ...response.answer.parts.flatMap((part) => part.citations || [])];
    assert.ok(response.sources.some((source) => source.url === noticeGuidanceSource.url && citations.includes(source.citation)), question);
  }
});

test("current weather answer survives structured search and public response", async () => {
  const now = Date.now();
  const query = "Mis on praegune temperatuur Tallinnas?";
  const timestamp = Math.floor((now - 60_000) / 1_000);
  const xml = `<observations timestamp="${timestamp}"><station>
    <name>Tallinn-Harku</name><longitude>24.6029</longitude><latitude>59.3981</latitude>
    <precipitations>0</precipitations><airpressure>1008.4</airpressure>
    <relativehumidity>85</relativehumidity><airtemperature>14.2</airtemperature>
    <windspeed>2.5</windspeed><windspeedmax>4.1</windspeedmax>
  </station></observations>`;
  const [source] = currentWeatherObservationFromXml(query, xml, { now });
  assert.ok(source);

  const result = await searchEnvironmentLive(query, {
    startedAt: now,
    deadlineAt: now + 1_000,
    searchResults: { total: 1, items: [source] },
    filters: DEFAULT_FILTERS,
    useCache: false,
    generateAnswer: async () => assert.fail("structured weather evidence must not be replaced by model output"),
  });
  const response = result;

  assert.equal(response.answer.title, "Tallinn: õhutemperatuur 14,2 °C");
  assert.match(response.answer.intro, /Tallinn-Harku[\s\S]*14,2 °C/u);
  assert.deepEqual(response.answer.introCitations, [1]);
  assert.equal(response.sources.length, 1);
  assert.equal(response.sources[0].url, CURRENT_WEATHER_OBSERVATIONS_XML_URL);
  assert.match(response.sources[0].evidenceExcerpt, /Tallinn-Harku/u);
  assert.equal(response.usage_telemetry.status, "deterministic_zero");
});

test("current weather queries bypass a cached older station reading", async () => {
  const now = Date.now();
  const query = "Mis on praegune temperatuur Tallinnas?";
  const sourceAt = (observedAt, temperature) => {
    const timestamp = Math.floor(observedAt / 1_000);
    const xml = `<observations timestamp="${timestamp}"><station>
      <name>Tallinn-Harku</name><longitude>24.6029</longitude><latitude>59.3981</latitude>
      <precipitations>0</precipitations><airpressure>1008.4</airpressure>
      <relativehumidity>85</relativehumidity><airtemperature>${temperature}</airtemperature>
      <windspeed>2.5</windspeed><windspeedmax>4.1</windspeedmax>
    </station></observations>`;
    return currentWeatherObservationFromXml(query, xml, { now })[0];
  };
  const currentSource = sourceAt(now - 60_000, "14.2");
  const cachedSource = sourceAt(now - 5 * 60_000, "8.1");
  const cachedResponse = composeCurrentWeatherObservationResponse(query, [cachedSource], { now, total: 1 });
  assert.ok(cachedResponse);
  let cacheReads = 0;

  const result = await searchEnvironmentLive(query, {
    startedAt: now,
    deadlineAt: now + 5_000,
    searchResults: {
      total: 1,
      items: [currentSource],
      queryRevision: "weather-cache-r1",
      windowId: "weather-cache-w1",
    },
    filters: DEFAULT_FILTERS,
    useCache: true,
    readCache: async () => {
      cacheReads += 1;
      return cachedResponse;
    },
    recordSearch: async () => ({ status: "disabled" }),
    generateAnswer: async () => assert.fail("structured weather evidence must not be replaced by model output"),
  });

  assert.equal(cacheReads, 0);
  assert.equal(result.answer.title, "Tallinn: õhutemperatuur 14,2 °C");
  assert.equal(result.usage_telemetry.status, "deterministic_zero");
});

test("a reviewed metsateatis guide gives all four deterministic filing steps", async () => {
  const source = officialServiceCatalogueDocuments().find((document) => document.id === "forest-notice-guidance");
  assert.ok(source);
  assert.equal(source.organization, "Keskkonnaamet");
  assert.match(source.url, /\/metsateatis-ja-metsaregister$/u);
  assert.match(source.content, /\(1\) Ava metsaregister\.[\s\S]*\(4\) Täida metsateatise vorm ja esita see\./u);
  const query = "Kuidas esitada metsateatist?";
  let modelCalls = 0;
  const result = await searchEnvironmentLive(query, {
    startedAt: Date.now(),
    deadlineAt: Date.now() + 5_000,
    searchResults: listing({ items: [source], evidenceCandidates: [source] }),
    filters: DEFAULT_FILTERS,
    useCache: false,
    recordSearch: async () => ({ status: "disabled" }),
    generateAnswer: async () => {
      modelCalls += 1;
      assert.fail("the reviewed four step procedure must not call the model");
    },
  });

  assert.equal(result.answer.format, "procedure");
  assert.deepEqual(result.answer.parts.map((part) => part.step), [1, 2, 3, 4]);
  assert.deepEqual(result.answer.parts.map((part) => part.text), [
    "Ava metsaregister.",
    "Logi sisse ID-kaardi, Mobiil-ID või Smart-IDga.",
    "Vali oma kinnistu.",
    "Täida metsateatise vorm ja esita see.",
  ]);
  for (const part of result.answer.parts) {
    assert.deepEqual(part.citations, [1]);
  }
  assert.equal(modelCalls, 0);
});

test("page two reuses the answer from the same ranked window with zero new model use", async () => {
  const cache = new Map();
  let modelRequests = 0;
  const readCache = async (_query, revision) => cache.get(revision) || null;
  const recordSearch = async (record) => {
    if (record.cacheResponse) cache.set(record.revision, structuredClone(record.cacheValue));
    return { status: "ready" };
  };
  const generateAnswer = async (...args) => {
    modelRequests += 1;
    return generatedAnswer()(...args);
  };

  const first = await runModelSearch({ readCache, recordSearch, generateAnswer });
  const second = await runModelSearch({
    page: 2,
    readCache,
    recordSearch,
    generateAnswer,
    queryRevision: first.searchResults.queryRevision,
    windowId: first.searchResults.windowId,
  });

  assert.equal(modelRequests, 1);
  assert.equal(second.result.answer.intro, first.result.answer.intro);
  assert.deepEqual(second.result.answer.parts, first.result.answer.parts);
  assert.deepEqual(second.result.usage_telemetry, {
    status: "cache_hit",
    requests: 0,
    input_tokens: 0,
    cached_input_tokens: 0,
    reasoning_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_estimate: { amount: 0, currency: null, rate_provenance: null, status: "zero_new_work" },
  });
  const firstListing = publicSearchListing(first.searchResults);
  const secondListing = publicSearchListing(second.searchResults);
  assert.equal(secondListing.windowId, firstListing.windowId);
  assert.equal(secondListing.queryRevision, firstListing.queryRevision);
  assert.equal(firstListing.hasMore, true);
  assert.deepEqual(
    (({ totalRelation, truncated, queryRevision, windowId, pageSize, pageCount, hasMore }) => ({
      totalRelation, truncated, queryRevision, windowId, pageSize, pageCount, hasMore,
    }))(secondListing),
    {
      totalRelation: "gte",
      truncated: true,
      queryRevision: "corpus-r1",
      windowId: "window-r1",
      pageSize: 12,
      pageCount: 2,
      hasMore: false,
    },
  );
  assert.deepEqual(second.result.sources.map((source) => source.id), first.result.sources.map((source) => source.id));
  assert.equal(second.result.answer.eyebrow, first.result.answer.eyebrow);
  assert.notEqual(second.result.answer.eyebrow, "Allikas ei ole enam avaldatav");
  assert.doesNotMatch(JSON.stringify(second.result), /_sourcePolicy|_answerEvidenceEligible|evidencePolicy/u);
});
test("cache keeps the excerpt for a new model citation from the final admitted source", () => {
  const query = "Kuidas metsa uuendatakse pärast lageraiet?";
  const renewalText = "Pärast lageraiet võib metsa uuendada istutamise või loodusliku uuenemise teel.";
  const modelSource = cacheableObservedSource(officialSource(
    "clearcut-renewal-cache-fixture",
    "Metsa uuendamine pärast lageraiet",
    renewalText,
    "/metsandus/metsa-uuendamine",
  ));
  const deterministicSources = [
    { ...answerSource, citation: 1 },
    { ...modelSource, citation: 2 },
  ];
  const deterministicDraft = {
    query,
    answer: {
      eyebrow: "Allikapõhine kokkuvõte",
      title: "Lageraie",
      intro: DEFINITION_TEXT,
      introCitations: [1],
      parts: [],
      note: "",
    },
    sources: deterministicSources,
  };
  const modelDraft = {
    ...deterministicDraft,
    answer: {
      ...deterministicDraft.answer,
      intro: renewalText,
      introCitations: [2],
    },
  };
  const finalDraft = attachEvidenceExcerpts(modelDraft, query, {
    entries: [{ citation: 2, content: renewalText }],
  });
  const published = publicResponse(finalDraft);

  assert.deepEqual(deterministicDraft.answer.introCitations, [1]);
  assert.deepEqual(modelDraft.answer.introCitations, [2]);
  assert.equal(published.sources.length, 1);
  assert.equal(published.sources[0].id, modelSource.id);
  assert.equal(published.sources[0].evidenceExcerpt, renewalText);
  assert.equal(prepareSearchAnswerCacheResponse(published, deterministicSources), null);

  const cacheResponse = prepareSearchAnswerCacheResponse(published, finalDraft.sources);
  assert.equal(cacheResponse.sources[0].evidenceExcerpt, renewalText);
});
test("cache skips a cited excerpt when its permitted retention copy clips the witness", () => {
  const requiredExcerpt = "W".repeat(3_000);
  const source = cacheableObservedSource(officialSource(
    "clipped-cache-witness-fixture",
    "Metsa uuendamise tõend",
    requiredExcerpt,
    "/metsandus/uuendamise-toend",
    { summary: "S".repeat(2_500) },
  ));
  const privateSource = { ...source, citation: 1, evidenceExcerpt: requiredExcerpt };
  const response = {
    answer: { intro: requiredExcerpt, introCitations: [1], parts: [] },
    sources: [{
      id: source.id,
      title: source.title,
      organization: source.organization,
      type: source.type,
      published: source.published,
      url: source.url,
      sourceTier: source.sourceTier,
      retrieval: source.retrieval,
      evidencePolicy: source.evidencePolicy,
      _answerEvidenceEligible: source._answerEvidenceEligible,
      citation: 1,
      evidenceExcerpt: requiredExcerpt,
    }],
  };
  const projection = projectSourceCacheCopy(privateSource);

  assert.equal(projection.permitted, true);
  assert.ok(projection.fields.evidenceExcerpt.length < requiredExcerpt.length);
  assert.equal(prepareSearchAnswerCacheResponse(response, [privateSource]), null);
});


test("a noarchive law template is served but not retained in the local answer cache", async () => {
  const lawSource = noarchiveSource(officialSource(
    "clearcut-noarchive-law-fixture",
    "Metsaseadus § 29",
    CLEARCUT_LAW_TEXT,
    "/akt/MS#para29",
    { organization: "Riigi Teataja", url: "https://www.riigiteataja.ee/akt/MS#para29" },
  ));
  let persistenceCalls = 0;
  const run = async (page) => {
    const startedAt = Date.now();
    return searchEnvironmentLive("Mis on lageraie?", {
      startedAt,
      deadlineAt: startedAt + 5_000,
      searchResults: {
        ...listing({ page, queryRevision: "noarchive-r1", windowId: "noarchive-w1" }),
        items: page === 1 ? [lawSource] : [pageTwoSource],
        evidenceCandidates: [lawSource],
      },
      filters: DEFAULT_FILTERS,
      readCache: async () => null,
      recordSearch: async () => {
        persistenceCalls += 1;
        return { status: "disabled" };
      },
      generateAnswer: async () => assert.fail("the reviewed law template must not call the model"),
    });
  };
  const first = await run(1);
  const second = await run(2);
  assert.equal(first.answer.format, "definition");
  assert.equal(second.answer.format, "definition");
  assert.equal(persistenceCalls, 2);
});

test("filter changes do not reuse a cached answer", async () => {
  const cache = new Map();
  let modelRequests = 0;
  const readCache = async (_query, revision) => cache.get(revision) || null;
  const recordSearch = async (record) => {
    if (record.cacheResponse) cache.set(record.revision, structuredClone(record.cacheValue));
    return { status: "ready" };
  };
  const generateAnswer = async (...args) => {
    modelRequests += 1;
    return generatedAnswer()(...args);
  };

  await runModelSearch({
    windowId: "filters-w1",
    readCache,
    recordSearch,
    generateAnswer,
  });
  const officialFilters = { ...DEFAULT_FILTERS, source: "official" };
  const filtered = await runModelSearch({
    filters: officialFilters,
    queryRevision: "filters-r1",
    windowId: "filters-w1",
    readCache,
    recordSearch,
    generateAnswer,
  });

  assert.ok(filtered.result.answer.parts.some((part) => part.text === MODEL_CONTEXT));
  assert.equal(modelRequests, 2);
});

test("query revision changes do not reuse a cached answer", async () => {
  const cache = new Map();
  let modelRequests = 0;
  const readCache = async (_query, revision) => cache.get(revision) || null;
  const recordSearch = async (record) => {
    if (record.cacheResponse) cache.set(record.revision, structuredClone(record.cacheValue));
    return { status: "ready" };
  };
  const generateAnswer = async (...args) => {
    modelRequests += 1;
    return generatedAnswer()(...args);
  };

  await runModelSearch({
    queryRevision: "corpus-r1",
    windowId: "revision-w1",
    readCache,
    recordSearch,
    generateAnswer,
  });
  const refreshed = await runModelSearch({
    queryRevision: "corpus-r2",
    windowId: "revision-w1",
    readCache,
    recordSearch,
    generateAnswer,
  });

  assert.ok(refreshed.result.answer.parts.some((part) => part.text === MODEL_CONTEXT));
  assert.equal(modelRequests, 2);
});

test("actual, unknown, and deterministic usage stay distinct and do not expose provider secrets", async () => {
  const actual = await runModelSearch({
    windowId: "usage-w1",
    useCache: false,
  });
  assert.equal(actual.result.usage_telemetry.status, "actual");
  assert.equal(actual.result.usage_telemetry.input_tokens, 120);
  assert.equal(actual.result.usage_telemetry.cached_input_tokens, 32);
  assert.equal(actual.result.usage_telemetry.requests, 1);
  assert.equal(actual.result.usage_telemetry.reasoning_tokens, 10);
  assert.equal(actual.result.usage_telemetry.output_tokens, 30);
  assert.equal(actual.result.usage_telemetry.total_tokens, 160);
  assert.deepEqual(actual.result.usage_telemetry.cost_estimate, {
    amount: 0.0002,
    currency: "USD",
    rate_provenance: "test_rate_card_v1",
    status: "estimated",
  });
  assert.doesNotMatch(JSON.stringify(actual.result.usage_telemetry), /PRIVATE_PROVIDER_SECRET|private\.example/u);
  assert.doesNotMatch(JSON.stringify(actual.result), /PRIVATE_PROVIDER_SECRET|private\.example/u);

  const unknown = await runModelSearch({
    windowId: "usage-w1",
    useCache: false,
    generateAnswer: async () => ({
      answer: null,
      acceptedClaims: [],
      attempt: { provider: "test-provider", status: "degraded", reason: "provider-error" },
      usage_telemetry: {
        status: "unknown",
        requests: 1,
        input_tokens: null,
        cached_input_tokens: null,
        reasoning_tokens: null,
        output_tokens: null,
        total_tokens: null,
        cost_estimate: { amount: null, currency: null, rate_provenance: null, status: "unavailable" },
      },
    }),
  });
  assert.deepEqual(unknown.result.usage_telemetry, {
    status: "unknown",
    requests: 1,
    input_tokens: null,
    cached_input_tokens: null,
    reasoning_tokens: null,
    output_tokens: null,
    total_tokens: null,
    cost_estimate: { amount: null, currency: null, rate_provenance: null, status: "unavailable" },
  });

  const deterministic = await searchEnvironmentLive("Mis on lageraie?", {
    searchResults: { items: [], evidenceCandidates: [], total: 0 },
    useCache: false,
    generateAnswer: () => assert.fail("no model request is allowed without evidence"),
    recordSearch: async () => ({ status: "disabled" }),
  });
  assert.deepEqual(deterministic.usage_telemetry, {
    status: "deterministic_zero",
    requests: 0,
    input_tokens: 0,
    cached_input_tokens: 0,
    reasoning_tokens: 0,
    output_tokens: 0,
    total_tokens: 0,
    cost_estimate: { amount: 0, currency: null, rate_provenance: null, status: "zero_new_work" },
  });
});

test("expired window state survives the public answer envelope", () => {
  const response = publicResponse({
    query: "Mis on lageraie?",
    answer: {
      eyebrow: "Otsingu tulemus",
      title: "Lageraie",
      intro: "Otsinguaken aegus.",
      introCitations: [],
      parts: [],
      note: "",
    },
    sources: [],
    searchResults: {
      total: 0,
      page: 2,
      pageSize: 12,
      pageCount: 0,
      hasMore: false,
      totalRelation: "gte",
      truncated: true,
      windowExpired: true,
      items: [],
    },
  });
  assert.equal(response.searchResults.windowExpired, true);
  assert.deepEqual(response.searchResults.items, []);
  assert.equal(response.searchResults.total, 0);
  assert.equal(response.searchResults.totalRelation, "gte");
  assert.equal(response.searchResults.truncated, true);
  assert.equal(response.searchResults.pageCount, 0);
  assert.equal(response.searchResults.hasMore, false);
  assert.equal(response.searchResults.windowId, undefined);
});

test("results route parser keeps page size twelve and accepts only its bounded window id", () => {
  assert.deepEqual(parseSearchPagination({ body: { page: 2, window_id: "window_r1" }, query: {} }, { includeWindowId: true }), {
    ok: true,
    page: 2,
    pageSize: 12,
    windowId: "window_r1",
  });
  assert.equal(parseSearchPagination({ body: { window_id: "bad value" }, query: {} }, { includeWindowId: true }).ok, false);
  assert.equal(parseSearchPagination({ body: { page: 1, window_id: "window_r1" }, query: {} }, { includeWindowId: true }).ok, false);
  assert.deepEqual(parseSearchPagination({ body: { page: 2, window_id: "window_r1" }, query: {} }), {
    ok: true,
    page: 2,
    pageSize: 12,
  });
});

test("a follow-up answer that does not answer the asked question is replaced by a no-answer card", () => {
  const response = finalizeFollowUpResult({
    question: "Kuidas taotleda metsateatist?",
    result: {
      answer: {
        title: "Metsainfo hetkeseis",
        intro: "Töölehtedel on ülevaade metsainventeerimisandmetest.",
        introCitations: [1],
        parts: [],
      },
      sources: [{
        citation: 1,
        evidenceExcerpt: "Töölehtedel on ülevaade metsainventeerimisandmetest.",
      }],
    },
    listing: publicSearchListing(listing()),
  });
  assert.equal(response.answer.eyebrow, "Vastust ei leitud");
  assert.equal(response.answer.introCitations.length, 0);
});

test("a rejected repeated follow-up keeps safe usage but not the rejected answer", () => {
  const rejectedText = "Lageraie. Rejected answer that must not reach the public replacement.";
  const telemetry = {
    status: "actual",
    requests: 1,
    input_tokens: 120,
    cached_input_tokens: 32,
    reasoning_tokens: 10,
    output_tokens: 30,
    total_tokens: 160,
    cost_estimate: {
      amount: 0.0002,
      currency: "USD",
      rate_provenance: "test_rate_card_v1",
      status: "estimated",
    },
  };
  const response = finalizeFollowUpResult({
    question: "Mis on lageraie?",
    previousAnswers: [rejectedText],
    result: {
      answer: { title: "Lageraie", intro: rejectedText, introCitations: [], parts: [] },
      sources: [],
      usage_telemetry: telemetry,
    },
    listing: publicSearchListing(listing()),
  });
  assert.deepEqual(response.usage_telemetry, telemetry);
  assert.equal(response.sources.length, 0);
  assert.notEqual(response.answer.intro, rejectedText);
  assert.doesNotMatch(JSON.stringify(response), /Rejected answer that must not reach the public replacement/u);
});
test("malformed actual counters become unknown after a repeated answer is rejected", () => {
  const rejectedText = "Lageraie. Repeated answer with malformed usage counters.";
  const malformedUsage = [
    { ...actualUsage(), requests: "1" },
    { ...actualUsage(), input_tokens: "120" },
    { ...actualUsage(), cached_input_tokens: -1 },
    { ...actualUsage(), reasoning_tokens: 10.5 },
    { ...actualUsage(), output_tokens: Number.MAX_SAFE_INTEGER + 1 },
    { ...actualUsage(), total_tokens: 160.5 },
  ];

  for (const usage_telemetry of malformedUsage) {
    const response = finalizeFollowUpResult({
      question: "Mis on lageraie?",
      previousAnswers: [rejectedText],
      result: {
        answer: { title: "Lageraie", intro: rejectedText, introCitations: [], parts: [] },
        sources: [],
        usage_telemetry,
      },
      listing: publicSearchListing(listing()),
    });

    assert.equal(response.usage_telemetry.status, "unknown");
    assert.equal(response.usage_telemetry.input_tokens, null);
    assert.equal(response.usage_telemetry.total_tokens, null);
    assert.equal(response.usage_telemetry.cost_estimate.status, "unavailable");
    assert.notEqual(response.answer.intro, rejectedText);
    assert.doesNotMatch(JSON.stringify(response), /Repeated answer with malformed usage counters/u);
  }
});

