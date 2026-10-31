import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { chmod, mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { after, before, test } from 'node:test';
import { breakdown } from '../src/budget.mjs';
import { loadEngines } from '../src/config.mjs';
import { CONFIG, message, response, searchCall } from './fixtures.mjs';

const CLI = path.resolve('bin/beat-geo.mjs');
const KEY = 'sk-preflight-secret-98765';
let server;
let baseUrl;
let requests = [];

before(async () => {
  server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      requests.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(response([searchCall('c', { queries: ['q'], sources: [{ url: 'https://acme.example/a' }] }), message('Acme is good.', ['https://acme.example/a'])], { usage: { input_tokens: 100, output_tokens: 100 } })));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
});
after(() => server.close());

function cli(args, env = {}) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [CLI, ...args], { env: { PATH: process.env.PATH, ...env } });
    let stdout = '';
    let stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function setup(pricing = { inputPerMTok: 1, outputPerMTok: 2, perSearchCall: 0.01, source: 'unit-test rates', note: 'search rate is an assumption' }) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'pf-'));
  const questions = path.join(dir, 'q.json');
  const engines = path.join(dir, 'e.json');
  const config = path.join(dir, 'c.json');
  await writeFile(questions, JSON.stringify({ questions: [{ id: 'one', text: 'First question?' }, { id: 'two', text: 'Second question?' }, { id: 'three', text: 'Third question?' }] }));
  await writeFile(engines, JSON.stringify({ engines: [{ id: 'a', model: 'm', baseUrl, pricing }] }));
  await writeFile(config, JSON.stringify(CONFIG));
  return { dir, questions, engines, config, out: path.join(dir, 'out') };
}

test('dry run needs no --out, writes nothing, and says whether each key is present (names only)', async () => {
  const s = await setup();
  const missing = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--repeats', '1']);
  assert.equal(missing.code, 2, 'not ready is a non-zero exit');
  assert.match(missing.stdout, /key \$BEAT_GEO_API_KEY: MISSING/);
  assert.match(missing.stdout, /nothing was written/);
  assert.match(missing.stdout, /Verdict: NOT READY\. missing key variable\(s\): BEAT_GEO_API_KEY/);
  const present = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--repeats', '1'], { BEAT_GEO_API_KEY: KEY });
  assert.equal(present.code, 0, present.stdout);
  assert.match(present.stdout, /key \$BEAT_GEO_API_KEY: present/);
  assert.match(present.stdout, /Verdict: READY\. To collect, add --budget-usd <USD> --out <dir> --execute/);
  assert.ok(!present.stdout.includes(KEY) && !present.stderr.includes(KEY));
  assert.deepEqual(await readdir(s.dir).then((f) => f.filter((x) => x === 'out')), []);
});

test('dry run itemizes the worst case per request', async () => {
  const s = await setup();
  const r = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--repeats', '1']);
  assert.match(r.stdout, /worst case per request ≈ \$\d\.\d{4} = input ≤\d+ tok .*question ~\d+ tok × 4 rounds \+ search results ≤6000 tok\/search.* output cap 1500 tok .* up to 3 search\(es\)/);
  const e = loadEngines([{ id: 'a', model: 'm', pricing: { inputPerMTok: 1, outputPerMTok: 2, perSearchCall: 0.01 }, maxOutputTokens: 1000, maxSearchCalls: 2, searchResultTokens: 500 }])[0];
  const b = breakdown(e, { text: 'x'.repeat(30) });
  assert.equal(b.questionTokens, 60);
  assert.equal(b.inputTokens, 3 * 60 + (500 * 2 * 3) / 2);
  assert.ok(Math.abs(b.totalUsd - (b.inputTokens / 1e6 + 2000 / 1e6 + 0.02)) < 1e-12);
});

test('--only runs a subset of declared questions and records the subset and the file hash', async () => {
  const s = await setup();
  const dry = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--only', 'one,three', '--repeats', '1']);
  assert.match(dry.stdout, /1 request\(s\)|2 request\(s\)/);
  assert.match(dry.stdout, /Question set: 2 of 3 declared \(sha256 [0-9a-f]{12}…\)/);
  const bad = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--only', 'one,nope']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unknown question id\(s\): nope\. Declared ids: one, two, three/);

  requests = [];
  const live = await cli(['run', '--questions', s.questions, '--config', s.config, '--engines', s.engines, '--only', 'two', '--repeats', '1', '--out', s.out, '--budget-usd', '5', '--execute'], { BEAT_GEO_API_KEY: KEY });
  assert.equal(live.code, 0, live.stderr);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].body.input, 'Second question?');
  const summary = JSON.parse(await readFile(path.join(s.out, 'summary.json'), 'utf8'));
  assert.deepEqual(Object.keys(summary.questions), ['two'], 'questions that were not asked do not appear');
  assert.deepEqual(summary.questionSet.run, ['two']);
  assert.equal(summary.questionSet.declared, 3);
  assert.match(summary.questionSet.sha256, /^[0-9a-f]{64}$/);
  const md = await readFile(path.join(s.out, 'report.md'), 'utf8');
  assert.match(md, /Questions run: 1 \/ 3/);
  assert.match(md, /Cost assumptions/);
  assert.match(md, /unit-test rates/);
  assert.match(md, /search rate is an assumption/);
});

test('--key-file: a missing file gives a clear beat-geo message on dry runs and live runs, naming the path only', async () => {
  const s = await setup();
  for (const extra of [[], ['--budget-usd', '5', '--out', s.out, '--execute']]) {
    const r = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--key-file', '/nonexistent/keys.env', ...extra]);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /Key file not found: \/nonexistent\/keys\.env/);
    assert.ok(!/node:/.test(r.stderr));
  }
});

test('--key-file supplies the key, warns about loose permissions, and never prints the value', async () => {
  const s = await setup();
  const keyFile = path.join(s.dir, 'keys.env');
  await writeFile(keyFile, `BEAT_GEO_API_KEY=${KEY}\n`);
  await chmod(keyFile, 0o644);
  requests = [];
  const r = await cli(['run', '--questions', s.questions, '--config', s.config, '--engines', s.engines, '--only', 'one', '--repeats', '1', '--out', s.out, '--budget-usd', '5', '--key-file', keyFile, '--execute']);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(requests[0].auth, `Bearer ${KEY}`);
  assert.match(r.stderr, /chmod 600/);
  assert.ok(!r.stdout.includes(KEY) && !r.stderr.includes(KEY));
  assert.match(r.stdout, /loaded BEAT_GEO_API_KEY/);
});

test('doctor reports readiness per engine and exits non-zero when something is missing', async () => {
  const s = await setup();
  const bad = await cli(['doctor', '--engines', s.engines]);
  assert.equal(bad.code, 2);
  assert.match(bad.stdout, /pricing set \| key \$BEAT_GEO_API_KEY: MISSING/);
  assert.match(bad.stdout, /Not ready/);
  const good = await cli(['doctor', '--engines', s.engines], { BEAT_GEO_API_KEY: KEY });
  assert.equal(good.code, 0);
  assert.match(good.stdout, /Ready: engines valid, pricing set, keys present\. Nothing was sent\./);
  assert.ok(!good.stdout.includes(KEY));
  const noPrice = await setup(undefined);
  await writeFile(noPrice.engines, JSON.stringify({ engines: [{ id: 'a', model: 'm', baseUrl }] }));
  const np = await cli(['doctor', '--engines', noPrice.engines], { BEAT_GEO_API_KEY: KEY });
  assert.equal(np.code, 2);
  assert.match(np.stdout, /pricing MISSING/);
});

test('analyzing a subset does not list declared questions that were never asked', async () => {
  const s = await setup();
  const rec = { schema: 'beat-geo/record@1', questionId: 'one', question: 'First question?', engine: 'a', repeat: 1, source: 'import', response: response([message('Acme.')]) };
  await writeFile(path.join(s.dir, 'r.json'), JSON.stringify(rec));
  const r = await cli(['analyze', '--input', path.join(s.dir, 'r.json'), '--questions', s.questions, '--config', s.config, '--out', s.out]);
  assert.equal(r.code, 0, r.stderr);
  const summary = JSON.parse(await readFile(path.join(s.out, 'summary.json'), 'utf8'));
  assert.deepEqual(Object.keys(summary.questions), ['one']);
  assert.equal(summary.questionSet.declared, 3);
});

test('cap overrides with --engines can only lower an engine, and change the worst case', async () => {
  const s = await setup();
  const base = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--repeats', '1'], { BEAT_GEO_API_KEY: KEY });
  const lowered = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--repeats', '1', '--max-search-calls', '1', '--max-output-tokens', '500'], { BEAT_GEO_API_KEY: KEY });
  const total = (out) => Number(/Worst-case cost of this plan: \$([\d.]+)/.exec(out)[1]);
  assert.ok(total(lowered.stdout) < total(base.stdout));
  const raised = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--max-search-calls', '9'], { BEAT_GEO_API_KEY: KEY });
  assert.equal(raised.code, 2);
  assert.match(raised.stderr, /can only lower a cap/);
});

test('a dry run whose worst case exceeds the given budget is NOT READY with a non-zero exit', async () => {
  const s = await setup();
  const r = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--repeats', '1', '--budget-usd', '0.001'], { BEAT_GEO_API_KEY: KEY });
  assert.equal(r.code, 2);
  assert.match(r.stdout, /Verdict: NOT READY\. worst case \$[\d.]+ exceeds budget \$0\.001/);
});

test('~/.beat-geo.env is used automatically and named in the output; an explicit --key-file overrides the location', async () => {
  const s = await setup();
  const home = await mkdtemp(path.join(os.tmpdir(), 'home-'));
  await writeFile(path.join(home, '.beat-geo.env'), `BEAT_GEO_API_KEY=${KEY}\n`);
  await chmod(path.join(home, '.beat-geo.env'), 0o600);
  const auto = await cli(['doctor', '--engines', s.engines], { HOME: home });
  assert.equal(auto.code, 0, auto.stdout + auto.stderr);
  assert.match(auto.stdout, /\.beat-geo\.env \(default location\): loaded BEAT_GEO_API_KEY/);
  assert.ok(!auto.stdout.includes(KEY));
  const none = await cli(['doctor', '--engines', s.engines], { HOME: await mkdtemp(path.join(os.tmpdir(), 'home-')) });
  assert.equal(none.code, 2);
  const explicit = path.join(home, 'other.env');
  await writeFile(explicit, `BEAT_GEO_API_KEY=${KEY}\n`);
  await chmod(explicit, 0o600);
  const viaFlag = await cli(['doctor', '--engines', s.engines, '--key-file', explicit], { HOME: await mkdtemp(path.join(os.tmpdir(), 'home-')) });
  assert.equal(viaFlag.code, 0);
  assert.ok(!/default location/.test(viaFlag.stdout));
});

test('--only-engines runs some of the engines in an engines file and rejects unknown ids', async () => {
  const s = await setup();
  await writeFile(s.engines, JSON.stringify({ engines: [
    { id: 'a', model: 'm1', baseUrl, pricing: { inputPerMTok: 1, outputPerMTok: 2, perSearchCall: 0.01 } },
    { id: 'b', model: 'm2', baseUrl, pricing: { inputPerMTok: 1, outputPerMTok: 2, perSearchCall: 0.01 } },
  ] }));
  const one = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--only-engines', 'b', '--only', 'one', '--repeats', '1'], { BEAT_GEO_API_KEY: KEY });
  assert.match(one.stdout, /1 request\(s\) = 1 question\(s\) x 1 engine\(s\) x 1 repeat\(s\)/);
  assert.match(one.stdout, /- b: model m2/);
  assert.ok(!/- a: model m1/.test(one.stdout));
  const bad = await cli(['run', '--questions', s.questions, '--engines', s.engines, '--only-engines', 'zzz']);
  assert.equal(bad.code, 2);
  assert.match(bad.stderr, /unknown engine id\(s\): zzz\. Engine ids: a, b/);
});

test('analyze --engines infers that a search tool was requested for older live records, so a missing search is flagged', async () => {
  const s = await setup();
  const rec = { schema: 'beat-geo/record@1', questionId: 'one', question: 'First question?', engine: 'a', engineLabel: 'Route A', model: 'm', repeat: 1, source: 'live', response: response([message('The web search did not complete.')]) };
  await writeFile(path.join(s.dir, 'r.json'), JSON.stringify(rec));
  const r = await cli(['analyze', '--input', path.join(s.dir, 'r.json'), '--questions', s.questions, '--engines', s.engines, '--out', s.out]);
  assert.equal(r.code, 0, r.stderr);
  assert.match(await readFile(path.join(s.out, 'report.md'), 'utf8'), /Route A was asked to search but ran no search in 1 of 1 answers/);
});
