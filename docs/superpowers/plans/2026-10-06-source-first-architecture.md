# Allikakeskse arhitektuuri rakendusplaan

**Eesmärk:** olemasolevas Node/Express + PostgreSQL rakenduses on üks allikaversioon, üks role-preserving tõendipakk ja tõene avaldatud vastuse päritolu. Täpne päris `mets` saab ≤15 s jooksul uue viidatud sidusa mudeliosa, mitte deterministliku mustandi AI-sildiga koopia.

**Disain:** [2026-10-06-source-first-architecture-design.md](../specs/2026-10-06-source-first-architecture-design.md), eriti lepingud §4–9, tööjaotus §10 ja vastuvõtt §11.

**Staatus:** kavand, mitte teostustõend. Selles faasis kirjutati ainult spec ja plan. Neli varasemat muudetud lähtekoodi/testifaili säilivad; täpse `mets` sünteesi ja latency juurpõhjuse tõend puudub. Main loeb disaini/plaani enne kahe rakendusliini käivitamist. Uut kasutaja approval-gate'i ei ole.

## 1. Omanikud ja külmutatud koostööleping

Kaks liini töötavad sõltumatult, ei käivita poole töö pealt teste, build'i, formatter'it ega provider probe'i. Main on Director: delegeerib verifitseerimise pärast terviklikku cutover'it eraldi kontrollworker'ile ning hindab tõendeid; ise ei käivita Bash-kontrolle ega muuda faile. Core on lõppintegratsiooni edit-owner. Koodi approval selles design-faasis veel puudub.

| Liin | Edit-owner'i failid |
|---|---|
| Core `praktika-architecture-core` | `server/retrieval.mjs`, `pipeline.mjs`, `llm.mjs`, `forestry-public.mjs`, `smi-tables.mjs`, `agent-orchestrator.mjs`, existing `provider-policy.mjs` väike client reasoning resolver; minimaalsed uued `evidence-pack.mjs`, `delivered-outcome.mjs`. Existing `tests/public-forestry.test.mjs`, `infrastructure`, `retrieval`, `official-knowledge`, `search-stream`, `agent-orchestrator` ja muud core-liidese tarbijad omaniku puudumisel. |
| Source `praktika-source-contracts` | `server/source-registry.mjs`, `forestry-source-policy.mjs`, uus `source-identity.mjs`, `corpus.mjs`, `integrations.mjs`, `database.mjs`; `tests/citation-policy`, `corpus`, `integrations`, `source-label`, kogu `public-search.test.mjs`; `docs/ALLIKAD.md`. Core faile ei muuda. |
| Core dokumentatsioon/integratsioon | `.env.example`, `docs/ARHITEKTUUR.md`, `docs/IT-HOOLDUS.md`, `README.md`, `PROJEKT.md`, `PRIVAATSUS.md`, vajadusel `src/docs/content.jsx`; `acceptance-evidence.md` Maini hinnatud delegeeritud tulemuste järgi; käesolev spec/plan ning commit'itud koodile seotud Archify artefakt. |
| Main (Director) | Design-read, liinide käivitamine; red/green, täiskontrollide, ühekordse diff review, päris browser/provider acceptance ja commit/push/exact-SHA deploy kontrolli delegeerimine. Hindab tõendeid ja release-otsust, ei ole edit-owner ega oma Bash-kontrollide käivitaja. |

Core saadab enne rakendusliinide algust source-lane'ile järgmised liidesed. Need on **uued kavandatud nimed**, mitte väide olemasoleva ekspordi kohta:

1. `sourceResourceKey(url) -> string | null`, `sourceWitnessKey(source) -> string | null`, `sameSourceResource(leftUrl,rightUrl) -> boolean` moodulist `server/source-identity.mjs`. Key on võrdlus-/metadata identiteet, **mitte fetch/citation URL**. Approved original fetch/display URL säilib eraldi; stable query-key sort/repeated-value order ja resource versus validated PDF/locator witness tähendus disaini §4 järgi. Known producer + existing eligibility on witness'i prerequisite; arbitrary locator/hash/resourceKey ei valideeri page'i ega autoriseeri transporti.
2. `readSearchCache(query, revision, { signal, deadlineAt })`: request context pärandub olemasolevale `databaseQuery`-le; abort/deadline ei muutu cache hit'iks ega hiliseks kirjutuseks.
3. `recordSearch({ ...existingFields, answerProvider, answerStatus, attempt })`: delivered väärtused tulevad core lõppotsusest. Optional PRIVATE `attempt` provider ≤160, status ≤40, reason enum disaini §7 järgi. Raw error/query/output/token data puudub. Puuduv attempt jäetakse välja; ükski caller ei kasuta selle asemel katse provider'it delivered provider'ina.
4. Source tõstab cache envelope skeemi, core `SEARCH_RESPONSE_REVISION`. `updated/dataYear/dataAsOf` bounded projection säilib samast snapshot'ist koos `published/locator/version` väljadega.
5. Core annab source-lane'ile `public-search.test.mjs` evidence-pack/sanitizer import ja caller muudatuste täpse lepingu. Kogu failil on üks edit-owner; core ei tee paralleelset patch'i.

Allikareeglite ja identity parser'i helper'eid ei dubleerita core failides. Teise omaniku avastatud caller edastatakse omanikule koos vajaliku kujuga. Kõik vana `canonicalResultUrl`, `buildBoundedEvidence`, llm sanitizer re-export ja provider related-helper caller'id migreeritakse puhtalt; üleminekushim'e ei jää.

## 2. Source-liin: identity, provenance ja cache

### 2.1. Ühine identiteet

**Muudatused:** uus `source-identity.mjs`, source-owned corpus/integrations/registry caller'id; core kasutab samu eksporde retrieval/pipeline/SMI allikates.

- Taaskasuta WHATWG URL/URLSearchParams ning existing PDF page parser'i tähendust. Vigane URL annab `null`, mitte lowercase pseudo-identity.
- Kanoniseeri ainult approved www/portaali `/et` aliaspaare; stable sort säilitab sama võtme korduvate väärtuste järjekorra. Ordinary fragment eemaldub, PDF page/verified locator jääb witness'i.
- Discovery queue identity, eraldi persisted resource metadata, post-approval hydration correlation ja SQL tail exclusion kasutavad sama comparison-key lepingut. **Ära kasuta key'd võrgupäringu või citation URL-ina:** original approved fetch/display URL koos transpordi nõutud raw `/et/query/tracking` kujuga säilib. `canonical_url` jääb senise URL-i/UNIQUE/ON CONFLICT semantikaga, mitte uue key'ga üle kirjutatavaks.
- Tee existing schema/migration mustris bounded/idempotent **non-destructive backfill** eraldi `metadata.sourceResourceKey/sourceIdentityVersion` väljadele (existing metadata JSONB). Säilita document IDs, ajalooline private provenance, kõik muud metadata/body/hash/version/date/locator väljad; pole massrekey/drop/destructive merge'i ega uut resource UNIQUE constraint'i. Existing capacity transaction guard piirab metadata mahu kasvu. New writer hoiab metadata samas tehingus; backfill + ingest/read parity on uue tail-exclusion tee prerequisite. SQL kasutab versioned computed/backfilled identity't, mitte vana regex alias shim'i.
- Existing transport final-resource matcher on hydration'i eeltingimus oma rangema query/target/path lepinguga: shared equality ei luba seni keelatud reordered-query/tracking/`/et` redirect'i. Cache/inflight coalescing ei tohi aliased payload'i reuse'ida senisest guard'ist laiemalt: iga caller'i original target ja saadud final URI valideeritakse endiselt, ka cache hit'il. Physical PDF fetch reuse võib olemasoleva transpordireegli järgi fragmenti ignoreerida, kuid distinct page/locator body proof ei ühine. Provider-policy/Terrapoint/base-URL ja brauseri HTTPS-safety helper pole cutover'i caller'id.

**Consumer regressioonid:** existing corpus queue/repeated-query ja integrations strict target/finalURI/cache juhtumid; same comparison key + erinev raw `/et/query/tracking` ei anna uut transport/cache õigust. Backfill read-back tõendab ID/URL/body/version/locator/ajaloolise metadata säilimist ning SQL tail parity't ilma old-regex shim'ita. Known producer/eligibility puudumisel arbitrary page/locator ei toeta claim'i. Eri PDF witnesses jäävad eraldi; physical fetch reuse ei launder'da tõendit. Retrieval.test juhtumi saadab source lane core'ile.

### 2.2. Tõene source class ja kontrolliaeg

**Muudatused:** `source-registry.mjs`, `forestry-source-policy.mjs`, source-profile tests, source docs.

- `checkedAt` on actual valid evidence status/review päev või `null`; fixed `2026-09-19` fallback eemaldub.
- `forestrySourceClass` primary mapping nõuab trusted publisher + approved resource pair/class'i. `_forestrySourceClass` explicit väärtus peab olema sama reviewed mapping'u all, mitte HTML/tag privilege escalation.
- RMK SMI sõna/tag ei anna SMI primary klassi. Unknown jääb mitte-primary/additional ametlikuks või navigation-only vastavalt olemasolevale eligibility'le.
- Publication/update/dataYear/observation/review semantics dokumenteeritakse eraldi; globaalset review kuupäeva ei tõsteta ühe allika kontrolliga.

**Consumer regressioonid:** existing `public-search` registry/profile ja source-label juhtumid: unknown/invalid checked time; valid per-source review; trusted primary versus RMK tag-mutation; publication/year filter versus updated/reference period.

### 2.3. Cache ja private attempt

**Muudatused:** `database.mjs`, existing `citation-policy` cache round-trip/privacy tests, source-owned `public-search` tarbijad.

- Lisa cache safeSources allowlist'i kolm olemasolevat bounded välja `updated`, `dataYear`, `dataAsOf`; tõsta `SEARCH_CACHE_RESPONSE_SCHEMA`. Ära merge'i hit'ile uuema aliase metadata't.
- Kasuta cache-read'is existing `databaseQuery`, pass-through `{ signal, deadlineAt }`; pool/query/schema lifecycle jääb samasse olemasolevasse moodulisse. Ühtegi uut timeout'i/retry't ei lisata.
- Salvesta optional bounded attempt existing provenance JSONB sees; delivered `answer_provider/answerStatus` säilitavad senise DB kuju ja tulevad lõppotsusest. Eemalda unknown raw attempt reason, ära talleta toorviga.
- Preserve HMAC/retention/private-fragment filtering, model-prose-cache keeld ning persistence cancellation.

**Consumer regressioonid:** cold/cache sourceDateMeta ja locator parity; private evidence/attempt ei leki; stale hit pole lubatud; shared deadline/abort peatab cache-operatsiooni ning late persistence jääb ära. Main käivitab need pärast cutover'it.

## 3. Core-liin: rollid, edition ja tõendipakk

### 3.1. Rolliplaneerija ja lõplik järjestus

**Muudatused:** `retrieval.mjs`, `forestry-public.mjs`, core consumer tests.

- Lisa `forest-overview` named roles `measurement/method/condition/registry`, `roleWitnesses`, `numericSourceRole`, `edition` olemasoleva `selectAnswerEvidence` väljundisse. Säilita scope/year/unit/privacy ja abstention kaitsed.
- Vii pipeline'i strict SMI national role ja registry/condition semantika ühele retrieval-owned witness otsusele, reuse existing measurement-method predicate. Raw claim-bearing passage tõendab rolli; ID/title/tag/discovery ei tõenda. Wholephrase/arvugruppide kasvu asemel tõenda entity/year/value/unit/definition/method.
- Composer tarbib sama planeerija witnesses'eid ja valitud numeric role'i; eemaldub sõltumatu `forest-area` hardcoded lead ja weak fallback method-otsing.
- Asenda fact ranking'u forestry authority additive boonus disaini §5 transitiivse tuple'iga; selles harus pole teist publisher-authority additive boonusliiget. Materialiseeri finite [0,1] scope/satisfaction/role coverage/coherent/core metrics olemasolevatest selector'itest, finite existing class priority või 0 ja existing score ilma authority/hierarchy liikmeteta. Undefined/NaN/Infinity ei lähe comparator'isse; invalid proof pole sobivus, puuduv metric on 0.
- Rakenda final public prefix'is ja numeric-role lead selection'is sama disaini täielikku well-order'it: mandatory/coverage P → class priority → notFutureDated → relevance korral base score/date, requestedNewest korral strict publication/date enne base score'i; title/id/witness/version lõpetavad stabiilselt. Publication sort ei muuda requested reference year/verified edition ega navigatsiooni existing servicePriority't. Ei pairwise tolerance'it, magic band'i ega score bucket'i authority boost'i.
- `mergeDuplicate` body, locator, `published/_publishedAt/updated/dataYear/dataAsOf`, observation/review/version/freshness/capability väljad tulevad atomaarse richerEvidence kirjena; absent metadata ei päri teist body versiooni.

**Consumer regressioonid:** olemasolev generic public-forestry juhtum laiendatakse nelja rolli + filter/plot-count/negated method jaoks; final public ranking ja lead complete-versus-authority, nav separation ja tuple transitivity; alias atomic metadata mõlemas input-order'is; olemasolev PDF page eristus jääb.

### 3.2. Edition ja kontrollitud publication

**Muudatused:** `forestry-public.mjs`, `smi-tables.mjs`, vajadusel core-owned actual catalogue caller; consumer regressioonid.

- Paranda ainult tõendatud publication mismatches: `forest-yearbook-overview` `2021-12-15`, `lulucf-definition` `2022-01-31`, `protected-forest-share` `2023-04-12`; existing visible `published` on alus. `updated` jääb eraldi. `forest-balance-kaur-methodology` olemasolev `published=09.04.2026/_publishedAt=2026-04-09` ei ole see viga.
- Loe enne upstream-verifikatsiooni vastav `agent-reach` skill. Kasuta olemasolevat official list ja `SMI_2025_TABLES_URL`, mitte inventeeritud uut URL-i ega provider probe'i. Kontrolli workbook'i tegelikku publication/edition, relevant sheet/row/column, reference year, ühikut/nimetajat ja revised values tähendust; anna locator + actual artifact evidence.
- Kui kontrollitud uusim primary 2025 väljaanne on kinnitatud, aastata national overview valib selle measurement role'i. Explicit historical 2024 kasutab oma olemasolevat 2024 PDF väljaannet; explicit 2025 revised row jääb oma edition'i. Ei sega kahte metoodikat trendiks.
- Kui upstream verification pole võimalik, olemasolev kontrollitud historical evidence on aasta piires kasutatav, kuid „latest” staatust ei anta. Pole zero/fabricated fallback'i.
- SMI workbook presence ja chart citation reuse migreeritakse shared resource/witness lepingule. `_contentHash` jääb excerpt hash'iks, mitte fake XLSX checksum'iks.

**Consumer regressioonid:** unqualified verified-edition measurement selection; explicit 2024 retention; revised-edition no mixing; stale/unavailable latest honesty. Uut täis-PDF index'it ega üldist trendiarvutust ei looda.

### 3.3. Üks bounded immutable pack

**Muudatused:** uus `evidence-pack.mjs`, `llm.mjs`, `pipeline.mjs`, caller tests/imports.

- Koli olemasolev sanitizer/window selection selge omanikuga puhtasse moodulisse. `buildEvidencePack({sources,query,plan})` tagastab disaini §6 kuju; llm ei re-export'i obsolete helper'it.
- Ehita üks kord post-hydration eligible visible source snapshot'ist/citation mapping'ust. Reserveeri iga required role'i terve sanitized source passage enne optional windows'eid. Draft claims, protected lead, generated baseline ning title/tags ei lähe body faktitõendiks.
- Säilita 10 sources /4000 chars per content /36000 serialized chars; kontrolli exact serialized mahupiiri pärast escaping'ut. Required role passage ei kärbu; kui ei mahu või sanitize eemaldas, complete=false ja model-evidence-insufficient.
- Sama immutable `entries` läheb direct/SDK mudelile ja local grounding'ule. `sourceEvidence` ja kõik `rebindGroundedCitations`/grounding helper'id tarbivad sama pack'i; teist build'i või lazy legacy fallback'i ei jää.
- Muuda `validateGroundedAnswer(payload,draft,query,evidencePack)` väljundiks `{answer,acceptedClaims,rejectionReason}`. Migrate kõik injectable generateAnswer ja otsesed testitarbijad; source-lane teeb oma public-search patch'i antud lepingu järgi.
- Visible excerpt on sama immutable pack entry täielik `content`, olemasoleva 4000/source ja 36000/serialJSON piirides; teist 900-märgilist valikut ei tehta. Puuduv visible support eemaldab claim'i/rollback'ib, ei otsi raw allika clipped osast tuge.

**Consumer regressioonid:** pikk päris fixture role preservation/serialized cap, clipped-only support rejection, raw-only no self-grounding/title proof, visible same-version witness, mandatory-passages-insufficient. Olemasolevaid grounding work-limit/negation/entity/year/unit teste ei nõrgendata.

## 4. Core-liin: tõene delivery ja provider-output cutover

### 4.1. Lõppotsus pärast avalikku piiri

**Muudatused:** uus `delivered-outcome.mjs`, `pipeline.mjs`, `llm.mjs`, core infrastructure/stream consumer tests.

- Provider result `{answer,acceptedClaims,attempt}` eraldab katse avaldatud sisust; toorvead kaardistatakse bounded enum reason'iks.
- Säilita detached deterministic baseline. Rebind pack-only visible witnesses; publicResponse exact-one citation/approved URL/eligibility/freshness ja chart remap jäävad viimaseks avaliku sisu piiriks.
- `deliveredOutcome` arvutab pärast public serialization'i final label, provider/status, cacheability ja bounded attempt reason'i. Published accepted claim hash seotakse source witness/version'iga; protected intro, fallback parts, heading/citation ja punctuation-only baseline muutus pole uus panus.
- Kõik parts rejected või visible rollback: truthful deterministic label/provider, PRIVATE attempt põhjus alles. AI label ainult kui uus accepted claim on päriselt final avalikus sisus.
- `recordSearch` ja existing kind-specific cache policy saavad DeliveredOutcome väärtused. General forestry proosa cache scope ei laiene; model prose ei persistitu shared cache'i.
- Cache-hit/context caller, listing revision/membership ja private evidence strip migreeritakse source-lane'i liidesele. 15s/12s/1500ms/abort/admission/cleanup muutmata.

**Consumer regressioonid:** existing ready-visible-witness test lisab genuine new contribution ja persisted delivered provenance capture'i; existing rejection/rollback juhtumid laiendatakse unchanged lead/fallback/punctuation-only jaoks. Final-invalid-citation ei salvesta provider-ready päritolu. Model outage/deadline/disconnect ei tekita hilist cache/run write'i.

### 4.2. Provider related field ja SMI kordus

**Muudatused:** `llm.mjs`, `agent-orchestrator.mjs`, nende consumer tests ning kõik avastatud provider-output caller'id.

- Kinnita kogu repo consumer otsinguga, et provider `related_questions` puudub avaliku navigation'i sõltuvusest. Eemalda field direct JSON Schema'st ja SDK Zod schema'st, vastav prompt lause, validator/helper/export ning generate result.related. Kogu cutover ühes muutuses, mitte legacy empty array.
- Local `forestry.mjs` / knowledge JSON `related_questions` ja public `related` reviewed copy **säilivad**. Migrate existing related poison consumer test kohaliku navigeerimise lepingule; obsolete helper-only testid eemaldada, mitte asendada teise wiring testiga.
- Eemalda source pack'i exact duplicate summary/content laused ning seeded draft self-evidence. Single SMI intro kasutab üht strict source-supported definition-role lauset, lisaselgitus teist scope/uncertainty lauset. Ära lõdventa validator'it ega lisa fake authoring template'i.

**Tõend:** existing SDK direct-output parse/review/budget tests saavad päris uue skeemi; üksik-SMI public consumer tõendab mitte-korduvat definitsiooni, actual citations ja local navigation'i. Tokeni/latentsuse võit on mõõdetav alles hiljem, mitte kavandi fakt.

### 4.3. Väike Responses client reasoning-contract

**Muudatused:** existing `provider-policy.mjs`, `llm.mjs`, `agent-orchestrator.mjs`, `.env.example`, operator/public developer docs ja actual client startup regressioon.

- Tegelik installed native Luna proof lükkab `minimal` tagasi; parseri toe põhjal ei tuletata mudeli tuge. Existing `resolveLlmReasoningEffort(value = "low")` lubab mõlemal client-rajal ainult `low/medium`; explicit minimal/none/tundmatu/suurem effort fail-fast. Production low/model/URL/credential/timeout piirid ei muutu.
- Invalid server setting peab lõpetama actual startup'i nonzero enne server listen/provider dispatch'i; kõik client/SDK caller'id migreeritakse. `.env.example` ja operator/public developer docs annavad ainult selle tegeliku toe, mitte ignored-control lubadust. Gateway/native OMP edits või capability-framework ei kuulu siia.
- Kasuta juba kogutud tegelikku native proof'i, mitte uut gateway diagnoosi: low jõuab wire'i, none oli välja jäetud ja minimal unsupported. 3200 on application reservation/request option, mitte Codex upstream hardcap; actual usage arvestus ja response-byte/deadline/grounding piirid säilivad. Püsiv regression nõuab actual server startup'i nonzero toetamata setting'uga; latency parandust ei väideta.


## 5. Lõppintegratsioon ja olemasolevad dokumendid

Core võtab source-lane'i landed liidesed vastu, migreerib kõik talle kuuluvad caller'id ning edastab owner'ile viimased source-file callsite vajadused. Ei jäeta mixed vana/uue paki rada, canonical aliases'e või default rebuild'i. Nelja algse dirty faili role/exclusion/overview intent kaitsed peavad end-to-end alles olema. User untracked materjali ei käsitleta cleanup'ina.

Dokumendid kirjeldavad päris rakendust, mitte pelgalt plaani: pack windows, roles, published versus attempt, date/edition semantics, timeout fallback, cache privacy ja operator annual primary-source kontroll. `README`/avalik user-developer docs ei luba generic mudelisünteesi enne päris tõendit. Arhitektuuri diagrammi primary rada on direct; SDK on optional. Statistikaameti vana aktiivseks esitav kirjeldus ning allikaloendurid/kuupäevad muudetakse tegeliku current contract'i järgi või märgitakse selgesõnaliselt kuupäevastatud ajalooks; uusi source counts'e ei leiutata.

## 6. Maini kontrollid ja ship-värav

Liinid tagastavad failid ja consumer requirements, mitte passing-test väiteid. Alloleva käivitamise teeb Maini delegeeritud kontrollworker pärast kõigi muudatuste maandumist; Director hindab täielikku väljundit ja acceptance'i, ei käivita ise Bash'i ega editeeri tõendifaile. Neid kontrolle selles design-faasis ei tehta.

### Regressioonide red/green ja repo kontroll

1. Kontrollworker tõendab olemasoleva tegeliku käitumisega uute bug regressioonide red ning integreeritud cutover'iga green. Vajadusel kasutab isoleeritud baseline checkout/fixture harness'i, mitte kasutaja dirty failide destructive reset'i. Kasutaja juba raporteeritud live-viga ei kinnitata kordusprobe'iga.
2. Kontrollworker käivitab tervikliku affected consumer set'i: public-forestry, infrastructure, retrieval, official-knowledge, search-stream, agent-orchestrator, citation-policy, corpus, integrations, source-label, public-search. Sibling'eid ei kontrollita pooleldi muudetud failidega.
3. Kontrollworker käivitab package.json päris käsud: `npm test`, `npm run build`, `npm run test:sites`; README olemasolev `docker compose config` ja `npm run eval:holdout`, `eval:blind`, `eval:open`, `eval:public`. Build sisaldab `prepare-sites-build.mjs` packaging'ut. Eraldi lint/typecheck skripti package'is ei ole; CI tegelik täiendav kontroll tuleb selle definitsioonist lugeda, mitte oletada.
4. Main delegeerib ühekordse tervikliku diff review ja hindab disaini §11 iga acceptance nõude tõendit. Parandus nõuab muudetud raja uut kontrolli, mitte passing-log'i ülekasutamist.

### Päris avalik acceptance

Päris browser/provider proof'i ja selle capture'i teostab Maini suunatud kontrollworker; Director võrdleb tegelikke initial/final ja PRIVATE delivered tõendeid järgnevate nõuetega.

- Täpne `mets`: kontrolli puhas input value ja serveri result.query, mitte varasema `Mis on SMI?mets` hübriidi kordust. Capture results/draft/final, kogu kestus ≤15 s, vähemalt kaks kasutatud relevant source'i, kõik neli role witness'i pack'is ning vähemalt üks uus sidus explanatory model part pärast **mõlemat** grounding boundary't. Võrdle baseline/final ja PRIVATE delivered provider/status. Quote-list/punctuation-join/unchanged protected lead/ready row ei lähe sünteesina arvesse.
- Canonical SMI definition/scope actual visible citation; filter exclusion/plot-count/negated method ei fabritseeri rolli. Üksik-SMI päris approved viited ja korduseta definitsioon.
- Cold/cache source dates ja locator parity; primary RMK-tag mutation negative, irrelevant authority ordering, verified latest/historical edition separation. Source unavailable/stale ei muutu zero/latest vastuseks.
- Identity backfill säilitab IDs/original URL/history/body/version/locator, tail exclusion pole regex alias shim; key-equality ei laienda transport/citation/cache ega page proof õigust. Actual invalid reasoning consumer startup on nonzero; installed parser/model-wire minimal/low mapping proof on ajutine ja päris, production low unchanged. Pole permanent wiring/mockecho test ega latency-success väide.
- Provider outage/deadline/abort/saturation: kontrollitud fallback ja truthful provenance, ei pikendata timeout'i ega tehta retry't. No late persistence; fair admission cleanup lease säilib. Üldine public API, stream, followup, filters, charts, privacy ja aadressirelay regressioonid säilivad.

Unchanged provider/gateway probe'e ei tehta. Päris kõne tuleb pärast causal changed path'i. Kui exact-generic end-to-end acceptance endiselt ebaõnnestub, Main delegeerib olemasoleva timing/cancellation tõendi kogumise ja suunab causal paranduse lubatud piirides; latency juurpõhjust ei nimetata oletuse põhjal teadaolevaks ega ship'ita unfinished architecture't.

### Commit, Archify ja juurutus

Pärast green kontrolle ja actual acceptance'i delegeerib Main intended failide code commit'i ship-worker'ile. Core loeb `skill://archify` ja koostab artefakti **commit'itud HEAD/SHA baitidest**, mitte dirty muudatuse kohta võõrast SHA-d kasutades. Artefakt katab päris allika→listing→role plan→üks pack→model/local grounding→visible gate→DeliveredOutcome→public/cache/persistence piirid; mitte väljamõeldud teenused. Doc/artefact commit'i ja push'i teostab Maini suunatud worker. Exact-SHA deploy finished, health/build fingerprint ja final live public surface kontrolli teeb kontrollworker; core salvestab `acceptance-evidence.md` ainult Maini hinnatud tegelike tulemuste põhjal. Director ise ei editeeri ega käivita Bash-verifitseerimist.

Selle töö sulgemine tähendab rakendatud käitumist ja kõiki nimetatud acceptance nõudeid, mitte ainult spec'i, uusi moodulifaile või diagrammi. Disainifaasi lõpetamine ei ole rakenduse valmisoleku väide.
