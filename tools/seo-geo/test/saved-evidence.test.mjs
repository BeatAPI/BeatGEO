import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { readSavedSeoEvidence } from '../src/saved-evidence.mjs';

test('saved research preserves normalized evidence and rejects demos, incomplete runs and path traversal',async t=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'beatgeo-saved-seo-'));t.after(()=>rm(dir,{recursive:true,force:true}));
 const sample=JSON.parse(await readFile(new URL('../examples/seo.snapshot.example.json',import.meta.url),'utf8'));
 assert.equal(await readSavedSeoEvidence(dir),null);
 const id=randomUUID();await mkdir(path.join(dir,id));
 await writeFile(path.join(dir,id,'meta.json'),JSON.stringify({id,status:'complete',synthetic:true,createdAt:sample.createdAt}));
 await writeFile(path.join(dir,id,'seo-input.json'),JSON.stringify(sample));
 await assert.rejects(()=>readSavedSeoEvidence(dir,id),/non-demo/);
 sample.synthetic=false;
 await writeFile(path.join(dir,id,'meta.json'),JSON.stringify({id,status:'running',synthetic:false,createdAt:sample.createdAt}));
 await writeFile(path.join(dir,id,'seo-input.json'),JSON.stringify(sample));
 await assert.rejects(()=>readSavedSeoEvidence(dir,id),/completed/);
 await writeFile(path.join(dir,id,'meta.json'),JSON.stringify({id,status:'complete',synthetic:false,createdAt:sample.createdAt}));
 const result=await readSavedSeoEvidence(dir);
 assert.equal(result.runId,id);assert.equal(result.snapshot.records[0].input.country,'us');assert.equal(result.snapshot.createdAt,sample.createdAt);
 await assert.rejects(()=>readSavedSeoEvidence(dir,'../../other'),/Invalid/);
});
