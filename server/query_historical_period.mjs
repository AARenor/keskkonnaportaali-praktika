export function isHistoricalPeriodQuery(value) {
  const normalized = String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et")
    .replace(/[^0-9a-z]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  return /\b(?:(?:19|20)\d{2}|ajalool\w*|varasem\w*|arhiiv\w*|eelm\w*|eile|uleeile|mullu|kliima\w*|keskm\w*|moodun\w*|varem|last\s+(?:week|month|year)|earlier|historical|historic|archive|archived|past|previous|ago|yesterday)\b/u.test(normalized);
}
