// Frozen before the retrieval assertions below run. These are deliberately
// different from the 30 canonical questions in public-forestry.test.mjs and
// cover paraphrases, inflections, short queries, ASCII spellings and typos.
export const FORESTRY_VARIANT_GROUPS = Object.freeze({
  "smi-method-comparison": [
    "Kuidas SMI töötab?",
    "SMI metoodika ja proovitükid",
    "Kas SMI on lauseline takseerimine?",
    "SMI takseerimise võrdlus lausmetsakorraldusega",
  ],
  "stock-versus-harvestable": [
    "Kas kogu metsavaru saab maha raiuda?",
    "Kui palju puiduvarust on kasutatav?",
    "Kas tagavara tähendab raiemahtu?",
    "Metsavaru võrdub kättesaadava puiduga?",
  ],
  "rmk-versus-smi": [
    "RMK ja SMI arvud",
    "Miks RMK takseerandmed ei klapi SMIga?",
    "RMK versus SMI metsastatistika",
    "Kas RMK metsade olem on sama kui SMI?",
  ],
  "forest-covered-area": [
    "Mitu protsenti Eestist on mets?",
    "Eesti metsasus protsent",
    "Metsaga kaetud maa osakaal",
    "Puistute pindala Eestis",
  ],
  "sample-size-and-precision": [
    "Mitu proovitükki SMI kasutab?",
    "SMI valimi täpsus",
    "Kas suurem vaatluste arv tähendab väiksemat viga?",
    "Proovitukide arv ja veapiir",
  ],
  "forest-depletion": [
    "Kas mets saab otsa?",
    "Eesti mets kaob ära",
    "Kas varsti pole enam metsa?",
    "Metsa jääb järjest vähem",
  ],
  "clearcut-value-judgement": [
    "Lageraie mõju loodusele",
    "Kas lageraie on alati halb?",
    "Lageraie ja elurikkus",
    "Lageraie keskkonnamoju",
  ],
  "old-forest-protection": [
    "Kas vana metsa tohib raiuda?",
    "Kas vanad metsad on kaitstud?",
    "Puistu kõrge vanus annab kaitsestaatuse?",
    "Vanem mets on automaatselt kaitseala?",
  ],
  "forest-data-sources": [
    "SMI või Metsaregister?",
    "Metsaregster vs SMI andmed",
    "Kas SMI ja registri arvud peavad klappima?",
    "SMI ja metsaandmete erinevus",
  ],
  "forest-stock-uncertainty": [
    "Kui täpne on metsavaru hinnang?",
    "Tagavara usaldusvahemik",
    "Kas metsavaru on täpne arv?",
    "Puiduvaru veapiir",
  ],
  "why-forest-numbers-differ": [
    "Miks metsastatistika numbrid muutuvad?",
    "Metsaarvud ei klapi eri aruannetes",
    "Metsaandmete lahknevus eri aastatel",
    "Miks metsandusandmete arvud erinevad?",
  ],
  "increment-method": [
    "Kuidas hinnatakse metsa juurdekasvu?",
    "Juurdekasvu metoodika",
    "Kuidas SMI mõõdab puidu juurdekasvu?",
    "Juurdekasvu mudel proovitukkidel",
  ],
  "property-forest-data": [
    "Kuidas vaadata oma kinnistu metsaandmeid?",
    "Metsaregister katastritunnuse järgi",
    "Kust leian metsaeraldised maaüksusel?",
    "Kinnistu puistuandmete otsing",
  ],
  "protected-forest-share": [
    "Mitu protsenti metsast on kaitstud?",
    "Kaitsealuse metsamaa osakaal",
    "Kui palju metsa on range kaitse all?",
    "Kaitstud metsade protsent",
  ],
  "climate-impact": [
    "Põua mõju Eesti metsadele",
    "Kuidas soojenemine puistuid muudab?",
    "Mets ja üraskid",
    "Kliimamuutuse metsakahjud",
  ],
  "forest-notice": [
    "Metsateatise tähendus",
    "Millal metsateatist vaja on?",
    "Kas registreeritud metsateatis tähendab tehtud raiet?",
    "Metsateatis 24 kuud",
  ],
  "harvest-over-time": [
    "Raiemaht võrreldes 2002. aastaga",
    "Kahe kümnendi raietrend",
    "Kas 2022 raiuti rohkem kui 2002?",
    "Raiemahu muutus 20 aastaga",
  ],
  "forest-age-trend": [
    "Kas metsi on rohkem noori või vanu?",
    "Eesti metsade vanusjaotus",
    "Kas puistute keskmine vanus muutub?",
    "Noorte ja vanade metsade trend",
  ],
  "clearcut-over-time": [
    "Lageraie pindala kümnendiga",
    "2013–2022 lageraiete summa",
    "Lageraie 10a",
    "Kui palju lageraiuti kümne aastaga?",
  ],
  "pine-versus-spruce": [
    "Männikud vs kuusikud",
    "Mänd või kuusk – kumb on levinum?",
    "Kuuse ja männi osakaal",
    "Mand vs kuusk Eestis",
  ],
  "logging-in-protected-areas": [
    "Kas Natura alal tohib raiuda?",
    "Metsateatis kaitsealal",
    "Raie piiranguvööndis",
    "Sihtkaitsevööndi metsatööd",
  ],
  "forest-area": [
    "Kui palju Eestis metsamaad on?",
    "Eesti metsamaa hektarites",
    "Metsamaa pindala Eestis",
    "Kui palju metsa Eestis?",
  ],
});

export const FORESTRY_BALANCE_VARIANTS = Object.freeze([
  "Raiutakse rohkem kui mets kasvab.",
  "Mets kasvab juurde vähem kui raiutakse.",
  "Raie ja netojuurdekasvu suhe.",
  "Kas juurdekasv ületab raiet?",
  "Puidu eemaldamine versus juurdekasv.",
]);

export const MUNICIPALITY_CLARIFICATION_VARIANTS = Object.freeze([
  "Kui palju metsa on mu vallas?",
  "Meie valla metsasus",
  "Mets selles vallas",
  "Kui palju metsamaad on koduvallas?",
  "Siin vallas oleva metsa pindala",
]);

export const FORESTRY_NEGATIVE_COLLISIONS = Object.freeze([
  "Kas metsarajal saab Majakivile ronida?",
  "RMK matkaraja pikkus",
  "Kuuse ehtimine jõuludeks",
  "Kliimamuutuse mõju põllumajandusele",
  "Kuidas uuendada juhiluba?",
  "Millal makstakse perehüvitist?",
]);

