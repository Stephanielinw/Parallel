const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('src/storage/parallelIncrementalIDB.js');
new Function(source);
// This module is a deliberate integration candidate. In M04 it must never be
// loaded automatically in production until the real-device backup gate.
for(const live of [
  'public/parallel/offline.js','public/parallel/app.js',
  'parallel_src/parallel_ai_date/static/offline.js',
  'parallel_src/parallel_ai_date/static/app.js',
  'public/parallel/index.html','src/App.tsx','index.html'
]){
  assert(!read(live).includes('ParallelM04Incremental'),
    'M04 not approved for live app: '+live);
  assert(!read(live).includes('parallelIncrementalIDB'),
    'M04 candidate must not be auto-imported: '+live);
}
for(const forbidden of [
  'localStorage.setItem','localStorage.removeItem','localStorage.clear',
  'localStorage.getItem','indexedDB.deleteDatabase',
  "'parallel-chat-photos-v1'","'parallel-portable-v2'",
  'ParallelOffline.importData('
]){
  assert(!source.includes(forbidden),'M04 must not access live source/photo DB: '+forbidden);
}
assert(source.includes('parallel-m04-lab-'));
assert(source.includes("db.transaction(['meta','root','records','orders'],'readwrite')"));
assert(source.includes('head.revision!==expectedRevision'),'revision CAS required');
assert(source.includes('M04 revision conflict'));
assert(source.includes("fault==='quota-abort'"));
assert(source.includes("fault==='after-commit-interrupt'"));
assert(source.includes('initialSnapshotSha256'),'initial full snapshot hash required');
assert(source.includes('M04 orphan indexed row'),'read must reject orphan records');
assert(source.includes('M04 record digest or key mismatch'));
assert(read('playwright.m02.config.ts').includes('m04-incremental-idb'));
assert(read('.github/workflows/pages.yml').includes('node tests/m04-incremental-safety.test.cjs'));
const test=read('e2e/m04-incremental-idb.spec.ts');
for(const term of ['recordWrites:2','orderWrites:1','revision conflict',
  'simulated quota abort','lost acknowledgement','record digest or key mismatch',
  'm04-photo-ref','duplicate record ID','refusing overwrite']){
  assert(test.includes(term),'M04 WebKit must prove '+term);
}
let legacyTouched=false;
const win={crypto:webcrypto,
  localStorage:{getItem(){legacyTouched=true;throw Error('no read allowed');},
    setItem(){legacyTouched=true;throw Error('no write allowed');}}
};
vm.runInNewContext(source,{window:win,TextEncoder,Uint8Array,JSON,Math,Error});
(async()=>{
  const m=win.ParallelM04Incremental;
  assert.match(m.newLabName(),/^parallel-m04-lab-[a-f0-9]{32}$/);
  assert.throws(()=>m.createStore('parallel-production-v1'),/disposable random lab/);
  const store=m.createStore(m.newLabName());
  await assert.rejects(store.load(),/IndexedDB unavailable/);
  await assert.rejects(store.initialize({
    snapshot:{profiles:[],messages:[],connection:{}},
    sourceSha256:'a'.repeat(64)
  }),/IndexedDB unavailable/);
  assert.equal(legacyTouched,false);
  console.log('M04 safety: isolated only, not production loaded, no live source/photos, CAS and integrity gates enforced.');
})().catch(e=>{console.error(e);process.exitCode=1;});
