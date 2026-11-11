import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { DEFAULT_SEARCH_FILTERS } from "../src/search_request.js";
import {
  REVIEWED_FORESTRY_SEARCH_SUGGESTIONS,
  REVIEWED_SEARCH_SUGGESTIONS,
  suggestionsForValue,
} from "../src/search-suggestions.js";

// Suggested questions must follow the question the reader is looking at, on the
// search page and in the chat panel, instead of standing in as generic filler.
// The reader sees these strings, so the tests drive the real components and
// assert what is rendered: which buttons exist, which wording they carry, and
// that an unrelated question yields fewer or none of them.
//
// No DOM implementation exists in this repository and none is added for a test,
// so the renderer below supplies React's hook dispatcher and calls the
// components directly (the same approach tests/search_job_ui.test.mjs uses).
// Each expectation is computed from the same shared selector the pages call, so
// the tests pin the wiring and the user-visible guarantees, not the ranking
// internals.

const VIRTUAL_JOBS = "\0praktika-fake-search-jobs";

const FORESTRY = REVIEWED_FORESTRY_SEARCH_SUGGESTIONS;
const REVIEWED = REVIEWED_SEARCH_SUGGESTIONS;
// The three questions the broad-results empty state used to advertise. None of
// them is a reviewed suggestion, so an empty topic must never bring them back.
const RETIRED_EMPTY_STATE = [
  "Kuhu viia vanad patareid?",
  "Mis on roheline energia?",
  "Kas tohib looduses telkida?",
];

function fakeSearchJobs() {
  return {
    name: "praktika-fake-search-jobs",
    enforce: "pre",
    resolveId(source) {
      return source === "./search_jobs.js" || source.endsWith("/search_jobs.js") ? VIRTUAL_JOBS : null;
    },
    load(id) {
      if (id !== VIRTUAL_JOBS) return null;
      return 'export function readSearchJob(options) { return globalThis.__praktikaSearchJobs.run(options); }';
    },
  };
}

// The pages debounce the autocomplete request with window.setTimeout, so the
// stub records the callbacks instead of dropping them: a test can prove that
// rendering suggestions from page context sends nothing, and that typing still
// sends exactly the request the field always sent.
function installBrowserGlobals() {
  const timers = [];
  const document = {
    title: "",
    activeElement: null,
    body: { classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } } },
    addEventListener() {},
    removeEventListener() {},
    getElementById() {
      return null;
    },
    querySelector() {
      return null;
    },
  };
  const window = {
    document,
    location: { pathname: "/", search: "", href: "http://localhost/" },
    history: {
      state: null,
      pushState(state) {
        this.state = state;
      },
      replaceState(state) {
        this.state = state;
      },
    },
    addEventListener() {},
    removeEventListener() {},
    dispatchEvent() {
      return false;
    },
    scrollTo() {},
    matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }),
    requestAnimationFrame: (callback) => {
      callback(0);
      return 0;
    },
    cancelAnimationFrame() {},
    setInterval: () => 0,
    clearInterval() {},
    setTimeout: (callback) => {
      timers.push(callback);
      return timers.length;
    },
    clearTimeout() {},
  };
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = document;
  return {
    timers,
    flushTimers() {
      const queued = timers.splice(0, timers.length);
      queued.forEach((callback) => callback());
    },
    release() {
      if (previous.window === undefined) delete globalThis.window;
      else globalThis.window = previous.window;
      if (previous.document === undefined) delete globalThis.document;
      else globalThis.document = previous.document;
    },
  };
}

// Every autocomplete request goes through one POST. The stub counts them and
// answers with no remote items, so a test can tell a suggestion list built from
// page context apart from one built by the network.
function installFetchCounter() {
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    if (options.signal?.aborted) {
      const error = new Error("Päring katkestati.");
      error.name = "AbortError";
      throw error;
    }
    calls.push({ url: String(url), body: options.body ? JSON.parse(options.body) : null });
    return {
      ok: true,
      status: 200,
      headers: { get: () => null },
      async json() {
        return { suggestions: [] };
      },
    };
  };
  return calls;
}

function createJobTransport() {
  const calls = [];
  const behaviours = [];
  return {
    calls,
    queue(behaviour) {
      behaviours.push(behaviour);
    },
    async run(options) {
      calls.push({ kind: options.kind, payload: options.payload, signal: options.signal });
      options.onResponse?.({ status: 200, ok: true, headers: { get: () => null } });
      const behaviour = behaviours.shift();
      if (!behaviour) throw new Error(`unexpected ${options.kind} job`);
      await behaviour(options);
    },
  };
}

function settle() {
  return (async () => {
    for (let tick = 0; tick < 4; tick += 1) await new Promise((resolve) => setImmediate(resolve));
  })();
}

function sameDeps(previous, next) {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((value, index) => Object.is(value, next[index]));
}

function createRenderer(reactInternals) {
  const stores = new Map();
  const storeFor = (component) => {
    if (!stores.has(component)) stores.set(component, { slots: [], cursor: 0, queued: [], invalidated: false });
    return stores.get(component);
  };

  const runtimeFor = (store) => {
    const nextIndex = () => {
      const index = store.cursor;
      store.cursor += 1;
      return index;
    };
    const slot = (create) => {
      const index = nextIndex();
      if (store.slots[index] === undefined) store.slots[index] = create();
      return store.slots[index];
    };
    const useState = (initial) => {
      const entry = slot(() => ({ kind: "state", value: typeof initial === "function" ? initial() : initial }));
      return [entry.value, (update) => {
        const value = typeof update === "function" ? update(entry.value) : update;
        if (Object.is(value, entry.value)) return;
        entry.value = value;
        store.invalidated = true;
      }];
    };
    const useMemo = (factory, deps) => {
      const index = nextIndex();
      const previous = store.slots[index];
      const nextDeps = Array.isArray(deps) ? deps.slice() : null;
      if (previous && previous.kind === "memo" && sameDeps(previous.deps, nextDeps)) return previous.value;
      const value = factory();
      store.slots[index] = { kind: "memo", deps: nextDeps, value };
      return value;
    };
    const useEffect = (effect, deps) => {
      const index = nextIndex();
      const previous = store.slots[index];
      const nextDeps = Array.isArray(deps) ? deps.slice() : undefined;
      const record = previous && previous.kind === "effect"
        ? previous
        : { kind: "effect", deps: undefined, cleanup: undefined };
      const changed = !previous
        || previous.kind !== "effect"
        || nextDeps === undefined
        || !sameDeps(record.deps, nextDeps);
      record.deps = nextDeps;
      store.slots[index] = record;
      if (changed) store.queued.push({ record, effect });
    };
    return {
      useState,
      useReducer(reducer, initialArg, init) {
        const entry = slot(() => ({ kind: "state", value: init ? init(initialArg) : initialArg }));
        return [entry.value, (action) => {
          const value = reducer(entry.value, action);
          if (Object.is(value, entry.value)) return;
          entry.value = value;
          store.invalidated = true;
        }];
      },
      useRef(initial) {
        return slot(() => ({ kind: "ref", value: { current: initial } })).value;
      },
      useEffect,
      useLayoutEffect: useEffect,
      useInsertionEffect: useEffect,
      useMemo,
      useCallback(callback, deps) {
        return useMemo(() => callback, deps);
      },
      useId() {
        return slot(() => ({ kind: "id", value: ":praktika:" })).value;
      },
      useContext(context) {
        return context && typeof context === "object" ? context._currentValue : undefined;
      },
      useSyncExternalStore(subscribe, getSnapshot) {
        return getSnapshot();
      },
      useDeferredValue(value) {
        return value;
      },
      useTransition() {
        return [false, (action) => action()];
      },
      useImperativeHandle() {},
      useDebugValue() {},
    };
  };

  const paint = (store, component, props) => {
    store.cursor = 0;
    store.queued = [];
    store.invalidated = false;
    const previous = reactInternals.H;
    reactInternals.H = runtimeFor(store);
    let tree;
    try {
      tree = component(props);
    } finally {
      reactInternals.H = previous;
    }
    const queued = store.queued;
    store.queued = [];
    for (const { record, effect } of queued) {
      if (typeof record.cleanup === "function") record.cleanup();
      const cleanup = effect();
      record.cleanup = typeof cleanup === "function" ? cleanup : undefined;
    }
    return tree;
  };

  return {
    render(component, props) {
      const store = storeFor(component);
      let tree = paint(store, component, props);
      for (let pass = 0; pass < 8 && store.invalidated; pass += 1) tree = paint(store, component, props);
      return tree;
    },
  };
}

function elementsOf(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => elementsOf(child, found));
    return found;
  }
  if (!node || typeof node !== "object") return found;
  if ("type" in node && "props" in node) {
    found.push(node);
    elementsOf(node.props?.children, found);
  }
  return found;
}

function find(node, predicate) {
  const match = elementsOf(node).find(predicate);
  assert.ok(match, "the expected element is part of the rendered tree");
  return match;
}

function textOf(node) {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map((child) => textOf(child)).join(" ");
  if (node && typeof node === "object" && "props" in node) return textOf(node.props?.children);
  return "";
}

function buttonsIn(node) {
  return elementsOf(node)
    .filter((element) => element.type === "button")
    .map((element) => textOf(element).replace(/\s+/gu, " ").trim());
}

function listingOf(items = []) {
  return { items, total: items.length, page: 1, pageSize: 12, appliedFilters: DEFAULT_SEARCH_FILTERS };
}

const ONE_SOURCE = [{
  id: "mets",
  title: "Metsandus",
  url: "https://keskkonnaportaal.ee/et/mets",
  sourceTier: "official",
}];

function answerOf(title, query, related = []) {
  return {
    ...(query ? { query } : {}),
    ...(related.length ? { related } : {}),
    answer: {
      eyebrow: "AI koondvastus",
      title,
      intro: "Registri andmetel on metsamaa pindala muutunud.",
      introCitations: [],
      parts: [],
    },
    sources: [{
      citation: 1,
      id: "metsandus",
      title: "Metsandus",
      url: "https://keskkonnaportaal.ee/et/mets",
      organization: "Keskkonnaportaal",
      type: "Teemaleht",
      sourceTier: "official",
    }],
  };
}

function emits(...events) {
  return ({ onEvent }) => {
    events.forEach((event) => onEvent(event));
  };
}

let vite;
let reactInternals;
let browser;

before(async () => {
  browser = installBrowserGlobals();
  vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    plugins: [fakeSearchJobs()],
    ssr: { external: ["react"] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  let react;
  try {
    react = await vite.ssrLoadModule("react");
  } catch {
    react = await import("react");
  }
  const exported = react.default && react.default.useState ? react.default : react;
  reactInternals = exported.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
    || exported.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  assert.ok(reactInternals && "H" in reactInternals, "React exposes the hook dispatcher slot this renderer drives");
});

after(async () => {
  await vite?.close();
  browser?.release();
});

let selectorPromise = null;

async function loadSelector() {
  if (!selectorPromise) {
    selectorPromise = (async () => {
      let module;
      try {
        module = await vite.ssrLoadModule("/src/suggestion_context.js");
      } catch (error) {
        assert.fail(`src/suggestion_context.js must exist and load: ${error.message}`);
      }
      assert.equal(typeof module.contextualSuggestions, "function",
        "src/suggestion_context.js must export contextualSuggestions");
      return module.contextualSuggestions;
    })();
  }
  return selectorPromise;
}

async function loadPages() {
  const app = await vite.ssrLoadModule("/src/App.jsx");
  const chatbot = await vite.ssrLoadModule("/src/Chatbot.jsx");
  return { App: app.App, Chatbot: chatbot.default };
}

function chatProps(pageContext) {
  return {
    answerParts: {
      AnswerNote: () => null,
      Citation: () => null,
      SourceActions: () => null,
      SourceLegend: () => null,
      ExternalAnchor: ({ children }) => children,
    },
    answerTextOf: (item) => [item?.answer?.title, item?.answer?.intro].filter(Boolean).join(" "),
    pageContext,
  };
}

function openChat(renderer, Chatbot, props) {
  find(renderer.render(Chatbot, props), (element) => element.props?.["aria-label"] === "Ava vestlus").props.onClick();
  return renderer.render(Chatbot, props);
}

function sendChat(renderer, Chatbot, props, question) {
  const opened = renderer.render(Chatbot, props);
  find(opened, (element) => element.props?.id === "chatbot-input").props.onChange({ target: { value: question } });
  const typed = renderer.render(Chatbot, props);
  find(typed, (element) => element.props?.className === "chatbot__form").props.onSubmit({ preventDefault() {} });
}

function chatExampleGroup(tree) {
  return elementsOf(tree).find((element) => element.props?.className === "chatbot__examples") || null;
}

function chatExampleQuestions(tree) {
  const group = chatExampleGroup(tree);
  return group ? buttonsIn(group) : [];
}

// One entry per answered chat turn: the follow-up chips that answer offers.
function chatTurnChips(renderer, tree) {
  return elementsOf(tree)
    .filter((element) => element.props?.parts !== undefined && "atFollowUpLimit" in element.props)
    .map((element) => {
      const answerTree = renderer.render(element.type, element.props);
      const group = elementsOf(answerTree).find((child) => child.props?.className === "chatbot__related");
      return group ? buttonsIn(group) : [];
    });
}

function askMoreQuestions(renderer, tree) {
  const section = elementsOf(tree).find((element) => element.props?.className === "related-section");
  return section ? buttonsIn(section) : null;
}

function resultsSearchForm(renderer, tree) {
  const form = find(tree, (element) => element.props?.variant === "results"
    && typeof element.props?.onSearch === "function");
  return { element: form, tree: renderer.render(form.type, form.props) };
}

function broadResultsTree(renderer, tree) {
  const section = find(tree, (element) => element.props?.headingRef !== undefined
    && typeof element.props?.onPage === "function"
    && typeof element.props?.onFilters === "function");
  return renderer.render(section.type, section.props);
}

function searchOptionLabels(tree) {
  const listbox = elementsOf(tree).find((element) => element.props?.role === "listbox");
  if (!listbox) return [];
  return elementsOf(listbox)
    .filter((element) => element.props?.role === "option")
    .map((option) => {
      const label = elementsOf(option).find((element) => element.type === "span");
      return label ? textOf(label).replace(/\s+/gu, " ").trim() : "";
    });
}

function comboboxInput(tree) {
  return find(tree, (element) => element.props?.role === "combobox");
}

async function searchPageFixture(query, related = [], items = ONE_SOURCE) {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  const { App } = await loadPages();
  const renderer = createRenderer(reactInternals);
  const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;
  transport.queue(emits(
    { type: "results", searchResults: listingOf(items) },
    { type: "answer", result: answerOf("Metsateatis", query, related) },
  ));
  await startSearch(query);
  const element = find(renderer.render(App, {}), (child) => typeof child.props?.onHome === "function");
  return { App, SearchResults: element.type, props: element.props, renderer, transport };
}

test("the chat panel keeps reviewed forestry defaults when the page carries no question", async () => {
  const selector = await loadSelector();
  const { Chatbot } = await loadPages();
  const renderer = createRenderer(reactInternals);
  const tree = openChat(renderer, Chatbot, chatProps(undefined));
  const shown = chatExampleQuestions(tree);
  const expected = selector({ candidates: FORESTRY, limit: 3, allowDefault: true });

  assert.deepEqual(shown, expected, "the empty page shows the reviewed default questions");
  assert.equal(shown.length, 3, "the panel still offers three starting questions");
  assert.ok(shown.every((question) => FORESTRY.includes(question)),
    "a suggested question is always one of the reviewed forestry questions");

  const group = chatExampleGroup(tree);
  assert.equal(group.props.role, "group", "the example buttons keep their grouped announcement");
  assert.equal(group.props["aria-label"], "Näidisküsimused");
});

test("the chat panel follows the visible search question and stays inside forestry", async () => {
  const selector = await loadSelector();
  const { Chatbot } = await loadPages();
  const renderer = createRenderer(reactInternals);
  const shown = chatExampleQuestions(openChat(renderer, Chatbot, chatProps({ query: "metsateatis" })));
  const expected = selector({
    candidates: FORESTRY,
    query: "metsateatis",
    rootQuery: "metsateatis",
    limit: 3,
    allowDefault: false,
  });

  assert.deepEqual(shown, expected);
  assert.ok(shown.length > 0, "a forestry question on screen produces forestry follow-ups");
  assert.ok(shown.some((question) => /teatis/iu.test(question)),
    "at least one offered question is about the question on screen");
  assert.ok(shown.every((question) => FORESTRY.includes(question)),
    "the chat never offers a question outside the reviewed forestry set");
});

test("an unrelated page question leaves the chat panel without filler questions", async () => {
  const selector = await loadSelector();
  const { Chatbot } = await loadPages();
  const renderer = createRenderer(reactInternals);
  const pageQuery = "Kuhu viia vanad patareid?";
  const tree = openChat(renderer, Chatbot, chatProps({ query: pageQuery }));
  const shown = chatExampleQuestions(tree);
  const expected = selector({
    candidates: FORESTRY,
    query: pageQuery,
    rootQuery: pageQuery,
    limit: 3,
    allowDefault: false,
  });

  assert.deepEqual(shown, expected);
  assert.equal(shown.length, 0, "no reviewed forestry question fits a waste question, so none is suggested");
  assert.equal(chatExampleGroup(tree), null, "an empty example group is not rendered at all");
  assert.ok(shown.every((question) => !RETIRED_EMPTY_STATE.includes(question)));
});

test("a chat answer suggests follow-ups for its own question and never repeats an asked one", async () => {
  const selector = await loadSelector();
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { Chatbot } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const props = chatProps(undefined);
    openChat(renderer, Chatbot, props);

    const rootQuestion = "Mis on metsateatis?";
    const rootRelated = [
      "Kuidas taotleda metsateatist?",
      "Kust leida põhjavee seireandmeid?",
      rootQuestion,
    ];
    transport.queue(emits(
      { type: "results", searchResults: listingOf(ONE_SOURCE) },
      { type: "answer", result: answerOf("Metsateatis", rootQuestion, rootRelated) },
    ));
    sendChat(renderer, Chatbot, props, rootQuestion);
    await settle();
    const answered = renderer.render(Chatbot, props);
    const [rootChips] = chatTurnChips(renderer, answered);

    assert.deepEqual(rootChips, selector({
      candidates: rootRelated,
      query: rootQuestion,
      rootQuery: rootQuestion,
      priorQuestions: [rootQuestion],
      limit: 3,
      allowDefault: false,
    }));
    assert.ok(!rootChips.includes(rootQuestion), "the question already on screen is not offered back");
    assert.ok(rootChips.every((question) => !/põhjavee/iu.test(question)),
      "an unrelated water question is dropped instead of padding the list");
    assert.ok(rootChips.length > 0, "a related follow-up survives the filter");
    assert.ok(rootChips.every((question) => rootRelated.includes(question)),
      "a chat follow-up is always one the server already reviewed for this answer");

    // A pronoun follow-up carries no topic of its own: the root question must
    // still decide what can be asked next.
    const followUp = "Mida see minu jaoks tähendab?";
    const followUpRelated = [
      rootQuestion,
      "Kuidas taotleda metsateatist?",
      "Kust leida põhjavee seireandmeid?",
    ];
    transport.queue(emits(
      { type: "results", searchResults: listingOf(ONE_SOURCE) },
      {
        type: "answer",
        result: {
          ...answerOf("Metsateatis tähendab raieluba"),
          related: followUpRelated,
          answer: { title: "Metsateatis tähendab raieluba", intro: "See on teatis.", parts: [] },
        },
      },
    ));
    sendChat(renderer, Chatbot, props, followUp);
    await settle();
    const followed = renderer.render(Chatbot, props);
    const chips = chatTurnChips(renderer, followed);
    assert.equal(chips.length, 2, "each answered turn keeps its own follow-up chips");

    assert.deepEqual(chips[0], selector({
      candidates: rootRelated,
      query: rootQuestion,
      rootQuery: rootQuestion,
      priorQuestions: [rootQuestion, followUp],
      limit: 3,
      allowDefault: false,
    }), "an older answer never re-offers a question the thread has since asked");
    for (const asked of [rootQuestion, followUp]) {
      assert.ok(chips.every((turnChips) => !turnChips.includes(asked)),
        `a question already asked in this thread is not offered again: ${asked}`);
    }
    assert.deepEqual(chips[1], selector({
      candidates: followUpRelated,
      query: followUp,
      rootQuery: rootQuestion,
      priorQuestions: [rootQuestion, followUp],
      limit: 3,
      allowDefault: false,
    }));
    assert.ok(chips[0].every((question) => !/põhjavee/iu.test(question)));
    assert.ok(chips[0].length > 0, "the root answer keeps a related follow-up");
    assert.ok(!chips[1].includes(rootQuestion), "the earlier question is not suggested again");
    assert.ok(!chips[1].includes(followUp), "the pronoun follow-up itself is not suggested");
    assert.ok(chips[1].every((question) => !/põhjavee/iu.test(question)));
    assert.ok(chips[1].length > 0, "the root topic survives a pronoun follow-up");
    assert.ok(chips[1].every((question) => followUpRelated.includes(question)));
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("the search page's Küsi veel section follows the latest follow-up and drops repeated questions", async () => {
  const selector = await loadSelector();
  const query = "Mis on metsateatis?";
  const related = [
    "Mis on metsateatis?",
    "Kuidas taotleda metsateatist?",
    "Kust leida põhjavee seireandmeid?",
  ];
  try {
    const fixture = await searchPageFixture(query, related);
    const { SearchResults, props, renderer } = fixture;
    const expected = selector({
      candidates: related,
      query,
      rootQuery: query,
      priorQuestions: [],
      filters: DEFAULT_SEARCH_FILTERS,
      limit: 12,
      allowDefault: false,
    });
    const shown = askMoreQuestions(renderer, renderer.render(SearchResults, props)) ?? [];

    assert.deepEqual(shown, expected);
    assert.ok(shown.length > 0, "the section still offers the related questions the answer reviewed");
    assert.ok(shown.every((question) => related.includes(question)),
      "Küsi veel shows only questions reviewed for this answer");
    assert.ok(!shown.includes("Mis on metsateatis?"), "the question already answered is not offered back");
    assert.ok(shown.every((question) => !/põhjavee/iu.test(question)),
      "an unrelated water question is not offered for a forestry answer");

    const askFollowUp = (question) => {
      const tree = renderer.render(SearchResults, props);
      find(tree, (element) => element.props?.id === "answer-followup-input").props.onChange({ target: { value: question } });
      const withValue = renderer.render(SearchResults, props);
      find(withValue, (element) => element.props?.className === "followup-form").props.onSubmit({ preventDefault() {} });
    };
    const followUp = "Kuidas taotleda metsateatist?";
    fixture.transport.queue(emits(
      { type: "results", searchResults: listingOf(ONE_SOURCE) },
      {
        type: "answer",
        result: {
          ...answerOf("Metsateatise taotlemine"),
          related: [followUp, "Kui suur osa Eestist on kaetud metsaga?"],
          answer: { title: "Metsateatise taotlemine", intro: "Taotlus esitatakse metsaregistris.", parts: [] },
        },
      },
    ));
    askFollowUp(followUp);
    await settle();
    const afterTree = renderer.render(SearchResults, props);
    const afterExpected = selector({
      candidates: related,
      query: followUp,
      rootQuery: query,
      priorQuestions: [followUp],
      filters: DEFAULT_SEARCH_FILTERS,
      limit: 12,
      allowDefault: false,
    });
    const afterSection = askMoreQuestions(renderer, afterTree);
    const afterFollowUp = afterSection ?? [];

    assert.ok(!afterFollowUp.includes(followUp), "the follow-up just asked is not offered again");
    assert.deepEqual(afterFollowUp, afterExpected);
    if (!afterExpected.length) {
      assert.equal(afterSection, null, "an empty selection hides the row instead of padding it");
    }
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("the results-page search field suggests what relates to the page instead of the generic list", async () => {
  const selector = await loadSelector();
  const fetchCalls = installFetchCounter();
  const query = "metsateatis";
  try {
    const fixture = await searchPageFixture(query, ["Kuidas taotleda metsateatist?"]);
    const { SearchResults, props, renderer } = fixture;

    const pageTree = renderer.render(SearchResults, props);
    const form = resultsSearchForm(renderer, pageTree);
    comboboxInput(form.tree).props.onFocus();
    const focused = resultsSearchForm(renderer, renderer.render(SearchResults, props));

    const contextualList = selector({
      candidates: REVIEWED,
      query,
      rootQuery: query,
      limit: 12,
      allowDefault: false,
    });
    const shown = searchOptionLabels(focused.tree);
    assert.deepEqual(shown, contextualList, "the field ranks the reviewed questions for this page");
    assert.ok(shown.length > 0);
    assert.ok(shown.every((question) => REVIEWED.includes(question)));
    assert.ok(shown.some((question) => /teatis/iu.test(question)));
    assert.ok(shown.every((question) => !/põhjavee|joogivee|suplusvee/iu.test(question)),
      "an unrelated water question is not suggested on a metsateatis page");
    assert.notDeepEqual(shown, suggestionsForValue("", {}, REVIEWED, 12).map((item) => item.value),
      "the results page no longer falls back to the same unranked list everywhere");
    assert.equal(fetchCalls.length, 0, "showing suggestions from page context sends nothing");

    // The listbox and its keyboard contract are unchanged.
    const input = comboboxInput(focused.tree);
    assert.equal(input.props["aria-autocomplete"], "list");
    assert.equal(input.props["aria-expanded"], true);
    const listbox = find(focused.tree, (element) => element.props?.role === "listbox");
    assert.equal(input.props["aria-controls"], listbox.props.id);
    input.props.onKeyDown({ key: "ArrowDown", preventDefault() {} });
    const active = comboboxInput(resultsSearchForm(renderer, renderer.render(SearchResults, props)).tree);
    const firstOption = elementsOf(listbox).find((element) => element.props?.role === "option");
    assert.equal(active.props["aria-activedescendant"], firstOption.props.id);
    const selected = find(resultsSearchForm(renderer, renderer.render(SearchResults, props)).tree,
      (element) => element.props?.role === "option" && element.props["aria-selected"] === true);
    assert.equal(selected.props.id, firstOption.props.id);

    // The only request is the one the field already made for its own text.
    browser.flushTimers();
    await settle();
    assert.deepEqual(fetchCalls.map((call) => call.body), [{ q: query }]);

    // Clearing the field keeps the page context; typing falls back to the
    // reviewed filter the field has always used.
    const clearedTree = resultsSearchForm(renderer, renderer.render(SearchResults, props)).tree;
    find(clearedTree, (element) => element.props?.["aria-label"] === "Tühjenda otsing").props.onClick();
    const cleared = resultsSearchForm(renderer, renderer.render(SearchResults, props));
    assert.deepEqual(searchOptionLabels(cleared.tree), selector({
      candidates: REVIEWED,
      query: "",
      rootQuery: query,
      limit: 12,
      allowDefault: false,
    }));

    comboboxInput(cleared.tree).props.onChange({ target: { value: "mets" } });
    const typed = resultsSearchForm(renderer, renderer.render(SearchResults, props));
    assert.deepEqual(searchOptionLabels(typed.tree),
      suggestionsForValue("mets", {}, REVIEWED, 12).map((item) => item.value),
      "typing still filters the reviewed questions the same way");

    browser.flushTimers();
    await settle();
    assert.deepEqual(fetchCalls.map((call) => call.body), [{ q: query }, { q: "mets" }],
      "a typed autocomplete keeps its single debounced request");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("an empty broad-results page suggests reviewed searches for its own question, never the retired examples", async () => {
  const selector = await loadSelector();
  try {
    for (const query of ["Kust leida jäätmekäitluskohti Tartus?", "Kas raiemaht ületab juurdekasvu?"]) {
      const fixture = await searchPageFixture(query, [], []);
      const { SearchResults, props, renderer } = fixture;
      const empty = broadResultsTree(renderer, renderer.render(SearchResults, props));

      // Both reviewed stores are handed in, so a forestry dead end is served as
      // well as an environmental one.
      const expected = selector({
        candidates: REVIEWED,
        query,
        rootQuery: query,
        limit: 3,
        allowDefault: false,
      });
      const paragraph = elementsOf(empty).find((element) => element.props?.className === "broad-results__suggest");
      const shown = paragraph ? buttonsIn(paragraph) : [];

      assert.deepEqual(shown, expected, query);
      assert.ok(shown.length > 0, `a question with reviewed matches still offers them: ${query}`);
      assert.ok(shown.every((question) => REVIEWED.includes(question)),
        "every offered search is a reviewed question, not invented copy");
      assert.ok(shown.every((question) => !RETIRED_EMPTY_STATE.includes(question)),
        "the retired generic examples are gone");
    }
    const forestryFixture = await searchPageFixture("Kas raiemaht ületab juurdekasvu?", [], []);
    const forestryEmpty = broadResultsTree(forestryFixture.renderer,
      forestryFixture.renderer.render(forestryFixture.SearchResults, forestryFixture.props));
    const forestryParagraph = elementsOf(forestryEmpty)
      .find((element) => element.props?.className === "broad-results__suggest");
    const forestryShown = forestryParagraph ? buttonsIn(forestryParagraph) : [];
    assert.ok(forestryShown.some((question) => FORESTRY.includes(question)),
      "a forestry dead end is never starved of forestry questions");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a personal name in the visible question never reaches a suggested question", async () => {
  const name = "Mari Maasikas";
  const { Chatbot } = await loadPages();
  const renderer = createRenderer(reactInternals);
  const chatShown = chatExampleQuestions(openChat(renderer, Chatbot, chatProps({ query: `${name} metsateatis` })));
  assert.ok(chatShown.every((question) => FORESTRY.includes(question)));
  assert.ok(chatShown.every((question) => !/maasikas|mari\b/iu.test(question)),
    "the chat never echoes the reader's name into a suggestion");

  installFetchCounter();
  try {
    const fixture = await searchPageFixture(`${name} metsateatis`);
    const { SearchResults, props, renderer: pageRenderer } = fixture;
    const form = resultsSearchForm(pageRenderer, pageRenderer.render(SearchResults, props));
    comboboxInput(form.tree).props.onFocus();
    const focused = resultsSearchForm(pageRenderer, pageRenderer.render(SearchResults, props));
    const shown = searchOptionLabels(focused.tree);
    assert.ok(shown.every((question) => REVIEWED.includes(question)),
      "the field only ever offers reviewed questions");
    assert.ok(shown.every((question) => !/maasikas|mari\b/iu.test(question)));
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});
