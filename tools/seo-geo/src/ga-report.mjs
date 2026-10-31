// Same document blocks and theme as answer and crawl reports; no extra UI framework.
export function gaReportBlocks(g, lang = 'en', { standalone = false } = {}) {
  const zh = lang === 'zh', label = (en, cn) => zh ? cn : en;
  const n = value => new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US', { maximumFractionDigits: 2 }).format(value);
  const platformName = value => value === 'Other AI Assistant' ? label('Other AI Assistant', '其他 AI 助手') : value;
  const time = value => value ? value.replace('T', ' ').replace(/(?:\.\d+)?Z$/, '') : '—';
  const heading = text => ({ t: standalone ? 'h2' : 'h3', text });
  const table = (title, head, rows) => ({ t: 'table', label: title, head, rows, previewRows: 12,
    moreLabel: label(`Show remaining ${Math.max(0, rows.length - 12)} rows`, `查看其余 ${Math.max(0, rows.length - 12)} 条`) });
  const blocks = [{ t: standalone ? 'h1' : 'h2', text: label('AI referral traffic · GA4', 'AI 引荐流量 · GA4') }];
  if (g.synthetic) blocks.push({ t: 'note', text: label('SYNTHETIC GA DATA — not real site traffic.', '合成 GA 演示数据，不是真实网站流量。') });
  blocks.push({ t: 'p', text: label('Sessions attributed by GA to known AI source domains or its AI Assistant channel. Sessions are not unique visitors or crawler requests.',
    '查看 GA 归因到已知 AI 来源域名或原生 AI Assistant 渠道的会话。会话不等于独立访客，也不是爬虫请求。') },
  { t: 'metrics', items: [
    { label: label('AI-attributed sessions', 'AI 来源会话'), value: n(g.totals.sessions) },
    { label: label('Engaged sessions', '互动会话'), value: n(g.totals.engagedSessions) },
    { label: label('Configured key events', '已配置关键事件'), value: n(g.totals.keyEvents) },
    { label: label('Platform groups', '平台分组'), value: n(g.platforms.length) },
  ] }, { t: 'meta', items: [
    { label: label('Site', '站点'), value: g.site },
    { label: label('GA property', 'GA 属性'), value: `${g.property.name} · ${g.property.id}` },
    { label: label('Data source', '数据来源'), value: label('GA4 Data API snapshot · not live', 'GA4 Data API 快照 · 非实时') },
    { label: label('Date range · inclusive', '日期范围 · 含首尾日期'), value: `${g.dates.startDate} → ${g.dates.endDate}` },
    { label: label('Property timezone', '属性时区'), value: g.timeZone ?? label('Unknown', '未知') },
    { label: label('Fetched · UTC', '读取时间 · UTC'), value: time(g.fetchedAt) },
    { label: label('Refresh', '刷新方式'), value: label('Run ga sync to read again; no background schedule', '运行 ga sync 重新读取；当前未启用后台定时同步') },
  ] });
  if (g.warnings.length) blocks.push({ t: 'note', text: label(`GA data limits: ${g.warnings.join(', ')}. Figures reflect returned data and may be incomplete.`,
    `GA 数据限制：${g.warnings.map(w => ({ thresholded: '隐私阈值', otherRow: '高基数合并', sampled: '抽样', truncated: '数据截断', restricted: '指标权限限制', emptyReason: 'API 空数据原因', 'timezone-unknown': '时区未知', 'unclassified-rows': '存在未分类行' }[w.split(':').at(-1)] ?? w)).join('、')}。数字只代表返回的数据，可能不完整。`) });
  if (g.observation === 'empty') blocks.push({ t: 'note', text: label('No AI-attributed rows returned for this hostname and period. This does not establish that no AI traffic occurred.', '此主机与日期范围未返回 AI 来源记录，不代表不存在 AI 流量。') });
  const platform = label('Platforms', '平台来源');
  if (g.platforms.length) blocks.push(heading(platform), table(platform,
    [label('Platform', '平台'), label('Sessions', '会话'), label('Engaged sessions', '互动会话'), label('Key events', '关键事件')],
    g.platforms.map(r => [platformName(r.platform), n(r.sessions), n(r.engagedSessions), n(r.keyEvents)])));
  const landing = label('AI landing pages', 'AI 来访落地页');
  if (g.pages.length) blocks.push(heading(landing), table(landing,
    [label('Path', '路径'), label('Platform', '平台'), label('Source / medium', '来源／媒介'), label('Sessions', '会话'), label('Key events', '关键事件')],
    g.pages.map(r => [r.path, platformName(r.platform), `${r.source} / ${r.medium}`, n(r.sessions), n(r.keyEvents)])));
  const evidence = label('Source evidence and limits', '来源依据与统计边界');
  blocks.push({ t: 'details', title: evidence, level: standalone ? 2 : 3, blocks: [
    table(evidence, [label('Source', '来源'), label('Medium', '媒介'), label('Default channel', '原生渠道'), label('Platform', '平台'), label('Basis', '依据'), label('Sessions', '会话')],
      g.sources.map(r => [r.source, r.medium, r.channel, platformName(r.platform), r.basis === 'source-domain' ? label('Known domain', '已知来源域名') : r.basis === 'ga-channel' ? 'GA AI Assistant' : label('Unclassified', '未分类'), n(r.sessions)])),
    { t: 'ul', items: [
      label('Known domains are matched exactly or as subdomains. Custom AI Traffic labels, brand substrings and all .ai domains are not assumed to be official AI sources.', '按已知域名及其子域名归类；不会凭自定义 AI Traffic 标签、品牌子串或 .ai 后缀认定官方来源。'),
      label('Totals come from source rows. Landing-page figures are a separate view and are not added to source totals. Unique users are not summed across platforms.', '总览来自来源表；落地页是另一视图，不与来源表相加。不会将跨平台用户数相加作为总访客。'),
      label('Key events reflect the property configuration, not verified purchases or leads. Attribution does not prove that an answer cited your site.', '关键事件依赖该属性的配置，不直接解释为购买或线索。来源归因不证明回答引用过本站。'),
      label('Exact hostname filter; subdomains need separate connections. Missing referrers, blocked analytics, unclicked exposure and crawler activity remain outside this report.', '按主机名精确筛选；子域名单独连接。缺失来源、统计脚本被阻止、未点击曝光及爬虫活动不在本报告内。'),
    ] },
  ] });
  return blocks;
}
