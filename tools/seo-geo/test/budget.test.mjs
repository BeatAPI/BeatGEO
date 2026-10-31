import assert from 'node:assert/strict';
import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { Budget, actualUsd, estimateInputTokens, isPriced, worstCaseInputTokens, worstCaseUsd } from '../src/budget.mjs';
import { loadEngines } from '../src/config.mjs';
import { buildPlan, executePlan } from '../src/run.mjs';

const PRICING = { inputPerMTok: 1, outputPerMTok: 2, perSearchCall: 0.01 };
const engine = (extra = {}) => loadEngines([{ id: 'a', model: 'm', pricing: PRICING, ...extra }])[0];
const q = { id: 'q1', text: 'x'.repeat(300) };

test('worst case = input (with search results re-read each round) + max output + max search calls', () => {
  const e = engine({ maxOutputTokens: 1000, maxSearchCalls: 2, searchResultTokens: 0 });
  const base = estimateInputTokens(q.text); // 100 + 50
  assert.equal(base, 150);
  // 3 rounds x question, no search text
  assert.ok(Math.abs(worstCaseUsd(e, q) - (3 * 150 / 1e6 + 1000 * 2 / 1e6 + 2 * 0.01)) < 1e-12);
});

test('search-result text is billed as input and re-read by every later round', () => {
  const e = engine({ maxOutputTokens: 1000, maxSearchCalls: 2, searchResultTokens: 1000 });
  // (S+1)*150 + R*S*(S+1)/2 = 450 + 3000
  assert.equal(worstCaseInputTokens(e, q).total, 3450);
  const none = engine({ maxSearchCalls: 0, searchResultTokens: 5000 });
  assert.equal(worstCaseInputTokens(none, q).total, 150, 'no searches means no search text');
  assert.throws(() => loadEngines([{ model: 'm', searchResultTokens: -1 }]), /searchResultTokens/);
});

test('an engine without pricing is unpriced and has no cost estimate', () => {
  const e = loadEngines([{ id: 'a', model: 'm' }])[0];
  assert.equal(isPriced(e), false);
  assert.equal(worstCaseUsd(e, q), null);
});

test('pricing must be non-negative numbers', () => {
  assert.throws(() => loadEngines([{ model: 'm', pricing: { inputPerMTok: -1, outputPerMTok: 1, perSearchCall: 0 } }]), /inputPerMTok/);
  assert.throws(() => loadEngines([{ model: 'm', pricing: { inputPerMTok: 1, outputPerMTok: 'x', perSearchCall: 0 } }]), /outputPerMTok/);
});

test('actual cost reads Responses and Chat usage; missing usage yields null (caller charges worst case)', () => {
  const e = engine();
  const withCall = { usage: { input_tokens: 2000, output_tokens: 1000 }, output: [{ type: 'web_search_call', id: 'c', action: { type: 'search', queries: ['q'], sources: [] } }, { type: 'web_search_call', id: 'd', action: { type: 'search', queries: ['r'], sources: [] } }] };
  assert.ok(Math.abs(actualUsd(e, withCall) - (0.002 + 0.002 + 0.02)) < 1e-12);
  const chat = engine({ api: 'chat', maxSearchCalls: 1 });
  assert.ok(Math.abs(actualUsd(chat, { usage: { prompt_tokens: 1000, completion_tokens: 500 }, choices: [] }) - (0.001 + 0.001 + 0.01)) < 1e-12, 'chat assumes the search cap was used');
  assert.equal(actualUsd(e, { output: [] }), null);
});

test('budget reservations: reserving beyond the limit is refused; settling replaces the reservation', () => {
  const b = new Budget(1);
  assert.equal(b.canReserve(0.6), true);
  b.reserve(0.6);
  assert.equal(b.canReserve(0.5), false);
  b.settle(0.6, 0.2);
  assert.equal(b.reserved, 0);
  assert.ok(Math.abs(b.spent - 0.2) < 1e-12);
  assert.equal(b.canReserve(0.8), true);
});

test('a timeout or network error is charged at worst case, an HTTP error at zero', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'bg-'));
  const e = engine();
  const plan = buildPlan({ questions: [q], engines: [e], repeats: 1, maxRequests: 10 });
  const runtime = { a: { apiKey: 'k-aaaaaaaaaaaa', baseUrl: 'http://x/v1' } };
  const network = await executePlan({ plan, runtime, outDir: path.join(dir, 'n'), budgetUsd: 5, fetchImpl: async () => { throw new Error('reset'); } });
  assert.ok(Math.abs(network.estimatedSpentUsd - plan.items[0].worstUsd) < 1e-12);
  const http500 = await executePlan({ plan, runtime, outDir: path.join(dir, 'h'), budgetUsd: 5, fetchImpl: async () => ({ ok: false, status: 500, text: async () => 'no' }) });
  assert.equal(http500.estimatedSpentUsd, 0);
});

test('the plan total is the sum of per-request worst cases and is null when any engine is unpriced', () => {
  const priced = buildPlan({ questions: [q], engines: [engine()], repeats: 3, maxRequests: 10 });
  assert.ok(Math.abs(priced.worstCaseTotalUsd - 3 * priced.items[0].worstUsd) < 1e-12);
  const mixed = buildPlan({ questions: [q], engines: [engine(), loadEngines([{ id: 'u', model: 'm' }])[0]], repeats: 1, maxRequests: 10 });
  assert.equal(mixed.worstCaseTotalUsd, null);
  assert.deepEqual(mixed.unpriced, ['u']);
});
