import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { createPortalDraft, directEvidenceExtract, publicResponse, searchEnvironmentLive } from '../server/pipeline.mjs';
import { officialServiceCatalogueDocuments } from '../server/search.mjs';
import { publicSearchItem } from '../server/corpus.mjs';

test('open explanations retain distinct equally relevant evidence without unrelated page context', () => {
  const cause = 'Radoon on ohtlik, sest selle radioaktiivsed laguproduktid kahjustavad hingamisel kopse.';
  const consequence = 'Radoon on ohtlik eelkõige pikaajalisel kokkupuutel, mis suurendab kopsuvähi riski.';
  const unrelated = 'Radooni teemalisel seminaril tutvustatakse mõõteriistade uut kataloogi.';
  const extract = directEvidenceExtract('Miks on radoon ohtlik?', {
    summary: cause,
    content: [cause, consequence, unrelated].join(' '),
  }, null, { requireSubject: true });
  assert.ok(extract.includes(cause));
  assert.ok(extract.includes(consequence));
  assert.ok(!extract.includes(unrelated));
  assert.equal(extract.split(cause).length - 1, 1, 'summary and body duplication must not repeat a fact');
});

test('a focused measurement keeps the requested value instead of appending neighboring years', () => {
  const extract = directEvidenceExtract('jäätmete ringlussevõtu määr 2023', {
    summary: 'Olmejäätmete ringlussevõtu määr oli 2022. aastal 32%.',
    content: 'Olmejäätmete ringlussevõtu määr oli 2023. aastal 38%.',
  });
  assert.match(extract, /2023.*38%/u);
  assert.doesNotMatch(extract, /2022|32%/u);
});

test('a risk question answers the health effect rather than describing the guide', () => {
  const source = officialServiceCatalogueDocuments().find(document => document.id === 'radon-guidance');
  assert.ok(source);
  const extract = directEvidenceExtract('Miks on radoon ohtlik?', source, null, { requireSubject: true });
  assert.match(extract, /sissehingami[\s\S]*kopsuväh/iu);
  assert.doesNotMatch(extract, /juhend selgitab|seminar/iu);
});

async function currentFactCheckSource() {
  const row = JSON.parse(await readFile(new URL('./fixtures/forest-fact-check-article.json', import.meta.url), 'utf8'));
  return publicSearchItem({
    ...row,
    source_key: 'official-page-hydration',
    fetched_at: new Date().toISOString(),
    metadata: { hydrated: true, source_kind: 'official-page-hydration' },
  }, true);
}

test('a fact-check answer keeps the source response, disputed headings and historical qualification', async () => {
  const source = await currentFactCheckSource();
  const query = 'Millised on levinud valeväited Eesti metsa kohta?';
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: 1, items: [source] },
  });
  const response = publicResponse(draft);
  assert.equal(response.clarification, null);
  assert.ok(response.answer.introCitations.length);
  const registry = response.answer.parts.find(part => /Väide:[\s\S]*Metsaregistrile/iu.test(part.title));
  assert.ok(registry, 'the allegation is explicitly labeled, not published as the correction');
  assert.match(registry.text, /andmed on korrektsed[\s\S]*metoodikate erinevus/iu);
  assert.doesNotMatch(registry.text, /Metsaregistrile esitatakse valeandmeid/iu);
  const international = response.answer.parts.find(part => /Forest Europe/iu.test(part.title));
  assert.ok(international);
  assert.match(international.text, /59[\s\S]*61[\s\S]*klapivad/iu);
  assert.match(response.answer.note, /17\.03\.2023/);
  assert.match(response.answer.note, /mitte[\s\S]*tänase metsaseisu/iu);
  assert.equal(response.sources[0].url, source.url);
  assert.ok(response.sources[0].evidenceExcerpt.includes(registry.text.split('. ')[0]));
});

test('fact-check rendering cannot recycle a forest overview or an excluded historical source', async () => {
  const query = 'Millised on levinud valeväited Eesti metsa kohta?';
  const overview = officialServiceCatalogueDocuments().find(source => source.id === 'forest-area');
  const draft = await createPortalDraft(query, {
    deadlineAt: Date.now(),
    searchResults: { total: 1, items: [overview] },
  });
  assert.equal(draft.evidence.answerable, false);
  assert.deepEqual(draft.answer.introCitations, []);
  const source = await currentFactCheckSource();
  const filters = { source: 'all', category: '', year: 2026, sort: 'relevance' };
  const filtered = await searchEnvironmentLive(query, {
    useCache: false, filters,
    searchResults: { total: 1, items: [source], appliedFilters: filters },
  });
  assert.ok(!filtered.sources.some(candidate => candidate.url === source.url));
  assert.deepEqual(filtered.answer.introCitations, []);
});
