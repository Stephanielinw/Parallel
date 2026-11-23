const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const vm=require('node:vm');
const {
  MODULE_FILES,SOURCE_DIR,OUTPUTS,assembleOffline,verifyOutputs
}=require('../scripts/assemble-offline.cjs');

assert.equal(MODULE_FILES.length,14,'M06 modules cover all source sections');
assert.equal(new Set(MODULE_FILES).size,MODULE_FILES.length,'no duplicate modules');
assert(MODULE_FILES.every(n=>/^\d{2}-[a-z-]+\.js$/.test(n)));
assert(MODULE_FILES[0].startsWith('01-')&&MODULE_FILES.at(-1).startsWith('14-'));
const assembled=assembleOffline();
assert(assembled.startsWith('/* Parallel Portable Edition:'));
assert(assembled.includes('  const STORE_KEY=\'parallel-portable-v2\';'));
assert(assembled.includes('  const inferMeetingLocation='));
assert(assembled.includes('  const retrieveRelevantMemories='));
assert(assembled.includes('  const witnessedSurveillanceSlot='));
assert(assembled.includes('  async function request('));
assert(assembled.trimEnd().endsWith('})();'));
for(const output of OUTPUTS){
  assert.equal(fs.readFileSync(output,'utf8'),assembled,
    'Generated runtime does not match all source modules: '+output);
}
assert(verifyOutputs(assembled).every(x=>x.matches),'every shipped mirror matches source');

const baseHash=crypto.createHash('sha256').update(assembled).digest('hex');
assert(/^[0-9a-f]{64}$/.test(baseHash));
assert(Buffer.byteLength(assembled,'utf8')>300000,'source extraction dropped code');
new Function(assembled);
// Dev editing a module without regenerating both mirrors must fail closed,
// rather than silently shipping an old engine with different behavior.
const modified=assembleOffline(filename=>{
  const current=fs.readFileSync(filename,'utf8');
  return filename===path.join(SOURCE_DIR,MODULE_FILES[6])
    ?current+'\n// M06 synthetic drift injection\n':current;
});
assert.notEqual(modified,assembled);
assert(verifyOutputs(modified).every(x=>x.matches===false),
  'uncompiled source edit must be detected for both mirrors');
for(const file of ['parallel_src/parallel_ai_date/static/index.html',
 'public/parallel/index.html']){
  const html=fs.readFileSync(path.join(__dirname,'..',file),'utf8');
  assert(!html.includes('offline_modules/'),'no runtime imports of modular source');
}
const standaloneBuilder=fs.readFileSync(
 path.join(__dirname,'../parallel_src/parallel_ai_date/build_portable.cjs'),'utf8');
assert(standaloneBuilder.includes("staticDir, 'offline.js'"),
 'single-file distribution must still embed the assembled engine');

const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/pages.yml'),'utf8');
assert(workflow.includes('node tests/m06-module-assembly.test.cjs'),
 'M06 source-mirror drift test must run as a release gate');
const packageJson=JSON.parse(fs.readFileSync(path.join(__dirname,'../package.json'),'utf8'));
assert(packageJson.scripts['build:downloads'].includes('assemble-offline.cjs --check'),
 'production builds must fail closed on drift');

// Running the assembled source still exposes exactly the existing API,
// without extra globals or any storage migrations.
const localRows=new Map(),window={};
vm.runInNewContext(assembled,{
  window,
  localStorage:{getItem:k=>localRows.get(k)??null,setItem:(k,v)=>localRows.set(k,v)},
  crypto:crypto.webcrypto,Date,JSON,Math,TextEncoder,TextDecoder,
  URLSearchParams,AbortController,console,
  setTimeout,clearTimeout,
  fetch:async()=>{throw Error('No network allowed in M06');}
});
const api=window.ParallelOffline;
assert(api&&typeof api.request==='function'&&typeof api.exportData==='function'&&
  typeof api.importData==='function','legacy ParallelOffline API retained');
const pack=JSON.parse(api.exportData());
assert.equal(pack.format,'parallel-portable-backup');
assert.equal(pack.schemaVersion,1);
assert(!Object.keys(window).some(k=>k.startsWith('ParallelM06')),
 'M06 must not introduce a new runtime global');
console.log('M06 module split: '+MODULE_FILES.length+' source sections, identical two mirrors, drift rejection, unchanged VM API and backup schema. '+baseHash.slice(0,12));
