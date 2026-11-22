const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
const ui=fs.readFileSync(path.join(root,'public/parallel/app.js'),'utf8');
assert.equal(source,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
assert.equal(ui,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/app.js'),'utf8'));
new Function(source);new Function(ui);
let now=Date.parse('2026-11-22T13:05:00-08:00');
class Clock extends Date{
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
}
const meetingEnd='2026-11-22T17:51:00.000Z',meetingId='meeting-carlos-85';
const p={id:'lin-surveillance',name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'',avatar:'',role_character_id:'',created_at:'2026-11-20T10:00:00.000Z'};
const cid='re-game:carlos:re3',pair={profileId:p.id,characterId:cid},key=p.id+'|'+cid;
const msg=(id,mode,sender,text,when)=>({id,profile_id:p.id,character_id:cid,mode,sender,engine:sender==='user'?'human':'live',text,created_at:when,meeting_id:mode==='meeting'?meetingId:''});
const messages=[
  msg('scene-a','meeting','user','我们已经在宿舍外廊露台吃完了热汤。','2026-11-22T17:20:00.000Z'),
  msg('scene-b','meeting','ai','Carlos整理好衣服，答应晚些时候回营地，之后才再联系Lin。','2026-11-22T17:45:00.000Z'),
  msg('scene-c','meeting','user','今天见面先到这里，晚点手机聊。','2026-11-22T17:50:00.000Z'),
  msg('chat-a','chat','user','今天小狗好安静啊。','2026-11-22T20:50:00.000Z'),
  msg('chat-b','chat','ai','待会我还有自己的事，晚些再找你。','2026-11-22T20:52:00.000Z')
];
const meeting={id:meetingId,profile_id:p.id,character_id:cid,started_at:'2026-11-22T06:38:00.000Z',ended_at:meetingEnd,finished_at:meetingEnd,
  location:'宿舍外廊露台',summary:'本次见面原文已完整保存，剧情小结尚未生成成功；可点击「重新整理整场梗概」补全。',
  ai_summary:'',message_ids:messages.slice(0,3).map(x=>x.id),
  entries:messages.slice(0,3).map(x=>({id:x.id,sender:x.sender,text:x.text,created_at:x.created_at}))};
const initialSurv={byDate:{'2026-11-22':{
  date:'2026-11-22',profile_id:p.id,character_id:cid,engine:'demo',updated_at:meetingEnd,
  post_meeting_anchor:meetingEnd,post_meeting_location:'宿舍外廊露台',post_meeting_id:meetingId,
  slots:[
    {id:'meeting-historical',start:'00:00',end:'09:51',location:'宿舍外廊露台',status:'线下见面足迹',activity:'与 Lin 当面见面',scene:'真实见面',source:'meeting',meeting_id:meetingId},
    {id:'slot_meeting_shift_'+meetingId+'_591',start:'09:51',end:'23:59',location:'宿舍外廊露台',status:'见面后安排待定',activity:'刚结束见面，尚未确认离开当前地点',scene:'角色仍在露台',source:'meeting_shift',meeting_id:meetingId}
  ]
}}};
function makeEngine(failOnce=false){
  const calls=[],storage=new Map(),win={};let attempted=0;
  const fetchMock=async(url,opts)=>{
    const data=JSON.parse(opts.body),system=data.messages.find(x=>x.role==='system')?.content||'';
    if(!system.includes('你是角色个人日程规划器'))throw Error('Unexpected model call: '+system.slice(0,120));
    calls.push(data);attempted++;
    let content=JSON.stringify({slots:[
      {start:'13:05',end:'18:00',location:'U.B.C.S.训练区',status:'返回工作',activity:'结束休息准备训练',scene:'Carlos回到自己的工作与队友之间。'},
      {start:'18:00',end:'23:59',location:'营地休息区',status:'休息整理',activity:'与同伴吃饭整理装备',scene:'他处理完今天的工作，回住处休整。'}
    ]});
    if(failOnce&&attempted===1)content='{"slots":['; // HTTP 200 but invalid JSON
    return {ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content},finish_reason:'stop'}]})};
  };
  vm.runInNewContext(source,{
    window:win,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
    crypto:require('node:crypto').webcrypto,Date:Clock,URLSearchParams,JSON,Math,TextEncoder,TextDecoder,
    AbortController,setTimeout,clearTimeout,console,fetch:fetchMock
  });
  const engine=win.ParallelOffline;
  const pack=JSON.parse(engine.exportData());
  pack.data.profiles=[p];
  pack.data.relations[key]={profile_id:p.id,character_id:cid,status:'matched',mode:'chat',active_meeting_id:'',updated_at:meetingEnd};
  pack.data.messages=messages;
  pack.data.meetings=[meeting];
  pack.data.surveillance=initialSurv;
  pack.data.connection.base_url='https://mock.example/v1';
  pack.data.connection.api_key='mock-no-real-requests';
  pack.data.connection.model='mock';
  pack.data.connection.auto_translate=false;
  engine.importData(JSON.stringify(pack));
  return {engine,calls};
}
(async()=>{
  // Saved iPhone data from the reported broken state: 09:51 placeholder still
  // current at 13:05. A normal read, not just a manual refresh, must repair it.
  const a=makeEngine();
  await a.engine.request('/settings',{base_url:'https://mock.example/v1',api_key:'fake',model:'mock',auto_translate:false});
  const actual=await a.engine.request('/surveillance',pair);
  const diagnostic=JSON.parse(a.engine.exportData()).data;
  console.log('POST-MEETING DEBUG',JSON.stringify({mode:(await a.engine.request('/settings',{})).mode,current:actual.current,stored:diagnostic.surveillance[key]?.byDate?.['2026-11-22']?.post_meeting_id,anchor:diagnostic.surveillance[key]?.byDate?.['2026-11-22']?.post_meeting_anchor,rec:diagnostic.meetings[0]?.ended_at,engine:actual.engine,error:actual.bgError,calls:a.calls.length}).slice(0,1600));
  assert.equal(a.calls.length,1,'open surveillance automatically triggers missing replan');
  const prompt=JSON.stringify(a.calls[0].messages);
  assert(prompt.includes('晚些时候回营地'),'actual ending is visible when summary API failed');
  assert(prompt.includes('待会我还有自己的事'),'post-meeting SMS informs the planner');
  assert(prompt.includes('13:05'),'recovery uses current wall clock, not old 09:51 time');
  assert.equal(actual.current.location,'U.B.C.S.训练区');
  assert.equal(actual.current.is_planned,true,'forecast clearly labeled rather than confirmed movement');
  assert(actual.unlockedSlots.some(x=>x.source==='meeting'&&x.location==='宿舍外廊露台'),'historic meeting still present');
  const orig=JSON.parse(a.engine.exportData()).data;
  assert.equal(orig.messages.length,messages.length);
  assert.equal(orig.meetings[0].entries.length,meeting.entries.length);
  await a.engine.request('/surveillance',pair);
  assert.equal(a.calls.length,1,'no repeated paid model calls when plan is current');
  // An additional SMS after the plan should trigger a new forecast after a
  // cooldown, rather than silently ignoring all subsequent conversation.
  const changed=JSON.parse(a.engine.exportData());
  changed.data.messages.push(msg('chat-c','chat','user','晚上如果要加班就记得带好装备。','2026-11-22T21:06:00.000Z'));
  a.engine.importData(JSON.stringify(changed));
  now=Date.parse('2026-11-22T13:26:00-08:00');
  await a.engine.request('/surveillance',pair);
  assert.equal(a.calls.length,2,'new SMS after cooldown updates remaining itinerary');
  assert(JSON.stringify(a.calls[1].messages).includes('晚上如果要加班'),'new chat included in replan');
  // A provider failure should not be mistaken for a completed replan, nor
  // should repeated modal opens immediately burn tokens.
  now=Date.parse('2026-11-22T13:05:00-08:00');
  const b=makeEngine(true);
  await b.engine.request('/settings',{base_url:'https://mock.example/v1',api_key:'fake',model:'mock',auto_translate:false});
  const failed=await b.engine.request('/surveillance',pair);
  assert.equal(b.calls.length,1);
  assert.equal(failed.current.is_unconfirmed,true,'legacy placeholder is labeled unconfirmed after a failed retry');
  assert(failed.bgError,'a failed replan has a visible diagnostic');
  await b.engine.request('/surveillance',pair);
  assert.equal(b.calls.length,1,'failed replan respects retry cooldown');
  now+=3*60000;
  const recovered=await b.engine.request('/surveillance',pair);
  assert.equal(b.calls.length,2,'a later normal open automatically retries');
  assert.equal(recovered.current.is_planned,true);
  assert.equal(recovered.current.location,'U.B.C.S.训练区');
  assert(!recovered.bgError,'successful replan clears its background error');
  assert(ui.includes('日程推演')&&ui.includes('去向待核实'),'surveillance UI distinguishes projections from proof');
  console.log('Post-meeting surveillance: old stuck save recovers, scene+SMS grounding, cooldown/retry, independent schedule, safe archive and projection badges passed.');
})().catch(e=>{console.error(e);process.exitCode=1});