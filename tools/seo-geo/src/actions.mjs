// Turn a summary into evidence-linked next steps.
//
// These are hypotheses to test, not conclusions. Each action carries the counts it
// was derived from, and none of them claims to know why a model chose a source.

const DEFAULT_MIN_SHARE = 0.4;
const LOW_SAMPLE = 3;

export function deriveActions(summary, { minShare = DEFAULT_MIN_SHARE, lowSample = LOW_SAMPLE } = {}) {
  const actions = [];

  for (const q of Object.values(summary.questions)) {
    if (q.n === 0) continue;
    const brand = q.entities.find((e) => e.kind === 'brand');
    const lowN = q.n < lowSample;
    const base = { questionId: q.id, question: q.text, n: q.n, lowSample: lowN };
    const threshold = Math.max(1, Math.ceil(q.n * minShare));

    const cited = q.domains.filter((d) => d.answersCited >= threshold);
    const external = cited.filter((d) => d.category !== 'brand-owned');

    if (brand && brand.mentioned === 0) {
      actions.push({
        ...base,
        type: 'absent',
        title: 'Brand not mentioned in any sampled answer',
        evidence: { brandMentioned: `${brand.mentioned}/${q.n}`, topCitedDomains: external.slice(0, 5).map((d) => `${d.domain} (${d.answersCited}/${q.n})`) },
        suggestion: 'Check whether the frequently cited domains are places the brand could legitimately appear (docs, comparisons, community threads, listings).',
      });
    }

    if (brand && brand.mentioned > 0 && brand.ownedCited === 0) {
      actions.push({
        ...base,
        type: 'mentioned-not-cited',
        title: 'Brand is mentioned, but none of its own pages were cited',
        evidence: { brandMentioned: `${brand.mentioned}/${q.n}`, ownedCited: `${brand.ownedCited}/${q.n}` },
        suggestion: 'Check whether an official page answers this question clearly enough to be cited.',
      });
    }

    for (const d of external.filter((x) => x.category === 'competitor-owned')) {
      actions.push({
        ...base,
        type: 'competitor-cited',
        title: `Competitor-owned domain cited: ${d.domain}`,
        evidence: { domain: d.domain, answersCited: `${d.answersCited}/${q.n}`, brandOwnedCited: brand ? `${brand.ownedCited}/${q.n}` : 'n/a' },
        suggestion: 'Compare what that page covers with the brand’s equivalent page.',
      });
    }

    for (const d of external.filter((x) => !['competitor-owned', 'reddit'].includes(x.category))) {
      actions.push({
        ...base,
        type: 'frequent-source',
        title: `Frequently cited source: ${d.domain}`,
        evidence: { domain: d.domain, category: d.category, answersCited: `${d.answersCited}/${q.n}` },
        suggestion: 'Review whether the brand is represented there and whether that is appropriate to change.',
      });
    }

    const seenEngines = q.byEngine.filter((e) => e.n > 0);
    const brandRows = brand ? seenEngines.map((e) => ({ id: e.label, m: e.entities.find((x) => x.id === brand.id)?.mentioned ?? 0, n: e.n })) : [];
    if (brandRows.length > 1 && brandRows.some((r) => r.m > 0) && brandRows.some((r) => r.m === 0)) {
      actions.push({
        ...base,
        type: 'engine-gap',
        title: 'Brand appears on some engines but not others',
        evidence: { perEngine: brandRows.map((r) => `${r.id}: ${r.m}/${r.n}`) },
        suggestion: 'Compare which sources each engine cites and whether each answer had search evidence; differences may come from retrieval, not from content quality.',
      });
    }

    for (const s of q.subreddits.slice(0, 5)) {
      actions.push({
        ...base,
        type: 'community-source',
        title: `Reddit community surfaced: r/${s.subreddit}`,
        evidence: { subreddit: s.subreddit, answers: `${s.answers}/${q.n}`, threads: s.threads.slice(0, 3) },
        suggestion: 'Read the community rules and the cited threads before deciding whether participation is appropriate.',
      });
    }

    const fanOut = q.queries.filter((x) => x.answers >= threshold).slice(0, 5);
    if (fanOut.length) {
      actions.push({
        ...base,
        type: 'fan-out-topic',
        title: 'Recurring sub-queries the model searched for',
        evidence: { queries: fanOut.map((x) => `${x.query} (${x.answers}/${q.n})`) },
        suggestion: 'Treat these as candidate content topics; check whether existing pages answer them.',
      });
    }
  }
  return actions;
}
