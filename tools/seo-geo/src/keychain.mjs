// Read a secret from the macOS Keychain into memory. Nothing is written to disk and the value is
// never included in any message, so a key can stay in the Keychain and still be used by a run.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function readKeychain({ service, account }, { platform = process.platform, exec = run } = {}) {
  if (platform !== 'darwin') throw new Error('--keychain is only available on macOS. Use an environment variable or --key-file instead.');
  if (!service) throw new Error('--keychain needs a service name.');
  const args = ['find-generic-password', '-s', service, ...(account ? ['-a', account] : []), '-w'];
  try {
    const { stdout } = await exec('security', args, { timeout: 30_000 });
    const value = String(stdout).trim();
    if (!value) throw new Error('empty');
    return value;
  } catch {
    // Deliberately no stderr and no value: only what was asked for.
    throw new Error(`Keychain item not found or not readable (service "${service}"${account ? `, account "${account}"` : ''}).`);
  }
}
