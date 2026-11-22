const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(src,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
new Function(src);
function fixtureEngine(){
  const rows=new Map(),window={};let deny=false;
  const localStorage={getItem:k=>rows.get(k)??null,setItem:(k,v)=>{if(deny)throw Error('QuotaExceededError');rows.set(k,String(v));}};
  vm.runInNewContext(src,{window,localStorage,crypto:webcrypto,Date,JSON,Math,TextEncoder,TextDecoder,URLSearchParams,AbortController,setTimeout,clearTimeout,console,fetch:async()=>{throw Error('No external network calls in M00');}});
  return {e:window.ParallelOffline,rows,block:()=>{deny=true;}};
}
const pid='m00-profile',cid='re-game:carlos:re3',pair=pid+'|'+cid;
const profile={id:pid,name:'Backup Fixture',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:['电影'],bio:'测试资料',intent:'了解彼此',avatar:'',role_character_id:'',created_at:'2026-11-20T12:00:00.000Z'};
const makeMsg=(id,mode,sender,text,at,mid='')=>({id,profile_id:pid,character_id:cid,mode,sender,engine:sender==='user'?'human':'live',text,created_at:at,meeting_id:mid});
const scene=[
  makeMsg('scene1','meeting','user','我们在露台喝了热汤。','2026-11-22T17:38:00.000Z','meet-m00'),
  makeMsg('scene2','meeting','ai','Carlos说，见面先到这里。🐕‍🦺','2026-11-22T17:50:00.000Z','meet-m00')
];
const meeting={id:'meet-m00',profile_id:pid,character_id:cid,started_at:'2026-11-22T16:40:00.000Z',ended_at:'2026-11-22T17:51:00.000Z',finished_at:'2026-11-22T17:51:00.000Z',location:'宿舍外廊露台',summary:'两人喝汤并结束见面。',ai_summary:'两人喝汤并结束见面。',message_ids:scene.map(x=>x.id),entries:scene.map(x=>({id:x.id,sender:x.sender,text:x.text,created_at:x.created_at})),location_history:[{at:'2026-11-22T16:40:00.000Z',location:'宿舍外廊露台',source:'start'}]};
(async()=>{
  const main=fixtureEngine(),pack=JSON.parse(main.e.exportData()),d=pack.data;
  d.profiles=[profile];
  d.relations[pair]={profile_id:pid,character_id:cid,status:'matched',mode:'chat',active_meeting_id:'',updated_at:meeting.ended_at};
  d.messages=[makeMsg('before','chat','user','今晚见面吗？','2026-11-21T23:10:00.000Z'),...scene,makeMsg('after','chat','user','今天小狗好安静啊～','2026-11-22T20:50:00.000Z')];
  d.messages.at(-1).quote={id:'before',sender:'user',text:'今晚见面吗？'};
  d.meetings=[meeting];
  d.events=[{id:'evt',profile_id:pid,character_id:cid,meeting_id:meeting.id,kind:'meeting',created_at:meeting.ended_at,text:'见面结束'}];
  d.episodicMemories=[{id:'memory',profile_id:pid,owner_id:cid,source_key:'meeting:'+meeting.id,source_type:'meeting_summary',summary:meeting.summary,tags:['露台'],raw_msg_ids:scene.map(x=>x.id),meeting_data:JSON.parse(JSON.stringify(meeting)),event_at:meeting.ended_at}];
  d.surveillance[pair]={byDate:{'2026-11-22':{date:'2026-11-22',profile_id:pid,character_id:cid,engine:'live',updated_at:meeting.ended_at,slots:[{id:'observed',start:'09:00',end:'09:51',location:'宿舍外廊露台',status:'见面中',activity:'真实相处',scene:'两人结束了见面。',source:'meeting',meeting_id:meeting.id}]}}};
  d.diaries[pair]={byDate:{'2026-11-21':{date:'2026-11-21',title:'昨天的日记',content:'整理装备。',created_at:'2026-11-22T08:00:00.000Z'}}};
  d.presets.push({id:'preset-m00',mode:'chat',enabled:true,name:'自定义预设',role:'system',content:'重要的自定义规则。',sort_order:99});
  main.e.importData(JSON.stringify(pack));
  const secrets=['M00_MAIN_TOKEN_123456','M00_IMAGE_TOKEN_123456','M00_ARCHIVE_TOKEN_123456'];
  await main.e.request('/settings',{base_url:'https://example.invalid/v1',model:'mock',api_key:secrets[0],image_api_key:secrets[1],archive_api_key:secrets[2]});
  const textBackup=main.e.exportData(),allBackup=await main.e.exportDataWithPhotos();
  const snapshot=JSON.parse(textBackup);
  assert.equal(snapshot.format,'parallel-portable-backup');assert.equal(snapshot.schemaVersion,1);
  for(const secret of secrets)assert(!allBackup.includes(secret)&&!textBackup.includes(secret),'no credentials in backups');
  for(const k of ['api_key','image_api_key','archive_api_key'])assert.equal(snapshot.data.connection[k],'');
  assert.equal(snapshot.data.systemLogs,undefined);
  assert.deepEqual(JSON.parse(allBackup).chatPhotoFiles,[]);
  // An isolated restore must recover ALL core collections, not just message counts.
  const other=fixtureEngine(),answer=await other.e.importDataWithPhotos(allBackup);
  assert.equal(answer.profiles,1);assert.equal(answer.messages,4);
  const restored=JSON.parse(other.e.exportData()).data;
  for(const k of ['profiles','relations','messages','meetings','events','episodicMemories','surveillance','diaries','presets'])
    assert.deepEqual(restored[k],snapshot.data[k],k+' must survive complete backup/restore');
  assert.equal(restored.meetings[0].entries.at(-1).text,scene.at(-1).text);
  assert.equal(restored.episodicMemories[0].meeting_data.entries.at(-1).text,scene.at(-1).text);
  assert.equal(restored.messages.at(-1).quote.text,'今晚见面吗？');
  const key='parallel-portable-v2',savedBytes=other.rows.get(key),savedData=JSON.parse(other.e.exportData()).data;
  assert(savedBytes.startsWith('PARALLEL-LZW14-V1:'));
  assert.throws(()=>other.e.importData('{bad json'),/不是有效 JSON/);
  assert.throws(()=>other.e.importData(JSON.stringify({format:snapshot.format,schemaVersion:999,data:snapshot.data})),/不是 Parallel/);
  const invalidPhoto=JSON.parse(allBackup);
  invalidPhoto.data.messages[0].photo_kind='gallery';invalidPhoto.data.messages[0].photo_ref='missing';
  await assert.rejects(()=>other.e.importDataWithPhotos(JSON.stringify(invalidPhoto)),/备份缺少聊天照片/);
  assert.deepEqual(JSON.parse(other.e.exportData()).data,savedData);
  assert.equal(other.rows.get(key),savedBytes,'invalid imports cannot replace the persisted save');
  const replacement=JSON.parse(allBackup);replacement.data.profiles[0].name='WRONG REPLACEMENT';
  other.block();
  assert.throws(()=>other.e.importData(JSON.stringify(replacement)),/浏览器本地空间不足或禁止保存/);
  assert.equal(other.rows.get(key),savedBytes,'quota failure cannot overwrite the persisted save');
  assert.equal(JSON.parse(other.e.exportData()).data.profiles[0].name,'Backup Fixture','quota failure must restore in-memory data');
  assert(main.e.exportData().includes('今天小狗好安静啊～'),'original source remains untouched');
  console.log('M00 backup contract passed: transcripts, meeting, memory, diary, schedule, presets, Unicode, credentials, isolated restore, invalid input and quota rollback.');
})().catch(err=>{console.error(err);process.exitCode=1;});
