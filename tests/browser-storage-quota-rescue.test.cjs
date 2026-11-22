const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(source,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
new Function(source);
const KEY='parallel-portable-v2';
let ids=0;
function localStore(seed='',maxLength=Infinity,blocked=false){
 const memory=new Map(seed?[[KEY,seed]]:[]);
 return {
   memory,
   getItem:k=>memory.has(k)?memory.get(k):null,
   setItem:(k,v)=>{
     if(blocked)throw Error('QuotaExceededError');
     const sum=[...memory.entries()].reduce((s,[a,b])=>s+(a===k?0:b.length),0)+String(v).length;
     if(sum>maxLength)throw Error('QuotaExceededError');
     memory.set(k,String(v));
   }
 };
}
function start(store,decoder=true){
 const win={};
 vm.runInNewContext(source,{
   window:win,localStorage:store,
   crypto:{randomUUID:()=>'storage-test-'+(++ids)},
   TextEncoder,TextDecoder:decoder?TextDecoder:undefined,
   Date,URLSearchParams,Math,JSON,console,setTimeout,clearTimeout,AbortController,
   fetch:async()=>{throw Error('no network allowed')}
 });
 return win.ParallelOffline;
}
(async()=>{
 const s=localStore();
 const seedEngine=start(s);
 const profile=(await seedEngine.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
 const pair={profileId:profile.id,characterId:'re-game:leon:re6'};
 for(let i=0;i<30;i++)if((await seedEngine.request('/swipe',{...pair,direction:'right'})).matched)break;
 const meeting=(await seedEngine.request('/mode',{...pair,mode:'meeting',location:'安全屋',triggerOpening:false})).active_meeting_id;
 const baseline=JSON.parse(seedEngine.exportData()).data;
 const statement='这是一场应该完整保留的对话。Leon回答Lin，窗外有夜风，现场已经换到了安全屋里的卧室。🐕‍🦺';
 const messages=Array.from({length:620},(_,i)=>({
   id:'qmsg-'+i,profile_id:profile.id,character_id:pair.characterId,meeting_id:meeting,
   sender:i%2?'ai':'user',mode:'meeting',engine:i%2?'live':'human',
   text:statement.repeat(13)+'【'+i+'】',created_at:new Date(Date.parse('2026-11-22T10:00:00Z')+i*55000).toISOString()
 }));
 baseline.messages.push(...messages);
 const archived={id:meeting,profile_id:profile.id,character_id:pair.characterId,location:'安全屋卧室',
   started_at:messages[0].created_at,ended_at:messages.at(-1).created_at,
   summary:'Lin和Leon在安全屋相处，约定稍后一起离开。',ai_summary:'Lin和Leon在安全屋相处，约定稍后一起离开。',
   message_ids:messages.map(x=>x.id),entries:messages.map(m=>({id:m.id,sender:m.sender,text:m.text,created_at:m.created_at})),location_history:[]};
 baseline.meetings.push(archived);
 baseline.episodicMemories.push({
   id:'memory:'+meeting,owner_id:pair.characterId,profile_id:profile.id,
   source_key:'meeting:'+meeting,source_type:'meeting_summary',summary:archived.summary,tags:['安全屋'],
   event_at:archived.ended_at,meeting_data:JSON.parse(JSON.stringify(archived)),raw_msg_ids:messages.map(x=>x.id)
 });
 const legacy=JSON.stringify(baseline);
 assert(legacy.length>650000,'test must start with a genuinely bulky historical save');
 const limit=Math.ceil(legacy.length*.72);
 const recoveredStorage=localStore(legacy,limit);
 const engine=start(recoveredStorage);
 assert(engine.storageAvailable,'automatic migration should reclaim room, not strand the loaded save');
 const compact=recoveredStorage.getItem(KEY);
 assert(compact.startsWith('PARALLEL-LZW14-V1:'),'big browser store should be compact');
 assert(compact.length<legacy.length*.7,'substantial lossless size reduction');
 const backup=JSON.parse(engine.exportData()).data;
 assert.equal(backup.messages.length,baseline.messages.length,'all original chat messages preserved');
 assert.equal(backup.messages.at(-1).text,messages.at(-1).text,'Chinese and emoji transcript exactly preserved');
 assert.equal(backup.meetings.at(-1).entries.at(-1).text,messages.at(-1).text,'archived full meeting entries preserved');
 assert.equal(backup.episodicMemories.at(-1).meeting_data.entries.at(-1).text,messages.at(-1).text,'memory archive preserved');
 const thread=await engine.request('/thread?profileId='+profile.id+'&characterId='+pair.characterId);
 assert(thread.messages.some(x=>x.id===messages.at(-1).id),'opening chat works after low-quota migration');
 const reopened=start(recoveredStorage);
 assert.equal(JSON.parse(reopened.exportData()).data.messages.at(-1).text,messages.at(-1).text,'reload of compressed archive stays accurate');
 const blockedStorage=localStore(legacy,limit,true);
 const blocked=start(blockedStorage);
 const loaded=await blocked.request('/bootstrap');
 assert(loaded.profiles.some(x=>x.id===profile.id),'read-only bootstrap works on quota exception');
 const read=await blocked.request('/thread?profileId='+profile.id+'&characterId='+pair.characterId);
 assert.equal(read.messages.at(-1).text,messages.at(-1).text,'chat reads do not depend on write succeeding');
 assert.equal(blockedStorage.getItem(KEY),legacy,'failed compression write leaves authoritative legacy copy untouched');
 assert.equal(JSON.parse(blocked.exportData()).data.messages.at(-1).text,messages.at(-1).text,'emergency backup is available while quota blocked');
 // Mutation errors must still reach the user; no silent loss of new messages.
 await assert.rejects(()=>blocked.request('/hot-chat',{...pair,hotChat:true}),/浏览器本地空间不足或禁止保存/);
 // Even a browser without compression codecs should be able to read old JSON.
 const oldBrowser=start(localStore(legacy,limit,true),false);
 assert.equal((await oldBrowser.request('/thread?profileId='+profile.id+'&characterId='+pair.characterId)).messages.length,baseline.messages.length);
 console.log('Quota rescue: legacy migration, byte-for-byte Chinese/emoji archive, reload, read-only recovery, backup access and write-error visibility passed.');
})().catch(e=>{console.error(e);process.exitCode=1});