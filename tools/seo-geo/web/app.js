import { enhanceSelects } from './selects.js';
import { ui, locale, setLocale, bindStaticText } from './i18n.js';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const token=$('meta[name="workbench-token"]').content;
const base=$('meta[name="workbench-base"]').content;
let monitorSelection=null;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const names=()=>({'domain-overview':ui('域名搜索概览'),'domain-rating':ui('域名评分 DR'),'site-traffic':ui('网站流量'),'keyword-overview':ui('关键词概览'),'keyword-ideas':ui('关键词拓展'),'keyword-difficulty':ui('关键词难度'),competitors:ui('搜索竞品'),'ranked-keywords':ui('排名关键词'),'top-pages':ui('热门页面'),'backlink-summary':ui('外链概况'),backlinks:ui('外链列表'),'domain-rating-history':ui('DR 历史')});
const paged=['keyword-ideas','ranked-keywords','top-pages','competitors','backlinks'];
const market=['keyword-overview','keyword-ideas','keyword-difficulty','domain-overview','ranked-keywords','top-pages','competitors'];
let state={runs:[],key:{}},selected=null,detail=null,plan=null,poll=null,exactSaved=null,view='home';
const questionDrafts=new Map();
const money=n=>`$${Number(n).toFixed(4)}`;
const time=s=>new Date(s).toLocaleString(locale==='zh'?'zh-CN':'en-US',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'});
function notice(text,error=false){text=ui(text);const el=$('#notice');el.textContent=text;el.hidden=false;el.classList.toggle('error',error);if(error&&$('#monitor-dialog').open){$('#monitor-feedback').textContent=text;$('#monitor-feedback').hidden=false;}if(error&&$('#plan-dialog').open){$('#plan-feedback').textContent=text;$('#plan-feedback').hidden=false;}}
async function api(route,data){const response=await fetch(`${base}/api/${route}?lang=${locale}`,{method:data===undefined?'GET':'POST',headers:{'X-Workbench-Token':token,...(data!==undefined?{'Content-Type':'application/json'}:{})},...(data!==undefined?{body:JSON.stringify(data)}:{})});const body=await response.json();if(!response.ok)throw new Error(body.error??ui('请求失败'));return body;}
async function guarded(fn,button){$('#notice').hidden=true;$('#plan-feedback').hidden=true;$('#monitor-feedback').hidden=true;if(button)button.disabled=true;try{return await fn();}catch(e){notice(e.message,true);}finally{if(button)button.disabled=false;}}
function show(next){if(next==='settings'&&state.workspace){window.top.location.assign(state.workspace.settingsUrl);return;}const changed=next!==view;if(next!==view&&$('#notice').classList.contains('error'))$('#notice').hidden=true;view=next;$$('.view').forEach(el=>el.hidden=el.id!==`view-${next}`);$$('.nav').forEach(el=>el.classList.toggle('active',el.dataset.view===next));$('#breadcrumb').textContent=ui`工作空间 / ${{home:ui('分析工作台'),domain:ui('域名概览'),keywords:ui('关键词'),backlinks:ui('外链'),results:ui('报告与历史'),actions:ui('内容与问题'),settings:ui('连接设置')}[next]}`;if(next==='actions')renderActions();location.hash=next;if(base&&window.parent!==window)window.parent.postMessage({type:'beatgeo:seo-view',view:next},location.origin);if(changed){window.scrollTo(0,0);const heading=$(`#view-${next} h1`);heading.tabIndex=-1;heading.classList.add('route-heading');heading.focus({preventScroll:true});}}
function lines(id){return $(`#${id}`).value.split(/[\n,，]/).map(s=>s.trim()).filter(Boolean);}
function config(){
 if(exactSaved)return structuredClone(exactSaved);
 const site=$('#site').value.trim(),country=$('#custom-country').value.trim()||$('#country').value,language=$('#language').value.trim(),limit=Number($('#limit').value),months=Number($('#months').value),tool=$('#endpoint').value,keywords=lines('keywords');
 if(tool){const input=tool.startsWith('keyword-')?{keywords}:{domain:$('#target-domain').value.trim()||site};if(market.includes(tool)){input.country=country;if(language)input.language=language;}if(paged.includes(tool)){input.limit=limit;input.offset=Number($('#offset').value);}if(tool==='site-traffic')input.months=months;if(tool==='ranked-keywords'&&$('#contains').value.trim())input.contains=$('#contains').value.trim();if(tool==='backlinks')input.one_per_domain=$('#one-per-domain').checked;return {site,requests:[{tool,input}]};}
 return {site,country,...(language?{language}:{}),competitors:lines('competitors'),sources:lines('sources'),keywords,workflows:$$('input[name="workflow"]:checked').map(e=>e.value),limit,months};
}
function lockSavedScope(){
 const locked=!!exactSaved;$('#saved-scope').hidden=!locked;
 $('#saved-scope-count').textContent=locked?ui`${exactSaved.requests.length} 项精确查询已恢复。预算可直接调整，查询范围保持不变。`:'';
 $$('#project-form input, #project-form textarea, #project-form select').forEach(el=>el.disabled=locked&&el.id!=='budget');
}
function fill(c){
 if(!c)return;
 const request=c.requests?.length===1?c.requests[0]:null,input=request?.input??c;
 exactSaved=c.requests?.length>1?structuredClone(c):null;
 $('#site').value=c.site??'';
 if(input.country&&!$$('#country option').some(o=>o.value===input.country))$('#country').add(new Option(input.country.toUpperCase(),input.country));
 $('#country').value=input.country??'us';$('#language').value=input.language??'';$('#custom-country').value='';
 for(const k of ['competitors','sources'])$(`#${k}`).value=(c[k]??[]).join('\n');
 $('#keywords').value=(input.keywords??[]).join('\n');$('#limit').value=input.limit??10;$('#months').value=input.months??3;
 $('#endpoint').value=request?.tool??'';$('#exact-options').hidden=!request;
 $('#target-domain').value=request?.input.domain??'';$('#contains').value=input.contains??'';$('#offset').value=input.offset??0;$('#one-per-domain').checked=input.one_per_domain!==false;
 $$('#workflows input').forEach(e=>e.checked=!c.requests&&((c.workflows??['overview','research']).includes(e.value)||(c.workflows??[]).includes('all')));
 if(request) $('.advanced').open=true;
 lockSavedScope();
}
function captureQuestions(dirty=true){
 if(!detail?.snapshot||!$('#questions-form'))return;
 questionDrafts.set(detail.meta.id,{dirty:dirty||questionDrafts.get(detail.meta.id)?.dirty===true,values:$$('[data-question]').map(el=>({id:detail.candidates.candidates[Number(el.dataset.question)].id,text:el.value,checked:$(`input[name="question"][value="${el.dataset.question}"]`).checked}))});
}
function renderWorkspace(){
 if(!state.workspace)return;
 document.body.classList.add('managed');
 $('#step-key').textContent=state.key.present?ui('✓ 使用统一 API Key'):ui('1 在品牌 → API Key 中绑定 Key');
 $('#view-home .hero h1').textContent=ui('分析工作台');
 $('#view-home .hero-description').textContent=ui`${state.workspace.brandName} · 查看网站、关键词与外链，选好的问题可直接加入 GEO。`;
 $('#api-key').disabled=true;$('#key-form').hidden=true;
 $$('.nav[data-view="settings"]').forEach(el=>el.hidden=true);
}
async function refresh(initial=false){state=await api('state');if(initial)fill(state.project);renderState();renderHistory();renderDataViews();if(state.active&&!poll)poll=setInterval(tick,1600);if(!state.active&&poll){clearInterval(poll);poll=null;}return state;}
function renderState(){const key=state.key;renderWorkspace();$('#key-pill').innerHTML=key.present?`${key.verified?ui('BeatAPI 已查询成功'):ui('Key 已保存 · 待验证')} <span>↗</span>`:ui('未连接 BeatAPI <span>↗</span>');$('#key-pill').classList.toggle('connected',key.present);$('#step-key').classList.toggle('complete',key.present);$('#step-key').innerHTML=`<b>${key.present?'✓':'1'}</b>${state.workspace?(key.present?ui('使用统一 API Key'):ui('在品牌 → API Key 中绑定 Key')):(key.present?ui('已保存 API Key'):ui('连接 API Key'))}`;$('#key-status').textContent=key.present?`${key.remembered?ui('Key 已保存在本机私有文件'):ui('Key 仅在本次服务内存中可用')}${locale==='zh'?'。':'. '}${key.verified?ui('本次服务已有成功查询。'):ui('尚未验证远程权限和余额。')}`:ui('尚未连接 Key。可以先体验示例，或免费预览查询计划。');$('#disconnect').disabled=!key.present;$('#running').hidden=!state.active;if(state.active){const job=state.runs.find(r=>r.id===state.active.id);$('#running-title').textContent=state.active.cancelling?ui('正在停止后续查询…'):ui`正在分析 ${job?.site??''}`;$('#running-progress').textContent=ui`已完成 ${job?.completed??0} / ${job?.total??0} 个查询。当前请求可能需要几十秒，结果会逐步保存。`;$('#cancel-run').disabled=state.active.cancelling;}}
const statuses=()=>({complete:ui('已完成'),running:ui('分析中'),partial:ui('部分完成'),failed:ui('未完成'),cancelled:ui('已停止'),interrupted:ui('已中断')});
function renderHistory(){const el=$('#history-list');el.innerHTML=state.runs.length?state.runs.map(r=>ui`<button class="history-item ${r.id===selected?'selected':''}" data-run="${esc(r.id)}"><strong>${esc(r.site)}</strong><small>${esc(time(r.createdAt))}</small><small><span class="tag ${r.synthetic?'demo':['partial','failed','interrupted'].includes(r.status)?'error':''}">${r.synthetic?ui('合成示例'):esc(statuses()[r.status]??r.status)}</span> ${r.completed??0}/${r.total??0} 项</small></button>`).join(''):ui('<p class="muted">还没有分析记录</p>');}
async function openRun(id){if(selected!==id){detail=null;$('#report-panel').innerHTML=ui('<p class="muted" role="status">正在读取报告…</p>');renderActions();}selected=id;renderDataViews();const requestedLocale=locale,loaded=await api(`runs/${id}`);if(selected!==id||requestedLocale!==locale)return;detail=loaded;renderHistory();renderReport();renderDataViews();if(view!=='actions'||!$('#questions-form'))renderActions();}
function reportUrl(file){return `${base}/reports/${selected}/${file}?lang=${locale}`;}
function geoEvidencePanel(meta,geo){
 if(state.workspace)return ui`<div class="help-note"><strong>GEO 回答与证据</strong><p>在当前品牌的 GEO 中查看回答、提及和引用。SEO 研究不会另建一套监测结果。</p><a class="button" href="${esc(state.workspace.responsesUrl)}" target="_top">查看品牌回答 →</a></div>`;
 return ui`<div class="help-note"><strong>关联 AI 回答</strong><p>选择这个项目的回答记录，可显示引用与域名文字匹配。这里只按项目和竞品域名匹配，不识别品牌名称或别名，也不会写入品牌监测。支持 records 目录中的 JSON 或浏览器采集文件；不是 summary.json。</p><button class="button" data-file="#import-geo" ${meta.status==='running'?'disabled':''}>${geo?ui('替换 AI 回答记录'):ui('导入 AI 回答记录')}</button><input type="file" id="import-geo" accept=".json,application/json" multiple hidden ${meta.status==='running'?'disabled':''}></div>`;
}
function renderReport(){
 if(!detail)return;const {meta,snapshot,geo}=detail,has=!!snapshot,records=snapshot?.records??[],ok=records.filter(r=>r.status==='ok'),actual=records.reduce((n,r)=>n+(r.actualUsd??0),0),unknown=records.filter(r=>r.actualUsd===undefined).length;
 const sources=new Map();for(const d of geo?.overall?.domains??[])sources.set(d.domain,{domain:d.domain,cited:`${d.answersCited}/${geo.overall.n}`,kind:ui('AI 引用来源')});for(const r of records.filter(r=>r.tool==='competitors'&&r.status==='ok'))for(const d of r.response.results??[])if(d.domain!==meta.site&&!sources.has(d.domain))sources.set(d.domain,{domain:d.domain,cited:'—',kind:ui('搜索竞品候选')});
 const others=state.runs.filter(r=>r.id!==selected&&r.site===meta.site&&r.synthetic===meta.synthetic&&r.status!=='running');
 $('#report-panel').innerHTML=ui`<div class="report-top"><div><h2>${esc(meta.site)}</h2><small>${esc(time(meta.createdAt))} · ${esc(statuses()[meta.status]??meta.status)} ${meta.synthetic?ui('<span class="tag demo">合成演示，非实测</span>'):''}</small></div><button class="button" id="refresh-run" ${meta.status==='running'?'disabled':''}>重新分析 ↻</button></div><div class="report-summary"><div><strong>${ok.length}/${meta.total??records.length}</strong><small>成功返回 / 计划查询</small></div><div><strong>${money(actual)}</strong><small>已记录费用${unknown?ui` · ${unknown} 项费用未确认`:''}</small></div>${state.workspace?'':ui`<div><strong>${geo?.overall?.n??'—'}</strong><small>已导入的 AI 回答</small></div>`}</div>${detail.failures?.length?ui`<div class="failure-summary" role="status"><h3>有 ${detail.failures.length} 项查询未成功</h3><ul>${detail.failures.map(f=>`<li><strong>${esc(names()[f.tool]??f.tool)}</strong>：${esc(f.message)}</li>`).join('')}</ul><button class="button" data-view="settings">检查 API Key 与连接</button></div>`:''}${meta.message?`<p class="muted">${esc(ui(meta.message))}</p>`:''}${meta.status==='running'?ui('<p class="muted">结果正在保存，完成后将生成报告。可以继续查看历史分析。</p>'):''}${has?ui`<div class="button-row">${detail.reportReady?ui`<a class="button" href="${reportUrl('report.html')}" target="_blank" rel="noreferrer">打开完整报告 ↗</a><a class="text-button" href="${reportUrl('report.md')}" download="beatgeo-report.md">导出 Markdown</a>`:''}<a class="text-button" href="${reportUrl('seo-input.json')}" download="seo-input.json">导出快照</a><button class="text-button" data-view="actions">内容与问题 →</button></div>${geoEvidencePanel(meta,geo)}${sources.size?ui`<h3 style="margin-top:24px">继续研究这些域名</h3><div class="scroll-table"><table class="source-table"><thead><tr><th>域名</th><th>来源</th><th>AI 引用</th><th></th></tr></thead><tbody>${[...sources.values()].slice(0,100).map(d=>ui`<tr><td>${esc(d.domain)}</td><td>${esc(d.kind)}</td><td>${esc(d.cited)}</td><td><button class="text-button" data-research="${esc(d.domain)}">研究 →</button></td></tr>`).join('')}</tbody></table></div>`:''}${others.length?ui`<div class="compare"><label>与之前的分析比较</label><div class="button-row"><select id="compare-base" aria-label="基准分析">${others.map(r=>`<option value="${r.id}">${esc(time(r.createdAt))} · ${esc(ui(r.label??'分析'))}</option>`).join('')}</select><button class="button" id="compare">比较变化</button></div><div id="compare-result"></div></div>`:''}${detail.reportReady?ui`<iframe class="report-frame" title="${state.workspace?ui('SEO 分析报告'):ui('SEO 与 GEO 分析报告')}" src="${reportUrl('report.html')}" sandbox="allow-same-origin"></iframe>`:''}`:ui('<p class="muted">暂时还没有返回数据。</p>')}`;
}
const dataViews=['domain','keywords','backlinks'];
function displayValue(value){return value===undefined||value===null?'—':typeof value==='number'?value.toLocaleString(locale==='zh'?'zh-CN':'en-US'):String(value);}
function domainOf(value){try{return new URL(value.includes('://')?value:`https://${value}`).hostname.toLowerCase();}catch{return value;}}
function metricCards(items){return `<div class="metric-grid">${items.map(([label,value])=>`<div class="metric"><small>${esc(label)}</small><strong>${esc(displayValue(value))}</strong></div>`).join('')}</div>`;}
function evidenceTable(record,columns){
 const rows=record.response?.results??[];
 if(!rows.length)return ui('<p class="muted">本次查询未返回记录，不代表网站没有排名或外链。</p>');
 return `<div class="scroll-table"><table class="data-table browse-table"><thead><tr>${columns.map(([,label])=>`<th>${esc(label)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr data-evidence-row>${columns.map(([key])=>{
  const value=row[key];
  if(['url','source_url','target_url'].includes(key)){try{const u=new URL(value);if(['https:','http:'].includes(u.protocol))return `<td><a href="${esc(u.href)}" target="_blank" rel="noreferrer">${esc(u.hostname+u.pathname)} ↗</a></td>`;}catch{}}
  return `<td>${esc(typeof value==='boolean'?(value?ui('是'):ui('否')):displayValue(value))}</td>`;
 }).join('')}</tr>`).join('')}</tbody></table></div>`;
}
const viewTools={domain:['domain-overview','domain-rating','site-traffic','top-pages','competitors'],keywords:['ranked-keywords','keyword-overview','keyword-ideas','keyword-difficulty'],backlinks:['backlink-summary','backlinks']};
const tableColumns=()=>({
 'ranked-keywords':[['keyword',ui('关键词')],['position',ui('已记录排名')],['search_volume',ui('搜索量')],['url',ui('页面')],['position_seen_at',ui('排名观测时间')]],
 'keyword-overview':[['keyword',ui('关键词')],['search_volume',ui('搜索量')],['keyword_difficulty',ui('难度')],['intent',ui('意图')],['updated_at',ui('数据更新时间')]],
 'keyword-ideas':[['keyword',ui('关键词')],['search_volume',ui('搜索量')],['keyword_difficulty',ui('难度')],['intent',ui('意图')],['updated_at',ui('数据更新时间')]],
 'keyword-difficulty':[['keyword',ui('关键词')],['keyword_difficulty',ui('难度')]],
 'top-pages':[['url',ui('页面')],['ranking_keywords',ui('排名词数')],['search_traffic_estimate',ui('搜索流量估算')]],
 competitors:[['domain',ui('搜索竞品候选')],['shared_keywords',ui('共同关键词')],['ranking_keywords',ui('排名词数')]],
 backlinks:[['source_url',ui('来源页面')],['target_url',ui('目标页面')],['anchor',ui('锚文本')],['source_authority',ui('来源权威度 · 0–1000')],['dofollow','Dofollow'],['is_lost',ui('已丢失')],['is_broken',ui('已失效')],['last_seen',ui('最后观测')]],
});
function recordMetrics(r){
 const d=r.response??{};
 if(d.has_data===false)return ui('<p class="muted">接口暂无数据，未知值不计为零。</p>');
 const metrics={
  'domain-overview':[[ui('排名关键词'),d.organic?.ranking_keywords],[ui('搜索流量估算'),d.organic?.search_traffic_estimate]],
  'domain-rating':[[ui('域名评分 DR · 0–100'),d.domain_rating]],
  'site-traffic':[[ui('网站访问量估算'),d.site_visits_estimate]],
  'backlink-summary':[[ui('外链数'),d.backlinks],[ui('引用域名'),d.referring_domains],[ui('失效外链'),d.broken_backlinks],[ui('链接权威度 · 0–1000'),d.link_authority],[ui('垃圾评分'),d.spam_score]],
 };
 return metrics[r.tool]?metricCards(metrics[r.tool]):evidenceTable(r,tableColumns()[r.tool]);
}
function renderDataViews(){
 for(const kind of dataViews){
  const el=$(`#data-${kind}`);
  const selector=state.runs.length?ui`<label class="snapshot-select">查看已保存的分析<select data-snapshot aria-label="选择已保存的分析"><option value="" ${!detail?'selected':''} disabled>选择分析</option>${state.runs.map(r=>`<option value="${esc(r.id)}" ${r.id===selected?'selected':''}>${esc(r.site)} · ${esc(time(r.createdAt))} · ${r.synthetic?ui('合成示例'):esc(statuses()[r.status]??r.status)}</option>`).join('')}</select></label>`:'';
  if(!detail?.snapshot){el.innerHTML=ui`${selector}<div class="empty"><h2>${selected&&!detail?ui('正在读取分析…'):ui('还没有可展示的快照')}</h2><p>先填写网站并预览查询，或在报告与历史中选择、导入已保存的分析。打开页面不会自动调用收费接口。</p><button class="button" data-view="home">填写网站</button><button class="text-button" data-view="results">查看报告与历史 →</button></div>`;continue;}
  const {meta,snapshot}=detail;
  const records=snapshot.records.filter(r=>viewTools[kind].includes(r.tool)&&(!r.input.domain||domainOf(r.input.domain)===domainOf(meta.site))).sort((a,b)=>viewTools[kind].indexOf(a.tool)-viewTools[kind].indexOf(b.tool));
  const explanations={domain:ui('搜索流量和网站访问量来自不同估算，不能相加；实际访问请查看 Google Analytics。'),keywords:ui('这是已记录排名和搜索需求，不是实时排名监控，也不是 AI 提问量。只展示当前返回范围。'),backlinks:ui('外链数与 AI 引用次数不同。DR 与链接权威度量纲不同，不互相换算；本页不推算外链增长趋势。')};
  el.innerHTML=ui`<div class="data-context">${selector}<div><strong>${esc(meta.site)}</strong> <span class="tag ${meta.synthetic?'demo':''}">${meta.synthetic?ui('合成示例 · 非实测'):ui('已保存快照')}</span><p class="muted">${esc(time(meta.createdAt))} · ${esc(statuses()[meta.status]??meta.status)} · BeatAPI SEO</p></div></div><p class="data-note">${explanations[kind]} 缺失值显示 —，不代表零。竞品数据可在完整报告中查看。</p><div class="button-row"><button class="button" data-view="actions">整理 GEO 问题 →</button><button class="text-button" data-view="results">完整报告与导出</button><a class="text-button" href="${reportUrl('seo-input.json')}" download="seo-input.json">导出当前快照</a></div>${records.some(r=>r.response?.results?.length)?ui`<label class="data-filter">筛选已返回的记录<input data-filter="${kind}" placeholder="关键词、网址或锚文本"><small>仅筛选本份快照，不会发起新查询。</small></label><p class="muted" data-filter-count aria-live="polite"></p>`:''}${records.length?records.map(r=>ui`<section class="data-section"><div class="section-title"><h2>${esc(names()[r.tool])}</h2><span class="tag">${r.status==='ok'?ui('已返回'):ui('未成功')}</span></div><p class="muted">${esc(r.input.country??ui('全球'))} ${esc(r.input.language??'')} · 获取时间 ${esc(r.fetchedAt??ui('未知'))}${r.input.offset!==undefined?ui` · 偏移 ${esc(r.input.offset)}`:''}${r.input.one_per_domain!==undefined?` · ${r.input.one_per_domain?ui('每域名一条'):ui('全部链接')}`:''}</p>${r.status==='ok'?recordMetrics(r):ui('<p class="failure-summary">本项查询未成功；不将失败记为零。请在报告与历史中查看原因，再决定是否重试。</p>')}</section>`).join(''):ui('<div class="empty"><h2>这份快照未查询本模块</h2><p>可以选择其他分析，或预览本模块查询与费用。不会自动补查或混用不同时间的结果。</p></div>')}`;
 }
}
function baselineConfig(kind,current=config()){
 const site=current.site;
 const country=current.country??current.requests?.find(r=>r.input.country)?.input.country??'us';
 const language=current.language??current.requests?.find(r=>r.input.language)?.input.language;
 const tools=kind==='baseline'?['domain-overview','domain-rating','ranked-keywords','top-pages','backlink-summary','backlinks']:kind==='domain'?['domain-overview','domain-rating','site-traffic','top-pages']:kind==='keywords'?['ranked-keywords']:['backlink-summary','backlinks'];
 return {site,requests:tools.map(tool=>({tool,input:{domain:site,...(market.includes(tool)?{country,...(language?{language}:{})}:{}),...(paged.includes(tool)?{limit:10,offset:0}:{}),...(tool==='backlinks'?{one_per_domain:true}:{}),...(tool==='site-traffic'?{months:3}:{})}}))};
}

function renderActions(){
 if(!detail?.snapshot){$('#action-context').textContent=detail?.meta.site??ui('先选择一份报告');$('#actions-panel').className='empty';$('#actions-panel').innerHTML=ui('<h2>还没有可整理的研究结果</h2><p>完成分析或选择已有报告后，可以整理内容任务和监测问题。</p><button class="button" data-view="results">查看报告与进度</button>');return;}$('#action-context').textContent=`${detail.meta.site} · ${time(detail.meta.createdAt)}${detail.meta.synthetic?ui(' · 合成示例'):''}`;
 const candidates=detail.candidates.candidates;const draft=questionDrafts.get(detail.meta.id);const questionState=q=>draft?.values.find(x=>x.id===q.id)??{text:detail.questions.questions.find(x=>x.id===q.id)?.text??q.suggestedText,checked:detail.questions.questions.some(x=>x.id===q.id)};
 $('#actions-panel').className='';$('#actions-panel').innerHTML=ui`<section class="action-section"><h2>内容研究任务</h2><p>从返回的竞品或引用来源排名页面整理；这是待验证假设，不代表已确认的内容缺口。</p>${detail.actions.length?detail.actions.map((a,i)=>ui`<article class="task"><div><h3>${esc(a.keyword)}</h3><p>${esc(a.domain)} · 搜索量 ${esc(a.searchVolume??ui('未知'))}${a.aiCited?ui` · AI 引用 ${esc(a.aiCited)}`:''}</p>${safeLink(a.url)}<p>核查这个页面与自己的现有内容，再决定更新或新建。</p><small>证据 ${esc(a.requestId??a.recordId)} · 排名记录 ${esc(a.positionSeenAt??ui('时间未知'))}</small></div><select aria-label="任务状态" data-task="${i}">${[['todo',ui('待研究')],['doing',ui('进行中')],['done',ui('已完成')]].map(([v,t])=>`<option value="${v}" ${v===(detail.tasks[i]??'todo')?'selected':''}>${t}</option>`).join('')}</select></article>`).join(''):ui('<div class="empty"><h3>暂无内容研究任务</h3><p>选择竞品或引用域名，查询其排名关键词后，再来整理研究任务。</p><button class="button" data-view="home">设置研究范围</button></div>')}</section><section class="action-section"><div class="section-title"><h2>确认要监测的问题</h2>${candidates.length?ui('<button class="text-button" id="select-questions">全选 / 取消</button>'):''}</div><p>编辑并勾选需要的问题，保存为独立问题集。关键词搜索量不是 AI 提问量；保存不会调用模型或修改已有监测。${state.workspace?ui('确认加入后会进入当前品牌的问题列表，无需下载再导入。'):''}</p><p class="muted">问题模板跟随研究语言；英文和中文以外的关键词请自行改写为问题。</p>${candidates.length?ui`<form id="questions-form">${candidates.map((q,i)=>ui`<div class="question-item"><input type="checkbox" name="question" value="${i}" ${questionState(q).checked?'checked':''} aria-label="选择问题 ${i+1}"><div><textarea aria-label="问题 ${i+1}" data-question="${i}" rows="2">${esc(questionState(q).text)}</textarea><small>${esc(q.keyword)} · ${esc(q.country)} · 搜索量 ${esc(q.searchVolume??ui('未知'))}</small></div></div>`).join('')}<div class="button-row"><button class="${state.workspace?'button':'primary'}" type="submit">保存已选问题</button>${state.workspace?ui`<button class="primary" type="button" id="add-monitor" ${detail.meta.synthetic?'disabled':''}>加入 GEO 监测 →</button><a class="text-button" href="${esc(state.workspace.promptsUrl)}" target="_top">查看品牌问题</a>${detail.meta.synthetic?ui('<small>示例问题不能加入真实监测</small>'):''}`:''}<a id="questions-download" class="button" href="${reportUrl('questions.json')}" download="questions.json" ${detail.questions.questions.length?'':'hidden'}>下载问题集</a></div></form>`:ui('<div class="empty"><h3>暂无问题候选</h3><p>先查询“主题与关键词”，再把选中的主题整理成监测问题。</p><button class="button" data-view="home">研究关键词</button></div>')}</section>`;
}
function safeLink(url){try{const u=new URL(url);if(!['http:','https:'].includes(u.protocol))return '';return ui`<a href="${esc(u.href)}" target="_blank" rel="noreferrer">查看排名页面 ↗</a>`;}catch{return '';}}
async function preview(c=config(),parentId){
 plan=await api('plan',{config:c,budget:Number($('#budget').value),...(parentId?{parentId}:{})});
 renderPlan();$('#plan-dialog').showModal();
}
function renderPlan(){
 $('#plan-content').innerHTML=ui`<div class="plan-total"><div><small>${esc(plan.site)} · ${plan.items.length} 个查询</small><br><strong>${money(plan.maxCostUsd)}</strong></div><div><strong style="font-size:14px">预计最高费用</strong><br><small>预算上限 ${money(plan.budget)}</small></div></div><div class="plan-list">${plan.items.map(r=>`<div class="plan-row"><div>${esc(names()[r.tool])}<br><span>${esc(r.input.domain??r.input.keywords.join('、'))} · ${esc(r.input.country??ui('全球'))}</span></div><span>${money(r.maxCostUsd)}</span></div>`).join('')}</div><p class="muted" style="margin-top:14px">价格参考日期 ${esc(plan.priceDate)}。只查询以上范围，不自动扩展竞品或下一页。</p>${state.key.present?'':ui('<p class="muted">尚未连接 Key。请先保存连接，再重新预览执行。</p>')}`;
 $('#execute').textContent=state.key.present?ui('确认费用并执行 →'):state.workspace?ui('前往品牌 → API Key →'):ui('先连接 API Key →');
}
async function demo(){const r=await api('demo',{});await refresh();await openRun(r.id);show('results');notice(ui('已载入合成示例，没有调用收费接口。'));}
let polling=false;
async function tick(){if(polling)return;polling=true;try{const old=state.active?.id;await refresh();if(old&&selected===old){await openRun(old);if(!state.active)notice(ui('分析已结束，结果已保存。失败或缺失的数据会在报告中明确显示。'));}}catch(e){notice(ui('本地服务连接中断。重新启动后可查看已保存的结果。'),true);clearInterval(poll);poll=null;}finally{polling=false;}}
for(const [value,text] of Object.entries(names()))$('#endpoint').add(new Option(text,value));
bindStaticText();
$('#project-form').addEventListener('input',()=>{if($('#notice').classList.contains('error'))$('#notice').hidden=true;});
$('#reset-scope').onclick=()=>{fill({site:$('#site').value,workflows:['overview']});notice(ui('已切换为网站概览。请重新选择范围并预览费用。'));};
$('#endpoint').addEventListener('change',()=>$('#exact-options').hidden=!$('#endpoint').value);
$('#project-form').addEventListener('submit',e=>{e.preventDefault();guarded(()=>preview(),$('#preview'));});
$('#save-project').onclick=e=>guarded(async()=>{await api('project',{config:config()});notice(ui('项目已保存，下次打开可继续使用。'));},e.currentTarget);
$('#key-form').onsubmit=e=>{e.preventDefault();guarded(async()=>{await api('key',{key:$('#api-key').value.trim(),remember:$('#remember-key').checked});$('#api-key').value='';await refresh();notice(ui('连接已保存，未产生查询费用。'));show('home');},e.submitter);};
$('#disconnect').onclick=e=>guarded(async()=>{await api('key/disconnect',{});await refresh();notice(ui('已解除本地连接，BeatAPI 平台上的 Key 未被撤销。'));},e.currentTarget);
$('#execute').onclick=e=>guarded(async()=>{if(!state.key.present){$('#plan-dialog').close();show('settings');return;}const r=await api('execute',{planId:plan.id});$('#plan-dialog').close();await refresh();await openRun(r.id);show('results');notice(ui('分析已开始，可以在这里查看进度。'));},e.currentTarget);
$('#close-plan').onclick=()=>$('#plan-dialog').close();
$('#demo').onclick=e=>guarded(demo,e.currentTarget);$('#demo-empty').onclick=e=>guarded(demo,e.currentTarget);
$('#cancel-run').onclick=e=>guarded(async()=>{await api('cancel',{});await refresh();notice(ui('当前请求完成后停止，已收到的数据会保留。'));},e.currentTarget);
$('#import-seo').onchange=e=>guarded(async()=>{const file=e.target.files[0];if(!file)return;if(file.size>20*1024*1024)throw new Error(ui('文件不得超过 20 MiB'));const r=await api('import',{snapshot:JSON.parse(await file.text())});e.target.value='';await refresh();await openRun(r.id);show('results');notice(ui('快照已导入，没有重新调用接口。'));});
document.addEventListener('click',e=>{
 const b=e.target.closest('button');if(!b)return;
 if(b.dataset.view)show(b.dataset.view);
 if(b.dataset.baseline)guarded(()=>preview(baselineConfig(b.dataset.baseline,view!=='home'&&detail?{...detail.meta.config,site:detail.meta.site}:config())),b);
 if(b.dataset.run)guarded(()=>openRun(b.dataset.run),b);
 if(b.dataset.file){$(b.dataset.file).click();return;}
 if(b.dataset.preset){exactSaved=null;lockSavedScope();$$('input[name="workflow"]').forEach(el=>el.checked=b.dataset.preset==='all'||['overview'].includes(el.value));$('#endpoint').value='';$('#exact-options').hidden=true;}
 if(b.id==='refresh-run')guarded(async()=>{fill(detail.meta.config);await preview(detail.meta.config,selected);},b);
 if(b.dataset.research)guarded(async()=>{const input=detail.snapshot.records.find(r=>r.input.country)?.input??{country:'us'};await preview({site:detail.meta.site,requests:['domain-overview','ranked-keywords','top-pages'].map(tool=>({tool,input:{domain:b.dataset.research,country:input.country,...(input.language?{language:input.language}:{}),...(tool!=='domain-overview'?{limit:10}:{})}}))},selected);},b);
 if(b.id==='compare')guarded(async()=>{const d=await api('compare',{base:$('#compare-base').value,head:selected});$('#compare-result').innerHTML=ui`<p class="muted" style="margin-top:12px">只比较相同查询范围。差异可能来自数据更新，不代表优化产生的效果。</p>${d.rows.length?ui`<div class="scroll-table"><table class="data-table"><thead><tr><th>对象</th><th>指标</th><th>之前</th><th>本次</th><th>变化</th></tr></thead><tbody>${d.rows.map(r=>`<tr><td>${esc(r.identity??r.domain)}</td><td>${esc(r.metric)}</td><td>${esc(r.base)}</td><td>${esc(r.head)}</td><td>${esc(r.delta)}</td></tr>`).join('')}</tbody></table></div>`:ui('<p>没有范围一致且都有数据的指标。</p>')}`;},b);
 if(b.id==='add-monitor')guarded(()=>{const checked=$$('input[name="question"]:checked');if(!checked.length)throw new Error(ui('请至少选择一个问题。'));monitorSelection={id:selected,questions:checked.map(el=>({id:detail.candidates.candidates[Number(el.value)].id,text:$(`[data-question="${el.value}"]`).value.trim()}))};$('#monitor-context').textContent=ui`将 ${checked.length} 个问题加入「${state.workspace.brandName}」。`;$('#monitor-dialog').showModal();},b);
 if(b.id==='select-questions'){const boxes=$$('input[name="question"]'),all=boxes.every(x=>x.checked);boxes.forEach(x=>x.checked=!all);captureQuestions();}
});
document.addEventListener('input',e=>{if(e.target.dataset.filter){const panel=$(`#data-${e.target.dataset.filter}`),query=e.target.value.trim().toLowerCase(),rows=[...panel.querySelectorAll('[data-evidence-row]')];for(const row of rows)row.hidden=!row.textContent.toLowerCase().includes(query);panel.querySelector('[data-filter-count]').textContent=ui`显示 ${rows.filter(r=>!r.hidden).length} / ${rows.length} 条已返回记录`;}if(e.target.matches('[data-question],input[name="question"]'))captureQuestions();});
window.addEventListener('beforeunload',e=>{if([...questionDrafts.values()].some(d=>d.dirty)){e.preventDefault();e.returnValue='';}});
document.addEventListener('change',e=>{
 if(e.target.matches('[data-snapshot]'))guarded(()=>openRun(e.target.value));
 if(e.target.id==='import-geo')guarded(async()=>{const id=selected,files=[...e.target.files];if(!files.length)return;if(files.reduce((n,f)=>n+f.size,0)>18*1024*1024)throw new Error(ui('回答文件总大小请控制在 18 MiB 内。'));const records=(await Promise.all(files.map(async f=>JSON.parse(await f.text())))).flat();await api('geo',{id,records});if(selected===id){await openRun(id);notice(ui('AI 回答已关联，综合报告已更新。'));}});
 if(e.target.dataset.task!==undefined)guarded(async()=>{const id=selected,r=await api('tasks',{id,index:Number(e.target.dataset.task),status:e.target.value});if(selected===id&&detail){detail.tasks=r.tasks;notice(ui('任务状态已保存。'));}});
});
document.addEventListener('submit',e=>{if(e.target.id!=='questions-form')return;e.preventDefault();guarded(async()=>{const id=selected,checked=$$('input[name="question"]:checked');if(!checked.length)throw new Error(ui('请至少选择一个问题。'));const questions=checked.map(el=>({id:detail.candidates.candidates[Number(el.value)].id,text:$(`[data-question="${el.value}"]`).value.trim(),group:'seo-research'}));captureQuestions();const draft=questionDrafts.get(id);await api('questions',{id,questions});if(questionDrafts.get(id)===draft)draft.dirty=false;if(selected===id&&detail){detail.questions={questions};$('#questions-download').hidden=false;notice(ui`已保存 ${questions.length} 个问题，可下载用于后续 GEO 采样。`);}},e.submitter);});
$('#close-monitor').onclick=()=>$('#monitor-dialog').close();
$('#confirm-monitor').onclick=e=>guarded(async()=>{const selection=monitorSelection,draft=questionDrafts.get(selection.id);const result=await api('monitor',selection);if(questionDrafts.get(selection.id)===draft&&draft)draft.dirty=false;$('#monitor-dialog').close();notice(ui`已加入 ${result.added} 个问题，跳过 ${result.existing} 个已有问题。${result.existingDisabled?ui`其中 ${result.existingDisabled} 个保持停用。`:''}${result.brandPaused?ui('品牌已暂停；恢复品牌后才会采集。'):result.schedulingFailed?ui('问题已保存，但排期未完成，可再次点击加入以重试排期。'):ui('已按品牌配置安排后续监测。')}`,result.schedulingFailed);},e.currentTarget);
window.addEventListener('focus',()=>{if(state.workspace)guarded(()=>refresh());});
window.addEventListener('hashchange',()=>{const next=location.hash.slice(1);if(['home','domain','keywords','backlinks','results','actions','settings'].includes(next)&&next!==view)show(next);});
guarded(async()=>{const next=location.hash.slice(1);show(['home','domain','keywords','backlinks','results','actions','settings'].includes(next)?next:'home');await refresh(true);if(state.runs.length)await openRun(state.active?.id??state.runs[0].id);});

$('#keyword-search').addEventListener('submit',e=>{e.preventDefault();guarded(()=>{const current=detail?{...detail.meta.config,site:detail.meta.site}:config(),base=baselineConfig('keywords',current),scope=base.requests[0].input,keywords=[$('#keyword-seed').value.trim()];return preview({site:current.site,requests:['keyword-ideas','keyword-overview'].map(tool=>({tool,input:{keywords,country:scope.country,...(scope.language?{language:scope.language}:{}),...(tool==='keyword-ideas'?{limit:10,offset:0}:{})}}))});},e.submitter);});

function applyLocale(next) {
 if(!['en','zh'].includes(next)||next===locale)return;
 captureQuestions(false);setLocale(next);
 if(base&&window.parent!==window)document.body.style.fontFamily=getComputedStyle(window.parent.document.body).fontFamily;
 for(const option of $('#endpoint').options)if(option.value)option.textContent=names()[option.value];
 renderState();renderHistory();renderReport();renderDataViews();renderActions();lockSavedScope();
 if(plan&&$('#plan-dialog').open)renderPlan();
 if($('#monitor-dialog').open&&monitorSelection)$('#monitor-context').textContent=ui`将 ${monitorSelection.questions.length} 个问题加入「${state.workspace.brandName}」。`;
 show(view);
 if(selected)guarded(()=>openRun(selected));
}
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==window.parent||event.data?.type!=='beatgeo:locale')return;
 applyLocale(event.data.locale);
});
if(base&&window.parent!==window){
 for(const face of window.parent.document.fonts)document.fonts.add(face);
 document.body.style.fontFamily=getComputedStyle(window.parent.document.body).fontFamily;
 window.parent.postMessage({type:'beatgeo:seo-ready'},location.origin);
}

enhanceSelects();
