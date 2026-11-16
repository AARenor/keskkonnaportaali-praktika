import assert from "node:assert/strict";
import test from "node:test";
import { buildIntentAnswer } from "../server/answer_templates.mjs";
import { claimHasVisibleWitness } from "../server/search_answer_evidence.mjs";

function lawSource(anchor, content, citation = 1) {
  const section = anchor === "para29" ? "29. Lageraie" : "3. Mõisted";
  return {
    id: `law-metsaseadus-${anchor}`,
    title: `Metsaseadus § ${section}`,
    organization: "Riigi Teataja",
    url: `https://www.riigiteataja.ee/akt/MS#${anchor}`,
    citation,
    content,
  };
}

const clearcutLaw = lawSource("para29", "(1) Lageraie korral raiutakse raielangilt ühe aasta jooksul raie algusest arvates kõik puud, välja arvatud: 1) seemnepuudeks jäetavad 20–70 hajali või mõnepuuliste gruppidena paiknevat mändi, arukaske, saart, tamme, sangleppa, künnapuud või jalakat ühe hektari kohta ja elujõuline järelkasv; 3) säilikpuud ehk elustiku mitmekesisuse tagamiseks vajalikud puud või nende säilinud püstiseisvad osad tüvepuidu kogumahuga vähemalt viis tihumeetrit ühe hektari kohta, üle viie hektari suurusel raielangil vähemalt kümme tihumeetrit ühe hektari kohta. (4) Lageraie on lubatud puistus, mis vastab vähemalt ühele järgmistest tingimustest: 1) puistu koosseisu põhjal kaalutud esimese rinde keskmine vanus on võrdne puistu koosseisu põhjal kaalutud esimese rinde raievanusega või sellest suurem; 2) puistu on saavutanud käesoleva paragrahvi lõike 6 punkti 1 alusel kehtestatud keskmise rinnasdiameetri; 3) puistu rinnaspindala või täius on väiksem käesoleva paragrahvi lõike 6 punkti 2 alusel kehtestatust.");
const forestLaw = lawSource("para3", "(1) Mets on ökosüsteem, mis koosneb metsamaast, sellel kasvavast taimestikust ja seal elunevast loomastikust. (2) Metsamaa on maa, mis vastab vähemalt ühele järgmistest nõuetest: 1) on metsamaa kõlvikuna kantud maakatastrisse; 2) on maatükk pindalaga vähemalt 0,1 hektarit, millel kasvavad puittaimed kõrgusega vähemalt 1,3 meetrit ja puuvõrade liitusega vähemalt 30 protsenti. (3) Metsamaaks käesoleva seaduse tähenduses ei loeta õuemaad, elamumaad, pargi, kalmistu, haljasala, marja- ja viljapuuaia, puukooli, aiandi, dendraariumi ning puu- ja põõsaistandike maad.", 2);
const noticeGuidance = {
  id: "forest-notice-guidance",
  title: "Metsateatis ja metsaregister",
  organization: "Keskkonnaamet",
  url: "https://www.keskkonnaamet.ee/elusloodus-looduskaitse/metsandus/metsateatis-ja-metsaregister",
  citation: 3,
  content: "Metsateatis esitatakse kavandatavate raiete kohta, välja arvatud valgustusraie, ning metsaregistrisse kandmata oluliste metsakahjustuste kohta. Esitamise sammud Metsaregistris: (1) Ava metsaregister. (2) Logi sisse ID-kaardi, Mobiil-ID või Smart-IDga. (3) Vali oma kinnistu. (4) Täida metsateatise vorm ja esita see. Keskkonnaamet vaatab teatise läbi 15 tööpäeva jooksul. Töödega võib alustada 10 päeva pärast raiet lubavat otsust ning raie tuleb teha 24 kuu jooksul metsateatise metsaregistris registreerimisest. Keskkonnaameti kehtiva juhise järgi võib metsaomanik metsateatist esitamata raiuda kuni 20 tihumeetrit puitu kinnisasja kohta aastas. Konkreetse kinnistu inventeerimisandmete, eraldiste ja teatiste vaatamiseks tuleb kasutada riiklikku Metsaregistrit ehk Metsaportaali.",
};
const feeGuideSentence = "Alates 1. juulist 2024 tuleb uuendusraie ja raadamise iga metsateatise läbivaatamise eest tasuda 30 eurot riigilõivu; muud raietüübid ei ole selle juhise järgi tasulised.";
const noticeFeeGuidance = {
  ...noticeGuidance,
  content: `${noticeGuidance.content} ${feeGuideSentence}`,
};

test("clearcut definition stays concise while criteria include the law's exceptions", () => {
  const definition = buildIntentAnswer({ query: "Mis on lageraie?", intent: "definition", topic: "clearcut", sources: [clearcutLaw] });
  assert.equal(definition.format, "definition");
  assert.match(definition.intro, /Lageraie korral raiutakse raielangilt/u);
  assert.match(definition.intro, /välja arvatud seaduses loetletud erandid/u);
  assert.doesNotMatch(definition.intro, /20–70|seemnepuudeks|säilikpuud/u);
  assert.deepEqual(definition.introCitations, [1]);

  const criteria = buildIntentAnswer({ query: "Mida loetakse lageraiks?", intent: "criteria", topic: "clearcut", sources: [clearcutLaw] });
  assert.equal(criteria.format, "criteria");
  assert.match(criteria.intro, /Lageraie korral raiutakse raielangilt/u);
  assert.match(criteria.parts[0].text, /seemnepuudeks jäetavad/u);
  assert.match(criteria.parts[0].text, /säilikpuud/u);
  assert.doesNotMatch(criteria.parts[0].text, /Lageraie on lubatud/u);
});

test("does not apply the clearcut activity template to impact questions", () => {
  assert.equal(buildIntentAnswer({
    query: "Mis on lageraie mõju elurikkusele?",
    intent: "definition",
    topic: "clearcut",
    sources: [clearcutLaw],
  }), null);
});

test("clearcut permission conditions quote the law and require agency guidance", () => {
  const answer = buildIntentAnswer({
    query: "Millal on lageraie lubatud?",
    intent: "conditions",
    topic: "clearcut",
    sources: [clearcutLaw, noticeGuidance],
  });
  assert.equal(answer.format, "conditions");
  assert.match(answer.intro, /^Lageraie on lubatud puistus/u);
  assert.deepEqual(answer.parts.map((part) => part.citations[0]), [1, 3]);
  assert.match(answer.parts[0].text, /keskmine vanus/u);
  assert.match(answer.parts[1].text, /10 päeva pärast raiet lubavat otsust/u);
  assert.match(answer.parts[1].text, /24 kuu jooksul metsateatise metsaregistris registreerimisest/u);
  assert.match(answer.note, /konkreetse kinnistu/u);
  assert.equal(buildIntentAnswer({ query: "Millal on lageraie lubatud?", intent: "conditions", topic: "clearcut", sources: [clearcutLaw] }), null);
  const missingStart = { ...noticeGuidance, content: noticeGuidance.content.replace(" metsateatise metsaregistris registreerimisest", "") };
  assert.equal(buildIntentAnswer({ query: "Millal on lageraie lubatud?", intent: "conditions", topic: "clearcut", sources: [clearcutLaw, missingStart] }), null);
});

test("forest definition uses law, while criteria include the land threshold and exceptions", () => {
  const statistical = {
    id: "fao-fra-terms-2025",
    title: "FAO FRA 2025 Terms and Definitions",
    citation: 4,
    content: "FAO FRA 2025 määratluse järgi on mets maa-ala, mis ületab 0,5 hektarit ning vastab puude kõrguse ja võrastiku katvuse tingimustele.",
  };
  const definition = buildIntentAnswer({ query: "Mis on mets?", intent: "definition", topic: "forest", sources: [forestLaw, statistical] });
  assert.equal(definition.format, "definition");
  assert.match(definition.intro, /^Mets on ökosüsteem/u);
  assert.deepEqual(definition.introCitations, [2]);
  assert.doesNotMatch(definition.intro, /FAO/u);
  const nounPhrase = buildIntentAnswer({ query: "metsa definitsioon", intent: "definition", topic: "forest", sources: [forestLaw, statistical] });
  assert.match(nounPhrase.intro, /Mets on ökosüsteem[\s\S]*metsamaast[\s\S]*taimestikust[\s\S]*loomastikust/u);
  assert.deepEqual(nounPhrase.introCitations, [2]);
  assert.equal(buildIntentAnswer({ query: "metsa definitsioon 1990. aastal", intent: "definition", topic: "forest", sources: [forestLaw] }), null);

  const criteria = buildIntentAnswer({ query: "Mida loetakse metsaks?", intent: "criteria", topic: "forest", sources: [forestLaw] });
  assert.equal(criteria.format, "criteria");
  assert.match(criteria.intro, /^Mets on ökosüsteem/u);
  assert.deepEqual(criteria.parts.map((part) => part.title), ["Metsamaa", "Erandid"]);
  assert.match(criteria.parts[0].text, /0,1 hektarit[\s\S]*puittaimed[\s\S]*1,3 meetrit[\s\S]*puuvõrade liitusega[\s\S]*30 protsenti/u);
  assert.match(criteria.parts[1].text, /Metsamaaks käesoleva seaduse tähenduses ei loeta/u);

  const landDefinition = buildIntentAnswer({
    query: "Mis on metsamaa?",
    intent: "definition",
    topic: "forest",
    sources: [forestLaw],
  });
  assert.equal(landDefinition.format, "definition");
  assert.match(landDefinition.intro, /^Metsamaa on maa,/u);
});


test("a statistical forest definition needs explicit FAO or FRA context and its cited source", () => {
  const statistical = {
    id: "fao-fra-terms-2025",
    title: "FAO FRA 2025 Terms and Definitions",
    organization: "Food and Agriculture Organization of the United Nations (FAO)",
    url: "https://openknowledge.fao.org/server/api/core/bitstreams/a6e225da-4a31-4e06-818d-ca3aeadfd635/content",
    citation: 4,
    content: "FAO FRA 2025 määratluse järgi on mets maa-ala, mis ületab 0,5 hektarit ning vastab puude kõrguse ja võrastiku katvuse tingimustele.",
  };
  assert.equal(buildIntentAnswer({ query: "Mis on mets statistiliselt?", intent: "definition", topic: "forest", sources: [forestLaw, statistical] }), null);
  assert.equal(buildIntentAnswer({
    query: "Mis on mets FAO FRA järgi?",
    intent: "definition",
    topic: "forest",
    sources: [{ ...statistical, url: "https://example.com/forest" }],
  }), null);
  const answer = buildIntentAnswer({ query: "Mis on mets FAO FRA järgi?", intent: "definition", topic: "forest", sources: [statistical] });
  assert.equal(answer.format, "definition");
  assert.match(answer.intro, /FAO FRA 2025 määratluse järgi on mets/u);
  assert.deepEqual(answer.introCitations, [4]);
  const glossary = buildIntentAnswer({
    query: "FAO FRA metsa definitsioon",
    intent: "definition",
    topic: "forest",
    sources: [{
      ...statistical,
      content: "FAO FRA 2025 määratluse järgi on mets maa-ala, mis on suurem kui 0,5 hektarit ja kus puud on kõrgemad kui 5 meetrit ning võra katvus on üle 10%, või puud suudavad need künnised kohapeal saavutada; mets ei hõlma maad, mis on peamiselt põllumajanduslikus või linnalises kasutuses. Muu puittaimestikuga maa on maa, mis ei ole mets, on suurem kui 0,5 hektarit ning kus puud on kõrgemad kui 5 meetrit ja võra katvus on 5–10%, või põõsaste, puhmaste ja puude summaarne katvus on üle 10%. Kasvav tagavara on kõigi elusate puude üle koore maht, mille rinnasdiameeter on vähemalt 10 cm, sealhulgas tüvi maapinnast kuni 0 cm läbimõõduga tipuni, välja arvatud oksad. Raadamine on metsa muutmine muuks maakasutuseks, olenemata sellest, kas see on inimtekkeline; see hõlmab võra katvuse püsivat langetamist alla 10% künnise ega hõlma raiet, kui mets eeldatavasti uueneb looduslikult või metsakultuurimeetmetega. Metsastumine on metsa rajamine istutamise või külvamise teel maal, mis oli varem muus maakasutuses. Metsa pindala netomuutus on metsapindala erinevus kahe FRA võrdlusaasta vahel ning see võib olla positiivne, negatiivne või null.",
    }],
  });
  assert.equal(glossary.parts.length, 5);
  const glossaryText = [glossary.intro, ...glossary.parts.map((part) => part.text)].join(" ");
  assert.match(glossaryText, /kasvav tagavara[\s\S]*raadamine/iu);
  assert.ok(glossary.parts.every((part) => part.citations[0] === 4));
});

test("notice filing is an ordered cited procedure and does not claim parcel permission", () => {
  for (const query of [
    "raieteatise esitamine",
    "raieteatise esitamise",
    "raieteatise esitamiseks",
    "Metsateatise esitamine",
    "Kuidas esitada metsateatist?",
    "Esita metsateatis",
  ]) {
    const answer = buildIntentAnswer({ query, intent: "procedure", topic: "forest_notice", sources: [noticeGuidance] });
    assert.equal(answer.format, "procedure", query);
    assert.match(answer.intro, /^Esitamise sammud Metsaregistris:/u, query);
    assert.deepEqual(answer.parts.filter((part) => part.role === "step").map((part) => part.step), [1, 2, 3, 4], query);
    assert.ok(answer.parts.filter((part) => part.role === "step").every((part) => part.citations[0] === 3), query);
    assert.match(answer.note, /ei kinnita konkreetse kinnistu raieluba/u, query);
    assert.equal(answer.parts.some((part) => part.role === "context"), false, query);
  }
});

test("property specific notice filing retains the cited registry lookup guidance", () => {
  const answer = buildIntentAnswer({
    query: "Kuidas esitada metsateatist oma kinnistule?",
    intent: "procedure",
    topic: "forest_notice",
    sources: [noticeGuidance],
  });
  const propertyContext = answer.parts.find((part) => part.role === "context");
  assert.equal(propertyContext?.title, "Konkreetse kinnistu andmed");
  assert.equal(propertyContext?.text, "Konkreetse kinnistu inventeerimisandmete, eraldiste ja teatiste vaatamiseks tuleb kasutada riiklikku Metsaregistrit ehk Metsaportaali.");
  assert.deepEqual(propertyContext?.citations, [3]);
});

test("a quoted numbered procedure step is a relationship witness", () => {
  const step = "Logi sisse ID-kaardi, Mobiil-ID või Smart-IDga.";
  assert.equal(claimHasVisibleWitness(step, [`(2) ${step}`], step, "raieteatise esitamine"), true);
  assert.equal(claimHasVisibleWitness(step, [step], step, "raieteatise esitamine"), true);

  assert.equal(claimHasVisibleWitness(
    "Logi sisse ainult parooliga.",
    [`(2) ${step}`],
    "Logi sisse ainult parooliga.",
    "raieteatise esitamine",
  ), false);
  assert.equal(claimHasVisibleWitness(
    "Logi sisse parooliga.",
    [`(2) ${step}`],
    "Logi sisse parooliga.",
    "raieteatise esitamine",
  ), false);

  assert.equal(claimHasVisibleWitness(
    "Ära logi sisse ID-kaardi, Mobiil-ID või Smart-IDga.",
    [`(2) ${step}`],
    "Ära logi sisse ID-kaardi, Mobiil-ID või Smart-IDga.",
    "raieteatise esitamine",
  ), false);
});

test("notice requirements explain the duty and exceptions without filing steps", () => {
  for (const query of [
    "Millal tuleb metsateatis esitada?",
    "Millal on metsaomanikul vaja metsateatist esitada?",
    "Millal ei pea metsateatist esitama?",
    "Kas valgustusraie puhul on metsateatist vaja?",
    "Kas mul on vaja metsateatist, kui tahan oma metsas paar puud maha võtta?",
  ]) {
    const answer = buildIntentAnswer({ query, intent: "conditions", topic: "forest_notice", sources: [noticeGuidance] });
    assert.equal(answer.format, "conditions", query);
    assert.match(answer.intro, /valgustusraie[\s\S]*metsakahjust/iu, query);
    assert.match(answer.parts[0].text, /20\s+tihumeetrit[\s\S]*puitu[\s\S]*kinnisasja[\s\S]*aastas/iu, query);
    assert.deepEqual(answer.introCitations, [3]);
    assert.deepEqual(answer.parts[0].citations, [3]);
    assert.doesNotMatch(`${answer.intro} ${answer.parts.map((part) => part.text).join(" ")}`, /Samm [1-4]|Esitamise sammud/u, query);
    assert.match(answer.note, /ei kinnita konkreetse kinnistu raieluba/u, query);
  }
});
test("notice templates require evidence for requested qualifiers", () => {
  const currentFee = buildIntentAnswer({
    query: "Metsateatise riigilõiv alates 2024?",
    intent: "conditions",
    topic: "forest_notice",
    sources: [noticeFeeGuidance],
  });
  assert.match(currentFee.intro, /Alates 1\. juulist 2024/u);
  assert.deepEqual(currentFee.introCitations, [3]);

  for (const query of [
    "Mis oli metsateatise riigilõiv 2023. aastal?",
    "Mis on metsateatise riigilõiv Tartus?",
    "Kas metsateatise riigilõiv sisaldab käibemaksu?",
  ]) {
    assert.equal(buildIntentAnswer({
      query,
      intent: "conditions",
      topic: "forest_notice",
      sources: [noticeFeeGuidance],
    }), null, query);
  }

  assert.equal(buildIntentAnswer({
    query: "Kuidas esitada metsateatist Tartus?",
    intent: "procedure",
    topic: "forest_notice",
    sources: [noticeFeeGuidance],
  }), null);
  assert.equal(buildIntentAnswer({
    query: "Kas 2023. aastal peab metsateatise esitama?",
    intent: "conditions",
    topic: "forest_notice",
    sources: [noticeFeeGuidance],
  }), null);
});

test("an authority answer needs an active present setter in the law text", () => {
  const answer = buildIntentAnswer({
    query: "Kes kehtestab raievanuse?",
    intent: "conditions",
    topic: "other",
    sources: [lawSource("para29", "(5) Raievanus on kehtestatud seadusega.")],
  });
  assert.equal(answer, null);
});

test("permission wording and unrelated subjects do not become definitions", () => {
  assert.equal(buildIntentAnswer({
    query: "Mis on lageraie?",
    intent: "definition",
    topic: "clearcut",
    sources: [lawSource("para29", "(1) Lageraie on lubatud.")],
  }), null);
  assert.equal(buildIntentAnswer({
    query: "Mis on mets?",
    intent: "definition",
    topic: "forest",
    sources: [lawSource("para3", "(1) Metssiga on metsloom, kes elab metsas.")],
  }), null);
});
