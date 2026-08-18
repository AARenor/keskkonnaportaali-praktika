const GEOSERVER_BASE = "https://gsavalik.envir.ee/geoserver";
const CADASTRE_PATTERN = /\b\d{5}:\d{3}:\d{4}\b/u;
const MAX_RESPONSE_BYTES = 3_000_000;
const snapshotCache = new Map();
const MAX_CACHE_ENTRIES = 100;

const SOURCE_DEFINITIONS = [
  {
    id: "official-cadastre-wfs",
    title: "Maa- ja Ruumiameti WMS/WFS/WCS teenused",
    organization: "Maa- ja Ruumiamet",
    type: "Avalik ruumiandmeteenus",
    url: "https://geoportaal.maaamet.ee/est/teenused/wms-wfs-wcs-teenused-p65.html",
    sourceTier: "official",
    tags: ["WFS", "kataster", "katastriüksus", "ruumiandmed"],
  },
  {
    id: "official-forest-register-wfs",
    title: "Metsaregistri andmestikud",
    organization: "Keskkonnaagentuur / Keskkonnaportaal",
    type: "Avalik ruumiandmeteenus",
    url: "https://keskkonnaportaal.ee/et/avaandmed/metsaregistri-andmestikud",
    sourceTier: "official",
    tags: ["WFS", "metsaregister", "kataster", "metsaeraldis"],
  },
];

export function cadastreSourceDocuments(published = new Date().toISOString().slice(0, 10).split("-").reverse().join(".")) {
  return SOURCE_DEFINITIONS.map((source, index) => ({
    ...source,
    published,
    summary: index === 0
      ? "Maa- ja Ruumiameti avalik WFS annab katastritunnuse alusel informatiivse katastriüksuse väljavõtte."
      : "Keskkonnaportaali Metsaregistri avalik WFS annab katastritunnusega seotud metsaeraldiste kirjed.",
    topics: [...source.tags],
    retrieval: "official-service-directory",
    _answerEvidenceEligible: false,
  }));
}

export function extractCadastreNumber(value = "") {
  return String(value).match(CADASTRE_PATTERN)?.[0] || null;
}

function boundedText(value, maxLength = 240) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, maxLength);
}

function finitePositive(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function wfsUrl(workspace, typeName, cqlFilter, propertyName, count) {
  const url = new URL(`${GEOSERVER_BASE}/${workspace}/wfs`);
  url.searchParams.set("service", "WFS");
  url.searchParams.set("version", "2.0.0");
  url.searchParams.set("request", "GetFeature");
  url.searchParams.set("typeNames", typeName);
  url.searchParams.set("outputFormat", "application/json");
  url.searchParams.set("CQL_FILTER", cqlFilter);
  url.searchParams.set("propertyName", propertyName);
  url.searchParams.set("count", String(count));
  return url;
}

async function fetchFeatureCollection(url, timeoutMs = 4_800, externalSignal) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  const signal = externalSignal && typeof AbortSignal.any === "function"
    ? AbortSignal.any([controller.signal, externalSignal])
    : controller.signal;
  try {
    const response = await fetch(url, {
      headers: {
        Accept: "application/geo+json,application/json",
        "User-Agent": "Keskkonnaportaali-praktika/3.0 (+https://praktika.arleserver.cfd)",
      },
      redirect: "error",
      signal,
    });
    if (!response.ok) throw new Error(`Official WFS returned ${response.status}`);
    const declaredSize = Number(response.headers.get("content-length") || 0);
    if (declaredSize > MAX_RESPONSE_BYTES) throw new Error("Official WFS response is too large");
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength > MAX_RESPONSE_BYTES) throw new Error("Official WFS response is too large");
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    if (!payload || payload.type !== "FeatureCollection" || !Array.isArray(payload.features)) {
      throw new Error("Official WFS returned an invalid feature collection");
    }
    return payload.features;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeCadastre(features, cadastreNumber) {
  if (!features.length) return { status: "not_found" };
  const properties = features.map((feature) => feature?.properties).filter(Boolean);
  if (!properties.length || properties.some((item) => boundedText(item.tunnus) !== cadastreNumber)) {
    throw new Error("Official cadastre WFS returned mismatched data");
  }
  const item = properties[0];
  const areaSquareMeters = finitePositive(item.pindala);
  if (!areaSquareMeters) throw new Error("Official cadastre WFS returned an invalid area");
  return {
    status: "found",
    number: cadastreNumber,
    address: boundedText(item.l_aadress, 300),
    municipality: boundedText(item.ov_nimi),
    county: boundedText(item.mk_nimi),
    intendedUse: boundedText(item.siht1),
    ownership: boundedText(item.omvorm),
    areaHectares: Math.round(areaSquareMeters / 100) / 100,
  };
}

function normalizeForest(features, cadastreNumber) {
  if (!features.length) return { status: "not_found", count: 0 };
  const unique = new Map();
  for (const feature of features) {
    const item = feature?.properties;
    if (!item || boundedText(item.katastri_nr) !== cadastreNumber) {
      throw new Error("Official forest WFS returned mismatched data");
    }
    const id = boundedText(item.id || item.sys_id);
    const area = finitePositive(item.pindala);
    if (!id || !area) throw new Error("Official forest WFS returned invalid stand data");
    if (!unique.has(id)) unique.set(id, { area, inventoryDate: boundedText(item.invent_kp, 40).slice(0, 10) });
  }
  const inventoryDates = [...unique.values()].map((item) => item.inventoryDate).filter(Boolean).sort();
  return {
    status: "found",
    count: unique.size,
    areaHectares: Math.round([...unique.values()].reduce((sum, item) => sum + item.area, 0) * 100) / 100,
    oldestInventoryDate: inventoryDates[0] || null,
    newestInventoryDate: inventoryDates.at(-1) || null,
    truncated: features.length >= 250,
  };
}

export function normalizeSpatialState(kind, features, cadastreNumber) {
  try {
    return kind === "cadastre"
      ? normalizeCadastre(features, cadastreNumber)
      : normalizeForest(features, cadastreNumber);
  } catch {
    return { status: "unavailable" };
  }
}

export function composeCadastreAnswer(query, cadastreNumber, snapshot) {
  const extractedAt = snapshot.extractedAt || new Date().toISOString();
  const dateLabel = extractedAt.slice(0, 10).split("-").reverse().join(".");
  const cadastre = snapshot.cadastre;
  const forest = snapshot.forest;
  let intro;
  if (cadastre.status === "found") {
    const location = [cadastre.address, cadastre.municipality, cadastre.county].filter(Boolean).join(", ");
    intro = `Maa- ja Ruumiameti avaliku katastri WFS-i informatiivse väljavõtte järgi on ${cadastreNumber}${location ? ` (${location})` : ""} pindala ${cadastre.areaHectares.toLocaleString("et-EE")} ha${cadastre.intendedUse ? ` ja sihtotstarve ${cadastre.intendedUse.toLocaleLowerCase("et")}` : ""}.`;
  } else if (cadastre.status === "not_found") {
    intro = `Maa- ja Ruumiameti avalik katastri WFS vastas, kuid tunnusele ${cadastreNumber} vastavat kehtivat katastriüksust ei leitud. Väljavõte on informatiivne ja mitteametlik.`;
  } else {
    intro = `Maa- ja Ruumiameti avalik katastri WFS ei andnud kasutatavat vastust ettenähtud aja jooksul. Sellest ei saa järeldada, et katastriüksust ei ole.`;
  }

  let forestText;
  if (forest.status === "found") {
    const countLabel = forest.truncated ? `vähemalt ${forest.count}` : String(forest.count);
    const period = forest.oldestInventoryDate && forest.newestInventoryDate
      ? ` Inventeerimiskuupäevad jäävad vahemikku ${forest.oldestInventoryDate}–${forest.newestInventoryDate}.`
      : "";
    forestText = `Metsaregistri avalik WFS tagastas ${countLabel} eraldise kirjet; kirjepindalade summa on ${forest.areaHectares.toLocaleString("et-EE")} ha.${period}`;
  } else if (forest.status === "not_found") {
    forestText = "Metsaregistri avalik WFS vastas edukalt, kuid selle katastritunnusega eraldise kirjeid ei leidnud. See ei tõenda, et kinnistul metsa ei ole.";
  } else {
    forestText = "Metsaregistri avalik WFS ei vastanud ettenähtud aja jooksul. Puuduv vastus ei tähenda, et kinnistul metsa või piiranguid ei ole.";
  }

  const sources = cadastreSourceDocuments(dateLabel).map((source, index) => ({
    ...source,
    citation: index + 1,
    sourceSystem: source.organization,
    summary: `Avaliku teenuse väljavõte ${dateLabel}.`,
    locator: index === 0 ? "kataster:ky_kehtiv" : "metsaregister:eraldis",
  }));

  return {
    query,
    total: sources.length,
    generatedAt: extractedAt,
    answer: {
      eyebrow: "Avalike andmete koondvaade",
      title: `Katastriüksus ${cadastreNumber}`,
      intro,
      introCitations: [1],
      parts: [{ title: "Metsaregistri kirjed", text: forestText, citations: [2] }],
      note: "WFS-väljavõte on informatiivne ja mitteametlik hetkeseis. Metsaregistri inventeerimisandmed võivad olla ajaliselt vanemad; õigusliku otsuse puhul kontrolli ametlikku registrit ja kehtivaid alusdokumente.",
    },
    sources,
    clarification: null,
    related: [
      "Mis vahe on SMI-l ja Metsaregistril?",
      "Kas metsateatis tähendab, et raie toimus?",
      "Kui suur osa metsast on kaitstud?",
    ],
    evidence: {
      kind: "official-spatial-snapshot",
      documentIds: sources.map((source) => source.id),
      states: { cadastre: cadastre.status, forest: forest.status },
    },
  };
}

export async function answerCadastreQuestion(query, { signal, deadlineAt } = {}) {
  if (/\b(?:https?|file|ftp|gopher):\/\//iu.test(String(query)) || /<\s*\/?\s*[a-z]/iu.test(String(query))) return null;
  const cadastreNumber = extractCadastreNumber(query);
  if (!cadastreNumber) return null;
  const requestActive = () => !signal?.aborted && (!Number.isFinite(deadlineAt) || Date.now() < deadlineAt);
  if (!requestActive()) {
    const error = new Error("Cadastre request deadline expired");
    error.name = "AbortError";
    throw error;
  }
  const cached = snapshotCache.get(cadastreNumber);
  if (cached && Date.now() - cached.savedAt < cached.ttlMs) {
    return composeCadastreAnswer(query, cadastreNumber, cached.snapshot);
  }

  const cadastreUrl = wfsUrl(
    "kataster",
    "kataster:ky_kehtiv",
    `tunnus='${cadastreNumber}'`,
    "tunnus,pindala,siht1,l_aadress,omvorm,ov_nimi,mk_nimi",
    2,
  );
  const forestUrl = wfsUrl(
    "metsaregister",
    "metsaregister:eraldis",
    `katastri_nr='${cadastreNumber}'`,
    "id,katastri_nr,pindala,invent_kp",
    250,
  );
  const [cadastreResult, forestResult] = await Promise.allSettled([
    fetchFeatureCollection(cadastreUrl, Math.max(1, Math.min(4_800, Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : 4_800)), signal),
    fetchFeatureCollection(forestUrl, Math.max(1, Math.min(4_800, Number.isFinite(deadlineAt) ? deadlineAt - Date.now() : 4_800)), signal),
  ]);
  if (!requestActive()) {
    const error = new Error("Cadastre request deadline expired");
    error.name = "AbortError";
    throw error;
  }
  const snapshot = {
    extractedAt: new Date().toISOString(),
    cadastre: cadastreResult.status === "fulfilled"
      ? normalizeSpatialState("cadastre", cadastreResult.value, cadastreNumber)
      : { status: "unavailable" },
    forest: forestResult.status === "fulfilled"
      ? normalizeSpatialState("forest", forestResult.value, cadastreNumber)
      : { status: "unavailable" },
  };
  const degraded = snapshot.cadastre.status === "unavailable" || snapshot.forest.status === "unavailable";
  if (requestActive()) {
    if (snapshotCache.has(cadastreNumber)) snapshotCache.delete(cadastreNumber);
    snapshotCache.set(cadastreNumber, { savedAt: Date.now(), ttlMs: degraded ? 30_000 : 10 * 60_000, snapshot });
    while (snapshotCache.size > MAX_CACHE_ENTRIES) snapshotCache.delete(snapshotCache.keys().next().value);
  }
  return composeCadastreAnswer(query, cadastreNumber, snapshot);
}
