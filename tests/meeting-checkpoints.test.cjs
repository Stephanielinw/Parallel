const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read('public/parallel/offline.js');
assert.equal(src,read('parallel_src/parallel_ai_date/static/offline.js'));
new Function(src);
const store=new Map(),window={};let counter=0;
vm.runInNewContext(src,{window,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 crypto:{randomUUID:()=> 'checkpoint-test-'+(++counter)},Date,URLSearchParams,JSON,Math,TextEncoder,AbortController,
 setTimeout,clearTimeout,console,fetch:async()=>{throw Error('Do not call paid model in checkpoint compatibility test')}});
const e=window.ParallelOffline;
const signature=rows=>{
 let hash=2166136261,len=0;
 for(const m of rows){
   const line=String(m.id)+'\u0000'+String(m.text||'')+'\u0001';
   len+=line.length;
   for(let i=0;i<line.length;i++)hash=Math.imul(hash^line.charCodeAt(i),16777619)>>>0;
 }
 return len+':'+hash.toString(16);
};
(async()=>{
 const p=(await e.request('/profile',{name:'Test',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[]})).profile;
 const pair={profileId:p.id,characterId:'re-game:carlos:re3'};
 for(let i=0;i<30;i++)if((await e.request('/swipe',{...pair,direction:'right'})).matched)break;
 const start=await e.request('/mode',{...pair,mode:'meeting',location:'公园长椅',triggerOpening:false});
 const mid=start.active_meeting_id;
 for(let i=1;i<=51;i++){
   const answer=await e.request('/message',{...pair,text:i===1?'把铜钥匙藏在书包里。':'第'+i+'轮，我们还坐在公园长椅上说话。'});
   assert(answer.reply,'demo meeting response for '+i);
 }
 let pack=JSON.parse(e.exportData()),d=pack.data;
 assert.equal(d.meetingCheckpoints.length,0,'M11: no fixed 50-group auto summaries even after 51 groups');
 assert(!d.episodicMemories.some(m=>String(m.source_key).startsWith('meeting-checkpoint:')),
   '50-group summaries must no longer create new memory records');
 const rows=d.messages.filter(m=>m.mode==='meeting'&&m.meeting_id===mid);
 assert.equal(rows.length,102);
 // Reuse the real grouping/hash functions, not the mocked array's order.
 const srcPart=src.slice(src.indexOf('  function completedMeetingGroups('),src.indexOf('  function validMeetingCheckpoints('));
 const getFns=new Function('messagesOf','isChatArtifact',srcPart+
   '\nreturn {completedMeetingGroups,meetingBlockSignature};');
 const helpers=getFns((pid,cid)=>d.messages.filter(m=>m.profile_id===pid&&m.character_id===cid),()=>false);
 const groups=helpers.completedMeetingGroups(p.id,pair.characterId,mid);
 assert.equal(groups.length,51);
 const historical={
   profile_id:p.id,character_id:pair.characterId,meeting_id:mid,block_index:1,
   round_start:1,round_end:50,started_at:rows[0].created_at,ended_at:rows[99].created_at,
   source_signature:helpers.meetingBlockSignature(groups.slice(0,50)),summary:'曾经在公园长椅谈起祖母赠送的铜钥匙。',
   keywords:['铜钥匙'],details:['书包里的铜钥匙'],key_dialogues:[],
   message_ids:groups.slice(0,50).flat().map(x=>x.id),participants:['Test','Carlos'],created_at:new Date().toISOString()
 };
 pack.data.meetingCheckpoints=[historical];e.importData(JSON.stringify(pack));
 const preview=e.buildPromptPreview(p.id,pair.characterId,'meeting',{latestText:'铜钥匙在哪里？'});
 const prompt=preview.map(x=>String(x.content||'')).join('\n');
 if(!prompt.includes('历史兼容')){
   const saved=JSON.parse(e.exportData()).data;
   console.error('M11 legacy fixture diagnostic:',JSON.stringify({cp:saved.meetingCheckpoints.length,
     sig:saved.meetingCheckpoints[0]?.source_signature,expected:historical.source_signature,
     hasActive:saved.relations[p.id+'|'+pair.characterId]?.active_meeting_id,
     promptLast:prompt.slice(-450)}));
 }
 assert(prompt.includes('历史兼容'),'legacy 50-group archive must still load');
 assert(prompt.includes('铜钥匙'),'historical detail survives');
 assert(!preview.slice(1).some(x=>String(x.content||'').includes('把铜钥匙藏在书包里')),
   'current scene context condenses after source-checked old archive');
 const edited=JSON.parse(e.exportData());
 edited.data.messages.find(m=>m.id===historical.message_ids[0]).text='原本的铜钥匙情节已经修改';
 e.importData(JSON.stringify(edited));
 const stale=e.buildPromptPreview(p.id,pair.characterId,'meeting',{latestText:'铜钥匙'});
 assert(!stale[0].content.includes('历史兼容'),'edited original invalidates stale legacy checkpoint');
 console.log('M11: retired automatic 50-group summaries; previously saved 50-group archives remain readable and source-validated.');
})().catch(e=>{console.error(e);process.exitCode=1});
