const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto,createHash}=require('node:crypto');
const {inspectBackupCandidate}=require('../scripts/m09-cloud-backup-preflight.cjs');
const src=fs.readFileSync(path.join(__dirname,'../public/parallel/offline.js'),'utf8');
let networkCalls=0;
const saved=new Map(),window={};
const localStorage={
  getItem:key=>saved.get(key)??null,
  setItem:(key,value)=>saved.set(key,String(value))
};
vm.runInNewContext(src,{window,localStorage,crypto:webcrypto,Date,JSON,Math,
  TextEncoder,TextDecoder,URLSearchParams,AbortController,console,setTimeout,clearTimeout,
  fetch:async()=>{networkCalls++;throw Error('No remote service allowed in M09');}
});
const engine=window.ParallelOffline;
const original=engine.exportData();
const before=new Map(saved);
const cloud=inspectBackupCandidate(original);
assert.equal(cloud.format,'parallel-cloud-preflight');
assert.equal(cloud.schemaVersion,1);
assert.equal(cloud.encrypted,false);
assert.equal(cloud.mayUpload,false);
assert.equal(cloud.sha256,createHash('sha256').update(Buffer.from(original,'utf8')).digest('hex'));
assert.equal(cloud.bytes,Buffer.byteLength(original,'utf8'));
assert(!JSON.stringify(cloud).includes('profileId'),'Preflight must return only anonymous metadata');
assert.deepEqual(saved,before,'Read-only cloud preflight must not alter local save');
assert.equal(networkCalls,0,'No network calls from cloud backup preflight');
const snapshot=JSON.parse(original);
snapshot.data.messages.push({
  id:'m09-gallery',sender:'user',profile_id:'synthetic-profile',character_id:'re-game:carlos:re3',
  mode:'chat',text:'只存在于合成数据中的图片引用',photo_kind:'gallery',photo_ref:'synthetic-photo'
});
const withPhoto=JSON.parse(JSON.stringify(snapshot));
withPhoto.chatPhotoFiles=[{ref:'synthetic-photo',data:'data:image/jpeg;base64,AAAA'}];
const good=inspectBackupCandidate(JSON.stringify(withPhoto));
assert.equal(good.photoAttachments,1);
assert.equal(good.photoReferences,1);
assert.equal(good.completePhotoBundle,true);
assert(!JSON.stringify(good).includes('synthetic-profile'));
assert.throws(()=>inspectBackupCandidate(JSON.stringify(snapshot)),/Gallery photo/);
const missing=JSON.parse(JSON.stringify(snapshot));missing.data.messages.push({...missing.data.messages.at(-1)});
assert.throws(()=>inspectBackupCandidate(JSON.stringify(missing)),/Duplicate/);
const unsafe=JSON.parse(JSON.stringify(withPhoto));
unsafe.data.connection.api_key='NEVER_EXPORT_THIS_TOKEN';
assert.throws(()=>inspectBackupCandidate(JSON.stringify(unsafe)),/credentials/);
const logs=JSON.parse(JSON.stringify(withPhoto));logs.data.systemLogs=[{raw_content:'secret'}];
assert.throws(()=>inspectBackupCandidate(JSON.stringify(logs)),/generation logs/);
const malformed=JSON.parse(JSON.stringify(withPhoto));malformed.chatPhotoFiles.push({...malformed.chatPhotoFiles[0]});
assert.throws(()=>inspectBackupCandidate(JSON.stringify(malformed)),/duplicate backup photo/);
assert.throws(()=>inspectBackupCandidate('{invalid'),/valid JSON/);
assert.throws(()=>inspectBackupCandidate(JSON.stringify({format:'parallel-portable-backup',schemaVersion:3,data:snapshot.data})),/Unsupported/);
assert.deepEqual(saved,before,'Even invalid cloud candidates cannot write game data');
assert.equal(networkCalls,0,'No cloud transport is implemented in M09');
const workflow=fs.readFileSync(path.join(__dirname,'../.github/workflows/pages.yml'),'utf8');
assert(workflow.includes('node tests/m09-cloud-readiness.test.cjs'),'Preflight safety contract must run in CI');
console.log('M09 cloud readiness: format, SHA, original transcript preservation, privacy, photos, no uploads or local writes passed.');
