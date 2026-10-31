import { seoReportBlocks } from './seo-report.mjs';
// Report rendering. One document model, two renderers (Markdown, self-contained HTML).
// All dynamic text is escaped in HTML; imported answer text is never treated as markup.

import { escapeHtml } from './util.mjs';
import { crawlReportBlocks } from './crawl-report.mjs';
import { gaReportBlocks } from './ga-report.mjs';

const T = {
  en: {
    title: 'Beat Geo report',
    generated: 'Generated',
    records: 'Answers analyzed',
    failed: 'failed requests',
    dataSources: 'Data source',
    demoBanner: 'SYNTHETIC DEMO DATA. Brands, domains and threads are invented and describe nothing real.',
    guide: 'How to read this',
    guideBody:
      'Every figure is a count over sampled answers, written k/n. It is a snapshot of what one engine returned on the days sampled, not a visibility rate, search volume, or ranking. A mention is not a recommendation, and a source is not a citation.',
    overall: 'Overall',
    byEngine: 'By engine',
    engineCol: 'Engine',
    modelCol: 'Model',
    servedNote: 'The provider reported serving a different model than was requested',
    noEvidenceNote: 'ran searches but returned no source or cited URLs, so its mentions cannot be attributed to retrieval',
    issued: 'Search queries issued',
    charsCol: 'Chars',
    resultsCol: 'Results',
    notExecutedNote: 'was asked to search but ran no search in {k} of {n} answers (a search tool was in the request; those answers may come from model memory)',
    truncatedNote: 'had {k} of {n} answers cut off by the output cap; citations and mentions after the cut are lost',
    pricedAtRequested: 'Costs are priced at the requested model\'s rates, not at the rates of the model the provider reported serving.',
    sameAsQuestion: '(the question itself)',
    searched: 'Searched in',
    searchEvidence: 'Search evidence in',
    questionSet: 'Questions run',
    costAssumptions: 'Cost assumptions',
    capsCol: 'Caps: output tok / searches',
    searchTokCol: 'Search result tok assumed / search',
    rateSource: 'Source',
    rateNote: 'Note',
    perSearch: 'Per search (USD)',
    perInput: 'Input (USD/1M tokens)',
    perOutput: 'Output (USD/1M tokens)',
    recomputed: 'Re-priced from raw responses',
    spend: 'Estimated spend',
    spendNote: 'estimate from provider-reported usage and the rates you supplied; not a bill',
    warnOver: 'Estimated spend is OVER the budget.',
    warnOverruns: 'Requests that cost more than their worst-case estimate (the provider did not honor a cap)',
    engineCol2: 'Engine',
    questionCol: 'Question',
    actualCol: 'Estimated cost (USD)',
    worstCol: 'Worst-case (USD)',
    toolCallsCol: 'Tool calls / cap',
    spendStopped: 'stopped early: budget reached',
    cellLegend: 'Name cells read: mentioned · own page cited (answers, k/n).',
    entity: 'Name',
    kind: 'Role',
    mentioned: 'Mentioned in',
    ownedCited: 'Own page cited in',
    question: 'Question',
    samples: 'Answers',
    topDomains: 'Most cited domains',
    domain: 'Domain',
    category: 'Type',
    citedIn: 'Cited in',
    sourcedIn: 'Returned as source in',
    communities: 'Reddit communities surfaced',
    subreddit: 'Community',
    answers: 'Answers',
    fanOut: 'Recurring sub-queries',
    query: 'Query',
    nextSteps: 'Next steps to investigate',
    nextStepsNote: 'These are hypotheses derived from the counts shown with each item. They do not explain why a model chose a source.',
    lowSample: 'low sample',
    noData: 'No successful answers for this question.',
    warnings: 'Provider warnings',
    failuresTitle: 'Failed requests',
    method: 'Method and limits',
    methodItems: [
      'Only publicly returned search actions, source URLs and url_citation annotations are used. No hidden reasoning is inferred.',
      'Source URLs, cited URLs and citation occurrences are counted separately. Exact URLs are deduplicated, query strings included.',
      'Brand matching runs on answer prose with citation labels and link targets removed. Brand configuration is never sent to the model.',
      'Search evidence means at least one real source or cited URL came back. A search that ran but returned nothing is counted as searched, not as evidence. Answers without evidence reflect what the model said from its own knowledge, not retrieved sources.',
      'Missing fields mean "not returned", never an estimate.',
      'Results vary by engine, model, time, region and account personalization. Repeat sampling reduces noise but does not remove it.',
    ],
  },
  zh: {
    title: 'Beat Geo 报告',
    generated: '生成时间',
    records: '已分析回答数',
    failed: '次请求失败',
    dataSources: '数据来源',
    demoBanner: '合成演示数据：其中的品牌、域名和帖子均为虚构，不代表任何真实情况。',
    guide: '如何阅读',
    guideBody:
      '所有数字都是对已采样回答的计数，写作 k/n。它是某个引擎在采样当天返回内容的快照，不是可见率、搜索量或排名。“被提及”不等于“被推荐”，“来源”不等于“被引用”。',
    overall: '总览',
    byEngine: '按引擎',
    engineCol: '引擎',
    modelCol: '模型',
    servedNote: '服务商报告实际提供的模型与请求的模型不一致',
    noEvidenceNote: '运行了搜索但没有返回任何来源或引用链接，因此它的提及无法归因于检索',
    issued: '实际发出的搜索词',
    charsCol: '字符数',
    resultsCol: '结果数',
    notExecutedNote: '被要求搜索，但在 {n} 个回答中有 {k} 个没有运行任何搜索（请求里带了搜索工具；这些回答可能来自模型记忆）',
    truncatedNote: '有 {k} / {n} 个回答被输出上限截断，截断之后的引用和提及会丢失',
    pricedAtRequested: '费用按请求的模型计价，而不是按服务商报告实际提供的模型计价。',
    sameAsQuestion: '（就是问题原文）',
    searched: '运行了搜索的回答',
    searchEvidence: '含搜索证据的回答',
    questionSet: '已运行的问题',
    costAssumptions: '费用假设',
    capsCol: '上限：输出 token / 搜索次数',
    searchTokCol: '假设每次搜索结果 token',
    rateSource: '来源',
    rateNote: '说明',
    perSearch: '每次搜索（美元）',
    perInput: '输入（美元/百万 token）',
    perOutput: '输出（美元/百万 token）',
    recomputed: '按原始响应重新计价',
    spend: '估算花费',
    spendNote: '根据服务商返回的用量和你提供的单价估算，不是账单',
    warnOver: '估算花费超出了预算。',
    warnOverruns: '实际花费超出最坏估算的请求（服务商没有遵守上限）',
    engineCol2: '引擎',
    questionCol: '问题',
    actualCol: '估算花费（美元）',
    worstCol: '最坏估算（美元）',
    toolCallsCol: '工具调用 / 上限',
    spendStopped: '已提前停止：达到预算上限',
    cellLegend: '名称列的格式：被提及 · 自有页面被引用（回答数，k/n）。',
    entity: '名称',
    kind: '角色',
    mentioned: '被提及于',
    ownedCited: '自有页面被引用于',
    question: '问题',
    samples: '回答数',
    topDomains: '被引用最多的域名',
    domain: '域名',
    category: '类型',
    citedIn: '被引用于',
    sourcedIn: '作为来源返回于',
    communities: '出现的 Reddit 社区',
    subreddit: '社区',
    answers: '回答数',
    fanOut: '重复出现的子查询',
    query: '查询词',
    nextSteps: '值得进一步核查的方向',
    nextStepsNote: '这些是根据每项所附计数得出的假设，并不解释模型为什么选择某个来源。',
    lowSample: '样本少',
    noData: '该问题没有成功的回答。',
    warnings: '服务商提示',
    failuresTitle: '失败的请求',
    method: '方法与局限',
    methodItems: [
      '只使用服务商公开返回的搜索动作、来源 URL 和 url_citation 引用注释，不推断隐藏的推理过程。',
      '来源 URL、被引用 URL 和引用出现次数分别计数；完全相同的 URL（含查询串）只算一个。',
      '品牌匹配只在去掉引用标签和链接目标后的回答正文上进行；品牌配置不会发送给模型。',
      '“搜索证据”指至少返回了一个真实的来源或被引用的 URL。运行了搜索但没有返回结果，只算“运行了搜索”，不算证据。没有证据的回答反映的是模型自身知识，而不是检索到的来源。',
      '字段缺失就是“未返回”，不做估算。',
      '结果会随引擎、模型、时间、地区和账号个性化而变化；重复采样能降低噪声，但不能消除。',
    ],
  },
};

const ratio = (k, n) => `${k}/${n}`;
const KIND_ZH = { brand: '品牌', competitor: '竞品' };

// Rows are names and columns are engines, so the table stays readable with many brands and competitors.
function engineTable(rows, t, kind) {
  const names = rows[0]?.entities ?? [];
  return {
    t: 'table',
    head: [t.entity, t.kind, ...rows.map((r) => `${r.label}${r.model ? ` (${r.model})` : ''}`)],
    rows: [
      [t.samples, '', ...rows.map((r) => (r.failed ? `${r.n} (${r.failed} ${t.failed})` : String(r.n)))],
      [t.searched, '', ...rows.map((r) => ratio(r.searched, r.n))],
      [t.searchEvidence, '', ...rows.map((r) => ratio(r.grounded, r.n))],
      ...names.map((e, idx) => [e.name, kind(e.kind), ...rows.map((r) => `${ratio(r.entities[idx].mentioned, r.n)} · ${ratio(r.entities[idx].ownedCited, r.n)}`)]),
    ],
  };
}

function buildDoc(summary, actions, lang) {
  if (summary.schema === 'beat-geo/crawl-summary@1') return crawlReportBlocks(summary, lang, { standalone: true });
  if (summary.schema === 'beat-geo/seo-summary@1') return seoReportBlocks(summary, lang, { standalone: true });
  if (summary.schema === 'beat-geo/ga-summary@1') return gaReportBlocks(summary, lang, { standalone: true });
  const t = T[lang] || T.en;
  const kind = (k) => (lang === 'zh' ? KIND_ZH[k] ?? k : k);
  const blocks = [{ t: 'h1', text: summary.seo ? (lang === 'zh' ? 'BeatGEO · SEO & GEO 综合报告' : 'BeatGEO · SEO & GEO report') : t.title }];
  const isDemo = (summary.sources || []).includes('demo');
  if (isDemo) blocks.push({ t: 'note', text: t.demoBanner });

  const o = summary.overall;
  blocks.push({
    t: 'ul',
    items: [
      `${t.generated}: ${summary.generatedAt}`,
      `${t.records}: ${o.n}${o.failed ? ` (${o.failed} ${t.failed})` : ''}`,
      `${t.dataSources}: ${(summary.sources || []).join(', ') || 'n/a'}`,
      `${t.engineCol}: ${o.byEngine.map((e) => e.label).join(', ') || 'n/a'}`,
      `${t.searched}: ${ratio(o.searched, o.n)}`,
      `${t.searchEvidence}: ${ratio(o.grounded, o.n)}`,
      ...(summary.questionSet
        ? [`${t.questionSet}: ${summary.questionSet.run.length} / ${summary.questionSet.declared} (sha256 ${String(summary.questionSet.sha256).slice(0, 12)}…)`]
        : []),
      ...(summary.costRecomputed
        ? [`${t.recomputed}: $${summary.costRecomputed.totalUsd.toFixed(4)} (${summary.costRecomputed.note})`]
        : []),
      ...(summary.spend
        ? [`${t.spend}: $${summary.spend.estimatedSpentUsd.toFixed(4)} / $${summary.spend.budgetUsd} (${t.spendNote})${summary.spend.stoppedByBudget ? ` — ${t.spendStopped}, ${summary.spend.skipped} request(s) not sent` : ''}`]
        : []),
    ],
  });
  blocks.push({ t: 'h2', text: t.guide }, { t: 'p', text: t.guideBody });

  if (o.entities.length) {
    blocks.push({ t: 'h2', text: t.overall });
    blocks.push({
      t: 'table',
      head: [t.entity, t.kind, t.mentioned, t.ownedCited],
      rows: o.entities.map((e) => [e.name, kind(e.kind), ratio(e.mentioned, o.n), ratio(e.ownedCited, o.n)]),
    });
  }
  if (o.byEngine.length > 1) {
    blocks.push({ t: 'h2', text: t.byEngine }, { t: 'p', text: t.cellLegend }, engineTable(o.byEngine, t, kind));
  }
  for (const m of summary.modelMismatches ?? []) blocks.push({ t: 'note', text: `${t.servedNote}: ${m.label} — ${m.requested} → ${m.served.join(', ')}` });
  const fill = (tpl, k, n) => tpl.replace('{k}', k).replace('{n}', n);
  for (const e of o.byEngine) {
    if (e.notExecuted > 0) blocks.push({ t: 'note', text: `${e.label} ${fill(t.notExecutedNote, e.notExecuted, e.n)}.` });
    if (e.truncated > 0) blocks.push({ t: 'note', text: `${e.label} ${fill(t.truncatedNote, e.truncated, e.n)}.` });
  }
  for (const e of o.byEngine) if (e.searched > 0 && e.grounded === 0) blocks.push({ t: 'note', text: `${e.label} ${t.noEvidenceNote}.` });

  for (const q of Object.values(summary.questions)) {
    blocks.push({ t: 'h2', text: `${q.id} — ${q.text}` });
    blocks.push({ t: 'p', text: `${t.samples}: ${q.n}${q.failed ? ` (${q.failed} ${t.failed})` : ''}${q.n < 3 && q.n > 0 ? ` — ${t.lowSample}` : ''}` });
    if (q.n === 0) {
      blocks.push({ t: 'p', text: t.noData });
      continue;
    }
    if (q.entities.length) {
      blocks.push({
        t: 'table',
        head: [t.entity, t.kind, t.mentioned, t.ownedCited],
        rows: q.entities.map((e) => [e.name, kind(e.kind), ratio(e.mentioned, q.n), ratio(e.ownedCited, q.n)]),
      });
    }
    if (q.byEngine.length > 1) blocks.push({ t: 'h3', text: t.byEngine }, engineTable(q.byEngine, t, kind));
    if (q.domains.length) {
      blocks.push({ t: 'h3', text: t.topDomains });
      blocks.push({
        t: 'table',
        head: [t.domain, t.category, t.citedIn, t.sourcedIn],
        rows: q.domains.slice(0, 10).map((d) => [d.domain, d.category, ratio(d.answersCited, q.n), ratio(d.answersSourced, q.n)]),
      });
    }
    if (q.subreddits.length) {
      blocks.push({ t: 'h3', text: t.communities });
      blocks.push({ t: 'table', head: [t.subreddit, t.answers], rows: q.subreddits.slice(0, 8).map((s) => [`r/${s.subreddit}`, ratio(s.answers, q.n)]) });
    }
    if (q.queries.length) {
      blocks.push({ t: 'h3', text: t.fanOut });
      blocks.push({ t: 'table', head: [t.query, t.answers], rows: q.queries.slice(0, 8).map((x) => [x.query, ratio(x.answers, q.n)]) });
    }
    if (q.issuedQueries?.length) {
      blocks.push({ t: 'h3', text: t.issued });
      blocks.push({ t: 'table', head: [t.engineCol2, t.query, t.charsCol, t.resultsCol], rows: q.issuedQueries.map((x) => [x.engine, x.verbatim ? `${x.query.slice(0, 80)}… ${t.sameAsQuestion}` : x.query, x.chars, x.noResults ? '0 (no results)' : x.results]) });
    }
    if (q.warnings.length) blocks.push({ t: 'p', text: `${t.warnings}: ${q.warnings.join(' ')}` });
  }

  if (actions.length) {
    blocks.push({ t: 'h2', text: t.nextSteps }, { t: 'p', text: t.nextStepsNote });
    for (const a of actions) {
      const ev = Object.entries(a.evidence)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('; ') : v}`)
        .join(' | ');
      blocks.push({ t: 'ul', items: [`[${a.questionId}] ${a.title}${a.lowSample ? ` (${t.lowSample})` : ''} — ${ev}. ${a.suggestion}`] });
    }
  }

  if (summary.failures?.length) {
    blocks.push({ t: 'h2', text: t.failuresTitle });
    blocks.push({ t: 'ul', items: summary.failures.map((f) => `[${f.questionId} @ ${f.engineLabel ?? f.engine ?? 'n/a'} #${f.repeat}] status ${f.status ?? 'n/a'}: ${f.message}${f.request ? ` — ${f.request}` : ''}`) });
  }

  if (summary.spend?.overBudget) blocks.push({ t: 'note', text: `${t.warnOver} ${summary.spend.estimatedSpentUsd.toFixed(4)} > ${summary.spend.budgetUsd}` });
  if (summary.spend?.overruns?.length) {
    blocks.push({ t: 'h2', text: t.warnOverruns });
    blocks.push({
      t: 'table',
      head: [t.engineCol2, t.questionCol, t.actualCol, t.worstCol, t.toolCallsCol],
      rows: summary.spend.overruns.map((o) => [o.engine, o.questionId, o.actualUsd.toFixed(4), o.worstCaseUsd.toFixed(4), `${o.toolCalls ?? 'n/a'} / ${o.maxSearchCalls}`]),
    });
  }
  if (summary.spend?.rates?.length) {
    blocks.push({ t: 'h2', text: t.costAssumptions });
    if (summary.modelMismatches?.length) blocks.push({ t: 'p', text: t.pricedAtRequested });
    blocks.push({
      t: 'table',
      head: [t.engineCol, t.modelCol, t.perInput, t.perOutput, t.perSearch, t.capsCol, t.searchTokCol, t.rateSource, t.rateNote],
      rows: summary.spend.rates.map((r) => [r.id, r.model, r.inputPerMTok, r.outputPerMTok, r.perSearchCall, `${r.maxOutputTokens} / ${r.maxSearchCalls}`, r.searchResultTokens, r.source ?? 'n/a', r.note ?? '']),
    });
  }
  if (summary.seo) blocks.push(...seoReportBlocks(summary.seo, lang, { geo: summary }));
  if (summary.ga) blocks.push(...gaReportBlocks(summary.ga, lang));
  if (summary.crawls) blocks.push(...crawlReportBlocks(summary.crawls, lang));
  blocks.push({ t: 'h2', text: t.method }, { t: 'ul', items: t.methodItems });
  return blocks;
}

const mdCell = (s) => String(s ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|')
  .replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(\[|\]|`|\*|_)/g, '\\$1').replace(/\r?\n/g, ' ');

export function renderMarkdown(summary, actions, { lang = 'en' } = {}) {
  const out = [];
  const render = blocks => { for (const b of blocks) {
    if (b.t === 'h1') out.push(`# ${b.text}`, '');
    else if (b.t === 'h2') out.push(`## ${b.text}`, '');
    else if (b.t === 'h3') out.push(`### ${b.text}`, '');
    else if (b.t === 'p') out.push(b.text, '');
    else if (b.t === 'note') out.push(`> **${b.text}**`, '');
    else if (b.t === 'ul') out.push(...b.items.map((i) => `- ${i}`), '');
    else if (b.t === 'metrics' || b.t === 'meta') out.push(...b.items.map(item => `- ${mdCell(item.label)}: ${mdCell(item.value)}`), '');
    else if (b.t === 'details') {
      out.push(`${'#'.repeat(b.level ?? 3)} ${b.title}`, '');
      render(b.blocks);
    }
    else if (b.t === 'bars') {
      out.push(`**${mdCell(b.label)}**`, '', '| Month | Value |', '| --- | --- |', ...b.points.map(p => `| ${mdCell(p.label)} | ${mdCell(p.value)} |`), '');
    }
    else if (b.t === 'table') {
      out.push(`| ${b.head.map(mdCell).join(' | ')} |`, `| ${b.head.map(() => '---').join(' | ')} |`);
      out.push(...b.rows.map((r) => `| ${r.map(mdCell).join(' | ')} |`), '');
    }
  } };
  render(buildDoc(summary, actions, lang));
  return out.join('\n');
}

const CSS = `
:root{--bg:#fbfaf8;--fg:#1c1c1a;--muted:#6b6b66;--line:#e4e2dc;--accent:#5f7f6a;--note:#fff3d6}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#eceae4;--muted:#a09e96;--line:#2e2e2b;--accent:#8fb29a;--note:#3a3220}}
body{box-sizing:border-box;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,-apple-system,Segoe UI,sans-serif;max-width:952px;margin:0 auto;padding:24px 16px;overflow-wrap:anywhere}
h1{font-size:24px}h2{font-size:18px;margin-top:32px;border-top:1px solid var(--line);padding-top:16px}h3{font-size:15px;color:var(--accent)}
table{border-collapse:collapse;width:100%;margin:8px 0 16px;font-size:14px}th,td{border:1px solid var(--line);padding:6px 10px;text-align:left;vertical-align:top}
th{color:var(--muted);font-weight:600}.note{background:var(--note);border:1px solid var(--line);border-radius:8px;padding:10px 14px;font-weight:600}
ul{padding-left:20px}p{margin:8px 0}
main{min-width:0}
.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:20px 0;padding:18px 0;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.metrics dt{color:var(--muted);font-size:13px}.metrics dd{margin:4px 0 0;font-size:28px;line-height:1.2;font-weight:600;font-variant-numeric:tabular-nums}
.report-meta{display:grid;grid-template-columns:160px minmax(0,1fr);gap:6px 16px;margin:16px 0;font-size:14px}
.report-meta dt{color:var(--muted)}.report-meta dd{margin:0;min-width:0;overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.table-scroll{max-width:100%;overflow-x:auto;margin:8px 0 16px;overscroll-behavior-x:contain}
.table-scroll table{margin:0}.table-wide{min-width:680px}td{overflow-wrap:anywhere;font-variant-numeric:tabular-nums}
.report-details{margin:12px 0;padding:12px 0;border-top:1px solid var(--line)}
summary{cursor:pointer;font-size:14px;font-weight:600;color:var(--accent);overflow-wrap:anywhere}
summary:hover{text-decoration:underline}summary:focus-visible,.table-scroll:focus-visible{outline:2px solid var(--accent);outline-offset:4px}
.report-details[open]>summary{margin-bottom:12px}.table-more{margin:12px 0}.table-more[open]>summary{margin-bottom:8px}
@media(max-width:600px){body{padding:20px 16px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}.metrics dd{font-size:26px}.report-meta{grid-template-columns:1fr;gap:2px}.report-meta dd{margin-bottom:8px}h1{font-size:22px}th,td{padding:7px 9px}}
@media print{body{max-width:none;color:#111;background:#fff}.table-scroll{overflow:visible}.table-wide{min-width:0}summary{color:inherit}}
`;

export function renderHtml(summary, actions, { lang = 'en' } = {}) {
  const blocks = buildDoc(summary, actions, lang);
  const renderTable = (b, rows) => {
    const label = b.label ?? b.head.join(' / ');
    return `<div class="table-scroll" role="region" aria-label="${escapeHtml(label)}" tabindex="0"><table${b.head.length >= 5 ? ' class="table-wide"' : ''}><thead><tr>${b.head.map(h => `<th scope="col">${escapeHtml(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(r => `<tr>${r.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const render = items => { const body = []; for (const b of items) {
    if (b.t === 'h1') body.push(`<h1>${escapeHtml(b.text)}</h1>`);
    else if (b.t === 'h2') body.push(`<h2>${escapeHtml(b.text)}</h2>`);
    else if (b.t === 'h3') body.push(`<h3>${escapeHtml(b.text)}</h3>`);
    else if (b.t === 'p') body.push(`<p>${escapeHtml(b.text)}</p>`);
    else if (b.t === 'note') body.push(`<p class="note">${escapeHtml(b.text)}</p>`);
    else if (b.t === 'ul') body.push(`<ul>${b.items.map((i) => `<li>${escapeHtml(i)}</li>`).join('')}</ul>`);
    else if (b.t === 'metrics' || b.t === 'meta') body.push(`<dl class="${b.t === 'metrics' ? 'metrics' : 'report-meta'}">${b.items.map(item => b.t === 'metrics'
      ? `<div><dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd></div>`
      : `<dt>${escapeHtml(item.label)}</dt><dd>${escapeHtml(item.value)}</dd>`).join('')}</dl>`);
    else if (b.t === 'details') body.push(`<details class="report-details"><summary>${escapeHtml(b.title)}</summary>${render(b.blocks)}</details>`);
    else if (b.t === 'bars' && b.points.length) {
      const points=b.points.filter(p=>typeof p.value==='number' && Number.isFinite(p.value) && p.value>=0), max=b.max??Math.max(1,...points.map(p=>p.value));
      const step=680/Math.max(1,points.length), width=Math.min(36,step*.6);
      body.push(`<figure style="margin:16px 0"><figcaption>${escapeHtml(b.label)}</figcaption><svg viewBox="0 0 720 210" role="img" aria-label="${escapeHtml(b.label)}" style="width:100%;max-height:260px"><line x1="20" y1="170" x2="700" y2="170" stroke="currentColor" opacity=".25"/>${points.map((p,i)=>{const h=Math.min(130,p.value/max*130),x=20+step*(i+.5);return `<g><title>${escapeHtml(p.label)}: ${p.value}</title><rect x="${x-width/2}" y="${170-h}" width="${width}" height="${h}" fill="var(--accent)"/><text x="${x}" y="${160-h}" text-anchor="middle" font-size="11" fill="currentColor">${p.value}</text><text x="${x}" y="190" text-anchor="middle" font-size="10" fill="currentColor">${escapeHtml(p.label)}</text></g>`;}).join('')}</svg></figure>`);
    }
    else if (b.t === 'table') {
      const preview = b.previewRows ?? b.rows.length;
      body.push(renderTable(b, b.rows.slice(0, preview)));
      if (b.rows.length > preview) body.push(`<details class="table-more"><summary>${escapeHtml(b.moreLabel)}</summary>${renderTable(b, b.rows.slice(preview))}</details>`);
    }
  } return body.join('\n'); };
  const title = escapeHtml(['beat-geo/crawl-summary@1', 'beat-geo/ga-summary@1', 'beat-geo/seo-summary@1'].includes(summary.schema)
    ? `${blocks.find(b => b.t === 'h1').text} · Beat Geo` : blocks.find(b => b.t === 'h1').text);
  return `<!doctype html><html lang="${lang === 'zh' ? 'zh' : 'en'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${CSS}</style></head><body><main>${render(blocks)}</main></body></html>`;
}
