// Minimal .env loader for API keys kept outside the repository and outside chat.
// Values are read into the process environment and are never printed or returned in messages.

import { readFile, stat } from 'node:fs/promises';

export function parseEnv(text) {
  const out = {};
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[m[1]] = value;
  }
  return out;
}

// Returns { loaded: [names], warning?: string }. Existing environment variables win.
export async function loadEnvFile(file, env = process.env) {
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (err) {
    throw new Error(err.code === 'ENOENT' ? `Key file not found: ${file}` : `Cannot read key file ${file}: ${err.code ?? 'error'}.`);
  }
  const loaded = [];
  for (const [k, v] of Object.entries(parseEnv(text))) {
    if (env[k] === undefined && v !== '') {
      env[k] = v;
      loaded.push(k);
    }
  }
  const mode = (await stat(file)).mode & 0o777;
  const warning = mode & 0o077 ? `${file} is readable by other users (mode ${mode.toString(8)}). Restrict it with: chmod 600 ${file}` : undefined;
  return { loaded, warning };
}
