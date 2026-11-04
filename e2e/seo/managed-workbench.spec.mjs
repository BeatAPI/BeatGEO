import { test, expect } from '@playwright/test';
import http from 'node:http';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createWorkbench } from '../../tools/seo-geo/src/workbench.mjs';

const fixture=JSON.parse(await readFile(new URL('../../tools/seo-geo/examples/seo.snapshot.example.json',import.meta.url),'utf8'));
let app,server,directory,key,questions,calls;
test.beforeEach(async({page})=>{
 directory=await mkdtemp(path.join(os.tmpdir(),'beatgeo-managed-browser-'));key='shared-test-key';questions=new Map();calls=0;
 app=await createWorkbench({dataDir:directory,initialKey:'',managed:{basePath:'/api/seo/brand-a',brandName:'QA Acme',settingsUrl:'/setup',promptsUrl:'/prompts',responsesUrl:'/responses',project:{site:'acme.example',country:'us',workflows:['topics'],keywords:['image generation api']},getKey:async()=>key,addQuestions:async input=>{const before=questions.size;input.questions.forEach(q=>questions.set(q.text,q));return{added:questions.size-before,existing:input.questions.length-(questions.size-before),scheduled:1};}},fetchImpl:async url=>{calls++;return new Response(JSON.stringify(fixture.records.find(r=>r.tool===url.split('/').at(-1)).response));}});
 server=http.createServer(async(req,res)=>{
  if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end('<h1>QA Acme</h1><iframe title="SEO" src="/api/seo/brand-a/" style="width:100%;height:900px"></iframe>');return;}
  if(req.url==='/prompts'){res.setHeader('Content-Type','text/html');res.end(`<h1>Monitored questions</h1><p>${[...questions.keys()].join(', ')}</p>`);return;}
  if(req.url==='/setup'){res.end('Workspace Connections');return;}
  if(req.url==='/responses'){res.setHeader('Content-Type','text/html');res.end('<h1>Brand answers</h1>');return;}
  const request=new Request(`http://127.0.0.1:${server.address().port}${req.url}`,{method:req.method,headers:req.headers,...(req.method==='POST'?{body:req,duplex:'half'}:{})});
  const response=await app.request(request);res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await page.goto(`http://127.0.0.1:${server.address().port}`);
});
test.afterEach(async({page})=>{
 await page.close();
 await app.close();
 // Downloads and report frames can leave HTTP keep-alive connections open in CI.
 await new Promise(resolve=>{server.close(resolve);server.closeAllConnections();});
 await rm(directory,{recursive:true,force:true});
});

test('managed SEO uses the shared key and adds reviewed questions without a file round trip',async({page})=>{
 const frame=page.frameLocator('iframe[title="SEO"]');await expect(frame.locator('#site')).toHaveValue('acme.example');await expect(frame.locator('#key-form')).toBeHidden();
 await expect(frame.locator('#key-pill')).toContainText('Key 已保存');await frame.locator('#preview').click();await frame.locator('#execute').click();await expect(frame.locator('.history-item .tag')).toHaveText('已完成');expect(calls).toBe(2);
 await frame.getByRole('button',{name:'内容与问题 →',exact:true}).click();await frame.locator('[data-question="0"]').fill('Which image API should our team compare?');await frame.locator('input[name="question"]').first().check();
 await frame.locator('#add-monitor').click();await expect(frame.locator('#monitor-context')).toContainText('QA Acme');await frame.locator('#confirm-monitor').click();await expect(frame.locator('#notice')).toContainText('已加入 1');
 await frame.locator('#add-monitor').click();await frame.locator('#confirm-monitor').click();await expect(frame.locator('#notice')).toContainText('跳过 1');expect(questions.size).toBe(1);
 const dialogs=[];page.on('dialog',async dialog=>{dialogs.push(dialog.type());await dialog.dismiss();});
 await frame.getByRole('link',{name:'查看品牌问题'}).click();await expect(page).toHaveURL(/\/prompts$/);await expect(page.locator('body')).toContainText('Which image API should our team compare?');expect(dialogs).toEqual([]);
});

test('disconnecting the shared key blocks a plan already open in SEO',async({page})=>{
 const frame=page.frameLocator('iframe[title="SEO"]');await expect(frame.locator('#site')).toHaveValue('acme.example');await frame.locator('#preview').click();key='';await frame.locator('#execute').click();
 await expect(frame.locator('#plan-feedback')).toContainText('连接 BeatAPI Key');expect(calls).toBe(0);
});

async function language(page, locale) {
 await page.evaluate(locale => document.querySelector('iframe').contentWindow.postMessage({type:'beatgeo:locale',locale},location.origin),locale);
 await expect(page.frameLocator('iframe[title="SEO"]').locator('html')).toHaveAttribute('lang',locale==='zh'?'zh-CN':'en');
}
async function view(page, name) {
 await page.evaluate(name => { document.querySelector('iframe').contentWindow.location.hash=name; },name);
 await expect(page.frameLocator('iframe[title="SEO"]').locator(`#view-${name}`)).toBeVisible();
}

test('interface language covers SEO views and confirmations without clearing drafts or running paid queries',async({page})=>{
 const frame=page.frameLocator('iframe[title="SEO"]');await expect(frame.locator('#site')).toHaveValue('acme.example');
 await frame.locator('#keywords').fill('中文关键词 remains unchanged');
 await language(page,'en');
 for(const name of ['home','domain','keywords','backlinks','results','actions']){
  await view(page,name);
  expect(await frame.locator(`#view-${name}`).innerText()).not.toMatch(/[\p{Script=Han}]/u);
 }
 await view(page,'backlinks');await expect(frame.getByRole('heading',{name:'Backlinks',exact:true})).toBeFocused();
 await expect(frame.getByRole('heading',{name:'Backlinks',exact:true})).toHaveCSS('outline-style','none');
 await view(page,'home');await expect(frame.locator('#keywords')).toHaveValue('中文关键词 remains unchanged');
 await frame.locator('#preview').click();await expect(frame.locator('#plan-dialog')).toBeVisible();
 expect((await frame.locator('#plan-dialog').innerText()).replaceAll('中文关键词 remains unchanged','')).not.toMatch(/[\p{Script=Han}]/u);
 await language(page,'zh');await expect(frame.locator('#plan-dialog')).toBeVisible();await expect(frame.locator('#execute')).toHaveText('确认费用并执行 →');
 await frame.locator('#close-plan').click();await view(page,'backlinks');await expect(frame.getByRole('heading',{name:'外链',exact:true})).toBeVisible();
 expect(await frame.locator('#view-backlinks').innerText()).not.toContain('Backlinks');expect(calls).toBe(0);
});

test('English reports and edited monitoring questions survive a round trip between languages',async({page})=>{
 const frame=page.frameLocator('iframe[title="SEO"]');await expect(frame.locator('#site')).toHaveValue('acme.example');await language(page,'en');
 await frame.locator('#preview').click();await frame.locator('#execute').click();await expect(frame.locator('.history-item .tag')).toHaveText('Completed');
 await view(page,'results');expect(await frame.locator('#report-panel').innerText()).not.toMatch(/[\p{Script=Han}]/u);
 const report=await frame.locator('.report-frame').getAttribute('src');const content=await (await page.request.get(new URL(report,page.url()).href)).text();expect(content).toContain('lang="en"');
 await view(page,'actions');await frame.locator('[data-question="0"]').fill('中文问题 stays as I wrote it');await frame.locator('input[name="question"]').first().check();
 await language(page,'zh');await language(page,'en');await expect(frame.locator('[data-question="0"]')).toHaveValue('中文问题 stays as I wrote it');await expect(frame.locator('input[name="question"]').first()).toBeChecked();
 await frame.locator('#add-monitor').click();await expect(frame.locator('#monitor-context')).toContainText('QA Acme');expect(await frame.locator('#monitor-dialog').innerText()).not.toMatch(/[\p{Script=Han}]/u);
 expect(calls).toBe(2);
});

test('English startup and populated SEO tables keep provider values intact and localize interface labels',async({page})=>{
 const frame=page.frameLocator('iframe[title="SEO"]');
 await page.evaluate(()=>{document.querySelector('iframe').src='/api/seo/brand-a/?lang=en#results';});
 await expect(frame.locator('html')).toHaveAttribute('lang','en');
 await frame.locator('#import-seo').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(frame.locator('#report-panel')).toContainText('Synthetic demo');
 for(const name of ['domain','keywords','backlinks','results','actions']){
  await view(page,name);
  expect(await frame.locator(`#view-${name}`).innerText()).not.toMatch(/[\p{Script=Han}]/u);
 }
 await language(page,'zh');await language(page,'en');
 const prevented=await frame.locator('body').evaluate(()=>{const event=new Event('beforeunload',{cancelable:true});window.dispatchEvent(event);return event.defaultPrevented;});
 expect(prevented).toBe(false);expect(calls).toBe(0);
});

test('workspace menus support keyboard selection, translated labels and dynamic report options',async({page})=>{
 const seo=page.frameLocator('iframe[title="SEO"]');
 const market=seo.getByRole('combobox',{name:'目标市场',exact:true});
 await market.click();
 await expect(seo.getByRole('listbox',{name:'目标市场',exact:true})).toBeVisible();
 await market.press('End');await market.press('Enter');
 await expect(market).toContainText('法国');
 await expect(seo.locator('#country')).toHaveValue('fr');
 await market.click();await market.press('Escape');
 await expect(market).toBeFocused();
 await page.evaluate(()=>document.querySelector('iframe').contentWindow.postMessage({type:'beatgeo:locale',locale:'en'},location.origin));
 await expect(seo.getByRole('combobox',{name:'Target market',exact:true})).toContainText('France');
 await expect(seo.locator('select:visible')).toHaveCount(0);
 await expect.poll(()=>calls).toBe(0);
});


test('managed SEO opens the brand answer history instead of importing separate GEO evidence',async({page})=>{
 const frame=page.frameLocator('iframe[title="SEO"]');
 await frame.locator('#import-seo').setInputFiles({name:'snapshot.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});
 await expect(frame.locator('#report-panel')).toContainText('GEO 回答与证据');
 await expect(frame.locator('#import-geo')).toHaveCount(0);
 await expect(frame.getByRole('button',{name:'导入 AI 回答记录',exact:true})).toHaveCount(0);
 await frame.getByRole('link',{name:'查看品牌回答 →',exact:true}).click();
 await expect(page).toHaveURL(/\/responses$/);
 await expect(page.getByRole('heading',{name:'Brand answers'})).toBeVisible();
 expect(calls).toBe(0);
});
