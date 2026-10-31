import { seoOpportunities } from './seo.mjs';
import { seoFailureMessage, seoStopMessage } from './seo-failure.mjs';
const NAMES = {
  'domain-overview':['Search footprint','搜索概览'],competitors:['Search competitor candidates','搜索竞品候选'],
  'ranked-keywords':['Ranking keywords','已有排名关键词'],'top-pages':['Leading search pages','搜索主要页面'],
  'keyword-overview':['Keyword demand','关键词需求'],'keyword-ideas':['Topic discovery','主题拓展'],'keyword-difficulty':['Keyword difficulty','关键词难度'],
  'domain-rating':['Domain rating','域名评分'],'domain-rating-history':['Domain rating history','域名评分历史'],
  'backlink-summary':['Link profile','外链概况'],backlinks:['Link sources','外链来源'],'site-traffic':['Estimated site visits','网站访问量估算'],
};
const COLUMNS = {
  'keyword-overview':['keyword','search_volume','keyword_difficulty','intent','cpc_usd','updated_at'],
  'keyword-ideas':['keyword','search_volume','keyword_difficulty','intent','cpc_usd','updated_at'],
  'keyword-difficulty':['keyword','keyword_difficulty'],
  'ranked-keywords':['keyword','position','url','search_volume','search_traffic_estimate','position_seen_at'],
  'top-pages':['url','ranking_keywords','search_traffic_estimate','traffic_value_usd_estimate'],
  competitors:['domain','shared_keywords','avg_position','ranking_keywords','search_traffic_estimate'],
  backlinks:['source_url','target_url','anchor','source_authority','dofollow','is_lost','is_broken','last_seen'],
  'domain-rating-history':['month','domain_rating'],
};
function flatten(data,prefix='') {
  return Object.entries(data).filter(([k])=>!['object','request_id','usage','results'].includes(k)).flatMap(([k,v])=>{
    const key=prefix?`${prefix}.${k}`:k;
    if(v && typeof v==='object') return Array.isArray(v)?v.flatMap((r,i)=>flatten(r,`${key}[${i}]`)):flatten(v,key);
    return [[key,v]];
  });
}
export function seoReportBlocks(s,lang='en',{standalone=false,geo=null}={}) {
  const zh=lang==='zh',t=(en,cn)=>zh?cn:en;
  const table=(label,head,rows)=>({t:'table',label,head,rows,previewRows:12,moreLabel:t('Show all returned rows','查看全部返回记录')});
  const blocks=[{t:standalone?'h1':'h2',text:t('SEO & GEO · search research','SEO & GEO · 搜索研究')}];
  if(s.synthetic) blocks.push({t:'note',text:t('SYNTHETIC SEO DATA — illustrative fixtures, not live measurements.','合成 SEO 演示数据，不是真实接口实测。')});
  blocks.push({t:'p',text:t('Search estimates, AI answer samples, GA4 visits and crawl observations are separate evidence sources. No combined score or causal attribution. Missing values are unknown, not zero.','搜索估算、AI 回答采样、GA4 访问与爬虫观察分别呈现，不合成总分，不推断因果。缺失值显示未知，不填成零。')},
    {t:'meta',items:[{label:t('Site','站点'),value:s.site},{label:t('Source','来源'),value:'BeatAPI SEO API · https://docs.beatapi.io/zh/seo'},
      {label:t('Refresh','刷新'),value:t('Saved snapshot; reopening this report makes no requests.','已保存快照；重新打开报告不发起接口请求。')},
      {label:t('Recorded charges (USD)','已记录费用（美元）'),value:s.actualUsd ?? s.records.reduce((n,r)=>n+(r.actualUsd??0),0)},
      {label:t('Unknown charges','费用未确认的请求'),value:s.records.filter(r=>r.actualUsd===undefined).length} ]});
  if(s.stopped) blocks.push({t:'note',text:seoStopMessage(s.stopped,lang)});
  const failed=s.records.filter(r=>r.status!=='ok');
  if(failed.length)blocks.push({t:standalone?'h2':'h3',text:t('Queries needing attention','需要处理的查询')},
    table(t('Failed queries and next steps','失败查询与处理方法'),[t('Query','查询'),t('Target','对象'),t('What to do next','处理方法')],failed.map(r=>[NAMES[r.tool][zh?1:0],r.input.domain??r.input.keywords.join(', '),seoFailureMessage(r,lang)])),
    {t:'note',text:t('Failed or missing results are not zero values. Charges that have not been confirmed must be checked against BeatAPI account usage before another analysis.', '失败或缺失的结果不代表数值为零。未确认的费用需以 BeatAPI 账户用量核对，重新分析前请先检查。')});
  const domains=[...new Set(s.records.map(r=>r.input.domain).filter(Boolean))];
  if(geo) blocks.push(table(t('AI citation context by domain','域名的 AI 引用背景'),[t('Domain','域名'),t('Cited answers / sampled answers','被引用回答数 / 采样回答数'),t('Scope','范围')],domains.map(domain=>{
    const d=geo.overall.domains.find(r=>r.domain===domain);
    return [domain,`${d?.answersCited??0}/${geo.overall.n}`,t('Only this answer run; SEO pages are not necessarily cited pages.','仅限本次回答；SEO 热门页面不等于被 AI 引用的页面。')];
  })));
  const overviewRows = s.records.filter(r => r.status === 'ok' && r.tool === 'domain-overview').map(r => {
    const dr=s.records.find(x=>x.status==='ok' && x.tool==='domain-rating' && x.input.domain===r.input.domain)?.response;
    const traffic=s.records.find(x=>x.status==='ok' && x.tool==='site-traffic' && x.input.domain===r.input.domain)?.response;
    return [r.input.domain,`${r.input.country} / ${r.response.language??'—'}`,r.response.organic?.ranking_keywords??'—',r.response.organic?.search_traffic_estimate??'—',dr?.domain_rating??'—',traffic?.site_visits_estimate??'—'];
  });
  if(overviewRows.length) blocks.push({t:standalone?'h2':'h3',text:t('Website comparison','网站对比')},table('Website comparison',[t('Domain','域名'),t('Market','市场'),t('Ranking keywords','排名词数'),t('Search estimate','搜索流量估算'), 'DR',t('Total visits estimate','总访问量估算')],overviewRows));
  const groups=[['Website overview','网站概览',['domain-overview','domain-rating','site-traffic']],['Topics & questions','主题与问题',['keyword-ideas','keyword-overview','keyword-difficulty']],['Competitors & cited sources','竞品与引用来源',['competitors','ranked-keywords','top-pages']],['Link research','外链研究',['backlink-summary','backlinks']],['Rating history','评分历史',['domain-rating-history']]];
  for(const group of groups) {
    const records=s.records.filter(r=>group[2].includes(r.tool));
    if(!records.length)continue;
    blocks.push({t:standalone?'h2':'h3',text:group[zh?1:0]});
    for(const r of records) {
    const title=`${NAMES[r.tool][zh?1:0]} · ${r.input.domain??r.input.keywords.join(', ')} · ${r.input.country??'global'}${r.input.language?` / ${r.input.language}`:''}`;
    const detail=[{t:'meta',items:[{label:t('Fetched at','获取时间'),value:r.fetchedAt},{label:t('Request parameters','查询范围'),value:JSON.stringify(r.input)},
      {label:t('Request ID','请求 ID'),value:r.response?.request_id??'—'},{label:t('Actual USD','实际费用（美元）'),value:r.actualUsd??'—'}]}];
    if(r.status!=='ok') detail.push({t:'note',text:seoFailureMessage(r,lang)});
    else {
      const data=r.response;
      if(data.has_data===false || data.results?.length===0) detail.push({t:'note',text:t('No records returned for this query. This does not establish zero traffic, zero score or absent coverage.','本次查询未返回记录，不代表流量、评分为零或内容不存在。')});
      if(r.tool==='domain-rating-history' && data.results?.length) detail.push({t:'bars',label:t('Monthly DR · scale 0–100','月度 DR · 刻度 0–100'),max:100,points:data.results.filter(p=>typeof p.domain_rating==='number').map(p=>({label:p.month,value:p.domain_rating}))});
      if(r.tool==='site-traffic' && data.monthly_visits?.length) detail.push({t:'bars',label:t('Monthly visits · estimates, returned months only','月度访问量 · 估算，仅显示返回月份'),points:data.monthly_visits.filter(p=>typeof p.visits==='number').map(p=>({label:p.month,value:p.visits}))});
      if(COLUMNS[r.tool] && data.results?.length) detail.push(table(title,COLUMNS[r.tool],data.results.map(row=>COLUMNS[r.tool].map(k=>row[k]??'—'))));
      else if(!COLUMNS[r.tool]) detail.push(table(title,[t('Metric','指标'),t('Value','值')],flatten(data)));
      if(r.tool==='keyword-overview') for(const row of data.results??[]) if(row.monthly_searches?.length) detail.push(table(`${row.keyword} · monthly_searches`,['year','month','search_volume'],row.monthly_searches.map(m=>[m.year,m.month,m.search_volume??'—'])));
      if(r.tool==='ranked-keywords') detail.push({t:'note',text:t('Recorded rankings, not live SERP. contains is a substring filter. Returned pages do not prove absence of other rankings.','这是已记录排名，不是实时 SERP；contains 为子串筛选。当前分页不能证明其他排名不存在。')});
      if(r.tool==='competitors') detail.push({t:'note',text:t('Search competitors are candidates. Confirm business relevance before adding to the GEO brand configuration.','搜索竞品仅为候选，确认业务相关性后再加入 GEO 品牌配置。')});
      detail.push({t:'details',title:t('Complete retained evidence','完整保留的字段证据'),level:3,blocks:[table('Evidence',['field','value'],flatten({...data,results:undefined}).concat((data.results??[]).flatMap((row,i)=>flatten(row,`results[${i}]`))))]});
    }
    blocks.push({t:'details',title,level:3,blocks:detail});
    }
  }
  const tasks=seoOpportunities(s,geo);
  if(tasks.length) blocks.push({t:standalone?'h2':'h3',text:t('Content research tasks · hypotheses','内容研究任务 · 待验证假设')},
    table('Content research',[t('Keyword','关键词'),t('Domain / page','域名 / 页面'),t('AI citations','AI 引用'),t('Evidence','证据'),t('Next step','下一步')],tasks.map(a=>[a.keyword,a.url??a.domain,a.aiCited??'—',`${a.requestId??a.recordId} · ${a.positionSeenAt??'unknown source date'}`,t(a.nextStep,'核查该排名页面与自己已有内容，再决定更新或新建；不据此断言内容缺口或因果。')])));
  blocks.push({t:'note',text:t('Keyword volume is not AI question volume. DR (0–100) and link authority (0–1000) are different scales. Total visits and search traffic estimates must not be added or directly compared. Third-party gen_ai shares are not measured GA4 sessions. Fetch time is not the date the source data was observed.','关键词搜索量不是 AI 问题量。DR（0–100）与外链权威度（0–1000）不可换算。总访问量与搜索流量估算不可相加或直接比较。第三方 gen_ai 占比不是 GA4 实测会话。获取时间不是源数据观测时间。')});
  return blocks;
}
