const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('public/parallel/offline.js');
assert.equal(source,read('parallel_src/parallel_ai_date/static/offline.js'),'portable mirrors must stay in sync');
new Function(source);
let seq=0,now=Date.parse('2026-11-22T09:20:00-08:00');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const model=async(_url,opts)=>{
  const payload=JSON.parse(opts.body);
  const text=payload.response_format
    ?JSON.stringify({summary:'在公寓露台分享热汤，之后谈到继续见面'})
    :'Leon说：热汤还温着，我们下次继续聊。';
  return {ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:text},finish_reason:'stop'}]})};
};
function make(storage=new Map()){
  const window={};
  vm.runInNewContext(source,{
    window,
    localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    crypto:{randomUUID:()=> 'm03-ref-'+(++seq)},Date:Clock,JSON,Math,
    TextEncoder,TextDecoder,URLSearchParams,AbortController,setTimeout,clearTimeout,console,fetch:model
  });
  return {api:window.ParallelOffline,storage};
}
function state(api){return JSON.parse(api.exportData()).data;}
(async()=>{
  const {api,storage}=make();
  const profile=(await api.request('/profile',{
    name:'Test Profile',age:25,gender:'female',interested_in:['all'],
    min_age:18,max_age:65,sources:['生化危机']
  })).profile;
  const pid=profile.id,cid='re-game:leon:re2',pair={profileId:pid,characterId:cid};
  for(let i=0;i<28;i++){
    if((await api.request('/swipe',{...pair,direction:'right'})).matched)break;
  }
  await api.request('/settings',{
    base_url:'https://example.invalid/v1',api_key:'TEST-NOT-REAL',model:'fixture',
    auto_translate:false,archive_enabled:false
  });
  const meeting=await api.request('/mode',{
    ...pair,mode:'meeting',location:'公寓露台',triggerOpening:false
  });
  const mid=meeting.active_meeting_id;
  assert(mid,'synthetic meeting must start');
  const originalText='这场见面里我们确实一起喝了热汤 🐕‍🦺，原文永远不能丢。';
  const reply=await api.request('/message',{...pair,text:originalText});
  assert(reply.user?.id&&reply.reply?.id,'synthetic conversation saved both turns');
  now+=3600000;
  const finish=await api.request('/mode',{...pair,mode:'chat',finalizeMeeting:true});
  assert.equal(finish.meetingRecord.id,mid);
  const saved=state(api),canonical=saved.meetings.find(m=>m.id===mid);
  const mem=saved.episodicMemories.find(m=>m.source_key==='meeting:'+mid);
  assert(canonical&&mem,'full canonical meeting and memory reference must both exist');
  assert(canonical.entries.some(e=>e.text===originalText),'canonical meeting keeps raw user text');
  assert(saved.messages.some(m=>m.id===reply.user.id&&m.text===originalText),'raw message unchanged');
  assert.equal(mem.meeting_id,mid);
  assert.equal(mem.meeting_data,null,'NEW meeting memory must not duplicate canonical transcript');
  assert.deepEqual(Array.from(mem.raw_msg_ids),Array.from(canonical.message_ids));
  const view=await api.request('/memories?profileId='+pid+'&characterId='+cid);
  const hydrated=view.memories.find(m=>m.meeting_id===mid);
  assert(hydrated?.meeting_data?.entries?.some(e=>e.text===originalText),
    'memory UI still receives complete original transcript using canonical ID');
  assert.equal(state(api).episodicMemories.find(m=>m.meeting_id===mid).meeting_data,null,
    'read-time hydration must never persist an embedded duplicate');

  // Simulate app restart and portable full-backup import: reference is stable.
  const reloaded=make(storage).api;
  const opened=await reloaded.request('/memories?profileId='+pid+'&characterId='+cid);
  assert(opened.memories.find(m=>m.meeting_id===mid).meeting_data.entries
    .some(e=>e.text===originalText),'restart resolves same canonical transcript');
  const backup=reloaded.exportData();
  const restored=make().api;
  restored.importData(backup);
  const restoredView=await restored.request('/memories?profileId='+pid+'&characterId='+cid);
  assert(restoredView.memories.find(m=>m.meeting_id===mid).meeting_data.entries
    .some(e=>e.text===originalText),'backup import restores linked original scene');
  assert.deepEqual(state(restored).meetings,state(reloaded).meetings,
    'backup import preserves canonical meeting without data rewriting');

  // Historical backups with an embedded scene must not be silently rewritten,
  // even if a current canonical record is available.
  const oldPack=JSON.parse(backup);
  const oldMemory=oldPack.data.episodicMemories.find(m=>m.meeting_id===mid);
  oldMemory.meeting_data=JSON.parse(JSON.stringify(canonical));
  oldMemory.meeting_data.legacy_custom_field='Do not remove from older save';
  const legacy=make().api;
  legacy.importData(JSON.stringify(oldPack));
  const before=state(legacy).episodicMemories.find(m=>m.meeting_id===mid).meeting_data;
  await legacy.request('/memories?profileId='+pid+'&characterId='+cid);
  const after=state(legacy).episodicMemories.find(m=>m.meeting_id===mid).meeting_data;
  assert.deepEqual(after,before,'legacy embedded snapshots remain byte-semantic intact');
  assert.equal(after.legacy_custom_field,'Do not remove from older save');
  const oldView=await legacy.request('/memories?profileId='+pid+'&characterId='+cid);
  assert(oldView.memories.find(m=>m.meeting_id===mid).meeting_data.entries
    .some(e=>e.text===originalText),'read compatibility prefers canonical source');

  // Explicit permanent forgetting must not resurrect an old scene from
  // a synthetic memory's external reference.
  const removed=await restored.request('/message-forget',{...pair,messageId:reply.user.id});
  assert(removed.ok,'explicit permanent forget succeeds');
  const changed=state(restored);
  assert(!changed.messages.some(m=>m.id===reply.user.id));
  assert(!JSON.stringify(changed.meetings).includes(originalText),
    'canonical archived transcript forgets the deleted turn');
  const postForget=await restored.request('/memories?profileId='+pid+'&characterId='+cid);
  assert(!JSON.stringify(postForget.memories).includes(originalText),
    'hydration must not reintroduce permanently deleted content');
  console.log('M03 memory references: new-only dedup, UI hydration, restart, full backup restore, old-data retention, hard-delete safety passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
