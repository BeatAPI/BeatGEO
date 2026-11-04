// Regression tests for problems found in a real routing probe (synthetic values, observed shapes).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { aggregate, modelMismatches } from '../src/aggregate.mjs';
import { analyzeObservation } from '../src/analyze.mjs';
import { normalizeConfig } from '../src/config.mjs';
import { parseResponse } from '../src/parse.mjs';
import { buildRun } from '../src/run.mjs';
import { renderMarkdown } from '../src/report.mjs';
import { CONFIG, anthropicMessage, message, response, searchCall } from './fixtures.mjs';

const config = normalizeConfig(CONFIG);
const rec = (over, res) => ({ questionId: 'q', question: 'What is the latest version? Search the web.', engine: 'e', engineLabel: 'Engine E', model: 'req-model', repeat: 1, source: 'live', response: res, ...over, analysis: res ? analyzeObservation(parseResponse(res), config) : null });

test('a served model that differs from the requested one is flagged; a dated alias of the same model is not', () => {
  const a = rec({ engine: 'luna', engineLabel: 'GPT Luna', model: 'gpt-5.6-luna' }, response([message('x')], { model: 'gpt-5.6-terra' }));
  const b = rec({ engine: 'haiku', engineLabel: 'Haiku', model: 'claude-haiku-4-5' }, response([message('x')], { model: 'claude-haiku-4-5-20251001' }));
  const s = aggregate([a, b], config, [{ id: 'q', text: a.question }]);
  assert.deepEqual(s.modelMismatches.map((m) => [m.engine, m.requested, m.served]), [['luna', 'gpt-5.6-luna', ['gpt-5.6-terra']]]);
  assert.equal(modelMismatches([]).length, 0);
  assert.match(renderMarkdown(s, []), /reported serving a different model than was requested: GPT Luna — gpt-5\.6-luna → gpt-5\.6-terra/);
});

test('failed requests in the report name the engine and the fields that were sent', () => {
  const ok = rec({}, response([message('x')]));
  const failed = { schema: 'beat-geo/record@1', questionId: 'q', question: 'Q?', engine: 'sol', engineLabel: 'GPT Sol', model: 'm', repeat: 1, source: 'live', error: { status: 400, message: 'Unsupported parameter: max_tool_calls', request: 'POST /responses fields: model, input, max_tool_calls=1' } };
  const { summary, actions } = buildRun([ok, failed], config, [{ id: 'q', text: ok.question }]);
  assert.equal(summary.failures[0].engine, 'sol');
  const md = renderMarkdown(summary, actions);
  assert.match(md, /\[q @ GPT Sol #1\] status 400: Unsupported parameter: max_tool_calls — POST \/responses fields: model, input, max_tool_calls=1/);
});

test('the report shows the search queries each engine actually issued and marks the question itself', () => {
  const res = response([searchCall('c', { queries: ['what is the latest version? search the web.', 'site:example.org latest release'], sources: [{ url: 'https://example.org/a' }] }), message('t', ['https://example.org/a'])]);
  const md = renderMarkdown(aggregate([rec({}, res)], config, [{ id: 'q', text: 'What is the latest version? Search the web.' }]), []);
  assert.match(md, /Search queries issued/);
  assert.match(md, /\| Engine E \| site:example\.org latest release \| 31 \| 1 \|/);
  assert.match(md, /the question itself/);
});

test('an engine that searched but returned no sources or citations gets an explicit note', () => {
  const searchedOnly = rec({ engine: 'a', engineLabel: 'Route A' }, response([searchCall('c', { queries: ['q'], sources: [] }), message('Acme.')]));
  const grounded = rec({ engine: 'b', engineLabel: 'Route B' }, response([searchCall('c', { queries: ['q'], sources: [{ url: 'https://x.example/1' }] }), message('Acme.', ['https://x.example/1'])]));
  const md = renderMarkdown(aggregate([searchedOnly, grounded], config, [{ id: 'q', text: searchedOnly.question }]), []);
  assert.match(md, /Route A ran searches but returned no source or cited URLs, so its mentions cannot be attributed to retrieval\./);
  assert.ok(!/Route B ran searches but returned no source/.test(md));
});

test('a dry run says when the search cap will not be sent to the provider', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pr-'));
  await writeFile(path.join(dir, 'q.json'), JSON.stringify({ questions: [{ id: 'a', text: 'Q?' }] }));
  await writeFile(path.join(dir, 'e.json'), JSON.stringify({ engines: [{ id: 'e', model: 'm', pricing: { inputPerMTok: 1, outputPerMTok: 1, perSearchCall: 0.01 } }] }));
  const out = await new Promise((resolve) => {
    const c = spawn(process.execPath, [path.resolve('bin/beat-geo.mjs'), 'run', '--questions', path.join(dir, 'q.json'), '--engines', path.join(dir, 'e.json'), '--no-search-cap'], { env: { PATH: process.env.PATH } });
    let o = '';
    c.stdout.on('data', (d) => (o += d));
    c.on('close', () => resolve(o));
  });
  assert.match(out, /search cap NOT sent to the provider.*not enforced by the provider/);
});

test('a truncated answer, and an engine asked to search that ran no search, are flagged', () => {
  const cut = { id: 'm', type: 'message', role: 'assistant', model: 'x', stop_reason: 'max_tokens', content: [{ type: 'text', text: 'Acme is ...', citations: [] }] };
  assert.equal(parseResponse(cut).truncated, true);
  assert.equal(parseResponse(response([message('ok')], { status: 'incomplete' })).truncated, true);
  assert.equal(parseResponse({ choices: [{ finish_reason: 'length', message: { content: 'x' } }] }).truncated, true);
  assert.equal(parseResponse(response([message('ok')])).truncated, false);
  const none = { ...rec({ engine: 'g', engineLabel: 'GPT route' }, response([message('The web search did not complete.')])), searchRequested: true };
  const cutRec = { ...rec({ engine: 'c', engineLabel: 'Claude route' }, cut), searchRequested: true };
  const md = renderMarkdown(aggregate([none, cutRec], config, [{ id: 'q', text: none.question }]), []);
  assert.match(md, /GPT route was asked to search but ran no search in 1 of 1 answers/);
  assert.match(md, /Claude route had 1 of 1 answers cut off by the output cap/);
  const noReq = rec({ engine: 'h' }, response([message('memory')]));
  assert.ok(!/was asked to search/.test(renderMarkdown(aggregate([noReq], config, [{ id: 'q', text: noReq.question }]), [])), 'not flagged when no search tool was requested');
});

test('queries with no results show 0 results and their length in the issued-queries table', () => {
  const r = anthropicMessage({ queries: ['x'.repeat(212)], results: [[]], text: 'No search results found.' });
  r.content[1].content = [{ type: 'web_search_result', title: 'No results', url: '', encrypted_content: '' }];
  const md = renderMarkdown(aggregate([rec({ question: 'x'.repeat(212) }, r)], config, [{ id: 'q', text: 'x'.repeat(212) }]), []);
  assert.match(md, /\| 212 \| 0 \(no results\) \|/);
});
