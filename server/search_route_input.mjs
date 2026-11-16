import { parseBoundedSearchInteger } from "./retrieval_listing.mjs";

const DEFAULT_SEARCH_PAGE_SIZE = 12;
const MAXIMUM_SEARCH_PAGE = 500;
const MAXIMUM_SEARCH_PAGE_SIZE = 50;
const WINDOW_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/u;
const PAGE_ERROR = "Lehekülg ja lehe suurus peavad olema lubatud täisarvud.";

function requestValue(request, name) {
  return request?.body?.[name] ?? request?.query?.[name];
}

function parseWindowId(request) {
  const value = requestValue(request, "window_id");
  if (value === undefined || value === null || value === "") return { ok: true, windowId: undefined };
  if (typeof value !== "string" || !WINDOW_ID_PATTERN.test(value)) {
    return { ok: false, error: "Otsinguakna tunnus ei sobi." };
  }
  return { ok: true, windowId: value };
}

export function parseSearchPagination(request, { includeWindowId = false } = {}) {
  const page = parseBoundedSearchInteger(requestValue(request, "page"), 1, MAXIMUM_SEARCH_PAGE, { rejectInvalid: true });
  const pageSize = parseBoundedSearchInteger(
    requestValue(request, "page_size"),
    DEFAULT_SEARCH_PAGE_SIZE,
    MAXIMUM_SEARCH_PAGE_SIZE,
    { rejectInvalid: true },
  );
  if (page === null || pageSize === null) return { ok: false, error: PAGE_ERROR };
  if (!includeWindowId) return { ok: true, page, pageSize };
  const parsedWindow = parseWindowId(request);
  if (!parsedWindow.ok) return parsedWindow;
  if (parsedWindow.windowId && page !== 2) {
    return { ok: false, error: "Otsinguakna tunnus kehtib ainult teisel lehel." };
  }
  return { ok: true, page, pageSize, ...(parsedWindow.windowId ? { windowId: parsedWindow.windowId } : {}) };
}
