import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkbench } from '../src/workbench.mjs';
import { buildRun } from '../src/run.mjs';
import { normalizeConfig } from '../src/config.mjs';
const fixture=JSON.parse(await readFile(new URL('../examples/seo.snapshot.example.json',import.meta.url),'utf8'));

async function setup(t){
 const dir=await mkdtemp(path.join(os.tmpdir(),'beatgeo-managed-'));let key='managed-test-key',calls=[],imports=[];
 const base='/api/seo/test-brand';
 const app=await createWorkbench({dataDir:path.join(dir,'reports'),credentialFile:path.join(dir,'unused-key.json'),initialKey:'ignored-local-key',managed:{basePath:base,brandName:'Acme',settingsUrl:'/setup',promptsUrl:'/app/brand/prompts',responsesUrl:'/app/brand/responses',project:{site:'acme.example',workflows:['overview']},getKey:async()=>key,addQuestions:async input=>{imports.push(input);return{added:input.questions.length,existing:0};}},fetchImpl:async(url,options)=>{calls.push(options.headers.Authorization);return new Response(JSON.stringify(fixture.records.find(r=>r.tool===url.split('/').at(-1)).response));}});
 t.after(async()=>{await app.close();await rm(dir,{recursive:true,force:true});});
 const request=(route,options={})=>app.request(new Request(`http://localhost:3000${base}${route}`,options));
 const html=await(await request('/')).text(),token=html.match(/name="workbench-token" content="([^"]+)"/)[1];
 const api=async(route,data)=>{const response=await request(`/api/${route}`,{method:data===undefined?'GET':'POST',headers:{'X-Workbench-Token':token,'Content-Type':'application/json'},...(data===undefined?{}:{body:JSON.stringify(data)})});return{status:response.status,body:await response.json()};};
 return {app,api,request,dir,html,calls,imports,setKey:value=>key=value};
}
async function finish(api,id){for(let i=0;i<100;i++){const result=(await api(`runs/${id}`)).body;if(result.meta.status!=='running')return result;await new Promise(r=>setTimeout(r,5));}throw Error('Did not complete');}

test('managed workspace uses shared connection and scoped asset URLs without a second key store',async t=>{
 const {api,dir,html,request,setKey}=await setup(t);
 assert.match(html,/class="managed"/);assert.match(html,/src="\/api\/seo\/test-brand\/app.js"/);
 assert.equal((await request('/api/state')).status,403);
 assert.equal((await api('state')).body.key.present,true);assert.equal((await api('state')).body.workspace.settingsUrl,'/setup');
 assert.equal((await api('key',{key:'another-local-key'})).status,409);assert.equal((await api('key/disconnect',{})).status,409);
 setKey('');assert.equal((await api('state')).body.key.present,false);await assert.rejects(stat(path.join(dir,'unused-key.json')));
});

test('managed plans stay in the current brand and read the latest key at execution',async t=>{
 const {api,calls,setKey}=await setup(t);
 assert.equal((await api('plan',{config:{site:'other.example',workflows:['overview']},budget:1})).status,400);
 const plan=(await api('plan',{config:{site:'acme.example',workflows:['overview']},budget:1})).body;
 setKey('replacement-test-key');const run=(await api('execute',{planId:plan.id})).body;await finish(api,run.id);
 assert.equal(calls.length,3);assert.ok(calls.every(key=>key==='Bearer replacement-test-key'));
 setKey('');const next=(await api('plan',{config:{site:'acme.example',workflows:['overview']},budget:1})).body;
 assert.equal((await api('execute',{planId:next.id})).status,400);assert.equal(calls.length,3);
});

test('reviewed questions join monitoring only from a real same-brand report and known candidates',async t=>{
 const {api,imports}=await setup(t);
 const demo=(await api('demo',{})).body;assert.equal((await api('monitor',{id:demo.id,questions:[{id:'q1',text:'Synthetic?'}]})).status,400);
 const plan=(await api('plan',{config:{site:'acme.example',country:'us',language:'en',keywords:['image generation api'],workflows:['topics']},budget:1})).body;
 const run=(await api('execute',{planId:plan.id})).body,d=await finish(api,run.id),candidate=d.candidates.candidates[0];
 assert.ok(candidate);assert.equal((await api('monitor',{id:run.id,questions:[{id:'unknown',text:'Unknown?'}]})).status,400);
 const questions=[{id:candidate.id,text:'Which image API should I compare?'}];
 assert.equal((await api('monitor',{id:run.id,questions})).status,200);assert.equal(imports.length,1);assert.equal(imports[0].sourceRunId,run.id);assert.equal(imports[0].questions[0].text,questions[0].text);
 assert.equal((await api('import',{snapshot:{...fixture,site:'other.example'}})).status,400);
});

test('managed SEO directs users to brand evidence and never analyzes imported GEO answers',async t=>{
 const {api,request,dir}=await setup(t);
 assert.equal((await api('state')).body.workspace.responsesUrl,'/app/brand/responses');
 const {id}=(await api('demo',{})).body;
 const record={schema:'beat-geo/capture@1',questionId:'q1',question:'Which API?',engine:'test',answer:'Acme is an option.'};
 assert.equal((await api('geo',{id,records:[record]})).status,409);
 assert.equal((await api(`runs/${id}`)).body.geo,null);
 const legacy=buildRun([{schema:'beat-geo/record@1',questionId:'q1',question:'Which API?',engine:'legacy-secondary-evidence',source:'import',response:{choices:[{message:{content:'Acme is an option.'}}]}}],normalizeConfig({brand:{name:'Acme',domains:['acme.example']}}),[]).summary;
 await writeFile(path.join(dir,'reports',id,'geo-summary.json'),JSON.stringify(legacy));
 assert.equal((await api(`runs/${id}`)).body.geo,null);
 const exported=await request(`/reports/${id}/report.html?lang=en`);
 assert.equal(exported.status,200);
 assert.doesNotMatch(await exported.text(),/legacy-secondary-evidence/);
});
