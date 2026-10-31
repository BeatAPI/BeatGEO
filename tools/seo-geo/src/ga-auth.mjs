// Desktop OAuth: system browser, random loopback port, state + PKCE, read-only scope.
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { constants } from 'node:fs';
import { lstat, mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { GA_SCOPE } from './ga.mjs';

const exec = promisify(execFile);
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const safeName = name => {
  if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(name)) throw new Error('Connection name uses lowercase letters, numbers and hyphens (max 64).');
  return name;
};
export function gaConnectionPath(name = 'default', root = process.env.BEAT_GEO_GA_HOME ?? path.join(os.homedir(), '.config', 'beat-geo', 'ga')) {
  return path.join(path.resolve(root), `${safeName(name)}.json`);
}
async function privateDirectory(dir) {
  const relative = path.relative(process.cwd(), dir);
  if (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)) throw new Error('GA credentials must be stored outside the project directory.');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const info = await lstat(dir);
  if (!info.isDirectory() || info.isSymbolicLink()) throw new Error('GA credential directory must not be a symbolic link.');
  if (process.platform !== 'win32' && ((info.mode & 0o077) || (process.getuid && info.uid !== process.getuid()))) throw new Error('GA credential directory must be owned by you with mode 700. Choose a private directory.');
}
export async function saveGaConnection(connection, { name = 'default', root } = {}) {
  const file = gaConnectionPath(name, root);
  await privateDirectory(path.dirname(file));
  const temp = `${file}.${randomBytes(8).toString('hex')}.tmp`;
  try {
    const handle = await open(temp, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    try { await handle.writeFile(JSON.stringify(connection)); } finally { await handle.close(); }
    await rename(temp, file);
  } finally { await rm(temp, { force: true }); }
}
export async function readGaConnection({ name = 'default', root } = {}) {
  const file = gaConnectionPath(name, root);
  let handle;
  try {
    handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    const info = await handle.stat();
    if (!info.isFile() || info.size > 128 * 1024 || (process.platform !== 'win32' && (info.mode & 0o077))) throw new Error('unsafe');
    const connection = JSON.parse(await handle.readFile('utf8'));
    if (connection.schema !== 'beat-geo/ga-connection@1' || !connection.client?.id || !connection.tokens?.refreshToken || !connection.property?.id || !connection.site) throw new Error('invalid');
    return connection;
  } catch { throw new Error('GA connection missing, invalid or not private (requires mode 600). Run ga connect first.'); }
  finally { await handle?.close(); }
}
export async function removeGaConnection({ name = 'default', root } = {}) {
  await rm(gaConnectionPath(name, root), { force: true });
}
export async function readGaClient(file) {
  let json;
  try { json = JSON.parse(await readFile(file, 'utf8')); } catch { throw new Error('Cannot read Google OAuth client JSON.'); }
  const client = json.installed;
  if (!client || typeof client.client_id !== 'string' || !/^[a-zA-Z0-9._-]+\.apps\.googleusercontent\.com$/.test(client.client_id)) {
    throw new Error('Use a Google OAuth Desktop app client JSON (installed), not a web client or service-account key.');
  }
  return { id: client.client_id, ...(typeof client.client_secret === 'string' ? { secret: client.client_secret } : {}) };
}
async function tokenRequest(params, fetchImpl) {
  let response;
  try { response = await fetchImpl(TOKEN_URL, { method: 'POST', redirect: 'error',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params), signal: AbortSignal.timeout(30000) }); }
  catch { throw new Error('Google authorization request failed or timed out.'); }
  if (!response.ok) throw new Error(`Google authorization HTTP ${response.status}; reconnect if permission expired or was revoked.`);
  let data;
  try { data = await response.json(); } catch { throw new Error('Invalid Google authorization response.'); }
  if (typeof data.access_token !== 'string' || !data.access_token || !Number.isFinite(data.expires_in) || data.expires_in <= 0 || (data.token_type && data.token_type.toLowerCase() !== 'bearer')) throw new Error('Incomplete Google authorization response.');
  const scopes = typeof data.scope === 'string' ? data.scope.split(' ') : [];
  if (data.scope !== undefined && !scopes.includes(GA_SCOPE)) throw new Error('Google Analytics read-only permission was not granted.');
  return { accessToken: data.access_token, refreshToken: data.refresh_token, expiresAt: Date.now() + data.expires_in * 1000, scopes };
}
export async function openGaBrowser(url, { platform = process.platform, execImpl = exec } = {}) {
  try {
    if (platform === 'darwin') await execImpl('open', [url], { timeout: 15000 });
    else if (platform === 'win32') await execImpl('rundll32', ['url.dll,FileProtocolHandler', url], { timeout: 15000 });
    else await execImpl('xdg-open', [url], { timeout: 15000 });
  } catch { throw new Error('Cannot open the system browser. Run ga connect on a desktop with a browser.'); }
}
const CALLBACK_PAGE = '<!doctype html><html lang="zh"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Beat Geo · GA</title><style>:root{color-scheme:light dark}body{font:16px/1.7 system-ui;max-width:600px;margin:12vh auto;padding:24px;background:light-dark(#fbfaf8,#161615);color:light-dark(#1c1c1a,#eceae4)}h1{font-size:24px;color:light-dark(#5f7f6a,#8fb29a)}</style><h1>已收到 Google 授权结果</h1><p>请关闭此页并返回 Beat Geo，继续选择站点。连接是否成功以 Beat Geo 提示为准。</p></html>';
export async function authorizeGa(client, { fetchImpl = fetch, openBrowser = openGaBrowser, timeoutMs = 180000, onWaiting = () => {} } = {}) {
  const state = randomBytes(32).toString('base64url');
  const verifier = randomBytes(48).toString('base64url');
  let settle, timer;
  const result = new Promise((resolve, reject) => { settle = { resolve, reject }; });
  // Attach immediately: failures can arrive while openBrowser is still pending.
  result.catch(() => {});
  const server = createServer((req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'");
    let url;
    try { url = new URL(req.url, 'http://127.0.0.1'); } catch { res.writeHead(400).end('Invalid callback.'); return; }
    if (req.method !== 'GET' || req.headers.host !== `127.0.0.1:${server.address().port}` || url.pathname !== '/oauth/callback' || url.searchParams.get('state') !== state) {
      res.writeHead(400).end('Invalid callback.'); return;
    }
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(CALLBACK_PAGE);
    if (url.searchParams.has('error')) settle.reject(new Error('Google authorization was declined. Nothing was connected.'));
    else {
      const code = url.searchParams.get('code');
      if (!code || code.length > 4096) settle.reject(new Error('Invalid Google authorization callback.'));
      else settle.resolve(code);
    }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const redirect = `http://127.0.0.1:${server.address().port}/oauth/callback`;
  try {
    timer = setTimeout(() => settle.reject(new Error('Google authorization timed out; run ga connect again.')), timeoutMs);
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    for (const [k, v] of Object.entries({ client_id: client.id, redirect_uri: redirect, response_type: 'code', scope: GA_SCOPE, state,
      code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256', access_type: 'offline', prompt: 'consent' })) url.searchParams.set(k, v);
    onWaiting();
    await openBrowser(url.href);
    const code = await result;
    const tokens = await tokenRequest({ client_id: client.id, ...(client.secret ? { client_secret: client.secret } : {}), code,
      code_verifier: verifier, redirect_uri: redirect, grant_type: 'authorization_code' }, fetchImpl);
    if (!tokens.scopes.includes(GA_SCOPE) || !tokens.refreshToken) throw new Error('Read-only offline authorization is incomplete. Reconnect and grant Analytics access.');
    return tokens;
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}
export async function refreshGaConnection(connection, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (connection.tokens.expiresAt > now + 60000 && connection.tokens.accessToken) return connection;
  const tokens = await tokenRequest({ client_id: connection.client.id, ...(connection.client.secret ? { client_secret: connection.client.secret } : {}),
    refresh_token: connection.tokens.refreshToken, grant_type: 'refresh_token' }, fetchImpl);
  return { ...connection, tokens: { ...tokens, refreshToken: tokens.refreshToken ?? connection.tokens.refreshToken,
    scopes: tokens.scopes.length ? tokens.scopes : connection.tokens.scopes } };
}
