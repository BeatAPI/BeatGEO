// Collection adapters.
//
//  - responses : POST {baseUrl}/responses with a web search tool. Works with any provider that
//                exposes an OpenAI Responses-compatible endpoint and returns search actions/citations.
//  - chat      : POST {baseUrl}/chat/completions, for providers that return top-level `citations`.
//  - messages  : POST {baseUrl}/messages (Anthropic-compatible) with a web search server tool.
//  - import    : read responses you already collected (see loadRecords in run.mjs).
//
// Rules: brand configuration is never part of the request; a failed request is recorded as a
// failure (never replaced by demo data); there is exactly one attempt per planned request.

import { redact } from './util.mjs';

const MAX_ERROR_CHARS = 300;

// A field-level description of what was sent, for diagnosing rejections. Field names and tool types
// only: no prompt text, no headers, no credentials.
export function summarizeRequest(path, body) {
  const parts = Object.keys(body).map((k) => {
    if (k === 'tools' && Array.isArray(body.tools)) return `tools[${body.tools.map((t) => t.type ?? t.name).join(',')}]`;
    if (k === 'include' && Array.isArray(body.include)) return `include[${body.include.join(',')}]`;
    if (['max_tokens', 'max_output_tokens', 'max_tool_calls'].includes(k)) return `${k}=${body[k]}`;
    return k;
  });
  return `POST /${path} fields: ${parts.join(', ')}`;
}

export async function collectOne({
  api = 'responses',
  baseUrl,
  apiKey,
  model,
  question,
  toolType,
  authStyle,
  anthropicVersion = '2023-06-01',
  maxOutputTokens,
  maxSearchCalls,
  sendSearchCap = true,
  includeSources = true,
  extraBody = {},
  fetchImpl = globalThis.fetch,
  timeoutMs = 120_000,
}) {
  const root = String(baseUrl).replace(/\/+$/, '');
  const isChat = api === 'chat';
  const isMessages = api === 'messages';
  const url = `${root}/${isChat ? 'chat/completions' : isMessages ? 'messages' : 'responses'}`;
  const tool = toolType ?? (isMessages ? 'web_search_20250305' : 'web_search');
  // Caps come after extraBody on purpose: a spending cap must not be overridable by accident.
  const body = isMessages
    ? {
        model,
        max_tokens: maxOutputTokens ?? 1500,
        messages: [{ role: 'user', content: question.text }],
        tools: [{ type: tool, name: 'web_search', ...(sendSearchCap && Number.isInteger(maxSearchCalls) ? { max_uses: maxSearchCalls } : {}) }],
        ...extraBody,
        ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
      }
    : isChat
    ? {
        model,
        messages: [{ role: 'user', content: question.text }],
        ...extraBody,
        ...(maxOutputTokens ? { max_tokens: maxOutputTokens } : {}),
      }
    : {
        model,
        input: question.text,
        tools: [{ type: tool }],
        ...(includeSources ? { include: ['web_search_call.action.sources'] } : {}),
        ...extraBody,
        ...(maxOutputTokens ? { max_output_tokens: maxOutputTokens } : {}),
        ...(sendSearchCap && Number.isInteger(maxSearchCalls) ? { max_tool_calls: maxSearchCalls } : {}),
      };

  const requestSummary = summarizeRequest(isChat ? 'chat/completions' : isMessages ? 'messages' : 'responses', body);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...((authStyle ?? (isMessages ? 'x-api-key' : 'bearer')) === 'x-api-key'
          ? { 'x-api-key': apiKey, 'anthropic-version': anthropicVersion }
          : { authorization: `Bearer ${apiKey}`, ...(isMessages ? { 'anthropic-version': anthropicVersion } : {}) }),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      return { ok: false, error: { status: res.status, message: redact(text, [apiKey]).slice(0, MAX_ERROR_CHARS), request: requestSummary } };
    }
    try {
      return { ok: true, response: JSON.parse(text) };
    } catch {
      return { ok: false, error: { status: res.status, message: 'Response body was not valid JSON.', request: requestSummary } };
    }
  } catch (err) {
    const message = err?.name === 'AbortError' ? `Timed out after ${timeoutMs} ms.` : String(err?.message || err);
    return { ok: false, error: { status: null, message: redact(message, [apiKey]).slice(0, MAX_ERROR_CHARS), request: requestSummary } };
  } finally {
    clearTimeout(timer);
  }
}
