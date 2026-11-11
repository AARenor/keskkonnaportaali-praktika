import { createHash } from "node:crypto";
import { load } from "cheerio";
import { sourceResourceKey } from "./source-identity.mjs";

// Source use policy: one pure leaf that decides what may be copied out of a
// source, kept separate from what may be linked, what may be indexed, what may
// be retained and what may be handed to a model.
//
// Nothing here claims a licence. robots.txt, a public URL, an allowed host and a
// permissive X-Robots-Tag describe what a publisher asked a crawler to do; they
// are technical facts and never a rights decision. rightsReview stays
// unreviewed until an actual review record is supplied.
//
// The four application choices are explicit:
//   nosnippet and max-snippet:0 withdraw copied public snippets AND model
//     evidence, because both hand publisher prose to a reader.
//   A finite max-snippet caps the copied excerpt for display and for model
//     evidence at the same character count. It never authorises sending the
//     whole body to a model.
//   noarchive withdraws retained body copies only.
//   data-nosnippet sections are removed before any text extraction, so text the
//     publisher excluded from snippets cannot become a snippet or model
//     evidence.
// Unknown directives, unreadable witnesses and unknown or legacy copied bodies
// fail closed instead of being guessed at.

export const SOURCE_POLICY_VERSION = "source-policy-v1";
export const SOURCE_POLICY_PRODUCT = "keskkonnaportaali-praktika-corpus";

export const SOURCE_CONTENT_KINDS = Object.freeze([
  "fetched-html",
  "fetched-pdf",
  "reviewed-extract",
  "authored-metadata",
  "structured-data",
  "legacy-unknown",
]);

export const SOURCE_TEXT_PURPOSES = Object.freeze(["index", "snippet", "evidence", "cache"]);

// Link metadata travels with every source and survives a denied body. It is
// never derived from copied text.
export const SOURCE_LINK_FIELDS = Object.freeze([
  "url",
  "title",
  "organization",
  "publishedAt",
  "updatedAt",
]);

// Every field that can carry copied publisher prose or text derived from it.
export const SOURCE_TEXT_FIELDS = Object.freeze([
  "summary",
  "content",
  "excerpt",
  "answer",
  "evidenceExcerpt",
]);

export const SOURCE_SNIPPET_MAX_CHARS = 320;
export const SOURCE_EVIDENCE_MAX_CHARS = 1_200;
export const SOURCE_INDEX_MAX_CHARS = 80_000;

const PUBLISHER_KINDS = new Set(["fetched-html", "fetched-pdf", "reviewed-extract"]);
const COPY_KINDS = new Set([
  "fetched-html",
  "fetched-pdf",
  "reviewed-extract",
  "authored-metadata",
  "structured-data",
]);
const ROBOTS_ALLOWING_STATUSES = new Set(["allowed", "absent", "not-applicable"]);
const ROBOTS_STATUSES = new Set(["allowed", "absent", "disallowed", "unreadable", "not-applicable"]);
// Exported so the SQL side can mirror the same verdict vocabulary instead of
// keeping a second list that could drift from this one.
export const SOURCE_ROBOTS_STATUSES = Object.freeze([...ROBOTS_STATUSES]);
export const SOURCE_ROBOTS_ALLOWING_STATUSES = Object.freeze([...ROBOTS_ALLOWING_STATUSES]);

const PURPOSE_USE_KEY = Object.freeze({
  index: "indexBody",
  snippet: "displaySnippet",
  evidence: "answerEvidence",
  cache: "retainBody",
});

const PURPOSE_FIELDS = Object.freeze({
  snippet: Object.freeze(["summary", "excerpt", "evidenceExcerpt", "content"]),
  evidence: Object.freeze(["evidenceExcerpt", "excerpt", "summary", "content"]),
  index: Object.freeze(["content", "summary", "excerpt", "evidenceExcerpt"]),
  cache: Object.freeze(["content", "summary", "excerpt", "evidenceExcerpt"]),
});

const PURPOSE_LIMITS = Object.freeze({
  snippet: SOURCE_SNIPPET_MAX_CHARS,
  evidence: SOURCE_EVIDENCE_MAX_CHARS,
  index: SOURCE_INDEX_MAX_CHARS,
  cache: SOURCE_INDEX_MAX_CHARS,
});

// Elements whose text is either not prose or explicitly excluded from snippet
// use. `data-nosnippet` is the published way to keep a section out of a
// snippet, so the section is removed before extraction and can never reach a
// copied field.
const NON_COPIED_SELECTOR = [
  "script",
  "style",
  "noscript",
  "template",
  "iframe",
  "object",
  "embed",
  "svg",
  "canvas",
  "form",
  "input",
  "select",
  "textarea",
  "[data-nosnippet]",
  "[hidden]",
].join(",");

// cheerio joins the text of sibling blocks without a separator, which would glue
// two sentences together and make a copied snippet unusable. Block boundaries
// become a space before parsing, and whitespace is collapsed afterwards.
const BLOCK_BREAK_PATTERN = /<br\b[^>]*>|<\/(?:address|article|aside|blockquote|dd|div|dl|dt|fieldset|figcaption|figure|footer|h[1-6]|header|li|main|nav|ol|p|pre|section|table|tbody|td|tfoot|th|thead|tr|ul)>/giu;

const ROBOTS_BYTES_LIMIT = 64_000;
const ROBOTS_LINES_LIMIT = 2_000;
const ROBOTS_GROUPS_LIMIT = 32;
const ROBOTS_RULES_LIMIT = 256;
const ROBOTS_LINE_BYTES_LIMIT = 512;
const ROBOTS_PATTERN_LENGTH_LIMIT = 256;
const ROBOTS_WILDCARDS_LIMIT = 8;
const ROBOTS_TARGET_LENGTH_LIMIT = 2_048;
const ROBOTS_HEADER_INSTANCE_LIMIT = 64;
const ROBOTS_HEADER_TEXT_LIMIT = 8_192;
const ROBOTS_META_LIMIT = 64;

// A header scope prefixes a whole field value. A bare `robots` prefix and a
// prefix that is itself a directive name belong to the directive grammar, so
// that value keeps its meaning for every reader.
const HEADER_SCOPE_PATTERN = /^([a-z0-9][a-z0-9._+_-]{0,63})\s*:/u;
const GENERIC_SCOPES = new Set(["*", "robots"]);
const DIRECTIVE_NAME_TOKENS = new Set([
  "all",
  "follow",
  "index",
  "indexifembedded",
  "max-image-preview",
  "max-snippet",
  "max-video-preview",
  "noarchive",
  "nofollow",
  "noimageindex",
  "noindex",
  "none",
  "nosnippet",
  "notranslate",
  "unavailable-after",
  "unavailable_after",
]);
const RESTRICTING_TOKENS = new Set([
  "max-snippet",
  "noarchive",
  "noindex",
  "none",
  "nosnippet",
]);
const CLAIMS_PATTERN = /^(?:licen[cs]e|permission|permitted|public|reuse|rights)$/iu;

function cleanText(value = "") {
  return String(value ?? "").replace(/\s+/gu, " ").trim();
}

function boundedText(value, limit) {
  return cleanText(value).slice(0, limit);
}

function nullableText(value, limit) {
  const text = boundedText(value, limit);
  return text === "" ? null : text;
}

function truncateText(value, limit) {
  const text = String(value ?? "");
  if (!Number.isInteger(limit) || limit < 0 || text.length <= limit) return text;
  return Array.from(text).slice(0, limit).join("").trim();
}

function toClock(value) {
  if (value === undefined || value === null || value === "") return new Date();
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// One extraction path for every copied field. Plain text is normalised, HTML is
// parsed so the excluded sections and the non prose nodes are removed first.
export function extractSourceText(value = "") {
  const input = String(value ?? "");
  if (input.trim() === "") return "";
  if (!/<[a-z!/]/iu.test(input)) return cleanText(input);
  const $ = load(input.replace(BLOCK_BREAK_PATTERN, " "));
  $(NON_COPIED_SELECTOR).remove();
  const main = $("main").first();
  if (main.length) return cleanText(main.text());
  const body = $("body").first();
  return cleanText((body.length ? body : $.root()).text());
}

function robotsPatternMatches(pattern, target) {
  const endAnchored = pattern.endsWith("$");
  const body = endAnchored ? pattern.slice(0, -1) : pattern;
  if (!body.includes("*")) return endAnchored ? target === body : target.startsWith(body);

  const segments = body.split("*");
  let position = 0;
  if (!body.startsWith("*")) {
    const first = segments.shift() || "";
    if (!target.startsWith(first)) return false;
    position = first.length;
  }

  let endLimit = target.length;
  if (endAnchored && !body.endsWith("*")) {
    const last = segments.pop() || "";
    if (!target.endsWith(last)) return false;
    endLimit = target.length - last.length;
  }

  for (const segment of segments) {
    if (!segment) continue;
    const found = target.indexOf(segment, position);
    if (found < 0 || found + segment.length > endLimit) return false;
    position = found + segment.length;
  }
  return position <= endLimit;
}

// robots.txt keeps the published group semantics: the group whose user agent
// token matches this reader most specifically wins, groups at that same
// specificity are merged, and the wildcard group is only a fallback. A group
// that names another crawler, Googlebot included, is never selected for this
// reader. Oversized or over-complex input throws instead of being read
// partially, because a dropped rule can be an exclusion.
export function parseRobotsTxt(text = "", product = SOURCE_POLICY_PRODUCT) {
  const input = String(text ?? "");
  if (Buffer.byteLength(input, "utf8") > ROBOTS_BYTES_LIMIT) {
    throw new Error("robots.txt exceeds the configured byte limit");
  }
  const lines = input.split(/\r?\n/u);
  if (lines.length > ROBOTS_LINES_LIMIT) throw new Error("robots.txt has too many lines");
  const groups = [];
  let group;
  let ruleCount = 0;
  for (const rawLine of lines) {
    if (Buffer.byteLength(rawLine, "utf8") > ROBOTS_LINE_BYTES_LIMIT) {
      throw new Error("robots.txt contains an oversized line");
    }
    const line = rawLine.replace(/#.*$/u, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const key = line.slice(0, separator).trim().toLocaleLowerCase("en");
    const directive = line.slice(separator + 1).trim();
    if (key === "user-agent") {
      if (!group || group.hasDirectives) {
        if (groups.length >= ROBOTS_GROUPS_LIMIT) throw new Error("robots.txt has too many groups");
        group = { agents: [], rules: [], hasDirectives: false };
        groups.push(group);
      }
      if (group.agents.length >= ROBOTS_AGENTS_PER_GROUP_LIMIT) {
        throw new Error("robots.txt has too many user agents in one group");
      }
      group.agents.push(directive.slice(0, 120).toLocaleLowerCase("en"));
      continue;
    }
    if (!group || (key !== "allow" && key !== "disallow")) continue;
    group.hasDirectives = true;
    if (directive || key === "allow") {
      if (directive.length > ROBOTS_PATTERN_LENGTH_LIMIT
        || (directive.match(/\*/gu) || []).length > ROBOTS_WILDCARDS_LIMIT) {
        throw new Error("robots.txt contains an over-complex rule");
      }
      ruleCount += 1;
      if (ruleCount > ROBOTS_RULES_LIMIT) throw new Error("robots.txt has too many rules");
      group.rules.push({
        type: key,
        pattern: directive,
        specificity: directive.replace(/[\*$]/gu, "").length,
      });
    }
  }
  const normalizedProduct = String(product ?? "").toLocaleLowerCase("en");
  // Only groups that name this reader are candidates, and only the most
  // specific naming is used. The wildcard group never adds rules to a group that
  // already names this reader.
  const namedMatches = groups
    .map((candidate) => ({
      group: candidate,
      specificity: candidate.agents.reduce((longest, agent) => (
        agent && agent !== "*" && normalizedProduct !== "" && normalizedProduct.includes(agent)
          ? Math.max(longest, agent.length)
          : longest
      ), 0),
    }))
    .filter(({ specificity }) => specificity > 0);
  const maximumSpecificity = namedMatches
    .reduce((maximum, { specificity }) => Math.max(maximum, specificity), 0);
  const selected = maximumSpecificity > 0
    ? namedMatches
      .filter(({ specificity }) => specificity === maximumSpecificity)
      .map(({ group: match }) => match)
    : groups.filter(({ agents }) => agents.includes("*"));
  return selected.flatMap(({ rules }) => rules);
}

export function robotsAllowsUrl(url, rules = []) {
  let target;
  try {
    const parsed = new URL(String(url ?? ""));
    target = `${parsed.pathname}${parsed.search}`;
  } catch {
    return false;
  }
  if (!Array.isArray(rules)) return false;
  if (target.length > ROBOTS_TARGET_LENGTH_LIMIT || rules.length > ROBOTS_RULES_LIMIT) return false;
  const matches = rules
    .filter((rule) => rule && typeof rule.pattern === "string" && rule.pattern !== ""
      && robotsPatternMatches(rule.pattern, target))
    .sort((left, right) => (right.specificity ?? right.pattern.replace(/[\*$]/gu, "").length)
      - (left.specificity ?? left.pattern.replace(/[\*$]/gu, "").length)
      || Number(right.type === "allow") - Number(left.type === "allow"));
  return matches.length === 0 || matches[0].type === "allow";
}

function headerInstanceWitness(value) {
  if (value === undefined || value === null) {
    return { supplied: false, instances: [], joined: false, readable: true };
  }
  if (Array.isArray(value)) {
    return {
      supplied: true,
      instances: value.map((entry) => String(entry ?? "")),
      joined: false,
      readable: true,
    };
  }
  if (typeof value === "string") {
    // A single string may be the join of several header instances, so its later
    // segments cannot be attributed to a crawler with confidence.
    return { supplied: true, instances: [value], joined: true, readable: true };
  }
  if (typeof value?.get === "function") {
    const got = value.get("x-robots-tag");
    return got === undefined || got === null
      ? { supplied: true, instances: [], joined: false, readable: true }
      : { supplied: true, instances: [String(got)], joined: true, readable: true };
  }
  if (typeof value === "object") {
    const key = Object.keys(value)
      .find((name) => name.toLocaleLowerCase("en") === "x-robots-tag");
    if (key === undefined) return { supplied: true, instances: [], joined: false, readable: true };
    const nested = headerInstanceWitness(value[key]);
    return { ...nested, supplied: true };
  }
  // The witness arrived in a shape this reader cannot attribute, so nothing is
  // read out of it and the caller has to fail closed.
  return { supplied: true, instances: [], joined: false, readable: false };
}

function freshDirectiveState() {
  return {
    noindex: false,
    nosnippet: false,
    noarchive: false,
    maxSnippetChars: null,
    unavailableAfter: null,
    maxImagePreview: null,
    maxVideoPreview: null,
    unknown: [],
    applied: [],
    ambiguous: false,
    truncated: false,
  };
}

function directiveTokens(value) {
  const raw = String(value ?? "").toLocaleLowerCase("en").split(/[\s,;]+/u).filter(Boolean);
  const tokens = [];
  for (let index = 0; index < raw.length; index += 1) {
    const token = raw[index];
    if (token.endsWith(":") && index + 1 < raw.length) {
      // A directive and its value can arrive with a space between them.
      tokens.push(`${token}${raw[index + 1]}`);
      index += 1;
      continue;
    }
    tokens.push(token);
  }
  return tokens;
}

function tokenName(token) {
  const separator = token.indexOf(":");
  return separator < 0 ? token : token.slice(0, separator);
}

function isRestrictingToken(token) {
  return RESTRICTING_TOKENS.has(tokenName(token));
}

const ROBOTS_AGENTS_PER_GROUP_LIMIT = 64;

function mergeUnavailableAfter(state, stamp) {
  if (!Number.isFinite(stamp)) {
    state.ambiguous = true;
    return;
  }
  const iso = new Date(stamp).toISOString();
  // The earliest declaration is the one the publisher asked for; a later,
  // longer window must never extend the availability of the document.
  state.unavailableAfter = state.unavailableAfter === null || iso < state.unavailableAfter
    ? iso
    : state.unavailableAfter;
}

function readMaxSnippet(argument, state) {
  if (argument === undefined || argument === "") {
    // The publisher asked for a limit this reader cannot read, so the limit is
    // treated as the tightest one instead of being dropped.
    state.ambiguous = true;
    state.maxSnippetChars = 0;
    return;
  }
  if (argument === "-1") {
    state.applied.push("max-snippet:-1");
    return;
  }
  if (!/^\d{1,9}$/u.test(argument)) {
    state.ambiguous = true;
    state.maxSnippetChars = 0;
    return;
  }
  const limit = Number(argument);
  state.maxSnippetChars = state.maxSnippetChars === null
    ? limit
    : Math.min(state.maxSnippetChars, limit);
  state.applied.push(`max-snippet:${limit}`);
}

function readDirectiveText(value, state) {
  let text = String(value ?? "").toLocaleLowerCase("en");
  // `unavailable_after` carries a date with spaces in it, so it is taken from
  // the raw value before the directive list is split into tokens.
  const unavailable = text.match(/unavailable[_-]after\s*:\s*([^\s,;][^,;]*)/u);
  if (unavailable) {
    mergeUnavailableAfter(state, Date.parse(unavailable[1].trim()));
    text = text.replace(unavailable[0], " ");
  }
  for (const token of directiveTokens(text)) {
    const name = tokenName(token);
    const separator = token.indexOf(":");
    const argument = separator < 0 ? "" : token.slice(separator + 1);
    switch (name) {
      case "index":
      case "all":
      case "follow":
      case "nofollow":
      case "indexifembedded":
      case "noimageindex":
      case "notranslate":
        state.applied.push(token);
        break;
      case "noindex":
      case "none":
        state.noindex = true;
        state.applied.push(token);
        break;
      case "nosnippet":
        state.nosnippet = true;
        state.applied.push(token);
        break;
      case "noarchive":
        state.noarchive = true;
        state.applied.push(token);
        break;
      case "max-snippet":
        readMaxSnippet(argument, state);
        break;
      case "max-image-preview":
        state.maxImagePreview = argument || null;
        state.applied.push(token);
        break;
      case "max-video-preview":
        state.maxVideoPreview = argument || null;
        state.applied.push(token);
        break;
      case "unavailable_after":
      case "unavailable-after":
        mergeUnavailableAfter(state, Date.parse(argument));
        break;
      default:
        // An unrecognised directive is evidence of publisher intent, not a rule
        // this reader may interpret, so it is preserved and decides nothing.
        state.unknown.push(token);
        break;
    }
  }
}

function headerScopeOf(value, productName) {
  const text = cleanText(value).toLocaleLowerCase("en");
  const scoped = text.match(HEADER_SCOPE_PATTERN);
  if (!scoped) return { scope: "generic", directives: text, name: null };
  const name = scoped[1];
  const directives = text.slice(scoped[0].length);
  if (GENERIC_SCOPES.has(name) || DIRECTIVE_NAME_TOKENS.has(name)) {
    // The prefix is directive grammar, not a crawler name.
    return { scope: "generic", directives: text, name: null };
  }
  if (productName !== "" && name === productName) return { scope: "product", directives, name };
  return { scope: "other", directives: "", name };
}

function joinedValueIsAmbiguous(value) {
  // A joined value may have merged a later header instance into this one, so a
  // restriction in a later segment cannot be attributed with confidence.
  return String(value).split(",").slice(1)
    .some((segment) => directiveTokens(segment).some(isRestrictingToken));
}

// Reads the published page level policy: every X-Robots-Tag instance with its
// own crawler scope, plus the robots meta tags. Repeated header values keep
// their scope, a value for another crawler (Googlebot included) is recorded and
// ignored, and anything this reader cannot attribute fails closed.
export function pageRobotsPolicy(html = "", headerInstances = undefined, product = SOURCE_POLICY_PRODUCT) {
  const productName = cleanText(product).toLocaleLowerCase("en");
  const state = freshDirectiveState();
  const otherScopes = [];
  const otherMetaScopes = [];
  const header = headerInstanceWitness(headerInstances);
  if (!header.readable) state.ambiguous = true;

  let scannedBytes = 0;
  for (const [index, instance] of header.instances.entries()) {
    if (index >= ROBOTS_HEADER_INSTANCE_LIMIT
      || scannedBytes + instance.length > ROBOTS_HEADER_TEXT_LIMIT) {
      // A restriction that arrived after the cut would pass unread, so the whole
      // block is treated as restricted instead of guessed at.
      state.truncated = true;
      break;
    }
    scannedBytes += instance.length;
    const scoped = headerScopeOf(instance, productName);
    if (scoped.scope !== "other") {
      readDirectiveText(scoped.directives, state);
      continue;
    }
    otherScopes.push(scoped.name);
    if (header.joined && joinedValueIsAmbiguous(instance)) state.ambiguous = true;
  }

  const pageReadable = typeof html === "string" && html.trim() !== "";
  if (typeof html !== "string") state.ambiguous = true;
  if (pageReadable) {
    const $ = load(html);
    const metaTags = $("meta[name]").toArray();
    for (const element of metaTags.slice(0, ROBOTS_META_LIMIT)) {
      const name = cleanText($(element).attr("name")).toLocaleLowerCase("en");
      const content = $(element).attr("content");
      if (content === undefined) continue;
      const applies = name === "robots" || name === "*"
        || (productName !== "" && name === productName);
      if (!applies) {
        otherMetaScopes.push(name);
        continue;
      }
      const scoped = headerScopeOf(content, productName);
      if (scoped.scope === "other") {
        otherMetaScopes.push(`${name}:${scoped.name}`);
        continue;
      }
      readDirectiveText(scoped.directives, state);
    }
    if (metaTags.length > ROBOTS_META_LIMIT) state.truncated = true;
  }

  const witness = { page: pageReadable, headers: header.supplied };
  const readable = pageReadable || witness.headers;
  const forced = !readable || state.truncated || state.ambiguous;
  return {
    readable,
    witness,
    noindex: forced ? true : state.noindex,
    nosnippet: forced ? true : state.nosnippet,
    noarchive: forced ? true : state.noarchive,
    maxSnippetChars: forced ? 0 : state.maxSnippetChars,
    ambiguous: state.ambiguous,
    truncated: state.truncated,
    directives: [...new Set(state.applied)].sort(),
    observations: {
      otherScopes: [...new Set(otherScopes)],
      otherMetaScopes: [...new Set(otherMetaScopes)],
      unknown: [...new Set(state.unknown)],
      unavailableAfter: state.unavailableAfter,
      maxImagePreview: state.maxImagePreview,
      maxVideoPreview: state.maxVideoPreview,
    },
  };
}

function originOf(value) {
  try {
    const url = new URL(String(value ?? ""));
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

function observeRobots(observation, url, observedAt, contentKind) {
  const declared = observation && typeof observation === "object" ? observation : null;
  const origin = nullableText(declared?.origin, 200) || originOf(url);
  const checkedAt = nullableText(declared?.checkedAt, 64) || observedAt;
  let status;
  if (typeof declared?.status === "string" && ROBOTS_STATUSES.has(declared.status)) {
    status = declared.status;
  } else if (!PUBLISHER_KINDS.has(contentKind)) {
    // Our own authored or harvested structured material is not fetched from a
    // publisher page, so robots.txt does not address it.
    status = "not-applicable";
  } else {
    // A fetched body with no usable robots witness cannot be shown to be
    // permitted, so it is treated as unreadable.
    status = "unreadable";
  }
  return { origin, status, checkedAt };
}

function observeRightsReview(value) {
  if (value && typeof value === "object"
    && value.status === "reviewed"
    && typeof value.reference === "string"
    && value.reference.trim() !== ""
    && value.reference.length <= 200) {
    return { status: "reviewed", reference: value.reference.trim() };
  }
  // A public URL, an allowed host, a robots Allow, a content hash and a review
  // clock are technical facts and never a rights decision.
  return { status: "unreviewed", reference: null };
}

function ignoredClaimsOf(input) {
  if (!input || typeof input !== "object") return [];
  return Object.keys(input)
    .filter((key) => CLAIMS_PATTERN.test(key) && Boolean(input[key]))
    .sort();
}

function policyDirectives(page, { witnessApplicable, readable }) {
  const pageValues = witnessApplicable ? page : null;
  return {
    noindex: pageValues ? pageValues.noindex : false,
    nosnippet: pageValues ? pageValues.nosnippet : false,
    noarchive: pageValues ? pageValues.noarchive : false,
    maxSnippetChars: pageValues ? pageValues.maxSnippetChars : null,
    unavailableAfter: pageValues ? pageValues.observations.unavailableAfter : null,
    readable,
    ambiguous: pageValues ? pageValues.ambiguous : false,
    truncated: pageValues ? pageValues.truncated : false,
  };
}

// Records one observed source: what the publisher asked for, what this
// application may do with the copy, and that no rights review has happened.
export function observeSourcePolicy(input = {}) {
  const source = input && typeof input === "object" ? input : {};
  const {
    requestedUrl = "",
    finalUrl = "",
    product = SOURCE_POLICY_PRODUCT,
    observedAt = "",
    contentKind: declaredContentKind = "",
    bodyHash = "",
    artifactHash = "",
    robotsObservation = null,
    html = "",
    headerInstances = undefined,
    rightsReview: declaredRightsReview = null,
  } = source;

  const contentKind = SOURCE_CONTENT_KINDS.includes(declaredContentKind)
    ? declaredContentKind
    : "legacy-unknown";
  const productName = boundedText(product, 120) || SOURCE_POLICY_PRODUCT;
  const observedAtValue = nullableText(observedAt, 64);
  const page = pageRobotsPolicy(html, headerInstances, productName);
  const robots = observeRobots(robotsObservation, finalUrl || requestedUrl, observedAtValue, contentKind);

  const publisherKind = PUBLISHER_KINDS.has(contentKind);
  const witnessApplicable = publisherKind || page.witness.page || page.witness.headers;
  const readable = publisherKind ? page.readable : true;
  const directives = policyDirectives(page, { witnessApplicable, readable });
  const timed = observedAtValue !== null;
  const copyAllowed = COPY_KINDS.has(contentKind)
    && readable
    && timed
    && ROBOTS_ALLOWING_STATUSES.has(robots.status)
    && !directives.noindex;

  const use = {
    retainBody: copyAllowed && !directives.noarchive,
    indexBody: copyAllowed,
    displaySnippet: copyAllowed
      && !directives.nosnippet
      && directives.maxSnippetChars !== 0,
    answerEvidence: copyAllowed
      && !directives.nosnippet
      && directives.maxSnippetChars !== 0,
  };

  const observations = {
    otherScopes: page.observations.otherScopes,
    otherMetaScopes: page.observations.otherMetaScopes,
    unknown: page.observations.unknown,
    maxImagePreview: page.observations.maxImagePreview,
    maxVideoPreview: page.observations.maxVideoPreview,
    witness: { ...page.witness },
    ignoredClaims: ignoredClaimsOf(source),
    bodyHashPresent: nullableText(bodyHash, 128) !== null,
    artifactHashPresent: nullableText(artifactHash, 128) !== null,
  };

  return Object.freeze({
    version: SOURCE_POLICY_VERSION,
    contentKind,
    resourceKey: sourceResourceKey(finalUrl || requestedUrl),
    bodyHash: nullableText(bodyHash, 128),
    artifactHash: nullableText(artifactHash, 128),
    product: productName,
    observedAt: observedAtValue,
    robots: Object.freeze({ ...robots }),
    directives: Object.freeze({ ...directives }),
    use: Object.freeze({ ...use }),
    rightsReview: Object.freeze(observeRightsReview(declaredRightsReview)),
    observations: Object.freeze({ ...observations }),
  });
}

const CANONICAL_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u;
const HASH_PATTERN = /^[a-f0-9]{64}$/u;

function isCanonicalTimestamp(value) {
  if (typeof value !== "string" || !CANONICAL_TIMESTAMP_PATTERN.test(value)) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
}

function isHash(value) {
  return typeof value === "string" && HASH_PATTERN.test(value);
}

function validateSourcePolicy(value) {
  if (!value || typeof value !== "object") {
    return { ok: false, reason: "source-policy-missing", value: null };
  }
  const invalid = { ok: false, reason: "source-policy-invalid", value: null };
  if (value.version !== SOURCE_POLICY_VERSION) return invalid;
  if (!SOURCE_CONTENT_KINDS.includes(value.contentKind)) return invalid;
  if (!isCanonicalTimestamp(value.observedAt)) return invalid;
  if (typeof value.resourceKey !== "string"
    || value.resourceKey === ""
    || value.resourceKey.length > 2_000) {
    return invalid;
  }
  for (const key of ["bodyHash", "artifactHash"]) {
    const hashValue = value[key];
    if (hashValue === null || hashValue === undefined) continue;
    if (!isHash(hashValue)) return invalid;
  }
  // A body read from a publisher is bound to the bytes that were read, so it
  // carries a body hash. Authored and structured rows may carry none.
  if (PUBLISHER_KINDS.has(value.contentKind) && !isHash(value.bodyHash)) return invalid;
  const use = value.use;
  if (!use || typeof use !== "object") return invalid;
  for (const key of ["retainBody", "indexBody", "displaySnippet", "answerEvidence"]) {
    if (typeof use[key] !== "boolean") return invalid;
  }
  const directives = value.directives;
  if (!directives || typeof directives !== "object") return invalid;
  for (const key of ["noindex", "nosnippet", "noarchive"]) {
    if (typeof directives[key] !== "boolean") return invalid;
  }
  if (directives.readable !== undefined && typeof directives.readable !== "boolean") return invalid;
  const limit = directives.maxSnippetChars;
  if (limit !== null && !(Number.isInteger(limit) && limit >= 0)) return invalid;
  if (directives.unavailableAfter !== undefined
    && directives.unavailableAfter !== null
    && !isCanonicalTimestamp(directives.unavailableAfter)) return invalid;
  const robots = value.robots;
  if (!robots || typeof robots !== "object") return invalid;
  if (!ROBOTS_STATUSES.has(robots.status)) return invalid;
  if (robots.origin !== undefined && robots.origin !== null && typeof robots.origin !== "string") {
    return invalid;
  }
  if (robots.checkedAt !== undefined
    && robots.checkedAt !== null
    && !isCanonicalTimestamp(robots.checkedAt)) return invalid;
  // The application choice may be more conservative than the directives, never
  // more permissive. A stored row that contradicts its own witness is invalid,
  // so a hand edited or stale `use` flag cannot revive a nosnippet or noarchive
  // source.
  const witnessAllowsCopy = ROBOTS_ALLOWING_STATUSES.has(robots.status)
    && directives.readable !== false
    && !directives.noindex
    && value.contentKind !== "legacy-unknown";
  const anyUse = use.retainBody || use.indexBody || use.displaySnippet || use.answerEvidence;
  if (!witnessAllowsCopy && anyUse) return invalid;
  if (directives.noarchive && use.retainBody) return invalid;
  if ((directives.nosnippet || directives.maxSnippetChars === 0)
    && (use.displaySnippet || use.answerEvidence)) return invalid;
  if (use.answerEvidence && !use.displaySnippet) return invalid;
  if (use.displaySnippet && !use.indexBody) return invalid;
  return { ok: true, reason: null, value };
}

// The delivered witness is the complete policy the binding hashes, minus the
// private observations. A consumer can rehash it, compare `resourceKey` and
// `bodyHash` with the record it holds, and project text without the stored row,
// so the same shape can travel through the corpus and the live reader.
export function sourcePolicyWitness(value) {
  const validation = validateSourcePolicy(value);
  if (!validation.ok) return null;
  const policy = validation.value;
  const directives = policy.directives;
  const use = policy.use;
  const robots = policy.robots;
  const rightsReview = policy.rightsReview || { status: "unreviewed", reference: null };
  return Object.freeze({
    version: policy.version,
    contentKind: policy.contentKind,
    resourceKey: policy.resourceKey,
    bodyHash: policy.bodyHash ?? null,
    artifactHash: policy.artifactHash ?? null,
    product: policy.product ?? null,
    observedAt: policy.observedAt,
    robots: Object.freeze({
      origin: robots.origin ?? null,
      status: robots.status,
      checkedAt: robots.checkedAt ?? null,
    }),
    directives: Object.freeze({
      noindex: Boolean(directives.noindex),
      nosnippet: Boolean(directives.nosnippet),
      noarchive: Boolean(directives.noarchive),
      maxSnippetChars: directives.maxSnippetChars ?? null,
      unavailableAfter: directives.unavailableAfter ?? null,
      readable: directives.readable !== false,
    }),
    use: Object.freeze({
      retainBody: Boolean(use.retainBody),
      indexBody: Boolean(use.indexBody),
      displaySnippet: Boolean(use.displaySnippet),
      answerEvidence: Boolean(use.answerEvidence),
    }),
    rightsReview: Object.freeze({
      status: rightsReview.status ?? "unreviewed",
      reference: rightsReview.reference ?? null,
    }),
  });
}

// A stable provenance string for the decision. It covers the observed witness
// and the application choice, never the copied text, so an evidence record can
// be rechecked without holding a body.
export function sourcePolicyBinding(policy) {
  const validation = validateSourcePolicy(policy);
  if (!validation.ok) return null;
  const value = validation.value;
  const canonical = JSON.stringify([
    value.version,
    value.contentKind,
    nullableText(value.resourceKey, 2_000),
    nullableText(value.bodyHash, 128),
    nullableText(value.artifactHash, 128),
    nullableText(value.product, 120),
    value.observedAt,
    nullableText(value.robots.status, 40),
    nullableText(value.robots.origin, 200),
    nullableText(value.robots.checkedAt, 64),
    Boolean(value.directives.noindex),
    Boolean(value.directives.nosnippet),
    Boolean(value.directives.noarchive),
    value.directives.maxSnippetChars ?? null,
    nullableText(value.directives.unavailableAfter, 64),
    value.directives.readable !== false,
    Boolean(value.use.indexBody),
    Boolean(value.use.displaySnippet),
    Boolean(value.use.answerEvidence),
    Boolean(value.use.retainBody),
    nullableText(value.rightsReview?.status, 40) || "unreviewed",
  ]);
  return `${SOURCE_POLICY_VERSION}:${createHash("sha256").update(canonical).digest("hex")}`;
}

function publicPolicyView(value) {
  if (!value) return null;
  const directives = value.directives || {};
  const use = value.use || {};
  const robots = value.robots || {};
  const rightsReview = value.rightsReview || { status: "unreviewed", reference: null };
  return Object.freeze({
    version: value.version,
    contentKind: value.contentKind,
    robots: Object.freeze({
      origin: robots.origin ?? null,
      status: robots.status ?? null,
      checkedAt: robots.checkedAt ?? null,
    }),
    directives: Object.freeze({
      noindex: Boolean(directives.noindex),
      nosnippet: Boolean(directives.nosnippet),
      noarchive: Boolean(directives.noarchive),
      maxSnippetChars: directives.maxSnippetChars ?? null,
    }),
    use: Object.freeze({
      retainBody: Boolean(use.retainBody),
      indexBody: Boolean(use.indexBody),
      displaySnippet: Boolean(use.displaySnippet),
      answerEvidence: Boolean(use.answerEvidence),
    }),
    rightsReview: Object.freeze({
      status: rightsReview.status ?? "unreviewed",
      reference: rightsReview.reference ?? null,
    }),
  });
}

function linkMetadataOf(document) {
  const link = {};
  for (const field of SOURCE_LINK_FIELDS) {
    const value = document[field];
    if (typeof value === "string" && value !== "") link[field] = value;
  }
  return Object.freeze(link);
}

function denialReason(policy) {
  if (!policy) return null;
  if (policy.contentKind === "legacy-unknown") return "legacy-unknown";
  if (policy.directives?.readable === false) return "source-policy-unreadable";
  const robots = policy.robots?.status;
  if (robots === "disallowed") return "robots-disallowed";
  if (robots === "unreadable") return "robots-unreadable";
  if (policy.directives?.noindex) return "noindex";
  return null;
}

function purposeDenialReason(purpose, policy) {
  const directives = policy.directives || {};
  if (purpose === "snippet" || purpose === "evidence") {
    if (directives.nosnippet) return "nosnippet";
    if (directives.maxSnippetChars === 0) return "max-snippet-0";
    return "use-denied";
  }
  if (purpose === "cache" && directives.noarchive) return "noarchive";
  return "use-denied";
}

function purposeLimit(purpose, policy, requestedLimit) {
  // A caller may state its own bound for the field it publishes, which the
  // corpus does for its 15,000 character body. A publisher cap still wins when
  // it is finite, so an override can never widen a max-snippet limit.
  const base = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, SOURCE_INDEX_MAX_CHARS)
    : PURPOSE_LIMITS[purpose];
  const publisherCap = policy?.directives?.maxSnippetChars;
  if ((purpose === "snippet" || purpose === "evidence")
    && Number.isInteger(publisherCap)
    && publisherCap >= 0) {
    return Math.min(base, publisherCap);
  }
  return base;
}

// Projects one source document for one purpose. The record is never mutated and
// no approved URL is rewritten: link metadata stays in `link`, copied text is a
// capped copy in exactly one field, and every withheld field is named with its
// reason. A missing, unreadable, unknown or expired policy withholds all copied
// text while the link metadata survives.
export function projectSourceText(document = {}, options = {}) {
  const { purpose, now, limit: requestedLimit } = options && typeof options === "object" ? options : {};
  if (!SOURCE_TEXT_PURPOSES.includes(purpose)) {
    throw new TypeError(`Unknown source text purpose: ${String(purpose)}`);
  }
  if (!document || typeof document !== "object") {
    throw new TypeError("projectSourceText needs a source document");
  }

  const stored = document._sourcePolicy ?? document.metadata?.source_policy ?? null;
  const validation = validateSourcePolicy(stored);
  const policy = validation.ok ? validation.value : null;
  const link = linkMetadataOf(document);
  const copy = { ...document };
  for (const field of SOURCE_TEXT_FIELDS) delete copy[field];
  delete copy._sourcePolicy;
  if (copy.metadata && typeof copy.metadata === "object") copy.metadata = { ...copy.metadata };

  const clock = toClock(now);
  const clockValid = clock !== null;
  const expiresAt = policy?.directives?.unavailableAfter
    ? Date.parse(policy.directives.unavailableAfter)
    : null;
  const expired = Number.isFinite(expiresAt) && clockValid && clock.getTime() >= expiresAt;

  let reason = null;
  if (!validation.ok) reason = validation.reason;
  else if (!clockValid) reason = "clock-invalid";
  else if (expired) reason = "unavailable-after";
  else {
    // The witness belongs to one resource. A policy observed for another URL is
    // not permission for this body, and the document URL is never rewritten.
    const documentResourceKey = sourceResourceKey(document.url);
    reason = documentResourceKey && policy.resourceKey === documentResourceKey
      ? denialReason(policy)
      : "source-policy-mismatch";
  }

  const useAllowed = policy ? policy.use?.[PURPOSE_USE_KEY[purpose]] === true : false;
  if (reason === null && !useAllowed) reason = purposeDenialReason(purpose, policy);
  const permitted = reason === null;

  let text = null;
  let textField = null;
  const textLimit = purposeLimit(purpose, policy, requestedLimit);
  if (permitted) {
    for (const field of PURPOSE_FIELDS[purpose]) {
      const extracted = extractSourceText(document[field]);
      if (extracted === "") continue;
      text = truncateText(extracted, textLimit);
      textField = field;
      break;
    }
    if (textField !== null) copy[textField] = text;
    // A model answer is evidence for the evidence purpose only, and it shares
    // the same character budget as the quoted source text, so one source can
    // never hand out two copies of its cap.
    const answer = purpose === "evidence" ? extractSourceText(document.answer) : "";
    const remaining = Math.max(0, textLimit - String(text ?? "").length);
    if (answer !== "" && remaining > 0 && policy.use?.answerEvidence === true) {
      copy.answer = truncateText(answer, remaining);
    }
  }

  const withheld = [];
  for (const field of SOURCE_TEXT_FIELDS) {
    if (field === textField) continue;
    if (field === "answer" && copy.answer !== undefined) continue;
    withheld.push(Object.freeze({ field, reason: permitted ? "purpose-scope" : reason }));
  }

  return Object.freeze({
    purpose,
    permitted,
    reason,
    binding: policy ? sourcePolicyBinding(policy) : null,
    link,
    text,
    textField,
    textLimit,
    withheld: Object.freeze(withheld),
    policy: publicPolicyView(policy),
    document: Object.freeze(copy),
  });
}
