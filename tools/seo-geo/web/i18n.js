import { messages } from './messages.js';

export let locale = typeof location !== 'undefined' && new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'zh';
const staticText = [];
const staticAttributes = [];
const decorative = {
  'SEO & GEO WORKSPACE': 'SEO 与 GEO 工作台',
  'DISCOVER. UNDERSTAND. ACT.': '发现 · 理解 · 行动',
  'SEO / DOMAIN': 'SEO / 域名',
  'SEO / KEYWORDS': 'SEO / 关键词',
  'SEO / BACKLINKS': 'SEO / 外链',
  'RESEARCH LIBRARY': '研究报告',
  'FROM EVIDENCE TO ACTION': '从研究到行动',
  'ONE CONNECTION, TWELVE CAPABILITIES': '一个连接，十二项能力',
  'REVIEW YOUR ANALYSIS': '分析预览',
};
function text(source) {
  const key = source.trim();
  const translated = locale === 'en' ? (Object.hasOwn(messages, key) ? messages[key] : undefined) : decorative[key];
  if (translated !== undefined) return source.replace(key, translated);
  if (locale === 'en') return source.replace(/^预算需覆盖预计最高费用 \$(\d+\.\d+)，且不超过 \$100。$/, 'The budget must cover the estimated maximum cost of $$$1 and be no more than $100.');
  return source;
}
// Translate only authored template segments, before inserting any account or report data.
export function ui(source, ...values) {
  const pattern = typeof source === 'string' ? source : source.reduce((out, part, i) => out + (i ? `{${i - 1}}` : '') + part, '');
  const translated = /<[a-z/]/i.test(pattern)
    ? pattern.split(/(<[^>]*>)/g).map(part => part.startsWith('<')
      ? part.replace(/((?:title|placeholder|aria-label)=")([^"]*)(")/g, (_, before, value, after) => before + text(value) + after)
      : text(part)).join('')
    : text(pattern);
  return typeof source === 'string' ? translated : translated.replace(/\{(\d+)\}/g, (match, index) => index < values.length ? String(values[index] ?? '') : match);
}
export function bindStaticText() {
  const walker = document.createTreeWalker(document.documentElement, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (!node.parentElement?.closest('script,style,textarea') && node.textContent.trim()) staticText.push([node, node.textContent]);
  }
  document.querySelectorAll('[title],[placeholder],[aria-label]').forEach(element => {
    for (const attr of ['title', 'placeholder', 'aria-label']) if (element.hasAttribute(attr)) staticAttributes.push([element, attr, element.getAttribute(attr)]);
  });
  setLocale(locale);
}
export function setLocale(next) {
  locale = next === 'en' ? 'en' : 'zh';
  document.documentElement.lang = locale === 'en' ? 'en' : 'zh-CN';
  for (const [node, source] of staticText) if (node.isConnected) node.textContent = text(source);
  for (const [node, attr, source] of staticAttributes) if (node.isConnected) node.setAttribute(attr, text(source));
}
