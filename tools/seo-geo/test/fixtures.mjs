// Synthetic Responses-shaped fixtures for tests. Not real provider output.

export function searchCall(id, { queries = [], sources = [], type = 'search' } = {}) {
  return { type: 'web_search_call', id, status: 'completed', action: { type, queries, sources } };
}

export function message(text, citedUrls = []) {
  return {
    type: 'message',
    content: [{ type: 'output_text', text, annotations: citedUrls.map((url) => ({ type: 'url_citation', url, title: url })) }],
  };
}

export function response(output, extra = {}) {
  return { id: 'resp_test', model: 'test-model', status: 'completed', output, ...extra };
}

export const CONFIG = {
  brand: { name: 'Acme', aliases: ['Acme Co'], domains: ['acme.example'] },
  competitors: [{ name: 'Zeta', domains: ['zeta.example'] }],
};

// Anthropic Messages-shaped fixture (synthetic).
export function anthropicMessage({ queries = [], results = [], text = '', cited = [], usage } = {}) {
  const content = [];
  queries.forEach((q, i) => {
    content.push({ type: 'server_tool_use', id: `srv_${i}`, name: 'web_search', input: { query: q } });
    content.push({
      type: 'web_search_tool_result',
      tool_use_id: `srv_${i}`,
      content: (results[i] ?? []).map((url) => ({ type: 'web_search_result', url, title: url })),
    });
  });
  content.push({ type: 'text', text, citations: cited.map((url) => ({ type: 'web_search_result_location', url, title: url, cited_text: '…' })) });
  return { id: 'msg_test', type: 'message', role: 'assistant', model: 'test-model', content, ...(usage ? { usage } : {}) };
}
