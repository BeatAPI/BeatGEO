// Browser capture: answers copied from a consumer AI product (a chat UI), one file per answer.
//
// Only what the interface visibly returned is recorded. A field that was not visible stays
// empty; it is never reconstructed. The capture is converted into the same shape the API
// collectors produce, so parsing, analysis, aggregation and reports treat it identically.

export const CAPTURE_SCHEMA = 'beat-geo/capture@1';

const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+$/.test(u);

function urlList(list, field, problems) {
  if (list == null) return [];
  if (!Array.isArray(list)) {
    problems.push(`${field} must be an array of { url, title? }.`);
    return [];
  }
  const out = [];
  for (const [i, entry] of list.entries()) {
    const url = typeof entry === 'string' ? entry : entry?.url;
    if (!isHttpUrl(url)) problems.push(`${field}[${i}] is not an http(s) URL.`);
    else out.push({ url, title: typeof entry === 'object' ? entry.title ?? null : null });
  }
  return out;
}

export function validateCapture(c) {
  const problems = [];
  if (!c || typeof c !== 'object') return { problems: ['Capture is not an object.'] };
  for (const key of ['questionId', 'question', 'engine']) {
    if (typeof c[key] !== 'string' || !c[key].trim()) problems.push(`"${key}" is required.`);
  }
  if (!c.error && (typeof c.answer !== 'string' || !c.answer.trim())) problems.push('"answer" is required unless "error" is set.');
  if (c.error && (typeof c.error.message !== 'string' || !c.error.message.trim())) problems.push('"error.message" is required when "error" is set.');
  const queries = Array.isArray(c.searchQueries) ? c.searchQueries.filter((q) => typeof q === 'string' && q.trim()) : [];
  if (c.searchQueries != null && !Array.isArray(c.searchQueries)) problems.push('searchQueries must be an array of strings.');
  const sourceUrls = urlList(c.sourceUrls, 'sourceUrls', problems);
  const citedUrls = urlList(c.citedUrls, 'citedUrls', problems);
  return { problems, queries, sourceUrls, citedUrls };
}

export function captureToRecord(c, file = 'capture') {
  const { problems, queries, sourceUrls, citedUrls } = validateCapture(c);
  if (problems.length) throw new Error(`${file}: ${problems.join(' ')}`);
  const base = {
    schema: 'beat-geo/record@1',
    questionId: c.questionId,
    question: c.question,
    engine: c.engine,
    engineLabel: c.engineLabel ?? c.engine,
    model: c.model ?? null,
    repeat: Number.isInteger(c.repeat) ? c.repeat : 1,
    collectedAt: c.collectedAt ?? null,
    source: 'browser',
    conditions: c.conditions ?? null,
    conversationUrl: c.conversationUrl ?? null,
  };
  if (c.error) return { ...base, error: { status: null, message: c.error.message } };
  const output = [];
  if (queries.length || sourceUrls.length) {
    output.push({
      type: 'web_search_call',
      id: 'browser_search',
      status: 'completed',
      action: { type: 'search', queries, sources: sourceUrls },
    });
  }
  output.push({
    type: 'message',
    content: [{ type: 'output_text', text: c.answer, annotations: citedUrls.map((u) => ({ type: 'url_citation', url: u.url, title: u.title })) }],
  });
  return { ...base, response: { model: c.model ?? null, status: 'completed', output } };
}

export const CAPTURE_TEMPLATE = {
  schema: CAPTURE_SCHEMA,
  questionId: '<id from the question set>',
  question: '<the exact question text, copied unchanged>',
  engine: '<short id, e.g. chatgpt>',
  engineLabel: '<name as users know it>',
  model: '<model name shown in the interface, or null>',
  repeat: 1,
  collectedAt: '<ISO time>',
  conditions: {
    loggedIn: null,
    newConversation: true,
    temporaryChat: null,
    searchMode: '<on | off | auto | unknown>',
    region: null,
    notes: '',
  },
  conversationUrl: null,
  answer: '<the visible answer text, copied unchanged>',
  searchQueries: [],
  sourceUrls: [],
  citedUrls: [],
};
