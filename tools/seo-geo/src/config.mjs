// Brand / competitor configuration and question-set loading + validation.

import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_MAX_SEARCH_CALLS, DEFAULT_SEARCH_RESULT_TOKENS } from './budget.mjs';
import { normalizeDomain, slug } from './util.mjs';

const DEFAULT_CATEGORIES = {
  reddit: ['reddit.com'],
  youtube: ['youtube.com', 'youtu.be'],
  github: ['github.com'],
  x: ['x.com', 'twitter.com'],
  hackernews: ['news.ycombinator.com'],
  stackoverflow: ['stackoverflow.com', 'stackexchange.com'],
  medium: ['medium.com'],
  linkedin: ['linkedin.com'],
  wikipedia: ['wikipedia.org'],
};

function normalizeEntity(raw, kind) {
  if (!raw || typeof raw.name !== 'string' || !raw.name.trim()) {
    throw new Error(`A ${kind} entry needs a non-empty "name".`);
  }
  const aliases = Array.isArray(raw.aliases) ? raw.aliases.filter((a) => typeof a === 'string' && a.trim()) : [];
  const domains = Array.isArray(raw.domains) ? raw.domains.map(normalizeDomain).filter(Boolean) : [];
  return {
    id: slug(raw.name),
    name: raw.name.trim(),
    kind,
    names: [raw.name.trim(), ...aliases.map((a) => a.trim())],
    caseSensitive: raw.caseSensitive === true,
    domains,
  };
}

// Brand configuration is analysis-only. It is never sent to the model.
// An empty config is valid: sources and queries can still be examined.
export function normalizeConfig(raw = {}) {
  const entities = [];
  if (raw.brand) entities.push(normalizeEntity(raw.brand, 'brand'));
  for (const c of Array.isArray(raw.competitors) ? raw.competitors : []) {
    entities.push(normalizeEntity(c, 'competitor'));
  }
  const ids = entities.map((e) => e.id);
  if (new Set(ids).size !== ids.length) throw new Error('Brand and competitor names must be unique.');
  return {
    entities,
    categories: { ...DEFAULT_CATEGORIES, ...(raw.categories || {}) },
  };
}

export function loadQuestions(raw) {
  const list = Array.isArray(raw) ? raw : raw?.questions;
  if (!Array.isArray(list) || list.length === 0) throw new Error('Question set must contain at least one question.');
  const seen = new Set();
  return list.map((q, i) => {
    const text = typeof q === 'string' ? q : q?.text;
    if (typeof text !== 'string' || !text.trim()) throw new Error(`Question #${i + 1} has no text.`);
    const id = typeof q === 'object' && q.id ? String(q.id) : `q${i + 1}`;
    if (seen.has(id)) throw new Error(`Duplicate question id: ${id}`);
    seen.add(id);
    return { id, text: text.trim(), group: typeof q === 'object' ? q.group ?? null : null };
  });
}

// USD rates copied from the provider's price page. Optional for dry runs and analysis,
// required before any live request (see budget.mjs).
function parsePricing(raw, id) {
  if (raw == null) return null;
  const keys = ['inputPerMTok', 'outputPerMTok', 'perSearchCall'];
  for (const k of keys) {
    if (!Number.isFinite(raw[k]) || raw[k] < 0) throw new Error(`Engine "${id}": pricing.${k} must be a number >= 0 (USD per the provider's price page). If you copied examples/engines.example.json, replace its <placeholders> with real rates.`);
  }
  if (raw.cachedInputPerMTok != null && (!Number.isFinite(raw.cachedInputPerMTok) || raw.cachedInputPerMTok < 0)) throw new Error(`Engine "${id}": pricing.cachedInputPerMTok must be a number >= 0 (USD).`);
  const text = (v) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 300) : undefined);
  return { inputPerMTok: raw.inputPerMTok, outputPerMTok: raw.outputPerMTok, perSearchCall: raw.perSearchCall, ...(raw.cachedInputPerMTok != null ? { cachedInputPerMTok: raw.cachedInputPerMTok } : {}), source: text(raw.source), note: text(raw.note) };
}

const ENV_NAME = /^[A-Z_][A-Z0-9_]*$/;

// Engines describe *where* to ask, never the secret itself: `apiKeyEnv` is the NAME of an
// environment variable, so a key pasted into the file is rejected instead of being saved.
export function loadEngines(raw) {
  const list = Array.isArray(raw) ? raw : raw?.engines;
  if (!Array.isArray(list) || list.length === 0) throw new Error('Engine file must list at least one engine.');
  const ids = new Set();
  return list.map((e, i) => {
    if (!e || typeof e.model !== 'string' || !e.model.trim()) throw new Error(`Engine #${i + 1} needs a "model".`);
    const label = String(e.label ?? e.id ?? e.model);
    const id = slug(e.id ?? label);
    if (ids.has(id)) throw new Error(`Duplicate engine id: ${id}`);
    ids.add(id);
    const api = e.api ?? 'responses';
    if (!['responses', 'chat', 'messages'].includes(api)) throw new Error(`Engine "${id}": api must be responses, chat or messages.`);
    const authStyle = e.authStyle ?? (api === 'messages' ? 'x-api-key' : 'bearer');
    if (!['bearer', 'x-api-key'].includes(authStyle)) throw new Error(`Engine "${id}": authStyle must be bearer or x-api-key.`);
    const apiKeyEnv = e.apiKeyEnv ?? 'BEAT_GEO_API_KEY';
    if (!ENV_NAME.test(apiKeyEnv)) {
      throw new Error(`Engine "${id}": apiKeyEnv must be the NAME of an environment variable (e.g. OPENAI_API_KEY), never the key itself.`);
    }
    if (e.baseUrl != null && !/^https?:\/\//.test(String(e.baseUrl))) throw new Error(`Engine "${id}": baseUrl must start with http:// or https://.`);
    const pricing = parsePricing(e.pricing, id);
    const maxOutputTokens = e.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS;
    const maxSearchCalls = e.maxSearchCalls ?? DEFAULT_MAX_SEARCH_CALLS;
    const searchResultTokens = e.searchResultTokens ?? DEFAULT_SEARCH_RESULT_TOKENS;
    if (!Number.isInteger(searchResultTokens) || searchResultTokens < 0) throw new Error(`Engine "${id}": searchResultTokens must be a non-negative integer.`);
    if (!Number.isInteger(maxOutputTokens) || maxOutputTokens < 1) throw new Error(`Engine "${id}": maxOutputTokens must be a positive integer.`);
    if (!Number.isInteger(maxSearchCalls) || maxSearchCalls < 0) throw new Error(`Engine "${id}": maxSearchCalls must be a non-negative integer.`);
    return {
      id,
      label,
      api,
      pricing,
      maxOutputTokens,
      maxSearchCalls,
      searchResultTokens,
      sendSearchCap: e.sendSearchCap !== false,
      model: e.model.trim(),
      baseUrl: e.baseUrl ? String(e.baseUrl) : null,
      toolType: e.toolType ?? (api === 'messages' ? 'web_search_20250305' : 'web_search'),
      authStyle,
      anthropicVersion: e.anthropicVersion ?? '2023-06-01',
      includeSources: e.includeSources !== false,
      apiKeyEnv,
      extraBody: e.extraBody && typeof e.extraBody === 'object' ? e.extraBody : {},
    };
  });
}

export const DEFAULT_BASE_URL = 'https://api.openai.com/v1';

// Resolve credentials and endpoints for every engine up front, so a missing key stops the run
// before any request is sent. Only variable NAMES are ever reported.
export function resolveRuntime(engines, env) {
  const runtime = {};
  const missing = [];
  for (const engine of engines) {
    const apiKey = env[engine.apiKeyEnv] || (engine.apiKeyEnv === 'BEAT_GEO_API_KEY' ? env.OPENAI_API_KEY : undefined);
    if (!apiKey) missing.push(engine.apiKeyEnv);
    runtime[engine.id] = { apiKey, baseUrl: engine.baseUrl || env.BEAT_GEO_BASE_URL || DEFAULT_BASE_URL };
  }
  return { runtime, missing: [...new Set(missing)] };
}
