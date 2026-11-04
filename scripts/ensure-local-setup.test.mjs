import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ensureLocalSetup } from './ensure-local-setup.mjs';
const root=path.resolve('/workspace/beatgeo');
const file=name=>path.join(root,name);
function harness(paths=[]){
 const files=new Set(paths.map(file));let calls=0;
 return {options:{exists:p=>files.has(p),run:()=>{calls++;files.add(file('.env'));files.add(file('apps/web/.env'));return {status:0};}},calls:()=>calls};
}
test('first start creates configuration once, subsequent starts reuse it',()=>{
 const h=harness();ensureLocalSetup(root,h.options);ensureLocalSetup(root,h.options);assert.equal(h.calls(),1);
});
test('partial configuration and existing storage never trigger secret regeneration',()=>{
 for(const entry of ['.env','apps/web/.env','.beat-geo/postgres','.beat-geo/database.json']){
  const h=harness([entry]);assert.throws(()=>ensureLocalSetup(root,h.options),/Restore/);assert.equal(h.calls(),0);
 }
});
test('explicit environment files are never replaced by automatic setup',()=>{
 const h=harness(['custom.env']);ensureLocalSetup(root,{...h.options,envFile:file('custom.env')});assert.equal(h.calls(),0);
 assert.throws(()=>ensureLocalSetup(root,{...h.options,envFile:file('missing.env')}),/does not exist/);
});
test('failed setup prevents startup and keeps generated credentials for recovery',()=>{
 const h=harness();assert.throws(()=>ensureLocalSetup(root,{...h.options,run:()=>({status:1})}),/did not complete/);
});
