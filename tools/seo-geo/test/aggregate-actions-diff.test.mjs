import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveActions } from '../src/actions.mjs';
import { aggregate } from '../src/aggregate.mjs';
import { analyzeObservation } from '../src/analyze.mjs';
import { normalizeConfig } from '../src/config.mjs';
import { diffSummaries } from '../src/diff.mjs';
import { parseResponse } from '../src/parse.mjs';
import { renderHtml, renderMarkdown } from '../src/report.mjs';
import { CONFIG, message, response, searchCall } from './fixtures.mjs';

const config = normalizeConfig(CONFIG);
const questions = [{ id: 'q1', text: 'What is best?' }];

function rec(questionId, res, extra = {}) {
  return { questionId, question: 'What is best?', engine: 'e1', repeat: 1, source: 'import', analysis: res ? analyzeObservation(parseResponse(res), config) : null, ...extra };
}

const withBrand = response([
  searchCall('c1', { queries: ['Best Tool'], sources: [{ url: 'https://acme.example/a' }, { url: 'https://www.reddit.com/r/Music/comments/1/x/' }] }),
  message('Acme is good.', ['https://acme.example/a', 'https://acme.example/b']),
]);
const withoutBrand = response([
  searchCall('c1', { queries: ['best tool'], sources: [{ url: 'https://zeta.example/a' }, { url: 'https://www.reddit.com/r/Music/comments/2/y/' }] }),
  message('Zeta wins.', ['https://zeta.example/a']),
]);

test('aggregation reports k/n over answers; failures are excluded from n but counted', () => {
  const s = aggregate([rec('q1', withBrand), rec('q1', withoutBrand), rec('q1', null, { error: { status: 500 } })], config, questions);
  const q = s.questions.q1;
  assert.equal(q.n, 2);
  assert.equal(q.failed, 1);
  const fb = q.entities.find((e) => e.id === 'acme');
  assert.equal(fb.mentioned, 1);
  assert.equal(fb.ownedCited, 1);
});

test('a domain cited twice in one answer counts as one answer', () => {
  const s = aggregate([rec('q1', withBrand)], config, questions);
  const d = s.questions.q1.domains.find((x) => x.domain === 'acme.example');
  assert.equal(d.answersCited, 1);
});

test('subreddits are extracted from cited and source URLs and queries are normalized', () => {
  const s = aggregate([rec('q1', withBrand), rec('q1', withoutBrand)], config, questions);
  const q = s.questions.q1;
  assert.equal(q.subreddits[0].subreddit, 'Music');
  assert.equal(q.subreddits[0].answers, 2);
  assert.equal(q.queries[0].query, 'best tool');
  assert.equal(q.queries[0].answers, 2);
});

test('actions: absent brand and competitor citation are derived with their counts', () => {
  const s = aggregate([rec('q1', withoutBrand), rec('q1', withoutBrand), rec('q1', withoutBrand)], config, questions);
  const actions = deriveActions(s);
  const absent = actions.find((a) => a.type === 'absent');
  assert.ok(absent);
  assert.equal(absent.evidence.brandMentioned, '0/3');
  assert.ok(actions.some((a) => a.type === 'competitor-cited' && a.evidence.domain === 'zeta.example'));
  assert.ok(actions.some((a) => a.type === 'community-source'));
});

test('actions: mentioned but never cited is flagged; small samples are marked', () => {
  const mentionedOnly = response([searchCall('c1', { queries: ['q'], sources: [] }), message('Acme is good.')]);
  const actions = deriveActions(aggregate([rec('q1', mentionedOnly)], config, questions));
  const a = actions.find((x) => x.type === 'mentioned-not-cited');
  assert.ok(a);
  assert.equal(a.lowSample, true);
});

test('diff keeps both denominators, flags low samples and lists domain changes', () => {
  const base = aggregate([rec('q1', withoutBrand), rec('q1', withoutBrand)], config, questions);
  const head = aggregate([rec('q1', withBrand), rec('q1', withBrand), rec('q1', withBrand)], config, questions);
  const d = diffSummaries(base, head);
  const row = d.rows[0];
  assert.equal(row.baseN, 2);
  assert.equal(row.headN, 3);
  assert.equal(row.lowSample, true);
  assert.equal(row.entities.find((e) => e.id === 'acme').base, '0/2');
  assert.equal(row.entities.find((e) => e.id === 'acme').head, '3/3');
  assert.ok(row.newCitedDomains.includes('acme.example'));
  assert.ok(row.droppedCitedDomains.includes('zeta.example'));
});

test('HTML report escapes untrusted text; Markdown escapes table pipes', () => {
  const evil = response([
    searchCall('c1', { queries: ['<script>alert(1)</script>'], sources: [{ url: 'https://a.example/x' }] }),
    message('Acme', ['https://a.example/x']),
  ]);
  const s = aggregate([rec('q1', evil, { question: '<img src=x onerror=alert(1)>' })], config, [{ id: 'q1', text: '<img src=x onerror=alert(1)> | pipe' }]);
  const html = renderHtml(s, deriveActions(s));
  assert.ok(!html.includes('<img src=x'));
  assert.ok(!html.includes('<script>alert'));
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  const piped = response([searchCall('c1', { queries: ['a | b'], sources: [] }), message('x')]);
  const md = renderMarkdown(aggregate([rec('q1', piped)], config, questions), []);
  assert.ok(md.includes('a \\| b'), 'pipes inside table cells must be escaped');
});

test('demo banner appears in both renderers when data is synthetic', () => {
  const s = aggregate([rec('q1', withBrand, { source: 'demo' })], config, questions);
  s.sources = ['demo'];
  assert.match(renderMarkdown(s, []), /SYNTHETIC DEMO DATA/);
  assert.match(renderHtml(s, []), /SYNTHETIC DEMO DATA/);
  assert.match(renderMarkdown(s, [], { lang: 'zh' }), /合成演示数据/);
});
