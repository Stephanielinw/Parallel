const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const lab=read('tests/fixtures/m03d-cutover-rehearsal.js');
const e2e=read('e2e/m03d-cutover-rollback.spec.ts');
const config=read('playwright.m02.config.ts');
const workflow=read('.github/workflows/pages.yml');
new Function(lab);
for(const live of ['public/parallel/offline.js','public/parallel/app.js','src/App.tsx']){
  assert(!read(live).includes('M03DCutoverRehearsal'),live+' may not invoke rehearsal route');
  assert(!read(live).includes('m03d-cutover-rehearsal'),live+' may not import rehearsal');
}
for(const forbidden of ['localStorage.setItem','localStorage.removeItem',
  'indexedDB.deleteDatabase','ParallelOffline.importData(','saveChatPhotoBatch(']){
  assert(!lab.includes(forbidden),'M03-D may not write/delete source: '+forbidden);
}
assert(lab.includes("db.transaction('routes','readwrite')"),
  'revision CAS must take place inside one isolated IDB transaction');
assert(lab.includes('previous.revision!==expectedRevision'),
  'must reject stale revisions under the transaction lock');
assert(lab.includes("if(prev.mode!=='shadow')"),'rollback requires shadow route');
assert(lab.includes("fault==='after-pointer-commit'"));
assert(lab.includes("M03D legacy source changed during verification"));
assert(lab.includes("M03D route changed during read"));
assert(lab.includes('M03CShadowProbe.verify'),'must revalidate external photos');
assert(config.includes('m03d-cutover-rollback'));
assert(workflow.includes('node tests/m03d-cutover-safety.test.cjs'));
for(const scenario of ['revision conflict','lost acknowledgement','digest mismatch',
  'source photo missing or changed','legacy source changed','rollback(']){
  assert(e2e.includes(scenario),'missing WebKit assertion: '+scenario);
}
let writes=0,removes=0;
const window={
  crypto:webcrypto,
  localStorage:{
    getItem:()=>'{"test":true}',
    setItem:()=>{writes++;throw Error('forbidden source write');},
    removeItem:()=>{removes++;throw Error('forbidden source delete');}
  }
};
vm.runInNewContext(lab,{window,TextEncoder,Uint8Array,JSON,Error,console});
(async()=>{
  const api=window.M03DCutoverRehearsal;
  const name=api.newControlName();
  assert.match(name,/^parallel-m03d-lab-[a-f0-9]{32}$/);
  await assert.rejects(api.readState(name),/IndexedDB unavailable/);
  await assert.rejects(api.readState('parallel-production-main'),/disposable control/);
  await assert.rejects(api.stageCandidate({name:'parallel-production-main',
    sourceSha256:'fake',backup:'{}'}),/disposable verified shadow/);
  assert.equal(writes,0);
  assert.equal(removes,0);
  console.log('M03-D safety: lab-only CAS, fail-closed pointer, explicit rollback and zero source writes.');
})().catch(e=>{console.error(e);process.exitCode=1;});
