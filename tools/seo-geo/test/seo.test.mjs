import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,readFile,writeFile,stat,rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {SEO_TOOLS,seoInput,seoMaxCost} from '../src/seo-catalog.mjs';
import {buildSeoPlan,collectSeo,normalizeSeoSnapshot,loadSeo,seoSummary,seoQuestionCandidates,seoOpportunities,diffSeo} from '../src/seo.mjs';
import {cmdSeo} from '../src/seo-cli.mjs';
import {renderHtml,renderMarkdown} from '../src/report.mjs';
import {loadRecords,buildRun} from '../src/run.mjs';
import {normalizeConfig} from '../src/config.mjs';
const fixture=JSON.parse(await readFile(new URL('../examples/seo.snapshot.example.json',import.meta.url),'utf8'));
const project=JSON.parse(await readFile(new URL('../examples/seo.project.example.json',import.meta.url),'utf8'));
const plan=()=>buildSeoPlan({site:'acme.example',requests:[{tool:'domain-rating',input:{domain:'acme.example'}}]});
const ok=(extra={})=>new Response(JSON.stringify({object:'seo.domain_rating',domain:'acme.example',has_data:true,domain_rating:0,link_rank:123,usage:{price_usd:'0.005'},...extra}),{status:200});
const temp=async t=>{const dir=await mkdtemp(path.join(os.tmpdir(),'beatgeo-seo-'));t.after(()=>rm(dir,{recursive:true,force:true}));return dir;};
const cli=(...args)=>execFileSync(process.execPath,['bin/beat-geo.mjs',...args],{cwd:path.resolve(new URL('..',import.meta.url).pathname),encoding:'utf8',env:{PATH:process.env.PATH,HOME:os.tmpdir()}});

test('all 12 endpoints planned once per domain / keyword batch with correct maximum prices',()=>{
 const p=buildSeoPlan(project); assert.equal(new Set(p.items.map(r=>r.tool)).size,12);assert.equal(p.items.length,21);
 assert.equal(seoMaxCost('domain-rating-history',{domain:'acme.example'}),.096);
 assert.equal(seoMaxCost('site-traffic',{months:12}),.015);
 assert.equal(seoMaxCost('ranked-keywords',{limit:20}),.024);
 assert.equal(seoMaxCost('backlinks',{limit:20}),.039);
 assert.equal(seoMaxCost('keyword-overview',{keywords:['one','two']}),.0186);
 assert.equal(p.items.filter(r=>r.tool==='keyword-overview').length,1);
 assert.equal(buildSeoPlan({...project,competitors:['www.acme.example','zeta.example','zeta.example']}).items.length,21);
});
test('strict input validation excludes unsupported fields, countries, accidental broad queries',()=>{
 for(const tool of ['constructor','toString','__proto__','unknown']) assert.throws(()=>seoInput(tool,{}));
 for(const input of [{domain:'a.example',country:'us'},{domain:'a.example',limit:20}])assert.throws(()=>seoInput('domain-rating',input));
 assert.throws(()=>seoInput('ranked-keywords',{domain:'a.example',contains:'x%'}));
 assert.throws(()=>seoInput('keyword-ideas',{keywords:Array(21).fill('test')}));
 assert.throws(()=>seoInput('domain-overview',{domain:'a.example',country:'cn'}));
 assert.throws(()=>seoInput('domain-overview',{domain:'https://user:secret@a.example'}));
 assert.throws(()=>buildSeoPlan({...project,apiKey:'secret'}));
 assert.throws(()=>buildSeoPlan({site:'a.example',requests:[],country:'us'}));
 assert.deepEqual(seoInput('keyword-overview',{keywords:['HELLO','hello']}),{keywords:['hello'],country:'us'});
});
test('budget / request caps / missing key fail before any network',async()=>{
 let calls=0;const fetchImpl=async()=>{calls++;return ok();};
 for(const opts of [{budgetUsd:.001,apiKey:'test-secret'},{budgetUsd:1},{budgetUsd:1,apiKey:'test-secret',maxRequests:0}])await assert.rejects(()=>collectSeo(plan(),{...opts,fetchImpl}));
 assert.equal(calls,0);
});
test('all endpoint request bodies and response contracts survive mocked collection',async()=>{
 const p=buildSeoPlan(project);let i=0;const saved=[];
 const s=await collectSeo(p,{apiKey:'test-secret',budgetUsd:2,onSnapshot:async s=>saved.push(structuredClone(s)),fetchImpl:async(url,opts)=>{
  const r=fixture.records[i++];assert.equal(url,`https://api.beatapi.io/v1/seo/${r.tool}`);assert.equal(opts.redirect,'error');assert.deepEqual(JSON.parse(opts.body),r.input);
  assert.equal(opts.headers.Authorization,'Bearer test-secret');return new Response(JSON.stringify(r.response));
 }});
 assert.equal(i,21);assert.ok(s.records.every(r=>r.status==='ok'));assert.equal(saved.length,22);assert.ok(!JSON.stringify(s).includes('test-secret'));
});
test('retry reuses idempotency key and respects wire request cap',async()=>{
 const keys=[];const s=await collectSeo(plan(),{apiKey:'test-secret',budgetUsd:1,maxRequests:2,sleep:async()=>{},fetchImpl:async(u,o)=>{
  keys.push(o.headers['Idempotency-Key']);return keys.length===1?new Response(JSON.stringify({error:{code:'processing_unavailable',retryable:true}}),{status:503}):ok();
 }});
 assert.equal(keys.length,2);assert.equal(keys[0],keys[1]);assert.equal(s.records[0].actualUsd,.005);
 const limited=await collectSeo(plan(),{apiKey:'test-secret',budgetUsd:1,maxRequests:1,fetchImpl:async()=>new Response(JSON.stringify({error:{code:'processing_unavailable',retryable:true}}),{status:503})});
 assert.equal(limited.requestsSent,1);assert.equal(limited.records[0].reservedUsd,0);
});
test('uncertain timeouts reserve cost; missing usage stays unknown; price increase halts',async()=>{
 const s=await collectSeo(plan(),{apiKey:'test-secret',budgetUsd:1,fetchImpl:async()=>{throw new Error('test-secret');}});
 assert.equal(s.records[0].reservedUsd,.005);assert.equal(s.requestsSent,1);assert.ok(!JSON.stringify(s).includes('test-secret'));
 const unknown=await collectSeo(plan(),{apiKey:'test-secret',budgetUsd:1,fetchImpl:async()=>ok({usage:undefined})});assert.equal(unknown.records[0].actualUsd,undefined);
 const p=buildSeoPlan({site:'acme.example',workflows:['overview']});let calls=0;
 const exceeded=await collectSeo(p,{apiKey:'test-secret',budgetUsd:1,fetchImpl:async()=>{calls++;return new Response(JSON.stringify({object:'seo.domain_overview',domain:'acme.example',country:'us',has_data:false,usage:{price_usd:'2'}}));}});
 assert.equal(calls,1);assert.equal(exceeded.stopped,'price_exceeded_estimate');assert.equal(exceeded.reservedUsd,2);
});
test('invalid response, wrong domain/market and echoed secret never become successful evidence',async()=>{
 for(const response of [()=>ok({domain:'wrong.example'}),()=>ok({description:'test-secret'}),()=>new Response('{}'),()=>new Response('<html>')]){
  const s=await collectSeo(plan(),{apiKey:'test-secret',budgetUsd:1,fetchImpl:async()=>response()});assert.equal(s.records[0].status,'error');assert.equal(s.records[0].response,undefined);assert.ok(!JSON.stringify(s).includes('test-secret'));
 }
});
test('no data differs from zero and missing fields; safe imports reject duplicates and mixed domains',()=>{
 const s=structuredClone(fixture);const r=s.records.find(r=>r.tool==='domain-rating');r.response.domain_rating=0;delete r.response.link_rank;r.response.has_data=true;
 const c=normalizeSeoSnapshot(s).records.find(r=>r.tool==='domain-rating');assert.equal(c.response.domain_rating,0);assert.equal(c.response.link_rank,undefined);
 s.records.push(s.records[0]);assert.throws(()=>normalizeSeoSnapshot(s),/Duplicate/);
 const bad=structuredClone(fixture);bad.records[0].response.domain='evil.example'; // first record is keyword endpoint; domain mismatch checked on domain records below
 const d=bad.records.find(r=>r.input.domain);d.response.domain='evil.example';assert.throws(()=>normalizeSeoSnapshot(bad),/mismatch/);
});
test('bilingual reports show all 12 tools, historical dates, sample denominators and escaped values',()=>{
 const s=structuredClone(fixture);s.records.find(r=>r.tool==='keyword-overview').response.results[0].keyword='<script>alert(1)</script>';
 const summary=seoSummary(s);
 for(const lang of ['en','zh']) {const html=renderHtml(summary,[],{lang}),md=renderMarkdown(summary,[],{lang});assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('2026-09-15'));assert.ok(md.includes('domain\\_rating'));assert.ok(html.includes('gen_ai'));}
 const geo=buildRun([],normalizeConfig({}),[]).summary;geo.overall.n=20;geo.overall.domains=[{domain:'zeta.example',answersCited:6}];geo.seo=summary;
 assert.ok(renderHtml(geo,[],{lang:'zh'}).includes('6/20'));assert.ok(seoOpportunities(summary,geo).some(r=>r.aiCited==='6/20'));
});
test('candidate questions require review, preserve evidence and do not mutate fixed questions',()=>{
 const s=seoSummary(fixture),before=JSON.stringify(s),c=seoQuestionCandidates(s);assert.equal(c.reviewRequired,true);assert.equal(c.candidates.length,2);assert.ok(c.candidates[0].recordId);assert.equal(JSON.stringify(s),before);
});
test('diff compares identical scope only and preserves missing vs zero',()=>{
 const a=normalizeSeoSnapshot(fixture),b=structuredClone(a);b.records.find(r=>r.tool==='domain-rating').response.domain_rating=0;
 assert.ok(diffSeo(a,b).rows.some(r=>r.metric==='domain_rating'&&r.delta===-27));
 b.site='wrong.example';assert.throws(()=>diffSeo(a,b));
});
test('SEO connect persists only credential reference and reports unverified; disconnect removes binding',async t=>{
 const dir=await temp(t);const env={BEATAPI_API_KEY:'test-secret'};
 await cmdSeo({},'connect',{root:dir,env});const saved=await readFile(path.join(dir,'default.json'),'utf8');assert.ok(!saved.includes('test-secret'));assert.equal((await stat(path.join(dir,'default.json'))).mode&0o777,0o600);
 await cmdSeo({},'status',{root:dir,env});await cmdSeo({},'disconnect',{root:dir,env});await assert.rejects(()=>stat(path.join(dir,'default.json')));
});
test('dry run needs no key, sends nothing and writes nothing; execution requires budget',async t=>{
 const dir=await temp(t),out=path.join(dir,'absent');let calls=0;
 await cmdSeo({config:'examples/seo.project.example.json',out},'run',{env:{},fetchImpl:async()=>{calls++;return ok();}});assert.equal(calls,0);await assert.rejects(()=>stat(out));
 await assert.rejects(()=>cmdSeo({config:'examples/seo.project.example.json',out,execute:true},'run',{env:{BEATAPI_API_KEY:'test-secret'}}),/budget/);
});
test('offline CLI renders all tools and appends SEO to a GEO run without network',async t=>{
 const dir=await temp(t),seo=path.join(dir,'seo'),answers=path.join(dir,'answers'),combined=path.join(dir,'combined');
 cli('seo','--input','examples/seo.snapshot.example.json','--out',seo,'--lang','zh');
 assert.ok((await readFile(path.join(seo,'report.html'),'utf8')).includes('合成 SEO'));
 assert.throws(()=>cli('seo','--input','examples/seo.snapshot.example.json','--out',seo));
 cli('demo','--out',answers);cli('analyze','--input',answers,'--seo-input','examples/seo.snapshot.example.json','--out',combined,'--lang','zh');
 const html=await readFile(path.join(combined,'report.html'),'utf8');assert.ok(html.includes('SEO &amp; GEO'));assert.ok(html.includes('AI 引用背景'));
 await assert.rejects(()=>loadRecords('examples/seo.snapshot.example.json',{question:'Question'}),/not an answer/);
});

test('retry followed by missing usage reserves full estimate, and auth failure halts all later queries',async()=>{
 let count=0;const s=await collectSeo(plan(),{apiKey:'test-secret',budgetUsd:1,sleep:async()=>{},fetchImpl:async()=>++count===1?new Response(JSON.stringify({error:{code:'processing_failed',retryable:true}}),{status:503}):ok({usage:undefined})});
 assert.equal(s.records[0].reservedUsd,.005);assert.equal(s.records[0].actualUsd,undefined);
 const p=buildSeoPlan({site:'acme.example',workflows:['overview']});count=0;
 const stopped=await collectSeo(p,{apiKey:'test-secret',budgetUsd:1,fetchImpl:async()=>{count++;return new Response(JSON.stringify({error:{code:'invalid_api_key',message:'test-secret',retryable:false}}),{status:401});}});
 assert.equal(count,1);assert.equal(stopped.stopped,'authorization_or_balance');assert.ok(!JSON.stringify(stopped).includes('test-secret'));
});
test('private credential permissions and unknown options fail without API calls',async t=>{
 const dir=await temp(t),file=path.join(dir,'key.env');await writeFile(file,'BEATAPI_API_KEY=test-secret',{mode:0o644});
 await assert.rejects(()=>cmdSeo({'key-file':file},'connect',{root:dir,env:{}}),/private/);
 await assert.rejects(()=>cmdSeo({input:'examples/seo.snapshot.example.json',execute:true},'run',{root:dir,env:{}}),/not used/);
 await assert.rejects(()=>cmdSeo({connection:'../bad'},'status',{root:dir,env:{}}),/Invalid/);
});
test('scoped diffs preserve old/new URLs and observed times; changed market is not comparable',()=>{
 const a=normalizeSeoSnapshot(fixture),raw=structuredClone(fixture);
 const r=raw.records.find(r=>r.tool==='ranked-keywords');r.response.results[0].position=3;r.response.results[0].url='https://acme.example/new';r.response.results[0].position_seen_at='2026-10-01T00:00:00Z';
 const b=normalizeSeoSnapshot(raw),diff=diffSeo(a,b);const row=diff.rows.find(r=>r.metric==='position'&&r.domain==='acme.example');
 assert.equal(row.delta,-9);assert.equal(row.headUrl,'https://acme.example/new');assert.equal(row.headObservedAt,'2026-10-01T00:00:00Z');
 r.input.country='gb';r.response.country='gb';const changed=diffSeo(a,normalizeSeoSnapshot(raw));assert.ok(!changed.rows.some(r=>r.metric==='position'&&r.domain==='acme.example'));
});
test('CLI rejects combining another site with declared brand before writing report',async t=>{
 const dir=await temp(t),answers=path.join(dir,'answers'),config=path.join(dir,'brands.json'),out=path.join(dir,'combined');
 cli('demo','--out',answers);await writeFile(config,JSON.stringify({brand:{name:'Other',domains:['other.example']}}));
 assert.throws(()=>cli('analyze','--input',answers,'--config',config,'--seo-input','examples/seo.snapshot.example.json','--out',out));
 await assert.rejects(()=>stat(out));
});
