// Spend control for live collection.
//
// This is an ESTIMATE, not a bill. It has two guards:
//   1. Pre-flight: the worst case of the whole plan must fit the budget, or nothing is sent.
//      Worst case per request = estimated input tokens + max output tokens + max search calls,
//      priced with the rates you supplied for that engine.
//   2. Runtime: each request reserves its worst case before it is sent; after it returns, the
//      reservation is replaced by cost computed from provider-reported usage. If the provider
//      returns no usage, the worst case is charged. Timeouts and network errors are charged at
//      worst case too (the provider may have billed them); HTTP error responses are charged zero.
// Providers can ignore max-token or tool-call caps. Keep a spending limit on the provider side
// as the real backstop.

import { parseResponse } from './parse.mjs';

export const DEFAULT_MAX_OUTPUT_TOKENS = 1500;
export const DEFAULT_MAX_SEARCH_CALLS = 3;
// Text a search call injects into the context. It is billed as input, and every later round
// re-reads it, so it usually dominates input cost. An assumption; tune it per engine.
export const DEFAULT_SEARCH_RESULT_TOKENS = 6000;

const OVERHEAD_TOKENS = 50;

// Deliberately pessimistic: 3 characters per token overstates English and is safer for CJK.
export const estimateInputTokens = (text) => Math.ceil(String(text ?? '').length / 3) + OVERHEAD_TOKENS;

const M = 1_000_000;

export function isPriced(engine) {
  const p = engine.pricing;
  return Boolean(p) && [p.inputPerMTok, p.outputPerMTok, p.perSearchCall].every((x) => Number.isFinite(x) && x >= 0);
}

// Worst-case input tokens: with S searches there are S+1 rounds; each round re-sends the question,
// and search result i (R tokens) is re-read by every round after it, so the total is
// (S+1)*question + R*S*(S+1)/2.
export function worstCaseInputTokens(engine, question) {
  const base = estimateInputTokens(question.text);
  const S = engine.maxSearchCalls;
  const R = engine.searchResultTokens;
  return { base, rounds: S + 1, total: (S + 1) * base + (R * S * (S + 1)) / 2 };
}

export function worstCaseUsd(engine, question) {
  if (!isPriced(engine)) return null;
  const p = engine.pricing;
  return (worstCaseInputTokens(engine, question).total * p.inputPerMTok) / M + (engine.maxOutputTokens * p.outputPerMTok) / M + engine.maxSearchCalls * p.perSearchCall;
}

// Itemized worst case for one request, so a user can see which knob drives the number.
export function breakdown(engine, question) {
  if (!isPriced(engine)) return null;
  const p = engine.pricing;
  const input = worstCaseInputTokens(engine, question);
  const inputUsd = (input.total * p.inputPerMTok) / M;
  const outputUsd = (engine.maxOutputTokens * p.outputPerMTok) / M;
  const searchUsd = engine.maxSearchCalls * p.perSearchCall;
  return {
    inputTokens: input.total,
    questionTokens: input.base,
    rounds: input.rounds,
    searchResultTokens: engine.searchResultTokens,
    outputCap: engine.maxOutputTokens,
    searchCalls: engine.maxSearchCalls,
    inputUsd,
    outputUsd,
    searchUsd,
    totalUsd: inputUsd + outputUsd + searchUsd,
  };
}

// What the provider reported using. Input tokens can arrive in two conventions:
//  - OpenAI / xAI style: input_tokens INCLUDES cached tokens (input_tokens_details.cached_tokens)
//  - Anthropic style:    input_tokens EXCLUDES cache reads / writes (cache_read_input_tokens, cache_creation_input_tokens)
// Tool calls are the largest of: every search/open/find call in the response and any count the provider reports.
export function usageSummary(response) {
  const u = response?.usage;
  const input = u?.input_tokens ?? u?.prompt_tokens;
  const output = u?.output_tokens ?? u?.completion_tokens;
  if (!Number.isFinite(input) || !Number.isFinite(output)) return null;
  const includedCached = Math.min(input, u?.input_tokens_details?.cached_tokens ?? u?.prompt_tokens_details?.cached_tokens ?? 0);
  const cacheRead = Number.isFinite(u?.cache_read_input_tokens) ? u.cache_read_input_tokens : 0;
  const cacheWrite = Number.isFinite(u?.cache_creation_input_tokens) ? u.cache_creation_input_tokens : 0;
  const reported = [u?.server_tool_use?.web_search_requests, u?.num_server_side_tools_used, u?.server_side_tool_usage_details?.web_search_calls].filter(Number.isFinite);
  const toolCalls = Math.max(parseResponse(response).calls.length, ...reported, 0);
  return {
    freshInputTokens: input - includedCached + cacheWrite,
    cachedInputTokens: includedCached + cacheRead,
    outputTokens: output,
    toolCalls,
  };
}

// Cost from what the provider reported, or null when it did not report usage. Cached tokens are billed at
// pricing.cachedInputPerMTok when the engine has one, otherwise at the full input rate (never cheaper).
export function actualUsd(engine, response) {
  if (!isPriced(engine) || !response || typeof response !== 'object') return null;
  const use = usageSummary(response);
  if (!use) return null;
  const p = engine.pricing;
  const cachedRate = Number.isFinite(p.cachedInputPerMTok) ? p.cachedInputPerMTok : p.inputPerMTok;
  // Chat-style responses do not itemize search calls, so assume the cap was used.
  const calls = engine.api === 'chat' ? Math.max(use.toolCalls, engine.maxSearchCalls) : use.toolCalls;
  return (use.freshInputTokens * p.inputPerMTok) / M + (use.cachedInputTokens * cachedRate) / M + (use.outputTokens * p.outputPerMTok) / M + calls * p.perSearchCall;
}

export class Budget {
  constructor(limitUsd) {
    this.limit = limitUsd;
    this.spent = 0;
    this.reserved = 0;
  }

  canReserve(amount) {
    return this.spent + this.reserved + amount <= this.limit + 1e-9;
  }

  reserve(amount) {
    this.reserved += amount;
  }

  settle(reservedAmount, actual) {
    this.reserved -= reservedAmount;
    this.spent += actual;
  }
}
