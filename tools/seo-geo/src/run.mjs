import { seoOpportunities, seoQuestionCandidates } from './seo.mjs';
// Orchestration: plan → (optionally) collect → load records → analyze → summarize → write outputs.

import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { aggregate } from './aggregate.mjs';
import { analyzeObservation } from './analyze.mjs';
import { deriveActions } from './actions.mjs';
import { Budget, actualUsd, isPriced, usageSummary, worstCaseUsd } from './budget.mjs';
import { CAPTURE_SCHEMA, captureToRecord } from './capture.mjs';
import { collectOne } from './collect.mjs';
import { parseResponse } from './parse.mjs';
import { renderHtml, renderMarkdown } from './report.mjs';
import { slug } from './util.mjs';

export function buildPlan({ questions, engines, repeats, maxRequests }) {
  const items = [];
  for (const question of questions) {
    for (const engine of engines) {
      for (let repeat = 1; repeat <= repeats; repeat++) items.push({ question, engine, repeat });
    }
  }
  for (const item of items) item.worstUsd = worstCaseUsd(item.engine, item.question);
  const unpriced = engines.filter((e) => !isPriced(e)).map((e) => e.id);
  const worstCaseTotalUsd = unpriced.length ? null : items.reduce((sum, i) => sum + i.worstUsd, 0);
  return { engines, questions: questions.length, repeats, total: items.length, maxRequests, exceedsCap: items.length > maxRequests, unpriced, worstCaseTotalUsd, items };
}

const recordName = (item) => `${slug(item.question.id)}__${slug(item.engine.id)}__${item.repeat}.json`;

export async function executePlan({ plan, runtime, outDir, budgetUsd = null, onProgress = () => {}, concurrency = 1, timeoutMs = 120_000, fetchImpl }) {
  const recordsDir = path.join(outDir, 'records');
  await mkdir(recordsDir, { recursive: true });
  const budget = budgetUsd == null ? null : new Budget(budgetUsd);
  let cursor = 0;
  let done = 0;
  let stoppedByBudget = false;
  const overruns = [];
  // Providers can ignore caps. After an engine has cost more than its worst case, later requests to it reserve what
  // was actually observed, so the runtime guard reflects real behavior instead of the assumed one.
  const observedMax = new Map();
  const worker = async () => {
    while (cursor < plan.items.length && !stoppedByBudget) {
      const item = plan.items[cursor];
      const reserveAmt = Math.max(item.worstUsd ?? 0, observedMax.get(item.engine.id) ?? 0);
      if (budget && !budget.canReserve(reserveAmt)) {
        stoppedByBudget = true;
        break;
      }
      cursor += 1;
      budget?.reserve(reserveAmt);
      const { engine } = item;
      const result = await collectOne({
        api: engine.api,
        baseUrl: runtime[engine.id].baseUrl,
        apiKey: runtime[engine.id].apiKey,
        model: engine.model,
        toolType: engine.toolType,
        authStyle: engine.authStyle,
        anthropicVersion: engine.anthropicVersion,
        includeSources: engine.includeSources,
        extraBody: engine.extraBody,
        maxOutputTokens: engine.maxOutputTokens,
        maxSearchCalls: engine.maxSearchCalls,
        sendSearchCap: engine.sendSearchCap,
        timeoutMs,
        question: item.question,
        fetchImpl,
      });
      const record = {
        schema: 'beat-geo/record@1',
        questionId: item.question.id,
        question: item.question.text,
        engine: engine.id,
        engineLabel: engine.label,
        model: engine.model,
        repeat: item.repeat,
        collectedAt: new Date().toISOString(),
        source: 'live',
        searchRequested: engine.api !== 'chat',
        ...(result.ok ? { response: result.response } : { error: result.error }),
      };
      if (budget) {
        // Unknown usage and ambiguous failures (timeout / network) are charged at worst case.
        const actual = result.ok ? actualUsd(engine, result.response) : result.error.status === null ? null : 0;
        const charged = actual ?? item.worstUsd;
        budget.settle(reserveAmt, charged);
        record.costUsd = charged;
        observedMax.set(engine.id, Math.max(observedMax.get(engine.id) ?? 0, charged));
        if (charged > item.worstUsd * 1.0001) {
          const use = result.ok ? usageSummary(result.response) : null;
          overruns.push({
            engine: engine.id,
            questionId: item.question.id,
            actualUsd: charged,
            worstCaseUsd: item.worstUsd,
            toolCalls: use?.toolCalls ?? null,
            maxSearchCalls: engine.maxSearchCalls,
            cachedInputTokens: use?.cachedInputTokens ?? null,
            freshInputTokens: use?.freshInputTokens ?? null,
          });
        }
      }
      // Persist immediately so an interrupted run keeps what it already paid for.
      await writeFile(path.join(recordsDir, recordName(item)), JSON.stringify(record, null, 2));
      done += 1;
      onProgress({ done, total: plan.total, ok: result.ok, questionId: item.question.id, engine: engine.id });
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, 4)) }, worker));
  return {
    sent: done,
    skipped: plan.total - done,
    stoppedByBudget,
    budgetUsd,
    estimatedSpentUsd: budget ? budget.spent : null,
    overBudget: budget ? budget.spent > budgetUsd + 1e-9 : false,
    overruns,
    worstCaseTotalUsd: plan.worstCaseTotalUsd,
  };
}

async function listJson(dir) {
  const out = [];
  for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listJson(full)));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function isRecord(x) {
  return x && typeof x === 'object' && x.schema === 'beat-geo/record@1';
}

// Accepts a records directory, a run directory (with records/), or a single file.
// Raw provider responses need a question; they are attributed to it.
export async function loadRecords(input, { question, questionId = 'q1', engine = 'import' } = {}) {
  const info = await stat(input);
  let files;
  if (info.isDirectory()) {
    let dir = input;
    try {
      if ((await stat(path.join(input, 'records'))).isDirectory()) dir = path.join(input, 'records');
    } catch { /* input itself holds the records */ }
    files = await listJson(dir);
  } else {
    files = [input];
  }
  const records = [];
  let repeat = 0;
  for (const file of files) {
    const data = await readJson(file);
    if (isRecord(data)) {
      records.push(data);
      continue;
    }
    if (data?.schema === CAPTURE_SCHEMA) {
      records.push(captureToRecord(data, file));
      continue;
    }
    if (String(data?.schema ?? '').startsWith('beat-geo/seo-')) throw new Error('SEO data is not an answer record. Use seo --input or analyze --seo-input.');
    if (['beat-geo/logs@1', 'beat-geo/crawl-summary@1'].includes(data?.schema)) {
      throw new Error('Crawl logs are not answer records. Use crawls --input FILE --site HOST, or analyze --crawl-log FILE.');
    }
    if (['beat-geo/ga-export@1', 'beat-geo/ga-summary@1', 'beat-geo/ga-connection@1'].includes(data?.schema)) {
      throw new Error('GA data is not an answer record. Use ga --input FILE or analyze --ga-input FILE. Never import a credential file.');
    }
    if (!question) throw new Error(`${file} is a raw response; pass --question "<the exact question asked>" to attribute it.`);
    repeat += 1;
    records.push({
      schema: 'beat-geo/record@1',
      questionId,
      question,
      engine,
      model: data?.model ?? null,
      repeat,
      collectedAt: null,
      source: 'import',
      response: data,
    });
  }
  if (!records.length) throw new Error(`No records found in ${input}.`);
  return records;
}

export function analyzeRecords(records, config) {
  return records.map((r) => {
    if (!r.response) return { ...r, analysis: null };
    return { ...r, analysis: analyzeObservation(parseResponse(r.response), config) };
  });
}

export function buildRun(records, config, questions, { spend = null, questionSet = null } = {}) {
  const analyzed = analyzeRecords(records, config);
  const summary = aggregate(analyzed, config, questions);
  summary.sources = [...new Set(records.map((r) => r.source ?? 'unknown'))];
  if (spend) summary.spend = spend;
  if (questionSet) summary.questionSet = questionSet;
  summary.failures = records
    .filter((r) => r.error)
    .map((r) => ({ questionId: r.questionId, engine: r.engine, engineLabel: r.engineLabel ?? r.engine, repeat: r.repeat, status: r.error.status, message: r.error.message, request: r.error.request ?? null }));
  const actions = deriveActions(summary);
  return { summary, actions };
}

export async function writeOutputs(outDir, { summary, actions }, { lang = 'en' } = {}) {
  await mkdir(outDir, { recursive: true });
  const crawlOnly = summary.schema === 'beat-geo/crawl-summary@1';
  const gaOnly = summary.schema === 'beat-geo/ga-summary@1';
  const seoOnly = summary.schema === 'beat-geo/seo-summary@1';
  if (!crawlOnly && !gaOnly && !seoOnly) {
    await writeFile(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2));
    await writeFile(path.join(outDir, 'actions.json'), JSON.stringify(actions, null, 2));
  }
  if (seoOnly || summary.seo) {
    const seo = seoOnly ? summary : summary.seo;
    await writeFile(path.join(outDir, 'seo.json'), JSON.stringify(seo, null, 2));
    await writeFile(path.join(outDir, 'seo-actions.json'), JSON.stringify(seoOpportunities(seo, seoOnly ? null : summary), null, 2));
    await writeFile(path.join(outDir, 'seo-question-candidates.json'), JSON.stringify(seoQuestionCandidates(seo), null, 2));
  }
  if (crawlOnly || summary.crawls) await writeFile(path.join(outDir, 'crawls.json'), JSON.stringify(crawlOnly ? summary : summary.crawls, null, 2));
  if (gaOnly || summary.ga) await writeFile(path.join(outDir, 'ga.json'), JSON.stringify(gaOnly ? summary : summary.ga, null, 2));
  await writeFile(path.join(outDir, 'report.md'), renderMarkdown(summary, actions, { lang }));
  await writeFile(path.join(outDir, 'report.html'), renderHtml(summary, actions, { lang }));
}

// When a question set was declared up front, every record must carry exactly that text.
export function checkAgainstQuestions(records, questions) {
  const byId = new Map(questions.map((q) => [q.id, q.text]));
  const problems = [];
  for (const r of records) {
    if (!byId.has(r.questionId)) problems.push(`Record for unknown question id "${r.questionId}" (${r.engine} #${r.repeat}).`);
    else if (byId.get(r.questionId) !== r.question) problems.push(`Question text for "${r.questionId}" (${r.engine} #${r.repeat}) differs from the declared question set.`);
  }
  return problems;
}
