// Public BeatAPI contract / prices checked 2026-10-31. Not a billing guarantee.
export const SEO_PRICE_DATE = '2026-10-31';
export const SEO_TOOLS = {
  'keyword-overview': { keywords: 100, market: true, base: .018, row: .0003 },
  'keyword-ideas': { keywords: 20, market: true, paged: true, base: .018, row: .0003 },
  'keyword-difficulty': { keywords: 100, market: true, base: .018, row: .0003 },
  'domain-overview': { market: true, base: .018, row: .0003 },
  'ranked-keywords': { market: true, paged: true, base: .018, row: .0003 },
  'top-pages': { market: true, paged: true, base: .018, row: .0003 },
  competitors: { market: true, paged: true, base: .018, row: .0003 },
  'backlink-summary': { base: .035, row: .0002 },
  backlinks: { paged: true, base: .035, row: .0002 },
  'domain-rating': { base: .005, row: 0 },
  'domain-rating-history': { base: 0, row: .004 },
  'site-traffic': { base: .005, row: 0 },
};
export const SEO_WORKFLOWS = {
  overview: ['domain-overview', 'domain-rating', 'site-traffic'],
  topics: ['keyword-ideas', 'keyword-overview'],
  research: ['competitors', 'ranked-keywords', 'top-pages'],
  links: ['backlink-summary', 'backlinks'],
  history: ['domain-rating-history'],
  difficulty: ['keyword-difficulty'],
  all: Object.keys(SEO_TOOLS),
};
export const money = n => Math.round(n * 1e6) / 1e6;
export function seoDomain(value) {
  if (typeof value !== 'string' || value.length > 2048) throw new Error('SEO domain must be a hostname or URL.');
  let u;
  try { u = new URL(value.includes('://') ? value : `https://${value}`); } catch { throw new Error('Invalid SEO domain.'); }
  const host = u.hostname.toLowerCase().replace(/^www\./, '');
  if (!['https:', 'http:'].includes(u.protocol) || u.username || u.password || u.port || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/.test(host)) throw new Error('Invalid SEO domain.');
  return host;
}
const int = (n, lo, hi, label) => {
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`SEO ${label} must be ${lo}–${hi}.`);
  return n;
};
export function seoInput(tool, raw = {}) {
  const spec = Object.hasOwn(SEO_TOOLS, tool) ? SEO_TOOLS[tool] : null;
  if (!spec) throw new Error('Unknown SEO endpoint.');
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('SEO input must be an object.');
  const allowed = [spec.keywords ? 'keywords' : 'domain', ...(spec.market ? ['country', 'language'] : []), ...(spec.paged ? ['limit', 'offset'] : []), ...(tool === 'ranked-keywords' ? ['contains'] : []), ...(tool === 'backlinks' ? ['one_per_domain'] : []), ...(tool === 'site-traffic' ? ['months'] : [])];
  if (Object.keys(raw).some(k => !allowed.includes(k))) throw new Error(`Unknown or unsupported input field for ${tool}.`);
  const input = {};
  if (spec.keywords) {
    if (!Array.isArray(raw.keywords) || !raw.keywords.length || raw.keywords.length > spec.keywords || raw.keywords.some(k => typeof k !== 'string' || !k.trim() || [...k].length > 80 || /[\x00-\x1f]/.test(k))) throw new Error(`SEO ${tool} needs 1–${spec.keywords} keywords of at most 80 characters.`);
    input.keywords = [...new Set(raw.keywords.map(k => k.trim().toLowerCase()))];
  } else input.domain = seoDomain(raw.domain);
  if (spec.market) {
    input.country = raw.country ?? 'us';
    if (!/^[a-z]{2}$/.test(input.country) || input.country === 'cn') throw new Error('SEO country must be a covered lowercase market code; cn is not supported.');
    if (raw.language !== undefined) {
      if (typeof raw.language !== 'string' || !/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(raw.language)) throw new Error('Invalid SEO language.');
      input.language = raw.language;
    }
  }
  if (spec.paged) {
    input.limit = int(raw.limit ?? 20, 1, tool === 'competitors' ? 999 : 1000, 'limit');
    input.offset = int(raw.offset ?? 0, 0, 10000, 'offset');
  }
  if (raw.contains !== undefined) {
    if (typeof raw.contains !== 'string' || !raw.contains.trim() || [...raw.contains].length > 80 || /[%_\x00-\x1f]/.test(raw.contains)) throw new Error('Invalid SEO contains filter.');
    input.contains = raw.contains.trim();
  }
  if (tool === 'backlinks') {
    if (raw.one_per_domain !== undefined && typeof raw.one_per_domain !== 'boolean') throw new Error('one_per_domain must be boolean.');
    input.one_per_domain = raw.one_per_domain ?? true;
  }
  if (tool === 'site-traffic') {
    input.months = raw.months ?? 3;
    if (![3, 6, 12].includes(input.months)) throw new Error('SEO months must be 3, 6 or 12.');
  }
  return input;
}
export function seoMaxCost(tool, input) {
  const spec = SEO_TOOLS[tool];
  if (tool === 'site-traffic') return {3:.005,6:.01,12:.015}[input.months];
  const rows = tool === 'domain-rating-history' ? 24 : spec.paged ? input.limit : spec.keywords ? input.keywords.length : 1;
  return money(spec.base + spec.row * rows);
}
