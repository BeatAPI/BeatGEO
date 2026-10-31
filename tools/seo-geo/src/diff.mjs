// Compare two summaries produced from the same question set.
//
// A difference in a small sample is not a trend. Every row keeps both denominators
// and is flagged when either side is under the low-sample threshold.

const LOW_SAMPLE = 5;

export function renderDiffMarkdown(diff) {
  const out = ['# Beat Geo diff', '', `Rows with fewer than ${diff.lowSampleThreshold} answers on either side are flagged **low sample**; a change there is not a trend.`, ''];
  for (const r of diff.rows) {
    if (r.status !== 'compared') {
      out.push(`## ${r.questionId}`, '', `Question ${r.status} between runs.`, '');
      continue;
    }
    out.push(`## ${r.questionId} — ${r.text}`, '', `Answers: base ${r.baseN}, head ${r.headN}${r.lowSample ? ' — **low sample**' : ''}`, '');
    if (r.entities.length) {
      out.push('| Name | Role | Mentioned (base → head) | Own page cited (base → head) |', '| --- | --- | --- | --- |');
      for (const e of r.entities) out.push(`| ${e.name} | ${e.kind} | ${e.base} → ${e.head} | ${e.baseOwnedCited} → ${e.headOwnedCited} |`);
      out.push('');
    }
    if (r.newCitedDomains.length) out.push(`- New cited domains: ${r.newCitedDomains.join(', ')}`);
    if (r.droppedCitedDomains.length) out.push(`- No longer cited: ${r.droppedCitedDomains.join(', ')}`);
    out.push('');
  }
  return out.join('\n');
}

export function diffSummaries(base, head, { lowSample = LOW_SAMPLE } = {}) {
  const rows = [];
  const ids = new Set([...Object.keys(base.questions), ...Object.keys(head.questions)]);
  for (const id of ids) {
    const a = base.questions[id];
    const b = head.questions[id];
    if (!a || !b) {
      rows.push({ questionId: id, status: a ? 'removed' : 'added' });
      continue;
    }
    const entities = b.entities.map((eb) => {
      const ea = a.entities.find((x) => x.id === eb.id);
      return {
        id: eb.id,
        name: eb.name,
        kind: eb.kind,
        base: ea ? `${ea.mentioned}/${a.n}` : 'n/a',
        head: `${eb.mentioned}/${b.n}`,
        baseOwnedCited: ea ? `${ea.ownedCited}/${a.n}` : 'n/a',
        headOwnedCited: `${eb.ownedCited}/${b.n}`,
      };
    });
    const baseDomains = new Set(a.domains.filter((d) => d.answersCited > 0).map((d) => d.domain));
    const headDomains = new Set(b.domains.filter((d) => d.answersCited > 0).map((d) => d.domain));
    rows.push({
      questionId: id,
      text: b.text,
      status: 'compared',
      baseN: a.n,
      headN: b.n,
      lowSample: a.n < lowSample || b.n < lowSample,
      entities,
      newCitedDomains: [...headDomains].filter((d) => !baseDomains.has(d)).sort(),
      droppedCitedDomains: [...baseDomains].filter((d) => !headDomains.has(d)).sort(),
    });
  }
  return { schema: 'beat-geo/diff@1', generatedAt: new Date().toISOString(), lowSampleThreshold: lowSample, rows };
}
