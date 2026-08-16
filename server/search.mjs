const SEARCH_DOCUMENTS = [
  {
    id: "forest-overview",
    title: "Kui palju ja millist metsa Eestis on?",
    organization: "Keskkonnaagentuur",
    type: "Ülevaade",
    published: "12.08.2026",
    url: "https://www.keskkonnaagentuur.ee/uudised/blogis-kui-palju-ja-millist-metsa-eestis",
    tags: ["mets", "metsandus", "metsainventeerimine", "SMI", "puistu"],
    summary:
      "Eesti metsa seisundit ja muutusi hinnatakse statistilise metsainventeerimise abil. Ülevaade selgitab, kuidas valimipõhised mõõtmised kirjeldavad metsamaa pindala, puistute koosseisu ja tagavara.",
    answer:
      "Eesti metsa kohta kasutatakse riikliku statistika alusena statistilist metsainventeerimist (SMI), mis koondab üle Eesti tehtud valimipõhised mõõtmised ning võimaldab hinnata metsa pindala, koosseisu ja muutusi.",
  },
  {
    id: "forest-catalogue",
    title: "Metsa teemakataloog",
    organization: "Keskkonnaportaal",
    type: "Andmekataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B6%5D=6",
    tags: ["mets", "metsamaa", "raie", "ulukid", "looduskaitse", "andmed"],
    summary:
      "Metsa teemakataloog koondab Keskkonnaportaali metsaga seotud väljaanded, uudised, kaardid ja andmeallikad ühte vaatesse.",
    answer:
      "Keskkonnaportaali metsa teemakataloogist leiab samas vaates metsaga seotud publikatsioonid, uudised ja andmeallikad; täpsema kinnistupõhise kontrolli saab teha allpool Terrapointi vaates.",
  },
  {
    id: "forest-inventory-publication",
    title: "Statistiline mets: 20 aastat statistilist metsainventeerimist Eestis",
    organization: "Keskkonnaagentuur",
    type: "Väljaanne",
    published: "2020",
    url: "https://keskkonnaportaal.ee/et/statistiline-mets-20-aastat-statistilist-metsainventeerimist-eestis",
    tags: ["mets", "SMI", "statistika", "inventeerimine", "metoodika"],
    summary:
      "Väljaanne tutvustab statistilise metsainventeerimise metoodikat, valimi kujundamist ning seda, kuidas hinnangud Eesti metsade kohta tekivad.",
    answer:
      "SMI tulemusi tuleb lugeda koos metoodika ja hinnanguveaga: tegemist on valimi põhjal arvutatud riiklike hinnangute, mitte iga kinnistu täieliku mõõdistusega.",
  },
  {
    id: "open-data",
    title: "Keskkonna avaandmed",
    organization: "Keskkonnaportaal",
    type: "Avaandmed",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/avaandmed",
    tags: ["avaandmed", "andmestik", "allalaadimine", "API", "failihoidla"],
    summary:
      "Avaandmete vaade juhatab keskkonnaandmete kirjelduste, allalaaditavate failide ja seotud registrite juurde.",
    answer:
      "Keskkonnaandmete taaskasutamiseks alusta avaandmete vaatest: sealt saab liikuda andmestike kirjelduste, failihoidla ja andmeid haldavate registrite juurde.",
  },
  {
    id: "environment-register",
    title: "Andmed ja kaart",
    organization: "Keskkonnaportaal",
    type: "Kaardirakendus",
    published: "jooksev",
    url: "https://register.keskkonnaportaal.ee/register",
    tags: ["kaart", "andmed", "EELIS", "kaitseala", "elupaik", "keskkonnaregister"],
    summary:
      "Kaardirakendus võimaldab otsida ja vaadata ruumilisi keskkonnaandmeid, sealhulgas kaitstavaid alasid ja objekte.",
    answer:
      "Asukohapõhiste keskkonnapiirangute kontrollimiseks kasuta Andmed ja kaart rakendust ning võrdle nähtavaid kihte registri objektiandmetega.",
  },
  {
    id: "climate-atlas",
    title: "Eesti kliimaatlas",
    organization: "Keskkonnaagentuur",
    type: "Kaardirakendus",
    published: "jooksev",
    url: "https://kliimaatlas.keskkonnaportaal.ee/",
    tags: ["kliima", "temperatuur", "sademed", "tuul", "kliimamuutus", "kaart"],
    summary:
      "Kliimaatlas visualiseerib Eesti ajaloolisi kliimanäitajaid ja kliimamuutuse stsenaariume ruumilisel kujul.",
    answer:
      "Temperatuuri, sademete ja teiste kliimanäitajate piirkondlikuks võrdlemiseks sobib Kliimaatlas, kus saab vahetada perioodi, näitajat ja stsenaariumi.",
  },
  {
    id: "weather-overview",
    title: "Ilm ja kliima teemakataloog",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B7%5D=7",
    tags: ["ilm", "kliima", "sademed", "temperatuur", "õhutemperatuur"],
    summary:
      "Teemakataloog koondab ilma ja kliimaga seotud ülevaated, väljaanded ja uudised.",
    answer:
      "Ilma üksiksündmuse ja pikaajalise kliimamuutuse eristamiseks vaata koos jooksvaid ilmaandmeid, pika perioodi keskmisi ning Kliimaatlase stsenaariume.",
  },
  {
    id: "water-catalogue",
    title: "Vesi ja veekeskkond",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B9%5D=9",
    tags: ["vesi", "põhjavesi", "pinnavesi", "meri", "järv", "jõgi", "veekvaliteet"],
    summary:
      "Veeteema materjalid hõlmavad pinna- ja põhjavee seisundit, seiret ning veekogude kasutamist mõjutavaid andmeid.",
    answer:
      "Veekogu seisundi hindamisel tuleb vaadata nii seireandmeid kui ka konkreetse veekogumi koondhinnangut; üks mõõtmine ei kirjelda tavaliselt kogu veekogu seisundit.",
  },
  {
    id: "air-catalogue",
    title: "Välisõhk ja õhukvaliteet",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/search?search_api_fulltext=%C3%B5hukvaliteet",
    tags: ["õhk", "õhukvaliteet", "heide", "saaste", "seire"],
    summary:
      "Õhukvaliteedi materjalid koondavad seire, heitkoguste ja välisõhu seisundi teemalisi allikaid.",
    answer:
      "Õhukvaliteeti hinnatakse saasteainete kaupa ning tulemust mõjutavad mõõtekoht ja ajavahemik; võrdle hetkenäitu pikema perioodi seireandmetega.",
  },
  {
    id: "biodiversity",
    title: "Looduskaitse ja elurikkus",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/kataloog?theme%5B4%5D=4",
    tags: ["looduskaitse", "elurikkus", "Natura", "liigid", "elupaigad", "kaitseala"],
    summary:
      "Looduskaitse teemakataloog koondab kaitstavate alade, liikide, elupaikade ja elurikkuse seisundi materjalid.",
    answer:
      "Looduskaitselise piirangu olemasolu tuleb kontrollida kaardilt ja registri objektiandmetest; avaliku kaardi puuduv kiht ei tõenda piirangu puudumist.",
  },
  {
    id: "waste",
    title: "Jäätmed ja ringmajandus",
    organization: "Keskkonnaportaal",
    type: "Teemakataloog",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/search?search_api_fulltext=ringmajandus",
    tags: ["jäätmed", "ringmajandus", "pistrik", "jäätmekäitlus", "taaskasutus"],
    summary:
      "Jäätmete ja ringmajanduse materjalid seovad jäätmetekke, käitluse, taaskasutuse ja valdkonna infosüsteemid.",
    answer:
      "Jäätmeandmete puhul täpsusta aasta, jäätmeliik ja käitlusviis, sest kogused ning taaskasutuse näitajad ei ole eri lõigetes otse võrreldavad.",
  },
  {
    id: "publications",
    title: "Keskkonnaalased publikatsioonid",
    organization: "Keskkonnaportaal",
    type: "Publikatsioonid",
    published: "jooksev",
    url: "https://keskkonnaportaal.ee/et/publikatsioonid",
    tags: ["publikatsioon", "aruanne", "uuring", "ülevaade", "andmed"],
    summary:
      "Publikatsioonide otsing koondab uuringud, aruanded, ülevaated, kaardilood ja muud avaldatud materjalid.",
    answer:
      "Põhjalikuma vastuse jaoks ava otsingutulemustes algallikas ning kontrolli väljaande kuupäeva, metoodikat ja andmete vaatlusperioodi.",
  },
  {
    id: "environmental-permits",
    title: "Keskkonnaotsuste infosüsteem KOTKAS",
    organization: "Keskkonnaamet",
    type: "Infosüsteem",
    published: "jooksev",
    url: "https://kotkas.envir.ee/",
    tags: ["luba", "keskkonnaluba", "KMH", "menetlus", "aruandlus", "KOTKAS"],
    summary:
      "KOTKASes avaldatakse keskkonnalubade, keskkonnamõju hindamiste ja muude menetluste infot.",
    answer:
      "Konkreetse loa või menetluse ametlikku seisu kontrolli KOTKASest; portaali otsing aitab leida tausta, kuid menetlusandmete allikaks on infosüsteem ise.",
  },
];

const RELATED = {
  mets: ["metsade pindala Eestis", "metsaraie andmed", "metsa looduskaitsepiirangud"],
  kliima: ["Eesti temperatuuritrend", "sademed maakonniti", "kliimastsenaarium 2100"],
  vesi: ["põhjavee seisund", "järvede veekvaliteet", "Läänemere seisund"],
  jäätmed: ["jäätmeteke Eestis", "ringlussevõtu määr", "jäätmeluba KOTKASes"],
};

export function normalize(value = "") {
  return value
    .toLocaleLowerCase("et")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9äöõüšž]+/gi, " ")
    .trim();
}

const STOP_WORDS = new Set([
  "andmed",
  "andmete",
  "eesti",
  "eestis",
  "kohta",
  "seisund",
  "seisundi",
  "vaata",
  "mis",
  "kuidas",
]);

function topicRoot(word) {
  if (word.startsWith("mets")) return "mets";
  if (word.startsWith("kliim")) return "kliima";
  if (word.startsWith("jaat")) return "jaat";
  if (word.startsWith("ohukval")) return "ohukvaliteet";
  if (word.startsWith("looduskait")) return "looduskaitse";
  if (word.startsWith("elurikk")) return "elurikkus";
  if (word.startsWith("pohjave")) return "pohjavesi";
  return word;
}

export function scoreDocument(document, query) {
  const normalizedQuery = normalize(query);
  const words = normalizedQuery
    .split(/\s+/)
    .filter(Boolean)
    .filter((word) => !STOP_WORDS.has(word))
    .map(topicRoot);
  if (!words.length) return 0;

  const fields = {
    title: normalize(document.title),
    tags: normalize((document.tags || []).join(" ")),
    summary: normalize(document.summary),
    organization: normalize(document.organization),
  };

  let score = 0;
  if (fields.title.includes(normalizedQuery)) score += 18;
  if (fields.tags.includes(normalizedQuery)) score += 12;
  if (fields.summary.includes(normalizedQuery)) score += 6;

  for (const word of [...new Set(words)]) {
    if (word.length < 2) continue;
    if (fields.title.includes(word)) score += 7;
    if (fields.tags.includes(word)) score += 5;
    if (fields.summary.includes(word)) score += 2;
    if (fields.organization.includes(word)) score += 1;
  }

  return score;
}

export function relatedQueries(query, sources) {
  const normalizedQuery = normalize(query);
  const direct = Object.entries(RELATED).find(([key]) => normalizedQuery.includes(normalize(key)));
  if (direct) return direct[1];

  const tags = sources.flatMap((source) => source.tags || []).filter((tag) => tag.length > 3);
  return [...new Set(tags)].slice(0, 3).map((tag) => `${tag} andmed Eestis`);
}

export function rankDocuments(query, documents = SEARCH_DOCUMENTS) {
  return documents
    .map((document) => ({ ...document, score: scoreDocument(document, query) }))
    .filter((document) => document.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "et"));
}

export function composeSearchResponse(query, rankedDocuments, options = {}) {
  const cleanQuery = String(query ?? "").trim().slice(0, 180);
  const limit = Math.max(1, Math.min(Number(options.limit) || 6, 10));
  const ranked = Array.isArray(rankedDocuments) ? rankedDocuments : [];
  const fallback = SEARCH_DOCUMENTS.filter((item) => ["publications", "open-data", "environment-register"].includes(item.id));
  const chosen = (ranked.length ? ranked : fallback)
    .slice(0, limit)
    .map((document, index) => ({ ...document, citation: index + 1 }));

  const strongMatches = ranked.filter((document) => Number(document.score || 0) >= 8).length;
  const confidence = strongMatches >= 3 ? "kõrge" : strongMatches ? "keskmine" : "madal";
  const answerParts = chosen.slice(0, 3).map((source) => ({
    text: source.answer || source.summary,
    citations: [source.citation],
  }));

  return {
    query: cleanQuery,
    total: Number.isFinite(options.total) ? options.total : ranked.length,
    generatedAt: new Date().toISOString(),
    mode: options.mode || "allikapõhine-koondvastus",
    answer: {
      eyebrow: "Allikapõhine vastus",
      title: `Vastus: ${cleanQuery}`,
      intro:
        ranked.length > 0
          ? `Leidsin ${options.total || ranked.length} teemaga sobivat tulemust. Vastuse järel on kasutatud algallikad.`
          : "Täpset vastet ei leitud. Allpool on ametlikud lähtekohad, kust päringut täpsustada.",
      parts: answerParts,
      confidence,
      disclaimer:
        "Koondvastus on automaatselt koostatud valitud avalike allikate kokkuvõtetest. Õigusliku või kinnistupõhise otsuse puhul kontrolli algallikat.",
    },
    sources: chosen.map(({ score: _score, semanticScore: _semanticScore, combinedScore: _combinedScore, answer: _answer, tags, ...source }) => ({
      ...source,
      tags: (tags || []).slice(0, 5),
    })),
    related: options.related || relatedQueries(cleanQuery, chosen),
    ...(options.meta ? { meta: options.meta } : {}),
  };
}

export function searchEnvironment(query, limit = 6) {
  const cleanQuery = String(query ?? "").trim().slice(0, 180);
  if (!cleanQuery) {
    return {
      query: "",
      total: 0,
      answer: null,
      sources: [],
      related: ["metsade seisund", "Eesti kliima", "keskkonna avaandmed"],
    };
  }

  const ranked = rankDocuments(cleanQuery, SEARCH_DOCUMENTS);
  return composeSearchResponse(cleanQuery, ranked, { limit, total: ranked.length });
}

export { SEARCH_DOCUMENTS };
