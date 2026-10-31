import assert from 'node:assert/strict';
import { test } from 'node:test';
import { analyzeObservation, categorizeDomain, cleanAnswerForMentions } from '../src/analyze.mjs';
import { normalizeConfig } from '../src/config.mjs';
import { parseResponse } from '../src/parse.mjs';
import { CONFIG, message, response, searchCall } from './fixtures.mjs';

const config = normalizeConfig(CONFIG);

test('source URLs, cited URLs and citation occurrences are three different numbers', () => {
  const r = response([
    searchCall('c1', {
      queries: ['best tool'],
      sources: [{ url: 'https://a.example/1' }, { url: 'https://b.example/2' }, { url: 'https://c.example/3' }],
    }),
    message('Answer.', ['https://a.example/1', 'https://a.example/1', 'https://b.example/2']),
  ]);
  const a = analyzeObservation(parseResponse(r), config);
  assert.equal(a.sourceUrlCount, 3);
  assert.equal(a.citedUrlCount, 2);
  assert.equal(a.citationOccurrences, 3);
});

test('URLs are deduplicated exactly, query string included, and remember their calls', () => {
  const r = response([
    searchCall('c1', { queries: ['q1'], sources: [{ url: 'https://a.example/p?x=1' }, { url: 'https://a.example/p?x=2' }] }),
    searchCall('c2', { queries: ['q2'], sources: [{ url: 'https://a.example/p?x=1' }] }),
    message('ok'),
  ]);
  const p = parseResponse(r);
  assert.equal(p.sources.length, 2);
  assert.deepEqual(p.sources.find((s) => s.url.endsWith('x=1')).callIds, ['c1', 'c2']);
});

test('opened pages are not counted as sources', () => {
  const r = response([
    { type: 'web_search_call', id: 'o1', status: 'completed', action: { type: 'open_page', url: 'https://a.example/x' } },
    message('ok'),
  ]);
  const p = parseResponse(r);
  assert.equal(p.sources.length, 0);
  assert.equal(p.calls[0].openedUrl, 'https://a.example/x');
});

test('missing fields stay missing and unknown shapes do not throw', () => {
  const p = parseResponse({ foo: 1 });
  assert.equal(p.provenance, 'none');
  assert.ok(p.warnings.length > 0);
  assert.equal(parseResponse(null).answerText, '');
});

test('a response with no search call carries a grounding warning', () => {
  const p = parseResponse(response([message('plain answer')]));
  assert.ok(p.warnings.some((w) => /no web search calls/i.test(w)));
});

test('top-level citations shape is accepted and flagged as lacking search actions', () => {
  const p = parseResponse({ citations: ['https://a.example/x'], choices: undefined, output_text: 'Acme is fine.' });
  assert.equal(p.provenance, 'top_level_citations');
  assert.equal(p.citations.length, 1);
  assert.ok(p.warnings.some((w) => /per-call search actions/i.test(w)));
});

test('brand mentions ignore citation labels and link targets but keep prose', () => {
  const text = 'Top picks: ([acme.example](https://acme.example/a)) and [Zeta docs](https://zeta.example/d). Acme is fast.';
  const cleaned = cleanAnswerForMentions(text, new Set(['https://zeta.example/d', 'https://acme.example/a']));
  assert.ok(!/acme\.example/i.test(cleaned));
  assert.ok(!/zeta docs/i.test(cleaned));
  assert.match(cleaned, /Acme is fast/);
});

test('a prose link label is kept when its target was never cited or sourced', () => {
  const cleaned = cleanAnswerForMentions('Try [Zeta](https://random.example).', new Set());
  assert.match(cleaned, /Zeta/);
});

test('mention matching uses word boundaries, aliases and works next to CJK text', () => {
  const r = response([
    message('Acmes is not it. But 推荐Acme和Zeta. Also try Acme Co today. zeta\'s output is fine.'),
  ]);
  const a = analyzeObservation(parseResponse(r), config);
  const fb = a.entities.find((e) => e.id === 'acme');
  const kb = a.entities.find((e) => e.id === 'zeta');
  assert.equal(fb.mentions, 2, 'Acme (CJK-adjacent) + alias Acme Co, but not Acmes');
  assert.equal(kb.mentions, 2);
});

test('owned-domain matching includes subdomains but not lookalike hosts', () => {
  const r = response([
    searchCall('c1', { queries: ['q'], sources: [{ url: 'https://docs.acme.example/a' }, { url: 'https://notacme.example/b' }] }),
    message('x', ['https://docs.acme.example/a']),
  ]);
  const fb = analyzeObservation(parseResponse(r), config).entities.find((e) => e.id === 'acme');
  assert.deepEqual(fb.ownedCitedUrls, ['https://docs.acme.example/a']);
  assert.deepEqual(fb.ownedSourceUrls, ['https://docs.acme.example/a']);
});

test('domains are categorized; www is stripped', () => {
  assert.equal(categorizeDomain('acme.example', config), 'brand-owned');
  assert.equal(categorizeDomain('zeta.example', config), 'competitor-owned');
  assert.equal(categorizeDomain('old.reddit.com', config), 'reddit');
  assert.equal(categorizeDomain('random.example', config), 'other');
});

test('an empty configuration is valid and sources are still analyzed', () => {
  const empty = normalizeConfig({});
  const r = response([searchCall('c1', { queries: ['q'], sources: [{ url: 'https://www.a.example/x' }] }), message('t', ['https://www.a.example/x'])]);
  const a = analyzeObservation(parseResponse(r), empty);
  assert.equal(a.entities.length, 0);
  assert.equal(a.domains[0].domain, 'a.example');
});

test('duplicate entity names are rejected', () => {
  assert.throws(() => normalizeConfig({ brand: { name: 'X' }, competitors: [{ name: 'x' }] }), /unique/);
});

test('an alias that contains the main name counts as one mention, not two', () => {
  const r = response([message('Acme Co is fine. Acme also works. Zeta too.')]);
  const a = analyzeObservation(parseResponse(r), config);
  assert.equal(a.entities.find((e) => e.id === 'acme').mentions, 2);
});
