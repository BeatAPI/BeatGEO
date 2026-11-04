import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile, chmod, symlink } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { test } from 'node:test';
import { GA_SCOPE, GA_DIMENSIONS, GA_METRICS, analyzeGa, classifyGaSource, fetchGa, gaDates, gaProperty, gaRequest, googleJson, listGaProperties, listGaSites, loadGa, resolveGaDates } from '../src/ga.mjs';
import { authorizeGa, readGaClient, readGaConnection, refreshGaConnection, removeGaConnection, saveGaConnection } from '../src/ga-auth.mjs';
import { cmdGa } from '../src/ga-cli.mjs';
import { renderHtml, renderMarkdown } from '../src/report.mjs';
import { buildRun, loadRecords } from '../src/run.mjs';
import { normalizeConfig } from '../src/config.mjs';
import { message, response } from './fixtures.mjs';

const example = JSON.parse(await readFile('examples/ga.example.json','utf8'));
const copy = () => structuredClone(example);
const json = data => ({ ok:true, json: async () => data });
const exec = promisify(execFile);
const temp = async fn => { const dir = await mkdtemp(path.join(os.tmpdir(),'beat-geo-ga-')); try { return await fn(dir); } finally { await rm(dir,{recursive:true,force:true}); } };
const client = { id:'sample.apps.googleusercontent.com', secret:'private-client-secret' };
const tokenResponse = { access_token:'private-access-token', refresh_token:'private-refresh-token', expires_in:3600, scope:GA_SCOPE, token_type:'Bearer' };
const connection = () => ({schema:'beat-geo/ga-connection@1',client,tokens:{accessToken:'private-access-token',refreshToken:'private-refresh-token',expiresAt:0,scopes:[GA_SCOPE]},property:{id:'123456789',name:'Example'},site:'example.com'});
const fakeGoogle = async (url, opts) => {
  url = String(url);
  if(url === 'https://oauth2.googleapis.com/token') return json(tokenResponse);
  if(url.includes('accountSummaries')) return json({accountSummaries:[{propertySummaries:[{property:'properties/123456789',displayName:'Example'}]}]});
  if(url.endsWith('/dataStreams?pageSize=200')) return json({dataStreams:[{webStreamData:{defaultUri:'https://example.com/'}}]});
  if(url.endsWith('/properties/123456789')) return json({timeZone:'Asia/Shanghai'});
  if(url.endsWith(':runReport')) return json(JSON.parse(opts.body).dimensions.some(d=>d.name==='landingPage')?example.landing:example.sources);
  throw new Error('Unexpected URL');
};
const consent = async url => { const u=new URL(url); const callback=new URL(u.searchParams.get('redirect_uri')); callback.searchParams.set('state',u.searchParams.get('state'));callback.searchParams.set('code','private-code'); await fetch(callback); };

test('GA classification merges legacy referral with native AI, without brand substring false positives',()=>{
  assert.equal(classifyGaSource('chatgpt.com','Referral').platform,'ChatGPT');
  assert.equal(classifyGaSource('WWW.DOUBAO.COM','Referral').platform,'豆包 / Doubao');
  assert.equal(classifyGaSource('new.example','AI Assistant').basis,'ga-channel');
  for(const source of ['deepseekv4.dev','gemini3api.com','chatgpt.com.evil.test','fakechatgpt.com','perplexity','foo.ai']) assert.equal(classifyGaSource(source,'AI Traffic'),null,source);
});
test('GA query scopes exact hostname, unions native and domain rules, uses session dimensions',()=>{
  const q=gaRequest({site:'https://example.com/',dates:gaDates(),landing:true});
  assert.equal(q.dimensionFilter.andGroup.expressions[0].filter.stringFilter.value,'example.com');
  assert.equal(q.dimensionFilter.andGroup.expressions[1].orGroup.expressions.length,2);
  assert.deepEqual(q.dimensions.map(d=>d.name),[...GA_DIMENSIONS,'landingPage']);
  assert.deepEqual(q.metrics.map(m=>m.name),GA_METRICS);
  assert.ok(!JSON.stringify(q).includes('firstUser'));
  assert.ok(!JSON.stringify(q).includes('PlusQueryString'));
});
test('GA dates resolve and freeze in property timezone including date boundaries',()=>{
  assert.equal(gaProperty('properties/543464384'),'543464384');
  assert.throws(()=>gaProperty('G-ABC'));
  for(const date of ['2026-02-29','2026-04-31','1dayAgo','foo']) assert.throws(()=>gaDates({start:date}));
  assert.throws(()=>gaDates({start:'2026-10-26',end:'2026-10-25'}));
  const dates=resolveGaDates(gaDates(), 'Asia/Shanghai', Date.parse('2026-10-25T17:00:00Z'));
  assert.deepEqual(dates,{startDate:'2026-09-28',endDate:'2026-10-25'});
  assert.throws(()=>resolveGaDates(gaDates({start:'yesterday',end:'28daysAgo'}),'Asia/Shanghai'));
});
test('GA source totals never double-count the landing table and do not fabricate unique visitors',()=>{
  const g=analyzeGa(copy());
  assert.deepEqual(g.totals,{sessions:22,engagedSessions:13,keyEvents:3});
  assert.equal(g.platforms.length,3);
  assert.equal(g.observation,'observed');
  assert.equal(g.totals.users,undefined);
  assert.equal(g.synthetic,true);
});
test('GA preserves quality warnings and distinguishes empty, limited and failed input',()=>{
  const s=copy();s.sources.metadata.subjectToThresholding=true;s.landing.metadata.samplingMetadatas=[{}];
  const limited=analyzeGa(s); assert.equal(limited.observation,'limited');assert.deepEqual(limited.warnings,['sources:thresholded','landing:sampled']);
  const empty=copy(); for(const report of [empty.sources,empty.landing]){report.rows=[];report.rowCount=0;}
  assert.equal(analyzeGa(empty).observation,'empty');
  const broken=copy();broken.sources.rowCount=100;assert.throws(()=>analyzeGa(broken),/Incomplete/);
  const duplicate=copy();duplicate.sources.rows.push(duplicate.sources.rows[0]);duplicate.sources.rowCount++;assert.throws(()=>analyzeGa(duplicate),/Duplicate/);
  const badMetric=copy();badMetric.sources.rows[0].metricValues[0].value='';assert.throws(()=>analyzeGa(badMetric),/metrics/);
  const relative=copy();relative.dates.startDate='28daysAgo';assert.throws(()=>analyzeGa(relative),/resolved/);
});
test('GA unknown rows remain evidence, not classified or included in AI totals',()=>{
  const s=copy();s.sources.rows[0].dimensionValues[0].value='deepseekv4.dev';s.sources.rows[0].dimensionValues[2].value='Referral';
  const g=analyzeGa(s);assert.equal(g.totals.sessions,10);assert.ok(g.warnings.includes('unclassified-rows'));
});
test('GA import strips query strings and unexpected fields from exported artifacts',()=>temp(async dir=>{
  const s=copy();s.tokens={access_token:'private-token'};s.sources.secret='private-secret';s.landing.rows[0].dimensionValues[3].value='/docs?private=query#secret';
  const file=path.join(dir,'input.json');await writeFile(file,JSON.stringify(s));
  const result=await loadGa(file);const exported=JSON.stringify(result);
  assert.equal(result.summary.pages[0].path,'/docs');for(const token of ['private-token','private-secret','private=query'])assert.ok(!exported.includes(token));
}));
test('GA Data API reads all pages and preserves metadata instead of silently truncating',async()=>{
  let calls=0;
  const result=await fetchGa({token:'private-token',property:example.property,site:'example.com',start:'2026-09-28',end:'2026-10-25',fetchImpl:async(url,opts)=>{
    if(url.includes('analyticsadmin'))return json({timeZone:'Asia/Shanghai'});
    calls++;const body=JSON.parse(opts.body);const source=body.dimensions.length===3;const report=source?example.sources:example.landing;const offset=Number(body.offset);
    assert.equal(opts.headers.Authorization,'Bearer private-token');
    return json({...report, rows:report.rows.slice(offset,offset+1),metadata:{...report.metadata,...(offset===1?{subjectToThresholding:true}:{})}});
  }});
  assert.equal(calls,7);assert.equal(result.summary.totals.sessions,22);
  assert.ok(result.summary.warnings.includes('sources:thresholded'));
  assert.ok(!JSON.stringify(result).includes('private-token'));
});
test('GA incomplete/changing pagination fails without inventing partial success',async()=>{
  await assert.rejects(fetchGa({token:'x',property:example.property,site:'example.com',fetchImpl:async(url)=>url.includes('analyticsadmin')?json({timeZone:'Asia/Shanghai'}):json({...example.sources,rows:[],rowCount:8})}),/pagination incomplete/);
});
test('GA API errors and malformed bodies never expose credentials or provider error echoes',async()=>{
  for(const status of [400,401,403,429,500])await assert.rejects(googleJson('https://example.test',{token:'private-token',fetchImpl:async()=>({ok:false,status,json:async()=>({error:'private-token'})})}),e=>e.message.includes(String(status))&&!e.message.includes('private-token'));
  await assert.rejects(googleJson('https://example.test',{fetchImpl:async()=>{throw new Error('private-token')}}),e=>!e.message.includes('private-token'));
});
test('GA Admin property enumeration paginates and stream defaults supply hostname suggestions',async()=>{
  let n=0;
  const properties=await listGaProperties('secret',{fetchImpl:async()=>json({accountSummaries:[{propertySummaries:[{property:`properties/${++n}`,displayName:`Site ${n}`}]}],...(n===1?{nextPageToken:'next'}:{})})});
  assert.equal(properties.length,2);
  const sites=await listGaSites('secret','1',{fetchImpl:async()=>json({dataStreams:[{webStreamData:{defaultUri:'https://EXAMPLE.com/docs'}},{androidAppStreamData:{}},{webStreamData:{defaultUri:'https://example.com/'}}]})});
  assert.deepEqual(sites,['example.com']);
});
test('GA OAuth callback validates state, PKCE, loopback host and only requests analytics.readonly',async()=>{
  let verifier,challenge;
  const tokens=await authorizeGa(client,{openBrowser:async url=>{
    const u=new URL(url);assert.equal(u.origin,'https://accounts.google.com');assert.equal(u.searchParams.get('scope'),GA_SCOPE);assert.equal(u.searchParams.get('code_challenge_method'),'S256');assert.equal(u.searchParams.get('access_type'),'offline');
    challenge=u.searchParams.get('code_challenge');
    const cb=new URL(u.searchParams.get('redirect_uri'));assert.equal(cb.hostname,'127.0.0.1');cb.searchParams.set('state','invalid');cb.searchParams.set('code','bad');assert.equal((await fetch(cb)).status,400);
    cb.searchParams.set('state',u.searchParams.get('state'));cb.searchParams.set('code','private-code');assert.equal((await fetch(cb)).status,200);
  },fetchImpl:async(url,opts)=>{
    assert.equal(url,'https://oauth2.googleapis.com/token');const form=new URLSearchParams(opts.body);verifier=form.get('code_verifier');assert.equal(form.get('code'),'private-code');assert.equal(form.get('client_secret'),'private-client-secret');return json(tokenResponse);
  }});
  assert.equal(createHash('sha256').update(verifier).digest('base64url'),challenge);assert.equal(tokens.refreshToken,'private-refresh-token');
});
test('GA OAuth denial and timeout terminate without leaving a successful authorization',async()=>{
  await assert.rejects(authorizeGa(client,{openBrowser:async url=>{const u=new URL(url),cb=new URL(u.searchParams.get('redirect_uri'));cb.searchParams.set('state',u.searchParams.get('state'));cb.searchParams.set('error','access_denied');await fetch(cb);}}),/declined/);
  await assert.rejects(authorizeGa(client,{openBrowser:async()=>{},timeoutMs:10}),/timed out/);
});
test('GA OAuth refuses missing scopes or offline token; refresh keeps the existing refresh token',async()=>{
  await assert.rejects(authorizeGa(client,{openBrowser:consent,fetchImpl:async()=>json({...tokenResponse,scope:'openid'})}),/permission/);
  const old=connection();let calls=0;
  const refreshed=await refreshGaConnection(old,{fetchImpl:async(url,opts)=>{calls++;const form=new URLSearchParams(opts.body);assert.equal(form.get('grant_type'),'refresh_token');return json({...tokenResponse,refresh_token:undefined,scope:undefined});}});
  assert.equal(calls,1);assert.equal(refreshed.tokens.refreshToken,old.tokens.refreshToken);assert.deepEqual(refreshed.tokens.scopes,[GA_SCOPE]);
  assert.equal(await refreshGaConnection(refreshed,{fetchImpl:async()=>{throw new Error('should not fetch')}}),refreshed);
});
test('GA persistent credentials stay private and outside report/project; local disconnect removes them',()=>temp(async root=>{
  const c=connection();await saveGaConnection(c,{root});assert.equal((await stat(path.join(root,'default.json'))).mode&0o777,0o600);
  assert.deepEqual(await readGaConnection({root}),c);await chmod(path.join(root,'default.json'),0o644);await assert.rejects(readGaConnection({root}),/private/);
  await removeGaConnection({root});await assert.rejects(readGaConnection({root}),/missing/);
  await assert.rejects(saveGaConnection(c,{name:'../escape',root}),/Connection name/);
  await assert.rejects(saveGaConnection(c,{root:path.resolve('runs/credentials')}),/outside/);
}));
test('GA refuses symlink credential file and web/service-account OAuth client files',()=>temp(async root=>{
  const file=path.join(root,'client.json');await writeFile(file,JSON.stringify({web:{client_id:client.id}}));await assert.rejects(readGaClient(file),/Desktop/);
  await writeFile(file,JSON.stringify({installed:{client_id:client.id,client_secret:client.secret}}));assert.deepEqual(await readGaClient(file),client);
  await symlink(file,path.join(root,'default.json'));await assert.rejects(readGaConnection({root}),/missing/);
}));
test('GA connect then sync executes a complete mocked first-use flow, no secrets in output',()=>temp(async root=>{
  const clientFile=path.join(root,'client.json');await writeFile(clientFile,JSON.stringify({installed:{client_id:client.id,client_secret:client.secret}}));
  const out=path.join(root,'report');const deps={root:path.join(root,'private'),openBrowser:consent,fetchImpl:fakeGoogle};
  await cmdGa({'client-file':clientFile,out,lang:'zh'},'connect',deps);
  const persisted=await readGaConnection({root:deps.root});assert.equal(persisted.site,'example.com');
  const html=await readFile(path.join(out,'report.html'),'utf8');assert.match(html,/AI 引荐流量/);assert.ok(!html.includes('private-'));
  const input=await readFile(path.join(out,'ga-input.json'),'utf8');assert.ok(!input.includes('private-'));
  await cmdGa({out},'sync',deps);assert.equal((await loadGa(path.join(out,'ga-input.json'))).summary.totals.sessions,22);
}));
test('GA report reuses current responsive theme, escapes evidence and retains source details',()=>{
  const s=copy();s.property.name='<script>alert(1)</script>';const g=analyzeGa(s);const html=renderHtml(g,[],{lang:'zh'});
  assert.match(html,/--bg:#fbfaf8/);assert.match(html,/grid-template-columns:repeat\(2/);assert.match(html,/合成 GA 演示数据/);assert.match(html,/来源依据与统计边界/);assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));
  assert.match(renderMarkdown(g,[],{lang:'en'}),/Sessions are not unique visitors/);
  const run=buildRun([{schema:'beat-geo/record@1',questionId:'q',question:'Q',engine:'test',repeat:1,response:response(message('Example'))}],normalizeConfig({}),[]);
  run.summary.ga=g;assert.match(renderHtml(run.summary,run.actions,{lang:'zh'}),/AI 引荐流量/);assert.equal(run.summary.overall.n,1);
});
test('GA CLI offline replay needs no connection and rejects misuse before authorization',()=>temp(async root=>{
  const result=await exec(process.execPath,['bin/beat-geo.mjs','ga','--input','examples/ga.example.json','--out',path.join(root,'report'),'--lang','zh'],{env:{...process.env,BEAT_GEO_GA_HOME:path.join(root,'missing')}});
  assert.match(result.stdout,/22 次 AI 来源会话/);assert.match(result.stdout,/合成/);
  await assert.rejects(exec(process.execPath,['bin/beat-geo.mjs','ga','connect']),e=>e.stderr.includes('--client-file'));
  await assert.rejects(exec(process.execPath,['bin/beat-geo.mjs','ga','--input','examples/ga.example.json','--start-date','yesterday']),e=>e.stderr.includes('retain their own dates'));
  await assert.rejects(loadRecords('examples/ga.example.json',{question:'Q'}),/not an answer/);
}));
test('GA first query failure leaves credentials/report untouched and validates profile before browser',()=>temp(async root=>{
  const clientFile=path.join(root,'client.json');await writeFile(clientFile,JSON.stringify({installed:{client_id:client.id}}));
  const deps={root:path.join(root,'private'),openBrowser:consent,fetchImpl:async(url,opts)=>String(url).endsWith(':runReport')?{ok:false,status:403}:fakeGoogle(url,opts)};
  await assert.rejects(cmdGa({'client-file':clientFile,out:path.join(root,'out')},'connect',deps),/403/);
  await assert.rejects(readGaConnection({root:deps.root}),/missing/);
  await assert.rejects(stat(path.join(root,'out','report.html')));
  await assert.rejects(cmdGa({'client-file':clientFile,connection:'../bad'},'connect',{openBrowser:()=>assert.fail('must not open')}),/Connection name/);
}));
test('GA and crawl observations attach without changing answer counts; mixed-host reports are rejected',()=>temp(async root=>{
  const answers=path.join(root,'answers');await exec(process.execPath,['bin/beat-geo.mjs','demo','--out',answers]);
  const out=path.join(root,'combined');
  await exec(process.execPath,['bin/beat-geo.mjs','analyze','--input',answers,'--ga-input','examples/ga.example.json','--crawl-log','examples/crawls.example.json','--site','example.com','--out',out,'--lang','zh']);
  const summary=JSON.parse(await readFile(path.join(out,'summary.json'),'utf8'));assert.equal(summary.overall.n,20);assert.equal(summary.ga.totals.sessions,22);assert.equal(summary.crawls.totals.requests,5);
  const mismatch=copy();mismatch.site='different.example';const input=path.join(root,'different.json');await writeFile(input,JSON.stringify(mismatch));
  await assert.rejects(exec(process.execPath,['bin/beat-geo.mjs','analyze','--input',answers,'--ga-input',input,'--crawl-log','examples/crawls.example.json','--site','example.com','--out',path.join(root,'invalid')]),e=>e.stderr.includes('same site hostname'));
}));
