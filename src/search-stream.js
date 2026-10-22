const MAX_STREAM_BUFFER = 2_000_000;
const EVENT_TYPES = new Set(["results", "draft", "answer"]);
const RETRYABLE_STATUSES = new Set([502, 503, 504]);

export async function fetchSearchStream(input, init = {}, {
  retries = 1,
  retryDelayMs = 700,
  fetchImpl = globalThis.fetch,
} = {}) {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetchImpl(input, init);
      if (response.ok || !RETRYABLE_STATUSES.has(response.status) || attempt >= retries) {
        return response;
      }
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      if (init?.signal?.aborted || attempt >= retries || !(error instanceof TypeError)) throw error;
    }
    attempt += 1;
    if (retryDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
}

export function parseSearchStreamLine(line) {
  const value = JSON.parse(String(line || ""));
  if (!value || typeof value !== "object" || !EVENT_TYPES.has(value.type)) {
    throw new Error("Otsing tagastas tundmatu vahetulemuse.");
  }
  if (value.type === "results" && (!value.searchResults || typeof value.searchResults !== "object")) {
    throw new Error("Otsingutulemuste vahetulemus on vigane.");
  }
  if (["draft", "answer"].includes(value.type) && (!value.result || typeof value.result !== "object")) {
    throw new Error("Koondvastuse vahetulemus on vigane.");
  }
  return value;
}

export async function readSearchStream(response, onEvent) {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || "Otsing ei vastanud.");
  }
  if (!response.body?.getReader) throw new Error("Brauser ei toeta järkjärgulist otsinguvastust.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answerReceived = false;
  let phase = 0;
  const deliver = (line) => {
    if (!line.trim()) return;
    const event = parseSearchStreamLine(line);
    if (event.type === "results") {
      if (phase !== 0) throw new Error("Otsingu vahetulemused saabusid vales järjekorras.");
      phase = 1;
    } else if (event.type === "draft") {
      if (phase !== 1) throw new Error("Otsingu vahetulemused saabusid vales järjekorras.");
      phase = 2;
    } else {
      if (phase < 1 || phase >= 3) throw new Error("Otsingu lõppvastus saabus vales järjekorras.");
      phase = 3;
      answerReceived = true;
    }
    onEvent(event);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      if (buffer.length > MAX_STREAM_BUFFER) throw new Error("Otsingu vahetulemus oli liiga mahukas.");
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      lines.forEach(deliver);
      if (done) break;
    }
    if (buffer.trim()) deliver(buffer);
  } finally {
    reader.releaseLock();
  }
  if (!answerReceived) throw new Error("Otsingu lõppvastus jäi saabumata.");
}
