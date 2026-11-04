import { test, expect } from '@playwright/test';
import { cp, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../../apps/web/package.json', import.meta.url));
const { createServer } = await import(require.resolve('vite'));
const { default: react } = await import(require.resolve('@vitejs/plugin-react'));
let dir, server, url;

test.beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'beatgeo-language-'));
  await symlink(fileURLToPath(new URL('../../apps/web/node_modules', import.meta.url)), join(dir, 'node_modules'));
  await cp(fileURLToPath(new URL('../../apps/web/src/lib/i18n', import.meta.url)), join(dir, 'i18n'), { recursive: true });
  await writeFile(join(dir, 'index.html'), '<div id="root"></div><script type="module" src="/main.jsx"></script>');
  await writeFile(join(dir, 'main.jsx'), `import React from 'react'; import {createRoot} from 'react-dom/client'; import {App} from './App'; createRoot(document.getElementById('root')).render(<App/>);`);
  await writeFile(join(dir, 'App.jsx'), `
import React, {lazy, Suspense, useState} from 'react';
import {LocaleProvider,useLocale,useT} from './i18n';
const Details=lazy(()=>import('./Details'));
function Workspace(){const {locale,setLocale}=useLocale();const t=useT();const [open,setOpen]=useState(false);const [draft,setDraft]=useState('');
return <main lang={locale}><button onClick={()=>setLocale('zh')}>中文</button><button onClick={()=>setLocale('en')}>EN</button><nav>{t('Overview')}</nav><input aria-label="Draft" value={draft} onChange={e=>setDraft(e.target.value)}/><button onClick={()=>setOpen(true)}>Open details</button>{open&&<Suspense><Details/></Suspense>}</main>}
export function App(){return <LocaleProvider><Workspace/></LocaleProvider>}`);
  await writeFile(join(dir, 'Details.jsx'), `import React from 'react';import {useT} from './i18n';export default function Details(){const t=useT();return <section><h1>{t('Set up brand monitoring')}</h1><p>{t('Connected')}</p></section>}`);
  server = await createServer({ root: dir, configFile: false, plugins: [react()], server: {host:'127.0.0.1',port:0}, optimizeDeps:{include:['react','react-dom/client']} });
  await server.listen();
  url = `http://127.0.0.1:${server.httpServer.address().port}`;
});
test.afterAll(async()=>{await server?.close();if(dir)await rm(dir,{recursive:true,force:true});});

test('language stays consistent in existing and lazy pages after translation hot updates', async ({page})=>{
  await page.goto(url);
  await page.getByRole('button',{name:'中文',exact:true}).click();
  await expect(page.locator('nav')).toHaveText('概览');
  await page.getByLabel('Draft').fill('Keep this website question 原文');
  const dictionary=JSON.parse(await readFile(join(dir,'i18n/zh.json'),'utf8'));
  dictionary.Overview='总览';
  await writeFile(join(dir,'i18n/zh.json'),JSON.stringify(dictionary));
  await expect(page.locator('nav')).toHaveText('总览');
  await expect(page.getByLabel('Draft')).toHaveValue('Keep this website question 原文');
  await page.getByRole('button',{name:'Open details'}).click();
  await expect(page.getByRole('heading')).toHaveText('设置品牌监测');
  await expect(page.locator('section p')).toHaveText('已连接');
  await page.getByRole('button',{name:'EN',exact:true}).click();
  await expect(page.locator('nav')).toHaveText('Overview');
  await expect(page.getByRole('heading')).toHaveText('Set up brand monitoring');
  await expect(page.getByLabel('Draft')).toHaveValue('Keep this website question 原文');
});

test('saved language applies on reload, new routes and other tabs',async({page,context})=>{
 await page.goto(url);await page.getByRole('button',{name:'中文',exact:true}).click();
 await page.reload();await expect(page.locator('main')).toHaveAttribute('lang','zh');
 const other=await context.newPage();await other.goto(url);await other.getByRole('button',{name:'Open details'}).click();
 await expect(other.getByRole('heading')).toHaveText('设置品牌监测');
 await page.getByRole('button',{name:'EN',exact:true}).click();
 await expect(other.getByRole('heading')).toHaveText('Set up brand monitoring');await other.close();
});
