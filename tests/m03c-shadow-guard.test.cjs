const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const probe=read('tests/fixtures/m03c-shadow-challenge.js');
const lab=read('tests/fixtures/m03b-shadow-lab.js');
const e2e=read('e2e/m03c-storage-pressure-race.spec.ts');
const config=read('playwright.m02.config.ts');
const workflow=read('.github/workflows/pages.yml');
new Function(probe);new Function(lab);
for(const live of ['public/parallel/offline.js','public/parallel/app.js','src/App.tsx']){
  assert(!read(live).includes('M03CShadowProbe'),live+' must not load M03-C lab');
}
for(const forbidden of ['localStorage.setItem','localStorage.removeItem',
  'indexedDB.deleteDatabase','ParallelOffline.importData(']){
  assert(!probe.includes(forbidden),'probe must not write source: '+forbidden);
}
assert(probe.includes("'parallel-chat-photos-v1'"));
assert(probe.includes("db.transaction('photos','readonly')"));
assert(probe.includes('req.transaction.abort()'),'missing photo database must fail closed');
assert(probe.includes('M03C stale source token'));
assert(probe.includes('M03C source changed during verification'));
assert(probe.includes('root.M03BShadowLab.stage'));
assert(lab.includes("fault==='simulated-quota-abort'"));
assert(lab.includes("err.name='QuotaExceededError'"));
assert(config.includes('m03c-storage-pressure-race'));
assert(workflow.includes('node tests/m03c-shadow-guard.test.cjs'));
for(const scenario of ['simulated-quota-abort','stale source token',
  'source photo missing or changed','Promise.all']){
  assert(e2e.includes(scenario),'missing WebKit proof: '+scenario);
}
let writes=0,removes=0;
const window={
  crypto:webcrypto,
  localStorage:{
    getItem:key=>key==='parallel-portable-v2'?'{"synthetic":true}':null,
    setItem:()=>{writes++;throw Error('source write forbidden')},
    removeItem:()=>{removes++;throw Error('source delete forbidden')}
  },
  ParallelOffline:{exportData:()=>JSON.stringify({data:{messages:[]}})},
  M03BShadowLab:{stage:()=>{throw Error('M03-B stage should not be called for stale token')}}
};
vm.runInNewContext(probe,{window,TextEncoder,Uint8Array,JSON,Error,console});
(async()=>{
  const api=window.M03CShadowProbe;
  assert.match(api.newName(),/^parallel-m03b-lab-m03c-[a-f0-9]{32}$/);
  await assert.rejects(api.stage({
    name:api.newName(),sourceSha256:'mismatched-token',
    backup:JSON.stringify({data:{messages:[]}})
  }),/stale source token/);
  await assert.rejects(api.verifyPhotoSource(JSON.stringify({
    data:{messages:[{photo_kind:'gallery',photo_ref:'missing-photo'}]},
    chatPhotoFiles:[{ref:'missing-photo',data:'data:image/jpeg;base64,AQID'}]
  })),/IndexedDB unavailable/);
  assert.equal(writes,0);assert.equal(removes,0);
  console.log('M03-C safety: separate immutable experiment DB names, source fences, photo-only reads, forced quota abort, WebKit release gate.');
})().catch(e=>{console.error(e);process.exitCode=1;});
