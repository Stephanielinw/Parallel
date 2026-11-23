const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const lab=read('tests/fixtures/m03b-shadow-lab.js');
const workflow=read('.github/workflows/pages.yml');
const e2e=read('e2e/m03b-indexeddb-shadow.spec.ts');
const engine=read('public/parallel/offline.js');
const ui=read('public/parallel/app.js');
const shell=read('src/App.tsx');
new Function(lab);
assert(!engine.includes('M03BShadowLab'),'lab must not be compiled into the live engine');
assert(!ui.includes('M03BShadowLab'),'lab must not run in live UI');
assert(!shell.includes('m03b-shadow-lab'),'lab must not be imported during production startup');
assert(!lab.includes('localStorage.setItem'),'lab may not modify legacy source');
assert(!lab.includes('localStorage.removeItem'),'lab may not delete legacy source');
assert(!lab.includes('indexedDB.deleteDatabase'),'lab may not delete existing databases');
assert(!lab.includes('ParallelOffline.importData('),'lab may not invoke live overwrite/restore');
assert(lab.includes("tx=db.transaction(['control','records'],'readwrite')"),
  'all candidate collection writes and commit marker must share one atomic transaction');
assert(lab.includes("tx.abort()"),'fault injection must actually abort its transaction');
assert(workflow.includes('npx playwright test -c playwright.m02.config.ts'));
assert(read('playwright.m02.config.ts').includes('m03b-indexeddb-shadow'));
assert(e2e.includes('mid-write-abort')&&e2e.includes('after-commit-interrupt'));
assert(e2e.includes('digest mismatch')&&e2e.includes('stale'));

// A browser lacking IndexedDB must fail closed. It may not touch the old save
// or claim an active migration succeeded.
let writes=0,removes=0;
const source={profiles:[],messages:[],events:[],presets:[],swipes:{},relations:{},connection:{api_key:''}};
const backup=JSON.stringify({format:'parallel-portable-backup',schemaVersion:1,data:source});
const window={
  localStorage:{
    getItem:k=>k==='parallel-portable-v2'?JSON.stringify(source):null,
    setItem:()=>{writes++;throw Error('Source write forbidden');},
    removeItem:()=>{removes++;throw Error('Source delete forbidden');}
  },
  crypto:webcrypto,
  ParallelOffline:{storageAvailable:true,exportData:()=>backup}
};
vm.runInNewContext(lab,{window,TextEncoder,JSON,console});
(async()=>{
  await assert.rejects(window.M03BShadowLab.stage({
    name:'parallel-m03b-lab-no-idb',backup
  }),/IndexedDB unavailable/);
  await assert.rejects(window.M03BShadowLab.stage({
    name:'parallel-production-main',backup
  }),/disposable lab database name/);
  assert.equal(writes,0);
  assert.equal(removes,0);
  console.log('M03-B isolated lab safety: no production script changes, no source mutations, fail-closed offline, atomic transaction & WebKit gate passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
