// Turn a raw provider response into a normalized observation.
//
// Evidence rule: we only report what the provider publicly returned. A field
// that is absent stays null / empty; it is never estimated or reconstructed.

import { uniq } from './util.mjs';

const NO_RESULTS = 'A web search ran but returned no results.';

// Only real http(s) URLs count. Providers sometimes return a placeholder result with an empty URL
// (for example title "No results"); that is the absence of a result, not a source.
const isHttpUrl = (u) => typeof u === 'string' && /^https?:\/\/\S+$/.test(u);

function asUrlObject(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') return isHttpUrl(entry) ? { url: entry, title: null } : null;
  if (typeof entry === 'object' && isHttpUrl(entry.url)) return { url: entry.url, title: entry.title ?? null };
  return null;
}

function parseSearchCall(item, index) {
  const action = item.action && typeof item.action === 'object' ? item.action : {};
  const queries = uniq(
    [
      ...(typeof action.query === 'string' ? [action.query] : []),
      ...(Array.isArray(action.queries) ? action.queries.filter((q) => typeof q === 'string') : []),
    ].map((q) => q.trim()).filter(Boolean),
  );
  const sources = (Array.isArray(action.sources) ? action.sources : [])
    .map(asUrlObject)
    .filter(Boolean);
  const isSearch = action.type === 'search' || queries.length > 0;
  return {
    id: item.id ?? `call_${index}`,
    status: item.status ?? null,
    actionType: action.type ?? null,
    isSearch,
    queries,
    sources,
    // open_page / find_in_page: pages the model read. Reported separately, never counted as sources.
    openedUrl: !isSearch && typeof action.url === 'string' ? action.url : null,
  };
}

function collectMessageParts(item, out) {
  const parts = Array.isArray(item.content) ? item.content : [];
  for (const part of parts) {
    if (part?.type !== 'output_text' || typeof part.text !== 'string') continue;
    out.texts.push(part.text);
    for (const ann of Array.isArray(part.annotations) ? part.annotations : []) {
      if (ann?.type === 'url_citation' && isHttpUrl(ann.url)) {
        out.citations.push({ url: ann.url, title: ann.title ?? null });
      }
    }
  }
}

// Anthropic Messages shape: content[] blocks. A search is a `server_tool_use` block whose
// results arrive in a later `web_search_tool_result` block with the same id; text blocks
// carry `citations` of type web_search_result_location.
function parseMessages(response, result, acc) {
  const calls = new Map();
  const blocks = response.content;
  for (const [index, block] of blocks.entries()) {
    if (block?.type === 'server_tool_use' && /search/.test(String(block.name ?? ''))) {
      const call = {
        id: block.id ?? `call_${index}`,
        status: 'completed',
        actionType: 'search',
        isSearch: true,
        queries: typeof block.input?.query === 'string' && block.input.query.trim() ? [block.input.query.trim()] : [],
        sources: [],
        openedUrl: null,
      };
      calls.set(call.id, call);
      result.calls.push(call);
    }
  }
  for (const block of blocks) {
    if (block?.type === 'web_search_tool_result') {
      const call = calls.get(block.tool_use_id);
      if (Array.isArray(block.content)) {
        for (const item of block.content) {
          const u = item?.type === 'web_search_result' ? asUrlObject(item) : null;
          if (u && call) call.sources.push(u);
        }
        if (call && !call.sources.length) {
          call.noResults = true;
          if (!result.warnings.includes(NO_RESULTS)) result.warnings.push(NO_RESULTS);
        }
      } else if (block.content?.error_code) {
        result.warnings.push(`A web search returned an error: ${block.content.error_code}.`);
        if (call) call.status = 'failed';
      }
    } else if (block?.type === 'text' && typeof block.text === 'string') {
      acc.texts.push(block.text);
      for (const c of Array.isArray(block.citations) ? block.citations : []) {
        if (isHttpUrl(c?.url)) acc.citations.push({ url: c.url, title: c.title ?? null });
      }
    }
  }
}

export function parseResponse(response) {
  const result = {
    status: response?.status ?? null,
    model: response?.model ?? null,
    provenance: 'none',
    calls: [],
    sources: [], // deduplicated by exact URL, query string included
    citations: [], // every citation occurrence
    answerText: '',
    truncated: false,
    warnings: [],
  };
  if (!response || typeof response !== 'object') {
    result.warnings.push('Response is not an object.');
    return result;
  }

  const acc = { texts: [], citations: [] };

  if (Array.isArray(response.content) && response.type === 'message') {
    result.provenance = 'anthropic_messages';
    parseMessages(response, result, acc);
  } else if (Array.isArray(response.output)) {
    result.provenance = 'responses_output';
    response.output.forEach((item, index) => {
      if (item?.type === 'web_search_call') result.calls.push(parseSearchCall(item, index));
      else if (item?.type === 'message') collectMessageParts(item, acc);
    });
    if (!acc.texts.length && typeof response.output_text === 'string') acc.texts.push(response.output_text);
  } else if (Array.isArray(response.choices)) {
    // Chat Completions shape (search-enabled variants).
    result.provenance = 'chat_completions';
    const message = response.choices[0]?.message ?? {};
    if (typeof message.content === 'string') acc.texts.push(message.content);
    for (const ann of Array.isArray(message.annotations) ? message.annotations : []) {
      const c = ann?.url_citation ?? (ann?.type === 'url_citation' ? ann : null);
      if (c && isHttpUrl(c.url)) acc.citations.push({ url: c.url, title: c.title ?? null });
    }
    if (!acc.citations.length && Array.isArray(response.citations)) {
      for (const entry of response.citations) {
        const c = asUrlObject(entry);
        if (c) acc.citations.push(c);
      }
    }
    result.warnings.push('No per-call search actions were returned by this response shape.');
  } else if (Array.isArray(response.citations)) {
    result.provenance = 'top_level_citations';
    if (typeof response.output_text === 'string') acc.texts.push(response.output_text);
    for (const entry of response.citations) {
      const c = asUrlObject(entry);
      if (c) acc.citations.push(c);
    }
    result.warnings.push('No per-call search actions were returned by this response shape.');
  } else {
    result.warnings.push('Unrecognized response shape; nothing could be extracted.');
  }

  // An answer cut off by the output cap can lose its later citations and mentions.
  result.truncated =
    response.stop_reason === 'max_tokens' ||
    response.status === 'incomplete' ||
    (Array.isArray(response.choices) && response.choices[0]?.finish_reason === 'length');
  result.answerText = acc.texts.join('\n\n');
  result.citations = acc.citations;

  // Sources: exact-URL dedupe, remembering which calls returned each.
  const seen = new Map();
  for (const call of result.calls) {
    for (const s of call.sources) {
      const existing = seen.get(s.url);
      if (existing) {
        if (!existing.callIds.includes(call.id)) existing.callIds.push(call.id);
        if (!existing.title && s.title) existing.title = s.title;
      } else {
        seen.set(s.url, { url: s.url, title: s.title, callIds: [call.id] });
      }
    }
  }
  result.sources = [...seen.values()];

  if (['responses_output', 'anthropic_messages'].includes(result.provenance) && !result.calls.some((c) => c.isSearch)) {
    result.warnings.push('The response contained no web search calls; the answer may not be grounded in search.');
  }
  return result;
}
