const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read('public/parallel/offline.js');
assert.equal(src,read('parallel_src/parallel_ai_date/static/offline.js'));
new Function(src);
const parse=new Function(src.slice(src.indexOf('  const SCENE_RULES='),src.indexOf('  function currentPlanRows('))+'return {locationFromReport};')();
assert.equal(parse.locationFromReport('我就在你家门口等你。'),'你家门口');
assert.equal(parse.locationFromReport("I'm right outside your door."),'your door');
let now=Date.parse('2026-11-22T22:00:00-08:00'),serial=0;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const storage=new Map(),window={};
vm.runInNewContext(src,{
  window,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
  crypto:{randomUUID:()=> 'm05-'+(++serial)},Date:Clock,JSON,Math,
  URLSearchParams,TextEncoder,AbortController,console,
  setTimeout:()=>0,clearTimeout:()=>{},
  fetch:async()=>{throw Error('No paid model calls allowed');}
});
const e=window.ParallelOffline,cid='re-game:carlos:re3';
const at=(day,h,m)=>new Date(Date.parse('2026-11-22T00:00:00-08:00')+((day-22)*24+h)*3600000+m*60000).toISOString();
const message=(id,pid,sender,text,time,mode='chat',mid='')=>({
  id,profile_id:pid,character_id:cid,sender,text,
  mode,meeting_id:mid,engine:sender==='user'?'human':'live',created_at:time
});
(async()=>{
 const p=(await e.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
 const pair={profileId:p.id,characterId:cid},key=p.id+'|'+cid;
 for(let i=0;i<35;i++)if((await e.request('/swipe',{...pair,direction:'right'})).matched)break;
 const pack=JSON.parse(e.exportData()),d=pack.data;
 for(const ev of d.events||[])if(ev.profile_id===p.id&&ev.character_id===cid)ev.created_at=at(22,15,0);
 d.relations[key].mode='chat';
 d.relations[key].meeting_location='';d.relations[key].meeting_location_history=[];
 const scene=[
  message('m05-plan1',p.id,'user','我们今天五点半去吃晚饭吗？',at(22,16,0)),
  message('m05-plan2',p.id,'ai','好，五点半在餐厅见。',at(22,16,1)),
  message('m05-no-show',p.id,'user','我没去，今晚忙到很晚才回来。',at(22,20,3)),
  message('m05-door',p.id,'ai','我现在在你家门口等你。',at(22,21,58))
 ];
 const filler=Array.from({length:110},(_,i)=>
   message('m05-filler-'+i,p.id,i%2?'ai':'user',
     '角色日常短信往来，天气和工作近况。'.repeat(16),
     new Date(Date.parse(at(22,16,5))+i*60000).toISOString()));
 d.messages.push(...scene.slice(0,2),...filler,...scene.slice(2));
 d.surveillance[key]={byDate:{'2026-11-22':{
  date:'2026-11-22',profile_id:p.id,character_id:cid,engine:'live',slots:[
    {id:'fake1',start:'00:00',end:'17:30',location:'Carlos 的住处',
     status:'休息',activity:'自己的安排',scene:'正常生活',source:'schedule'},
    {id:'fake2',start:'17:30',end:'23:59',location:'Lin 的卧室',
     status:'共同回家',activity:'两人已经一起吃饭回家',
     scene:'Carlos与Lin共进晚餐，已经一起回家躺在卧室里',source:'schedule'}
  ]}}};
 d.episodicMemories.push({
  id:'m05-fake-summary',owner_id:cid,profile_id:p.id,
  source_type:'daily-summary',source_key:'day:2026-11-22',knowledge_mode:'experienced',
  summary:'AI 幻觉：Carlos和Lin已经一起吃饭回家，去了海边旅行。',
  tags:['旅行','海边'],importance:5,emotional_weight:5,unresolved:0,
  event_at:at(22,19,0),created_at:at(22,19,0),raw_msg_ids:['m05-plan1']
 });
 d.episodicMemories.push({
  id:'m05-orphan',owner_id:cid,profile_id:p.id,source_type:'daily-summary',
  source_key:'day:old',knowledge_mode:'experienced',
  summary:'从未发生的婚礼与对白',tags:['婚礼'],importance:5,
  event_at:at(22,15,0),raw_msg_ids:['nonexistent-msg']
 });
 e.importData(JSON.stringify(pack));
 const monitor=await e.request('/surveillance',{...pair,date:'2026-11-22'});
 assert.equal(monitor.current.source,'schedule');
 assert.equal(monitor.current.is_planned,true,
   'elapsed generated itinerary remains a plan, never becomes actual');
 assert(monitor.unlockedSlots.some(x=>x.source==='schedule'&&x.is_planned),
   'historical guessed slots remain marked speculative');
 const conversation=e.buildPromptPreview(p.id,cid,'chat',{latestText:'海边旅行'});
 const prompt=conversation.find(x=>x.role==='system').content;
 assert(prompt.includes('原文证据·摘要仅作检索线索'),'archival memory is provenance-labeled');
 assert(!prompt.includes('AI 幻觉：Carlos和Lin已经一起吃饭回家'),
   'model-created recap must not be elevated into chat prompt');
 assert(!prompt.includes('从未发生的婚礼与对白'),
   'orphan summary with missing source is blocked from prompt');
 assert(prompt.includes('我们今天五点半去吃晚饭吗')||
   prompt.includes('原文未找到'),'primary source is used as actual speech, not event');

 const opened=await e.request('/mode',{...pair,mode:'meeting',triggerOpening:false});
 assert.equal(opened.location,'你家门口','latest character SMS outranks both plan and false monitor');
 assert.equal(opened.surveillance.current.location,'你家门口');
 assert(!String(opened.location).includes('卧室'));
 const meetingPrompt=e.buildPromptPreview(p.id,cid,'meeting',{latestText:''})
   .find(x=>x.role==='system').content;
 assert(meetingPrompt.includes('当前见面地点'));
 assert(meetingPrompt.includes('你家门口'),'opening camera must be grounded in last character report');
 assert(meetingPrompt.includes('进入见面模式不代表对方已到'),
   'the user controls when contact actually occurs');
 assert(!meetingPrompt.includes('Carlos与Lin共进晚餐'),
   'false monitor scene cannot seed the meeting scene');

 // Without location evidence an explicit meeting can start at an uncertain
 // holding location, not teleport to a schedule-selected bedroom.
 const otherPack=JSON.parse(e.exportData()),dd=otherPack.data;
 const rel=dd.relations[key];rel.mode='chat';rel.active_meeting_id='';
 rel.meeting_started_at='';rel.meeting_location='';
 dd.messages=dd.messages.filter(m=>!['m05-plan1','m05-plan2','m05-door'].includes(m.id));
 dd.surveillance[key].byDate['2026-11-22'].slots=[
   {id:'fake3',start:'00:00',end:'23:59',location:'卧室',
    status:'已回家',activity:'一起吃饭回家',scene:'推测',source:'schedule'}
 ];
 e.importData(JSON.stringify(otherPack));
 const uncertain=await e.request('/mode',{...pair,mode:'meeting',triggerOpening:false});
 assert.equal(uncertain.location,'见面地点待确认','no chat evidence => never use schedule');
 assert(!uncertain.location.includes('卧室'));

 // All real messages and the old synthetic archive card survive the change.
 const saved=JSON.parse(e.exportData()).data;
 assert(saved.messages.some(m=>m.id==='m05-no-show'&&m.text.includes('我没去')));
 assert(saved.episodicMemories.some(m=>m.id==='m05-fake-summary'),
   'M05 must not silently delete legacy memory cards');
 console.log('M05: no-show, doorstep opening, speculative timeline labels, source-only memory recall, uncertain fallback, and legacy preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
