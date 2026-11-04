import assert from 'node:assert/strict';
import { test } from 'node:test';
import { actualUsd } from '../src/budget.mjs';
import { analyzeObservation } from '../src/analyze.mjs';
import { collectOne } from '../src/collect.mjs';
import { loadEngines, normalizeConfig } from '../src/config.mjs';
import { parseResponse } from '../src/parse.mjs';
import { CONFIG, anthropicMessage } from './fixtures.mjs';

const config = normalizeConfig(CONFIG);

test('Anthropic Messages: searches, sources and citations are extracted with their counts kept apart', () => {
  const r = anthropicMessage({
    queries: ['best tool', 'tool pricing'],
    results: [['https://a.example/1', 'https://acme.example/x'], ['https://a.example/1']],
    text: 'Acme is a good pick.',
    cited: ['https://acme.example/x', 'https://acme.example/x'],
  });
  const p = parseResponse(r);
  assert.equal(p.provenance, 'anthropic_messages');
  assert.equal(p.calls.length, 2);
  assert.deepEqual(p.calls.map((c) => c.queries[0]), ['best tool', 'tool pricing']);
  const a = analyzeObservation(p, config);
  assert.equal(a.callCount, 2);
  assert.equal(a.sourceUrlCount, 2, 'exact-URL dedupe across both calls');
  assert.equal(a.citedUrlCount, 1);
  assert.equal(a.citationOccurrences, 2);
  const acme = a.entities.find((e) => e.id === 'acme');
  assert.equal(acme.mentions, 1);
  assert.deepEqual(acme.ownedCitedUrls, ['https://acme.example/x']);
});

test('Anthropic Messages: a search error is reported as a warning, not as sources', () => {
  const r = anthropicMessage({ queries: ['q'], results: [[]], text: 'x' });
  r.content[1].content = { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' };
  const p = parseResponse(r);
  assert.ok(p.warnings.some((w) => /max_uses_exceeded/.test(w)));
  assert.equal(p.sources.length, 0);
});

test('Anthropic Messages: an answer with no search block carries the grounding warning', () => {
  const p = parseResponse(anthropicMessage({ text: 'from memory' }));
  assert.ok(p.warnings.some((w) => /no web search calls/i.test(w)));
});

test('messages requests use x-api-key by default, send the search tool with max_uses, and caps beat extraBody', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, headers: init.headers, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => '{}' };
  };
  await collectOne({ api: 'messages', baseUrl: 'http://x/v1', apiKey: 'k-aaaaaaaaaa', model: 'm', question: { text: 'q?' }, maxOutputTokens: 800, maxSearchCalls: 2, extraBody: { max_tokens: 99999 }, fetchImpl });
  const [r] = seen;
  assert.equal(r.url, 'http://x/v1/messages');
  assert.equal(r.headers['x-api-key'], 'k-aaaaaaaaaa');
  assert.equal(r.headers['anthropic-version'], '2023-06-01');
  assert.equal(r.headers.authorization, undefined);
  assert.deepEqual(r.body, { model: 'm', max_tokens: 800, messages: [{ role: 'user', content: 'q?' }], tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 2 }] });
  await collectOne({ api: 'messages', authStyle: 'bearer', baseUrl: 'http://x/v1', apiKey: 'k-aaaaaaaaaa', model: 'm', question: { text: 'q?' }, fetchImpl });
  assert.equal(seen[1].headers.authorization, 'Bearer k-aaaaaaaaaa');
});

test('engine loader accepts messages and validates authStyle', () => {
  const e = loadEngines([{ id: 'c', model: 'm', api: 'messages' }])[0];
  assert.equal(e.toolType, 'web_search_20250305');
  assert.equal(e.authStyle, 'x-api-key');
  assert.throws(() => loadEngines([{ model: 'm', api: 'messages', authStyle: 'cookie' }]), /authStyle/);
});

test('cost uses the provider-reported search count when it exceeds what the blocks show', () => {
  const e = loadEngines([{ id: 'c', model: 'm', api: 'messages', pricing: { inputPerMTok: 1, outputPerMTok: 2, perSearchCall: 0.01 } }])[0];
  const r = anthropicMessage({ queries: ['q'], results: [[]], text: 'x', usage: { input_tokens: 1000, output_tokens: 500, server_tool_use: { web_search_requests: 3 } } });
  assert.ok(Math.abs(actualUsd(e, r) - (0.001 + 0.001 + 3 * 0.01)) < 1e-12);
});
