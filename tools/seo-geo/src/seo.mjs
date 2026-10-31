import { createHash, randomUUID } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { SEO_TOOLS, SEO_WORKFLOWS, SEO_PRICE_DATE, seoInput, seoDomain, seoMaxCost, money } from './seo-catalog.mjs';

export const SEO_SCHEMA = 'beat-geo/seo-snapshot@1';
const hash = x => createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function buildSeoPlan(config) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('SEO config must be an object.');
  const allowed = ['site','country','language','competitors','sources','keywords','workflows','limit','months','requests'];
  if (Object.keys(config).some(k => !allowed.includes(k))) throw new Error('Unknown SEO project field. Never put a key in the project file.');
  const site = seoDomain(config.site);
  const domains = [...new Set([site, ...['competitors','sources'].flatMap(k => {
    if (config[k] !== undefined && (!Array.isArray(config[k]) || config[k].length > 100)) throw new Error(`SEO ${k} must be an array of at most 100 domains.`);
    return (config[k] ?? []).map(seoDomain);
  })])];
  let requests;
  if (config.requests !== undefined) {
    if (['keywords','workflows','limit','months','competitors','sources','country','language'].some(k => config[k] !== undefined)) throw new Error('Explicit SEO requests cannot be combined with workflow settings. Put all parameters in each request.');
    requests = config.requests;
  } else {
    const flows = config.workflows ?? ['overview','research'];
    if (!Array.isArray(flows) || !flows.length || flows.some(f => !Object.hasOwn(SEO_WORKFLOWS, f))) throw new Error('Unknown SEO workflow.');
    const tools = [...new Set(flows.flatMap(f => SEO_WORKFLOWS[f]))];
    requests = tools.flatMap(tool => {
      const spec = SEO_TOOLS[tool];
      const base = { ...(spec.market ? {country:config.country ?? 'us', ...(config.language ? {language:config.language}: {})}:{}), ...(spec.paged ? {limit:config.limit ?? 20}:{}), ...(tool === 'site-traffic' ? {months:config.months ?? 3}: {}) };
      // Keyword endpoints run once per keyword batch, not once per domain.
      return spec.keywords ? [{tool, input:{...base, keywords:config.keywords}}] : domains.map(domain => ({tool,input:{...base,domain}}));
    });
  }
  if (!Array.isArray(requests) || !requests.length || requests.length > 1200) throw new Error('SEO plan needs 1–1200 requests.');
  const seen = new Set(), items = [];
  for (const r of requests) {
    if (!r || Object.keys(r).some(k => !['tool','input'].includes(k))) throw new Error('Invalid SEO request definition.');
    const input = seoInput(r.tool, r.input), id = hash([r.tool,input]);
    if (!seen.has(id)) items.push({ id, tool:r.tool, input, maxCostUsd:seoMaxCost(r.tool,input) });
    seen.add(id);
  }
  return { site, items, priceDate:SEO_PRICE_DATE, maxCostUsd:money(items.reduce((s,r) => s+r.maxCostUsd,0)) };
}

// Safe projection: no request headers, arbitrary provider errors or credentials reach exports.
const NUMBERS = new Set('search_volume cpc_usd competition keyword_difficulty position absolute_position search_traffic_estimate ranking_keywords traffic_value_usd_estimate new up down lost shared_keywords avg_position link_authority backlinks referring_domains referring_main_domains referring_pages referring_ips broken_backlinks broken_pages spam_score source_authority domain_rating link_rank site_visits_estimate global_rank category_rank bounce_rate pages_per_visit avg_visit_seconds billed_rows total limit offset months year month visits share rank quantity'.split(' '));
const STRINGS = new Set('keyword intent updated_at position_seen_at domain url title source_url source_domain source_title source_country target_url anchor link_type first_seen last_seen country language category description request_id object billing_unit price_version'.split(' '));
const BOOLEANS = new Set(['has_data','dofollow','is_new','is_lost','is_broken']);
const OBJECTS = new Set(['organic','paid','country_rank','usage']);
const ARRAYS = new Set(['results','monthly_searches','monthly_visits','top_countries','top_keywords']);
const MAPS = {rank_distribution:['1','2-3','4-10','11-20','21-30','31-100'],traffic_sources:['direct','search','paid_search','social','paid_social','referrals','mail','display_ads','affiliate','gen_ai']};
export function cleanSeoResponse(raw, depth = 0) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || depth > 6) throw new Error('Invalid SEO response object.');
  const out = {};
  for (const [k,v] of Object.entries(raw)) {
    if (k === 'month' && typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)) out[k] = v;
    else if (k === 'price_usd' && /^(?:\d+)(?:\.\d+)?$/.test(String(v)) && Number.isFinite(Number(v))) out[k] = String(v);
    else if (NUMBERS.has(k) && typeof v === 'number' && Number.isFinite(v) && v >= 0) out[k] = v;
    else if (STRINGS.has(k) && typeof v === 'string') out[k] = v.slice(0,4000).replace(/[\x00-\x1f\x7f]/g,' ');
    else if (BOOLEANS.has(k) && typeof v === 'boolean') out[k] = v;
    else if (OBJECTS.has(k) && v && typeof v === 'object' && !Array.isArray(v)) out[k] = cleanSeoResponse(v,depth+1);
    else if (ARRAYS.has(k) && Array.isArray(v)) {
      if (v.length > 1000) throw new Error('SEO response exceeds 1000 rows.');
      out[k] = v.map(row => cleanSeoResponse(row,depth+1));
    } else if (Object.hasOwn(MAPS,k) && v && typeof v === 'object') out[k] = Object.fromEntries(MAPS[k].filter(f => typeof v[f] === 'number' && Number.isFinite(v[f]) && v[f]>=0).map(f=>[f,v[f]]));
  }
  return out;
}
const safeCode = v => typeof v === 'string' && /^[a-z_]{1,60}$/.test(v) ? v : 'request_failed';
function assertResponse(data, item) {
  if (data.object !== `seo.${item.tool.replaceAll('-','_')}`) throw new Error('Unexpected SEO response type.');
  if (item.input.domain && (!data.domain || seoDomain(data.domain) !== item.input.domain)) throw new Error('SEO response domain mismatch.');
  if (SEO_TOOLS[item.tool].market && (data.country !== item.input.country || (item.input.language && data.language !== item.input.language))) throw new Error('SEO response market mismatch.');
  const list = SEO_TOOLS[item.tool].keywords || SEO_TOOLS[item.tool].paged || item.tool === 'domain-rating-history';
  if ((!list || item.tool === 'domain-rating-history') && typeof data.has_data !== 'boolean') throw new Error('SEO summary response missing has_data.');
  if (list && !Array.isArray(data.results)) throw new Error('SEO list response missing results.');
}
export async function collectSeo(plan, { apiKey, budgetUsd, maxRequests=50, fetchImpl=fetch, timeoutMs=30000, retries=1, onSnapshot=async()=>{}, shouldStop=()=>false, sleep=ms=>new Promise(r=>setTimeout(r,ms)) } = {}) {
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || plan.maxCostUsd > budgetUsd) throw new Error('SEO plan exceeds budget or --budget-usd is missing.');
  if (!Number.isInteger(maxRequests) || maxRequests < 1 || plan.items.length > maxRequests) throw new Error('SEO plan exceeds --max-requests.');
  if (!apiKey || typeof apiKey !== 'string' || /[\r\n]/.test(apiKey)) throw new Error('Missing or invalid BeatAPI key.');
  if (!Number.isInteger(retries) || retries < 0 || retries > 2 || !Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000) throw new Error('Invalid SEO retry/timeout settings.');
  const runId=randomUUID(), snapshot={schema:SEO_SCHEMA,site:plan.site,synthetic:false,runId,priceDate:plan.priceDate,createdAt:new Date().toISOString(),budgetUsd,plannedMaxUsd:plan.maxCostUsd,records:[],stopped:null};
  let reserved=0, sent=0;
  for (const item of plan.items) {
    if (shouldStop()) { snapshot.stopped='cancelled'; break; }
    if (money(reserved+item.maxCostUsd)>budgetUsd || sent>=maxRequests) { snapshot.stopped='budget_or_request_cap'; break; }
    const record={id:item.id,tool:item.tool,input:item.input,fetchedAt:new Date().toISOString(),status:'error',reservedUsd:item.maxCostUsd};
    const key=`beatgeo-seo-${runId}-${item.id}`;
    for(let attempt=0;attempt<=retries;attempt++) {
      if(shouldStop()) { snapshot.stopped='cancelled'; break; }
      if(sent>=maxRequests) break;
      sent++;
      try {
        const res=await fetchImpl(`https://api.beatapi.io/v1/seo/${item.tool}`,{method:'POST',redirect:'error',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(item.input),signal:AbortSignal.timeout(timeoutMs)});
        if (!res.ok) record.httpStatus=res.status;
        const text=await res.text();
        if (text.length>8*1024*1024) throw new Error('large response');
        let raw; try { raw=JSON.parse(text); } catch { throw new Error('invalid response'); }
        // Never persist an echoed secret, even if the provider accidentally places it in a known field.
        if (text.includes(apiKey)) throw new Error('secret in response');
        if(!res.ok) {
          record.error=safeCode(raw.error?.code); record.httpStatus=res.status;
          // Only documented non-billed failures release the reservation; other errors remain uncertain.
          record.reservedUsd=[400,503].includes(res.status)?0:item.maxCostUsd;
          if(attempt<retries && [429,500,503].includes(res.status) && raw.error?.retryable===true && sent<maxRequests) {
            const delay=Number(raw.error?.retry_after_seconds ?? res.headers.get('retry-after') ?? 1);
            if (!Number.isFinite(delay) || delay<0 || delay>5) break;
            await sleep(Math.max(250,delay*1000)); continue;
          }
          break;
        }
        const data=cleanSeoResponse(raw); assertResponse(data,item);
        record.status='ok'; record.reservedUsd=item.maxCostUsd; record.response=data; delete record.error; delete record.httpStatus;
        const actual=Number(data.usage?.price_usd);
        if (data.usage?.price_usd !== undefined && Number.isFinite(actual)) {record.actualUsd=actual;record.reservedUsd=actual;}
        break;
      } catch {
        // A timed-out request may have been billed. Do not replay ambiguous transport failures.
        record.error='transport_or_invalid_response';record.reservedUsd=item.maxCostUsd;break;
      }
    }
    reserved=money(reserved+record.reservedUsd); snapshot.records.push(record); snapshot.requestsSent=sent;
    if(record.reservedUsd>item.maxCostUsd) snapshot.stopped='price_exceeded_estimate';
    if(record.status==='error' && [401,402,403].includes(record.httpStatus)) snapshot.stopped='authorization_or_balance';
    await onSnapshot(snapshot); // durable progress after every request
    if(snapshot.stopped) break;
  }
  snapshot.reservedUsd=reserved;
  await onSnapshot(snapshot);
  return snapshot;
}
export function normalizeSeoSnapshot(raw) {
  if(raw?.schema!==SEO_SCHEMA || !Array.isArray(raw.records) || raw.records.length>1200) throw new Error('Expected a BeatGEO SEO snapshot.');
  const site=seoDomain(raw.site), seen=new Set();
  const records=raw.records.map(r=>{
    const input=seoInput(r.tool,r.input), id=hash([r.tool,input]);
    if(seen.has(id)) throw new Error('Duplicate SEO records; snapshots must not be added together.');
    seen.add(id);
    if(!['ok','error'].includes(r.status) || !Number.isFinite(Date.parse(r.fetchedAt))) throw new Error('Invalid SEO record status/time.');
    const clean={id,tool:r.tool,input,fetchedAt:new Date(r.fetchedAt).toISOString(),status:r.status};
    if(r.status==='ok') {clean.response=cleanSeoResponse(r.response);assertResponse(clean.response,{tool:r.tool,input});}
    else {
      clean.error=safeCode(r.error);
      if(Number.isInteger(r.httpStatus)&&r.httpStatus>=400&&r.httpStatus<=599)clean.httpStatus=r.httpStatus;
    }
    for(const k of ['actualUsd','reservedUsd']) if(typeof r[k]==='number' && Number.isFinite(r[k]) && r[k]>=0) clean[k]=r[k];
    return clean;
  });
  return {schema:SEO_SCHEMA,site,synthetic:raw.synthetic===true,createdAt:Number.isFinite(Date.parse(raw.createdAt))?new Date(raw.createdAt).toISOString():null,priceDate:SEO_PRICE_DATE,stopped:raw.stopped?safeCode(raw.stopped):null,records};
}
export async function loadSeo(file) {
  if((await stat(file)).size>20*1024*1024) throw new Error('SEO snapshot exceeds 20 MiB.');
  return normalizeSeoSnapshot(JSON.parse(await readFile(file,'utf8')));
}
export function seoSummary(snapshot) {
  const s=normalizeSeoSnapshot(snapshot);
  return {...s,schema:'beat-geo/seo-summary@1',actualUsd:money(s.records.reduce((n,r)=>n+(r.actualUsd??0),0)),
    unknownCostRecords:s.records.filter(r=>r.actualUsd===undefined).length};
}

export function seoOpportunities(snapshot, geo=null) {
  const tasks=[];
  for(const r of snapshot.records.filter(r=>r.status==='ok')) {
    if(r.tool==='ranked-keywords' && r.input.domain!==snapshot.site) {
      const observed=geo?.overall?.domains?.find(d=>d.domain===r.input.domain);
      for(const row of (r.response.results??[]).slice(0,5)) {
        if(!row.keyword) continue;
        tasks.push({synthetic:snapshot.synthetic===true,type:'content-research',keyword:row.keyword,domain:r.input.domain,url:row.url??null,searchVolume:row.search_volume??null,positionSeenAt:row.position_seen_at??null,requestId:r.response.request_id??null,recordId:r.id,
          aiCited:observed?`${observed.answersCited}/${geo.overall.n}`:null,
          nextStep:'Review this ranking page and your existing coverage before deciding to create or update content. This is a hypothesis, not a proven content gap.'});
      }
    }
  }
  return tasks;
}
export function seoQuestionCandidates(snapshot) {
  const words=new Map();
  for(const r of snapshot.records.filter(r=>r.status==='ok' && ['keyword-ideas','keyword-overview'].includes(r.tool))) for(const row of r.response.results??[]) if(row.keyword && !words.has(row.keyword)) words.set(row.keyword,{keyword:row.keyword,country:r.response.country,language:r.response.language,searchVolume:row.search_volume??null,recordId:r.id});
  return {schema:'beat-geo/seo-question-candidates@1',synthetic:snapshot.synthetic===true,reviewRequired:true,note:'Keyword search volume is not AI question volume. Review and copy selected questions into a new fixed question set; nothing is sent to a model.',candidates:[...words.values()].map((row,i)=>({...row,id:`seo-q${i+1}`,suggestedText:`What should I consider when choosing or using ${row.keyword}?`}))};
}
export function diffSeo(base,head) {
  if(base.site!==head.site || base.synthetic!==head.synthetic) throw new Error('Compare SEO snapshots for the same site and evidence type.');
  const rows=[];
  for(const current of head.records.filter(r=>r.status==='ok')) {
    const previous=base.records.find(r=>r.id===current.id && r.status==='ok');
    if(!previous) continue;
    for(const metric of ['domain_rating','site_visits_estimate','backlinks','referring_domains','organic.ranking_keywords','organic.search_traffic_estimate']) {
      const get=r=>metric.split('.').reduce((o,k)=>o?.[k],r.response),a=get(previous),b=get(current);
      if(typeof a==='number' && typeof b==='number') rows.push({tool:current.tool,domain:current.input.domain,market:current.input.country??'global',metric,base:a,head:b,delta:money(b-a),baseFetchedAt:previous.fetchedAt,headFetchedAt:current.fetchedAt});
    }
    const keyField = current.tool === 'top-pages' ? 'url' : ['ranked-keywords','keyword-overview','keyword-ideas','keyword-difficulty'].includes(current.tool) ? 'keyword' : null;
    if (keyField) for (const row of current.response.results ?? []) {
      const old = previous.response.results?.find(r => r[keyField] === row[keyField]);
      if (!old) continue; // Pagination changes never establish a new or lost ranking.
      for (const metric of ['position','search_volume','keyword_difficulty','search_traffic_estimate']) {
        if (typeof old[metric] === 'number' && typeof row[metric] === 'number') rows.push({tool:current.tool,domain:current.input.domain??null,market:current.input.country??'global',identity:row[keyField],metric,base:old[metric],head:row[metric],delta:money(row[metric]-old[metric]),baseUrl:old.url??null,headUrl:row.url??null,baseObservedAt:old.position_seen_at??old.updated_at??null,headObservedAt:row.position_seen_at??row.updated_at??null,baseFetchedAt:previous.fetchedAt,headFetchedAt:current.fetchedAt});
      }
    }
  }
  return {schema:'beat-geo/seo-diff@1',site:base.site,synthetic:base.synthetic,note:'Only identical request parameters are compared. Fetch dates are not source dates; differences may reflect dataset refreshes, not your actions.',rows};
}
