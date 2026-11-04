import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { analyzeGa, fetchGa, gaDates, gaProperty, listGaProperties, listGaSites, loadGa } from './ga.mjs';
import { authorizeGa, gaConnectionPath, readGaClient, readGaConnection, refreshGaConnection, removeGaConnection, saveGaConnection } from './ga-auth.mjs';
import { siteHostname } from './crawls.mjs';
import { writeOutputs } from './run.mjs';

export async function chooseGa(items, title) {
  if (!items.length) throw new Error(`${title}: no accessible options. Check Google account and GA permissions.`);
  if (items.length === 1) return items[0];
  if (!stdin.isTTY) throw new Error(`${title}: several options; run in an interactive terminal or specify --property / --site.`);
  console.log(title);
  items.forEach((item, i) => console.log(`  ${i + 1}. ${String(item.label).replace(/[\x00-\x1f\x7f-\x9f]/g, '')}`));
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question('Select / 选择编号: ');
    const index = Number(answer) - 1;
    if (!Number.isInteger(index) || index < 0 || index >= items.length) throw new Error('Invalid selection; nothing was connected.');
    return items[index];
  } finally { rl.close(); }
}
export async function cmdGa(opts, action = 'sync', deps = {}) {
  const zh = opts.lang === 'zh', label = (en, cn) => zh ? cn : en;
  if (opts.lang && !['en', 'zh'].includes(opts.lang)) throw new Error('--lang must be en or zh.');
  if (!['connect', 'sync', 'status', 'disconnect'].includes(action)) throw new Error('Use ga connect, ga sync, ga status, ga disconnect, or ga --input FILE.');
  const allowed = new Set(['lang', 'connection', ...(['sync', 'connect'].includes(action) ? ['out', 'start-date', 'end-date'] : []), ...(action === 'connect' ? ['client-file', 'property', 'site'] : []), ...(action === 'sync' ? ['input'] : [])]);
  for (const key of Object.keys(opts)) if (!allowed.has(key)) throw new Error(`--${key} is not used by ga ${action}.`);
  const name = opts.connection ?? 'default', storage = { name, ...(deps.root ? { root: deps.root } : {}) };
  gaConnectionPath(name, deps.root); // validate before browser/network work
  const clientDeps = { ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}) };
  if (action === 'disconnect') {
    await removeGaConnection(storage);
    console.log(label('Local GA connection removed. To revoke Google permission, remove Beat Geo in your Google account connections.', '已移除本地 GA 连接。若需撤销 Google 授权，请在 Google 账号的第三方连接中移除 Beat Geo。'));
    return;
  }
  if (action === 'status') {
    const c = await readGaConnection(storage);
    console.log(`${name}: ${c.property.name} (${c.property.id}) · ${c.site} · analytics.readonly`);
    return;
  }
  // Validate dates and output before opening a browser or sending an API request.
  if (!opts.input) gaDates({ start: opts['start-date'], end: opts['end-date'] });
  const out = opts.out ?? path.join('runs', `ga-${name}`);
  const credentialDir = path.dirname(gaConnectionPath(name, deps.root));
  const relativeOut = path.relative(credentialDir, path.resolve(out));
  if (!relativeOut.startsWith(`..${path.sep}`) && relativeOut !== '..' && !path.isAbsolute(relativeOut)) throw new Error('Keep GA report outputs outside the credential directory.');
  if (opts.input && ['ga.json', 'ga-input.json', 'report.html', 'report.md'].some(f => path.resolve(opts.input) === path.resolve(out, f))) throw new Error('Use a separate GA output directory so the imported file cannot be overwritten.');
  if (opts.input && (opts['start-date'] || opts['end-date'])) throw new Error('Offline GA imports retain their own dates; date flags apply to ga connect/sync.');
  let result;
  if (opts.input) {
    result = await loadGa(opts.input);
  } else {
    let c;
    if (action === 'connect') {
      if (!opts['client-file']) throw new Error(label('First connect requires --client-file with our Google OAuth Desktop app JSON. See references/ga.md; the publisher configures this once.', '首次连接需 --client-file 指定我们自己的 Google OAuth 桌面客户端 JSON。见 references/ga.md；客户端由产品维护者一次配置。'));
      const client = await readGaClient(opts['client-file']);
      const requestedProperty = opts.property ? gaProperty(opts.property) : null;
      const requestedSite = opts.site ? siteHostname(opts.site) : null;
      const tokens = await authorizeGa(client, { ...clientDeps, ...(deps.openBrowser ? { openBrowser: deps.openBrowser } : {}),
        onWaiting: () => console.log(label('Opening Google. Grant read-only Analytics access; return here to select your site.', '正在打开 Google，请同意 Analytics 只读访问，完成后返回这里选择站点。')) });
      const properties = await listGaProperties(tokens.accessToken, clientDeps);
      const select = deps.select ?? chooseGa;
      const property = requestedProperty ? properties.find(p => p.id === requestedProperty)
        : await select(properties.map(p => ({ ...p, label: `${p.name} · ${p.id}` })), label('Select GA property', '选择 GA 属性'));
      if (!property) throw new Error('The selected Google account cannot read that GA property.');
      const sites = await listGaSites(tokens.accessToken, property.id, clientDeps);
      // A stream default URL is only a suggestion. An explicitly supplied hostname may be an
      // additional domain within that property; runReport still applies an exact hostname filter.
      const site = requestedSite ?? (await select(sites.map(site => ({ site, label: site })), label('Select site hostname', '选择站点主机名'))).site;
      c = { schema: 'beat-geo/ga-connection@1', client, tokens, property: { id: property.id, name: property.name }, site };
    } else {
      const previous = await readGaConnection(storage);
      c = await refreshGaConnection(previous, clientDeps);
      if (c !== previous) await saveGaConnection(c, storage);
    }
    result = await fetchGa({ token: c.tokens.accessToken, property: c.property, site: c.site,
      start: opts['start-date'], end: opts['end-date'], ...clientDeps });
    // A failed first query must not leave a misleading successful connection.
    if (action === 'connect') await saveGaConnection(c, storage);
  }
  // Recompute from the sanitized snapshot so offline replay and live reports agree.
  result.summary = analyzeGa(result.snapshot);
  await mkdir(out, { recursive: true });
  await writeFile(path.join(out, 'ga-input.json'), JSON.stringify(result.snapshot, null, 2));
  await writeOutputs(out, { summary: result.summary, actions: [] }, { lang: opts.lang ?? 'en' });
  console.log(label(`GA snapshot: ${result.summary.totals.sessions} AI-attributed sessions. Report: ${path.join(out, 'report.html')}`,
    `GA 快照：${result.summary.totals.sessions} 次 AI 来源会话。报告：${path.join(out, 'report.html')}`));
  if (result.summary.synthetic) console.log(label('SYNTHETIC DATA — not real traffic.', '合成演示数据，不是真实流量。'));
  return result;
}
