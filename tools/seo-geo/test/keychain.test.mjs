import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readKeychain } from '../src/keychain.mjs';

test('reads the value via `security find-generic-password -w` without a shell, and trims it', async () => {
  const calls = [];
  const exec = async (cmd, args) => (calls.push({ cmd, args }), { stdout: 'value-from-keychain\n' });
  const v = await readKeychain({ service: 'svc', account: 'acct' }, { platform: 'darwin', exec });
  assert.equal(v, 'value-from-keychain');
  assert.deepEqual(calls[0], { cmd: 'security', args: ['find-generic-password', '-s', 'svc', '-a', 'acct', '-w'] });
  const noAcct = [];
  await readKeychain({ service: 'svc' }, { platform: 'darwin', exec: async (c, a) => (noAcct.push(a), { stdout: 'x' }) });
  assert.ok(!noAcct[0].includes('-a'));
});

test('failures name the service and account only, never the tool output or the value', async () => {
  const exec = async () => { throw Object.assign(new Error('boom secret-in-stderr'), { stderr: 'secret-in-stderr' }); };
  await assert.rejects(readKeychain({ service: 'svc', account: 'acct' }, { platform: 'darwin', exec }), (e) => {
    assert.match(e.message, /service "svc", account "acct"/);
    assert.ok(!/secret-in-stderr/.test(e.message));
    return true;
  });
  await assert.rejects(readKeychain({ service: 'svc' }, { platform: 'darwin', exec: async () => ({ stdout: '  \n' }) }), /not found or not readable/);
});

test('non-macOS platforms get a clear message pointing at the alternatives', async () => {
  await assert.rejects(readKeychain({ service: 's' }, { platform: 'linux' }), /only available on macOS.*--key-file/);
});

test('CLI: a Keychain item that does not exist stops the run with a clear message before anything is sent', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'kc-'));
  const questions = path.join(dir, 'q.json');
  const engines = path.join(dir, 'e.json');
  await writeFile(questions, JSON.stringify({ questions: [{ id: 'a', text: 'Q?' }] }));
  await writeFile(engines, JSON.stringify({ engines: [{ id: 'a', model: 'm', pricing: { inputPerMTok: 1, outputPerMTok: 1, perSearchCall: 0 } }] }));
  const r = await new Promise((resolve) => {
    const c = spawn(process.execPath, [path.resolve('bin/beat-geo.mjs'), 'doctor', '--engines', engines, '--keychain', 'beat-geo-test-service-that-does-not-exist-42'], { env: { PATH: process.env.PATH } });
    let out = '';
    c.stdout.on('data', (d) => (out += d));
    c.stderr.on('data', (d) => (out += d));
    c.on('close', (code) => resolve({ code, out }));
  });
  assert.equal(r.code, 2);
  assert.match(r.out, /Keychain item not found or not readable|only available on macOS/);
});
