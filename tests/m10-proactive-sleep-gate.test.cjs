const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const runtime=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(runtime,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
const from=runtime.indexOf('  function proactiveQuietReason(');
const to=runtime.indexOf('  function chatClockContext(',from);
assert(from>0&&to>from,'M10 pure proactive guards must compile into canonical runtime');
const f=new Function(runtime.slice(from,to)+'; return {proactiveQuietReason,proactiveTimeContradiction};')();
const local=(hour,minute=0)=>new Date(2026,10,24,hour,minute).getTime();
const msg=(text,at,mode='chat')=>({
 id:'synthetic-'+text,profile_id:'test-profile',character_id:'re-game:leon:re2',
 sender:'user',mode,engine:'human',text,created_at:new Date(at).toISOString()
});
const midnight=local(0,11);
for(const t of [local(23,50),local(0,0),midnight,local(7,59)]){
 assert.equal(f.proactiveQuietReason([],t),'overnight-quiet-hours','all overnight time windows are quiet');
}
assert.equal(f.proactiveQuietReason([],local(8)),'','automatic morning delivery may resume');
assert.equal(f.proactiveQuietReason([],midnight,true),'','manual request explicitly bypasses automatic quiet hours');
assert(f.proactiveTimeContradiction('太阳都快升到头顶了，你还没起床？',midnight));
assert(f.proactiveTimeContradiction('大白天了，不会还在睡吧',midnight));
assert(!f.proactiveTimeContradiction('改天中午可以一起吃饭',midnight),'future plans are not time claims');
assert(!f.proactiveTimeContradiction('太阳都快升到头顶了',local(12)),'actual noon is not midnight');
const afternoon=local(14), bedtime=local(12,30);
const goodnight=[
 msg('今天任务完成啦',local(12,22)),
 msg('我准备大睡特睡了',bedtime),
 msg('嘿嘿',local(12,31))
];
assert.equal(f.proactiveQuietReason(goodnight,afternoon),'recent-explicit-sleep',
 'A final innocuous bubble must not hide the preceding clear intent to sleep');
assert.equal(f.proactiveQuietReason([...goodnight,msg('醒了！',local(13,55))],afternoon),'',
 'Explicit wake-up after rest cancels the daytime sleep guard');
assert.equal(f.proactiveQuietReason(goodnight,local(18)),'',
 'A past sleep intent cannot block the same character forever');
assert.equal(f.proactiveQuietReason([msg('晚上想聊电影',local(13))],afternoon),'',
 'A future-evening conversation is not an immediate bedtime');
assert.equal(f.proactiveQuietReason([msg('我准备大睡特睡了',local(13),'meeting')],afternoon),'',
 'Meeting narration cannot be mistaken for a fresh chat sleep request');

function harness(clock,rows=[]){
 class FakeDate extends Date{
   constructor(...args){super(...(args.length?args:[clock]));}
   static now(){return clock}
 }
 const storage=new Map(),win={};let network=0;
 const ls={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,String(v))};
 vm.runInNewContext(runtime,{window:win,localStorage:ls,Date:FakeDate,JSON,Math,
   crypto:webcrypto,TextEncoder,TextDecoder,URLSearchParams,AbortController,
   setTimeout,clearTimeout,console,fetch:async()=>{network++;throw Error('M10 must not contact a real model')}});
 const engine=win.ParallelOffline;
 const pack=JSON.parse(engine.exportData());
 const pid='m10-synthetic-profile',cid='re-game:leon:re2',pair=pid+'|'+cid;
 pack.data.profiles=[{id:pid,name:'Test',age:25,gender:'female',interested_in:['all'],
   min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'朋友',avatar:'',
   role_character_id:'',created_at:new Date(clock-2*86400000).toISOString()}];
 pack.data.relations[pair]={profile_id:pid,character_id:cid,status:'matched',mode:'chat',
   active_meeting_id:'',updated_at:new Date(clock-2*3600000).toISOString()};
 pack.data.messages=rows.map((m,i)=>({...m,id:'m10-msg-'+i,profile_id:pid,character_id:cid}));
 pack.data.connection.demo_enabled=true;
 engine.importData(JSON.stringify(pack));
 return {engine,pid,cid,storage,networkCalls:()=>network,read:()=>JSON.parse(engine.exportData()).data};
}
(async()=>{
 const bedtimeRows=[msg('到家了',midnight-70*60000),msg('我要去睡觉了',midnight-55*60000),msg('晚安',midnight-54*60000)];
 const night=harness(midnight,bedtimeRows),old=night.read();
 for(const trigger of ['startup','idle']){
   const result=await night.engine.request('/proactive-check',{profileId:night.pid,trigger});
   assert.equal(result.skipped,'overnight-quiet-hours');
   assert.equal(result.sent.length,0);
 }
 assert.deepEqual(night.read().messages,old.messages,'No midnight chat message may be generated');
 assert.equal(night.networkCalls(),0,'Nighttime checks must not call a paid model');
 const day=harness(afternoon,goodnight),before=day.read();
 const ignored=await day.engine.request('/proactive-check',{profileId:day.pid,trigger:'idle'});
 assert.equal(ignored.sent.length,0,'Explicit recent daytime sleep must suppress auto proactive');
 assert.deepEqual(day.read().messages,before.messages);
 const ordinary=harness(afternoon,[msg('今天忙完了',local(12))]);
 const sent=await ordinary.engine.request('/proactive-check',{profileId:ordinary.pid,trigger:'idle'});
 assert.equal(sent.sent.length,1,'Non-sleeping daytime contact must still be allowed');
 const manually=harness(midnight,bedtimeRows);
 const manual=await manually.engine.request('/proactive-check',{profileId:manually.pid,trigger:'manual'});
 assert.equal(manual.sent.length,1,'User-initiated manual check must still work at midnight');
 assert.equal(manually.networkCalls(),0,'All M10 regression cases use mock demo mode');
 const py=fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/server.py'),'utf8');
 assert(py.includes('def proactive_quiet_reason('),'Python local server requires the same quiet guard');
 assert(py.includes('def proactive_time_contradiction('),'Python local server requires no-noon-at-midnight guard');
 assert(py.includes('if proactive_quiet_reason(latest_users,now_ms()):continue'),'Python rechecks after LLM');
 assert(runtime.includes("skipped:'conversation-changed'"),'Browser must drop stale background responses');
 console.log('M10: overnight + user bedtime + clock mismatch + stale-response gates verified, no model calls or personal data.');
})().catch(e=>{console.error(e);process.exitCode=1});
