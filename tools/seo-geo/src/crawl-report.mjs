// Shared document blocks: match the existing report theme, with optional evidence disclosures.
export function crawlReportBlocks(c, lang = 'en', { standalone = false } = {}) {
  const zh = lang === 'zh';
  const label = (en, cn) => zh ? cn : en;
  const number = n => new Intl.NumberFormat(zh ? 'zh-CN' : 'en-US').format(n);
  const time = value => value ? value.replace('T', ' ').replace(/(?:\.\d+)?Z$/, '') : '—';
  const purpose = value => zh ? ({ search: '搜索', training: '训练', user: '用户触发' }[value] ?? value) : value;
  const statuses = (row, errorsOnly = false) => Object.entries(row.statuses)
    .filter(([status]) => !errorsOnly || +status >= 400).map(([status, n]) => `${status} × ${number(n)}`).join(' · ');
  const unverified = label('Unverified UA', 'UA 未核验');
  const level = standalone ? 2 : 3;
  const heading = text => ({ t: `h${level}`, text });
  const table = (title, head, rows, previewRows = 12) => ({
    t: 'table', label: title, head, rows, previewRows,
    moreLabel: label(`Show remaining ${number(Math.max(0, rows.length - previewRows))} rows`, `查看其余 ${number(Math.max(0, rows.length - previewRows))} 条`),
  });
  const detail = (title, blocks) => ({ t: 'details', title, level, blocks });
  const i = c.input, o = c.observation, t = c.totals;
  const errors = c.pages.reduce((sum, row) => sum + Object.entries(row.statuses)
    .reduce((n, [status, count]) => n + (+status >= 400 ? count : 0), 0), 0);
  const measured = value => i.inWindow ? number(value) : '—';
  const blocks = [{ t: standalone ? 'h1' : 'h2', text: label('AI crawl observations', 'AI 抓取观察') }];
  if (c.synthetic) blocks.push({ t: 'note', text: label('SYNTHETIC LOG DATA — not real site traffic.', '合成日志演示数据，不是真实网站流量。') });
  blocks.push({ t: 'p', text: label(
    'Requests identified by User-Agent declarations in this import. Identities are unverified; log coverage is unknown.',
    '查看本批日志中 AI 身份声明的访问记录。身份尚未核验，日志覆盖未知。',
  ) }, { t: 'metrics', items: [
    { label: label('Declared requests', '声明请求'), value: measured(t.requests) },
    { label: label('Crawler identities', '身份种类'), value: measured(t.identities) },
    { label: label('Requested paths', '访问路径'), value: measured(t.pages) },
    { label: label('HTTP errors', '异常响应'), value: measured(errors) },
  ] }, { t: 'meta', items: [
    { label: label('Site', '站点'), value: c.site },
    { label: label('Data source', '数据来源'), value: c.synthetic ? label('Synthetic log example · not live', '合成日志示例 · 非实时') : label('Imported log file · not live', '日志文件导入 · 非实时') },
    { label: label('Measures', '统计对象'), value: label('Crawler-declared requests; excludes AI referral visitors', '爬虫声明请求；不包含 AI 引荐访客') },
    { label: label('Observed records · UTC', '记录起止 · UTC'), value: `${time(o.observedFrom)} → ${time(o.observedTo)}` },
    { label: label('Selected range · UTC', '筛选范围 · UTC'), value: o.requestedFrom || o.requestedTo
      ? `${o.requestedFrom ? `${time(o.requestedFrom)} ≤ ` : ''}${label('time', '时间')}${o.requestedTo ? ` < ${time(o.requestedTo)}` : ''}`
      : label('All imported records', '全部导入记录') },
    { label: label('Generated · UTC', '生成时间 · UTC'), value: time(c.generatedAt) },
  ] });
  if (o.state === 'invalid') blocks.push({ t: 'note', text: label('No valid site records were parsed. This is an invalid input, not zero AI traffic.', '没有解析到有效的本站记录。这是输入无效，不是 AI 流量为零。') });
  else if (!i.inWindow) blocks.push({ t: 'note', text: label('No valid site records in the selected window. There is no observation to interpret.', '所选范围内没有有效的本站记录，暂无可解释的观察。') });
  else if (!t.requests) blocks.push({ t: 'note', text: label('No supported crawler declaration matched these records. This does not exclude other or undeclared AI agents.', '本批记录未匹配到内置爬虫声明，不排除其他或未声明身份的 AI Agent。') });
  if (i.rejected) blocks.push({ t: 'note', text: label(`${number(i.rejected)} invalid rows were excluded; results describe only accepted records.`, `已排除 ${number(i.rejected)} 条无效记录，结果仅代表成功解析的部分。`) });
  if (o.configuredHostRequests) blocks.push({ t: 'p', text: label(
    `${number(o.configuredHostRequests)} in-window records use the configured site because the request host is absent. Use a site-specific log.`,
    `范围内 ${number(o.configuredHostRequests)} 条记录按配置站点归属，未提供真实请求主机。请使用单站点日志。`,
  ) });
  const crawlerTitle = label('Crawler declarations', '爬虫身份声明');
  if (c.crawlers.length) blocks.push(heading(crawlerTitle), table(crawlerTitle,
    [label('Identity', '身份'), label('Platform / purpose', '平台／用途'), label('Requests', '请求'), label('Paths', '路径'), label('Last seen · UTC', '最近访问 · UTC'), label('Evidence', '身份依据')],
    c.crawlers.map(row => [row.name, `${row.platform} · ${purpose(row.purpose)}`, number(row.requests), number(row.pages), time(row.lastSeen), unverified]),
  ));
  const pathTitle = label('Requested paths', '访问页面');
  if (c.pages.length) blocks.push(heading(pathTitle), { t: 'p', text: label('Paths omit query strings. Request counts include all methods; method details are in request evidence.', '路径不含查询串，请求数包含所有方法；具体方法可在请求证据中查看。') }, table(pathTitle,
    [label('Path', '路径'), label('Identity', '身份'), label('Requests', '请求'), label('HTTP responses', 'HTTP 响应'), label('Last seen · UTC', '最近访问 · UTC')],
    c.pages.map(row => [row.path, row.name, number(row.requests), statuses(row), time(row.lastSeen)]),
  ));
  const failures = c.pages.filter(row => Object.keys(row.statuses).some(status => +status >= 400));
  const failureTitle = label('Responses to investigate', '值得排查的响应');
  if (failures.length) blocks.push(heading(failureTitle), table(failureTitle,
    [label('Path', '路径'), label('Identity', '身份'), label('HTTP errors', '异常响应')],
    failures.map(row => [row.path, row.name, statuses(row, true)]),
  ), { t: 'p', text: label('Error responses are clues; they do not establish a cause or explain a missing answer citation.', '错误响应是排查线索，不能据此确定原因或解释某次回答未引用。') });
  if (c.requests.length) {
    const title = label(`Request evidence · ${number(c.requests.length)} records`, `请求证据 · ${number(c.requests.length)} 条`);
    blocks.push(detail(title, [table(title,
      [label('Input row / line', '条目／行号'), label('Time · UTC', '时间 · UTC'), label('Identity', '身份'), label('Path', '路径'), label('Method', '方法'), 'HTTP'],
      c.requests.map(row => [number(row.line), time(row.time), row.crawlerId, row.path, row.method, row.status]), 30,
    )]));
  }
  if (c.ambiguous.length) {
    const title = label(`Ambiguous declarations · ${number(c.ambiguous.length)}`, `歧义声明 · ${number(c.ambiguous.length)} 条`);
    blocks.push(detail(title, [{ t: 'p', text: label('Excluded from crawler totals; no single identity can be assigned.', '不计入爬虫汇总，无法确定唯一身份。') }, table(title,
      [label('Input row / line', '条目／行号'), label('Path', '路径'), label('Candidates', '候选身份')],
      c.ambiguous.map(row => [number(row.line), row.path, row.candidates.join(', ')]),
    )]));
  }
  if (i.errors.length) {
    const title = label(`Rejected records · ${number(i.rejected)}`, `无效记录 · ${number(i.rejected)} 条`);
    const reasons = { invalid_time: '时间无效', future_time: '时间超前', invalid_path: '路径无效', invalid_combined: '日志格式无效', invalid_request: '请求格式无效', invalid_record: '记录格式无效', invalid_method: '请求方法无效', invalid_status: '状态码无效', invalid_user_agent: 'UA 字段无效', invalid_json_line: 'JSON 行格式无效' };
    blocks.push(detail(title, [{ t: 'p', text: label('Showing up to 30 rejected records; the total above includes all rejections.', '最多展示前 30 条无效记录，上方数量包含全部无效记录。') }, table(title,
      [label('Input row / line', '条目／行号'), label('Reason', '原因')], i.errors.map(row => [number(row.line), zh ? reasons[row.code] ?? row.code : row.code]), 30,
    )]));
  }
  blocks.push(detail(label('Method and import details', '统计口径与导入详情'), [
    { t: 'meta', items: [
      { label: label('Import', '导入'), value: label(`${number(i.total)} rows · ${number(i.parsed)} valid site records · ${number(i.rejected)} invalid`, `${number(i.total)} 条输入 · ${number(i.parsed)} 条本站有效记录 · ${number(i.rejected)} 条无效`) },
      { label: label('Excluded', '范围排除'), value: label(`${number(i.otherHost)} other-host rows · ${number(i.outsideWindow)} outside the selected window`, `${number(i.otherHost)} 条其他主机 · ${number(i.outsideWindow)} 条在筛选范围外`) },
      { label: label('Unrecognized', '未识别请求'), value: label(`${number(i.unrecognized)} (includes ordinary browsers) · ${number(i.ambiguous)} ambiguous`, `${number(i.unrecognized)} 条（包括普通浏览器）· ${number(i.ambiguous)} 条歧义声明`) },
      { label: label('Response methods', '响应方法'), value: `GET 2xx: ${number(t.get2xx)} · HEAD: ${number(t.head)} · 304: ${number(t.notModified)}` },
      { label: label('Rule version', '规则版本'), value: c.ruleVersion },
      { label: 'SHA-256', value: i.sha256 },
    ] },
    { t: 'p', text: label('The event extent is not proof of continuous coverage. UA declarations are not authenticated; missing records do not prove no visit. Requests do not prove indexing, training or answer citations.', '事件起止不证明连续覆盖。UA 声明未经核验，缺少记录不证明没有来访；请求不证明收录、训练入库或回答引用。') },
    { t: 'p', text: label(`Catalogue scope: ${c.catalogue.map(row => row.name).join(', ')}. Other agents may remain unrecognized.`, `识别范围：${c.catalogue.map(row => row.name).join('、')}。其他 Agent 可能仍未识别。`) },
    { t: 'p', text: label('Different query variants share a path. IPs, full UAs and referrers are not exported. Identical rows remain separate requests. Do not sum overlapping imports.', '不同查询参数版本按同一路径展示。不导出 IP、完整 UA 或来源页。相同输入行保留为独立请求，重叠导入结果不应相加。') },
  ]));
  return blocks;
}
