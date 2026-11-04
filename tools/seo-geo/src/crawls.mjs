// Offline request observations. No network calls, IP persistence or UA authentication.
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { CRAWLERS, CRAWLER_RULE_VERSION, recognizeCrawler } from './crawler-rules.mjs';

export const CRAWL_SCHEMA = 'beat-geo/crawl-summary@1';
export const MAX_LOG_BYTES = 10 * 1024 * 1024;
const MAX_ROWS = 50000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const bad = code => { throw new Error(code); };

export function siteHostname(input) {
  try {
    if (typeof input !== 'string' || !input.trim()) throw new Error();
    input = input.trim();
    const u = new URL(String(input).includes('://') ? input : `https://${input}`);
    if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || u.port ||
        u.pathname !== '/' || u.search || u.hash || !u.hostname) throw new Error();
    return u.hostname.toLowerCase();
  } catch { throw new Error('Site must be an HTTP(S) origin or hostname, without credentials, port or path.'); }
}

// Strict calendar/timezone parsing; Date.parse alone normalizes impossible dates.
export function logTime(value) {
  if (typeof value !== 'string') return bad('invalid_time');
  const combined = /^(\d{2})\/([A-Z][a-z]{2})\/(\d{4}):(\d{2}):(\d{2}):(\d{2}) ([+-]\d{2})(\d{2})$/.exec(value);
  if (combined) {
    const [, day, month, year, h, m, s, zone, zoneM] = combined;
    const index = MONTHS.indexOf(month);
    if (index < 0) return bad('invalid_time');
    value = `${year}-${String(index + 1).padStart(2, '0')}-${day}T${h}:${m}:${s}${zone}:${zoneM}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!iso) return bad('invalid_time');
  const [, y, mo, d, h, mi, s, , zone] = iso;
  const days = new Date(Date.UTC(+y, +mo, 0)).getUTCDate();
  if (+y < 1970 || +mo < 1 || +mo > 12 || +d < 1 || +d > days || +h > 23 || +mi > 59 || +s > 59 ||
      (zone !== 'Z' && (+zone.slice(1, 3) > 14 || +zone.slice(4) > 59 || (+zone.slice(1, 3) === 14 && +zone.slice(4) !== 0)))) return bad('invalid_time');
  const time = Date.parse(value);
  if (!Number.isFinite(time)) return bad('invalid_time');
  return new Date(time).toISOString();
}

function requestPath(raw, host) {
  if (typeof raw !== 'string' || !raw || raw.length > 8192 || /[\s\x00-\x1f\x7f]/.test(raw)) return bad('invalid_path');
  if (/^https?:\/\//i.test(raw)) {
    const u = new URL(raw);
    if (u.username || u.password || u.port) return bad('invalid_path');
    if (u.hostname.toLowerCase() !== host) return bad('other_host');
    raw = u.pathname;
  }
  // Keep path case/encoding/slashes; do not retain query or fragment secrets.
  const path = raw.split(/[?#]/, 1)[0];
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\') || /%(?![0-9a-f]{2})/i.test(path)) return bad('invalid_path');
  return path;
}

function combinedRow(line) {
  // Standard Nginx/Apache Combined, including escaped quoted fields. IP, auth and referrer are discarded.
  const m = /^\S+ \S+ \S+ \[([^\]]+)\] "((?:[^"\\]|\\.)*)" (\d{3}) (\d+|-) "(?:[^"\\]|\\.)*" "((?:[^"\\]|\\.)*)"$/.exec(line);
  if (!m) return bad('invalid_combined');
  const request = /^([A-Z]+) (\S+) HTTP\/\d+(?:\.\d+)?$/.exec(m[2]);
  if (!request) return bad('invalid_request');
  return { time: m[1], method: request[1], path: request[2], status: Number(m[3]), userAgent: m[5] };
}

function normalizeRow(row, site, now) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return bad('invalid_record');
  const declaredHost = row.host ?? row.hostname;
  if (declaredHost != null && siteHostname(declaredHost) !== site) return bad('other_host');
  const time = logTime(row.time ?? row.timestamp);
  if (Date.parse(time) > now + 5 * 60000) return bad('future_time');
  const method = row.method;
  if (typeof method !== 'string' || !/^[A-Z]{1,20}$/.test(method)) return bad('invalid_method');
  const status = row.status;
  if (!Number.isInteger(status) || status < 100 || status > 599) return bad('invalid_status');
  const userAgent = row.userAgent ?? row.user_agent;
  if (typeof userAgent !== 'string' || userAgent.length > 4096 || /[\x00-\x1f\x7f]/.test(userAgent)) return bad('invalid_user_agent');
  return { time, path: requestPath(row.path ?? row.url, site), method, status,
    hostBasis: declaredHost != null || /^https?:\/\//i.test(row.path ?? row.url) ? 'request_host' : 'configured_host',
    recognition: recognizeCrawler(userAgent) };
}

const newCounts = () => ({ requests: 0, get2xx: 0, head: 0, notModified: 0, denied: 0, errors5xx: 0, statuses: {} });
function count(row, request) {
  row.requests++;
  row.get2xx += Number(request.method === 'GET' && request.status >= 200 && request.status < 300);
  row.head += Number(request.method === 'HEAD');
  row.notModified += Number(request.status === 304);
  row.denied += Number([401, 403, 429, 451].includes(request.status));
  row.errors5xx += Number(request.status >= 500);
  row.statuses[request.status] = (row.statuses[request.status] ?? 0) + 1;
  row.firstSeen = !row.firstSeen || request.time < row.firstSeen ? request.time : row.firstSeen;
  row.lastSeen = !row.lastSeen || request.time > row.lastSeen ? request.time : row.lastSeen;
}

export function analyzeCrawls(content, { site, format = 'auto', from, to, now = Date.now() } = {}) {
  if (typeof content !== 'string' || Buffer.byteLength(content) > MAX_LOG_BYTES) throw new Error('Log input limit is 10 MiB.');
  const hostname = siteHostname(site);
  const start = from == null ? null : logTime(from), end = to == null ? null : logTime(to);
  if (start && end && start >= end) throw new Error('--from must precede --to (end is exclusive).');
  if (!['auto', 'combined', 'json', 'jsonl'].includes(format)) throw new Error('--format must be auto, combined, json or jsonl.');
  if (format === 'auto') format = /^[\s\uFEFF]*[\[{]/.test(content) ? 'json' : 'combined';
  let rows, synthetic = false;
  if (format === 'json') {
    let parsed;
    try { parsed = JSON.parse(content.replace(/^\uFEFF/, '')); } catch { throw new Error('Invalid JSON log input.'); }
    if (!Array.isArray(parsed)) {
      if (parsed?.schema !== 'beat-geo/logs@1' || !Array.isArray(parsed.records)) throw new Error('Expected a JSON record array or beat-geo/logs@1 envelope.');
      synthetic = parsed.synthetic === true;
      parsed = parsed.records;
    }
    rows = parsed.map((raw, i) => ({ raw, line: i + 1 }));
  } else {
    rows = content.replace(/^\uFEFF/, '').split(/\r?\n/).map((raw, i) => ({ raw, line: i + 1 })).filter(({ raw }) => raw.trim());
  }
  if (rows.length > MAX_ROWS) throw new Error(`Log input limit is ${MAX_ROWS} records; split the file.`);
  const imported = { total: rows.length, parsed: 0, rejected: 0, otherHost: 0, outsideWindow: 0, inWindow: 0, unrecognized: 0, ambiguous: 0, errors: [] };
  const requests = [], ambiguous = [], bots = new Map(), pages = new Map(), totals = newCounts();
  let observedFrom = null, observedTo = null, configuredHostRequests = 0;
  for (const { raw, line } of rows) {
    let r;
    try {
      let row = raw;
      if (format === 'combined') row = combinedRow(raw);
      if (format === 'jsonl') { try { row = JSON.parse(raw); } catch { bad('invalid_json_line'); } }
      r = normalizeRow(row, hostname, now);
    } catch (error) {
      if (error.message === 'other_host') imported.otherHost++;
      else {
        imported.rejected++;
        if (imported.errors.length < 30) imported.errors.push({ line, code: ['invalid_time', 'future_time', 'invalid_path', 'invalid_combined', 'invalid_request', 'invalid_record', 'invalid_method', 'invalid_status', 'invalid_user_agent', 'invalid_json_line'].includes(error.message) ? error.message : 'invalid_record' });
      }
      continue;
    }
    imported.parsed++;
    if ((start && r.time < start) || (end && r.time >= end)) { imported.outsideWindow++; continue; }
    imported.inWindow++;
    configuredHostRequests += Number(r.hostBasis === 'configured_host');
    observedFrom = !observedFrom || r.time < observedFrom ? r.time : observedFrom;
    observedTo = !observedTo || r.time > observedTo ? r.time : observedTo;
    if (r.recognition.state === 'unrecognized') { imported.unrecognized++; continue; }
    if (r.recognition.state === 'ambiguous') {
      imported.ambiguous++;
      ambiguous.push({ line, time: r.time, path: r.path, candidates: r.recognition.candidates });
      continue;
    }
    const crawler = r.recognition.crawler;
    const request = { line, time: r.time, path: r.path, method: r.method, status: r.status, hostBasis: r.hostBasis,
      crawlerId: crawler.id, verification: 'unverified' };
    requests.push(request);
    count(totals, request);
    if (!bots.has(crawler.id)) bots.set(crawler.id, { ...crawler, ...newCounts(), pagePaths: new Set(), verification: 'unverified' });
    const bot = bots.get(crawler.id);
    count(bot, request); bot.pagePaths.add(r.path);
    const key = JSON.stringify([crawler.id, r.path]);
    if (!pages.has(key)) pages.set(key, { crawlerId: crawler.id, name: crawler.name, path: r.path, ...newCounts(), verification: 'unverified' });
    count(pages.get(key), request);
  }
  return {
    schema: CRAWL_SCHEMA, generatedAt: new Date(now).toISOString(), site: hostname, synthetic,
    ruleVersion: CRAWLER_RULE_VERSION, catalogue: CRAWLERS,
    input: { sha256: createHash('sha256').update(content).digest('hex'), format, ...imported },
    observation: { state: imported.rejected ? imported.parsed ? 'partial' : 'invalid' : imported.inWindow ? 'observed' : 'empty',
      coverage: 'unknown', requestedFrom: start, requestedTo: end, observedFrom, observedTo, configuredHostRequests },
    totals: { ...totals, pages: new Set(requests.map(r => r.path)).size, identities: bots.size, verifiedRequests: null },
    crawlers: [...bots.values()].map(({ pagePaths, ...row }) => ({ ...row, pages: pagePaths.size })).sort((a, b) => b.requests - a.requests || a.id.localeCompare(b.id)),
    pages: [...pages.values()].sort((a, b) => b.requests - a.requests || a.path.localeCompare(b.path) || a.crawlerId.localeCompare(b.crawlerId)),
    requests, ambiguous,
  };
}

export async function loadCrawls(file, options) {
  if ((await stat(file)).size > MAX_LOG_BYTES) throw new Error('Log input limit is 10 MiB.');
  return analyzeCrawls(await readFile(file, 'utf8'), options);
}
