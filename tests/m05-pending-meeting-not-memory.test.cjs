const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(source,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
const window={},storage=new Map();let next=0;
vm.runInNewContext(source,{
  window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  crypto:{randomUUID:()=> 'm05-candidate-'+(++next)},Date,JSON,Math,URLSearchParams,TextEncoder,
  AbortController,setTimeout,clearTimeout,console,
  fetch:async()=>{throw Error('No API call allowed');}
});
(async()=>{
  const e=window.ParallelOffline;
  const p={id:'candidate-person',name:'Lin',age:25,gender:'female',interested_in:['all'],
    min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'聊天',
    role_character_id:'',created_at:'2026-11-21T20:00:00Z'};
  const cid='re-game:carlos:re3',mid='pending-contact';
  const row={id:'candidate-ai',profile_id:p.id,character_id:cid,mode:'meeting',
    meeting_id:mid,sender:'ai',engine:'live',
    text:'Carlos在门口等着，灯光映在地上；Lin尚未出现，也还没有对话。',
    created_at:'2026-11-22T22:00:00Z'};
  const pack=JSON.parse(e.exportData());
  pack.data.profiles=[p];
  pack.data.relations[p.id+'|'+cid]={
    profile_id:p.id,character_id:cid,status:'matched',mode:'chat',
    active_meeting_id:'',updated_at:'2026-11-22T22:01:00Z'
  };
  pack.data.messages=[row];
  pack.data.meetings=[];
  e.importData(JSON.stringify(pack));
  const mem=await e.request('/memories?profileId='+p.id+'&characterId='+cid);
  assert(mem.meetings.some(m=>m.id===mid),'opening scene is retained as a card, never deleted');
  assert(!mem.memories.some(m=>m.source_type==='meeting_summary'&&m.meeting_id===mid),
    'AI-only opening does not mint a witnessed shared experience');
  let loaded=JSON.parse(e.exportData());
  const card=loaded.data.meetings.find(m=>m.id===mid);
  assert(card?.entries?.length===1,'original candidate scene transcript is preserved');
  // Old versions may already have a contaminated memory: keep original bytes
  // for recovery, but do not let it become proof of a real joint encounter.
  loaded.data.episodicMemories.push({
    id:'legacy-false-experience',owner_id:cid,profile_id:p.id,
    source_type:'meeting_summary',source_key:'meeting:'+mid,
    meeting_id:mid,raw_msg_ids:[row.id],summary:'伪造的共同回家与晚餐',
    tags:['晚餐'],knowledge_mode:'experienced',event_at:'2026-11-22T22:00:00Z'
  });
  e.importData(JSON.stringify(loaded));
  const prompts=e.buildPromptPreview(p.id,cid,'chat',{latestText:'你记得上次晚餐吗'});
  const prompt=prompts.map(x=>x.content||'').join('\n');
  assert(!prompt.includes('伪造的共同回家与晚餐'),
    'historical AI-only meeting memories cannot enter chat prompts');
  assert(!prompt.includes('过去真实见面的原始记录索引'),
    'AI holding shot with no user action cannot be a confirmed previous encounter');
  const kept=JSON.parse(e.exportData()).data;
  assert(kept.meetings.some(m=>m.id===mid));
  assert(kept.messages.some(m=>m.id===row.id&&m.text===row.text));
  assert(kept.episodicMemories.some(m=>m.id==='legacy-false-experience'),
    'M05 does not silently delete old memory records');
  console.log('M05 candidate-only scene: original AI opener/card retained, no new shared memory, no legacy false recall.');
})().catch(e=>{console.error(e);process.exitCode=1});
