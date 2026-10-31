import test from 'node:test';
import http from 'node:http';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,stat,rm,readdir} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {createWorkbench} from '../src/workbench.mjs';
const fixture=JSON.parse(await readFile(new URL('../examples/seo.snapshot.example.json',import.meta.url)));
async function setup(t,fetchImpl=async()=>{throw Error('Unexpected external request');}){
 const root=await mkdtemp(path.join(os.tmpdir(),'geo-workbench-'));
 const app=await createWorkbench({dataDir:path.join(root,'data'),credentialFile:path.join(root,'secret','key.json'),initialKey:'',fetchImpl});
 await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
 t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
 const origin=`http://127.0.0.1:${app.server.address().port}`;
 const html=await (await fetch(origin)).text();const token=/name="workbench-token" content="([^"]+)"/.exec(html)[1];
 const api=async(route,data,headers={})=>{const res=await fetch(`${origin}/api/${route}`,{method:data===undefined?'GET':'POST',headers:{'X-Workbench-Token':token,...(data===undefined?{}:{'Content-Type':'application/json'}),...headers},...(data===undefined?{}:{body:JSON.stringify(data)})});return {status:res.status,body:await res.json()};};
 return {root,origin,api,app,token};
}
const config={site:'acme.example',workflows:['overview']};
async function done(api,id){for(let i=0;i<100;i++){const d=await api(`runs/${id}`);if(d.body.meta.status!=='running')return d.body;await new Promise(r=>setTimeout(r,10));}throw Error('job stuck');}

test('loopback workbench enforces origin, host, CSRF and body type',async t=>{
 const {origin,api}=await setup(t);assert.equal((await fetch(`${origin}/api/state`)).status,403);
 assert.equal((await api('key',{key:'secret-test-key'},{Origin:'https://evil.example'})).status,403);
 assert.equal(await new Promise(resolve=>{http.get(`${origin}/api/state`,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode);});}),403);
 assert.equal((await api('state',undefined,{'Sec-Fetch-Site':'cross-site'})).status,403);
 assert.equal((await api('plan',{config,budget:1},{'Content-Type':'text/plain'})).status,415);
 assert.equal((await api('state')).body.key.present,false);
 assert.equal((await fetch(`${origin}/../src/workbench.mjs`)).status,403);
});
test('key saved server-side only, optional private persistence and disconnect; never echoed',async t=>{
 const {root,api,origin}=await setup(t);let r=await api('key',{key:'secret-test-key',remember:true});assert.equal(r.status,200);assert.equal(r.body.verified,false);
 const file=path.join(root,'secret','key.json');assert.equal((await stat(file)).mode&0o777,0o600);
 assert.ok(!JSON.stringify((await api('state')).body).includes('secret-test-key'));assert.ok(!(await (await fetch(origin)).text()).includes('secret-test-key'));
 r=await api('key',{key:'another-secret-key',remember:false});assert.equal(r.status,200);await assert.rejects(()=>stat(file));
 await api('key/disconnect',{});assert.equal((await api('state')).body.key.present,false);
});
test('preview never queries; server computes cost and rejects budget / invalid scope',async t=>{
 let calls=0;const {api}=await setup(t,async()=>{calls++;throw Error();});
 const p=await api('plan',{config,budget:1});assert.equal(p.status,200);assert.equal(p.body.items.length,3);assert.equal(p.body.maxCostUsd,.0283);assert.equal(calls,0);
 assert.equal((await api('plan',{config,budget:.001})).status,400);
 assert.equal((await api('plan',{config:{...config,apiKey:'secret'},budget:1})).status,400);
 assert.equal((await api('execute',{planId:p.body.id})).status,400);assert.equal(calls,0);
});
test('confirmed execution uses server plan, persists reports, rejects replay and reports verified status',async t=>{
 let calls=0;const {api,origin}=await setup(t,async(url,opts)=>{calls++;const input=JSON.parse(opts.body);const tool=url.split('/').at(-1);const source=fixture.records.find(r=>r.tool===tool&&r.input.domain===input.domain);return new Response(JSON.stringify(source.response));});
 await api('key',{key:'secret-test-key'});const p=(await api('plan',{config,budget:1})).body;
 const r=await api('execute',{planId:p.id,config:{site:'evil.example'},budget:100});assert.equal(r.status,202);
 const d=await done(api,r.body.id);assert.equal(d.meta.status,'complete');assert.equal(calls,3);assert.ok(d.snapshot.records.every(r=>r.input.domain==='acme.example'));
 assert.equal((await api('execute',{planId:p.id})).status,409);assert.equal((await api('state')).body.key.verified,true);
 const report=await fetch(`${origin}/reports/${r.body.id}/report.html`);assert.equal(report.status,200);const html=await report.text();assert.ok(html.includes('SEO &amp; GEO'));assert.ok(!html.includes('secret-test-key'));
});
test('one active job even with concurrent executions; cancel preserves partial result',async t=>{
 let release,calls=0;const {api}=await setup(t,async()=>{calls++;await new Promise(r=>release=r);return new Response(JSON.stringify(fixture.records.find(r=>r.tool==='domain-overview').response));});
 await api('key',{key:'secret-test-key'});const p1=(await api('plan',{config,budget:1})).body,p2=(await api('plan',{config,budget:1})).body;
 const [a,b]=await Promise.all([api('execute',{planId:p1.id}),api('execute',{planId:p2.id})]);assert.deepEqual([a.status,b.status].sort(),[202,409]);
 assert.equal((await api('key',{key:'new-secret-key'})).status,409);await api('cancel',{});while(!release)await new Promise(r=>setTimeout(r,5));release();
 const id=(a.status===202?a:b).body.id,d=await done(api,id);assert.equal(d.meta.status,'cancelled');assert.equal(calls,1);assert.equal(d.snapshot.records.length,1);
});
test('demo/import/questions/tasks/diff all operate offline; GEO linking and escaped report',async t=>{
 const {api,origin}=await setup(t);const id=(await api('demo',{})).body.id;let d=(await api(`runs/${id}`)).body;assert.equal(d.meta.synthetic,true);assert.equal(d.candidates.candidates.length,2);
 const questions=[{id:'seo-q1',text:'Which image APIs should I compare?'}];assert.equal((await api('questions',{id,questions})).status,200);
 const q=await (await fetch(`${origin}/reports/${id}/questions.json`)).json();assert.equal(q.questions[0].text,questions[0].text);
 await api('tasks',{id,index:0,status:'doing'});d=(await api(`runs/${id}`)).body;assert.equal(d.tasks[0],'doing');
 const capture={schema:'beat-geo/capture@1',questionId:'q1',question:'Which API?',engine:'test',answer:'<script>alert(1)</script> Zeta is mentioned.',citedUrls:['https://zeta.example/page']};
 assert.equal((await api('geo',{id,records:[capture]})).status,200);d=(await api(`runs/${id}`)).body;assert.equal(d.geo.overall.n,1);assert.ok(d.actions.some(a=>a.aiCited==='1/1'));
 const html=await (await fetch(`${origin}/reports/${id}/report.html`)).text();assert.ok(!html.includes('<script>'));
 const next=(await api('import',{snapshot:fixture})).body.id;assert.equal((await api('compare',{base:id,head:next})).status,200);
 assert.equal((await api('geo',{id,records:[{schema:'beat-geo/summary@1'}]})).status,400);
});
test('research plan retains same-site GEO context and rejects unrelated parent',async t=>{
 const {api}=await setup(t);const id=(await api('demo',{})).body.id;
 assert.equal((await api('plan',{config,budget:1,parentId:id})).status,200);
 assert.equal((await api('plan',{config:{site:'other.example',workflows:['overview']},budget:1,parentId:id})).status,400);
});

test('GEO import rejects duplicate answers and question text drift before replacing evidence',async t=>{
 const {api}=await setup(t),id=(await api('demo',{})).body.id;
 const r={schema:'beat-geo/capture@1',questionId:'q1',question:'Which API?',engine:'test',answer:'An answer'};
 assert.equal((await api('geo',{id,records:[r,r]})).status,400);
 assert.equal((await api('geo',{id,records:[r,{...r,question:'Different question',answer:'Different'}]})).status,400);
 assert.equal((await api(`runs/${id}`)).body.geo,null);
});

test('interrupted run rebuilds a partial report offline instead of staying stuck as running',async t=>{
 const {root,api}=await setup(t);const id=(await api('demo',{})).body.id;
 const {writeFile}=await import('node:fs/promises');const metaPath=path.join(root,'data',id,'meta.json');const meta=JSON.parse(await readFile(metaPath,'utf8'));meta.status='running';await writeFile(metaPath,JSON.stringify(meta));await rm(path.join(root,'data',id,'report.html'));
 const d=(await api(`runs/${id}`)).body;assert.equal(d.meta.status,'interrupted');assert.equal(d.reportReady,true);assert.equal((await api('state')).body.active,null);
});
