import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { collectOne } from '../src/collect.mjs';
import { CONFIG, message, response, searchCall } from './fixtures.mjs';

const CLI = path.resolve('bin/beat-geo.mjs');
const SECRET = 'sk-test-secret-1234567890';
const PRICE = { inputPerMTok: 1, outputPerMTok: 2, perSearchCall: 0.01 };
const BUDGET = ['--budget-usd', '5', '--price-in', '1', '--price-out', '2', '--price-search', '0.01'];

let server;
let baseUrl;
let hits;
let mode; // 'ok' | 'fail'
let lastBody;
let lastAuth;
let requests = [];

before(async () => {
  server = http.createServer((req, res) => {
    hits += 1;
    lastAuth = req.headers.authorization;
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      lastBody = body;
      let model = null;
      try { model = JSON.parse(body).model; } catch { /* ignore */ }
      requests.push({ auth: req.headers.authorization, model, path: req.url, body });
      if (mode === 'usage' || mode === 'greedy') {
        const usage = mode === 'usage' ? { input_tokens: 1000, output_tokens: 500 } : { input_tokens: 0, output_tokens: 2_400_000 };
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(response([searchCall('c1', { queries: ['q'], sources: [{ url: 'https://acme.example/a' }] }), message('Acme.', ['https://acme.example/a'])], { usage })));
        return;
      }
      if (mode !== 'fail' && model === 'nosearch') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify(response([message('Acme is often suggested.')])));
        return;
      }
      if (mode === 'fail') {
        res.writeHead(500, { 'content-type': 'text/plain' });
        res.end(`upstream exploded, key was ${SECRET}`);
        return;
      }
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(
        JSON.stringify(
          response([
            searchCall('c1', { queries: ['best tool'], sources: [{ url: 'https://acme.example/a' }] }),
            message('Acme is good.', ['https://acme.example/a']),
          ]),
        ),
      );
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});

after(() => server.close());

function runCli(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env } });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function setup() {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'gp-'));
  const questions = path.join(dir, 'q.json');
  const config = path.join(dir, 'c.json');
  await writeFile(questions, JSON.stringify({ questions: [{ id: 'q1', text: 'What is the best tool?' }] }));
  await writeFile(config, JSON.stringify(CONFIG));
  return { dir, questions, config, out: path.join(dir, 'out') };
}

test('run without --execute is a dry run: no request, no files', async () => {
  hits = 0;
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--model', 'm', '--out', s.out, '--repeats', '2', ...BUDGET], { BEAT_GEO_API_KEY: SECRET });
  assert.equal(r.code, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /Dry run/);
  assert.match(r.stdout, /Verdict: READY/);
  assert.equal(hits, 0);
  await assert.rejects(readdir(s.out));
});

test('run refuses a plan above --max-requests even with --execute', async () => {
  hits = 0;
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--model', 'm', '--out', s.out, '--repeats', '5', '--max-requests', '3', '--execute'], {
    BEAT_GEO_API_KEY: SECRET,
    BEAT_GEO_BASE_URL: baseUrl,
  });
  assert.equal(r.code, 2);
  assert.equal(hits, 0);
});

test('run --execute without a key stops before sending anything', async () => {
  hits = 0;
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--model', 'm', '--out', s.out, '--execute', ...BUDGET], { BEAT_GEO_BASE_URL: baseUrl });
  assert.equal(r.code, 2);
  assert.equal(hits, 0);
});

test('live run collects, analyzes, writes a report, never sends brand config, never persists the key', async () => {
  hits = 0;
  mode = 'ok';
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--config', s.config, '--model', 'm', '--out', s.out, '--repeats', '2', '--execute', ...BUDGET], {
    BEAT_GEO_API_KEY: SECRET,
    BEAT_GEO_BASE_URL: baseUrl,
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(hits, 2);
  assert.equal(lastAuth, `Bearer ${SECRET}`);
  const sent = JSON.parse(lastBody);
  assert.equal(sent.input, 'What is the best tool?');
  assert.ok(!lastBody.toLowerCase().includes('acme'), 'brand configuration must not reach the model');
  const summary = JSON.parse(await readFile(path.join(s.out, 'summary.json'), 'utf8'));
  assert.equal(summary.questions.q1.n, 2);
  assert.equal(summary.questions.q1.entities.find((e) => e.id === 'acme').mentioned, 2);
  for (const f of ['report.html', 'report.md', 'summary.json', 'actions.json']) {
    assert.ok(!(await readFile(path.join(s.out, f), 'utf8')).includes(SECRET));
  }
  for (const f of await readdir(path.join(s.out, 'records'))) {
    assert.ok(!(await readFile(path.join(s.out, 'records', f), 'utf8')).includes(SECRET));
  }
});

test('failed requests are recorded as failures, redacted, and never replaced by demo data', async () => {
  mode = 'fail';
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--config', s.config, '--model', 'm', '--out', s.out, '--repeats', '2', '--execute', ...BUDGET], {
    BEAT_GEO_API_KEY: SECRET,
    BEAT_GEO_BASE_URL: baseUrl,
  });
  assert.equal(r.code, 1);
  const summary = JSON.parse(await readFile(path.join(s.out, 'summary.json'), 'utf8'));
  assert.equal(summary.overall.n, 0);
  assert.equal(summary.overall.failed, 2);
  assert.ok(!summary.sources.includes('demo'));
  assert.ok(!JSON.stringify(summary).includes(SECRET));
  mode = 'ok';
});

test('analyze imports raw responses only with an explicit question, and labels them as imports', async () => {
  const s = await setup();
  const raw = path.join(s.dir, 'raw.json');
  await writeFile(raw, JSON.stringify(response([searchCall('c1', { queries: ['q'], sources: [{ url: 'https://a.example/x' }] }), message('Zeta', ['https://a.example/x'])])));
  const bad = await runCli(['analyze', '--input', raw, '--out', s.out]);
  assert.equal(bad.code, 1);
  assert.match(bad.stderr, /--question/);
  const ok = await runCli(['analyze', '--input', raw, '--question', 'What is best?', '--config', s.config, '--out', s.out]);
  assert.equal(ok.code, 0, ok.stderr);
  const summary = JSON.parse(await readFile(path.join(s.out, 'summary.json'), 'utf8'));
  assert.deepEqual(summary.sources, ['import']);
});

test('demo writes labelled synthetic output; diff of a run against itself shows no change', async () => {
  const s = await setup();
  const a = path.join(s.dir, 'demoA');
  const demo = await runCli(['demo', '--out', a]);
  assert.equal(demo.code, 0, demo.stderr);
  assert.match(await readFile(path.join(a, 'report.md'), 'utf8'), /SYNTHETIC DEMO DATA/);
  const diff = await runCli(['diff', '--base', a, '--head', a]);
  assert.equal(diff.code, 0, diff.stderr);
  assert.match(diff.stdout, /→/);
  assert.ok(!/New cited domains/.test(diff.stdout));
});

test('collectOne: timeout and network errors become recorded errors, not throws', async () => {
  const slow = (_url, { signal }) =>
    new Promise((_res, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const r = await collectOne({ baseUrl: 'http://x/v1', apiKey: SECRET, model: 'm', question: { text: 'q' }, fetchImpl: slow, timeoutMs: 20 });
  assert.equal(r.ok, false);
  assert.match(r.error.message, /Timed out/);
  const broken = await collectOne({ baseUrl: 'http://x/v1', apiKey: SECRET, model: 'm', question: { text: 'q' }, fetchImpl: async () => { throw new Error(`boom ${SECRET}`); } });
  assert.equal(broken.ok, false);
  assert.ok(!broken.error.message.includes(SECRET));
});

test('collectOne builds the documented request bodies and never includes brand data', async () => {
  const seen = [];
  const fetchImpl = async (url, init) => {
    seen.push({ url, body: JSON.parse(init.body) });
    return { ok: true, status: 200, text: async () => JSON.stringify({ output: [] }) };
  };
  await collectOne({ baseUrl: 'http://x/v1/', apiKey: SECRET, model: 'm', question: { text: 'q?' }, fetchImpl });
  await collectOne({ api: 'chat', baseUrl: 'http://x/v1', apiKey: SECRET, model: 'm', question: { text: 'q?' }, fetchImpl });
  await collectOne({ baseUrl: 'http://x/v1', apiKey: SECRET, model: 'm', question: { text: 'q?' }, includeSources: false, toolType: 'web_search_preview', fetchImpl });
  assert.equal(seen[0].url, 'http://x/v1/responses');
  assert.deepEqual(seen[0].body, { model: 'm', input: 'q?', tools: [{ type: 'web_search' }], include: ['web_search_call.action.sources'] });
  assert.equal(seen[1].url, 'http://x/v1/chat/completions');
  assert.deepEqual(seen[1].body, { model: 'm', messages: [{ role: 'user', content: 'q?' }] });
  assert.deepEqual(seen[2].body.tools, [{ type: 'web_search_preview' }]);
  assert.equal('include' in seen[2].body, false);
});

test('multi-engine run: each engine uses its own key and model, results are split per engine, search evidence is counted', async () => {
  mode = 'ok';
  requests = [];
  const s = await setup();
  const engines = path.join(s.dir, 'engines.json');
  await writeFile(engines, JSON.stringify({ engines: [
    { id: 'a', label: 'Engine A', model: 'with-search', baseUrl, apiKeyEnv: 'KEY_A', pricing: PRICE },
    { id: 'b', label: 'Engine B', model: 'nosearch', baseUrl, apiKeyEnv: 'KEY_B', pricing: PRICE },
  ] }));
  const r = await runCli(['run', '--questions', s.questions, '--config', s.config, '--engines', engines, '--out', s.out, '--repeats', '2', '--execute', '--budget-usd', '5'], {
    KEY_A: 'key-a-aaaaaaaaaa',
    KEY_B: 'key-b-bbbbbbbbbb',
  });
  assert.equal(r.code, 0, r.stderr);
  assert.equal(requests.length, 4);
  assert.deepEqual(requests.filter((x) => x.model === 'with-search').map((x) => x.auth), ['Bearer key-a-aaaaaaaaaa', 'Bearer key-a-aaaaaaaaaa']);
  assert.deepEqual(requests.filter((x) => x.model === 'nosearch').map((x) => x.auth), ['Bearer key-b-bbbbbbbbbb', 'Bearer key-b-bbbbbbbbbb']);
  const summary = JSON.parse(await readFile(path.join(s.out, 'summary.json'), 'utf8'));
  const q = summary.questions.q1;
  const a = q.byEngine.find((e) => e.id === 'a');
  const b = q.byEngine.find((e) => e.id === 'b');
  assert.equal(a.grounded, 2, 'engine A returned search calls and citations');
  assert.equal(b.grounded, 0, 'engine B answered without any search evidence');
  assert.equal(b.entities.find((e) => e.id === 'acme').mentioned, 2);
  assert.equal(b.entities.find((e) => e.id === 'acme').ownedCited, 0);
  assert.equal(summary.overall.grounded, 2);
  const html = await readFile(path.join(s.out, 'report.html'), 'utf8');
  assert.ok(!html.includes('key-a-aaaaaaaaaa') && !html.includes('key-b-bbbbbbbbbb'));
  assert.match(html, /Engine A/);
});

test('multi-engine run with one key missing sends nothing and names only the variable', async () => {
  requests = [];
  const s = await setup();
  const engines = path.join(s.dir, 'engines.json');
  await writeFile(engines, JSON.stringify({ engines: [
    { id: 'a', model: 'm', baseUrl, apiKeyEnv: 'KEY_A', pricing: PRICE },
    { id: 'b', model: 'm', baseUrl, apiKeyEnv: 'KEY_B', pricing: PRICE },
  ] }));
  const r = await runCli(['run', '--questions', s.questions, '--engines', engines, '--out', s.out, '--execute', '--budget-usd', '5'], { KEY_A: 'key-a-aaaaaaaaaa' });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /KEY_B/);
  assert.ok(!r.stderr.includes('key-a-aaaaaaaaaa'));
  assert.equal(requests.length, 0);
});

test('the request cap counts questions x engines x repeats', async () => {
  requests = [];
  const s = await setup();
  const engines = path.join(s.dir, 'engines.json');
  await writeFile(engines, JSON.stringify({ engines: [{ id: 'a', model: 'm', baseUrl, apiKeyEnv: 'KEY_A' }, { id: 'b', model: 'm', baseUrl, apiKeyEnv: 'KEY_A' }] }));
  const dry = await runCli(['run', '--questions', s.questions, '--engines', engines, '--out', s.out, '--repeats', '3']);
  assert.match(dry.stdout, /6 request\(s\) = 1 question\(s\) x 2 engine\(s\) x 3 repeat\(s\)/);
  const capped = await runCli(['run', '--questions', s.questions, '--engines', engines, '--out', s.out, '--repeats', '3', '--max-requests', '5', '--execute'], { KEY_A: 'key-a-aaaaaaaaaa' });
  assert.equal(capped.code, 2);
  assert.equal(requests.length, 0);
});

test('--engines cannot be combined with single-engine flags', async () => {
  const s = await setup();
  const engines = path.join(s.dir, 'engines.json');
  await writeFile(engines, JSON.stringify({ engines: [{ id: 'a', model: 'm', baseUrl }] }));
  const r = await runCli(['run', '--questions', s.questions, '--engines', engines, '--model', 'x', '--out', s.out]);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /either --engines or/);
});

// ---- spend control -------------------------------------------------------------------------

async function engineFile(dir, engine = {}) {
  const file = path.join(dir, 'e.json');
  await writeFile(file, JSON.stringify({ engines: [{ id: 'a', model: 'm', baseUrl, apiKeyEnv: 'KEY_A', pricing: PRICE, ...engine }] }));
  return file;
}
const KEY = { KEY_A: 'key-a-aaaaaaaaaa' };

test('live collection without --budget-usd is refused before anything is sent', async () => {
  requests = [];
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--engines', await engineFile(s.dir), '--out', s.out, '--execute'], KEY);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /requires --budget-usd/);
  assert.equal(requests.length, 0);
});

test('an engine without pricing cannot be run live, and the error names the engine', async () => {
  requests = [];
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--engines', await engineFile(s.dir, { pricing: undefined }), '--out', s.out, '--execute', '--budget-usd', '5'], KEY);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /pricing for every engine.*a/);
  assert.equal(requests.length, 0);
});

test('a plan whose worst case exceeds the budget is refused with nothing sent', async () => {
  requests = [];
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--engines', await engineFile(s.dir), '--out', s.out, '--repeats', '5', '--execute', '--budget-usd', '0.01'], KEY);
  assert.equal(r.code, 2);
  assert.match(r.stderr, /exceeds the budget \$0\.01/);
  assert.equal(requests.length, 0);
});

test('spend is computed from provider-reported usage, caps are sent and cannot be overridden by extraBody', async () => {
  mode = 'usage';
  requests = [];
  const s = await setup();
  const file = await engineFile(s.dir, { extraBody: { max_output_tokens: 999_999, max_tool_calls: 999 } });
  const r = await runCli(['run', '--questions', s.questions, '--config', s.config, '--engines', file, '--out', s.out, '--repeats', '2', '--execute', '--budget-usd', '5'], KEY);
  assert.equal(r.code, 0, r.stderr);
  const body = JSON.parse(requests[0].body);
  assert.equal(body.max_output_tokens, 1500);
  assert.equal(body.max_tool_calls, 3);
  // per request: 1000*$1/M + 500*$2/M + 1 search call*$0.01 = $0.012; two requests
  const budget = JSON.parse(await readFile(path.join(s.out, 'budget.json'), 'utf8'));
  assert.ok(Math.abs(budget.estimatedSpentUsd - 0.024) < 1e-9, `got ${budget.estimatedSpentUsd}`);
  assert.equal(budget.sent, 2);
  assert.equal(budget.stoppedByBudget, false);
  const summary = JSON.parse(await readFile(path.join(s.out, 'summary.json'), 'utf8'));
  assert.equal(summary.spend.budgetUsd, 5);
  assert.match(await readFile(path.join(s.out, 'report.md'), 'utf8'), /Estimated spend: \$0\.0240 \/ \$5/);
  mode = 'ok';
});

test('a provider that ignores the caps: later requests reserve the observed cost, so the run stops early and warns', async () => {
  mode = 'greedy';
  requests = [];
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--config', s.config, '--engines', await engineFile(s.dir), '--out', s.out, '--repeats', '4', '--execute', '--budget-usd', '5'], KEY);
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /STOPPED: budget reached/);
  assert.match(r.stdout, /WARNING: 1 request\(s\) cost more than their worst-case estimate/);
  const budget = JSON.parse(await readFile(path.join(s.out, 'budget.json'), 'utf8'));
  assert.equal(budget.stoppedByBudget, true);
  assert.equal(budget.sent, 1, 'the second request would have reserved the observed 4.81 and broken the 5 budget');
  assert.equal(budget.skipped, 3);
  assert.equal(budget.overBudget, false);
  assert.equal(budget.overruns.length, 1);
  assert.equal(requests.length, 1);
  mode = 'ok';
});

test('a single request that alone exceeds the budget is reported OVER BUDGET with exit code 3, outputs still written', async () => {
  mode = 'greedy';
  requests = [];
  const s = await setup();
  const r = await runCli(['run', '--questions', s.questions, '--config', s.config, '--engines', await engineFile(s.dir), '--out', s.out, '--repeats', '1', '--execute', '--budget-usd', '1', '--max-output-tokens', '1500'], KEY);
  assert.equal(r.code, 3, r.stdout + r.stderr);
  assert.match(r.stdout, /OVER BUDGET: estimated spend \$[\d.]+ exceeds the budget \$1/);
  const md = await readFile(path.join(s.out, 'report.md'), 'utf8');
  assert.match(md, /OVER the budget/);
  assert.match(md, /did not honor a cap/);
  mode = 'ok';
});

test('HTTP errors are charged zero', async () => {
  mode = 'fail';
  const s = await setup();
  await runCli(['run', '--questions', s.questions, '--engines', await engineFile(s.dir), '--out', s.out, '--repeats', '2', '--execute', '--budget-usd', '5'], KEY);
  const budget = JSON.parse(await readFile(path.join(s.out, 'budget.json'), 'utf8'));
  assert.equal(budget.estimatedSpentUsd, 0);
  mode = 'ok';
});
