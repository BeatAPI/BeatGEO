import { mkdir, readFile, writeFile, stat, unlink, rename } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadEnvFile } from './envfile.mjs';
import { readKeychain } from './keychain.mjs';
import { buildSeoPlan, collectSeo, loadSeo, seoSummary, seoQuestionCandidates, seoOpportunities, diffSeo } from './seo.mjs';
import { writeOutputs } from './run.mjs';
const json=async f=>JSON.parse(await readFile(f,'utf8'));
const allowed={
  connect:['connection','key-file','keychain','keychain-account','keychain-var'],
  status:['connection'],disconnect:['connection'],
  run:['config','connection','key-file','keychain','keychain-account','keychain-var','budget-usd','max-requests','timeout-ms','execute','out'],
  import:['input','out'],diff:['base','head','out'],
};
export async function seoConnectionFile(name='default',root=path.join(os.homedir(),'.beat-geo','seo')) {
  if(!/^[a-zA-Z0-9_-]{1,60}$/.test(name)) throw new Error('Invalid SEO connection name.');
  return path.join(root,`${name}.json`);
}
function bindingFrom(opts) {
  if(opts.keychain && opts['key-file']) throw new Error('Choose keychain or key-file, not both.');
  const envName=opts['keychain-var']??'BEATAPI_API_KEY';
  if(!/^[A-Z_][A-Z0-9_]*$/.test(envName)) throw new Error('Use an environment variable name, never the key itself.');
  return {schema:'beat-geo/seo-connection@1',envName,...(opts.keychain?{keychain:opts.keychain,...(opts['keychain-account']?{account:opts['keychain-account']}: {})}:{}),...(opts['key-file']?{keyFile:path.resolve(opts['key-file'])}:{})};
}
async function readBinding(opts,file) {
  if(opts.keychain || opts['key-file'] || opts['keychain-var']) return bindingFrom(opts);
  try {const b=await json(file);if(b.schema!=='beat-geo/seo-connection@1') throw new Error('Invalid SEO connection.');return bindingFrom({'keychain-var':b.envName,keychain:b.keychain,'keychain-account':b.account,'key-file':b.keyFile});}
  catch(e){if(e.code==='ENOENT' && !opts.connection) return bindingFrom({});throw e;}
}
async function keyFrom(binding,env) {
  if(env[binding.envName]) return env[binding.envName];
  if(binding.keychain) return readKeychain({service:binding.keychain,account:binding.account});
  if(binding.keyFile) {
    const mode=(await stat(binding.keyFile)).mode&0o777;
    if(mode&0o077) throw new Error('SEO key file must be private (chmod 600).');
    const copy={...env}; await loadEnvFile(binding.keyFile,copy);return copy[binding.envName];
  }
}
async function newOutput(out) {
  if(!out) throw new Error('--out is required.');
  try {await mkdir(out,{recursive:false});} catch(e) {if(e.code!=='ENOENT') throw new Error('Use a new output directory; existing snapshots are never overwritten.'); await mkdir(path.dirname(path.resolve(out)),{recursive:true});await mkdir(out);}
}
async function atomicJson(file,value) {
  const temp=`${file}.${randomUUID()}.tmp`;await writeFile(temp,JSON.stringify(value,null,2),{mode:0o600});await rename(temp,file);
}
export async function writeSeoOutputs(out,snapshot,lang,geo=null) {
  await atomicJson(path.join(out,'seo-input.json'),snapshot);
  const summary=seoSummary(snapshot);
  await writeOutputs(out,{summary,actions:[]},{lang});
  await atomicJson(path.join(out,'seo-question-candidates.json'),seoQuestionCandidates(summary));
  await atomicJson(path.join(out,'seo-actions.json'),seoOpportunities(summary,geo));
}
export async function cmdSeo(opts,action='run',deps={}) {
  if(opts.input && action==='run') action='import';
  if(!allowed[action]) throw new Error('Use seo connect|status|disconnect|run|import|diff.');
  for(const k of Object.keys(opts)) if(!['lang',...allowed[action]].includes(k)) throw new Error(`--${k} is not used by seo ${action}.`);
  const lang=opts.lang??'en';if(!['en','zh'].includes(lang)) throw new Error('--lang must be en or zh.');
  const file=await seoConnectionFile(opts.connection,deps.root),env=deps.env??process.env;
  if(action==='disconnect') {await unlink(file).catch(e=>{if(e.code!=='ENOENT')throw e;});console.log('Local SEO binding removed; upstream key unchanged.');return;}
  if(action==='connect') {
    const binding=bindingFrom(opts),key=await keyFrom(binding,env);
    if(!key) throw new Error('No key found in the selected environment/keychain/private file.');
    await mkdir(path.dirname(file),{recursive:true,mode:0o700});await atomicJson(file,binding);
    console.log('SEO key source bound locally. Key present; API access and balance NOT verified. No requests sent.');return;
  }
  if(action==='status') {const b=await readBinding(opts,file);console.log(`SEO key source: ${b.keychain?'system keychain':b.keyFile?'private env file':'environment'}; access/balance unverified. No requests sent.`);return;}
  if(action==='diff') {
    if(!opts.base||!opts.head) throw new Error('SEO diff needs --base and --head snapshot files.');
    const result=diffSeo(await loadSeo(opts.base),await loadSeo(opts.head));await newOutput(opts.out);
    await atomicJson(path.join(opts.out,'seo-diff.json'),result);
    const esc=v=>String(v??'—').replaceAll('|','\\|').replace(/[<>\r\n]/g,' ');
    await writeFile(path.join(opts.out,'report.md'),`# SEO snapshot comparison\n\n${result.note}\n\n${result.synthetic?'SYNTHETIC DATA\n\n':''}| Domain / keyword / page | Market | Metric | Base | Head | Delta |\n|---|---|---|---|---|---|\n${result.rows.map(r=>[[r.domain,r.identity].filter(Boolean).join(" · "),r.market,r.metric,r.base,r.head,r.delta].map(esc).join(' | ')).map(r=>`| ${r} |`).join('\n')}\n`);return result;
  }
  if(action==='import') {
    if(!opts.input) throw new Error('SEO import needs --input.');
    const snapshot=await loadSeo(opts.input);await newOutput(opts.out);await writeSeoOutputs(opts.out,snapshot,lang);console.log(`Offline SEO report: ${path.join(opts.out,'report.html')}`);return snapshot;
  }
  if(!opts.config) throw new Error('SEO run needs --config.');
  const plan=buildSeoPlan(await json(opts.config));
  const maxRequests=Number(opts['max-requests']??50),budget=opts['budget-usd']===undefined?null:Number(opts['budget-usd']);
  if(!Number.isInteger(maxRequests)||maxRequests<1)throw new Error('Invalid --max-requests.');
  if(budget!==null&&(!Number.isFinite(budget)||budget<=0))throw new Error('Invalid --budget-usd.');
  console.log(`SEO plan · ${plan.items.length} requests · estimated maximum $${plan.maxCostUsd.toFixed(4)} · prices ${plan.priceDate}`);
  for(const r of plan.items) console.log(`  ${r.tool} · ${r.input.domain??r.input.keywords.join(', ')} · ${r.input.country??'global'} · max $${r.maxCostUsd.toFixed(4)}`);
  if(plan.items.length>maxRequests || (budget!==null && plan.maxCostUsd>budget)) throw new Error('SEO plan exceeds request/budget cap. Nothing sent.');
  if(!opts.execute) {console.log('Dry run: nothing sent or saved. Use --execute with --budget-usd and --out to collect.');return plan;}
  if(budget===null) throw new Error('--execute requires --budget-usd.');
  const timeoutMs=Number(opts['timeout-ms']??30000);if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>120000)throw new Error('Invalid --timeout-ms.');
  const binding=await readBinding(opts,file),key=await keyFrom(binding,env);if(!key)throw new Error('Missing BeatAPI key.');
  await newOutput(opts.out);
  await atomicJson(path.join(opts.out,'seo-plan.json'),plan);
  const snapshot=await collectSeo(plan,{apiKey:key,budgetUsd:budget,maxRequests,timeoutMs,...(deps.fetchImpl?{fetchImpl:deps.fetchImpl}:{}),onSnapshot:s=>atomicJson(path.join(opts.out,'seo-input.json'),s)});
  await writeSeoOutputs(opts.out,snapshot,lang);
  console.log(`SEO report: ${path.join(opts.out,'report.html')}`);
  if(snapshot.stopped||snapshot.records.some(r=>r.status==='error')) {if(!deps.fetchImpl)process.exitCode=1;console.log('SEO collection incomplete; partial evidence saved.');}
  return snapshot;
}
