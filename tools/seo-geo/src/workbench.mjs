import http from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, readdir, rename, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { buildSeoPlan, collectSeo, normalizeSeoSnapshot, seoSummary, seoQuestionCandidates, seoOpportunities, diffSeo } from './seo.mjs';
import { seoDomain } from './seo-catalog.mjs';
import { buildRun, writeOutputs } from './run.mjs';
import { normalizeConfig, loadQuestions } from './config.mjs';
import { CAPTURE_SCHEMA, captureToRecord } from './capture.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const UUID=/^[a-f0-9-]{36}$/;
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const humanError=message=>{
  if(message.includes('Unknown SEO workflow'))return '请至少选择一项分析范围。';
  if(message.includes('needs 1–20 keywords'))return '主题拓展需要 1–20 个种子关键词，每个最多 80 个字符。';
  if(message.includes('needs 1–100 keywords'))return '请填写 1–100 个关键词，每个最多 80 个字符。';
  if(message.includes('domain'))return '请检查网站和域名格式，使用有效的域名或完整网址。';
  if(message.includes('country'))return '市场代码无效；请使用两位小写代码，不支持 cn。';
  if(message.includes('language'))return '语言代码格式无效，例如 en、ja、zh-TW。';
  return message;
};
const safeConfig=raw=>{
  if(!raw || typeof raw!=='object' || Array.isArray(raw))throw fail('请先填写项目。');
  buildSeoPlan(raw);
  return JSON.parse(JSON.stringify(raw));
};
async function atomic(file,value) {
  await mkdir(path.dirname(file),{recursive:true,mode:0o700});
  const temp=`${file}.${randomUUID()}.tmp`;
  await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,file);
}
async function json(file, fallback) {try{return JSON.parse(await readFile(file,'utf8'));}catch(e){if(e.code==='ENOENT')return fallback;throw e;}}
async function body(req) {
  if(!String(req.headers['content-type']??'').startsWith('application/json'))throw fail('请求必须使用 JSON。',415);
  const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>20*1024*1024)throw fail('文件超过 20 MiB，请缩小导入范围。',413);chunks.push(chunk);}
  try{return JSON.parse(Buffer.concat(chunks).toString());}catch{throw fail('无法读取 JSON，请检查文件格式。');}
}
export async function createWorkbench({dataDir=path.join(root,'runs','workbench'),credentialFile=path.join(os.homedir(),'.beat-geo','workbench-key.json'),initialKey=process.env.BEATAPI_API_KEY??'',fetchImpl=fetch}={}) {
  await mkdir(dataDir,{recursive:true,mode:0o700});
  const csrf=randomBytes(32).toString('hex');
  let apiKey=initialKey,remembered=false,verified=false,active=null;
  if(!apiKey){try{if(((await stat(credentialFile)).mode&0o077)===0){const saved=await json(credentialFile,{});apiKey=typeof saved.key==='string'?saved.key:'';remembered=!!apiKey;}}catch(e){if(e.code!=='ENOENT')throw e;}}
  const drafts=new Map();
  const runPath=id=>{if(!UUID.test(id))throw fail('无效的报告编号。');return path.join(dataDir,id);};
  const runMeta=async id=>{const m=await json(path.join(runPath(id),'meta.json'));if(!m)throw fail('报告不存在。',404);if(m.status==='running'&&active?.id!==id){m.status='interrupted';m.message='上次运行已中断，可查看已保存数据。';}return m;};
  const list=async()=>{
    const result=[];for(const id of await readdir(dataDir)){if(!UUID.test(id))continue;const m=await json(path.join(runPath(id),'meta.json'));if(m){if(m.status==='running'&&active?.id!==id){m.status='interrupted';m.message='上次运行已中断，可查看已保存数据。';}result.push(m);}}
    return result.sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).slice(0,100);
  };
  async function detail(id) {
    const meta=await runMeta(id),snapshot=await json(path.join(runPath(id),'seo-input.json'));
    const geo=await json(path.join(runPath(id),'geo-summary.json'),null);
    if(meta.status==='interrupted'&&snapshot){await artifacts(id,snapshot,geo);await atomic(path.join(runPath(id),'meta.json'),meta);}
    const reportReady=await stat(path.join(runPath(id),'report.html')).then(()=>true,()=>false);
    return {meta,reportReady,snapshot:snapshot?normalizeSeoSnapshot(snapshot):null,geo,candidates:snapshot?seoQuestionCandidates(snapshot):{candidates:[]},actions:snapshot?seoOpportunities(snapshot,geo):[],tasks:await json(path.join(runPath(id),'tasks.json'),{}),questions:await json(path.join(runPath(id),'questions.json'),{questions:[]})};
  }
  async function artifacts(id,snapshot,geo=null) {
    const out=runPath(id),summary=seoSummary(snapshot);
    await atomic(path.join(out,'seo-input.json'),snapshot);
    const run=geo?{summary:{...geo,seo:summary},actions:[]}: {summary,actions:[]};
    await writeOutputs(out,run,{lang:'zh'});
  }
  async function saveImport(snapshot,config,label) {
    const id=randomUUID();await mkdir(runPath(id),{mode:0o700});
    await artifacts(id,snapshot);
    const meta={id,site:snapshot.site,config,status:'complete',synthetic:snapshot.synthetic,label,createdAt:new Date().toISOString(),completed:snapshot.records.length,total:snapshot.records.length};
    await atomic(path.join(runPath(id),'meta.json'),meta);return {id};
  }
  const server=http.createServer(async(req,res)=>{
    const origin=`http://127.0.0.1:${server.address().port}`;
    const send=(status,data,type='application/json; charset=utf-8')=>{res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; base-uri 'none'; form-action 'self'"});res.end(type.startsWith('application/json')?JSON.stringify(data):data);};
    try {
      // Reject DNS rebinding, cross-site requests and credential-bearing CORS calls.
      if(req.headers.host!==new URL(origin).host)throw fail('请使用启动时显示的 127.0.0.1 地址。',403);
      if((req.headers.origin&&req.headers.origin!==origin)||req.headers['sec-fetch-site']==='cross-site')throw fail('拒绝跨站请求。',403);
      const url=new URL(req.url,origin),route=url.pathname;
      if(route==='/favicon.ico'&&req.method==='GET'){res.writeHead(204);return res.end();}
      if(req.method==='GET' && ['/','/app.js','/style.css'].includes(route)) {
        const file=route==='/'?'index.html':route.slice(1),types={html:'text/html; charset=utf-8',js:'text/javascript; charset=utf-8',css:'text/css; charset=utf-8'};
        let content=await readFile(path.join(root,'web',file),'utf8');if(file==='index.html')content=content.replace('__CSRF__',csrf);
        return send(200,content,types[file.split('.').at(-1)]);
      }
      const download=/^\/reports\/([a-f0-9-]{36})\/(report\.html|report\.md|seo-input\.json|questions\.json)$/.exec(route);
      if(req.method==='GET'&&download){await runMeta(download[1]);const file=path.join(runPath(download[1]),download[2]);const content=await readFile(file,'utf8');return send(200,content,download[2].endsWith('.html')?'text/html; charset=utf-8':'text/plain; charset=utf-8');}
      if(!route.startsWith('/api/') || req.headers['x-workbench-token']!==csrf)throw fail('请求已过期，请刷新工作台。',403);
      if(req.method==='GET'&&route==='/api/state')return send(200,{key:{present:!!apiKey,remembered,verified},project:await json(path.join(dataDir,'project.json'),null),runs:await list(),active:active?{id:active.id,cancelling:active.cancel}:null});
      const detailMatch=/^\/api\/runs\/([a-f0-9-]{36})$/.exec(route);
      if(req.method==='GET'&&detailMatch)return send(200,await detail(detailMatch[1]));
      if(req.method!=='POST')throw fail('接口不存在。',404);
      const input=await body(req);
      if(route==='/api/key') {
        if(active)throw fail('请等待当前分析完成或停止后，再更换 Key。',409);
        if(typeof input.key!=='string'||input.key.length<8||input.key.length>512||/\s/.test(input.key))throw fail('请输入有效的 API Key，不要包含空格。');
        const candidate=input.key,remember=input.remember===true;
        if(remember)await atomic(credentialFile,{key:candidate});else await unlink(credentialFile).catch(e=>{if(e.code!=='ENOENT')throw e;});
        apiKey=candidate;remembered=remember;verified=false;
        return send(200,{present:true,remembered,verified:false});
      }
      if(route==='/api/key/disconnect'){
        if(active)throw fail('请先停止当前分析。',409);
        await unlink(credentialFile).catch(e=>{if(e.code!=='ENOENT')throw e;});apiKey='';remembered=false;verified=false;return send(200,{ok:true});
      }
      if(route==='/api/project') {const config=safeConfig(input.config);await atomic(path.join(dataDir,'project.json'),config);return send(200,{config});}
      if(route==='/api/plan') {
        const config=safeConfig(input.config),plan=buildSeoPlan(config);
        if(plan.items.length>50)throw fail('一次最多 50 个查询，请减少域名或分析范围。');
        const budget=Number(input.budget);if(!Number.isFinite(budget)||budget<=0||budget>100||budget<plan.maxCostUsd)throw fail(`预算需覆盖预计最高费用 $${plan.maxCostUsd.toFixed(4)}，且不超过 $100。`);
        let geo=null;
        if(input.parentId){const parent=await detail(input.parentId);if(parent.meta.site!==plan.site)throw fail('来源报告与本次项目网站不一致。');geo=parent.geo;}
        if(drafts.size>100)drafts.clear();const id=randomUUID();drafts.set(id,{config,plan,budget,geo,expires:Date.now()+600000});return send(200,{id,...plan,budget});
      }
      if(route==='/api/execute') {
        if(active)throw fail('已有分析正在运行，请先等待或停止。',409);
        if(!apiKey)throw fail('请先连接 BeatAPI Key。');
        const draft=drafts.get(input.planId);if(!draft||draft.expires<Date.now())throw fail('分析预览已过期或已执行，请重新预览。',409);
        drafts.delete(input.planId);
        const id=randomUUID(),out=runPath(id),job={id,cancel:false};active=job;
        try {await mkdir(out,{mode:0o700});} catch(e){active=null;throw e;}
        const meta={id,site:draft.plan.site,config:draft.config,status:'running',synthetic:false,label:'网站分析',createdAt:new Date().toISOString(),completed:0,total:draft.plan.items.length};
        try {await atomic(path.join(out,'meta.json'),meta);await atomic(path.join(dataDir,'project.json'),draft.config);if(draft.geo)await atomic(path.join(out,'geo-summary.json'),draft.geo);} catch(e){active=null;throw e;}
        const key=apiKey;
        job.promise=(async()=>{
          try {
            const snapshot=await collectSeo(draft.plan,{apiKey:key,budgetUsd:draft.budget,maxRequests:50,fetchImpl,shouldStop:()=>job.cancel,onSnapshot:async s=>{
              await atomic(path.join(out,'seo-input.json'),s);meta.completed=s.records.length;meta.actualUsd=s.records.reduce((n,r)=>n+(r.actualUsd??0),0);await atomic(path.join(out,'meta.json'),meta);
            }});
            await artifacts(id,snapshot,draft.geo);meta.status=snapshot.stopped==='cancelled'?'cancelled':snapshot.stopped||snapshot.records.some(r=>r.status==='error')?'partial':'complete';
            verified=snapshot.records.some(r=>r.status==='ok')&&snapshot.stopped!=='authorization_or_balance';
          } catch {meta.status='failed';meta.message='分析未完成，已保留已收到的数据。请查看结果或重新预览。';}
          finally {await atomic(path.join(out,'meta.json'),meta);if(active===job)active=null;}
        })().catch(()=>{if(active===job)active=null;});
        return send(202,{id});
      }
      if(route==='/api/cancel'){if(active)active.cancel=true;return send(200,{ok:true,note:'当前请求完成后停止，不再发送后续请求。'});}
      if(route==='/api/demo') {
        const snapshot=normalizeSeoSnapshot(await json(path.join(root,'examples','seo.snapshot.example.json'))),config=await json(path.join(root,'examples','seo.project.example.json'));
        return send(200,await saveImport(snapshot,config,'合成演示'));
      }
      if(route==='/api/import'){
        const snapshot=normalizeSeoSnapshot(input.snapshot),config={site:snapshot.site,requests:snapshot.records.map(r=>({tool:r.tool,input:r.input}))};
        if(!snapshot.records.length)throw fail('快照没有记录。');return send(200,await saveImport(snapshot,config,'导入快照'));
      }
      if(route==='/api/geo') {
        const meta=await runMeta(input.id);if(meta.status==='running')throw fail('请等待分析完成。');
        if(!Array.isArray(input.records)||!input.records.length||input.records.length>500)throw fail('请选择 1–500 个回答记录文件。');
        const records=input.records.map(r=>{
          if(r?.schema===CAPTURE_SCHEMA)r=captureToRecord(r);
          if(r?.schema!=='beat-geo/record@1'||typeof r.question!=='string'||typeof r.questionId!=='string'||typeof r.engine!=='string'||(!r.response&&!r.error))throw fail('请选择 records 目录内的回答 JSON 或浏览器采集 JSON；不是 summary.json。');
          // Only retain fields used by the analyzer; no arbitrary top-level metadata.
          return Object.fromEntries(['schema','question','questionId','engine','engineLabel','model','repeat','collectedAt','source','response','error'].filter(k=>r[k]!==undefined).map(k=>[k,r[k]]));
        });
        const seen=new Set(),questions=new Map();
        for(const r of records){
          const identity=JSON.stringify([r.engine,r.questionId,r.repeat??1,r.collectedAt??null,r.response??r.error]);
          if(seen.has(identity))throw fail('存在重复回答记录，请去重后导入。');seen.add(identity);
          if(questions.has(r.questionId)&&questions.get(r.questionId)!==r.question)throw fail('同一问题编号对应不同文本，请使用一致的问题集。');questions.set(r.questionId,r.question);
        }
        const snapshot=await json(path.join(runPath(input.id),'seo-input.json'));
        if(!snapshot)throw fail('请先完成 SEO 分析。');
        const config=normalizeConfig({brand:{name:meta.site,domains:[meta.site]},competitors:(meta.config.competitors??[]).map(domain=>({name:domain,domains:[domain]}))});
        const {summary}=buildRun(records,config,[]);
        await atomic(path.join(runPath(input.id),'geo-summary.json'),summary);await artifacts(input.id,snapshot,summary);return send(200,{ok:true});
      }
      if(route==='/api/questions') {
        const meta=await runMeta(input.id);if(meta.status==='running')throw fail('请等待分析完成。');
        if(!Array.isArray(input.questions)||input.questions.length>100)throw fail('一次最多保存 100 个问题。');
        const questions=loadQuestions(input.questions);if(questions.some(q=>q.text.length>2000))throw fail('问题过长。');
        // A separate versioned artifact, never overwrite a monitored run's original questions.
        await atomic(path.join(runPath(input.id),'questions.json'),{questions});return send(200,{count:questions.length});
      }
      if(route==='/api/tasks'){
        const d=await detail(input.id);if(!['todo','doing','done'].includes(input.status)||!Number.isInteger(input.index)||!d.actions[input.index])throw fail('无效的任务。');
        const tasks={...d.tasks,[input.index]:input.status};await atomic(path.join(runPath(input.id),'tasks.json'),tasks);return send(200,{tasks});
      }
      if(route==='/api/compare'){
        const a=await detail(input.base),b=await detail(input.head);if(!a.snapshot||!b.snapshot)throw fail('两个报告均需有快照。');return send(200,diffSeo(a.snapshot,b.snapshot));
      }
      throw fail('接口不存在。',404);
    } catch(e) {send(e.status??400,{error:e.code==='ENOENT'?'文件还未生成，请稍后重试。':String(e.message).includes(apiKey)&&apiKey?'请求失败，请检查输入或重新连接。':humanError(e.message)});}
  });
  return {server,close:async()=>{if(active){active.cancel=true;await active.promise;}await new Promise(r=>server.close(r));},dataDir};
}
export async function startWorkbench({port=4317,...options}={}) {
  if(!Number.isInteger(port)||port<0||port>65535)throw new Error('Invalid port.');
  const app=await createWorkbench(options);await new Promise((resolve,reject)=>{app.server.once('error',reject);app.server.listen(port,'127.0.0.1',resolve);});
  console.log(`BeatGEO 工作台：http://127.0.0.1:${app.server.address().port}\n仅本机访问；打开页面不会调用收费接口。`);return app;
}
