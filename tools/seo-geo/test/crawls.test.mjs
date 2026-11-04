import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { recognizeCrawler } from '../src/crawler-rules.mjs';
import { analyzeCrawls, logTime, siteHostname } from '../src/crawls.mjs';
import { renderHtml, renderMarkdown } from '../src/report.mjs';
import { buildRun } from '../src/run.mjs';
import { normalizeConfig } from '../src/config.mjs';
import { message, response } from './fixtures.mjs';

const exec = promisify(execFile);
const CLI = path.resolve('bin/beat-geo.mjs');
const opts = { site: 'example.com', now: Date.parse('2026-10-26T00:00:00Z') };
const row = (extra = {}) => ({ time: '2026-10-25T08:00:00Z', host: 'example.com', path: '/docs', method: 'GET', status: 200, userAgent: 'OAI-SearchBot/1.0', ...extra });
const analyze = (rows, extra) => analyzeCrawls(JSON.stringify(rows), { ...opts, ...extra });
const combined = (target, ua, status = 200) => `192.0.2.123 - alice [25/Oct/2026:16:00:00 +0800] "GET ${target} HTTP/1.1" ${status} 42 "https://referrer.example/private" "${ua}"`;

test('crawler recognition uses complete tokens, and conflicting identities stay ambiguous', () => {
  assert.equal(recognizeCrawler('Mozilla/5.0 (compatible; OAI-SearchBot/1.4)').crawler.purpose, 'search');
  assert.equal(recognizeCrawler('gptbot/1.4').crawler.purpose, 'training');
  assert.equal(recognizeCrawler('Kimi-User/1.0').crawler.purpose, 'user');
  for (const ua of ['NotGPTBot/1.0', 'GPTBot-Evil', 'x_GPTBot', 'Claude-Web', 'Google-Extended', 'Mozilla/5.0']) {
    assert.equal(recognizeCrawler(ua).state, 'unrecognized', ua);
  }
  assert.equal(recognizeCrawler('GPTBot/1.0 Claude-SearchBot/1.0').state, 'ambiguous');
});

test('time parsing validates actual dates and timezone offsets; site scope is explicit', () => {
  assert.equal(logTime('25/Oct/2026:16:00:00 +0800'), '2026-10-25T08:00:00.000Z');
  assert.equal(logTime('2024-02-29T12:00:00-05:00'), '2024-02-29T17:00:00.000Z');
  for (const t of ['2026-02-29T00:00:00Z', '2026-04-31T00:00:00Z', '2026-10-25T25:00:00Z', '2026-10-25T00:00:00', '2026-10-25T00:00:00+08:99']) assert.throws(() => logTime(t));
  assert.equal(siteHostname('https://WWW.example.com/'), 'www.example.com');
  for (const s of [undefined, '', 'https://user:pass@example.com', 'example.com/path', 'ftp://example.com', 'example.com:8080']) assert.throws(() => siteHostname(s));
});

test('Combined logs discard private fields, retain duplicates, preserve paths and carry row evidence', () => {
  const line = combined('/docs?api_key=private-query-token#private-fragment', 'Mozilla/5.0 (OAI-SearchBot/1.4; private-ua-token)');
  const c = analyzeCrawls(`${line}\n${line}\nbroken private-bad-row\n`, { ...opts, format: 'combined' });
  assert.equal(c.totals.requests, 2);
  assert.equal(c.pages[0].requests, 2);
  assert.deepEqual(c.requests.map(r => r.line), [1, 2]);
  assert.equal(c.pages[0].path, '/docs');
  assert.equal(c.pages[0].lastSeen, '2026-10-25T08:00:00.000Z');
  assert.equal(c.observation.configuredHostRequests, 2);
  assert.equal(c.observation.coverage, 'unknown');
  assert.equal(c.input.rejected, 1);
  assert.equal(c.totals.verifiedRequests, null);
  const exported = JSON.stringify(c) + renderHtml(c, []) + renderMarkdown(c, []);
  for (const secret of ['192.0.2.123', 'alice', 'private-query-token', 'private-fragment', 'private-ua-token', 'private-bad-row', 'referrer.example']) assert.ok(!exported.includes(secret), secret);
  assert.ok(c.requests.every(r => r.verification === 'unverified'));
});

test('JSON scope and half-open window filters do not mix hosts or fabricate missing observations', () => {
  const c = analyze([
    row({ time: '2026-10-25T07:59:59Z' }), row(),
    row({ time: '2026-10-25T09:00:00Z' }), row({ host: 'other.example' }),
    row({ path: 'https://other.example/docs' }), row({ path: 'https://example.com/docs' }),
  ], { from: '2026-10-25T08:00:00Z', to: '2026-10-25T09:00:00Z' });
  assert.equal(c.input.otherHost, 2);
  assert.equal(c.input.outsideWindow, 2);
  assert.equal(c.totals.requests, 2);
  assert.equal(c.observation.configuredHostRequests, 0);
  assert.equal(c.observation.observedFrom, '2026-10-25T08:00:00.000Z');
  assert.throws(() => analyze([], { from: '2026-10-25T09:00:00Z', to: '2026-10-25T08:00:00Z' }));
});

test('HEAD, 304, GET 2xx, denied and server-error requests retain separate meanings', () => {
  const c = analyze([row(), row({ method: 'HEAD' }), row({ status: 304 }), row({ status: 403 }), row({ status: 429 }), row({ status: 503 })]);
  assert.equal(c.totals.requests, 6);
  assert.equal(c.totals.get2xx, 1);
  assert.equal(c.totals.head, 1);
  assert.equal(c.totals.notModified, 1);
  assert.equal(c.totals.denied, 2);
  assert.equal(c.totals.errors5xx, 1);
  assert.match(renderMarkdown(c, [], { lang: 'zh' }), /值得排查的响应/);
});

test('unrecognized and ambiguous requests do not get assigned to platforms or counted twice', () => {
  const c = analyze([row(), row({ userAgent: 'Mozilla/5.0' }), row({ userAgent: 'GPTBot ClaudeBot' })]);
  assert.equal(c.input.inWindow, 3);
  assert.equal(c.totals.requests, 1);
  assert.equal(c.input.unrecognized, 1);
  assert.equal(c.input.ambiguous, 1);
  assert.deepEqual(c.ambiguous[0].candidates, ['gptbot', 'claudebot']);
});

test('empty, invalid, wrong-host and human-only inputs have explicit, different report states', () => {
  assert.equal(analyze([]).observation.state, 'empty');
  const invalid = analyze([row({ time: 'not a timestamp' })]);
  assert.equal(invalid.observation.state, 'invalid');
  assert.match(renderMarkdown(invalid, [], { lang: 'zh' }), /输入无效，不是 AI 流量为零/);
  assert.equal(analyze([row({ host: 'other.example' })]).observation.state, 'empty');
  const human = analyze([row({ userAgent: 'Mozilla/5.0' })]);
  assert.equal(human.observation.state, 'observed');
  assert.match(renderMarkdown(human, []), /does not exclude other/);
});

test('malformed JSON is redacted; JSONL bad rows are reported and input limits are enforced', () => {
  assert.throws(() => analyzeCrawls('[private-secret-broken-json', opts), e => e.message === 'Invalid JSON log input.');
  const c = analyzeCrawls(`${JSON.stringify(row())}\nprivate-secret-jsonl\n`, { ...opts, format: 'jsonl' });
  assert.equal(c.totals.requests, 1);
  assert.equal(c.input.rejected, 1);
  assert.equal(c.input.errors[0].code, 'invalid_json_line');
  assert.ok(!JSON.stringify(c).includes('private-secret'));
  assert.throws(() => analyzeCrawls('x'.repeat(10 * 1024 * 1024 + 1), opts), /10 MiB/);
  assert.throws(() => analyzeCrawls('\n'.repeat(1) + 'bad\n'.repeat(50001), opts), /50000/);
});

test('invalid row fields and future events cannot produce apparent crawl evidence', () => {
  const c = analyze([
    row({ status: '200' }), row({ status: 999 }), row({ method: '' }),
    row({ time: '2099-01-01T00:00:00Z' }), row({ userAgent: null }),
    row({ path: '//other.example/path' }), row({ path: '/bad%xx' }),
  ]);
  assert.equal(c.input.rejected, 7);
  assert.equal(c.observation.state, 'invalid');
  assert.equal(c.totals.requests, 0);
});

test('report renderers escape imported path markup in both locales and keep synthetic labels', () => {
  const c = analyzeCrawls(JSON.stringify({ schema: 'beat-geo/logs@1', synthetic: true, records: [row({ path: '/<img/src=x/onerror=alert(1)>' }), row({ path: '/![x](https://tracker.example/x)' })] }), opts);
  for (const lang of ['zh', 'en']) {
    const html = renderHtml(c, [], { lang }), md = renderMarkdown(c, [], { lang });
    assert.ok(!html.includes('<img/src='));
    assert.ok(html.includes('&lt;img/'));
    assert.ok(!md.includes('<img/'));
    assert.ok(!md.includes('![x]'));
    assert.match(md, lang === 'zh' ? /合成日志演示数据/ : /SYNTHETIC LOG DATA/);
  }
});

test('crawl reports keep consistent titles, heading levels and readable UTC times in both locales', () => {
  const c = analyze([row(), row({ status: 404 })], { from: '2026-10-25T08:00:00Z', to: '2026-10-25T10:00:00Z' });
  for (const lang of ['zh', 'en']) {
    const html = renderHtml(c, [], { lang });
    assert.match(html, lang === 'zh' ? /<title>AI 抓取观察 · Beat Geo<\/title>/ : /<title>AI crawl observations · Beat Geo<\/title>/);
    assert.ok(!html.includes('<h3>'), 'standalone report must not skip from h1 to h3');
    assert.match(html, /2026-10-25 08:00:00/);
    assert.ok(!html.includes('T08:00:00.000Z'));
    assert.match(html, /<details class="report-details"><summary>/);
    assert.ok(!html.includes('<details class="report-details" open'));
    const run = buildRun([], normalizeConfig({}), []);
    run.summary.crawls = c;
    const attached = renderHtml(run.summary, [], { lang });
    assert.equal((attached.match(/<h1>/g) ?? []).length, 1);
    assert.match(attached, /<h3>/);
    assert.equal(run.summary.overall.n, 0, 'request display must not change answer denominator');
  }
});

test('large reports disclose additional rows without losing evidence from HTML or Markdown', () => {
  const c = analyze(Array.from({ length: 40 }, (_, n) => row({ path: `/page-${String(n).padStart(2, '0')}`, status: n === 39 ? 404 : 200 })));
  const html = renderHtml(c, [], { lang: 'zh' }), md = renderMarkdown(c, [], { lang: 'zh' });
  assert.match(html, /查看其余 28 条/);
  assert.match(html, /查看其余 10 条/);
  assert.match(html, /<div class="table-scroll" role="region" aria-label=/);
  assert.match(html, /scope="col"/);
  for (let n = 0; n < 40; n++) {
    const path = `/page-${String(n).padStart(2, '0')}`;
    assert.ok(html.includes(path));
    assert.ok(md.includes(path));
  }
  assert.match(md, /GET 2xx: 39/);
  assert.match(md, /404 × 1/);
});

test('empty and invalid imports show unavailable metrics instead of apparent measured zero', () => {
  for (const c of [analyze([]), analyze([row({ status: 999 })])]) {
    const html = renderHtml(c, [], { lang: 'zh' });
    assert.equal((html.match(/<dd>—<\/dd>/g) ?? []).length, 4);
    assert.ok(!html.includes('class="table-wide"'));
    assert.match(html, /统计口径与导入详情/);
  }
  const noMatch = renderHtml(analyze([row({ userAgent: 'Mozilla/5.0' })]), [], { lang: 'zh' });
  assert.equal((noMatch.match(/<dd>0<\/dd>/g) ?? []).length, 4);
  assert.match(noMatch, /不排除其他/);
});

test('CLI standalone and attached workflows use the same observations without changing answer counts', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beat-geo-crawl-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const logs = path.join(dir, 'logs.json');
  await writeFile(logs, JSON.stringify([row(), row({ status: 403 })]));
  const out = path.join(dir, 'standalone');
  const result = await exec(process.execPath, [CLI, 'crawls', '--input', logs, '--site', 'example.com', '--out', out, '--lang', 'zh']);
  assert.match(result.stdout, /2 UA-declared requests/);
  assert.deepEqual((await readdir(out)).sort(), ['crawls.json', 'report.html', 'report.md']);
  const single = JSON.parse(await readFile(path.join(out, 'crawls.json'), 'utf8'));
  assert.equal(single.totals.requests, 2);
  assert.match(await readFile(path.join(out, 'report.html'), 'utf8'), /AI 抓取观察/);
  const records = [{ schema: 'beat-geo/record@1', questionId: 'q1', question: 'Which?', engine: 'test', repeat: 1, source: 'import', response: response([message('A plain answer.')]) }];
  const answers = path.join(dir, 'answers.json');
  await writeFile(answers, JSON.stringify(records[0]));
  const attached = path.join(dir, 'attached');
  await exec(process.execPath, [CLI, 'analyze', '--input', answers, '--out', attached, '--crawl-log', logs, '--site', 'example.com', '--lang', 'zh']);
  const summary = JSON.parse(await readFile(path.join(attached, 'summary.json'), 'utf8'));
  const original = buildRun(records, normalizeConfig({}), []);
  assert.deepEqual(summary.overall, original.summary.overall);
  assert.equal(summary.crawls.totals.requests, single.totals.requests);
  assert.match(await readFile(path.join(attached, 'report.md'), 'utf8'), /AI 抓取观察/);
});

test('CLI rejects missing site and answer/log schema confusion; invalid imports have a nonzero exit', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beat-geo-crawl-invalid-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const logs = path.join(dir, 'logs.json');
  await writeFile(logs, JSON.stringify({ schema: 'beat-geo/logs@1', records: [row({ time: 'bad' })] }));
  await assert.rejects(exec(process.execPath, [CLI, 'crawls', '--input', logs, '--out', path.join(dir, 'missing')]), e => /--site is required/.test(e.stderr));
  await assert.rejects(exec(process.execPath, [CLI, 'crawls', '--input', logs, '--site', 'example.com', '--out', path.join(dir, 'invalid')]), e => e.code === 1 && /invalid input/.test(e.stderr));
  assert.equal(JSON.parse(await readFile(path.join(dir, 'invalid', 'crawls.json'), 'utf8')).observation.state, 'invalid');
  await assert.rejects(exec(process.execPath, [CLI, 'analyze', '--input', logs, '--question', 'Which?', '--out', path.join(dir, 'wrong')]), e => /not answer records/.test(e.stderr));
  await assert.rejects(exec(process.execPath, [CLI, 'crawls', '--input', logs, '--site', 'example.com', '--out', path.join(dir, 'format'), '--format', 'wrong']), e => /--format must/.test(e.stderr));
  const original = await readFile(logs, 'utf8');
  const collision = path.join(dir, 'crawls.json');
  await writeFile(collision, original);
  await assert.rejects(exec(process.execPath, [CLI, 'crawls', '--input', collision, '--site', 'example.com', '--out', dir]), e => /cannot be overwritten/.test(e.stderr));
  assert.equal(await readFile(collision, 'utf8'), original);
  await assert.rejects(exec(process.execPath, [CLI, 'demo', '--out', path.join(dir, 'ignored'), '--site', 'example.com']), e => /not used by this command/.test(e.stderr));
  await assert.rejects(exec(process.execPath, [CLI, 'analyze', '--input', logs, '--out', path.join(dir, 'ignored'), '--site', 'example.com']), e => /require --crawl-log/.test(e.stderr));
});

test('URL-only onboarding explains the missing log instead of claiming traffic access or writing output', async t => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'beat-geo-onboarding-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  for (const lang of ['zh', 'en']) {
    await assert.rejects(exec(process.execPath, [CLI, 'crawls', '--site', 'https://example.com/', '--out', path.join(dir, lang), '--lang', lang]), e =>
      e.code === 2 && (lang === 'zh' ? /网址只用于标识站点/.test(e.stderr) && /访问日志/.test(e.stderr) : /--input is required/.test(e.stderr) && /access log/.test(e.stderr)));
  }
  await assert.rejects(exec(process.execPath, [CLI, 'crawls', '--site', 'example.com', '--input', 'https://example.com/', '--out', path.join(dir, 'url-input'), '--lang', 'zh']), e =>
    e.code === 2 && /不能用网站网址代替日志/.test(e.stderr));
  assert.deepEqual(await readdir(dir), []);
});

test('report onboarding labels snapshot sources and excludes AI referral visitors in both locales', () => {
  const real = analyze([row()]);
  const demo = analyzeCrawls(JSON.stringify({ schema: 'beat-geo/logs@1', synthetic: true, records: [row()] }), opts);
  for (const lang of ['zh', 'en']) {
    for (const render of [renderHtml, renderMarkdown]) {
      const text = render(real, [], { lang });
      assert.match(text, lang === 'zh' ? /日志文件导入 · 非实时/ : /Imported log file · not live/);
      assert.match(text, lang === 'zh' ? /不包含 AI 引荐访客/ : /excludes AI referral visitors/);
      assert.match(render(demo, [], { lang }), lang === 'zh' ? /合成日志示例 · 非实时/ : /Synthetic log example · not live/);
    }
  }
});

test('crawler platform and purpose come from declarations, not a visitor referrer', () => {
  const c = analyze([
    row({ userAgent: 'Mozilla/5.0', referrer: 'https://chatgpt.com/' }),
    row({ userAgent: 'GPTBot/1.0', referrer: 'https://claude.ai/' }),
    row({ userAgent: 'OAI-SearchBot/1.0' }),
    row({ userAgent: 'ChatGPT-User/1.0' }),
  ]);
  assert.equal(c.totals.requests, 3);
  assert.equal(c.input.unrecognized, 1);
  assert.deepEqual(new Set(c.crawlers.map(r => r.platform)), new Set(['OpenAI']));
  assert.deepEqual(new Set(c.crawlers.map(r => r.purpose)), new Set(['search', 'training', 'user']));
  assert.ok(!JSON.stringify(c).includes('https://chatgpt.com/'));
  assert.ok(!JSON.stringify(c).includes('https://claude.ai/'));
});
