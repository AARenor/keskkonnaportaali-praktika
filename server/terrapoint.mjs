const CADASTRE_NUMBER = /^\d{5}:\d{3}:\d{4}$/u;
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);
const TERRAPOINT_ORIGIN = "https://terrapoint.ee";

export function validateTerrapointUrl(value, { base = false } = {}) {
  let url;
  try {
    url = new URL(String(value || ""));
  } catch {
    throw new Error("TERRAPOINT_API_URL must be a valid approved HTTPS URL");
  }
  if (url.protocol !== "https:" || url.username || url.password || url.origin !== TERRAPOINT_ORIGIN) {
    throw new Error("Terrapoint requests must use the approved credential-free HTTPS origin");
  }
  if (url.hash || (base && url.search)) {
    throw new Error("TERRAPOINT_API_URL must not contain query parameters or a fragment");
  }
  if (base) {
    url.pathname = url.pathname.replace(/\/+$/u, "");
  }
  return url;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizedString(value, { label, maximumLength, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`Terrapoint returned an invalid ${label}`);
    return "";
  }
  if (typeof value !== "string") throw new Error(`Terrapoint returned an invalid ${label}`);
  const normalized = value.normalize("NFKC").replace(/\s+/gu, " ").trim();
  if ((required && !normalized) || normalized.length > maximumLength) {
    throw new Error(`Terrapoint returned an invalid ${label}`);
  }
  return normalized;
}

function normalizedNumber(value, { label, minimum, maximum, required = false } = {}) {
  if (value === undefined || value === null || value === "") {
    if (required) throw new Error(`Terrapoint returned an invalid ${label}`);
    return null;
  }
  let number = value;
  if (typeof value === "string" && value.length <= 40) {
    const normalized = value.trim().replace(",", ".");
    if (!/^-?(?:\d+(?:\.\d+)?|\.\d+)$/u.test(normalized)) {
      throw new Error(`Terrapoint returned an invalid ${label}`);
    }
    number = Number(normalized);
  }
  if (typeof number !== "number"
    || !Number.isFinite(number)
    || number < minimum
    || number > maximum) {
    throw new Error(`Terrapoint returned an invalid ${label}`);
  }
  return number;
}

function normalizedBoolean(value, label) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "boolean") throw new Error(`Terrapoint returned an invalid ${label}`);
  return value;
}

function normalizedIntersection(container, key) {
  if (container === undefined || container === null) return { intersects: null };
  if (!isRecord(container)) throw new Error(`Terrapoint returned an invalid ${key} status`);
  return { intersects: normalizedBoolean(container.intersects, `${key} intersection`) };
}

function assertBoundedJsonTree(root) {
  const stack = [{ value: root, depth: 0 }];
  let nodes = 0;
  while (stack.length) {
    const { value, depth } = stack.pop();
    nodes += 1;
    if (nodes > 5_000 || depth > 8) throw new Error("Terrapoint returned an oversized data structure");
    if (typeof value === "string") {
      if (value.length > 20_000) throw new Error("Terrapoint returned an oversized string");
      continue;
    }
    if (value === null || ["number", "boolean"].includes(typeof value)) continue;
    if (Array.isArray(value)) {
      if (value.length > 500) throw new Error("Terrapoint returned too many records");
      for (const item of value) stack.push({ value: item, depth: depth + 1 });
      continue;
    }
    if (!isRecord(value)) throw new Error("Terrapoint returned an invalid JSON value");
    const entries = Object.entries(value);
    if (entries.length > 100 || entries.some(([key]) => FORBIDDEN_KEYS.has(key))) {
      throw new Error("Terrapoint returned an invalid object schema");
    }
    for (const [, item] of entries) stack.push({ value: item, depth: depth + 1 });
  }
}

export function validateTerrapointPayload(payload, kind, { expectedNumber } = {}) {
  if (!isRecord(payload)) throw new Error("Terrapoint returned an invalid payload");
  assertBoundedJsonTree(payload);
  if (kind === "address") {
    if (!Array.isArray(payload.results) || payload.results.length > 50) {
      throw new Error("Terrapoint returned an invalid address result set");
    }
    const results = payload.results.map((item) => {
      if (!isRecord(item)) throw new Error("Terrapoint returned an invalid address record");
      const number = normalizedString(item.katastri_nr, {
        label: "address cadastral number",
        maximumLength: 20,
        required: true,
      });
      if (!CADASTRE_NUMBER.test(number)) throw new Error("Terrapoint returned an invalid address record");
      return {
        katastri_nr: number,
        aadress: normalizedString(item.aadress, {
          label: "address",
          maximumLength: 500,
          required: true,
        }),
        asula: normalizedString(item.asula, { label: "settlement", maximumLength: 160 }),
        vald: normalizedString(item.vald, { label: "municipality", maximumLength: 160 }),
        maakond: normalizedString(item.maakond, { label: "county", maximumLength: 160 }),
      };
    });
    return { results };
  }
  if (kind === "parcel") {
    if (!isRecord(payload.kataster)
      || !CADASTRE_NUMBER.test(String(payload.kataster.number || ""))) {
      throw new Error("Terrapoint returned an invalid parcel record");
    }
    const number = String(payload.kataster.number);
    if (expectedNumber !== undefined && number !== String(expectedNumber)) {
      throw new Error("Terrapoint returned a parcel that does not match the requested cadastral number");
    }
    const rawCentroid = payload.kataster.centroid;
    let centroid = null;
    if (rawCentroid !== undefined && rawCentroid !== null) {
      if (!isRecord(rawCentroid)) throw new Error("Terrapoint returned an invalid parcel centroid");
      centroid = {
        longitude: normalizedNumber(rawCentroid.longitude, {
          label: "parcel longitude",
          minimum: -180,
          maximum: 180,
          required: true,
        }),
        latitude: normalizedNumber(rawCentroid.latitude, {
          label: "parcel latitude",
          minimum: -90,
          maximum: 90,
          required: true,
        }),
      };
    }
    const rawSpatial = payload.spatial_status;
    if (rawSpatial !== undefined && rawSpatial !== null && !isRecord(rawSpatial)) {
      throw new Error("Terrapoint returned an invalid spatial status");
    }
    return {
      kataster: {
        number,
        l_aadress: normalizedString(payload.kataster.l_aadress, {
          label: "parcel address",
          maximumLength: 500,
        }),
        pindala_ha: normalizedNumber(payload.kataster.pindala_ha, {
          label: "parcel area",
          minimum: 0,
          maximum: 10_000_000,
        }),
        sihtotstarve: normalizedString(payload.kataster.sihtotstarve, {
          label: "parcel purpose",
          maximumLength: 300,
        }),
        mets_pindala_ha: normalizedNumber(payload.kataster.mets_pindala_ha, {
          label: "forest area",
          minimum: 0,
          maximum: 10_000_000,
        }),
        omvorm: normalizedString(payload.kataster.omvorm, {
          label: "ownership form",
          maximumLength: 160,
        }),
        centroid,
      },
      spatial_status: {
        natura_2000: normalizedIntersection(rawSpatial?.natura_2000, "Natura 2000"),
        kaitseala: normalizedIntersection(rawSpatial?.kaitseala, "protected area"),
      },
    };
  }
  throw new Error("Terrapoint response kind is not recognized");
}
