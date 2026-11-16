export const REMOTE_SUGGESTION_MAX_LENGTH = 80;

export const REVIEWED_FORESTRY_SEARCH_SUGGESTIONS = Object.freeze([
  "Kui suur osa Eestist on kaetud metsaga?",
  "Kas Eestis raiutakse rohkem kui metsa juurde kasvab?",
  "Mis vahe on SMI-l ja metsaregistril?",
  "Kuidas arvutatakse juurdekasvu?",
  "Miks ei võrdu tagavara raiutava puidukogusega?",
  "Kust leida konkreetse kinnistu metsaandmeid?",
  "Kui suur osa metsadest on kaitse all?",
  "Miks erinevad RMK ja SMI numbrid?",
  "Kuidas mõjutab kliimamuutus metsi?",
  "Mis on metsateatis?",
  "Kas Eestis saab mets otsa?",
  "Kas praegu raiutakse rohkem kui 20 aastat tagasi?",
  "Kas meie metsad muutuvad nooremaks?",
  "Kui palju lageraiet on viimase 10 aasta jooksul tehtud?",
  "Kas kuusk või mänd domineerib Eestis?",
  "Kas kaitsealadel raiutakse?",
  "Kui palju metsa on minu koduvallas?",
  "Kui palju metsa on Eestis?",
]);

export const REVIEWED_ENVIRONMENT_SEARCH_SUGGESTIONS = Object.freeze([
  "Kust leida põhjavee seireandmeid?",
  "Mis oli Tartu Emajõe viimati avaldatud veetase?",
  "Milline on homne ilmaprognoos Eestis?",
  "Milline on õhutemperatuur praegu Tartus?",
  "Milline on õhukvaliteet Tallinnas praegu?",
  "Kust leida jäätmekäitluskohti Tartus?",
  "Kas Lahemaa loodusala on Natura ala?",
  "Kas Matsalu loodusala on Natura loodusala?",
  "Kust leida keskkonnaandmete API-d?",
  "Kui palju tekkis Eestis 2024. aastal ohtlikke jäätmeid?",
  "Kui suur oli Eesti veevõtt 2024. aastal?",
  "Kui suur oli BHT7 heitveekoormus Eestis 2024. aastal?",
  "Kas Emajõgi on avalik veekogu?",
  "Mis oli Jõgeva 15. jaanuari 2024 ööpäeva keskmine õhutemperatuur?",
  "Mis oli Võru ööpäeva keskmine õhutemperatuur 21. augustil 2025?",
  "Kui palju jäätmeid taaskasutati Eestis 2024. aastal?",
  "Kuidas aitab ringmajandus jäätmeid taaskasutada?",
  "Milline on Eesti elurikkuse seisund?",
  "Kas Eestis tohib vanu rehve põletada?",
  "Kas väikese tiigi rajamiseks on luba vaja?",
  "Kuidas saada puurkaevu andmeid?",
  "Kuidas arvutada ettevõtte süsinikujalajälge?",
  "Kust näeb Tallinna mürakaarti?",
  "Kas Pärnu rannas võib ujuda?",
  "Kuidas kontrollida KOTKAS keskkonnaloa menetluse staatust?",
  "Kust leida KESE keskkonnaseire mõõtmistulemusi?",
  "Mis on Eesti jäätmete ringlussevõtu määr?",
  "Mis oli 2024. aasta keskmine õhutemperatuur Eestis?",
  "Kust leida üleujutusohu prognoosid?",
  "Kust leida merevee taseme mõõtmisandmeid?",

  "Kuidas taotleda keskkonnaluba?",
  "Kuidas teatada reostusest?",
  "Kuhu viia vana elektroonika?",
  "Mida teha vanade ravimitega?",
  "Kuidas kompostida biojäätmeid?",
  "Kuidas sorteerida pakendeid?",
  "Kust leida jäätmekäitluskohti?",
  "Kuidas kaitsta kodu radooni eest?",
  "Kuidas hoida ära hallitust kodus?",
  "Kust leida joogivee kvaliteedi andmeid?",
  "Kust leida suplusvee andmeid?",
  "Kuidas taotleda metsateatist?",
  "Millal algab linnujaht?",
  "Kuidas kaitsta kaitsealust liiki?",
  "Kust leida Natura alasid?",
  "Kuidas taotleda kaevuluba?",
  "Kuidas hinnata keskkonnamõju?",
  "Milline on Eesti kliima tulevik?",
  "Mida teha reostunud pinnasega?",
  "Kuidas taotleda välisõhu saasteluba?",
  "Kust leida keskkonnaregistri andmeid?",
]);

export const REVIEWED_SEARCH_SUGGESTIONS = Object.freeze([
  ...REVIEWED_FORESTRY_SEARCH_SUGGESTIONS,
  ...REVIEWED_ENVIRONMENT_SEARCH_SUGGESTIONS,
]);


export function shouldFetchRemoteSuggestions(value) {
  const query = String(value || "").trim();
  return query.length >= 2 && query.length <= REMOTE_SUGGESTION_MAX_LENGTH;
}

function normalizeSuggestion(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("et");
}

export function suggestionsForValue(value, remote = {}, limit = 12) {
  const query = String(value || "").trim();
  if (!shouldFetchRemoteSuggestions(query) || remote.query !== query || !Array.isArray(remote.items)) return [];
  const maximum = Number.isInteger(limit) ? Math.max(0, Math.min(12, limit)) : 12;
  const seen = new Set();
  return remote.items
    .map((item) => ({
      value: String(item?.value || "").replace(/\s+/gu, " ").trim(),
      count: item?.count ?? null,
    }))
    .filter((item) => item.value && item.value.length <= 200)
    .filter((item) => {
      const key = normalizeSuggestion(item.value);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, maximum);
}
