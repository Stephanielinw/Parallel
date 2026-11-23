// M03: read-only check of an exported backup. The checker MUST NOT call
// importData, persist, network, filesystem writes or any user's actual save.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=f=>fs.readFileSync(path.join(root,f),'utf8');
const ui=read('public/parallel/app.js');
assert.equal(ui,read('parallel_src/parallel_ai_date/static/app.js'),'browser and portable scripts must match');
const i=ui.indexOf('function inspectParallelBackupFile(');
const j=ui.indexOf('async function verifyBackupFiles(',i);
assert(i>0&&j>i,'read-only validator and file selection workflow should exist');
const inspector=new Function(ui.slice(i,j)+'return inspectParallelBackupFile;')();
const emptyPack=()=>({
  format:'parallel-portable-backup',schemaVersion:1,createdAt:'2026-11-22T20:00:00Z',
  data:{profiles:[{id:'profile-a',name:'Synthetic'}],swipes:{},relations:{},messages:[],meetings:[],
    events:[],episodicMemories:[],surveillance:{},diaries:{},presets:[],
    connection:{api_key:'',image_api_key:'',archive_api_key:''}}
});
const pack=emptyPack(),utf8='长篇对话 🐕‍🦺 见面后的真实记录';
pack.data.messages=[
 {id:'sms-1',profile_id:'profile-a',character_id:'re-game:leon:re6',mode:'chat',sender:'user',text:utf8,created_at:'2026-11-22T20:01:00Z'},
 {id:'scene-1',profile_id:'profile-a',character_id:'re-game:leon:re6',mode:'meeting',meeting_id:'meet-a',sender:'ai',text:'在露台见面了',created_at:'2026-11-22T20:02:00Z'}
];
pack.data.meetings=[{id:'meet-a',profile_id:'profile-a',character_id:'re-game:leon:re6',entries:[
 {id:'scene-1',sender:'ai',text:'在露台见面了',created_at:'2026-11-22T20:02:00Z'}],message_ids:['scene-1']}];
pack.data.episodicMemories=[{id:'memory',profile_id:'profile-a',owner_id:'re-game:leon:re6',raw_msg_ids:['scene-1']}];
pack.data.surveillance={'profile-a|re-game:leon:re6':{byDate:{'2026-11-22':{slots:[]}}}};
pack.data.diaries={'profile-a|re-game:leon:re6':{byDate:{'2026-11-22':{content:'今天见面了'}}}};
const raw=JSON.stringify(pack),savedCopy=raw;
const safe=inspector(raw);
assert.equal(safe.ok,true);
assert.equal(safe.counts.profiles,1);
assert.equal(safe.counts.messages,2);
assert.equal(safe.counts.meetings,1);
assert.equal(safe.counts.memories,1);
assert.equal(safe.counts.diaries,1);
assert.equal(safe.counts.photoRefs,0);
assert.equal(safe.photoBundle,false,'no photo bundle means a text-only export, even with no photos');
assert.deepEqual(JSON.parse(raw),JSON.parse(savedCopy),'validator never modifies source JSON');
assert(!JSON.stringify(safe).includes(utf8),'validator must never return personal transcript text');
const full=structuredClone(pack);
full.data.messages[0].photo_kind='gallery';
full.data.messages[0].photo_ref='photo-1';
full.chatPhotoFiles=[{ref:'photo-1',data:'data:image/jpeg;base64,AQID'}];
const fullSafe=inspector(JSON.stringify(full));
assert.equal(fullSafe.counts.photoRefs,1);
assert.equal(fullSafe.counts.photoFiles,1);
assert.equal(fullSafe.photoBundle,true);
assert.equal(fullSafe.warnings.length,0,'a valid synthetic photo reference must not warn');
const missing=structuredClone(full);missing.chatPhotoFiles=[];
assert.throws(()=>inspector(JSON.stringify(missing)),/缺少.*照片/);
const textOnlyPhoto=structuredClone(full);delete textOnlyPhoto.chatPhotoFiles;
assert.throws(()=>inspector(JSON.stringify(textOnlyPhoto)),/缺少.*照片/);
const corrupt=structuredClone(full);corrupt.chatPhotoFiles[0].data='data:image/png;base64,AQID';
assert.throws(()=>inspector(JSON.stringify(corrupt)),/照片.*无效/);
const duplicate=structuredClone(full);duplicate.chatPhotoFiles.push({...duplicate.chatPhotoFiles[0]});
assert.throws(()=>inspector(JSON.stringify(duplicate)),/重复.*照片/);
const duplicateMessage=structuredClone(pack);duplicateMessage.data.messages.push({...duplicateMessage.data.messages[0]});
assert.throws(()=>inspector(JSON.stringify(duplicateMessage)),/重复.*消息/);
const privateToken=structuredClone(pack);privateToken.data.connection.api_key='never-upload-this';
assert.throws(()=>inspector(JSON.stringify(privateToken)),/API|凭据|密钥/);
const privateLogs=structuredClone(pack);privateLogs.data.systemLogs=[{request:'private'}];
assert.throws(()=>inspector(JSON.stringify(privateLogs)),/日志/);
const unsupported=structuredClone(pack);unsupported.schemaVersion=999;
assert.throws(()=>inspector(JSON.stringify(unsupported)),/版本|格式/);
const incomplete=structuredClone(pack);delete incomplete.data.surveillance;
assert(inspector(JSON.stringify(incomplete)).warnings.some(x=>x.includes('surveillance')),'missing optional records require clear warnings');
assert.throws(()=>inspector('not-json'),/JSON/);
assert.throws(()=>inspector(''),/空|JSON/);
const withMissingSources=structuredClone(pack);withMissingSources.data.meetings[0].message_ids=['ghost-id'];
assert(inspector(JSON.stringify(withMissingSources)).warnings.some(x=>x.includes('见面')||x.includes('来源')),'archived scene without raw source is flagged');
assert(ui.includes('id="portable-backup-check"')&&ui.includes('multiple'),'two-copy audit is available from terminal');
assert(ui.includes("if(e.target.id==='portable-backup-check')"),'change event is wired');
assert(ui.includes("await crypto.subtle.digest('SHA-256'"),'byte-for-byte matching uses cryptographic digest');
assert(!ui.slice(i,j).includes('localStorage.setItem'),'read-only verifier cannot persist');
assert(!ui.slice(i,j).includes('importData('),'read-only verifier cannot restore');
console.log('M03 read-only backup audit: schema, source references, Unicode, missing/duplicate photos, credentials, legacy warnings, and two-copy UI contract passed.');