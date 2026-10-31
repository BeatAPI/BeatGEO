import assert from 'node:assert/strict';
import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { loadEnvFile, parseEnv } from '../src/envfile.mjs';

test('parseEnv handles comments, export, quotes and spaces', () => {
  const env = parseEnv('# c\nexport A=1\nB = "two words"\nC=\'x\'\n\nnot a line\nD=');
  assert.deepEqual(env, { A: '1', B: 'two words', C: 'x', D: '' });
});

test('loadEnvFile does not override existing variables, skips empty values, and reports names only', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'env-'));
  const file = path.join(dir, '.env');
  await writeFile(file, 'KEEP=from-file\nNEW=secret-value-123\nEMPTY=\n');
  await chmod(file, 0o600);
  const env = { KEEP: 'already' };
  const r = await loadEnvFile(file, env);
  assert.equal(env.KEEP, 'already');
  assert.equal(env.NEW, 'secret-value-123');
  assert.deepEqual(r.loaded, ['NEW']);
  assert.equal(r.warning, undefined);
  assert.ok(!JSON.stringify(r).includes('secret-value-123'));
});

test('a key file readable by others produces a warning that names the fix, not the value', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'env-'));
  const file = path.join(dir, '.env');
  await writeFile(file, 'K=abcdefgh12345\n');
  await chmod(file, 0o644);
  const r = await loadEnvFile(file, {});
  assert.match(r.warning, /chmod 600/);
  assert.ok(!r.warning.includes('abcdefgh12345'));
});

test('a missing env file is a clear error without leaking anything', async () => {
  await assert.rejects(loadEnvFile('/nonexistent/x.env', {}), /Key file not found: \/nonexistent\/x\.env/);
});
