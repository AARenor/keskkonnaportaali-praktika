// Reviewed evidence requirements for public forestry intents.
export const FORESTRY_INTENT_DEFINITIONS = {
  "forest-yearbook-definition": {
    serviceDocumentIds: ["forest-yearbook-overview"],
    discoveryQueries: ["metsa aastaraamatud Aastaraamat Mets 2023"],
    evidenceGroups: [["aastaraamat"], ["statistiline kokkuvõte"], ["Eesti metsadest", "metsandusest"]],
  },
  "bark-beetle-monitoring": {
    serviceDocumentIds: ["bark-beetle-monitoring-2026"],
    discoveryQueries: ["kuuse-kooreüraski seire tulemused 2026 feromoonpüünised"],
    evidenceGroups: [
      ["feromoonpüünist", "seirepüünist"],
      ["nädalate lõikes"],
      ["2. september 2026", "2. septembril 2026"],
      ["Keskkonnaagentuur koostöös RMK-ga"],
    ],
  },
  "wood-balance-definition": {
    serviceDocumentIds: ["wood-balance-overview"],
    discoveryQueries: ["puidubilanss puiduallikad kasutamine lõpptarbimine"],
    evidenceGroups: [
      ["puiduallikad"],
      ["lõpptarbimist", "lõpptarbimine"],
      ["pooleteise aastase viibega"],
      ["Puidubilanss 2023"],
    ],
  },
  "lulucf-definition": {
    serviceDocumentIds: ["lulucf-definition"],
    discoveryQueries: ["LULUCF maakasutuse maakasutuse muutuse metsanduse sektor"],
    evidenceGroups: [
      ["maakasutuse, maakasutuse muutuse ja metsanduse sektor"],
      ["kasvuhoonegaaside inventeerimise valdkond"],
      ["inimtekkeliste kasvuhoonegaaside"],
    ],
  },
  "etak-definition": {
    serviceDocumentIds: ["protected-forest-share"],
    discoveryQueries: ["ETAK Eesti topograafia andmekogu kaardiandmestik kõlvik"],
    evidenceGroups: [
      ["Eesti topograafia andmekogu"],
      ["kaardiandmestik"],
      ["kõlvikuteks"],
      ["ei vasta eesti metsa definitsioonile"],
    ],
  },

  "forest-law-overview": {
    serviceDocumentIds: ["forest-law"],
    discoveryQueries: ["Metsaseadus eesmärk säästev majandamine raie lubatavus"],
    evidenceGroups: [
      ["Metsaseaduse eesmärk", "metsa kui ökosüsteemi kaitse"],
      ["säästev majandamine"],
      ["raie lubatavus", "raie lubatavus sõltub"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-management-guide": {
    serviceDocumentIds: ["forest-management-guide"],
    discoveryQueries: ["metsa korraldamise juhend eraldis inventeerimine metsamajandamiskava"],
    evidenceGroups: [
      ["eraldise pindala alampiir", "0,1 ha"],
      ["ülepinnalise takseerimisega"],
      ["raiemahu määramisel", "arvestuslangist"],
      ["metsamajandamiskava"],
    ],
    minimumSupportingDocuments: 1,
  },
  "fao-fra-definition": {
    serviceDocumentIds: ["fao-fra-terms-2025"],
    discoveryQueries: ["FAO FRA 2025 terms definitions forest growing stock deforestation"],
    evidenceGroups: [
      ["0,5 hektarit", "0.5 hectares"],
      ["kasvav tagavara", "growing stock"],
      ["raadamine", "deforestation"],
    ],
    minimumSupportingDocuments: 1,
  },
  "metsandusteatmik-definition": {
    serviceDocumentIds: ["metsandusteatmik"],
    discoveryQueries: ["Metsandusteatmik mõisted eesti inglise keeles"],
    evidenceGroups: [
      ["Metsandusteatmik"],
      ["mõisteid ja märksõnu"],
      ["paberväljaanne", "paberväljaandega"],
      ["432"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-publication-cycle": {
    serviceDocumentIds: ["smi", "forest-yearbook-overview"],
    discoveryQueries: ["SMI tulemused avaldamine", "metsa aastaraamat uusim väljaanne"],
    evidenceGroups: [
      ["SMI 2025"],
      ["18. august 2026", "18. augustil 2026"],
      ["iga-aastane statistiline kokkuvõte", "iga-aastase metsade statistilise kokkuvõtte"],
      ["Aastaraamat Mets 2023"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-harvest-2025": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-stock-stable"],
    discoveryQueries: ["SMI 2025 raiemahu eksperthinnang", "raiemaht 2025 eksperthinnang 11 miljonit"],
    evidenceGroups: [
      ["2025"],
      ["eksperthinnang", "eksperthinnangu", "eksperthinnangul"],
      ["11,0 miljonit m³", "11 miljonit m³"],
    ],
  },
  "bark-beetle-damage": {
    serviceDocumentIds: ["bark-beetle-guidance"],
    discoveryQueries: ["kuuse-kooreürask kuusik kahjustab niineosa kuivamine"],
    evidenceGroups: [
      ["kuuse-kooreürask"],
      ["koore all"],
      ["niineosast"],
      ["kuuskede kuivamist"],
    ],
  },
  "sanitary-cutting-definition": {
    serviceDocumentIds: ["forest-law"],
    discoveryQueries: ["metsaseadus sanitaarraie metsa sanitaarse seisundi parandamine"],
    evidenceGroups: [
      ["sanitaarraiet"],
      ["metsa sanitaarse seisundi parandamiseks"],
      ["surevate või surnud puude"],
      ["elustiku mitmekesisust"],
    ],
  },
  // "Millal ei pea metsateatist esitama?" asks for the exceptions themselves,
  // so it needs both the valgustusraie exception and the annual property
  // allowance. The fee is a separate question and stays in
  // "forest-notice-exception-fee": a reader who did not ask about money must
  // not receive a riigilõiv amount.
  "forest-notice-exception": {
    serviceDocumentIds: ["forest-notice-guidance"],
    discoveryQueries: ["metsateatis küttepuud 20 tihumeetrit kinnisasja kohta aastas", "metsateatis erand valgustusraie"],
    evidenceGroups: [
      ["valgustusraie"],
      ["20 tihumeetrit"],
      ["kinnisasja kohta aastas"],
    ],
  },
  "nature-protection-share-2025": {
    serviceDocumentIds: ["nature-protection-share-2025"],
    discoveryQueries: ["Eesti kaitstavate alade osakaal 31.12.2025"],
    evidenceGroups: [
      ["31.12.2025"],
      ["20%"],
      ["21%"],
      ["23,5%"],
      ["territoriaalmerega"],
    ],
  },
  "forest-species-share": {
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI 2025 enamuspuuliik kask mänd kuusk osakaal"],
    evidenceGroups: [
      ["kask 30%"],
      ["mänd 29%"],
      ["kuusk 19%"],
      ["enamuspuuliigi"],
    ],
  },
  "forest-ownership-share": {
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI 2025 metsamaa omandivorm riigimaa eramaa"],
    evidenceGroups: [
      ["riigimaad kokku 1 181,266 tuhat hektarit"],
      ["50,0%"],
      ["eramaad kokku 1 177,841 tuhat hektarit"],
      ["49,9%"],
      ["omand oli määramata"],
    ],
  },
  "rmk-managed-forest-area": {
    serviceDocumentIds: ["rmk-managed-forest-area"],
    discoveryQueries: ["RMK hallatav metsamaa 2026 pindala"],
    evidenceGroups: [
      ["rmk hallatavat metsamaad"],
      ["1 029 902 hektarit"],
      ["mitte kogu eesti riigi omandis"],
    ],
  },
  "forest-regeneration-2025-availability": {
    serviceDocumentIds: ["forest-regeneration-2025-availability"],
    discoveryQueries: ["metsauuendamine istutamine külv 2025 Eesti"],
    evidenceGroups: [
      [
        "2025. aasta üleriigilist istutamise ja külvamise pindala",
        "2025. aasta üleriigilist istutamise ja külvamise teel uuendatud metsamaa pindala",
      ],
      ["ei ole", "pole"],
      ["avaldatud"],
      ["ei tähenda", "mitte null"],
    ],
  },
  "conifer-area-trend": {
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI okaspuupuistute pindala 2016 2025"],
    evidenceGroups: [
      ["okaspuupuistute pindala"],
      ["2016. aastal kokku 1 164,8 tuhat hektarit"],
      ["2025. aastal 1 132,9 tuhat hektarit"],
      ["31,9 tuhat", "32 000 hektarit"],
    ],
  },
  "sanitary-cutting-rules": {
    serviceDocumentIds: ["forest-management-rules"],
    discoveryQueries: ["metsa majandamise eeskiri sanitaarraie vanus täius 30"],
    evidenceGroups: [
      ["sanitaarraiet"],
      ["mis tahes vanusega puistus"],
      ["alla 30%"],
    ],
  },
  "moose-population-2025": {
    serviceDocumentIds: ["moose-population-2025"],
    discoveryQueries: ["Keskkonnaagentuur põdra asurkonna suurus 2025"],
    evidenceGroups: [
      ["põdra asurkonna suurus"],
      ["2025. aasta alguses"],
      ["10 000–11 000 isendit", "10 000 - 11 000 isendit"],
      ["hinnang", "mitte täpse loendusega"],
    ],
  },
  "bird-hunting-season": {
    serviceDocumentIds: ["bird-hunting-season-2026"],
    discoveryQueries: ["Keskkonnaamet linnujaht 2026 kormoran veelinnud haned lagled"],
    evidenceGroups: [
      ["kormorani"],
      ["1. augustist"],
      ["20. augustil"],
      ["20. septembril"],
      ["jahieeskirja"],
    ],
  },
  "smi-definition": {
    serviceDocumentIds: ["smi"],
    discoveryQueries: ["mis on statistiline metsainventuur SMI valikuuring"],
    requiredRoles: ["method"],
    evidenceGroups: [],
  },
  "bark-beetle-guidance": {
    serviceDocumentIds: ["bark-beetle-guidance"],
    discoveryQueries: ["kuuse-kooreürask tunnused näripuru püünispuu"],
    evidenceGroups: [
      ["2–2,5 mm", "2-2,5 mm"],
      ["vaigunired"],
      ["näripuru"],
      ["püünispuid"],
      ["välja vedada"],
    ],
  },
  "clearcut-size-limits": {
    serviceDocumentIds: ["forest-law"],
    discoveryQueries: ["metsaseadus lageraielangi pindala kaks viis seitse hektarit"],
    evidenceGroups: [
      ["lageraielangi ülempiir"],
      ["kaks hektarit"],
      ["viis hektarit"],
      ["seitse hektarit"],
    ],
  },
  "pine-cutting-age": {
    serviceDocumentIds: ["forest-management-rules"],
    discoveryQueries: ["metsa majandamise eeskiri harilik mänd raievanus boniteet"],
    evidenceGroups: [
      ["hariliku männi raievanused"],
      ["90, 90, 90, 100, 110 ja 120 aastat"],
      ["90–120 aastat", "90-120 aastat"],
      ["boniteediklass"],
    ],
  },
  // A fee question keeps the allowance that precedes the fee and nothing
  // else: the exception route above owns the exception itself, so a pure
  // "is a notice paid" question is answered with the fee, not with the
  // valgustusraie exception it did not ask about.
  "forest-notice-exception-fee": {
    serviceDocumentIds: ["forest-notice-guidance"],
    discoveryQueries: ["metsateatis 20 tihumeetrit riigilõiv 30 eurot"],
    evidenceGroups: [
      ["20 tihumeetrit"],
      ["30 eurot"],
      ["uuendusraie"],
      ["raadamise"],
    ],
  },
  "old-forest-area-protection": {
    serviceDocumentIds: ["forest-smi-2025-tables", "nature-conservation-law"],
    discoveryQueries: ["SMI 2025 üle 100 aastaste puistute pindala", "vana mets automaatne kaitse"],
    evidenceGroups: [
      ["üle 100-aastaste puistute pindala"],
      ["184,0 tuhat hektarit"],
      ["ei anna", "ei tulene"],
      ["automaatset õiguslikku kaitset", "üksnes vanuse tõttu"],
      ["kaitstavast loodusobjektist", "kaitstava objekti"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-fires-2025": {
    serviceDocumentIds: ["forest-fires-2025"],
    discoveryQueries: ["Päästeamet metsa maastikutulekahjud 2025 avaandmed"],
    evidenceGroups: [
      ["2025. aastal"],
      ["mets või mets koos maastikuga"],
      ["kokku 60"],
      ["357"],
    ],
  },
  "forest-area-method": {
    serviceDocumentIds: [
      "forest-smi-2025-tables",
      "forest-stock-stable",
      "forest-area",
      "smi",
      "forest-smi-2025-presentation",
      "forest-smi-methodology-20-years",
    ],
    discoveryQueries: [
      "Eesti metsamaa pindala SMI",
      "statistiline metsainventuur valikuuring proovitükid kogu Eesti",
    ],
    evidenceGroups: [],
    minimumSupportingDocuments: 2,
  },
  "smi-method-comparison": {
    serviceDocumentIds: ["smi", "forest-smi-2025-presentation", "forest-smi-methodology-20-years", "forest-rmk-data-methods"],
    discoveryQueries: ["SMI metoodika valikuuring proovitükid", "SMI statistiline viga lausmetsakorraldus"],
    evidenceGroups: [
      ["valikuuring", "proovitükk"],
      ["kogu eesti", "üleriigiline"],
      ["statistiline viga", "suhteline viga"],
      ["üksiku kinnistu", "lausmetsakorraldus", "täielik ülelugemine"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-harvest-balance": {
    serviceDocumentIds: ["forest-balance-kaur-methodology", "forest-stock-stable"],
    discoveryQueries: ["netojuurdekasv raiemaht Keskkonnaagentuur", "juurdekasv raiemaht SMI", "raiemaht eksperthinnang 2025 netojuurdekasv"],
    evidenceGroups: [
      ["netojuurdekasv"],
      ["raiemaht", "elusate puude raie"],
      ["20 aasta", "pikaajaline"],
      ["üks näitaja", "lõplikku järeldust"],
    ],
  },
  "stock-versus-harvestable": {
    serviceDocumentIds: ["forest-area", "forest-smi-2025-presentation", "forest-law", "protected-forest-share"],
    discoveryQueries: ["metsa tagavara raiutav puidukogus", "metsamaa tagavara majanduspiirang"],
    evidenceGroups: [
      ["tagavara"],
      ["kasvava metsa puidumaht", "kasvava metsa tagavara"],
      ["mitte automaatselt", "ei ole aastane raiemaht", "raiutav puidukogus"],
      ["mittemajandatav", "majanduspiirang", "õiguslik piirang"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-stock-uncertainty": {
    serviceDocumentIds: ["smi", "forest-area", "forest-smi-2025-presentation", "forest-smi-methodology-20-years"],
    discoveryQueries: ["SMI metsade tagavara hinnang suhteline viga", "metsa tagavara statistiline hinnang"],
    evidenceGroups: [
      ["tagavara"],
      ["statistiline hinnang", "üldistatud hinnang", "valimi põhjal"],
      ["statistiline viga", "suhteline viga", "koos veaga", "valikust tulenev viga"],
      ["valikuuring", "proovitükk"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-stock-overview": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-stock-stable"],
    discoveryQueries: ["SMI 2025 kasvava metsa tagavara 466 miljonit m3", "metsa tagavara statistiline hinnang"],
    evidenceGroups: [
      ["466 miljonit m³", "466 miljonit"],
      ["kasvava metsa tagavara", "metsa tagavara"],
      ["2025"],
      ["statistiline viga", "valimist"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-increment-overview": {
    serviceDocumentIds: ["increment-method", "forest-area", "forest-smi-2025-presentation"],
    discoveryQueries: ["SMI metsamaa juurdekasv 15 458 tuhat m³", "metsa juurdekasv hektari kohta"],
    // The newest SMI edition states the increment as 15 458 thousand m³ per
    // year (6,55 m³/ha); the previous edition's 15,4303 million m³ stays
    // acceptable so an older official PDF is not silently disqualified.
    evidenceGroups: [
      ["15 458", "15,458", "15,4303"],
      ["juurdekasv"],
      ["6,55", "6,6"],
      ["±1,4%", "1,4%"],
    ],
    minimumSupportingDocuments: 1,
  },
  "rmk-versus-smi": {
    serviceDocumentIds: ["forest-rmk-data-methods", "metsainfo-hetkeseis", "smi", "forest-smi-2025-presentation"],
    discoveryQueries: ["RMK metsade olem SMI", "RMK takseerandmed statistiline metsainventuur"],
    evidenceGroups: [
      ["rmk hallatavate", "rmk metsade"],
      ["takseerandm", "rmk andmebaas"],
      ["smi", "statistiline metsainventuur"],
      ["valikuuring", "kogu eesti", "üleriigiline"],
    ],
    minimumSupportingDocuments: 2,
  },
  "why-forest-numbers-differ": {
    serviceDocumentIds: ["forest-rmk-data-methods", "smi-metsaregister", "metsainfo-hetkeseis", "smi", "forest-smi-methodology-20-years", "forest-yearbook-2023-fellings"],
    discoveryQueries: ["metsaandmed erinevad numbrid metoodika", "SMI Metsaregister RMK katvus"],
    evidenceGroups: [
      ["eri allikad", "mitmel viisil", "erinev katvus", "eri andmeallikate"],
      ["ajaseis", "andmeaasta", "uuenevad"],
      ["valikuuring", "takseerandmed", "inventeerimisandmed"],
      ["statistiline viga", "definitsioon", "üldkogum", "ebakindlus", "eri meetoditega"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-covered-area": {
    serviceDocumentIds: ["forest-smi-2025-tables"],
    discoveryQueries: ["SMI 2025 metsamaa metsaga metsamaa pindala osakaal"],
    evidenceGroups: [
      ["metsaga metsamaa", "puistute pindala"],
      ["2 151,2 tuhat hektarit"],
      ["47,45%"],
      ["2 360,2 tuhat hektarit"],
      ["52,1%"],
      ["eri näitajad", "ei ole sama"],
    ],
  },
  "forest-overview": {
    serviceDocumentIds: ["forest-smi-2025-tables", "forest-area", "smi", "forest-condition-review", "metsainfo-hetkeseis"],
    discoveryQueries: ["Eesti metsamaa pindala SMI", "Eesti metsade seisund SMI ülevaade", "metsaandmed SMI Metsaregister"],
    requiredRoles: ["measurement", "method", "condition", "registry"],
    evidenceGroups: [],
  },
  "sample-size-and-precision": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-smi-methodology-20-years", "smi", "forest-area"],
    discoveryQueries: ["SMI valimi täpsus suhteline viga", "statistiline metsainventuur valikukava"],
    evidenceGroups: [
      ["valimi suurus", "28 000 proovitük"],
      ["valikukava", "esinduslikkus", "proovitükk", "üldistatakse"],
      ["statistiline viga", "suhteline viga"],
    ],
    minimumSupportingDocuments: 2,
  },
  "increment-method": {
    serviceDocumentIds: ["increment-method", "forest-smi-methodology-20-years", "forest-area", "forest-smi-2025-presentation", "smi", "forest-balance-kaur-methodology"],
    discoveryQueries: ["SMI juurdekasvu arvutamine mudel", "metsa juurdekasv proovitükid"],
    evidenceGroups: [
      ["kogujuurdekasv"],
      ["netojuurdekasv"],
      ["mudelipõhise meetodi", "mitmese imputeerimise"],
      ["mudelpuude andmetest"],
      ["alalistele proovitükkidele", "ajutistele proovitükkidele"],
      ["tihumeetrites hektari kohta", "tm/ha"],
      ["kõrguse muudu mudelit"],
      ["prognooside seeria", "arvutuse viga"],
      ["välja pakutud meetodid"],
    ],
    minimumSupportingDocuments: 1,
  },
  "increment-estimate-2024": {
    serviceDocumentIds: ["forest-area", "increment-method"],
    discoveryQueries: ["SMI 2024 juurdekasv 15,4303 miljonit tihumeetrit", "SMI juurdekasvu arvutamise metoodika"],
    evidenceGroups: [
      ["15,4303 miljonit tihumeetrit"],
      ["aastas"],
      ["6,6 tihumeetrit hektari kohta"],
      ["±1,4%", "1,4%"],
      ["mudeli alusel arvutatud"],
      ["kogujuurdekasv"],
      ["netojuurdekasv"],
      ["mudelipõhise meetodi", "mitmese imputeerimise"],
    ],
    minimumSupportingDocuments: 2,
  },
  "protected-forest-share": {
    serviceDocumentIds: ["protected-forest-share"],
    discoveryQueries: ["kaitsealuse metsamaa osakaal 2024", "rangelt kaitstav metsamaa osakaal"],
    evidenceGroups: [
      ["28,4%"],
      ["16,8%"],
      ["kaitsealuse metsamaa", "range kaitse"],
      ["ETAK"],
      ["2024"],
      ["projekteeritavad alad"],
    ],
    minimumSupportingDocuments: 1,
  },
  "protected-forest-overview": {
    serviceDocumentIds: ["protected-forest-share", "forest-condition-review"],
    discoveryQueries: ["kaitsealune metsamaa osakaal 2024", "metsade kaitse ruumianalüüs"],
    evidenceGroups: [
      ["28,4%"],
      ["16,8%"],
      ["kaitse all"],
      ["2024"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-management-rules-overview": {
    serviceDocumentIds: ["forest-management-rules"],
    discoveryQueries: ["metsa majandamise eeskiri raievanused sanitaarraie", "metsa majandamise eeskiri boniteediklass"],
    evidenceGroups: [
      ["raievanus"],
      ["sanitaarraie"],
      ["boniteediklass"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-management-category-share": {
    serviceDocumentIds: ["forest-smi-2025-presentation"],
    discoveryQueries: ["SMI 2025 mittemajandatav majanduspiiranguga metsamaa osakaal", "metsamaa majanduskategooriad"],
    evidenceGroups: [
      ["20,2%"],
      ["10,4%"],
      ["69,4%"],
      ["mittemajandatav"],
      ["majanduspiiranguga"],
      ["majandusmets"],
    ],
    minimumSupportingDocuments: 1,
  },
  "climate-impact": {
    serviceDocumentIds: ["forest-condition-review", "forest-climate-adaptation-report", "forest-climate-physical-report"],
    discoveryQueries: ["kliimamuutuse mõju Eesti metsadele", "põud ürask mets kliimamuutus"],
    evidenceGroups: [
      ["kliimamuutus"],
      ["põud", "soojem"],
      ["ürask"],
      ["juurdekasv", "kahjust"],
    ],
    minimumSupportingDocuments: 2,
  },
  "forest-notice-review-duration": {
    serviceDocumentIds: ["forest-notice-guidance"],
    discoveryQueries: ["metsateatis läbivaatamine menetlus tööpäeva"],
    evidenceGroups: [
      ["tööpäeva jooksul"],
      ["menetlus kesta"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-notice": {
    serviceDocumentIds: ["forest-notice-guidance", "forest-register-workflow", "metsainfo-hetkeseis", "forest-law"],
    discoveryQueries: ["metsateatis Keskkonnaamet", "metsateatis kavandatav raie metsakahjustus"],
    // The duty groups and the two ordinary exceptions come from the guidance
    // itself: planned felling except valgustusraie, significant unregistered
    // forest damage, and up to 20 tihumeetrit per property per year without a
    // notice. The last group is the source's own provenance caveat that a
    // notice is not proof of felling; it stays last in the source order so the
    // answer states the duty before it, never as an opening warning.
    evidenceGroups: [
      ["metsateatis"],
      ["kavandatav raie", "kavandatava raie", "kavandatavate raiete"],
      ["metsakahjustus"],
      ["valgustusraie"],
      ["20 tihumeetrit"],
      ["kinnisasja kohta aastas"],
      ["ei tõenda", "ei ole kõiki", "looduses juba tehtud"],
    ],
    minimumSupportingDocuments: 2,
  },
  "property-forest-data": {
    serviceDocumentIds: ["forest-register-workflow", "forest-notice-guidance", "metsaregister", "forest-spatial-data"],
    discoveryQueries: ["Metsaportaal kinnistu metsaandmed", "Metsaregister katastritunnus eraldised"],
    evidenceGroups: [
      ["metsaregister", "metsaportaal"],
      ["kinnistu"],
      ["inventeerimisandmed", "eraldis"],
    ],
    minimumSupportingDocuments: 2,
  },
  "harvest-over-time": {
    serviceDocumentIds: ["forest-yearbook-2023-fellings", "forest-smi-2025-presentation", "forest-condition-review", "forest-stock-stable", "forest-balance-kaur-methodology"],
    discoveryQueries: ["raiemaht 20 aastat SMI aegrida", "Eesti raiemaht pikaajaline trend"],
    evidenceGroups: [
      ["raiemaht"],
      ["2002"],
      ["10,157"],
      ["12,077"],
      ["ei tähenda ühtlast", "võrreldavad"],
    ],
    minimumSupportingDocuments: 1,
  },
  "forest-age-trend": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-stock-stable", "forest-smi-2024-summary", "forest-condition-review"],
    discoveryQueries: ["Eesti metsade vanusjaotus noored vanad", "SMI noorte ja vanade metsade pindala"],
    evidenceGroups: [
      ["noorte"],
      ["vanade"],
      ["suuren", "kasv"],
      ["vanuseline", "vanusjaotus"],
    ],
    minimumSupportingDocuments: 2,
  },
  "clearcut-over-time": {
    serviceDocumentIds: ["clearcut-over-time", "forest-yearbook-2023-fellings", "forest-smi-2024-summary", "forest-area"],
    discoveryQueries: ["SMI lageraie pindala aegrida", "lageraie pindala kümme aastat"],
    evidenceGroups: [
      ["lageraie"],
      ["2014.–2024", "2014–2024"],
      ["2014 – 29,7"],
      ["2024 – 34,0"],
      ["ei saa kirjeldada ühtlase kasvutrendina", "ei näita ühtlast kasvu"],
      ["Tegu on SMI aastahinnangutega"],
    ],
    minimumSupportingDocuments: 1,
  },
  "clearcut-last-ten-years": {
    serviceDocumentIds: ["clearcut-over-time"],
    discoveryQueries: ["SMI lageraie pindala viimased kümme aastat 2015–2024"],
    evidenceGroups: [
      ["lageraie"],
      ["viimase kümne avaldatud aastahinnangu"],
      ["2015–2024"],
      ["31,6"],
      ["34,0"],
      ["319,3"],
      ["ei kirjelda tingimata kordumatut maa-ala"],
    ],
    minimumSupportingDocuments: 1,
  },
  "clearcut-2013-2022": {
    serviceDocumentIds: ["forest-yearbook-2023-fellings"],
    discoveryQueries: ["Aastaraamat Mets 2023 lageraie pindala 2013–2022"],
    evidenceGroups: [
      ["lageraie"],
      ["2013.–2022", "2013–2022"],
      ["28,7"],
      ["32,6"],
      ["311,7"],
      ["ei kirjelda tingimata", "kattumatut maa-ala"],
    ],
    minimumSupportingDocuments: 1,
  },
  "pine-versus-spruce": {
    serviceDocumentIds: ["forest-smi-2025-presentation", "forest-area", "forest-stock-stable"],
    discoveryQueries: ["SMI mänd kuusk pindala tagavara", "männikud kuusikud Eestis"],
    evidenceGroups: [
      ["mänd", "männi"],
      ["kuusk", "kuuse"],
      ["695,3", "29%", "29,6%"],
      ["431,8", "19%", "18,4%"],
      ["suurem", "domineer"],
    ],
    minimumSupportingDocuments: 2,
  },
  "logging-in-protected-areas": {
    serviceDocumentIds: ["nature-conservation-law", "forest-register-workflow", "metsainfo-hetkeseis", "forest-law"],
    discoveryQueries: ["raie kaitsealal vöönd kaitse-eeskiri", "metsateatis kaitsealal"],
    evidenceGroups: [
      ["kaitseal"],
      ["vöönd", "sihtkaitsevöönd", "piiranguvöönd"],
      ["erinevad keelud", "sõltub", "kaitse-eeskiri"],
      ["ei tõenda", "registreeritud", "registreerimine", "läbi viidud raietööde kohta andmed puuduvad", "käsitsi üle"],
    ],
    minimumSupportingDocuments: 3,
  },
  "municipality-forest-area": {
    serviceDocumentIds: ["forest-spatial-data", "metsaregister"],
    discoveryQueries: ["valla metsamaa pindala ruumiandmed", "Metsaregister valla metsasus"],
    evidenceGroups: [
      ["nimetada vald", "valla nimi"],
      ["metsamaa pindala"],
      ["ruumikiht", "ruumiandmed"],
      ["ei ole sama", "ei tohi"],
    ],
    requiresQueryBoundObservation: true,
  },
  "regional-forest-area": {
    serviceDocumentIds: [],
    discoveryQueries: [],
    evidenceGroups: [],
    requiresQueryBoundObservation: true,
  },
  "forest-fact-check": {
    serviceDocumentIds: ["mets-fact-check-corrections"],
    discoveryQueries: ["metsastatistika valeväited", "Keskkonnaagentuur lükkab ümber valeväited"],
    evidenceGroups: [],
    minimumSupportingDocuments: 1,
  },
  "clearcut-value-judgement": {
    serviceDocumentIds: ["forest-condition-review", "forest-climate-adaptation-report"],
    discoveryQueries: ["lageraie keskkonnamõju metsaseadus", "lageraie mõju elurikkus veerežiim"],
    evidenceGroups: [
      ["majandamis"],
      ["mõju"],
      ["elurikk"],
      ["biomassi"],
      ["vastandlik", "kõrvalmõju"],
    ],
    minimumSupportingDocuments: 1,
  },
  "old-forest-protection": {
    serviceDocumentIds: ["nature-conservation-law", "forest-register-workflow", "forest-spatial-data", "metsaregister"],
    discoveryQueries: ["vana mets kaitse all puistu vanus", "EELIS vana mets kaitserežiim"],
    evidenceGroups: [
      ["kõrge vanus", "puistu vanus"],
      ["ei anna", "ei tulene", "üksnes vanuse tõttu"],
      ["kaitstav loodusobjekt", "liigi elupaik", "natura"],
      ["eelise", "metsaregistri", "ruumiandmed"],
    ],
    minimumSupportingDocuments: 2,
  },
};
