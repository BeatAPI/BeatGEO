// Deterministic analysis of one parsed observation.
//
// Counting rules (see references/evidence-rules.md):
//  - source URL  : returned by a search call
//  - cited URL   : appears in at least one url_citation
//  - citation    : one url_citation occurrence
// These are three different numbers and never substitute for each other.

import { escapeRegExp, hostMatches, hostOf, uniq } from './util.mjs';

const EXCERPT_RADIUS = 70;
const MAX_EXCERPTS = 3;

// Remove things that look like brands but are not prose: citation labels and link targets.
export function cleanAnswerForMentions(text, knownUrls) {
  let out = String(text || '');
  // "([site.com](https://...))" — the usual inline citation form.
  out = out.replace(/\(\s*\[[^\]]*\]\([^)]*\)\s*\)/g, ' ');
  // Remaining markdown links: drop the label when the target is a URL the response cited or sourced.
  out = out.replace(/\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_m, label, url) => (knownUrls.has(url) ? ' ' : label));
  // Bare URLs are destinations, not mentions.
  out = out.replace(/https?:\/\/[^\s)]+/g, ' ');
  return out;
}

// Word boundaries consider Latin letters and digits only, so a brand written directly
// next to CJK text ("推荐Acme和…") still matches while "Acmes" does not.
function mentionRegex(name, caseSensitive = false) {
  return new RegExp(`(?<![\\p{Script=Latin}\\p{N}])${escapeRegExp(name)}(?![\\p{Script=Latin}\\p{N}])`, caseSensitive ? 'gu' : 'giu');
}

// Overlapping matches (an alias that contains the main name, such as "Acme" and "Acme Co")
// describe one mention, so keep only the longest match at each position.
function findMentions(text, names, caseSensitive = false) {
  const all = [];
  for (const name of names) {
    const re = mentionRegex(name, caseSensitive);
    let m;
    while ((m = re.exec(text)) !== null) {
      all.push({ name, index: m.index, end: m.index + m[0].length });
      if (m[0].length === 0) re.lastIndex += 1;
    }
  }
  all.sort((a, b) => a.index - b.index || b.end - a.end);
  const hits = [];
  let lastEnd = -1;
  for (const h of all) {
    if (h.index >= lastEnd) {
      hits.push(h);
      lastEnd = h.end;
    }
  }
  return hits;
}

function excerptAt(text, index, length) {
  const start = Math.max(0, index - EXCERPT_RADIUS);
  const end = Math.min(text.length, index + length + EXCERPT_RADIUS);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

export function categorizeDomain(domain, config) {
  for (const e of config.entities) {
    if (e.domains.some((d) => hostMatches(domain, d))) return e.kind === 'brand' ? 'brand-owned' : 'competitor-owned';
  }
  for (const [category, domains] of Object.entries(config.categories)) {
    if (domains.some((d) => hostMatches(domain, d))) return category;
  }
  return 'other';
}

export function analyzeObservation(parsed, config) {
  const sourceUrls = parsed.sources.map((s) => s.url);
  const citedUrls = uniq(parsed.citations.map((c) => c.url));
  const known = new Set([...sourceUrls, ...citedUrls]);

  const queries = [];
  for (const call of parsed.calls) {
    for (const query of call.queries) queries.push({ callId: call.id, query, chars: query.length, results: call.sources.length, noResults: Boolean(call.noResults) });
  }

  const domains = new Map();
  const bump = (url, field) => {
    const host = hostOf(url);
    if (!host) return;
    const row = domains.get(host) || { domain: host, sources: 0, cited: 0 };
    row[field] += 1;
    domains.set(host, row);
  };
  sourceUrls.forEach((u) => bump(u, 'sources'));
  citedUrls.forEach((u) => bump(u, 'cited'));

  const cleaned = cleanAnswerForMentions(parsed.answerText, known);
  const entities = config.entities.map((entity) => {
    const hits = findMentions(cleaned, entity.names, entity.caseSensitive);
    const ownedCited = citedUrls.filter((u) => entity.domains.some((d) => hostMatches(hostOf(u), d)));
    const ownedSources = sourceUrls.filter((u) => entity.domains.some((d) => hostMatches(hostOf(u), d)));
    return {
      id: entity.id,
      name: entity.name,
      kind: entity.kind,
      mentions: hits.length,
      mentioned: hits.length > 0,
      excerpts: hits.slice(0, MAX_EXCERPTS).map((h) => excerptAt(cleaned, h.index, h.name.length)),
      ownedCitedUrls: ownedCited,
      ownedSourceUrls: ownedSources,
    };
  });

  return {
    provenance: parsed.provenance,
    warnings: parsed.warnings,
    callCount: parsed.calls.filter((c) => c.isSearch).length,
    toolCallCount: parsed.calls.length,
    noResultSearches: parsed.calls.filter((c) => c.noResults).length,
    queries,
    sourceUrlCount: sourceUrls.length,
    citedUrlCount: citedUrls.length,
    citationOccurrences: parsed.citations.length,
    citedUrls,
    sourceUrls,
    domains: [...domains.values()].map((row) => ({ ...row, category: categorizeDomain(row.domain, config) })),
    entities,
    answerLength: parsed.answerText.length,
    truncated: parsed.truncated,
  };
}
