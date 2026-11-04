import { test, expect } from '@playwright/test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { startWorkbench } from '../../tools/seo-geo/src/workbench.mjs';

let app, directory, fetchResponse, releaseRequest;
const fixture=JSON.parse(await readFile(new URL('../../tools/seo-geo/examples/seo.snapshot.example.json',import.meta.url),'utf8'));
test.beforeEach(async ({page})=>{
 directory=await mkdtemp(path.join(os.tmpdir(),'beatgeo-ui-test-'));
 fetchResponse=async()=>new Response(JSON.stringify({error:{code:'unauthorized',retryable:false}}),{status:401});releaseRequest=null;
 app=await startWorkbench({port:0,dataDir:directory,credentialFile:path.join(directory,'key.json'),initialKey:'',fetchImpl:(...args)=>fetchResponse(...args)});
 await page.goto(`http://127.0.0.1:${app.server.address().port}`);
 await expect(page.locator('#key-status')).toContainText('尚未连接');
});
test.afterEach(async()=>{releaseRequest?.();await app.close();await rm(directory,{recursive:true,force:true});});

async function project(page,config){
 await page.evaluate(async config=>{
  const response=await fetch('/api/project',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':document.querySelector('meta[name="workbench-token"]').content},body:JSON.stringify({config})});
  if(!response.ok)throw new Error(await response.text());
 },config);
 await page.reload();
 await expect(page.locator('#site')).toHaveValue(config.site);await page.locator('nav [data-view="home"]').click();
}
async function preview(page){
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plan'&&r.request().method()==='POST');
 await page.locator('#preview').click();
 const result=await (await response).json();
 await expect(page.locator('#plan-dialog')).toBeVisible();
 await page.locator('#close-plan').click();
 return result;
}
async function demo(page){await page.locator('nav [data-view="results"]').click();await page.locator('#demo-empty').click();await expect(page.locator('#report-panel')).toContainText('合成演示');await page.locator('nav [data-view="actions"]').click();}

test('changing only budget preserves the restored exact endpoint and cost',async({page})=>{
 await project(page,{site:'acme.example',requests:[{tool:'domain-rating',input:{domain:'acme.example'}}]});
 await expect(page.locator('#endpoint')).toHaveValue('domain-rating');
 const before=await preview(page);await page.locator('#budget').fill('2');const after=await preview(page);
 expect(before.items).toHaveLength(1);expect(after.items).toEqual(before.items);expect(after.maxCostUsd).toBe(before.maxCostUsd);expect(after.budget).toBe(2);
});

test('restored batches preserve scope and require an explicit switch to edit it',async({page})=>{
 await project(page,{site:'acme.example',requests:[{tool:'domain-rating',input:{domain:'acme.example'}},{tool:'ranked-keywords',input:{domain:'zeta.example',country:'us',limit:5}}]});
 await expect(page.locator('#saved-scope')).toContainText('2 项精确查询');await expect(page.locator('#site')).toBeDisabled();
 const before=await preview(page);await page.locator('.advanced summary').click();await page.locator('#budget').fill('2');const after=await preview(page);
 expect(after.items).toEqual(before.items);await page.locator('#reset-scope').click();await expect(page.locator('#site')).toBeEnabled();await expect(page.locator('#saved-scope')).toBeHidden();
});

test('saved question selections and unsaved text survive navigation and report changes',async({page})=>{
 await demo(page);await page.locator('input[name="question"]').first().check();await page.locator('[data-question="0"]').fill('Saved custom question?');await page.locator('#questions-form button[type="submit"]').click();await expect(page.locator('#notice')).toContainText('已保存 1');
 await page.locator('nav [data-view="results"]').click();await page.locator('nav [data-view="actions"]').click();await expect(page.locator('input[name="question"]').first()).toBeChecked();
 await page.reload();await expect(page.locator('input[name="question"]').first()).toBeChecked();
 await page.locator('[data-question="0"]').fill('Unsaved custom question?');await page.locator('nav [data-view="results"]').click();await page.locator('nav [data-view="actions"]').click();await expect(page.locator('[data-question="0"]')).toHaveValue('Unsaved custom question?');
 await page.locator('#demo').click();await page.locator('.history-item').nth(1).click();await page.locator('nav [data-view="actions"]').click();await expect(page.locator('[data-question="0"]')).toHaveValue('Unsaved custom question?');
});

test('keyboard users can open both import file pickers',async({page})=>{
 await page.locator('nav [data-view="results"]').click();
 const seoButton=page.locator('[data-file="#import-seo"]');
 const seoPicker=page.waitForEvent('filechooser');
 await page.locator('#key-pill').focus();await page.keyboard.press('Tab');await expect(seoButton).toBeFocused();
 await seoButton.press('Enter');
 await (await seoPicker).setFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(page.locator('#notice')).toContainText('快照已导入');
 await expect(page.locator('#report-panel')).toContainText('合成演示');
 const geoButton=page.locator('[data-file="#import-geo"]');
 const geoPicker=page.waitForEvent('filechooser');
 await geoButton.focus();await expect(geoButton).toBeFocused();await geoButton.press('Enter');
 await (await geoPicker).setFiles({name:'answer.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify({schema:'beat-geo/capture@1',questionId:'q1',question:'Which API?',engine:'test',answer:'Acme is mentioned.',citedUrls:['https://acme.example/']}))});
 await expect(page.locator('#notice')).toContainText('AI 回答已关联');
});

test('mobile navigation returns to the heading and clears unrelated errors',async({page})=>{
 await page.setViewportSize({width:375,height:812});await demo(page);
 await page.locator('#questions-form button[type="submit"]').click();await expect(page.locator('#notice')).toHaveClass('error');
 await page.locator('nav [data-view="results"]').click();await expect(page.locator('#notice')).toBeHidden();
 await page.locator('#report-panel [data-view="actions"]').click();
 await expect(page.locator('#view-actions h1')).toBeFocused();expect(await page.evaluate(()=>scrollY)).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('invalid key shows a useful recovery action and preserves uncertain charges',async({page})=>{
 await page.locator('#key-pill').click();await page.locator('#api-key').fill('placeholder-for-local-test');await page.locator('#key-form button[type="submit"]').click();
 await page.locator('#site').fill('acme.example');await page.locator('[data-preset="basic"]').click();await page.locator('#preview').click();await page.locator('#execute').click();
 await expect(page.locator('#report-panel .failure-summary')).toContainText('401');await expect(page.locator('#report-panel .failure-summary')).toContainText('Key');await expect(page.locator('#report-panel')).toContainText('费用未确认');
 await page.locator('.failure-summary [data-view="settings"]').click();await expect(page.locator('#view-settings')).toBeVisible();
});


test('execution errors stay visible inside the confirmation dialog',async({page})=>{
 await page.locator('#key-pill').click();await page.locator('#api-key').fill('placeholder-for-local-test');await page.locator('#key-form button[type="submit"]').click();
 await page.locator('#site').fill('acme.example');await page.locator('[data-preset="basic"]').click();await page.locator('#preview').click();
 await page.evaluate(async()=>fetch('/api/key/disconnect',{method:'POST',headers:{'Content-Type':'application/json','X-Workbench-Token':document.querySelector('meta[name="workbench-token"]').content},body:'{}'}));
 await page.locator('#execute').click();await expect(page.locator('#plan-feedback')).toBeVisible();await expect(page.locator('#plan-feedback')).toContainText('连接 BeatAPI Key');
});

test('background progress does not overwrite or blur an active question draft',async({page})=>{
 let calls=0;fetchResponse=async(url)=>{
  if(++calls===2)await new Promise(resolve=>{releaseRequest=resolve;});
  return new Response(JSON.stringify(fixture.records.find(r=>r.tool===url.split('/').at(-1)).response));
 };
 await page.locator('#key-pill').click();await page.locator('#api-key').fill('placeholder-for-local-test');await page.locator('#key-form button[type="submit"]').click();
 await project(page,{site:'acme.example',country:'us',language:'en',keywords:['image generation api','product photography api'],workflows:['topics'],limit:10});
 await page.locator('#preview').click();await page.locator('#execute').click();await expect(page.locator('#running')).toBeVisible();
 await page.locator('nav [data-view="actions"]').click();await page.locator('[data-question="0"]').fill('Keep this draft while progress updates');
 await page.waitForTimeout(2000);await expect(page.locator('[data-question="0"]')).toHaveValue('Keep this draft while progress updates');await expect(page.locator('[data-question="0"]')).toBeFocused();
});

async function importSnapshot(page,snapshot){
 await page.locator('nav [data-view="results"]').click();
 await page.locator('#import-seo').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(snapshot))});
 await expect(page.locator('#notice')).toContainText('快照已导入');
}

test('SEO sections show site-specific saved evidence without paid requests',async({page})=>{
 let requests=0;fetchResponse=async()=>{requests++;throw new Error('Viewing saved evidence must not query the provider');};
 const data=structuredClone(fixture);
 const rival=data.records.find(r=>r.tool==='backlink-summary'&&r.input.domain==='zeta.example');rival.response.backlinks=999999;
 await importSnapshot(page,data);
 await page.locator('nav [data-view="backlinks"]').click();
 await expect(page.locator('#data-backlinks')).toContainText('合成示例 · 非实测');
 await expect(page.locator('#data-backlinks .metric').first()).toContainText('52');
 await expect(page.locator('#data-backlinks')).not.toContainText('999,999');
 await expect(page.locator('#data-backlinks .browse-table tbody tr')).toHaveCount(1);
 await page.locator('[data-filter="backlinks"]').fill('not-present.example');
 await expect(page.locator('#data-backlinks [data-filter-count]')).toHaveText('显示 0 / 1 条已返回记录');
 await page.locator('[data-filter="backlinks"]').fill('source.example');
 await expect(page.locator('#data-backlinks [data-filter-count]')).toHaveText('显示 1 / 1 条已返回记录');
 await page.locator('nav [data-view="keywords"]').click();await expect(page.locator('#data-keywords')).toContainText('image generation api');
 await page.locator('nav [data-view="domain"]').click();await expect(page.locator('#data-domain')).toContainText('排名关键词');
 await page.reload();await expect(page.locator('#data-domain')).toContainText('合成示例 · 非实测');expect(requests).toBe(0);
 await page.setViewportSize({width:375,height:812});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('website baseline previews only the current site and does not execute on navigation',async({page})=>{
 let requests=0;fetchResponse=async()=>{requests++;throw new Error('Preview must not query the provider');};
 await project(page,{site:'acme.example',country:'gb',competitors:['zeta.example'],keywords:['api'],workflows:['topics']});
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plan');
 await page.locator('[data-baseline="baseline"]').click();const plan=await (await response).json();
 expect(plan.items.map(r=>r.tool)).toEqual(['domain-overview','domain-rating','ranked-keywords','top-pages','backlink-summary','backlinks']);
 expect(plan.items.every(r=>r.input.domain==='acme.example')).toBe(true);
 expect(plan.items.find(r=>r.tool==='ranked-keywords').input.country).toBe('gb');
 await expect(page.locator('#plan-dialog')).toBeVisible();await page.locator('#close-plan').click();
 await page.locator('nav [data-view="backlinks"]').click();await expect(page.locator('#data-backlinks')).toContainText('还没有可展示的快照');expect(requests).toBe(0);
});

test('SEO missing modules and missing metrics remain distinct from zero',async({page})=>{
 const data=structuredClone(fixture);data.records=data.records.filter(r=>r.tool==='backlink-summary'&&r.input.domain===data.site);
 delete data.records[0].response.backlinks;data.records[0].response.broken_backlinks=0;
 await importSnapshot(page,data);await page.locator('nav [data-view="backlinks"]').click();
 await expect(page.locator('#data-backlinks .metric').filter({hasText:'外链数'})).toContainText('—');
 await expect(page.locator('#data-backlinks .metric').filter({hasText:'失效外链'})).toContainText('0');
 await page.locator('nav [data-view="keywords"]').click();await expect(page.locator('#data-keywords')).toContainText('这份快照未查询本模块');
});

test('keyword research previews demand and expansion in the saved project scope',async({page})=>{
 let requests=0;fetchResponse=async()=>{requests++;throw new Error('Preview must not query the provider');};
 await project(page,{site:'acme.example',country:'gb',language:'en',workflows:['overview']});
 await page.locator('nav [data-view="keywords"]').click();await page.locator('#keyword-seed').fill('image generation api');
 const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/plan');await page.locator('#keyword-search button').click();const plan=await (await response).json();
 expect(plan.items.map(r=>r.tool)).toEqual(['keyword-ideas','keyword-overview']);
 for(const item of plan.items){expect(item.input.keywords).toEqual(['image generation api']);expect(item.input.country).toBe('gb');expect(item.input.language).toBe('en');}
 await expect(page.locator('#plan-dialog')).toBeVisible();expect(requests).toBe(0);
});
