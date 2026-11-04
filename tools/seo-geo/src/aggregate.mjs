// Roll analyzed observations up into per-question and overall summaries.
//
// Everything is reported as a count over answers ("3/5"), never as a percentage:
// a handful of samples cannot support a rate, and the denominator must stay visible.

import { hostOf, uniq } from './util.mjs';

const REDDIT_HOSTS = new Set(['reddit.com', 'old.reddit.com', 'np.reddit.com', 'new.reddit.com']);

function subredditOf(url) {
  const host = hostOf(url);
  if (!host || !(REDDIT_HOSTS.has(host) || host.endsWith('.reddit.com'))) return null;
  const m = /\/r\/([A-Za-z0-9_]+)(?:\/|$)/.exec(new URL(url).pathname);
  return m ? m[1] : null;
}

function normalizeQuery(q) {
  return q.toLowerCase().replace(/\s+/g, ' ').trim();
}

// "Searched" means the provider ran at least one search. "Search evidence" is stricter: at least one real
// source or cited URL came back. A search that returned nothing is searched but not evidence, and an answer
// without evidence reflects what the model said from its own knowledge, not retrieved sources.
const hasSearched = (r) => r.analysis.callCount > 0;
const hasSearchEvidence = (r) => r.analysis.sourceUrlCount > 0 || r.analysis.citedUrlCount > 0;

function entityCounts(ok, config) {
  return config.entities.map((entity) => {
    let mentioned = 0;
    let ownedCited = 0;
    let mentionsTotal = 0;
    for (const r of ok) {
      const e = r.analysis.entities.find((x) => x.id === entity.id);
      if (!e) continue;
      if (e.mentioned) mentioned += 1;
      if (e.ownedCitedUrls.length) ownedCited += 1;
      mentionsTotal += e.mentions;
    }
    return { id: entity.id, name: entity.name, kind: entity.kind, mentioned, ownedCited, mentionsTotal };
  });
}

function engineRows(records, config) {
  const ids = uniq(records.map((r) => r.engine).filter(Boolean));
  return ids.map((id) => {
    const group = records.filter((r) => r.engine === id);
    const ok = group.filter((r) => r.analysis);
    return {
      id,
      label: group.find((r) => r.engineLabel)?.engineLabel ?? id,
      model: group.find((r) => r.model)?.model ?? null,
      // What the provider says it actually served; a different value than requested is worth knowing.
      served: uniq(ok.map((r) => r.response?.model).filter(Boolean)),
      n: ok.length,
      failed: group.length - ok.length,
      searched: ok.filter(hasSearched).length,
      grounded: ok.filter(hasSearchEvidence).length,
      // Asked to search (a search tool was in the request) but no search call came back.
      notExecuted: ok.filter((r) => r.searchRequested && r.analysis.callCount === 0).length,
      truncated: ok.filter((r) => r.analysis.truncated).length,
      entities: entityCounts(ok, config),
    };
  });
}

function summarizeGroup(records, config) {
  const ok = records.filter((r) => r.analysis);
  const failed = records.length - ok.length;
  const entities = entityCounts(ok, config);

  const domains = new Map();
  const queries = new Map();
  const subreddits = new Map();
  let verbatim = 0;
  const issued = [];
  for (const r of ok) {
    for (const d of r.analysis.domains) {
      const row = domains.get(d.domain) || { domain: d.domain, category: d.category, answersCited: 0, answersSourced: 0 };
      if (d.cited > 0) row.answersCited += 1;
      if (d.cited > 0 || d.sources > 0) row.answersSourced += 1;
      domains.set(d.domain, row);
    }
    // A query that repeats the whole question verbatim tells us nothing about how the model decomposed it.
    const asked = normalizeQuery(r.question ?? '');
    for (const x of r.analysis.queries) issued.push({ engine: r.engineLabel ?? r.engine, query: x.query, chars: x.chars, results: x.results, noResults: x.noResults, verbatim: normalizeQuery(x.query) === asked });
    for (const q of uniq(r.analysis.queries.map((x) => normalizeQuery(x.query)))) {
      if (q === asked) {
        verbatim += 1;
        continue;
      }
      queries.set(q, (queries.get(q) || 0) + 1);
    }
    const perAnswer = new Map();
    for (const url of uniq([...r.analysis.citedUrls, ...r.analysis.sourceUrls])) {
      const sub = subredditOf(url);
      if (!sub) continue;
      const set = perAnswer.get(sub) || new Set();
      set.add(url);
      perAnswer.set(sub, set);
    }
    for (const [sub, urls] of perAnswer) {
      const row = subreddits.get(sub) || { subreddit: sub, answers: 0, threads: new Set() };
      row.answers += 1;
      urls.forEach((u) => row.threads.add(u));
      subreddits.set(sub, row);
    }
  }

  return {
    n: ok.length,
    failed,
    engines: uniq(records.map((r) => r.engine).filter(Boolean)),
    searched: ok.filter(hasSearched).length,
    grounded: ok.filter(hasSearchEvidence).length,
    byEngine: engineRows(records, config),
    entities,
    domains: [...domains.values()].sort(
      (a, b) => b.answersCited - a.answersCited || b.answersSourced - a.answersSourced || a.domain.localeCompare(b.domain),
    ),
    queries: [...queries.entries()]
      .map(([query, answers]) => ({ query, answers }))
      .sort((a, b) => b.answers - a.answers || a.query.localeCompare(b.query)),
    subreddits: [...subreddits.values()]
      .map((s) => ({ subreddit: s.subreddit, answers: s.answers, threads: [...s.threads].sort() }))
      .sort((a, b) => b.answers - a.answers || a.subreddit.localeCompare(b.subreddit)),
    verbatimQueries: verbatim,
    issuedQueries: issued.slice(0, 20),
    warnings: uniq(ok.flatMap((r) => r.analysis.warnings)),
  };
}

// Same model family under a dated alias is not a mismatch; a different name is.
const sameModel = (requested, served) => requested === served || served.startsWith(requested) || requested.startsWith(served);

export function modelMismatches(rows) {
  const out = [];
  for (const r of rows) {
    const off = (r.served ?? []).filter((m) => r.model && !sameModel(r.model, m));
    if (off.length) out.push({ engine: r.id, label: r.label, requested: r.model, served: off });
  }
  return out;
}

export function aggregate(records, config, questions = []) {
  const byQuestion = {};
  // Only questions that were actually asked appear; a declared question with no records was not run.
  const asked = new Set(records.map((r) => r.questionId));
  const ids = uniq([...questions.map((q) => q.id).filter((id) => asked.has(id)), ...records.map((r) => r.questionId)]);
  for (const id of ids) {
    const group = records.filter((r) => r.questionId === id);
    const q = questions.find((x) => x.id === id);
    byQuestion[id] = {
      id,
      text: q?.text ?? group[0]?.question ?? id,
      group: q?.group ?? null,
      ...summarizeGroup(group, config),
    };
  }
  return {
    schema: 'beat-geo/summary@1',
    generatedAt: new Date().toISOString(),
    totalRecords: records.length,
    overall: summarizeGroup(records, config),
    modelMismatches: modelMismatches(engineRows(records, config)),
    questions: byQuestion,
  };
}
