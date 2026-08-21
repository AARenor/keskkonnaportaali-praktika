function boundedPositiveInteger(value, fallback, maximum = Number.MAX_SAFE_INTEGER) {
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0
    ? Math.min(parsed, maximum)
    : fallback;
}

export async function readBoundedResponseBytes(response, maximumBytes, label = "Upstream response") {
  const limit = boundedPositiveInteger(maximumBytes, 1);
  const declaredHeader = response?.headers?.get?.("content-length");
  const declaredSize = declaredHeader === null || declaredHeader === undefined || declaredHeader === ""
    ? 0
    : Number(declaredHeader);
  if (declaredHeader !== null && declaredHeader !== undefined && declaredHeader !== ""
    && (!Number.isSafeInteger(declaredSize) || declaredSize < 0 || declaredSize > limit)) {
    await response?.body?.cancel?.().catch(() => undefined);
    throw new Error(`${label} is too large`);
  }
  if (!response?.body) return Buffer.alloc(0);

  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array)) throw new Error(`${label} returned an invalid byte stream`);
      size += value.byteLength;
      if (size > limit) throw new Error(`${label} is too large`);
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    await reader.cancel().catch(() => undefined);
    throw error;
  }
  return Buffer.concat(chunks, size);
}

export async function readBoundedResponseText(response, maximumBytes, label = "Upstream response") {
  return (await readBoundedResponseBytes(response, maximumBytes, label)).toString("utf8");
}

export async function readBoundedResponseJson(response, maximumBytes, label = "Upstream response") {
  const text = await readBoundedResponseText(response, maximumBytes, label);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} returned invalid JSON`);
  }
}

export function createByteBoundedLruCache({
  maximumEntries = 250,
  maximumBytes = 8_000_000,
  sizeOf = (value) => Buffer.byteLength(JSON.stringify(value), "utf8"),
} = {}) {
  const entryLimit = boundedPositiveInteger(maximumEntries, 250, 10_000);
  const byteLimit = boundedPositiveInteger(maximumBytes, 8_000_000, 256_000_000);
  const entries = new Map();
  let retainedBytes = 0;

  const remove = (key) => {
    const current = entries.get(key);
    if (!current) return false;
    retainedBytes = Math.max(0, retainedBytes - current.bytes);
    return entries.delete(key);
  };

  const cache = {
    get size() {
      return entries.size;
    },
    get(key) {
      const current = entries.get(key);
      if (!current) return undefined;
      entries.delete(key);
      entries.set(key, current);
      return current.value;
    },
    peek(key) {
      return entries.get(key)?.value;
    },
    has(key) {
      return entries.has(key);
    },
    set(key, value) {
      const measured = Number(sizeOf(value));
      if (!Number.isSafeInteger(measured) || measured < 0 || measured > byteLimit) {
        remove(key);
        return false;
      }
      remove(key);
      entries.set(key, { value, bytes: measured });
      retainedBytes += measured;
      while (entries.size > entryLimit || retainedBytes > byteLimit) {
        remove(entries.keys().next().value);
      }
      return entries.has(key);
    },
    delete: remove,
    clear() {
      entries.clear();
      retainedBytes = 0;
    },
    keys() {
      return entries.keys();
    },
    stats() {
      return {
        entries: entries.size,
        retainedBytes,
        maximumEntries: entryLimit,
        maximumBytes: byteLimit,
      };
    },
  };
  return cache;
}
