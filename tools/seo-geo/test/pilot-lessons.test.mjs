// Regression tests for problems found in a real pilot run. Values are synthetic; only the field shapes
// (as observed from real provider responses) are reproduced.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { actualUsd, usageSummary } from '../src/budget.mjs';
import { aggregate } from '../src/aggregate.mjs';
import { analyzeObservation } from '../src/analyze.mjs';
import { collectOne, summarizeRequest } from '../src/collect.mjs';
import { loadEngines, normalizeConfig } from '../src/config.mjs';
import { parseResponse } from '../src/parse.mjs';
import { CONFIG, anthropicMessage, message, response, searchCall } from './fixtures.mjs';

const config = normalizeConfig(CONFIG);
const priced = (extra = {}) => loadEngines([{ id: 'e', model: 'm', pricing: { inputPerMTok: 2, outputPerMTok: 6, perSearchCall: 0.02, ...extra.pricing }, ...extra.engine }])[0];

// ---- an empty placeholder result is not a source ---------------------------------------------------------
const noResults = () => {
  const r = anthropicMessage({ queries: ['the whole question repeated verbatim'], results: [[]], text: 'No search results found.' });
  r.content[1].content = [{ type: 'web_search_result', title: 'No results', url: '', encrypted_content: '', page_age: null }];
  return r;
};

test('a placeholder result with an empty URL is not a source; the search counts as searched, not as evidence', () => {
  const p = parseResponse(noResults());
  assert.equal(p.sources.length, 0);
  assert.ok(p.warnings.includes('A web search ran but returned no results.'));
  const a = analyzeObservation(p, config);
  assert.equal(a.callCount, 1);
  assert.equal(a.noResultSearches, 1);
  assert.equal(a.sourceUrlCount, 0);
  assert.equal(a.domains.length, 0, 'no empty-host domain row');
  const rec = { questionId: 'q', question: 'X', engine: 'e', analysis: a };
  const s = aggregate([rec], config, [{ id: 'q', text: 'X' }]);
  assert.equal(s.overall.searched, 1);
  assert.equal(s.overall.grounded, 0);
  assert.equal(s.questions.q.byEngine[0].searched, 1);
  assert.equal(s.questions.q.byEngine[0].grounded, 0);
});

test('non-http source URLs are dropped in every response shape', () => {
  const r = response([searchCall('c', { queries: ['q'], sources: [{ url: '' }, { url: 'javascript:alert(1)' }, { url: 'https://ok.example/a' }] }), message('t', ['', 'https://ok.example/a'])]);
  const a = analyzeObservation(parseResponse(r), config);
  assert.equal(a.sourceUrlCount, 1);
  assert.equal(a.citedUrlCount, 1);
});

// ---- a query that repeats the question is not a sub-query ------------------------------------------------
test('queries identical to the question text are not listed as recurring sub-queries, but are counted', () => {
  const question = 'What is best?  Search the web.';
  const r = response([searchCall('c', { queries: ['what is best? search the web.', 'best tool pricing'], sources: [{ url: 'https://a.example/1' }] }), message('t', ['https://a.example/1'])]);
  const rec = { questionId: 'q', question, engine: 'e', analysis: analyzeObservation(parseResponse(r), config) };
  const s = aggregate([rec], config, [{ id: 'q', text: question }]);
  assert.deepEqual(s.questions.q.queries.map((x) => x.query), ['best tool pricing']);
  assert.equal(s.questions.q.verbatimQueries, 1);
});

// ---- cost: cached tokens and every tool call --------------------------------------------------------------
const grokShaped = () => ({
  model: 'm', status: 'completed',
  output: [
    ...['search', 'open_page', 'find_in_page'].flatMap((type, i) => Array.from({ length: i === 0 ? 7 : i === 1 ? 5 : 1 }, (_, k) => ({ type: 'web_search_call', id: `w${i}${k}`, status: 'completed', action: type === 'search' ? { type, query: `q${k}`, sources: [] } : { type, url: 'https://a.example/x' } }))),
    { type: 'message', content: [{ type: 'output_text', text: 'x', annotations: [] }] },
  ],
  usage: { input_tokens: 180_000, input_tokens_details: { cached_tokens: 115_000 }, output_tokens: 3_000, num_server_side_tools_used: 13, server_side_tool_usage_details: { web_search_calls: 13 } },
});

test('OpenAI/xAI-style usage: cached tokens are part of input_tokens and every tool call (search, open, find) is counted', () => {
  const u = usageSummary(grokShaped());
  assert.equal(u.freshInputTokens, 65_000);
  assert.equal(u.cachedInputTokens, 115_000);
  assert.equal(u.toolCalls, 13, 'not just the 7 search calls');
  const noCachedRate = priced();
  assert.ok(Math.abs(actualUsd(noCachedRate, grokShaped()) - ((180_000 * 2) / 1e6 + (3_000 * 6) / 1e6 + 13 * 0.02)) < 1e-9, 'without a cached rate, cached tokens bill at the full input rate (never cheaper)');
  const withCachedRate = priced({ pricing: { cachedInputPerMTok: 0.3 } });
  assert.ok(Math.abs(actualUsd(withCachedRate, grokShaped()) - ((65_000 * 2) / 1e6 + (115_000 * 0.3) / 1e6 + (3_000 * 6) / 1e6 + 13 * 0.02)) < 1e-9);
});

test('Anthropic-style usage: cache reads are separate from input_tokens', () => {
  const r = anthropicMessage({ queries: ['q'], results: [['https://a.example/1']], text: 'x', usage: { input_tokens: 500, cache_read_input_tokens: 4_000, cache_creation_input_tokens: 100, output_tokens: 200, server_tool_use: { web_search_requests: 1 } } });
  const u = usageSummary(r);
  assert.equal(u.freshInputTokens, 600);
  assert.equal(u.cachedInputTokens, 4_000);
  const e = priced({ pricing: { cachedInputPerMTok: 0.2 } });
  assert.ok(Math.abs(actualUsd(e, r) - ((600 * 2) / 1e6 + (4_000 * 0.2) / 1e6 + (200 * 6) / 1e6 + 1 * 0.02)) < 1e-9);
});

test('cachedInputPerMTok must be a non-negative number when given', () => {
  assert.throws(() => loadEngines([{ model: 'm', pricing: { inputPerMTok: 1, outputPerMTok: 1, perSearchCall: 0, cachedInputPerMTok: -1 } }]), /cachedInputPerMTok/);
});

// ---- diagnosing a rejected request -------------------------------------------------------------------------
test('a rejected request records which fields were sent (names only), never the prompt or credentials', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, text: async () => '{"error":{"message":"error","type":"upstream_error"}}' });
  const r = await collectOne({ baseUrl: 'http://x/v1', apiKey: 'k-secret-abcdefgh', model: 'm', question: { text: 'SECRET PROMPT TEXT' }, maxOutputTokens: 800, maxSearchCalls: 2, fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.error.request, /^POST \/responses fields: model, input, tools\[web_search\], include\[web_search_call\.action\.sources\], max_output_tokens=800, max_tool_calls=2$/);
  assert.ok(!r.error.request.includes('SECRET PROMPT TEXT') && !r.error.request.includes('k-secret'));
  assert.equal(summarizeRequest('messages', { model: 'm', max_tokens: 5, messages: [], tools: [{ type: 'web_search_20250305', name: 'web_search' }] }), 'POST /messages fields: model, max_tokens=5, messages, tools[web_search_20250305]');
});

// ---- request variants from the command line -----------------------------------------------------------------
const KEY = 'sk-lessons-secret-13579';
let server;
let baseUrl;
let bodies = [];
before(async () => {
  server = http.createServer((req, res) => {
    let b = '';
    req.on('data', (c) => (b += c));
    req.on('end', () => {
      bodies.push(JSON.parse(b));
      res.writeHead(400, { 'content-type': 'application/json' });
      res.end('{"error":{"message":"error","type":"upstream_error"}}');
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});
after(() => server.close());

function cli(args) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [path.resolve('bin/beat-geo.mjs'), ...args], { env: { PATH: process.env.PATH, BEAT_GEO_API_KEY: KEY } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
}

test('--no-search-cap, --no-include-sources and --tool-type apply to an engines file; a 400 prints the fields sent and what to try', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pl-'));
  const q = path.join(dir, 'q.json');
  const e = path.join(dir, 'e.json');
  await writeFile(q, JSON.stringify({ questions: [{ id: 'one', text: 'First?' }] }));
  await writeFile(e, JSON.stringify({ engines: [{ id: 'a', model: 'm', baseUrl, pricing: { inputPerMTok: 1, outputPerMTok: 1, perSearchCall: 0.01 } }] }));
  bodies = [];
  const base = await cli(['run', '--questions', q, '--engines', e, '--repeats', '1', '--out', path.join(dir, 'o1'), '--budget-usd', '5', '--execute']);
  assert.equal(base.code, 1);
  assert.equal(bodies[0].max_tool_calls, 3);
  assert.deepEqual(bodies[0].include, ['web_search_call.action.sources']);
  assert.match(base.out, /status 400/);
  assert.match(base.out, /POST \/responses fields: model, input, tools\[web_search\], include\[web_search_call\.action\.sources\], max_output_tokens=1500, max_tool_calls=3/);
  assert.match(base.out, /--no-search-cap, --no-include-sources or --tool-type/);
  assert.ok(!base.out.includes(KEY));

  bodies = [];
  await cli(['run', '--questions', q, '--engines', e, '--repeats', '1', '--out', path.join(dir, 'o2'), '--budget-usd', '5', '--execute', '--no-search-cap', '--no-include-sources', '--tool-type', 'web_search_preview']);
  assert.equal('max_tool_calls' in bodies[0], false);
  assert.equal('include' in bodies[0], false);
  assert.deepEqual(bodies[0].tools, [{ type: 'web_search_preview' }]);
  const summary = JSON.parse(await readFile(path.join(dir, 'o2', 'summary.json'), 'utf8'));
  assert.match(summary.failures[0].message, /upstream_error/);
});

// ---- readability and offline re-pricing -----------------------------------------------------------------------
import { renderMarkdown } from '../src/report.mjs';

test('the by-engine table has one column per engine, not one per brand, so it stays readable with many competitors', () => {
  const many = { brand: { name: 'Acme' }, competitors: Array.from({ length: 20 }, (_, i) => ({ name: `Rival${i}` })) };
  const cfg = normalizeConfig(many);
  const mk = (engine, res) => ({ questionId: 'q', question: 'Q?', engine, engineLabel: engine.toUpperCase(), model: `${engine}-model`, repeat: 1, source: 'import', analysis: analyzeObservation(parseResponse(res), cfg) });
  const a = response([searchCall('c', { queries: ['q'], sources: [{ url: 'https://a.example/1' }] }), message('Acme and Rival3.', ['https://a.example/1'])]);
  const b = response([message('Rival3 only.')]);
  const s = aggregate([mk('a', a), mk('b', b)], cfg, [{ id: 'q', text: 'Q?' }]);
  const md = renderMarkdown(s, []);
  const header = md.split('\n').find((l) => l.startsWith('| Name | Role | A (a-model)'));
  assert.ok(header, 'engine columns are labelled with model');
  assert.equal(header.split('|').length - 2, 4, 'name, role and two engines');
  assert.match(md, /\| Searched in \|  \| 1\/1 \| 0\/1 \|/);
  assert.match(md, /\| Search evidence in \|  \| 1\/1 \| 0\/1 \|/);
  assert.match(md, /\| Acme \| brand \| 1\/1 · 0\/1 \| 0\/1 · 0\/1 \|/);
});

test('analyze --engines re-prices raw responses offline with the rates given now, and sends nothing', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'rp-'));
  const rec = { schema: 'beat-geo/record@1', questionId: 'q', question: 'Q?', engine: 'e', repeat: 1, source: 'live', response: grokShaped() };
  await writeFile(path.join(dir, 'r.json'), JSON.stringify(rec));
  await writeFile(path.join(dir, 'q.json'), JSON.stringify({ questions: [{ id: 'q', text: 'Q?' }] }));
  await writeFile(path.join(dir, 'e.json'), JSON.stringify({ engines: [{ id: 'e', model: 'm', pricing: { inputPerMTok: 2, outputPerMTok: 6, perSearchCall: 0.005, cachedInputPerMTok: 0.3 } }] }));
  const r = await new Promise((resolve) => {
    const c = spawn(process.execPath, [path.resolve('bin/beat-geo.mjs'), 'analyze', '--input', path.join(dir, 'r.json'), '--questions', path.join(dir, 'q.json'), '--engines', path.join(dir, 'e.json'), '--out', path.join(dir, 'out')], { env: { PATH: process.env.PATH } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  assert.equal(r.code, 0, r.out);
  const expected = (65_000 * 2) / 1e6 + (115_000 * 0.3) / 1e6 + (3_000 * 6) / 1e6 + 13 * 0.005;
  const summary = JSON.parse(await readFile(path.join(dir, 'out', 'summary.json'), 'utf8'));
  assert.ok(Math.abs(summary.costRecomputed.totalUsd - expected) < 1e-9);
  assert.match(await readFile(path.join(dir, 'out', 'report.md'), 'utf8'), /Re-priced from raw responses: \$0\.\d{4}/);
});
