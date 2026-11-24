import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { load } from "cheerio";
import { createServer } from "vite";
import { DEFAULT_SEARCH_FILTERS } from "../src/search_request.js";

let vite;
let appModulePromise;

before(async () => {
  vite = await createServer({
    configFile: false,
    root: fileURLToPath(new URL("../", import.meta.url)),
    logLevel: "silent",
    esbuild: { jsx: "automatic" },
    ssr: { external: ["react"] },
    server: { middlewareMode: true, hmr: false, watch: null },
    appType: "custom",
  });
});

after(async () => {
  await vite?.close();
});

async function loadApp() {
  appModulePromise ||= vite.ssrLoadModule("/src/App.jsx");
  return appModulePromise;
}

function elementsOf(node, found = []) {
  if (Array.isArray(node)) {
    node.forEach((child) => elementsOf(child, found));
  } else if (node && typeof node === "object" && "type" in node && "props" in node) {
    found.push(node);
    elementsOf(node.props.children, found);
  }
  return found;
}

function find(node, predicate) {
  const match = elementsOf(node).find(predicate);
  assert.ok(match, "the expected element is part of the rendered tree");
  return match;
}

function hasClass(node, className) {
  return String(node.props.className || "").split(/\s+/u).includes(className);
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener(type, listener) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(listener);
    },
    removeEventListener(type, listener) {
      listeners.get(type)?.delete(listener);
    },
    dispatchEvent(event) {
      for (const listener of [...(listeners.get(event.type) || [])]) listener(event);
      return true;
    },
    listenerCount(type) {
      return listeners.get(type)?.size || 0;
    },
  };
}

function installBrowser() {
  const classes = new Set();
  const document = {
    ...eventTarget(),
    title: "",
    activeElement: null,
    body: {
      classList: {
        toggle(name, force) {
          if (force) classes.add(name);
          else classes.delete(name);
          return force;
        },
        remove(name) {
          classes.delete(name);
        },
        contains(name) {
          return classes.has(name);
        },
      },
    },
  };
  const location = {
    pathname: "/",
    search: "",
    href: "http://localhost/",
  };
  const assignLocation = (url) => {
    const next = new URL(url, location.href);
    location.pathname = next.pathname;
    location.search = next.search;
    location.href = next.href;
  };
  const window = {
    ...eventTarget(),
    document,
    location,
    scrollY: 0,
    history: {
      state: null,
      scrollRestoration: "auto",
      pushState(state, _title, url) {
        this.state = state;
        assignLocation(url);
      },
      replaceState(state, _title, url) {
        this.state = state;
        assignLocation(url);
      },
    },
    scrollTo() {},
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame(callback) {
      callback(0);
      return 1;
    },
    cancelAnimationFrame() {},
  };
  const previous = { window: globalThis.window, document: globalThis.document };
  globalThis.window = window;
  globalThis.document = document;
  return {
    window,
    document,
    focusCalls: [],
    focus(element) {
      document.activeElement = element;
      this.focusCalls.push(element);
    },
    release() {
      if (previous.window === undefined) delete globalThis.window;
      else globalThis.window = previous.window;
      if (previous.document === undefined) delete globalThis.document;
      else globalThis.document = previous.document;
    },
  };
}

function sameDeps(previous, next) {
  if (previous === next) return true;
  if (!previous || !next || previous.length !== next.length) return false;
  return previous.every((value, index) => Object.is(value, next[index]));
}

// The repository has no DOM test dependency. This small renderer drives the
// real component hooks and commits refs before passive effects, matching the
// browser order that matters when the compact header removes the menu button.
function createRenderer(reactInternals, browser) {
  const stores = new Map();
  const storeFor = (component) => {
    if (!stores.has(component)) stores.set(component, { slots: [], tree: null });
    return stores.get(component);
  };
  const runtimeFor = (store) => {
    let cursor = 0;
    const slot = (create) => {
      const index = cursor++;
      if (store.slots[index] === undefined) store.slots[index] = create();
      return store.slots[index];
    };
    return {
      useState(initial) {
        const entry = slot(() => ({ kind: "state", value: typeof initial === "function" ? initial() : initial }));
        return [entry.value, (update) => {
          const value = typeof update === "function" ? update(entry.value) : update;
          if (!Object.is(value, entry.value)) {
            entry.value = value;
            store.invalidated = true;
          }
        }];
      },
      useRef(initial) {
        return slot(() => ({ kind: "ref", value: { current: initial } })).value;
      },
      useEffect(effect, deps) {
        const index = cursor++;
        const previous = store.slots[index];
        const nextDeps = Array.isArray(deps) ? deps.slice() : undefined;
        const record = previous && previous.kind === "effect"
          ? previous
          : { kind: "effect", deps: undefined, cleanup: undefined };
        const changed = !previous
          || previous.kind !== "effect"
          || nextDeps === undefined
          || !sameDeps(previous.deps, nextDeps);
        record.deps = nextDeps;
        store.slots[index] = record;
        if (changed) store.queued.push({ record, effect });
      },
      useLayoutEffect(effect, deps) {
        this.useEffect(effect, deps);
      },
    };
  };
  const detachRefs = (node) => {
    if (Array.isArray(node)) return node.forEach(detachRefs);
    if (!node || typeof node !== "object" || !("type" in node)) return;
    const ref = node.props.ref;
    if (ref && typeof ref === "object") ref.current = null;
    detachRefs(node.props.children);
  };
  const mountNode = (node) => {
    if (Array.isArray(node)) return node.map(mountNode).filter(Boolean);
    if (!node || typeof node !== "object" || !("type" in node)) return null;
    const host = {
      type: node.type,
      props: node.props,
      children: [],
      focus: () => browser.focus(host),
      contains(target) {
        return target === host || host.children.some((child) => child.contains(target));
      },
      querySelectorAll() {
        const descendants = [];
        const visit = (current) => {
          for (const child of current.children) {
            descendants.push(child);
            visit(child);
          }
        };
        visit(host);
        return descendants.filter((child) => (
          (child.type === "a" && child.props.href !== undefined)
          || (child.type === "button" && !child.props.disabled)
          || (["input", "select", "textarea"].includes(child.type) && !child.props.disabled)
          || (child.props.tabIndex !== undefined && child.props.tabIndex !== "-1")
        ));
      },
    };
    const ref = node.props.ref;
    if (ref && typeof ref === "object") ref.current = host;
    host.children = mountNode(node.props.children) || [];
    return host;
  };
  const commit = (store, tree) => {
    detachRefs(store.tree);
    store.tree = tree;
    mountNode(tree);
  };
  return {
    render(component, props) {
      const store = storeFor(component);
      for (let pass = 0; pass < 12; pass += 1) {
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
        commit(store, tree);
        const queued = store.queued;
        store.queued = [];
        for (const { record, effect } of queued) {
          if (typeof record.cleanup === "function") record.cleanup();
          record.cleanup = effect();
        }
        if (!store.invalidated) return tree;
      }
      assert.fail("the component did not settle after a state update");
    },
    unmount() {
      for (const store of stores.values()) {
        detachRefs(store.tree);
        for (const record of store.slots) {
          if (record.kind === "effect") record.cleanup?.();
        }
      }
      stores.clear();
    },
  };
}

test("closed mobile drawer is inert and the menu button points at it", async () => {
  const { Header } = await loadApp();
  assert.equal(typeof Header, "function", "the header renders from server markup");

  const html = renderToStaticMarkup(createElement(Header, {}));
  const $ = load(html);

  const button = $("button.header-icon--menu");
  assert.equal(button.length, 1, "the header renders exactly one menu button");
  assert.equal(button.attr("aria-expanded"), "false", "the drawer starts closed");
  const controls = button.attr("aria-controls");
  assert.equal(controls, "mobile-drawer", "the menu button announces which element it opens");

  const drawer = $(`#${controls}`);
  assert.equal(drawer.length, 1, "aria-controls points at the rendered drawer");
  assert.equal($(".mobile-drawer").length, 1, "the header renders exactly one drawer");

  assert.ok(
    drawer.is("[inert]"),
    "the closed drawer is inert, so its links and close button cannot take keyboard focus",
  );

  assert.equal(drawer.attr("role"), "dialog", "the drawer is a dialog for assistive technology");
  assert.equal(drawer.attr("aria-modal"), "true", "the open dialog makes the background inactive");
  const labelId = drawer.attr("aria-labelledby");
  assert.equal(labelId, "mobile-drawer-title", "the dialog names itself from its visible title");
  const label = drawer.find(`#${labelId}`);
  assert.equal(label.length, 1, "the dialog title lives inside the dialog");
  assert.equal(label.text().trim(), "Menüü", "the dialog title is visible text");

  assert.equal(drawer.find("button").length, 1, "the drawer keeps its own close button");
  assert.ok(drawer.find("nav a").length > 0, "the drawer keeps its navigation links");
});

test("popstate closes an open mobile drawer and releases its locks before home can reopen it", async () => {
  const browser = installBrowser();
  const { App, Header } = await loadApp();
  const { searchHistory } = await vite.ssrLoadModule("/src/search_history.js");
  let reactModule;
  try {
    reactModule = await vite.ssrLoadModule("react");
  } catch {
    reactModule = await import("react");
  }
  const reactExport = reactModule.default?.useState ? reactModule.default : reactModule;
  const reactInternals = reactExport.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
    || reactExport.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;
  assert.ok(reactInternals && "H" in reactInternals, "React exposes the hook dispatcher this renderer drives");
  const renderer = createRenderer(reactInternals, browser);
  const snapshotId = "mobile-drawer-popstate";
  searchHistory.create(snapshotId, {
    query: "mets",
    filters: DEFAULT_SEARCH_FILTERS,
    listing: null,
    result: null,
    error: "",
  });
  try {
    let appTree = renderer.render(App, {});
    let header = find(appTree, (node) => node.type === Header);
    let headerTree = renderer.render(Header, header.props);
    const menuButton = find(headerTree, (node) => hasClass(node, "header-icon--menu"));
    const previousMenuButton = menuButton.props.ref.current;
    menuButton.props.onClick();
    headerTree = renderer.render(Header, header.props);

    assert.equal(
      find(headerTree, (node) => hasClass(node, "header-icon--menu")).props["aria-expanded"],
      true,
      "the mobile drawer is open before history navigation",
    );
    assert.equal(browser.document.body.classList.contains("menu-locked"), true);
    assert.equal(browser.document.listenerCount("keydown"), 1, "the open drawer traps keyboard focus");

    browser.window.location.pathname = "/otsi";
    browser.window.location.search = "?q=mets";
    browser.window.history.state = { practiceSearchId: snapshotId };
    browser.window.dispatchEvent({ type: "popstate", state: browser.window.history.state });
    appTree = renderer.render(App, {});
    header = find(appTree, (node) => node.type === Header);
    assert.equal(header.props.compact, true, "popstate switched to the compact search header");
    headerTree = renderer.render(Header, header.props);

    assert.equal(
      elementsOf(headerTree).some((node) => node.props.id === "mobile-drawer"),
      false,
      "the compact header does not leave the mobile drawer mounted",
    );
    assert.equal(browser.document.body.classList.contains("menu-locked"), false, "compact mode releases body scrolling");
    assert.equal(browser.document.listenerCount("keydown"), 0, "compact mode removes the drawer key handler");
    assert.equal(browser.focusCalls.includes(previousMenuButton), false, "focus never moves to the removed menu button");

    browser.window.location.pathname = "/";
    browser.window.location.search = "";
    browser.window.history.state = null;
    browser.window.dispatchEvent({ type: "popstate", state: null });
    appTree = renderer.render(App, {});
    header = find(appTree, (node) => node.type === Header);
    assert.equal(header.props.compact, false, "popstate returned to the full header");
    headerTree = renderer.render(Header, header.props);

    assert.equal(
      find(headerTree, (node) => hasClass(node, "header-icon--menu")).props["aria-expanded"],
      false,
      "returning home does not reopen the drawer",
    );
    assert.equal(
      find(headerTree, (node) => node.props.id === "mobile-drawer").props.inert,
      true,
      "the drawer is inert after returning home",
    );
    assert.equal(browser.document.body.classList.contains("menu-locked"), false);
    assert.equal(browser.document.listenerCount("keydown"), 0);
  } finally {
    renderer.unmount();
    browser.release();
  }
});
