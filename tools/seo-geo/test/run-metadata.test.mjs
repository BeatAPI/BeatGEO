import test from 'node:test';
import assert from 'node:assert/strict';
import { readRunMetadata } from '../src/run-metadata.mjs';

test('a delayed running snapshot cannot replace a status committed before the job became inactive', async () => {
  for (const status of ['complete', 'partial', 'cancelled', 'failed']) {
    let active = true, stored = {status: 'running', completed: 0}, release;
    const oldSnapshot = structuredClone(stored);
    const pendingRead = new Promise(resolve => { release = resolve; });
    let first = true;
    const result = readRunMetadata(() => {
      if (first) { first = false; return pendingRead; }
      return Promise.resolve(structuredClone(stored));
    }, () => active);
    stored = {status, completed: 3};
    active = false;
    release(oldSnapshot);
    assert.deepEqual(await result, stored);
    assert.equal(oldSnapshot.status, 'running');
  }
});

test('an active run remains running and an abandoned run is reported as interrupted', async () => {
  const stored = {status: 'running', completed: 2};
  assert.deepEqual(await readRunMetadata(async () => stored, () => true), stored);
  const abandoned = await readRunMetadata(async () => stored, () => false);
  assert.equal(abandoned.status, 'interrupted');
  assert.equal(abandoned.completed, 2);
  assert.equal(stored.status, 'running');
});

test('missing metadata remains missing, including when it disappears during the confirmation read', async () => {
  assert.equal(await readRunMetadata(async () => undefined, () => false), undefined);
  let stored = {status: 'running'};
  assert.equal(await readRunMetadata(async () => { const previous = stored; stored = undefined; return previous; }, () => false), undefined);
});
