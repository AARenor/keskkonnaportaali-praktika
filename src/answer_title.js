// The heading above an answer may repeat the question, but it must repeat the
// question the reader asked. The server canonicalizes reviewed one-letter typos
// before retrieval, and a grammatical form can be one substitution away from a
// listed typo word ("raiemahu" and "raiemaht"), so a card that echoes the
// canonical query shows a word the reader never typed. Retrieval, assessment
// and citations keep the canonical query; only the visible heading follows the
// reader's own wording, which the page already holds for every answer it shows.
//
// The echo is recognised from what the response itself states, never guessed:
// `result.query` is the canonical query the card was composed for, and only a
// heading that is nothing but that query is replaced. The reader's wording must
// also be the same question as that query, differing only in a few one-edit
// word corrections, so a heading is never swapped for an unrelated question
// left in the search field.

function comparable(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function withinOneEdit(left, right) {
  if (left === right) return false;
  const gap = left.length - right.length;
  if (Math.abs(gap) > 1) return false;
  if (gap === 0) {
    const differences = [];
    for (let index = 0; index < left.length; index += 1) {
      if (left[index] !== right[index]) differences.push(index);
      if (differences.length > 2) return false;
    }
    if (differences.length === 1) return true;
    const [first, second] = differences;
    return differences.length === 2
      && second === first + 1
      && left[first] === right[second]
      && left[second] === right[first];
  }
  const [longer, shorter] = gap > 0 ? [left, right] : [right, left];
  for (let index = 0; index < longer.length; index += 1) {
    if (longer.slice(0, index) + longer.slice(index + 1) === shorter) return true;
  }
  return false;
}

// The canonical query is the asked question with at most a few corrected words.
function sameAskedQuestion(askedKey, canonicalKey) {
  if (!askedKey || !canonicalKey) return false;
  if (askedKey === canonicalKey) return true;
  const asked = askedKey.split(" ");
  const canonical = canonicalKey.split(" ");
  if (asked.length !== canonical.length) return false;
  let corrections = 0;
  for (let index = 0; index < asked.length; index += 1) {
    if (asked[index] === canonical[index]) continue;
    if (!withinOneEdit(asked[index], canonical[index])) return false;
    corrections += 1;
    if (corrections > 3) return false;
  }
  return true;
}

export function answerHeading(result, askedQuery) {
  const title = typeof result?.answer?.title === "string" ? result.answer.title : "";
  if (!title) return title;
  const asked = String(askedQuery || "").replace(/\s+/gu, " ").trim().slice(0, 180);
  const canonical = String(result?.query || "").replace(/\s+/gu, " ").trim();
  if (!asked || !canonical) return title;
  const askedKey = comparable(asked);
  const canonicalKey = comparable(canonical);
  // The server rewrote nothing, so its heading already carries the asked words.
  if (!askedKey || askedKey === canonicalKey) return title;
  // Only an echo of the query this card was composed for is restored.
  if (comparable(title) !== canonicalKey) return title;
  // A different question left in the field never replaces this answer's heading.
  if (!sameAskedQuestion(askedKey, canonicalKey)) return title;
  return `${asked.charAt(0).toLocaleUpperCase("et")}${asked.slice(1)}`;
}
