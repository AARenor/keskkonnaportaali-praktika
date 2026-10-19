# Allikakeskne praktikaprojekti arhitektuur

## 1. Eesmärk, lähteolukord ja piirid

Kasutaja eesmärk: „Make the praktikaprojekt arhitektuur väga hea, allikad on olulised”. Muudame olemasoleva rakenduse allika-, tõendi- ja avaldatud vastuse lepingud selgeks ning kontrollitavaks. See ei ole ainult diagrammitöö. Säilivad Node/Express, PostgreSQL, React/Vite, ametlikud adapterid, päringupiirid ja viitepõhine avalik vastus.

See dokument kirjeldab **kavandatud cutover'it, mitte juba teostatud liideseid**. Selle kirjutamise faasis ei muudeta lähtekoodi ega käivitata teste, teenuseid või mudeli-/gateway-kõnesid. Rakendus algab pärast Maini dokumendilugemist ja tööjaotust; kasutajalt uut luba ei küsita.

Lähtepunkt on juurutatud `6bff54a439a017e75a29397abdc4a0f78cc2085a`. Varasem tervisekontroll kinnitas seda SHA-d; uus kontroll puudub. `/tmp/praktika-delivery-evidence.json:39–65` sisaldab ühe allika SMI vastust, Luna `ready` olekut ja 5363 ms kestust, kuid ka korduvat definitsiooni. Sama faili `207–408` täpne `mets` vastus oli deterministliku mustandi koopia, mitte uus süntees. `/tmp/praktika-generic-handoff.json:17–46` järgi parandati hiljem nelja nähtava rolli valikut; uued päris kõned katkesid umbes 13,3 sekundiga. Latentsuse juurpõhjus on teadmata. Arhitektuuriparandust ei esitata selle põhjuse tõendina.

Säilitame nelja muudetud faili algse intent'i: `server/forestry-public.mjs`, `server/pipeline.mjs`, `server/llm.mjs`, `tests/public-forestry.test.mjs`. Puhas üleminek võib asendada nende haprad täisfraasid semantiliste rollidega, kuid ei kustuta tehtud kaitseid. Kasutaja `.playwright-mcp` ja muu kõrvalmaterjal jäävad puutumata. OMP seadistus, auth broker, gateway sisemus ja Terrapointi eraldatud andmevoog ei kuulu töösse.

## 2. Valikud ja otsus

| Variant | Võit | Puudus / otsus |
|---|---|---|
| **B: allikakesksed lepingud olemasolevas torus** | Üks tõde allika versioonile, piiratud tõendile ja tegelikult avaldatud vastuse päritolule; olemasolevad kaitsed säilivad. | Mõõdukas liideste ja tarbijatestide cutover. **Valitud.** |
| A: üksikparandused rollidele, cache'ile ja päritolule | Väiksem diff. | Mudel/validator koostavad endiselt eri pakke ja composer hindab rolle uuesti. Piiride probleem jääb. |
| C: uus RAG-/agent-framework või vektorandmebaas | Rohkem üldist orkestreerimisvõimekust. | Pole tõendatud vajadust; dubleerib poliitikaid, lisab olekut ja latentsust. Välistatud. |

Ei lisata retry't, uut varumudelit, pikemaid timeout'e, täis-PDF indeksit, üldist sündmusraamistikku ega failisuuruse pärast ümberkirjutust. Tootmise üks `openai-codex/gpt-6-luna` Responses-kõne läbi juba heakskiidetud gateway säilib; credential on ainult serveri runtime'is. Valikuline SDK rada jääb samade lepingute tarbijaks, mitte uueks põhirajaks.

## 3. Kontrollitud probleemikohad

Viited on disaini kirjutamise hetke failiridadele; pärast cutover'it muutuvad need.

| Koht | Praegune probleem | Uus piir |
|---|---|---|
| `server/llm.mjs:236,1987–2073,2242` | Mudel saab vaikimisi draft claims'iga paki; grounding koostab teise, `includeDraftClaims:false` paki. Lõplik serialiseerimiskärbe ei kontrolli rollide säilimist. | Üks raw-source `EvidencePack`, üks koostamine, sama sisu mõlemale. |
| `server/llm.mjs:1855–1864,2336–2339` | Muutmata protected lead + vanad `fallbackParts` võivad anda `AI koondvastus` ja `ready`, kuigi uut mudelipanust ei säilinud. | Kohalikult aktsepteeritud väited ja tegelik panus on eraldi. |
| `server/pipeline.mjs:1483–1493,1522–1535` | Nähtava tõendi piir võib mudeli tagasi pöörata, ent DB salvestab katse provider/status väärtused. | `DeliveredOutcome` pärast viimast avalikku piiri määrab label'i, päritolu, oleku ja cache-õiguse. |
| `server/retrieval.mjs:650–706,880–931`; `server/forestry-public.mjs:775–785` | Ülevaate OR-grupid/täisfraasid ei ole sisuline rollileping; arvud on seotud 2024 sõnastusega. | Nimetatud measurement/method/condition/registry witnesses ja edition-aware mõõteallikas. |
| `server/pipeline.mjs:263–278,508–545,875–916` | Composer kasutab oma rollipredikaate ja lõplik witness otsib taas kogu allika tekstist. | Üks rolliotsus; nähtavad väljavõtted ainult sama paki akendest. |
| `server/database.mjs:353–403`; `server/pipeline.mjs:1350–1355` | Cache kaotab `updated`, `dataYear`, `dataAsOf`; hit ei taasta neid loendist. | Sama versiooni metadata säilib cache'i projektsioonis; vana envelope invalideeritakse. |
| `server/database.mjs:724–734` versus `674–721` | Cache-read teeb otse `pool.query`, jagatud signal/deadline puudub. | Olemasolev `databaseQuery` ja päringukontekst, mitte uus ajapiir. |
| `server/source-registry.mjs:332–348` | Tundmatu kontrolliaeg muutub fiktiivseks `2026-09-19` kuupäevaks. | Tundmatu `checkedAt` on `null`. |
| `server/forestry-source-policy.mjs:17–39`; `server/retrieval.mjs:1537–1539,1571–1585` | SMI sõna/title/tag võib liigitada RMK esmaseks SMI allikaks; hierarhia 0.8…0.1 lisatakse relevantsusskoorile. | Trusted publisher + resource class; autoriteet alles scope/period/role/coverage järel. |
| `server/forestry-public.mjs:53–61,70–77,296–304` | Kolm `_publishedAt` välja sisaldavad leheuuendust, kuigi nähtav `published` on teine. | Aastaraamatute loend `2021-12-15`, LULUCF `2022-01-31`, kaitstava metsamaa näitaja `2023-04-12`, olemasoleva nähtava publication'i järgi; `updated` säilib eraldi. |
| `server/retrieval.mjs:330–355` | `updated/dataYear/dataAsOf` ja locator fallback võivad pärineda teisest aliasest kui richer evidence body. | Kogu tõendikirje metadata atomaarne koos sisuga. |

Aastafilter kasutab juba nähtavat `published` välja (`server/retrieval.mjs:1413–1424`); seda ei nimetata ekslikult `_publishedAt` aastafiltri veaks. Algse `mets` probleemi allikad olid 906/1691/1685 märki: puudunud SMI artikli põhjus oli rollivalik, mitte kärpimine (handoff `33–39`).

## 4. `SourceIdentity` ja `SourceSnapshot`

### Identiteet

Uue väikese `server/source-identity.mjs` omanik on source-lane. Kavandatud ekspordid:

- `sourceResourceKey(url) -> string | null`: WHATWG URL-põhine **võrdlus-/salvestusidentiteet**, mitte uus fetch- ega citation-URL.
- `sourceWitnessKey(source) -> string | null`: resource + teadaoleva producer'i kontrollitud PDF page/locator identiteet; üksnes võtme arvutamine ei valideeri tõendit.
- `sameSourceResource(leftUrl, rightUrl) -> boolean`: ainult identiteedivõrdlus, mitte transpordiluba.

Query võtmed sorditakse stabiilselt: `a=1&b=2` ja `b=2&a=1` ühtivad, kuid `a=1&a=2` ja `a=2&a=1` ei ühti. Tracking eemaldatakse; tavaline HTML-fragment ei ole eraldi dokument. PDF `#page=22` ja `#page=35` jagavad korjeressurssi, aga **mitte tõendikirjet ega viiteasukohta**. Kontrollitud sheet/row/section locator säilib eraldi witness'is, mudel ei leiuta seda. Aliaste www ja portaali `/et` normaliseeritakse ainult olemasolevate heakskiidetud hostipaaride piires, mitte kõigil hostidel.

Explicit approved www→bare identity paarid tulevad olemasoleva citation origin inventory mõlema otsa heakskiidust (`server/citation-policy.mjs:1–42`): `keskkonnaportaal.ee`, `keskkonnaagentuur.ee`, `keskkonnaamet.ee`, `kliimaministeerium.ee`, `ohuseire.ee`, `eea.europa.eu`, `foresteurope.org`, `ilmateenistus.ee`, `rescue.ee`, `tallinn.ee`, `terviseamet.ee`. `/et` path alias kehtib ainult `keskkonnaportaal.ee` paarile. `www.rmk.ee`, `www.tartu.ee`, arbitrary www host ja bare `riigiteataja.ee` ei saa üksnes normaliseerijalt puuduvat citation-approval'it. Controlled locator ei muutu arbitrary locator'i olemasolu tõttu valideerituks.

`officialCitationUrlEligibility`, HTTPS/SSRF, redirect approval ja origin allowlist jäävad eelnevateks sõltumatuteks väravateks. Identiteedi helper ei anna fetch- ega citation-õigust. Existing integrations hydration'i rangem target/query/`/et` võrdlus ja corpus'e transportipiir säilivad eraldi approval-reeglina: display identity võrdsus ei tohi muuta varem keelatud redirect'i lubatuks. Selle guard'i hoidmine ei ole teine source identity definitsioon. Provider base URL, DB host normalization, `src/url-safety.js` ja Terrapointi URL-id pole selle cutover'i tarbijad.

Kõik senised konkureerivad source-identity normalizer'id migreeritakse: retrieval, corpus discovery/persistence, registry projection, pipeline membership/revision ja SMI workbook citation reuse; hydration'i korrelatsioon kasutab ühist identiteeti **alles pärast olemasoleva transport final-resource matcher'i edukat läbimist**. Resource võti kasutatakse identity võrdluseks ja eraldi metadata/SQL välistusvõtmeks, witness võti tõendite dedup'il ja viite binding'ul. **Ükski comparison key ei lähe fetch target'iks ega public citation URL-iks.** Producer'i heakskiidetud original fetch/display URL säilib eraldi; `/et`, tracking ja query kujul, mida range transport nõuab. PDF physical fetch võib olemasoleva HTTP ressursireegli järgi fragmenti ignoreerida, kuid see ei luba URL-i asendada resourceKey alias-kujuga ega lehekülgede tõendit ühendada. Vana `canonicalResultUrl` source-identity shim eemaldub; olemasolev transport permission guard ei ole obsolete shim.

Korpuse cutover on **mittedestruktiivne eraldi identity backfill**, mitte canonical_url rekey. Olemasolev `practice_corpus_documents.canonical_url` jääb oma senise heakskiidetud URL-i ja UNIQUE/ON CONFLICT tähendusega alles (`server/corpus.mjs:807,1207,2109`); sellele ei kirjutata resourceKey uut alias-semantikat. Existing `metadata JSONB` (`:821`) saab versioonitud `sourceResourceKey` ja `sourceIdentityVersion` väljad. Olemasoleva schema/migration mustri kõrval tehtav bounded/idempotent backfill arvutab need sama JS helper'iga; säilivad document IDs, kõik muud metadata väljad, private ajalooline provenance, body/hash/version, kuupäevad ja locator. Ei tehta massrekey'd, DROP'i ega DB alias-ridade hävitavat merge'i. Metadata mahu lisandumine läbib olemasoleva tehingulise corpus capacity kaitse. Uued upsert'id hoiavad identity metadata samas tehingus aktuaalsena; resource-key kokkulangevus pole uus UNIQUE constraint.

SQL tail exclusion kasutab seda versioonitud arvutatud/backfilled resource identiteeti, mitte vana kahe-regexi alias shim'i. Identity metadata backfill ja uue writer'i cutover on sellele lugemisteele päris prerequisite; võtmeta kirje ei saa vana regexi kaudu teisest semantikast võrdlusvõtit. Migration completion ja ingest/read parity tõendatakse enne stabiilse tail-paginatsiooni acceptance'i. Existing discovery/cache/inflight payload coalescing ei laiene display-alias võrdse resourceKey põhjal: iga caller'i original target ja saadud final URI läbivad endiselt oma senise range transpordivalidatsiooni, ka cache hit'il. Ühe caller'i lubatud payload ei muutu teisele raw-query/path target'ile lubatuks. Füüsilise PDF korje reuse ei anna teise lehe/locator body-le tõendiõigust.

### Snapshot ja kuupäevad

`SourceSnapshot` on päringuaegne immutable andmekuju, mitte uus tabel või klassihierarhia: olemasolev dokument, eraldi approved original `fetchUrl` ja `citationUrl` (avalikus olemasolevas `url` väljas jääb citation URL), internal `resourceKey/witnessKey`, raw sanitiseeritavad `summary/content/answer`, locator, väljaandja/resource class, kuupäevad ja existing eligibility/version väljad. Need võetakse **ühest** pärast filtreid ja turvapiire lubatud tõendikirjest. `id` kirjeldab kataloogi vaadet, mitte usaldusastet. PDF page või locator toetab witness'i ainult teadaoleva reviewed extract/typed adapter/validated hydration producer'i ja existing `sourceCanSupportPublicCitation` eligibility korral; arbitrary locator, hash või resource key ei valideeri page'i, body't ega evidence capability't.

Duplikaadi richer evidence valik määrab atomaarse body + locator + publication/update/data/observation/review/version/freshness/capability komplekti. Puuduvat välja ei täideta teise versiooni aliasest. Route-only või vigane alias ei saa tõendit launder'da; olemasolev kontrollitud navigation-alias erand jääb piiratud ja tarbijatestidega lukustatud.

| Väli | Tähendus |
|---|---|
| `published`, `_publishedAt` | Tegelik avaldamisaasta/päev. Aastast ei leiutata kuupäeva. |
| `updated` | Algallika kinnitatud leheuuendus. Ei ole väljaande avaldamine. |
| `dataYear`, `dataAsOf` | Reference period ning andmete/arvutuse seis. |
| `_evidenceObservedAt`, validity window | Mõõte-/vaatlusaeg ja adapteri kehtivus. |
| `_catalogueReviewedAt`, `_evidenceStatusAt`, `checkedAt` | Tegelik vastava kirje review/status-kontroll; puuduv jääb tundmatuks. |
| `fetched_at`, attempted/last-seen/sitemap time | Korje või avastuse sündmus; ei tõenda publication/update aega. |
| `_evidenceVersion`, `_contentHash` | Existing kontrollitud väljavõtte/keha versioon või hash. Ei pruugi olla algfaili checksum. |

`server/smi-tables.mjs:113` hash on `id + content` genereeritud väljavõtte hash, **mitte XLSX physical artifact hash**. Mõisted jäävad nii koodis kui dokumentides lahku. Timestamped/versioned/freshness kontrollid ei nõrgene. Stale või kättesaamatu upstream ei tähenda nullväärtust ega kõige uuemat seisu.

## 5. `EvidencePlan`, väljaanne ja järjestus

### Nimetatud rollid

`selectAnswerEvidence(query, documents)` jääb planeerija sisenemiseks `server/retrieval.mjs` sees. Üldise metsavaate `EvidencePlan` laiendatakse väljadega `requiredRoles`, `roleWitnesses`, `numericSourceRole`, `edition`, `missingEvidenceRequirements`; olemasolevad `strong/directDocumentId/supportingDocumentIds/passagesByDocument` säilivad sama planeerija väljundina, mitte alternatiivse algoritmina.

`roleWitnesses[role]` sisaldab `documentId`, `witnessKey`, evidence version ja **terviklikke päris source passage'eid**. Üks source võib katta mitu rolli ainult tegelike lõikude abil. Ülevaatel on neli kohustuslikku rolli:

1. `measurement`: Eesti metsamaa näitaja + aasta + väärtus + ühik + sama definitsioon/nimetaja; olemasoleva mõõtepredikaadi edasiarendus, mitte konkreetse arvu otsing.
2. `method`: SMI lahtikirjutus, proovitükkidega üleriigiline statistiline valikuuring ning riigi seisundi/muutuste versus kinnistu inventeerimisandmete piir. Taaskasutada `forestMeasurementMethodEvidence` ja `hasSmiNationalRole` ranget sisu/polaarsust; viia üks omanik retrieval'i.
3. `condition`: allika tegelik metsa seisundi mõõtmete eristus, mitte pelk tag „kaitse”. Taaskasutada olemasolevaid seisundipassage'i kontrolle.
4. `registry`: registri/RMK/teatise katvuse, ajaseisu või kavatsus-versus-tegelikkuse sisuline eristus; olemasolev range registry predicate, mitte üldine „eri näitajad”.

Kataloogi ID, title, tag ja discovery query aitavad kandidaate leida; need **ei tõenda rolli ega väidet**. Sõnastus- ja arvudictionary ei kasva uute allikalausete kaupa. Composer tarbib planeerija witnesses'e, mitte ei kasuta uut nõrgemat sobivusotsingut. Olemasoleva area-method intent'i ja teiste intent'ide scope-/negatsiooni-/päringuaastakaitsed säilivad; puuduv nõutud roll annab ausa ebapiisavuse, mitte lexical `strong=true`.

### Väljaandeleping

Aastata riiklik ülevaade valib uusima **tegelikult kinnitatud avaldatud primary väljaande**, mitte hardcoded „51,84%/2 350,6”. Olemasolev 2025 kandidaat on `forest-smi-2025-tables`, URL `SMI_2025_TABLES_URL`; 2024 historical kandidaat on `forest-area`, meetodiallikas `smi`, seisund `forest-condition-review`, registrivaade `metsainfo-hetkeseis`. ID-sid ega uusi URL-e ei mõelda välja.

Enne 2025 „uusima” valikut tuleb existing official publication list/workbook tõendiga kinnitada: väljaanne/avaldamine, tööleht/row/column, reference year, väärtus, ühik, nimetaja ja võimaliku revised hinnangu tähendus. Praegused source declarations (`server/forestry-public.mjs:151–164`, `server/smi-tables.mjs:1–15,37–40`) on kontrolli lähtepunkt, mitte selle disainifaasi uus upstream-kinnitus. Kui latest ei ole kinnitatav, on vastus selgelt olemasoleva kontrollitud aasta piires ega väida „uusim”; historical evidence on oma perioodiga endiselt kasutatav.

Selgesõnaline ajalooline 2024 päring säilitab existing 2024 PDF väljaande, reference year'i ja metoodika. Kui päring nimetab 2025 väljaande 2024 revised rida, kasutatakse selle väljaande kontrollitud rida ning märgitakse revisjon. Old PDF 2024 väärtusi ei kombineerita 2025 töövihiku revised väärtustega trendiks; `edition` ja `dataYear` on eri väljad. Selle cutover'i eesmärk pole uue trendi arvutamine.

### Transitiivne järjestus

Faktivastuse kandidaat läbib esmalt olemasolevad publisher/eligibility, subject/geography, requested period, unit/measurement/method ja negatsiooniväravad. Ineligible kirje võib jääda navigeerimistulemuseks, aga ei konkureeri tõendilead'iga.

Metsanduse faktikandidaatide üks lexicographic tuple on kahanevalt:

`[requestedScopePeriodMatch, requiredRoleSatisfaction, requiredRoleCoverage, coherentCoverage, coreCoverage, forestrySourcePriority, baseRelevance]`

Tuple'i iga arvuline komponent on enne võrdlust konkreetne finite number; comparator ei lahuta `undefined`, `NaN` ega `Infinity`. `requestedScopePeriodMatch` on 0/1: olemasolevad geography/year/unit/measurement ja eligibility kontrollid tõendavad kõik explicit tingimused; requested year vajab claim-bearing passage'i sobivust (`measurementPassagesContainRequestedYear`, beetle scope/year kontrolle), mitte üksnes title/tag yearMatch'i. Aastata measurement peab sobima planeerija valitud verified edition'iga. `requiredRoleSatisfaction` on 0/1 existing `intentEvidenceForDocument(...).satisfies === true` või named-role sama strict selector'i fully-satisfied tulemus, mitte incomplete token match. `requiredRoleCoverage` on distinct täielike required-role witnesses'ide arv / `max(1, requiredRoles.length)`; vanade group intent'ide puhul existing `matchedGroupIndexes` / `max(1, evidenceGroups.length)`. Puuduv selector/role/group annab 0, mitte oletatud täielikkuse.

`coherentCoverage` on existing `max(titleCoverage, summaryCoverage, bestPassageCoverage)` ja `coreCoverage` on existing matchedCoreRoots/coreRoots (tühja core-roots hulga korral existing 1; `server/retrieval.mjs:1452–1457`), mõlemad finite [0,1]. `forestrySourcePriority` on trusted resource class'i existing finite hierarchy väärtus või unknown 0. `baseRelevance` on existing `scoreSearchCandidate` additive score **ilma** forestryHierarchy ja publisher `authorityScore` liikmeteta selles faktiharus; ainult finite väärtus on võrreldav, vigane mõõdik ei anna tõendikõlblikkust ja normaliseerub järjestuses 0-ks. Need väärtused materialiseeritakse ühe korra kandidaatide ranking records'isse, mitte ei arvutata pairwise band'i. Composite lead valitakse `numericSourceRole` measurement kandidaatide hulgast sama tuple'iga; method ei saa kõrge skooriga mõõtelead'i asendada.

Olgu `P` tuple'i esimesed viis mandatory/coverage komponenti. Täielik kahanev järjestus on `relevance`: `[...P, forestrySourcePriority, notFutureDated, baseRelevance, publishedAt]`; requested `sort="newest"`: `[...P, forestrySourcePriority, notFutureDated, publishedAt, baseRelevance]`. `notFutureDated` on 0/1 existing future-date guard'ist; `publishedAt` on existing strict `resultPublishedAt` finite epoch milliseconds või tundmatu 0, mitte updated/dataYear. Viigile järgneb mõlemas harus ascending NFKC-clean title (existing et locale), string id, witnessKey ja retained evidence version/hash; täiesti sama record võib võrrelda 0-ga. Nii on järjestus transitiivne ja sisendpermutatsiooni suhtes stabiilne, ilma undefined/NaN või magic tolerance'ita. `newest` ei muuda edition/reference-year valikut ega lase hiljutisel kõrvalteemal mandatory/coverage väravast mööduda; primary authority mõjub ainult sama P sees. Autoriteediga muudetud lexical bucket'it ei kasutata.

Navigatsioonipäringud säilitavad olemasoleva `servicePriority` järjekorra. `ensureForestryIntentCandidates`, direct-directory ja series-visible prefix peavad järgima sama faktilead'i otsust ning jätma vajalikud role-documents nähtavaks; ainult comparator'i muutmisest ei piisa (`server/retrieval.mjs:1654–1755`). `forestrySourceClass` määrab primary ainult trusted publisher + approved resource klassi järgi; RMK SMI-tag ei ole SMI primary. Unknown ei saa primary staatust.

## 6. Üks immutable `EvidencePack`

Uus väike `server/evidence-pack.mjs` on core-lane'i puhas andmefunktsioonide omanik. Siia kolivad olemasolev sanitiseerija ja bounded window selection; vana llm ekspordi shim'i ei jäeta. Kavandatud liides:

`buildEvidencePack({ sources, query, plan }) -> { entries, roleWitnesses, complete, missingEvidenceRequirements, packVersion, serializedChars }`

`entries` säilitavad praeguse mudeli source metadata kuju ja citation'i ning raw `content` aknad; internal witness/version seosed ei lähe automaatselt providerile ega avalikku API-sse. `packVersion` on täpse sanitiseeritud paki digest, mitte originaalartefakti checksum. Pakk ja selle nested collections on immutable. Provideri serialized evidence on `entries`, grounding kasutab **sama entries sisu**, mitte teist draft'ist koostatud pakki.

Pakk ehitatakse üks kord pärast visible eligible sources'ide hydration/re-association'it ja citation mapping'ut. Planeerija nõutud sanitiseeritud terviklõigud reserveeritakse enne optional query-windows'eid. Iga body fragment pärineb selle source snapshot'i raw `summary/content/answer` lõigust; puudub draft intro/parts, generated baseline, pealkirja või tagi faktitõend. Sanitiseerimisel kustunud rollilõik ei ole katvus. Sama allika summary/content täpsed duplikaadid eemaldatakse, kuid kahte eri sisulist lauset ei visata üldise sarnasuse põhjal ära.

Piirid jäävad **10 allikat, 4000 märki allika content'is, 36 000 märki kogu serialiseeritud evidence'is** koos escaping'u ja metadata'ga. Nõutud täislõiku ei lõigata pooleks. Pärast lõplikku JSON-mahupiiri kontrollitakse iga role witness'i täielikku säilimist ja sama source/version binding'ut. Kui kohustuslikud lõigud ei mahu, `complete=false`, `model-evidence-insufficient`; mudelit ei kutsuta pooliku „strong” pakiga. Deterministlik vastus saab alles jääda ainult oma nähtava tõendi kontrolli läbinud ulatuses, mitte teeselda täielikku overview't.

`validateGroundedAnswer(payload, draft, query, evidencePack)` nõuab olemasolevat pakki ja tagastab kavandatult `{ answer, acceptedClaims, rejectionReason }`. Kõik tarbijad migreeritakse; optional rebuild'i ei ole. Number/entity/year/unit tuple'id, polarity, attribution, query relevance ja grounding work limits jäävad rangeks. `acceptedClaims` on PRIVATE kuni kuue kirje loend (intro + kuni viis osa): iga kirje `{ textHash, sourceBindings }`, `textHash` on normaliseeritud avaldamiskandidaadi SHA-256 ning kuni kümme `sourceBindings` kirjet on `{ witnessKey, version }` täpselt paki bounded source metadata'st. See ei ole raw model output ega DB logi; vajadusel lausevõrdlus toimub jooksva vastuse proosal ainult mälus.

06.10.2026 rakendusotsuse täpsustus: avalik `evidenceExcerpt` on sama juba piiratud paki kirje täielik `content` (kuni 4000 märki allika kohta, 36 000 kogu serialiseeritud pakile). Endine teine 900-märgiline valik kaotas kohalikult aktsepteeritud ETAK-i väite mõiste ning eemaldatakse. See ei suurenda mudeli tõendieelarvet ega luba otsida clipped source osast tuge. Lugeja witness, mudeli windows ja local grounding seovad sama versiooni; viitenumbrid lahenduvad täpselt ühe approved source'ini ning ükski source ei tule aktiivsest filtreeritud listing'ust väljast.

## 7. `DeliveredOutcome` ja avalik leping

Uus väike `server/delivered-outcome.mjs` on core-lane'i puhas lõppotsuse omanik. Mudelikutsuja tagastab kavandatult `{ answer, acceptedClaims, attempt }`; `attempt = { provider, status, reason }` kirjeldab proovimist, mitte avaldamist. Ühe public search jooksu kohta on üks optional agregaatne attempt object, mitte array ega uus retry-ajalugu; optional SDK sisemine existing review ei tekita uut püsivat katsete logi. Kõik injectable `generateAnswer` tarbijad ja SDK/direct skeemid migreeritakse korraga.

Pipeline hoiab detached deterministic snapshot'i, rakendab local grounding'u tulemusele pack-only visible gate'i ja praeguse `publicResponse` täpselt-ühe-viite/eligibility/freshness piiri. **Alles lõpliku avaliku serialiseerimise järel** hinnatakse, milline accepted mudeliväide avaldatud vastuses alles on. Citation renumbering ei muuda source witness/version sidet.

Kavandatud liides:

`deliveredOutcome({ publishedResponse, deterministicResponse, acceptedClaims, attempt, evidenceKind, cacheEligible }) -> { response, answerProvider, answerStatus, cacheResponse, attempt }`

Panus tähendab local ja visible piiri läbinud avaldatud väidet, mis ei ole muutmata protected lead ega deterministic fallback'i olemasoleva proosa koopia. Normaliseeritud lause/proposition võrdlus välistab ka sama fallback'i lauseid ainult kirjavahemärkidega kokku liitva variandi; pealkirja või viitenumbri muutus pole panus. Ühe allika konservatiivses režiimis võib uus toetatud valitud algallikalause olla mudeli panus; generic `mets` acceptance nõuab lisaks päriselt uut sidusat seletavat sünteesiosa. Provider `ready` üksi ei tõenda kumbagi.

| Avaldatud sisu | Avalik label | PRIVATE delivered päritolu/olek |
|---|---|---|
| Uus accepted model claim säilib lõppvastuses | `AI koondvastus` | attempt provider / `ready` |
| Ainult protected lead/vanad fallbackParts või kõik mudeliosad tagasi lükatud | `Allikapõhine kokkuvõte` | `deterministic-current-evidence` / `degraded` (kui katse ebaõnnestus või panus puudus) |
| Post-visible rollback | Deterministliku vastuse label | `deterministic-current-evidence` / `degraded`; attempt reason `visible-rejected` |
| Mudel pole kohaldatav; kontrollitud deterministlik vastus | Olemasolev deterministlik label | `deterministic-current-evidence` / `not-applicable` |
| Tõend või viiteshape puudub | Olemasolev aus clarification/abstention | Deterministlik päritolu; mitte AI ega fabricated zero/latest |

`recordSearch` saab `answerProvider/answerStatus` **DeliveredOutcome'ist**, mitte provider attempt'ist. Source-lane lisab olemasolevasse provenance JSONB-sse optional bounded `attempt` kirje: provider kuni 160 märki, existing status kuni 40 märki, reason ainult enum `none`, `not-applicable`, `disabled`, `capacity`, `budget`, `timeout`, `provider-error`, `invalid-output`, `local-rejected`, `no-new-contribution`, `visible-rejected`, `evidence-insufficient`. Toorviga kaardistatakse põhjuseks enne DB piiri. Uut tabelit, raw query'd, output'i ega tokenilogimist ei lisata; HMAC päringusõrmejälg ja retention säilivad. Attempt fields ei leki public API-sse, cache'i ega UI-sse.

Cache-õigus määratakse delivered provider/status ja olemasoleva evidence-kind policy järgi. Uut üldise forestry proosa caching'ut ei lisata. Model prose ei salvestata shared cache'i; truthful deterministic rollback võib cache'ida ainult juba lubatud kontrollitud kind'i. Public schema ja citation allowlist jäävad samaks; uued pack/attempt/contracts on PRIVATE.

## 8. Mudeliväljundi dead weight ja SMI kordus

`server/pipeline.mjs:1495–1499` kasutab related navigation'iks reviewed local copy't, mitte `llmResult.related`. Repo otsingus on provider `related_questions` tarbijad direct/SDK skeem ja `validateRelatedQuestions` helper + testid, mitte avaliku navigation'i live tarbija. `server/forestry.mjs` ning knowledge JSON `related_questions` on **teine, lokaalse toote copy leping** ja jäävad alles.

Rakenduses eemaldatakse provider `related_questions`, selle prompt instruction, `validateRelatedQuestions`, generate-result `related` ning mõlema skeemi/helper-kutse testitarbijad puhta cutover'ina. Public `related` ei muutu; sama kohaliku navigeerimise kaitse jääb tarbijatestiga. Ei jäeta tühja legacy field'i ega shim'i. Võimalik tokeni/latentsuse vähenemine on mõõtmata; sellest ei väideta teadaoleva timeout'i lahendust.

SMI nähtav kordus on päriselt tõendatud recovery vastuses. `server/search.mjs:7965–7966` summary ja content kannavad kattuvat definitsiooni; `server/llm.mjs:2035–2057` lisab mõnel juhul veel seeded intro. Eemaldame draft self-evidence'i ning moodustame single-source source windows'eid ilma täpse dubleerimiseta. Ühe SMI intro composition kasutab üht source-supported definitsiooni ja vajadusel eraldi scope/uncertainty lauset, mitte definitsiooni teist kuju. Strict definition-role tuvastust kasutatakse korduse vältimiseks kompositsioonis, mitte grounding'u nõrgendamiseks ega suvaliste mudelilausete semantiliseks ümberkirjutuseks.

### Väike client provider-boundary leping

06.10.2026 tegelik installed parser → native model-wire kontroll (`/tmp/praktika-reasoning-contract-evidence.json`) eristab parseri ja mudeli tuge: parser võtab `minimal` vastu, kuid `openai-codex/gpt-6-luna` native rada lükkab selle tagasi. `low` jõuab tegelikku wire'i, `none` jäetakse vaikselt välja ega tõenda thinking'u keelamist. See on olemasoleva Responses-kliendi liidese tõepärasus, mitte uus capability-framework või latency-hüpotees.

Existing `server/provider-policy.mjs` resolver `resolveLlmReasoningEffort(value = "low")` teenindab direct client startup'i ja SDK caller'eid. Selle rakenduse lubatud väärtused on **`low`, `medium`**; puuduv setting annab `low`, explicit `minimal`, `none`, tundmatu või suurem effort annab fail-fast konfiguratsioonivea enne server listen/provider dispatch'i. Production `low`, model routing, gateway URL ja credential runtime-only piirid ei muutu. Gateway/native OMP lähtekoodi ega globaalseid seadeid ei muudeta.

`.env.example`, hooldus- ja avalikud developer-docs ning actual client/SDK tarbijad kasutavad seda lepingut. Püsiv regressioon käivitab actual serveri toetamata setting'utega ning nõuab nonzero enne kuulamist. Olemasolevat native diagnostikat ei korrata: `3200` jõudis parsed/gateway/native option'isse, kuid Codex wire'is puudusid `max_output_tokens` ja `max_completion_tokens`. Seega on see rakenduse reservation/request option, mitte upstream hard output cap. Kvoot arvestab tegelikku usage'it või teadmata kasutuse korral olemasolevat konservatiivset reservi; deadline, response-byte ja grounding piirid säilivad. Sellest ei väideta latency parandust.

## 9. Cache ja ühine request lifecycle

`readSearchCache(query, revision, { signal, deadlineAt })` kasutab olemasolevat `databaseQuery`; Maini delegeeritud kontrollworker tõendab cache-error fallback'i ning abort/deadline propagation'it. Ei tehta uut pool/race/timeout abstraktsiooni. `recordSearch` kasutab olemasolevaid request-scoped persistence-window ja cleanup lease kaitseid. Hilinenud run/cache tulemus pärast abort'i või tähtaega ei persistitu.

Cache projection säilitab bounded `updated/dataYear/dataAsOf` lisaks olemasolevale `published/locator` ja private eligibility/version väljadele samast snapshot'ist. Source-lane tõstab `SEARCH_CACHE_RESPONSE_SCHEMA` semantilise versiooni; core tõstab `SEARCH_RESPONSE_REVISION`. Cold/draft/hit/public metadata on sama. Metadata't ei parandata sama-resource aliase jooksva body'ga, sest see võib olla teine versioon. Listing revision/membership kasutab ühist identity lepingut ja tegelikku tõendiversiooni.

15 s stream, 12 s JSON, 1500 ms model tail, results → optional draft → answer, admission fair queue, client cancellation, per-client/provider quotas ja losing-operation lease säilivad (`server/request-budget.mjs:1–25`; `server/pipeline.mjs:1460–1480`; `server/index.mjs:506–650`). Source-/model-outage korral saadetakse juba kontrollitud deterministlik vastus või aus ebapiisavus; ajapiiri ei tõsteta ning puudumist ei nimetata nullandmeks.

## 10. Tööjaotus ja cutover

Kaks sõltumatut rakendusliini algavad pärast Maini design-read'i ja sõnaselget rakendussuunamist. Need ei käivita build/lint/test/formatter/provider kontrolli poole töö pealt. Main on Director: ta delegeerib tervikliku cutover'i verifitseerimise spetsiaalsele kontrollworker'ile ja hindab tegelikku tõendit, ei käivita ise Bash-kontrolle ega editeeri faile.

| Omanik | Failid ja vastutus |
|---|---|
| Core (`praktika-architecture-core`) | `retrieval.mjs`, `pipeline.mjs`, `llm.mjs`, `forestry-public.mjs`, `smi-tables.mjs`, provider-output `agent-orchestrator.mjs`, existing `provider-policy.mjs` väike reasoning resolver; minimaalsed uued `evidence-pack.mjs` ja `delivered-outcome.mjs`. Role/edition selection, tuple, atomic merge, pack ja final provenance tarbijad. |
| Source (`praktika-source-contracts`) | `source-registry.mjs`, `forestry-source-policy.mjs`, uus `source-identity.mjs`, `corpus.mjs`, `integrations.mjs`, `database.mjs`. Identity, truthful checkedAt/classification, corpus identity migration, cache dates/deadline ja bounded attempt JSONB. Core faile ei muuda. |
| Core testid | `public-forestry`, `infrastructure`, `retrieval`, `official-knowledge`, `search-stream`, `agent-orchestrator` existing regressioonid. |
| Source testid | `citation-policy`, `corpus`, `integrations`, `source-label`, kogu `public-search` fail. Source-profile/cache/identity regressioonid ning core poolt antud evidence-pack import/caller cutover; teisel liinil seda faili ei muudeta. |
| Core integratsioon/dokumendid | Kõik ülejäänud core liideste tarbijad, `.env.example`, `docs/ARHITEKTUUR.md`, `docs/IT-HOOLDUS.md`, `README.md`, `PROJEKT.md`, `PRIVAATSUS.md`, `src/docs/content.jsx`, spec/plan ja Archify artefakt. Source omab `docs/ALLIKAD.md`; tõendifail `acceptance-evidence.md` uuendatakse core poolt Maini hinnatud delegeeritud kontrollitulemuste järgi. |
| Main (Director) | Design-read, kahe liini käivitamine, lõppkontrollide/browser proof/review/ship tegevuste delegeerimine ning tõendi ja release-otsuse hindamine. Ei ole edit-owner ega oma Bash-verifitseerimise käivitaja. |

Core teatab source-lane'ile enne töö algust külmutatud identity import'id ja `recordSearch.attempt`/cache context lepingu. Source-lane ei muuda retrieval/pipeline/smi-tables faile; core migreerib nende import'id. Kui tarbijate otsing leiab teise omaniku faili, saadetakse omanikule täpne caller-leping, mitte paralleelne edit. Core omab lõppintegratsiooni ja talle määratud dokumente; kõik vana liidese caller'id/testid migreeritakse, obsolete aliases eemaldatakse. Main ei pea dokumentatsiooni ise kirjutama.

Dokumentatsioon järgib tegelikku cutover'it: olemasolevad `docs/ARHITEKTUUR.md`, `docs/ALLIKAD.md`, `docs/IT-HOOLDUS.md`, `README.md`, `PROJEKT.md`, `PRIVAATSUS.md`, `acceptance-evidence.md` ning vajadusel `src/docs/content.jsx`. Avalikus `/docs` on user/developer vaated (`README.md:15–29`), mitte uus architecture-app. Ajaloolised Statistikaameti adapteriskeemid ja allikaloendurid/kuupäevad märgitakse ajalooliseks; neid ei esitata aktiivse allikapoliitika ega praeguse mõõtmisena. README üldist 15 s edukuse väidet ei jäeta vastuollu mõõtmata generic-acceptance'iga.

Archify artefakt koostatakse alles pärast implementeeritud koodi commit'i; enne seda loetakse `skill://archify`. Diagramm peab olema seotud tegeliku HEAD/SHA ja commit'itud failibaitidega, näitama olemasolevat direct-rada ning optional SDK rada ausalt. Spekulatiivseid komponente ega dirty-code'i kohta pinned-SHA tõendit ei looda.

## 11. Mõõdetav vastuvõtt ja tõendid

1. **Täpne päris `mets`.** Brauseri input ja server result.query on täpselt `mets`; final saabub ≤15 s. Võrdlus initial draft → final ja PRIVATE **delivered** provenance näitab vähemalt üht uut sidusat mudeli seletusosa, mis läbis local ja visible gate'i, kasutab vähemalt kahte asjakohast allikat ning mille ülevaate plaan/pakk katab kõik neli rolli. `ready`, protected lead, kopeeritud rollilõigud või kirjavahemärkidega ühendatud tsitaadid pole tõend. Canonical SMI definitsioon ja scope sisalduvad, kui see allikas on nähtav.
2. **Filter ja polaarsus.** Canonical method allika välistamisel ei lisata väljaspool listing'ut viidet ega definitsiooni. Plot-count või negated method ei täida method-rolli. Sama geography/year/unit kaitse säilib.
3. **Truthful delivery.** Kõik parts rejected, muutmata protected lead/fallback, punctuation-only baseline ja visible rollback annavad deterministliku label/provider'i; edukas uus public claim annab AI label'i ja vastava delivered provider'i. PRIVATE attempt säilib bounded reason'iga ega leki avalikku vastusesse.
4. **Üks bounded tõde.** Pika päris fixture'i vajalikud täislõigud säilivad pärast 10/4000/36000 serialization piire. Väljajäänud lõik, vana draft/title/tag ei ground'i uut väidet. Rolli kaotanud pack ei ole complete/strong. Avalik witness tuleb sama paki juba piiratud kirjest muutmata kujul, mitte uuest 900-märgilisest aknast.
5. **Allika identiteet ja aeg.** Alias resource equality, PDF page/locator eristus, stable repeated query-value order, hydration same-resource/no page-body substitution, atomaarne richerEvidence metadata mõlemas input-order'is. Unknown checkedAt jääb nulliks. RMK SMI-tag ei boost'i primary class'i; irrelevant high authority ei võida katvat dokumenti. Publication filter ja update/dataYear tähendused ei segune.
6. **Edition.** Unqualified latest valik vajab kontrollitud primary artefakti; explicit 2024 jääb oma väljaande/revisjoni juurde. 2025 revised ajalooline väärtus ei segune old PDF trendiga. Upstream unavailable/stale ei anna latest või zero väidet.
7. **Cache parity ja lifecycle.** Cold/hit säilitavad published/updated/dataYear/dataAsOf/locator sama sourceDateMeta. Cache lookup pärib signal/deadline'i. Provider/source outage, deadline, saturation ja disconnect jätavad ausa fallback'i; lease vabastab slot'i alles cleanup'i järel; hilist persistence'i pole.
8. **SMI ja avalik pind.** Päris üksik-SMI küsimusel toimivad tegelikud approved viited, definitsioon ei kordu. Local navigation ei muutu provider copy'ks. Olemasolevad stream/filter/chart/followup/privacy ning aadressirelay regressioonid jäävad roheliseks.
9. **Identity cutover ja reasoning consumer.** Metadata identity backfill säilitab IDs/original URL/private ajaloo/body/version/locator; tail exclusion kasutab sama versioned key'd ilma regex alias shim'ita. Võrdne key ei laienda fetch/citation/cache target/finalURI õigust ning arbitrary locator ei valideeri page'i. `minimal/low` installed-parser/model-wire mapping on ajutise tegeliku raja tõendiga kinnitatud; `none`/unsupported config lõpetab tegeliku server consumer startup'i nonzero, production `low` säilib. Viimane pole sünteesi latency tõend.

Bug regressioonid kasutavad olemasolevate consumer'ite päris source fixtures'eid ja injectable provider/persistence capture'i, mitte prompt-wording/wiring/mudeli echo teste või duplikaatjuhtumeid. Main delegeerib kontrollworker'ile uute bug regression'ide red algse käitumisega ja green integreeritud cutover'iga ning seejärel repo täiskontrollid; Director loeb tulemused ja võrdleb acceptance'iga, ei käivita ise Bash'i. `package.json:6–24` järgi on `npm test`, `npm run build`, `npm run test:sites`; README kontrollis ka `docker compose config` ja olemasolevad relevance/public eval-id. Eraldi lint/typecheck skripti praeguses package'is ei ole; seda ei fabritseerita. Kui olemasolev CI sisaldab täiendavat lint/typecheck/packaging kontrolli, käivitab kontrollworker tegeliku käsu, mitte väljamõeldud asenduse.

Päris provider/browser tõend tuleb pärast muudetud causal rada, mitte muutmata kõnede kordamisest. Kui end-to-end süntees endiselt katkeb, ei nimetata arhitektuuri valmis toimituks ega oletata gateway bug'i; Main suunab worker'i olemasolevat timing/cancellation tõendit uurima lubatud ulatuses ja hindab tegeliku käitumise sulgemist, mitte ei ship'i scaffold'i. Lõplik diff review delegeeritakse üks kord iga tervikliku diffi kohta. Green täiskontrollide ja acceptance'i järel delegeerib Main intended failide commit/push/juurutuse; exact-SHA health/build/live evidence tõendab avaldatud versiooni. Selles design-faasis koodi approval ega ühtki neist jooksudest veel pole.
