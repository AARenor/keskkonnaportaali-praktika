import assert from "node:assert/strict";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { DEFAULT_SEARCH_FILTERS } from "../src/search_request.js";
import { composeSearchResponse, NO_ANSWER_EYEBROW } from "../server/search_response.mjs";

const SOURCE_ONLY_EYEBROW = composeSearchResponse("mets", [{ id: "mets", title: "Mets" }], { related: [] }).answer.eyebrow;

// The two search flows a reader can start (search page and inline follow-up)
// are served by the process-local asynchronous job client instead of one long
// response. The pages keep their state handling, so these tests drive the real
// components: their real handlers, state updates and event mapping.
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
  const listeners = new Map();
  const location = { pathname: "/", search: "", href: "http://localhost/" };
  const stack = [{ state: null, url: "/" }];
  let historyIndex = 0;
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
  const updateLocation = (url) => {
    const next = new URL(url, location.href);
    location.pathname = next.pathname;
    location.search = next.search;
    location.href = next.href;
  };
  const dispatch = (event) => {
    for (const listener of listeners.get(event.type) ?? []) listener(event);
  };
  const history = {
    scrollRestoration: "auto",
    get state() {
      return stack[historyIndex].state;
    },
    pushState(state, _title, url = location.href) {
      stack.splice(historyIndex + 1);
      stack.push({ state, url });
      historyIndex = stack.length - 1;
      updateLocation(url);
    },
    replaceState(state, _title, url = location.href) {
      stack[historyIndex] = { state, url };
      updateLocation(url);
    },
    back() {
      historyIndex = Math.max(0, historyIndex - 1);
      const entry = stack[historyIndex];
      updateLocation(entry.url);
      dispatch({ type: "popstate", state: entry.state });
    },
    forward() {
      historyIndex = Math.min(stack.length - 1, historyIndex + 1);
      const entry = stack[historyIndex];
      updateLocation(entry.url);
      dispatch({ type: "popstate", state: entry.state });
    },
  };
  let scrollY = 0;
  const window = {
    document,
    location,
    history,
    get scrollY() {
      return scrollY;
    },
    addEventListener(type, listener) {
      const entries = listeners.get(type) ?? new Set();
      entries.add(listener);
      listeners.set(type, entries);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent: dispatch,
    scrollTo(position, top) {
      scrollY = typeof position === "number" ? top ?? position : position?.top ?? 0;
    },
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
  const release = () => {
    if (previous.window === undefined) delete globalThis.window;
    else globalThis.window = previous.window;
    if (previous.document === undefined) delete globalThis.document;
    else globalThis.document = previous.document;
  };
  release.reset = () => {
    stack.splice(0, stack.length, { state: null, url: "/" });
    historyIndex = 0;
    updateLocation("/");
    scrollY = 0;
    listeners.clear();
    history.scrollRestoration = "auto";
  };
  return release;
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

// The server's own fallback card: the wording is missing, the listing is not,
// and the card says why instead of pretending to be a summary.
function unavailableAnswerOf(title, query) {
  return {
    ...(query ? { query } : {}),
    searchResults: listingOf(),
    answer: {
      eyebrow: "Otsing on praegu koormatud",
      title,
      intro: "Otsing teenindab praegu mitut päringut korraga ning uut faktivastust ei koostatud. See ei tähenda, et otsitud andmeid ei ole.",
      introCitations: [],
      parts: [],
      aiUnavailable: true,
      note: "Proovi otsingut paari sekundi pärast uuesti.",
    },
    sources: [],
  };
}

// The server's own no-answer card: the sources were searched and nothing
// answered the question, so this is an answer about the sources, never a broken
// search. The listing the reader already got still leads it.

function noAnswerOf(title, query) {
  return {
    ...(query ? { query } : {}),
    searchResults: listingOf(),
    answer: {
      eyebrow: NO_ANSWER_EYEBROW,
      title,
      intro: "Meil ei ole sellele küsimusele vastust. Meie allikatest ei leidnud me selget ja usaldusväärset vastust.",
      introCitations: [],
      parts: [],
      note: "",
    },
    sources: [],
  };
}

// Some searches end with source records and no summary at all: the server's
// "Kontrollitud allikaotsing" card. It is neither a failure nor a no-answer, and
// it must not push the listing the reader received below itself.
function sourceOnlyAnswerOf(title, query) {
  return {
    ...(query ? { query } : {}),
    searchResults: listingOf(),
    answer: {
      eyebrow: SOURCE_ONLY_EYEBROW,
      title,
      intro: "Leidsin küsimusega seotud ametlikud allikad, kuid usaldusväärset koondvastust ei õnnestunud praegu koostada. Ava allikad või proovi hetke pärast uuesti.",
      introCitations: [],
      parts: [],
      note: "",
    },
    sources: [{
      citation: 1,
      id: "kaevandamine",
      title: "Kaevandamise keskkonnamõju",
      url: "https://keskkonnaportaal.ee/et/kaevandamine",
      organization: "Keskkonnaportaal",
      type: "Teemaleht",
      sourceTier: "official",
    }],
  };
}

// A supported factual answer to a yes/no question: the reviewed source
// disproves the claim, so the negative wording is an answered question and must
// keep the ordinary answer presentation.
function factualAnswerOf(title, intro, citationUrl) {
  return {
    searchResults: listingOf(),
    answer: { eyebrow: "AI koondvastus", title, intro, introCitations: [1], parts: [] },
    sources: [{
      citation: 1,
      id: "metsandus",
      title: "Metsanduse teemaleht",
      url: citationUrl,
      organization: "Keskkonnaportaal",
      type: "Teemaleht",
      sourceTier: "official",
    }],
  };
}

// A fallback card can still carry the extract the server chose: the wording is
// the source's own sentence, so its citation, note and legend belong to the
// reader even though the model wording is missing.
function extractAnswerOf(citationUrl) {
  return {
    searchResults: listingOf(),
    answer: {
      eyebrow: "Allika viidatud väljavõte",
      title: "Metsamaa pindala",
      intro: "Metsamaa pindala oli 2024. aastal 2,3 miljonit hektarit.",
      introCitations: [1],
      parts: [],
      aiUnavailable: true,
      aiUnavailableExtract: true,
      note: "Allika enda sõnastus, mitte mudeli koondvastus.",
    },
    sources: [{
      citation: 1,
      id: "metsandus",
      title: "Metsanduse teemaleht",
      url: citationUrl,
      organization: "Keskkonnaportaal",
      type: "Teemaleht",
      sourceTier: "official",
    }],
  };
}

// The stateful renderer keeps the tree; static markup is what the reader gets,
// so order and link text are asserted on the rendered HTML. Rendering an
// already-built element tree runs no effect and no handler, so the assertions
// stay on the state the controlled events produced.
function linkIn(html, url) {
  const hrefIndex = html.indexOf(`href="${url}"`);
  if (hrefIndex < 0) return null;
  const start = html.lastIndexOf("<a", hrefIndex);
  const tagEnd = html.indexOf(">", hrefIndex);
  const end = html.indexOf("</a>", hrefIndex);
  return { index: start, opening: html.slice(start, tagEnd + 1), text: html.slice(tagEnd + 1, end) };
}

function indexOfMarkup(html, marker) {
  const index = html.indexOf(marker);
  assert.ok(index >= 0, `the rendered page contains ${marker}`);
  return index;
}

function countMarkup(html, marker) {
  return html.split(marker).length - 1;
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
beforeEach(() => {
  releaseBrowserGlobals?.reset();
});


after(async () => {
  await vite?.close();
  releaseBrowserGlobals?.();
});

async function loadPages() {
  const app = await vite.ssrLoadModule("/src/App.jsx");
  return { App: app.App };
}

test("the rendered page has no Ava vestlus launcher", async () => {
  const { App } = await loadPages();
  const renderer = createRenderer(reactInternals);
  const html = renderToStaticMarkup(renderer.render(App, {}));
  assert.doesNotMatch(html, /aria-label="Ava vestlus"/u, "the page no longer offers a separate chat window");
});

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

// A failed answer never withdraws the listing that already reached the client.
// The reader came for the ordinary results, so they lead and the notice follows
// them; the notice stays truthful about what is missing.

const FIRST_RESULT = "https://keskkonnaportaal.ee/et/mets";

test("a terminal search failure shows the received listing before its notice", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(failsAfter(listingOf()));
    await startSearch("metsateatis");
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(page.props.error, "Koondvastuse voog katkes. Juba leitud otsingutulemused on endiselt saadaval.");
    assert.equal(page.props.result, null, "no answer card is invented for a failed stream");

    const html = renderToStaticMarkup(page);
    const link = linkIn(html, FIRST_RESULT);
    assert.ok(link, "the listing that reached the client is rendered, not dropped");
    assert.match(link.text, /Metsandus/u, "the received result stays a real link with its title");
    assert.ok(link.index < indexOfMarkup(html, 'class="search-error"'),
      "the ordinary results precede the failure notice");
    assert.match(html.slice(indexOfMarkup(html, 'class="search-error"')),
      /Juba leitud otsingutulemused on endiselt saadaval/u, "the notice says what survived");
    assert.match(html, /AI-sõnastust ei saanud koostada\. Leitud tulemused on loetletud siin\./u,
      "the listing header does not claim a summary sits above it");
    assert.match(html, /id="broad-results-title"/u, "the listing keeps its heading");
    assert.equal(countMarkup(html, `href="${FIRST_RESULT}"`), 1, "the listing is rendered once");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("an unavailable wording card on the search page keeps the listing above it", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: unavailableAnswerOf("metsateatis", "metsateatis") },
    ));
    await startSearch("metsateatis");
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const html = renderToStaticMarkup(page);

    assert.equal(countMarkup(html, 'class="search-error"'), 0, "a missing wording is not a broken stream");
    const link = linkIn(html, FIRST_RESULT);
    assert.ok(link, "the received listing is rendered");
    assert.match(link.text, /Metsandus/u, "the received result stays a real link");
    assert.equal(countMarkup(html, `href="${FIRST_RESULT}"`), 1, "the listing is not duplicated");
    assert.ok(link.index < indexOfMarkup(html, 'class="answer-card"'),
      "the ordinary results lead and the fallback card follows");
    assert.match(html, /AI-sõnastust ei saanud koostada\. Leitud tulemused on loetletud siin\./u);
    assert.match(html, /Otsing on praegu koormatud/u, "the fallback keeps its own label");
    assert.match(html, /uut faktivastust ei koostatud/u, "the reason stays readable");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a no-answer search shows the received listing without a trailing card", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: noAnswerOf("metsateadis", "metsateadis") },
    ));
    await startSearch("metsateadis");
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(page.props.result.answer.eyebrow, NO_ANSWER_EYEBROW);
    const html = renderToStaticMarkup(page);

    assert.equal(countMarkup(html, 'class="search-error"'), 0, "a no-answer is not a failed search");
    const link = linkIn(html, FIRST_RESULT);
    assert.ok(link, "the received listing is rendered");
    assert.equal(countMarkup(html, 'class="answer-card"'), 0,
      "the no-answer card is not appended after the listing");
    assert.doesNotMatch(html, /Meil ei ole sellele küsimusele vastust/u,
      "the listing notice already says there is no answer");
    assert.match(html, /Vastust ei leitud\. Leitud tulemused on loetletud siin\./u,
      "the listing header says it once");
    assert.equal(countMarkup(html, `href="${FIRST_RESULT}"`), 1, "the listing is rendered once");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a provisional no-answer draft does not announce no answer while the job runs", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  let releaseDraft = null;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;
    transport.queue(async ({ onEvent }) => {
      onEvent({ type: "results", searchResults: listingOf() });
      onEvent({ type: "draft", result: noAnswerOf("metsateadis", "metsateadis") });
      await new Promise((resolve) => { releaseDraft = resolve; });
      onEvent({ type: "answer", result: answerOf("Metsaraie andmed", "metsateadis") });
    });
    const pending = startSearch("metsateadis");
    await settle();
    const pendingPage = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(pendingPage.props.busy, true);
    const pendingHtml = renderToStaticMarkup(pendingPage);
    assert.doesNotMatch(pendingHtml, /Vastust ei leitud/u, "a draft no-answer is not a finished result");
    assert.match(pendingHtml, /Kontrollin vastust\. Leitud tulemused on loetletud siin\./u,
      "the listing says the answer is still being checked");
    releaseDraft();
    await pending;
    const finalPage = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(finalPage.props.busy, false);
    assert.match(renderToStaticMarkup(finalPage), /AI koondvastus/u, "the final answer replaces the draft");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a source-only search keeps the received listing above the card that says no summary was made", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: sourceOnlyAnswerOf("Kaevandamise keskkonnamõju Ida-Virumaal", "kaevandamise keskkonnamõju") },
    ));
    await startSearch("kaevandamise keskkonnamõju");
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(page.props.result.answer.eyebrow, SOURCE_ONLY_EYEBROW);
    const html = renderToStaticMarkup(page);

    assert.equal(countMarkup(html, 'class="search-error"'), 0, "source-only evidence is not a failed search");
    const link = linkIn(html, FIRST_RESULT);
    assert.ok(link, "the received listing is rendered");
    assert.match(link.text, /Metsandus/u, "the received result stays a real link");
    assert.ok(link.index < indexOfMarkup(html, 'class="answer-card"'),
      "the ordinary results lead the card that says no summary was made");
    assert.ok(html.slice(indexOfMarkup(html, 'class="answer-card"')).includes(SOURCE_ONLY_EYEBROW),
      "the card keeps its own label");
    assert.match(html, /usaldusväärset koondvastust ei õnnestunud/u, "the card keeps its own wording");
    assert.match(html, /AI-sõnastust ei saanud koostada\. Leitud tulemused on loetletud siin\./u,
      "the listing header does not claim a summary sits above it");
    assert.equal(countMarkup(html, `href="${FIRST_RESULT}"`), 1, "the listing is rendered once");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a follow-up without model wording keeps its own listing before the fallback card", async () => {
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
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const SearchResults = page.type;
    const pageProps = page.props;
    const askFollowUp = (question) => {
      find(renderer.render(SearchResults, pageProps), (element) => element.props?.id === "answer-followup-input")
        .props.onChange({ target: { value: question } });
      find(renderer.render(SearchResults, pageProps), (element) => element.props?.className === "followup-form")
        .props.onSubmit({ preventDefault() {} });
    };

    const fallbackTurn = (html, question) => html.slice(indexOfMarkup(html, question));

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: unavailableAnswerOf("Kuidas metsa pindala muutus?") },
    ));
    askFollowUp("Kuidas metsa pindala muutus?");
    await settle();
    const first = fallbackTurn(renderToStaticMarkup(renderer.render(SearchResults, pageProps)), "Kuidas metsa pindala muutus?");
    const firstLink = linkIn(first, FIRST_RESULT);
    assert.ok(firstLink, "the follow-up's own listing is shown, not dropped");
    assert.match(firstLink.text, /Metsandus/u, "the follow-up's source stays a real link");
    const firstCard = indexOfMarkup(first, "Otsing on praegu koormatud");
    assert.ok(firstLink.index < firstCard, "the listing comes before the fallback card");
    assert.match(first.slice(firstCard), /uut faktivastust ei koostatud/u, "the card keeps the server's wording");

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: noAnswerOf("Mis muutus viimase viie aasta jooksul?") },
    ));
    askFollowUp("Mis muutus viimase viie aasta jooksul?");
    await settle();
    const html = renderToStaticMarkup(renderer.render(SearchResults, pageProps));
    const second = fallbackTurn(html, "Mis muutus viimase viie aasta jooksul?");
    const secondLink = linkIn(second, FIRST_RESULT);
    assert.ok(secondLink, "the no-answer follow-up keeps its listing");
    const secondCard = indexOfMarkup(second, "Vastust ei leitud");
    assert.ok(secondLink.index < secondCard, "the listing comes before the no-answer card");
    assert.match(second.slice(secondCard), /Meil ei ole sellele küsimusele vastust/u, "the no-answer wording is kept");
    assert.equal(countMarkup(html, ">Koondvastus<"), 0, "a fallback is never labelled as a summary");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a cited fallback extract keeps its citation and legend after the listing", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: { ...answerOf("Metsateatis", "metsateatis"), related: ["Kui suur on metsamaa pindala?"] } },
    ));
    await startSearch("metsateatis");
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const SearchResults = page.type;
    const pageProps = page.props;

    const EXTRACT_URL = "https://keskkonnaportaal.ee/et/mets/statistika";
    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: extractAnswerOf(EXTRACT_URL) },
    ));
    find(renderer.render(SearchResults, pageProps), (element) => element.props?.id === "answer-followup-input")
      .props.onChange({ target: { value: "Kui suur on metsamaa pindala?" } });
    find(renderer.render(SearchResults, pageProps), (element) => element.props?.className === "followup-form")
      .props.onSubmit({ preventDefault() {} });
    await settle();

    const html = renderToStaticMarkup(renderer.render(SearchResults, pageProps));
    const turn = html.slice(indexOfMarkup(html, "Kui suur on metsamaa pindala?"));
    const listing = linkIn(turn, FIRST_RESULT);
    assert.ok(listing, "the follow-up's own listing is shown");
    const citation = linkIn(turn, EXTRACT_URL);
    assert.ok(citation, "the extract keeps its citation, it is not flattened into plain text");
    assert.match(citation.opening, /class="citation"/u, "the cited number is still a link");
    assert.ok(listing.index < citation.index, "the listing comes before the cited extract card");
    assert.match(turn, /Allika viidatud väljavõte/u, "the card keeps its own label");
    assert.match(turn, /Metsamaa pindala oli 2024\. aastal 2,3 miljonit hektarit/u, "the extract stays readable");
    assert.match(turn, /Allika enda sõnastus, mitte mudeli koondvastus/u, "the card keeps its note");
    assert.equal(countMarkup(turn, 'class="source-legend"'), 1, "the source legend stays with the card");
    assert.equal(countMarkup(html, ">Koondvastus<"), 0, "the extract is not labelled as a summary");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a supported negative answer keeps its answer card above the listing", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    const CITATION_URL = "https://keskkonnaportaal.ee/et/mets/statistika";
    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      {
        type: "answer",
        result: factualAnswerOf(
          "Ei, metsamaa pindala ei ole vähenenud",
          "Viimase kümne aasta mõõtmised näitavad metsamaa pindala kasvu, seega pindala ei ole vähenenud.",
          CITATION_URL,
        ),
      },
    ));
    await startSearch("kas metsamaa pindala on vähenenud");
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(page.props.result.answer.title, "Ei, metsamaa pindala ei ole vähenenud");
    const html = renderToStaticMarkup(page);

    assert.equal(countMarkup(html, 'class="search-error"'), 0, "a supported negative answer is not a failed search");
    assert.doesNotMatch(html, /Koondvastuse voog katkes|AI-sõnastust ei saanud koostada|Vastust ei leitud/u);
    assert.match(html, /Ei, metsamaa pindala ei ole vähenenud/u, "the answer stays the answer");
    const citation = linkIn(html, CITATION_URL);
    assert.ok(citation, "the answer keeps its citation link");
    assert.match(citation.opening, /class="citation"/u, "the cited number is still a link");
    const link = linkIn(html, FIRST_RESULT);
    assert.ok(link, "the listing stays available beside the answer");
    assert.ok(indexOfMarkup(html, 'class="answer-card"') < link.index,
      "an answered search keeps the answer card above its listing");
    assert.equal(countMarkup(html, `href="${FIRST_RESULT}"`), 1, "the listing is rendered once");
    assert.match(html, /Ülal olev koondvastus põhineb/u, "an answered listing keeps its usual header");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

// This explicit response fixture tests a card that echoes one corrected word.
// The UI must keep the spelling the reader entered.
const ASKED_GENITIVE = "Kas 2025. aasta raiemahu kohta on eksperdihinnang?";
const CANONICAL_HARVEST = "Kas 2025. aasta raiemaht kohta on eksperdihinnang?";

test("an answer card that only echoes the corrected query keeps the wording the reader typed", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: answerOf(CANONICAL_HARVEST, CANONICAL_HARVEST) },
    ));
    await startSearch(ASKED_GENITIVE);
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(page.props.result.answer.title, CANONICAL_HARVEST, "the response body keeps the canonical query");
    const card = renderer.render(page.type, page.props);
    const heading = find(card, (element) => element.type === "h1" && element.props?.tabIndex === -1);
    assert.equal(textOf(heading), ASKED_GENITIVE);
    assert.doesNotMatch(textOf(heading), /raiemaht/u);

    // The same heading rule holds for the inline follow-up on that page.
    const SearchResults = page.type;
    const searchResultsProps = page.props;
    find(card, (element) => element.props?.id === "answer-followup-input")
      .props.onChange({ target: { value: ASKED_GENITIVE } });
    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: answerOf(CANONICAL_HARVEST, CANONICAL_HARVEST) },
    ));
    find(renderer.render(SearchResults, searchResultsProps), (element) => element.props?.className === "followup-form")
      .props.onSubmit({ preventDefault() {} });
    await settle();
    const answeredFollowUp = renderer.render(SearchResults, searchResultsProps);
    const followUpHeading = find(answeredFollowUp, (element) => element.props?.id === "followup-1-title");
    assert.equal(textOf(followUpHeading), ASKED_GENITIVE);
    assert.doesNotMatch(textOf(followUpHeading), /raiemaht/u);

  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a meaningful answer title is never replaced with the question", async () => {
  const authored = "SMI 2025: 2025. aasta raiemaht on eksperthinnang, mitte mõõdetud tulemus";
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const startSearch = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined).props.onSearch;

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: answerOf(authored, CANONICAL_HARVEST) },
    ));
    await startSearch(ASKED_GENITIVE);
    const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const heading = find(renderer.render(page.type, page.props), (element) => element.type === "h1" && element.props?.tabIndex === -1);
    assert.equal(textOf(heading), authored, "an authored heading stays the answer's own wording");

  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a filtered search restores all filters before retrying after Back", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { App } = await loadPages();
    const { default: SearchResults } = await vite.ssrLoadModule("/src/SearchResults.jsx");
    const renderer = createRenderer(reactInternals);
    const filters = { ...DEFAULT_SEARCH_FILTERS, source: "official", category: "mets", year: 2024, sort: "newest" };
    const home = find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined);
    transport.queue(() => { throw new Error("Temporary search failure"); });
    await home.props.onSearch("mets kaitse", { filters });

    const failed = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(failed.props.query, "mets kaitse");
    assert.deepEqual(failed.props.filters, filters);
    assert.ok(failed.props.error);
    failed.props.onHome();
    globalThis.window.history.back();

    const restored = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    assert.equal(restored.props.query, "mets kaitse");
    assert.deepEqual(restored.props.filters, filters);
    assert.ok(restored.props.error);
    assert.equal(globalThis.window.location.search, "", "the query stays out of the URL");

    const tree = renderer.render(SearchResults, restored.props);
    const retry = find(tree, (element) => element.type === "button" && element.props?.className === "error-retry");
    transport.queue(() => { throw new Error("Retry failed"); });
    await retry.props.onClick();
    assert.deepEqual(transport.calls.at(-1).payload.filters, filters);
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("Back and Forward restore cached search pages without another search job", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  const originalFetch = globalThis.fetch;
  const filteredFilters = { ...DEFAULT_SEARCH_FILTERS, category: "mets", year: 2024 };
  const firstListing = {
    ...listingOf(),
    total: 24,
    pageCount: 2,
    windowId: "first-window",
  };
  const filteredListing = {
    ...listingOf(),
    total: 13,
    pageCount: 2,
    windowId: "filtered-window",
    appliedFilters: filteredFilters,
  };
  const secondPage = {
    ...filteredListing,
    page: 2,
    items: [{
      id: "metsamajandus",
      title: "Metsamajandus",
      url: "https://keskkonnaportaal.ee/et/metsamajandus",
      sourceTier: "official",
      summary: "Teine kasulik leht.",
    }],
  };
  const pageRequests = [];
  globalThis.fetch = async (_url, options) => {
    pageRequests.push(JSON.parse(options.body));
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => secondPage,
    };
  };
  try {
    const { App } = await loadPages();
    const { default: BroadSearchResults } = await vite.ssrLoadModule("/src/BroadSearchResults.jsx");
    const renderer = createRenderer(reactInternals);
    const searchResults = () => {
      const page = find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
      const tree = renderer.render(page.type, page.props);
      const broadResults = find(tree, (element) => element.type === BroadSearchResults);
      return {
        props: page.props,
        tree: [tree, renderer.render(BroadSearchResults, broadResults.props)],
      };
    };

    transport.queue(emits(
      { type: "results", searchResults: firstListing },
      { type: "answer", result: answerOf("Esimene vastus", "mets") },
    ));
    await find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined)
      .props.onSearch("mets");
    globalThis.window.scrollTo({ top: 321 });
    globalThis.window.dispatchEvent({ type: "scroll" });

    transport.queue(emits(
      { type: "results", searchResults: filteredListing },
      { type: "answer", result: answerOf("Filtreeritud vastus", "mets kaitse") },
    ));
    const activeSearch = searchResults();
    await activeSearch.props.onSearch("mets kaitse", { filters: filteredFilters });
    globalThis.window.scrollTo({ top: 456 });
    globalThis.window.dispatchEvent({ type: "scroll" });

    const { tree } = searchResults();
    const secondPageButton = find(tree, (element) => element.type === "button" && element.props?.children === 2);
    await secondPageButton.props.onClick();
    assert.deepEqual(pageRequests, [{
      q: "mets kaitse",
      filters: filteredFilters,
      page: 2,
      page_size: 12,
      window_id: "filtered-window",
    }]);
    globalThis.window.scrollTo({ top: 789 });
    globalThis.window.dispatchEvent({ type: "scroll" });

    const assertCurrentSearch = (query, title, page, filters, scrollY) => {
      const { props, tree: currentTree } = searchResults();
      assert.equal(props.query, query);
      assert.equal(props.result.answer.title, title);
      assert.equal(props.previewListing.page, page);
      assert.deepEqual(props.previewListing.appliedFilters, filters);
      assert.equal(globalThis.window.scrollY, scrollY);
      assert.equal(globalThis.window.location.pathname, "/otsi");
      assert.equal(globalThis.window.location.search, "", "the query stays out of the URL");
      return currentTree;
    };

    assertCurrentSearch("mets kaitse", "Filtreeritud vastus", 2, filteredFilters, 789);
    globalThis.window.history.back();
    assertCurrentSearch("mets kaitse", "Filtreeritud vastus", 1, filteredFilters, 456);
    globalThis.window.history.back();
    assertCurrentSearch("mets", "Esimene vastus", 1, DEFAULT_SEARCH_FILTERS, 321);
    globalThis.window.history.forward();
    assertCurrentSearch("mets kaitse", "Filtreeritud vastus", 1, filteredFilters, 456);
    globalThis.window.history.forward();
    const restoredPageTwo = assertCurrentSearch("mets kaitse", "Filtreeritud vastus", 2, filteredFilters, 789);
    assert.match(textOf(restoredPageTwo), /Metsamajandus/u);
    assert.equal(transport.calls.length, 2, "history navigation does not start another search or model job");
    assert.equal(transport.calls[0].payload.page_size, 12);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__praktikaSearchJobs;
  }
});


test("Back does not restore an expired search snapshot after starting another search", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  const originalNow = Date.now;
  let now = originalNow();
  Date.now = () => now;
  try {
    const { App } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const home = () => find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined);
    const search = () => find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");

    transport.queue(emits(
      { type: "results", searchResults: { ...listingOf(), windowId: "expired-window-a" } },
      { type: "answer", result: answerOf("Vana vastus A", "otsing A") },
    ));
    await home().props.onSearch("otsing A");

    now += 16 * 60 * 1_000;
    transport.queue(emits(
      { type: "results", searchResults: { ...listingOf(), windowId: "window-b" } },
      { type: "answer", result: answerOf("Vastus B", "otsing B") },
    ));
    await search().props.onSearch("otsing B");
    assert.equal(transport.calls.length, 2);

    globalThis.window.history.back();
    await settle();

    assert.ok(home(), "Back must not restore an expired search snapshot");
    assert.equal(globalThis.window.location.pathname, "/", "an expired opaque history entry returns to Home");
    assert.equal(transport.calls.length, 2, "Back does not revive the old search or start a new job");
    assert.equal(globalThis.window.location.search, "", "the query stays out of the URL");
  } finally {
    Date.now = originalNow;
    delete globalThis.__praktikaSearchJobs;
  }
});


test("a late page one answer preserves both history entries scroll positions", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  const originalFetch = globalThis.fetch;
  let releaseAnswer;
  let answerReleased = false;
  let pendingSearch;
  const answerGate = new Promise((resolve) => {
    releaseAnswer = resolve;
  });
  const firstListing = {
    ...listingOf(),
    pageCount: 2,
    windowId: "streaming-window",
  };
  const secondPage = {
    ...firstListing,
    page: 2,
    items: [{ ...firstListing.items[0], title: "Teine leht" }],
  };
  globalThis.fetch = async () => {
    // The loading state can shorten the document before the page request resolves.
    globalThis.window.scrollTo({ top: 0 });
    globalThis.window.dispatchEvent({ type: "scroll" });
    return {
      ok: true,
      headers: { get: () => null },
      json: async () => secondPage,
    };
  };
  try {
    const { App } = await loadPages();
    const { default: BroadSearchResults } = await vite.ssrLoadModule("/src/BroadSearchResults.jsx");
    const renderer = createRenderer(reactInternals);
    const home = () => find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined);
    const search = () => find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const resultsTree = () => {
      const page = search();
      const tree = renderer.render(page.type, page.props);
      const broadResults = find(tree, (element) => element.type === BroadSearchResults);
      return renderer.render(BroadSearchResults, broadResults.props);
    };

    transport.queue(async ({ onEvent }) => {
      onEvent({ type: "results", searchResults: firstListing });
      await answerGate;
      onEvent({ type: "answer", result: answerOf("Hiline vastus A", "mets") });
    });
    pendingSearch = home().props.onSearch("mets");
    await settle();
    assert.equal(search().props.previewListing.page, 1);

    globalThis.window.scrollTo({ top: 321 });
    globalThis.window.dispatchEvent({ type: "scroll" });
    await settle();
    const pageTwoButton = find(
      resultsTree(),
      (element) => element.type === "button" && element.props?.children === 2,
    );
    await pageTwoButton.props.onClick();
    search();
    globalThis.window.scrollTo({ top: 789 });
    globalThis.window.dispatchEvent({ type: "scroll" });
    await settle();

    releaseAnswer();
    answerReleased = true;
    await pendingSearch;
    assert.equal(search().props.previewListing.page, 2);
    assert.equal(search().props.result.answer.title, "Hiline vastus A");
    assert.equal(globalThis.window.scrollY, 789);

    globalThis.window.history.back();
    await settle();
    assert.equal(search().props.previewListing.page, 1);
    assert.equal(search().props.result.answer.title, "Hiline vastus A");
    assert.equal(globalThis.window.scrollY, 321);

    globalThis.window.history.forward();
    await settle();
    assert.equal(search().props.previewListing.page, 2);
    assert.equal(search().props.result.answer.title, "Hiline vastus A");
    assert.equal(globalThis.window.scrollY, 789);
    assert.equal(transport.calls.length, 1, "history navigation does not start another search job");
  } finally {
    if (!answerReleased) releaseAnswer();
    if (pendingSearch) await pendingSearch.catch(() => {});
    globalThis.fetch = originalFetch;
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a draft arriving during a page request keeps that request and shows page two", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  const originalFetch = globalThis.fetch;
  let releaseDraft;
  let releasePage;
  let pendingSearch;
  let pendingPage;
  let pageSignal;
  const draftGate = new Promise((resolve) => { releaseDraft = resolve; });
  const pageGate = new Promise((resolve) => { releasePage = resolve; });
  const firstListing = {
    ...listingOf(),
    total: 24,
    pageCount: 2,
    windowId: "draft-window",
    queryRevision: "draft-revision",
  };
  const secondPage = {
    ...firstListing,
    page: 2,
    items: [{ ...firstListing.items[0], title: "Teise lehe tegelik tulemus" }],
  };
  globalThis.fetch = async (_url, options) => {
    pageSignal = options.signal;
    await pageGate;
    if (pageSignal.aborted) throw Object.assign(new Error("aborted"), { name: "AbortError" });
    return { ok: true, headers: { get: () => null }, json: async () => secondPage };
  };
  try {
    const { App } = await loadPages();
    const { default: BroadSearchResults } = await vite.ssrLoadModule("/src/BroadSearchResults.jsx");
    const renderer = createRenderer(reactInternals);
    const home = () => find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined);
    const search = () => find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const resultsTree = () => {
      const page = search();
      const tree = renderer.render(page.type, page.props);
      return renderer.render(BroadSearchResults, find(tree, (element) => element.type === BroadSearchResults).props);
    };
    transport.queue(async ({ onEvent }) => {
      onEvent({ type: "results", searchResults: firstListing });
      await draftGate;
      onEvent({
        type: "draft",
        result: { ...answerOf("Esialgne vastus", "mets"), searchResults: { ...firstListing } },
      });
    });
    pendingSearch = home().props.onSearch("mets");
    await settle();
    assert.equal(search().props.result, null, "pagination starts before an answer exists");
    const pageTwoButton = find(resultsTree(), (element) => element.type === "button" && element.props?.children === 2);
    pendingPage = pageTwoButton.props.onClick();
    assert.ok(pageSignal, "page two is requested before the draft");
    releaseDraft();
    await pendingSearch;
    resultsTree();
    assert.equal(pageSignal.aborted, false, "the same-window draft must not cancel page two");
    releasePage();
    await pendingPage;
    const selectedPage = search();
    assert.equal(selectedPage.props.previewListing.page, 2);
    assert.equal(selectedPage.props.result.searchResults.page, 2);
    assert.equal(selectedPage.props.result.answer.title, "Esialgne vastus");
    for (const listing of [selectedPage.props.previewListing, selectedPage.props.result.searchResults]) {
      assert.equal(listing.windowId, "draft-window");
      assert.equal(listing.queryRevision, "draft-revision");
    }
    const remountRenderer = createRenderer(reactInternals);
    const remountedTree = remountRenderer.render(selectedPage.type, selectedPage.props);
    const remountedListing = find(remountedTree, (element) => element.type === BroadSearchResults);
    assert.match(textOf(remountRenderer.render(BroadSearchResults, remountedListing.props)), /Teise lehe tegelik tulemus/u);
    globalThis.window.history.back();
    search();
    globalThis.window.history.forward();
    const restoredPage = search();
    assert.equal(restoredPage.props.previewListing.page, 2);
    assert.equal(restoredPage.props.result.answer.title, "Esialgne vastus");
    assert.equal(restoredPage.props.previewListing.windowId, "draft-window");
    assert.equal(restoredPage.props.previewListing.queryRevision, "draft-revision");
    const restoredRenderer = createRenderer(reactInternals);
    const restoredTree = restoredRenderer.render(restoredPage.type, restoredPage.props);
    const restoredListing = find(restoredTree, (element) => element.type === BroadSearchResults);
    assert.match(textOf(restoredRenderer.render(BroadSearchResults, restoredListing.props)), /Teise lehe tegelik tulemus/u);
  } finally {
    releaseDraft();
    releasePage();
    if (pendingPage) await pendingPage.catch(() => {});
    if (pendingSearch) await pendingSearch.catch(() => {});
    globalThis.fetch = originalFetch;
    delete globalThis.__praktikaSearchJobs;
  }
});


test("an expired or mismatched result window is discarded and refreshed from page one", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  const originalFetch = globalThis.fetch;
  const firstListing = {
    ...listingOf(),
    total: 24,
    pageCount: 2,
    queryRevision: "revision-one",
    windowId: "window-one",
  };
  const refreshedListing = {
    ...firstListing,
    total: 25,
    queryRevision: "revision-two",
    windowId: "window-two",
    items: [{ ...firstListing.items[0], title: "Värskendatud esimene tulemus" }],
  };
  const finalListing = {
    ...refreshedListing,
    total: 26,
    queryRevision: "revision-three",
    windowId: "window-three",
    items: [{ ...firstListing.items[0], title: "Lõplik esimene tulemus" }],
  };
  const responses = [
    {
      ...firstListing,
      page: 2,
      queryRevision: "revision-stale",
      windowId: "window-stale",
      items: [{ ...firstListing.items[0], id: "stale-result", title: "Aegunud tulemus" }],
    },
    refreshedListing,
    {
      page: 2,
      pageSize: 12,
      pageCount: 0,
      hasMore: false,
      total: 0,
      totalRelation: "gte",
      truncated: true,
      windowExpired: true,
      items: [],
    },
    finalListing,
  ];
  const pageRequests = [];
  globalThis.fetch = async (_url, options) => {
    pageRequests.push(JSON.parse(options.body));
    const data = responses.shift();
    assert.ok(data, "the UI only requests the expected result pages");
    return { ok: true, headers: { get: () => null }, json: async () => data };
  };
  try {
    const { App } = await loadPages();
    const { default: BroadSearchResults } = await vite.ssrLoadModule("/src/BroadSearchResults.jsx");
    const renderer = createRenderer(reactInternals);
    const appPage = () => find(renderer.render(App, {}), (element) => typeof element.props?.onHome === "function");
    const searchTree = () => {
      const page = appPage();
      const tree = renderer.render(page.type, page.props);
      const broadResults = find(tree, (element) => element.type === BroadSearchResults);
      return [tree, renderer.render(BroadSearchResults, broadResults.props)];
    };
    transport.queue(emits(
      { type: "results", searchResults: firstListing },
      { type: "answer", result: answerOf("Metsateatis", "metsateatis") },
    ));
    await find(renderer.render(App, {}), (element) => element.props?.searchInputRef !== undefined)
      .props.onSearch("metsateatis");

    const originalPageKey = appPage().key;
    const firstSecondPageButton = find(searchTree(), (element) => element.type === "button" && element.props?.children === 2);
    await firstSecondPageButton.props.onClick();
    assert.deepEqual(pageRequests.slice(0, 2), [
      {
        q: "metsateatis",
        filters: DEFAULT_SEARCH_FILTERS,
        page: 2,
        page_size: 12,
        window_id: "window-one",
      },
      { q: "metsateatis", filters: DEFAULT_SEARCH_FILTERS, page: 1, page_size: 12 },
    ]);
    assert.match(textOf(searchTree()), /Värskendatud esimene tulemus/u);
    assert.doesNotMatch(textOf(searchTree()), /Aegunud tulemus/u);
    assert.match(textOf(searchTree()), /Uuendasin esimest lehte/u);
    const expiryNotice = "Otsinguaken aegus. Uuendasin esimest lehte. Lehevalik näitab nüüd ajakohaseid tulemusi.";
    const refreshedPage = appPage();
    assert.notEqual(refreshedPage.key, originalPageKey, "refreshing creates the keyed result page entry");
    assert.equal(refreshedPage.props.listingNotice, expiryNotice, "the parent owns the notice across a keyed child remount");
    globalThis.window.history.back();
    assert.equal(appPage().props.listingNotice, "", "the previous page has no expiry notice");
    globalThis.window.history.forward();
    assert.equal(appPage().props.listingNotice, expiryNotice, "Forward restores the notice from the page snapshot");
    assert.match(textOf(searchTree()), /Uuendasin esimest lehte/u);

    const refreshedSecondPageButton = find(searchTree(), (element) => element.type === "button" && element.props?.children === 2);
    await refreshedSecondPageButton.props.onClick();
    assert.deepEqual(pageRequests.slice(2), [
      {
        q: "metsateatis",
        filters: DEFAULT_SEARCH_FILTERS,
        page: 2,
        page_size: 12,
        window_id: "window-two",
      },
      { q: "metsateatis", filters: DEFAULT_SEARCH_FILTERS, page: 1, page_size: 12 },
    ]);
    assert.match(textOf(searchTree()), /Lõplik esimene tulemus/u);
    assert.doesNotMatch(textOf(searchTree()), /Aegunud tulemus/u);
    assert.equal(transport.calls.length, 1, "page recovery does not start a model job");
    assert.equal(globalThis.window.location.search, "", "the query stays out of the URL");
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__praktikaSearchJobs;
  }
});


test("truncated counts are lower bounds and result navigation stops at two pages", async () => {
  const { default: BroadSearchResults } = await vite.ssrLoadModule("/src/BroadSearchResults.jsx");
  const renderer = createRenderer(reactInternals);
  const listing = {
    ...listingOf(Array.from({ length: 12 }, (_value, index) => ({
      id: `result-${index + 1}`,
      title: `Tulemus ${index + 1}`,
      url: `https://keskkonnaportaal.ee/et/tulemus-${index + 1}`,
      sourceTier: "official",
      summary: "Otsingutulemus.",
    }))),
    total: 1_280,
    totalRelation: "gte",
    truncated: true,
    pageCount: 99,
    hasMore: true,
  };
  const tree = renderer.render(BroadSearchResults, {
    listing,
    busy: false,
    error: "",
    onPage() {},
    onFilters() {},
  });
  const total = find(tree, (element) => element.type === "strong");
  const visibleCount = find(total, (element) => element.props?.["aria-hidden"] === "true");
  const accessibleCount = find(total, (element) => element.props?.className === "sr-only");
  const formattedTotal = listing.total.toLocaleString("et-EE");
  const pageButtons = elementsOf(tree)
    .filter((element) => element.type === "button" && Number.isInteger(element.props?.children))
    .map((element) => element.props.children);

  assert.equal(visibleCount.props.children.join(""), `≥ ${formattedTotal}`);
  assert.equal(textOf(accessibleCount).replace(/\s+/gu, " ").trim(), `Vähemalt ${formattedTotal} vastet`);
  assert.deepEqual(pageButtons, [1, 2]);
  assert.match(textOf(tree), /Näitan kuni kahte esimest kasulikku lehte/u);
});

