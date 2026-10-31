#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { loadEngines, loadQuestions, normalizeConfig, resolveRuntime } from '../src/config.mjs';
import { actualUsd, breakdown } from '../src/budget.mjs';
import { DEMO_CONFIG, DEMO_QUESTIONS, buildDemoRecords, demoFileName } from '../src/demo.mjs';
import { diffSummaries, renderDiffMarkdown } from '../src/diff.mjs';
import { CAPTURE_TEMPLATE } from '../src/capture.mjs';
import { loadEnvFile } from '../src/envfile.mjs';
import { readKeychain } from '../src/keychain.mjs';
import { loadCrawls } from '../src/crawls.mjs';
import { cmdSeo } from '../src/seo-cli.mjs';
import { loadSeo, seoSummary } from '../src/seo.mjs';
import { seoDomain } from '../src/seo-catalog.mjs';
import { cmdGa } from '../src/ga-cli.mjs';
import { loadGa } from '../src/ga.mjs';
import { buildPlan, buildRun, checkAgainstQuestions, executePlan, loadRecords, writeOutputs } from '../src/run.mjs';

const HELP = `beat-geo — repeatable GEO / AI-search visibility probe

Usage:
  beat-geo run      --questions FILE --out DIR [--config FILE] [--repeats 3]
                     ( --engines FILE  |  --model NAME [--api responses|chat|messages] [--base-url URL] [--engine LABEL] )
                     [--only id1,id2] [--only-engines id1,id2] [--max-output-tokens N] [--max-search-calls N] [--no-search-cap] [--no-include-sources] [--tool-type NAME] [--max-requests 50] [--concurrency 1] [--budget-usd N] [--keychain SERVICE [--keychain-account ACCOUNT]] [--key-file FILE] [--execute]
                     single-engine cost inputs: [--price-in USD/Mtok --price-out USD/Mtok --price-search USD/call]
                                                [--max-output-tokens 1500] [--max-search-calls 3]
  beat-geo analyze  --input FILE|DIR --out DIR [--config FILE] [--questions FILE] [--engines FILE]
                     [--question TEXT --question-id ID --engine LABEL]
                     [--ga-input FILE]  (GA snapshot from ga connect/sync)
                     [--crawl-log FILE --site HOST --format auto|combined|json|jsonl --from ISO --to ISO]
  beat-geo crawls   --input FILE --site HOST --out DIR [--format auto|combined|json|jsonl]
                     [--from ISO --to ISO] [--lang zh]  (offline log observations; no API key)
  beat-geo seo connect --key-file /private/beatapi.env [--connection NAME]
  beat-geo seo status|disconnect [--connection NAME]
  beat-geo seo --config examples/seo.project.example.json [--budget-usd N --execute --out DIR]
  beat-geo seo --input examples/seo.snapshot.example.json --out DIR [--lang zh]
  beat-geo seo diff --base FILE --head FILE --out DIR
  beat-geo analyze --input ANSWERS --seo-input SEO_SNAPSHOT --out DIR
  beat-geo ga connect --client-file FILE [--property ID --site HOST] [--connection NAME]
                     [--out DIR --lang zh]  (Google read-only consent, select site, fetch report)
  beat-geo ga sync  [--connection NAME] [--out DIR] [--start-date YYYY-MM-DD --end-date YYYY-MM-DD]
  beat-geo ga       --input FILE --out DIR [--lang zh]  (offline GA export replay)
  beat-geo ga status|disconnect [--connection NAME]  (local connection only)
  beat-geo doctor    --engines FILE [--keychain SERVICE] [--key-file FILE]   (checks engines, pricing and key presence; sends nothing)
  beat-geo template  (prints the browser-capture JSON template)
  beat-geo diff     --base RUN_DIR --head RUN_DIR [--out DIR]
  beat-geo demo     --out DIR [--repeats 5]

Notes:
  * "run" is a dry run unless --execute is given. A dry run writes nothing (--out is only needed with
    --execute) and reports, per engine, whether its key is present (names only, never values).
  * Exit codes for live runs: 0 ok, 1 no answers, 3 estimated spend went over the budget (outputs are still written).
  * A dry run ends with a verdict (READY / NOT READY) and exits 2 when not ready, so scripts and agents
    can tell. --max-output-tokens / --max-search-calls with --engines can only lower an engine's caps.
  * --only runs a subset of the declared questions, unchanged; the report records the subset and the
    SHA-256 of the full question file.
  * --execute REQUIRES --budget-usd, and every engine needs pricing. The worst case of the whole plan
    must fit the budget or nothing is sent; spend is also tracked while running and stops at the cap.
    The budget is an estimate from provider-reported usage, not a bill: keep a provider-side limit too.
  * Credentials come from environment variables, or from a key file you create yourself (--key-file,
    KEY=VALUE lines; keep it chmod 600 and out of git). --keychain SERVICE [--keychain-account ACCOUNT] (macOS) reads the key from the Keychain into memory
    only; nothing is written to disk. ~/.beat-geo.env is used automatically when it
    exists; the file used is always named in the output.. Values are never printed or saved.
  * The default key variable is BEAT_GEO_API_KEY; an engine can name another one in apiKeyEnv.
  * --engines runs the same questions on several engines; see examples/engines.example.json.
  * Brand configuration is analysis-only and is never sent to the model.
  * Add --lang zh for a Chinese report.
  * Crawl observations use a site-specific log. UA declarations remain unverified; missing logs do not
    prove no visit. No network calls are made. --from is inclusive, --to exclusive (ISO time with timezone).
  * A website URL identifies the site; it cannot reveal past visits. crawls also needs --input FILE
    with that site's access log. GA reads AI referral sessions separately; see references/ga.md.
  * GA uses our own Google OAuth Desktop client and analytics.readonly permission. First-time consent
    is required. Credentials stay outside the project; no analytics settings are changed. sync reads
    again on demand, not on a background schedule. Browser login alone is not API authorization.
`;

const OPTIONS = {
  questions: { type: 'string' },
  'key-file': { type: 'string' },
  keychain: { type: 'string' },
  'keychain-account': { type: 'string' },
  'keychain-var': { type: 'string' },
  only: { type: 'string' },
  'only-engines': { type: 'string' },
  engines: { type: 'string' },
  config: { type: 'string' },
  input: { type: 'string' },
  'crawl-log': { type: 'string' },
  'ga-input': { type: 'string' },
  'seo-input': { type: 'string' },
  'client-file': { type: 'string' },
  connection: { type: 'string' },
  property: { type: 'string' },
  'start-date': { type: 'string' },
  'end-date': { type: 'string' },
  site: { type: 'string' },
  format: { type: 'string' },
  from: { type: 'string' },
  to: { type: 'string' },
  out: { type: 'string' },
  base: { type: 'string' },
  head: { type: 'string' },
  question: { type: 'string' },
  'question-id': { type: 'string' },
  engine: { type: 'string' },
  model: { type: 'string' },
  api: { type: 'string' },
  'base-url': { type: 'string' },
  'tool-type': { type: 'string' },
  'no-include-sources': { type: 'boolean' },
  'no-search-cap': { type: 'boolean' },
  'budget-usd': { type: 'string' },
  'price-in': { type: 'string' },
  'price-out': { type: 'string' },
  'price-search': { type: 'string' },
  'max-output-tokens': { type: 'string' },
  'max-search-calls': { type: 'string' },
  repeats: { type: 'string' },
  'max-requests': { type: 'string' },
  concurrency: { type: 'string' },
  'timeout-ms': { type: 'string' },
  lang: { type: 'string' },
  execute: { type: 'boolean' },
  help: { type: 'boolean', short: 'h' },
};

const readJson = async (file) => JSON.parse(await readFile(file, 'utf8'));
const num = (v, name, { allowZero = false } = {}) => {
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || (!allowZero && n === 0)) fail(`--${name} must be a ${allowZero ? 'non-negative' : 'positive'} number.`);
  return n;
};
const int = (v, dflt, name) => {
  if (v === undefined) return dflt;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) fail(`--${name} must be a positive integer.`);
  return n;
};

function fail(message, code = 2) {
  console.error(`beat-geo: ${message}`);
  process.exit(code);
}

function need(opts, key) {
  if (!opts[key]) fail(`--${key} is required.`);
  return opts[key];
}

function langOf(opts) {
  const lang = opts.lang ?? 'en';
  if (!['en', 'zh'].includes(lang)) fail('--lang must be en or zh.');
  return lang;
}

// Credential sources, in order: existing environment, --keychain (macOS), --key-file, ~/.beat-geo.env.
// The source used is always named in the output; values never are.
async function loadKeychain(opts) {
  if (!opts.keychain) return;
  const name = opts['keychain-var'] ?? 'BEAT_GEO_API_KEY';
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) fail('--keychain-var must be an environment variable name.');
  if (process.env[name]) {
    console.log(`Keychain: $${name} is already set; not reading the Keychain.`);
    return;
  }
  try {
    process.env[name] = await readKeychain({ service: opts.keychain, account: opts['keychain-account'] });
    console.log(`Keychain (service "${opts.keychain}"): loaded ${name} into memory only.`);
  } catch (err) {
    fail(err.message);
  }
}

// Without --key-file, ~/.beat-geo.env is used when it exists. The file used is always named.
async function loadKeyFile(opts) {
  await loadKeychain(opts);
  let file = opts['key-file'];
  let implicit = false;
  if (!file && process.env.HOME) {
    const candidate = path.join(process.env.HOME, '.beat-geo.env');
    if (await stat(candidate).then(() => true, () => false)) {
      file = candidate;
      implicit = true;
    }
  }
  if (!file) return;
  try {
    const { loaded, warning } = await loadEnvFile(file);
    if (warning) console.error(`Warning: ${warning}`);
    console.log(`Key file ${file}${implicit ? ' (default location)' : ''}: loaded ${loaded.length ? loaded.join(', ') : 'no new variables'}.`);
  } catch (err) {
    fail(err.message);
  }
}

function resolveEngines(opts) {
  return opts.engines
    ? readJson(opts.engines).then(loadEngines)
    : Promise.resolve(
        loadEngines([
          {
            id: opts.engine ?? opts.api ?? 'responses',
            model: need(opts, 'model'),
            api: opts.api ?? 'responses',
            baseUrl: opts['base-url'],
            toolType: opts['tool-type'],
            includeSources: !opts['no-include-sources'],
            maxOutputTokens: opts['max-output-tokens'] === undefined ? undefined : int(opts['max-output-tokens'], undefined, 'max-output-tokens'),
            maxSearchCalls: opts['max-search-calls'] === undefined ? undefined : Number(opts['max-search-calls']),
            pricing:
              opts['price-in'] === undefined && opts['price-out'] === undefined && opts['price-search'] === undefined
                ? undefined
                : {
                    inputPerMTok: num(opts['price-in'], 'price-in', { allowZero: true }),
                    outputPerMTok: num(opts['price-out'], 'price-out', { allowZero: true }),
                    perSearchCall: num(opts['price-search'], 'price-search', { allowZero: true }),
                  },
          },
        ]),
      );
}

const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const usd = (n) => `$${n.toFixed(4)}`;

async function cmdRun(opts) {
  if (opts.engines && (opts.model || opts.api || opts['base-url'] || opts.engine)) fail('Use either --engines or the single-engine flags (--model, --api, --base-url, --engine), not both.');
  const questionsRaw = await readFile(need(opts, 'questions'), 'utf8');
  const declared = loadQuestions(JSON.parse(questionsRaw));
  let questions = declared;
  if (opts.only) {
    const ids = opts.only.split(',').map((x) => x.trim()).filter(Boolean);
    const unknown = ids.filter((id) => !declared.some((q) => q.id === id));
    if (unknown.length) fail(`--only names unknown question id(s): ${unknown.join(', ')}. Declared ids: ${declared.map((q) => q.id).join(', ')}.`);
    questions = declared.filter((q) => ids.includes(q.id));
  }
  const questionSet = { sha256: sha256(questionsRaw), declared: declared.length, run: questions.map((q) => q.id) };
  const config = normalizeConfig(opts.config ? await readJson(opts.config) : {});
  let engines = await resolveEngines(opts);
  if (opts['only-engines']) {
    const ids = opts['only-engines'].split(',').map((x) => x.trim()).filter(Boolean);
    const unknown = ids.filter((id) => !engines.some((e) => e.id === id));
    if (unknown.length) fail(`--only-engines names unknown engine id(s): ${unknown.join(', ')}. Engine ids: ${engines.map((e) => e.id).join(', ')}.`);
    engines = engines.filter((e) => ids.includes(e.id));
  }
  if (opts.engines) {
    for (const [flag, field] of [['max-output-tokens', 'maxOutputTokens'], ['max-search-calls', 'maxSearchCalls']]) {
      if (opts[flag] === undefined) continue;
      const n = Number(opts[flag]);
      if (!Number.isInteger(n) || n < (field === 'maxSearchCalls' ? 0 : 1)) fail(`--${flag} must be a ${field === 'maxSearchCalls' ? 'non-negative' : 'positive'} integer.`);
      for (const e of engines) {
        if (n > e[field]) fail(`--${flag} ${n} is above engine "${e.id}" (${field} ${e[field]}). Overrides can only lower a cap.`);
        e[field] = n;
      }
    }
  }
  if (opts.engines) {
    for (const e of engines) {
      if (opts['tool-type']) e.toolType = opts['tool-type'];
      if (opts['no-include-sources']) e.includeSources = false;
    }
  }
  if (opts['no-search-cap']) for (const e of engines) e.sendSearchCap = false;
  await loadKeyFile(opts);

  const plan = buildPlan({
    questions,
    engines,
    repeats: int(opts.repeats, 3, 'repeats'),
    maxRequests: int(opts['max-requests'], 50, 'max-requests'),
  });
  const budgetUsd = num(opts['budget-usd'], 'budget-usd');
  const { runtime, missing } = resolveRuntime(engines, process.env);

  console.log(`Plan: ${plan.total} request(s) = ${plan.questions} question(s) x ${engines.length} engine(s) x ${plan.repeats} repeat(s)`);
  console.log(`Question set: ${questions.length} of ${declared.length} declared (sha256 ${questionSet.sha256.slice(0, 12)}…)`);
  const longest = questions.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  for (const e of engines) {
    console.log(`  - ${e.id}: model ${e.model} | api ${e.api} | key $${e.apiKeyEnv}: ${runtime[e.id].apiKey ? 'present' : 'MISSING'}`);
    if (!e.sendSearchCap) console.log('      search cap NOT sent to the provider: it may run more searches than maxSearchCalls, so the worst case below is not enforced by the provider (the runtime guard still applies)');
    const b = breakdown(e, longest);
    if (b) {
      console.log(`      worst case per request ≈ ${usd(b.totalUsd)} = input ≤${b.inputTokens} tok ${usd(b.inputUsd)} (question ~${b.questionTokens} tok × ${b.rounds} rounds + search results ≤${b.searchResultTokens} tok/search re-read each round) + output cap ${b.outputCap} tok ${usd(b.outputUsd)} + up to ${b.searchCalls} search(es) ${usd(b.searchUsd)}`);
      console.log('      lower maxOutputTokens / maxSearchCalls (or pass --max-output-tokens / --max-search-calls) to reduce; searchResultTokens is an assumption per engine');
    }
  }
  if (plan.worstCaseTotalUsd != null) {
    console.log(`Worst-case cost of this plan: ${usd(plan.worstCaseTotalUsd)}${budgetUsd ? ` (budget $${budgetUsd})` : ' (no --budget-usd set)'}. An estimate from the rates you supplied.`);
  } else {
    console.log(`Cost cannot be estimated: no pricing for engine(s) ${plan.unpriced.join(', ')}.`);
  }
  if (plan.exceedsCap) fail(`Plan has ${plan.total} requests, above --max-requests ${plan.maxRequests}. Raise the cap deliberately or reduce the plan.`);
  if (!opts.execute) {
    const blockers = [];
    if (missing.length) blockers.push(`missing key variable(s): ${missing.join(', ')}`);
    if (plan.unpriced.length) blockers.push(`no pricing for: ${plan.unpriced.join(', ')}`);
    if (budgetUsd && plan.worstCaseTotalUsd != null && plan.worstCaseTotalUsd > budgetUsd) blockers.push(`worst case ${usd(plan.worstCaseTotalUsd)} exceeds budget $${budgetUsd}`);
    console.log('Dry run: no requests were sent and nothing was written.');
    if (blockers.length) {
      console.log(`Verdict: NOT READY. ${blockers.join('; ')}.`);
      process.exit(2);
    }
    console.log(`Verdict: READY. To collect, add ${budgetUsd ? '' : '--budget-usd <USD> '}--out <dir> --execute (each request may be billed by your provider).`);
    return;
  }

  const outDir = need(opts, 'out');
  if (!budgetUsd) fail('Live collection requires --budget-usd <USD>. Choose the most you are willing to spend on this run.');
  if (plan.unpriced.length) fail(`Live collection needs pricing for every engine. Add "pricing" (inputPerMTok, outputPerMTok, perSearchCall) for: ${plan.unpriced.join(', ')}.`);
  if (plan.worstCaseTotalUsd > budgetUsd) {
    fail(`Worst-case cost ${usd(plan.worstCaseTotalUsd)} exceeds the budget $${budgetUsd}. Nothing was sent. Reduce questions (--only), engines, repeats, maxOutputTokens or maxSearchCalls, or raise the budget deliberately.`);
  }
  if (missing.length) fail(`Set these environment variables (or list them in --key-file) before collecting live responses: ${missing.join(', ')}.`);

  const spend = await executePlan({
    plan,
    runtime,
    outDir,
    budgetUsd,
    concurrency: int(opts.concurrency, 1, 'concurrency'),
    timeoutMs: int(opts['timeout-ms'], 120_000, 'timeout-ms'),
    onProgress: ({ done, total, ok, questionId, engine }) => console.log(`[${done}/${total}] ${questionId} @ ${engine} ${ok ? 'ok' : 'FAILED'}`),
  });
  spend.rates = engines.map((e) => ({ id: e.id, model: e.model, ...e.pricing, maxOutputTokens: e.maxOutputTokens, maxSearchCalls: e.maxSearchCalls, searchResultTokens: e.searchResultTokens }));

  const records = await loadRecords(outDir);
  const run = buildRun(records, config, declared, { spend, questionSet });
  await writeOutputs(outDir, run, { lang: langOf(opts) });
  await writeFile(path.join(outDir, 'budget.json'), JSON.stringify(spend, null, 2));
  if (spend.stoppedByBudget) console.log(`STOPPED: budget reached. ${spend.skipped} request(s) were not sent.`);
  console.log(`Estimated spend: ${usd(spend.estimatedSpentUsd)} of $${budgetUsd} budget (an estimate, not a bill).`);
  const ok = run.summary.overall.n;
  console.log(`Done: ${ok} answer(s) analyzed, ${run.summary.overall.failed} failed. Report: ${path.join(outDir, 'report.html')}`);
  if (run.summary.failures.length) {
    console.log('Failures (status, message excerpt, request fields; keys are never included):');
    const failed = records.filter((r) => r.error).slice(0, 6);
    for (const r of failed) console.log(`  - ${r.questionId} @ ${r.engine} #${r.repeat}: status ${r.error.status ?? 'n/a'} ${String(r.error.message).slice(0, 160)}${r.error.request ? `\n      ${r.error.request}` : ''}`);
    if (run.summary.failures.some((f) => f.status === 400)) console.log('  A 400 usually means the provider rejected a request field. Re-run the pilot with --no-search-cap, --no-include-sources or --tool-type <name> (one change at a time); see SKILL.md.');
  }
  for (const m of run.summary.modelMismatches) console.log(`NOTE: ${m.label} was asked for ${m.requested} but the response reports ${m.served.join(', ')}.`);
  if (spend.overruns.length) {
    console.log(`WARNING: ${spend.overruns.length} request(s) cost more than their worst-case estimate; the provider did not honor a cap:`);
    for (const o of spend.overruns.slice(0, 6)) console.log(`  - ${o.questionId} @ ${o.engine}: ${usd(o.actualUsd)} vs worst case ${usd(o.worstCaseUsd)}; tool calls ${o.toolCalls ?? 'n/a'} vs cap ${o.maxSearchCalls}`);
    console.log('  Later requests to those engines reserved the observed cost, so the run stopped sooner. Check the provider\'s own usage for the real figure.');
  }
  if (spend.overBudget) {
    console.log(`OVER BUDGET: estimated spend ${usd(spend.estimatedSpentUsd)} exceeds the budget $${budgetUsd}. The estimate is not a bill; check the provider's own usage, and keep a provider-side limit.`);
    process.exit(3);
  }
  if (ok === 0) process.exit(1);
}

async function cmdDoctor(opts) {
  const engines = await resolveEngines(opts);
  await loadKeyFile(opts);
  const { runtime, missing } = resolveRuntime(engines, process.env);
  let problems = 0;
  for (const e of engines) {
    const path_ = e.api === 'chat' ? 'chat/completions' : e.api === 'messages' ? 'messages' : 'responses';
    const priced = Boolean(e.pricing);
    const keyOk = Boolean(runtime[e.id].apiKey);
    if (!priced || !keyOk) problems += 1;
    console.log(`${e.id}: ${runtime[e.id].baseUrl.replace(/\/+$/, '')}/${path_} | model ${e.model} | pricing ${priced ? 'set' : 'MISSING'} | key $${e.apiKeyEnv}: ${keyOk ? 'present' : 'MISSING'}`);
  }
  console.log(problems ? `Not ready: ${problems} engine(s) need attention${missing.length ? ` (missing: ${missing.join(', ')})` : ''}. Nothing was sent.` : 'Ready: engines valid, pricing set, keys present. Nothing was sent.');
  if (problems) process.exit(2);
}

async function cmdAnalyze(opts) {
  const input = need(opts, 'input');
  const outDir = need(opts, 'out');
  const config = normalizeConfig(opts.config ? await readJson(opts.config) : {});
  const questionsRaw = opts.questions ? await readFile(opts.questions, 'utf8') : null;
  const questions = questionsRaw ? loadQuestions(JSON.parse(questionsRaw)) : [];
  const records = await loadRecords(input, {
    question: opts.question,
    questionId: opts['question-id'],
    engine: opts.engine,
  });
  if (questions.length) {
    const problems = checkAgainstQuestions(records, questions);
    if (problems.length) fail(`Records do not match the declared question set:\n  - ${problems.slice(0, 10).join('\n  - ')}${problems.length > 10 ? `\n  … and ${problems.length - 10} more` : ''}`, 1);
  }
  const questionSet = questionsRaw ? { sha256: sha256(questionsRaw), declared: questions.length, run: [...new Set(records.map((r) => r.questionId))] } : null;
  const engines = opts.engines ? loadEngines(await readJson(opts.engines)) : null;
  // Records collected before the marker existed: infer "a search tool was in the request" from the engine's api.
  if (engines) for (const r of records) if (r.searchRequested === undefined && r.source === 'live') r.searchRequested = engines.find((e) => e.id === r.engine)?.api !== 'chat' && engines.some((e) => e.id === r.engine);
  const run = buildRun(records, config, questions, { questionSet });
  if (engines) {
    // Offline: re-price the raw responses with the engine rates given now. Sends nothing, costs nothing.
    const byEngine = {};
    let unpriced = 0;
    for (const r of records) {
      const engine = engines.find((e) => e.id === r.engine);
      if (!r.response || !engine) continue;
      const cost = actualUsd(engine, r.response);
      if (cost == null) unpriced += 1;
      else byEngine[engine.id] = (byEngine[engine.id] ?? 0) + cost;
    }
    const totalUsd = Object.values(byEngine).reduce((a, b) => a + b, 0);
    run.summary.costRecomputed = { totalUsd, byEngine, recordsWithoutUsage: unpriced, note: 'Estimate from the raw responses and the rates in the engine file; not a bill.' };
    console.log(`Re-priced from raw responses: ${usd(totalUsd)} in total (an estimate, not a bill).`);
    for (const [id, v] of Object.entries(byEngine)) console.log(`  - ${id}: ${usd(v)}`);
    if (unpriced) console.log(`  ${unpriced} answer(s) had no usage and were not priced.`);
  }
  if (opts['crawl-log']) run.summary.crawls = await readCrawlLog(opts['crawl-log'], opts);
  if (opts['seo-input']) {
    run.summary.seo = seoSummary(await loadSeo(opts['seo-input']));
    const owned = config.entities.filter(e => e.kind === 'brand').flatMap(e => e.domains).map(seoDomain);
    if (owned.length && !owned.includes(run.summary.seo.site)) fail('SEO site does not match the configured brand.');
  }
  if (opts['ga-input']) run.summary.ga = (await loadGa(opts['ga-input'])).summary;
  if (run.summary.ga && run.summary.crawls && run.summary.ga.site !== run.summary.crawls.site) fail('GA and crawl observations must use the same site hostname.');
  if (run.summary.seo) for (const observation of [run.summary.ga, run.summary.crawls].filter(Boolean)) {
    if (seoDomain(observation.site) !== run.summary.seo.site) fail('SEO and site observations must refer to the same site.');
  }
  await writeOutputs(outDir, run, { lang: langOf(opts) });
  if (run.summary.crawls) printCrawlResult(run.summary.crawls);
  console.log(`Analyzed ${run.summary.overall.n} answer(s) from ${input}. Report: ${path.join(outDir, 'report.html')}`);
}

function readCrawlLog(file, opts) {
  if (/^https?:\/\//i.test(file)) fail(opts.lang === 'zh'
    ? '请提供本地日志文件，不能用网站网址代替日志。网址无法提供历史访问记录；请从站点服务器／CDN 导出访问日志后，用 --input FILE（或 --crawl-log FILE）导入。'
    : 'Provide a local log file, not a website URL. A URL cannot reveal past visits; export the site access log from your server/CDN, then use --input FILE (or --crawl-log FILE).');
  if (opts.out && ['crawls.json', 'summary.json', 'actions.json', 'report.html', 'report.md'].some(name => path.resolve(file) === path.resolve(opts.out, name))) {
    fail('Choose a separate output directory so the imported log cannot be overwritten.');
  }
  return loadCrawls(file, { site: need(opts, 'site'), format: opts.format ?? (file.endsWith('.jsonl') || file.endsWith('.ndjson') ? 'jsonl' : 'auto'), from: opts.from, to: opts.to });
}

function printCrawlResult(c) {
  console.log(`Crawl observations for ${c.site}: ${c.totals.requests} UA-declared requests, ${c.totals.identities} identities, ${c.totals.pages} paths; ${c.input.rejected} rejected rows. Identity unverified; coverage unknown.`);
  if (c.synthetic) console.log('SYNTHETIC LOG DATA — not real site traffic.');
  if (c.observation.state === 'invalid') {
    console.error('No valid site log records were parsed. This is invalid input, not zero AI traffic.');
    process.exitCode = 1;
  }
}

async function cmdCrawls(opts) {
  const lang = langOf(opts);
  if (!opts.input) fail(lang === 'zh'
    ? '--input 必填：网址只用于标识站点，真实爬虫访问需要本站访问日志。请从站点服务器／CDN 导出日志，再运行 crawls --input /path/to/access.log --site example.com --out ./runs/crawls --lang zh。AI 引荐会话请使用 ga connect；爬虫日志仍需单独导入。'
    : '--input is required: a website URL only identifies the site. Export its server/CDN access log, then run crawls --input /path/to/access.log --site example.com --out ./runs/crawls. Use ga connect for AI referral sessions; crawler logs still need a separate import.');
  const c = await readCrawlLog(need(opts, 'input'), opts);
  const outDir = need(opts, 'out');
  await writeOutputs(outDir, { summary: c, actions: [] }, { lang });
  printCrawlResult(c);
  console.log(`Report: ${path.join(outDir, 'report.html')}`);
}

async function cmdDiff(opts) {
  const base = await readJson(path.join(need(opts, 'base'), 'summary.json'));
  const head = await readJson(path.join(need(opts, 'head'), 'summary.json'));
  const diff = diffSummaries(base, head);
  const md = renderDiffMarkdown(diff);
  if (opts.out) {
    await mkdir(opts.out, { recursive: true });
    await writeFile(path.join(opts.out, 'diff.json'), JSON.stringify(diff, null, 2));
    await writeFile(path.join(opts.out, 'diff.md'), md);
  }
  console.log(md);
}

async function cmdDemo(opts) {
  const outDir = need(opts, 'out');
  const records = buildDemoRecords({ repeats: int(opts.repeats, 5, 'repeats') });
  await mkdir(path.join(outDir, 'records'), { recursive: true });
  for (const rec of records) await writeFile(path.join(outDir, 'records', demoFileName(rec)), JSON.stringify(rec, null, 2));
  const run = buildRun(records, normalizeConfig(DEMO_CONFIG), loadQuestions(DEMO_QUESTIONS));
  await writeOutputs(outDir, run, { lang: langOf(opts) });
  console.log(`Synthetic demo written to ${outDir} (report.html, report.md, summary.json, actions.json).`);
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({ args: process.argv.slice(2), options: OPTIONS, allowPositionals: true });
  } catch (err) {
    fail(err.message);
  }
  const [command, action] = parsed.positionals;
  if (parsed.values.help || !command || command === 'help') {
    console.log(HELP);
    return;
  }
  const logFlags = ['crawl-log', 'site', 'format', 'from', 'to'];
  if (logFlags.some(key => parsed.values[key] !== undefined) && !['crawls', 'analyze', 'ga'].includes(command)) {
    fail('Log options belong to crawls or analyze --crawl-log; they are not used by this command.');
  }
  if (command === 'analyze' && !parsed.values['crawl-log'] && logFlags.slice(1).some(key => parsed.values[key] !== undefined)) {
    fail('--site, --format, --from and --to require --crawl-log with analyze.');
  }
  if (command === 'crawls' && parsed.values['crawl-log']) fail('Use crawls --input FILE, or analyze --crawl-log FILE.');
  if (parsed.values['seo-input'] && command !== 'analyze') fail('--seo-input belongs to analyze.');
  if (parsed.values['ga-input'] && command !== 'analyze') fail('--ga-input belongs to analyze.');
  if (['client-file', 'property', 'start-date', 'end-date'].some(key => parsed.values[key] !== undefined) && command !== 'ga') fail('GA connection options belong to ga.');
  if (parsed.values.connection && !['ga','seo'].includes(command)) fail('--connection belongs to ga or seo.');
  if (parsed.positionals.length > (['ga','seo'].includes(command) ? 2 : 1)) fail('Unexpected positional argument.');
  const handlers = { seo: opts => cmdSeo(opts, action), ga: opts => cmdGa(opts, action), run: cmdRun, doctor: cmdDoctor, analyze: cmdAnalyze, crawls: cmdCrawls, diff: cmdDiff, demo: cmdDemo, template: async () => console.log(JSON.stringify(CAPTURE_TEMPLATE, null, 2)) };
  if (!handlers[command]) fail(`Unknown command "${command}". Run beat-geo --help.`);
  try {
    await handlers[command](parsed.values);
  } catch (err) {
    fail(err.message, 1);
  }
}

main();
