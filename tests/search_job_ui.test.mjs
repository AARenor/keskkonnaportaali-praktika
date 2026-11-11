import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { DEFAULT_SEARCH_FILTERS } from "../src/search_request.js";

// The four search flows a reader can start (search page, search page
// follow-up, chat first question, chat follow-up) must all be served by the
// process-local asynchronous job client instead of one long response. The pages
// keep their state handling, so these tests drive the real components: the real
// onClick and onSubmit handlers, the real useState updates, the real event
// mapping.
//
// No DOM implementation is available here and none is added for a test, so the
// renderer supplies React's hook dispatcher and calls the components directly.
// That keeps the assertions on consumer-visible behaviour: which transport call
// the flow makes, what it passes, and what the reader keeps on screen when the
// answer fails.

const VIRTUAL_JOBS = "\0praktika-fake-search-jobs";

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

function installBrowserGlobals() {
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
    setTimeout: () => 0,
    clearTimeout() {},
  };
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = document;
  return () => {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
  };
}

// A fake transport with a scripted per-call behaviour, so a flow can be made to
// succeed, to fail after its listing, or to stay open until it is superseded.
function createJobTransport() {
  const calls = [];
  const behaviours = [];
  return {
    calls,
    queue(behaviour) {
      behaviours.push(behaviour);
    },
    async run(options) {
      calls.push({ kind: options.kind, payload: options.payload, signal: options.signal, events: [] });
      options.onResponse?.({ status: 200, ok: true, headers: { get: () => null } });
      const behaviour = behaviours.shift();
      if (!behaviour) throw new Error(`unexpected ${options.kind} job`);
      await behaviour(options);
    },
  };
}

function jobError(code = "job_failed") {
  const error = new Error("Otsingu töö ebaõnnestus.");
  error.name = "SearchJobError";
  error.code = code;
  error.listingReady = true;
  return error;
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
    // An effect without a dependency list runs after every render, exactly as
    // React documents it; an empty list runs once.
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

function listingOf(items = [{
  id: "metsandus",
  title: "Metsandus",
  url: "https://keskkonnaportaal.ee/et/mets",
  sourceTier: "official",
  summary: "Metsanduse teemaleht koondab ametlikud metsaandmed.",
}]) {
  return { items, total: items.length, page: 1, pageSize: 12, appliedFilters: DEFAULT_SEARCH_FILTERS };
}

function answerOf(title, query) {
  return {
    ...(query ? { query } : {}),
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

function failsAfter(listing) {
  return ({ onEvent }) => {
    onEvent({ type: "results", searchResults: listing });
    throw jobError();
  };
}

function staysOpenUntilAborted() {
  return ({ signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => {
      const error = new Error("Otsing katkestati.");
      error.name = "AbortError";
      reject(error);
    }, { once: true });
  });
}

let vite;
let reactInternals;
let releaseBrowserGlobals;

before(async () => {
  releaseBrowserGlobals = installBrowserGlobals();
  vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    plugins: [fakeSearchJobs()],
    // The renderer sets React's hook dispatcher, so the pages must run on the
    // same React instance this file can reach.
    ssr: { external: ["react"] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
  // The dispatcher must come from the same React instance the pages import.
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
  releaseBrowserGlobals?.();
});

async function loadPages() {
  const app = await vite.ssrLoadModule("/src/App.jsx");
  const chatbot = await vite.ssrLoadModule("/src/Chatbot.jsx");
  return { App: app.App, Chatbot: chatbot.default };
}

test("the search page runs an asynchronous job, keeps a failed answer's listing and cancels the superseded job", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: answerOf("Metsateatis", "metsateatis") },
    ));
    await startSearch("metsateatis");
    const succeeded = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function").props;

    assert.equal(transport.calls[0].kind, "search", "the main search is a search job");
    assert.ok(transport.calls[0].signal instanceof AbortSignal, "the job is cancellable through the page's controller");
    assert.equal(succeeded.result.answer.title, "Metsateatis");
    assert.equal(succeeded.previewListing.items.length, 1);
    assert.equal(succeeded.error, "");

    // The answer fails after the listing arrived: the reader keeps the sources.
    transport.queue(failsAfter(listingOf()));
    await startSearch("metsateatis uuesti");
    const failed = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function").props;
    assert.equal(failed.error, "Koondvastuse voog katkes. Juba leitud otsingutulemused on endiselt saadaval.");
    assert.equal(failed.previewListing.items[0].title, "Metsandus");

    // A new search supersedes the running one, which is how the job is cancelled.
    transport.queue(staysOpenUntilAborted());
    const superseded = startSearch("aeglane otsing");
    const supersededSignal = transport.calls.at(-1).signal;
    transport.queue(emits({ type: "answer", result: answerOf("Kiire vastus", "kiire otsing") }));
    await startSearch("kiire otsing");
    await superseded;
    assert.equal(supersededSignal.aborted, true, "the superseded search job is aborted");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("the search page follow-up runs a follow-up job and keeps its own listing when the answer fails", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;
    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: { ...answerOf("Metsateatis", "metsateatis"), related: ["Kuidas metsa pindala muutus?"] } },
    ));
    await startSearch("metsateatis");
    const searchResults = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const SearchResults = searchResults.type;
    const searchResultsProps = searchResults.props;

    const askFollowUp = (tree, question) => {
      find(tree, (element) => element.props?.id === "answer-followup-input").props.onChange({ target: { value: question } });
      const withValue = renderer.render(SearchResults, searchResultsProps);
      find(withValue, (element) => element.props?.className === "followup-form").props.onSubmit({ preventDefault() {} });
    };

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      {
        type: "answer",
        result: {
          ...answerOf("Metsamaa pindala on kasvanud"),
          answer: { title: "Metsamaa pindala on kasvanud", intro: "Pindala kasvas viimase kümne aasta jooksul.", parts: [] },
        },
      },
    ));
    askFollowUp(renderer.render(SearchResults, searchResultsProps), "Kuidas metsa pindala muutus?");
    await settle();
    const answered = renderer.render(SearchResults, searchResultsProps);
    const followUpCall = transport.calls.at(-1);

    assert.equal(followUpCall.kind, "follow-up", "the inline follow-up is a follow-up job");
    assert.equal(followUpCall.payload.root_query, "metsateatis");
    assert.equal(followUpCall.payload.question, "Kuidas metsa pindala muutus?");
    assert.deepEqual(followUpCall.payload.previous_questions, []);
    assert.deepEqual(followUpCall.payload.previous_answers,
      ["Metsateatis Registri andmetel on metsamaa pindala muutunud."]);
    assert.equal(followUpCall.payload.filters.source, "all");
    assert.match(textOf(answered), /Metsamaa pindala on kasvanud/u);

    // The follow-up answer fails after its own listing: the sources stay.
    transport.queue(failsAfter(listingOf()));
    askFollowUp(renderer.render(SearchResults, searchResultsProps), "Mis muutus viimase viie aasta jooksul?");
    await settle();
    const failed = renderer.render(SearchResults, searchResultsProps);
    assert.match(textOf(failed), /Proovi sama küsimust uuesti/u);
    assert.match(textOf(failed), /Metsandus/u, "the follow-up listing is still readable");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("the chat panel runs a search job for its first question and a follow-up job for the next one", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { Chatbot } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const parts = {
      AnswerNote: () => null,
      Citation: () => null,
      SourceActions: () => null,
      SourceLegend: () => null,
      ExternalAnchor: ({ children }) => children,
    };
    const answerTextOf = (item) => [item?.answer?.title, item?.answer?.intro].filter(Boolean).join(" ");
    const props = { answerParts: parts, answerTextOf };
    const openPanel = (tree) => {
      find(tree, (element) => element.props?.["aria-label"] === "Ava vestlus").props.onClick();
      return renderer.render(Chatbot, props);
    };
    const send = (tree, question) => {
      find(tree, (element) => element.props?.id === "chatbot-input").props.onChange({ target: { value: question } });
      const typed = renderer.render(Chatbot, props);
      find(typed, (element) => element.props?.className === "chatbot__form").props.onSubmit({ preventDefault() {} });
    };

    const opened = openPanel(renderer.render(Chatbot, props));
    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: answerOf("Metsateatis", "kui palju metsa on Eestis") },
    ));
    send(opened, "kui palju metsa on Eestis");
    await settle();
    const first = renderer.render(Chatbot, props);
    const firstCall = transport.calls.at(-1);
    assert.equal(firstCall.kind, "search");
    assert.ok(firstCall.signal instanceof AbortSignal);
    const firstAnswer = find(first, (element) => element.props?.parts !== undefined && "atFollowUpLimit" in element.props);
    assert.equal(firstAnswer.props.result.answer.title, "Metsateatis");

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: { ...answerOf("Pindala kasvas"), answer: { title: "Pindala kasvas", intro: "Kümne aasta jooksul.", parts: [] } } },
    ));
    send(renderer.render(Chatbot, props), "mis muutus viimase viie aasta jooksul");
    await settle();
    const second = renderer.render(Chatbot, props);
    const secondCall = transport.calls.at(-1);
    assert.equal(secondCall.kind, "follow-up");
    assert.equal(secondCall.payload.root_query, "kui palju metsa on Eestis");
    assert.equal(secondCall.payload.question, "mis muutus viimase viie aasta jooksul");
    assert.deepEqual(secondCall.payload.previous_answers, ["Metsateatis Registri andmetel on metsamaa pindala muutunud."]);
    const answers = elementsOf(second)
      .filter((element) => element.props?.parts !== undefined && "atFollowUpLimit" in element.props);
    assert.equal(answers.length, 2, "both turns are rendered");
    assert.equal(answers[1].props.result.answer.title, "Pindala kasvas");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a failed chat answer keeps the sources the chat already found", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { Chatbot } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const props = { answerParts: {}, answerTextOf: () => "" };
    find(renderer.render(Chatbot, props), (element) => element.props?.["aria-label"] === "Ava vestlus").props.onClick();
    const opened = renderer.render(Chatbot, props);
    find(opened, (element) => element.props?.id === "chatbot-input").props.onChange({ target: { value: "kui palju metsa on Eestis" } });
    const typed = renderer.render(Chatbot, props);

    transport.queue(failsAfter(listingOf()));
    find(typed, (element) => element.props?.className === "chatbot__form").props.onSubmit({ preventDefault() {} });
    await settle();
    const failed = renderer.render(Chatbot, props);

    assert.match(textOf(failed), /Koondvastust ei saanud koostada\. Leitud allikad on loetletud\./u);
    const turnListing = find(failed, (element) => Array.isArray(element.props?.listing?.items) && element.props.listing.items.length > 0);
    assert.equal(turnListing.props.listing.items[0].title, "Metsandus", "the found source is still listed");
    assert.doesNotMatch(textOf(failed), /Serveriga ei saanud ühendust/u);
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});
