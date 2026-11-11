import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { DEFAULT_SEARCH_FILTERS } from "../src/search_request.js";
import { composeSearchResponse, NO_ANSWER_EYEBROW } from "../server/search.mjs";

const SOURCE_ONLY_EYEBROW = composeSearchResponse("mets", [{ id: "mets", title: "Mets" }], { related: [] }).answer.eyebrow;

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

test("a no-answer card on the search page keeps the received listing above it", async () => {
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
    assert.ok(link.index < indexOfMarkup(html, 'class="answer-card"'),
      "the ordinary results lead the no-answer card");
    assert.match(html.slice(indexOfMarkup(html, 'class="answer-card"')), /Vastust ei leitud/u,
      "the no-answer card stays visible");
    assert.match(html, /Meil ei ole sellele küsimusele vastust/u, "the no-answer wording is kept");
    assert.match(html, /Vastust ei leitud\. Leitud tulemused on loetletud siin\./u,
      "the listing header says what the card above it is");
    assert.equal(countMarkup(html, `href="${FIRST_RESULT}"`), 1, "the listing is rendered once");
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

test("the chat keeps a listing it already found above a fallback answer", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { Chatbot } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const parts = { AnswerNote: () => null, Citation: () => null, SourceActions: () => null, SourceLegend: () => null };
    const props = { answerParts: parts, answerTextOf: () => "" };
    find(renderer.render(Chatbot, props), (element) => element.props?.["aria-label"] === "Ava vestlus").props.onClick();
    const send = (question) => {
      find(renderer.render(Chatbot, props), (element) => element.props?.id === "chatbot-input")
        .props.onChange({ target: { value: question } });
      find(renderer.render(Chatbot, props), (element) => element.props?.className === "chatbot__form")
        .props.onSubmit({ preventDefault() {} });
    };

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: answerOf("Metsateatis", "kui palju metsa on Eestis") },
    ));
    send("kui palju metsa on Eestis");
    await settle();
    const answered = renderer.render(Chatbot, props);
    const answeredHtml = renderToStaticMarkup(answered);
    assert.equal(countMarkup(answeredHtml, 'class="chatbot__results"'), 0,
      "an answered turn keeps its existing presentation without a second listing");
    assert.match(answeredHtml, /class="chatbot__answer-title"/u, "the answered turn still renders its answer card");

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: unavailableAnswerOf("mis muutus viimase viie aasta jooksul") },
    ));
    send("mis muutus viimase viie aasta jooksul");
    await settle();
    const fallbackHtml = renderToStaticMarkup(renderer.render(Chatbot, props));
    const fallbackTurn = fallbackHtml.slice(indexOfMarkup(fallbackHtml, "mis muutus viimase viie aasta jooksul"));
    const fallbackLink = linkIn(fallbackTurn, FIRST_RESULT);
    assert.ok(fallbackLink, "the listing the panel already found is kept");
    assert.match(fallbackLink.text, /Metsandus/u, "the kept listing stays a real link");
    assert.ok(fallbackLink.index < indexOfMarkup(fallbackTurn, 'class="chatbot__answer-title"'),
      "the listing comes before the fallback card");
    assert.match(fallbackTurn, /Otsing on praegu koormatud/u, "the fallback keeps its own label");
    assert.match(fallbackTurn, /See ei tähenda, et otsitud andmeid ei ole/u, "the truthful notice is kept");

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: noAnswerOf("kas metsa on rohkem") },
    ));
    send("kas metsa on rohkem");
    await settle();
    const noAnswerHtml = renderToStaticMarkup(renderer.render(Chatbot, props));
    const noAnswerTurn = noAnswerHtml.slice(indexOfMarkup(noAnswerHtml, "kas metsa on rohkem"));
    const noAnswerLink = linkIn(noAnswerTurn, FIRST_RESULT);
    assert.ok(noAnswerLink, "the no-answer turn keeps its listing");
    assert.ok(noAnswerLink.index < indexOfMarkup(noAnswerTurn, 'class="chatbot__answer-title"'),
      "the listing comes before the no-answer card");
    assert.match(noAnswerTurn, /Vastust ei leitud/u, "the no-answer card stays visible");
    assert.match(noAnswerTurn, /Meil ei ole sellele küsimusele vastust/u, "the no-answer wording is kept");
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});

test("a chat answer with no card at all keeps the listing it already found above it", async () => {
  const transport = createJobTransport();
  globalThis.__praktikaSearchJobs = transport;
  try {
    const { Chatbot } = await loadPages();
    const renderer = createRenderer(reactInternals);
    const parts = { AnswerNote: () => null, Citation: () => null, SourceActions: () => null, SourceLegend: () => null };
    const props = { answerParts: parts, answerTextOf: () => "" };
    find(renderer.render(Chatbot, props), (element) => element.props?.["aria-label"] === "Ava vestlus").props.onClick();
    find(renderer.render(Chatbot, props), (element) => element.props?.id === "chatbot-input")
      .props.onChange({ target: { value: "kui palju metsa on Eestis" } });

    transport.queue(emits(
      { type: "results", searchResults: listingOf() },
      { type: "answer", result: { searchResults: listingOf() } },
    ));
    find(renderer.render(Chatbot, props), (element) => element.props?.className === "chatbot__form")
      .props.onSubmit({ preventDefault() {} });
    await settle();
    const html = renderToStaticMarkup(renderer.render(Chatbot, props));
    const link = linkIn(html, FIRST_RESULT);
    assert.ok(link, "the found listing is kept");
    assert.match(link.text, /Metsandus/u, "the kept listing stays a real link");
    assert.ok(link.index < indexOfMarkup(html, 'class="chatbot__no-answer"'),
      "the listing comes before the no-answer card");
    assert.equal(countMarkup(html, `href="${FIRST_RESULT}"`), 1, "the listing is rendered once");
    assert.match(html, /Sellele küsimusele ei saanud vastust koostada/u);
  } finally {
    delete globalThis.__praktikaSearchJobs;
  }
});
