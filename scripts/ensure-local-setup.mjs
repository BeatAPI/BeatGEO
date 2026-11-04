import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

export function ensureLocalSetup(root, { envFile, exists = existsSync, run = spawnSync } = {}) {
 const rootEnv = path.join(root, '.env');
 if (envFile) {
  if (!exists(envFile)) throw new Error('The supplied environment file does not exist. Existing data was not changed.');
  return;
 }
 const webEnv = path.join(root, 'apps/web/.env');
 if (exists(rootEnv) && exists(webEnv)) return;
 const protectedPaths = [rootEnv, webEnv, '.beat-geo/postgres', '.beat-geo/database.json'].map(p => path.isAbsolute(p) ? p : path.join(root, p));
 if (protectedPaths.some(exists))
  throw new Error('An existing workspace is missing part of its configuration. Restore its original .env files with the database backup; BeatGEO will not replace encryption keys or existing data.');
 console.log('First start: preparing private local configuration, storage and BeatBrowser automatically.');
 const result = run(process.execPath, [path.join(root, 'scripts/setup-local.mjs')], { cwd: root, stdio: 'inherit', env: process.env });
 if (result.error || result.status !== 0) throw new Error('Automatic setup did not complete. Fix the reported prerequisite, then retry. If configuration was already generated, use pnpm local:setup --resume.');
 if (!exists(rootEnv) || !exists(webEnv)) throw new Error('Automatic setup did not produce the local configuration. No services were started.');
}
