import assert from 'node:assert/strict';
import { test } from 'node:test';
import { loadEngines, resolveRuntime } from '../src/config.mjs';
import { deriveActions } from '../src/actions.mjs';
import { aggregate } from '../src/aggregate.mjs';
import { analyzeObservation } from '../src/analyze.mjs';
import { normalizeConfig } from '../src/config.mjs';
import { parseResponse } from '../src/parse.mjs';
import { CONFIG, message, response, searchCall } from './fixtures.mjs';

test('an engine file must name an environment variable, never contain a key', () => {
  assert.throws(() => loadEngines([{ model: 'm', apiKeyEnv: 'sk-live-abcdef1234567890' }]), /NAME of an environment variable/);
  assert.throws(() => loadEngines([{ model: 'm', apiKeyEnv: 'my-key' }]), /NAME of an environment variable/);
  assert.equal(loadEngines([{ model: 'm', apiKeyEnv: 'OPENAI_API_KEY' }])[0].apiKeyEnv, 'OPENAI_API_KEY');
});

test('engine validation: model required, unique ids, known api, http(s) base URL', () => {
  assert.throws(() => loadEngines([{ id: 'x' }]), /needs a "model"/);
  assert.throws(() => loadEngines([{ id: 'a', model: 'm' }, { id: 'a', model: 'n' }]), /Duplicate engine id/);
  assert.throws(() => loadEngines([{ model: 'm', api: 'soap' }]), /api must be/);
  assert.throws(() => loadEngines([{ model: 'm', baseUrl: 'ftp://x' }]), /http/);
  assert.throws(() => loadEngines([]), /at least one/);
});

test('runtime resolution reports missing variable names, and falls back to OPENAI_API_KEY only for the default variable', () => {
  const engines = loadEngines([{ id: 'a', model: 'm' }, { id: 'b', model: 'm', apiKeyEnv: 'OTHER_KEY' }]);
  const r = resolveRuntime(engines, { OPENAI_API_KEY: 'k-openai-1234567' });
  assert.deepEqual(r.missing, ['OTHER_KEY']);
  assert.equal(r.runtime.a.apiKey, 'k-openai-1234567');
  assert.equal(r.runtime.a.baseUrl, 'https://api.openai.com/v1');
});

test('engine-gap action appears only when the brand shows up on some engines and not others', () => {
  const config = normalizeConfig(CONFIG);
  const mk = (engine, res) => ({ questionId: 'q1', question: 'Q?', engine, engineLabel: engine.toUpperCase(), repeat: 1, source: 'import', analysis: analyzeObservation(parseResponse(res), config) });
  const yes = response([searchCall('c', { queries: ['q'], sources: [] }), message('Acme rocks.')]);
  const no = response([message('Zeta rocks.')]);
  const gap = deriveActions(aggregate([mk('a', yes), mk('b', no)], config, [{ id: 'q1', text: 'Q?' }]));
  assert.ok(gap.some((x) => x.type === 'engine-gap' && x.evidence.perEngine.join().includes('A: 1/1') && x.evidence.perEngine.join().includes('B: 0/1')));
  const none = deriveActions(aggregate([mk('a', yes), mk('b', yes)], config, [{ id: 'q1', text: 'Q?' }]));
  assert.ok(!none.some((x) => x.type === 'engine-gap'));
});
