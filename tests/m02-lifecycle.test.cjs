const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..'),source=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(source,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
let now=Date.parse('2026-11-22T08:20:00-08:00'),seq=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const rows=new Map(),calls=[];
const mock=async(_url,opts)=>{
 const payload=JSON.parse(opts.body),system=String(payload.messages?.find(m=>m.role==='system')?.content||'');
 const user=String(payload.messages?.at(-1)?.content||'');
 calls.push({system,messages:payload.messages,format:Boolean(payload.response_format)});
 let content='';
 if(system.includes('你是角色个人日程规划器')){
   content=JSON.stringify({slots:[
     {start:'12:50',end:'18:00',location:'训练营值班区',status:'工作安排',activity:'继续处理工作',scene:'Carlos继续独立完成营地的事务。'},
     {start:'18:00',end:'23:59',location:'宿舍休息区',status:'休息',activity:'整理个人事务',scene:'准备休息。'}
   ]});
 }else if(system.includes('请根据你')&&system.includes('日记')||system.includes('第一人称私密日记')){
   content=JSON.stringify({title:'《真正发生的部分》',weather:'多云',mood:'平静',
     content:'今天确实在露台和 Lin 见过面，我们把热汤喝完了。\n\n原先排好的训练只是一个推演，我不确定是否照计划执行。\n\n除此之外，日常工作仍然有许多要处理的部分。'});
 }else if(payload.response_format){
   // Simulate repeated incomplete JSON meeting recaps. The original transcript
   // must remain authoritative and usable after this failure.
   content='{"summary":"unfinished';
 }else if(system.includes('首次接触由玩家决定')||system.includes('候场')){
   content='Carlos站在露台旁边，认真检查已经凉下来的热汤。';
 }else if(system.includes('面对面')||system.includes('小说模式')){
   content='Carlos放下汤碗，点了点头。你们今天先到这里。';
 }else{
   content='收到，今天晚些时候还要去忙营地的事情。';
 }
 return {ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content},finish_reason:'stop'}]})};
};
function make(){
 const window={};
 vm.runInNewContext(source,{window,localStorage:{getItem:k=>rows.get(k)||null,setItem:(k,v)=>rows.set(k,v)},
 crypto:{randomUUID:()=> 'm02_'+(++seq)},Date:Clock,JSON,Math,TextEncoder,TextDecoder,URLSearchParams,
 AbortController,setTimeout:()=>0,clearTimeout:()=>{},console,fetch:mock});
 return window.ParallelOffline;
}
const cfg={base_url:'https://example.invalid/v1',api_key:'synthetic',model:'mock',auto_translate:false,archive_enabled:false};
async function match(e,pid,cid){
 const pair={profileId:pid,characterId:cid};
 for(let i=0;i<28;i++){
   const swipe=await e.request('/swipe',{...pair,direction:'right'});
   if(swipe.matched)return pair;
 }
 throw Error('Matching did not complete for '+cid);
}
(async()=>{
 let e=make();
 const created=await e.request('/profile',{name:'Test Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']});
 const pid=created.profile.id,cid='re-game:carlos:re3',pair=await match(e,pid,cid);
 await e.request('/settings',cfg);
 // A real SMS is stored before switching; mere "I'm here" must not transition.
 const prior='我在楼下，等会给你开门。';
 const sms=await e.request('/message',{...pair,text:prior});
 assert.equal(sms.mode,'chat');
 let thread=await e.request('/thread?profileId='+pid+'&characterId='+cid);
 assert.equal(thread.relation.mode,'chat');
 const open=await e.request('/mode',{...pair,mode:'meeting',location:'宿舍外廊露台',triggerOpening:false});
 assert.equal(open.mode,'meeting');
 const mid=open.active_meeting_id;
 assert(mid,'meeting ID is required');
 const before=await e.request('/message',{...pair,text:'我们在露台喝完了热汤，这场见面已经发生了。'});
 assert(before.user&&before.reply,'encounter stores original user and assistant turns');
 const start=new Date(thread.relation.meeting_started_at||now).getTime();
 now=Date.parse('2026-11-22T09:51:00-08:00');
 const finished=await e.request('/mode',{...pair,mode:'chat',finalizeMeeting:true});
 assert.equal(finished.meetingRecord.id,mid);
 assert.equal(finished.meetingRecord.ended_at,new Date(now).toISOString());
 thread=await e.request('/thread?profileId='+pid+'&characterId='+cid);
 assert.equal(thread.meetings.length,1,'one finished encounter must produce one card');
 assert(thread.meetings[0].entries.some(x=>x.text.includes('露台喝完了热汤')),'raw meeting survives recap failure');
 assert(thread.messages.some(x=>x.id===sms.user.id),'prior SMS remains archived even though it is not live chat context');
 const meetupCount=thread.meetings[0].entries.length;
 // Three hours later: a new phone conversation must not resume the earlier door scene.
 now=Date.parse('2026-11-22T12:50:00-08:00');
 const newText='现在是中午了，今天小狗好安静呀。';
 const next=await e.request('/message',{...pair,text:newText});
 assert.equal(next.mode,'chat');
 await e.request('/chat-flush',{...pair,force:true});
 const chatCalls=calls.filter(x=>x.system.includes('线下见面结束 → 当前手机聊天'));
 assert(chatCalls.length>0,'model receives the explicit meeting -> SMS boundary');
 const live=chatCalls.at(-1).messages.filter(x=>x.role!=='system').map(x=>String(x.content));
 assert(!live.some(x=>x.includes(prior)),'pre-meeting doorstep SMS is not an immediate post-meeting turn');
 assert(live.some(x=>x.includes(newText)),'actual latest SMS stays in prompt');
 assert(chatCalls.at(-1).system.includes('露台喝完了热汤'),'archived raw scene is available when summary fails');
 const monitor=await e.request('/surveillance',pair);
 assert(monitor.unlockedSlots.some(x=>x.source==='meeting'&&x.meeting_id===mid),'meeting overrides prior schedule');
 assert(monitor.current.source==='meeting_shift'&&monitor.current.is_planned,
   'future routine is a projection, not a confirmed scene');
 assert(!monitor.current.isMeetingLive,'meeting no longer remains active');
 // Midnight rollover and diary; planned location cannot become asserted evidence.
 now=Date.parse('2026-11-23T01:30:00-08:00');
 const diary=await e.request('/diary',{...pair,date:'2026-11-22'});
 assert(diary.diary&&diary.diary.content);
 const diaryCalls=calls.filter(x=>x.system.includes('第一人称私密日记'));
 assert(diaryCalls.length>0,'real yesterday diary generated');
 const diaryPayload=JSON.stringify(diaryCalls.at(-1).messages);
 assert(diaryPayload.includes('【已确认的现场足迹'));
 assert(diaryPayload.includes('露台喝完了热汤'));
 assert(diaryPayload.includes('计划与模型推演'));
 assert.equal(diary.diary.date,'2026-11-22');
 const persisted=JSON.parse(e.exportData()).data;
 const raw=persisted.messages.filter(x=>x.profile_id===pid&&x.character_id===cid&&x.meeting_id===mid);
 assert(raw.some(x=>x.text.includes('热汤')));
 assert.equal(persisted.meetings.find(x=>x.id===mid).entries.length,meetupCount);
 const jsonBackup=e.exportData();
 // Simulate reload on the same origin; the saved data should not re-create
 // another meeting card, delete memories or silently replace the diary.
 e=make();
 const loaded=await e.request('/thread?profileId='+pid+'&characterId='+cid);
 assert.equal(loaded.meetings.length,1);
 assert(loaded.messages.some(x=>x.id===sms.user.id));
 assert(loaded.messages.some(x=>x.text===newText));
 assert.equal(loaded.meetings[0].entries.length,meetupCount);
 assert.equal((await e.request('/diary',{...pair,date:'2026-11-22'})).diary.content,diary.diary.content);
 assert.equal(e.exportData().includes('露台喝完了热汤'),true);
 // Another Profile does not inherit the private scene or meeting state.
 const p2=(await e.request('/profile',{name:'Other Profile',age:26,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
 const other=await match(e,p2.id,cid);
 const separate=await e.request('/thread?profileId='+other.profileId+'&characterId='+other.characterId);
 assert.equal(separate.meetings.length,0);
 assert(!JSON.stringify(separate.messages).includes('热汤'));
 assert(!JSON.stringify(separate.messages).includes(newText));
 assert(JSON.parse(jsonBackup).data.messages.some(x=>x.id===sms.user.id),'backup retains original SMS');
 console.log('M02 C-17 lifecycle: match > SMS > manual meeting > raw archive > recap failure > post-meeting SMS > replanned monitoring > next-day diary > reload > Profile isolation passed.');
})().catch(err=>{console.error(err);process.exitCode=1;});