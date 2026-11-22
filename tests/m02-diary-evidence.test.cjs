const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..');
const script=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(script,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
let now=Date.parse('2026-11-23T09:30:00-08:00');
class Clock extends Date{constructor(...x){super(...(x.length?x:[now]));}static now(){return now;}}
const calls=[];
const fetch=async(_url,options)=>{
 const data=JSON.parse(options.body),system=String(data.messages[0]?.content||'');
 assert(system.includes('日记'),'unexpected external request: '+system.slice(0,100));
 calls.push(data);
 return {ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:JSON.stringify({
   title:'《只写确认的记录》',weather:'夜风微凉',mood:'清醒',
   content:'我确实在公寓露台与 Lin 见了一面。那是我能够确认的事情。\n\n至于计划中的机场训练，我只知道那曾写在日程上，并没有证据表明我真的去了。\n\n今天还有很多不需要向别人解释的个人事务。我只记下有依据的部分。'
 })},finish_reason:'stop'}]})};
};
const store=new Map(),window={};
vm.runInNewContext(script,{window,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
 crypto:require('node:crypto').webcrypto,Date:Clock,JSON,Math,TextEncoder,TextDecoder,URLSearchParams,AbortController,setTimeout,clearTimeout,console,fetch});
const engine=window.ParallelOffline;
const pid='p-diary',cid='re-game:carlos:re3',pair=pid+'|'+cid,day='2026-11-22';
const p={id:pid,name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'',avatar:'',role_character_id:'',created_at:'2026-11-20T00:00:00Z'};
const scene='我们真的在公寓露台一起喝了热汤。';
const meeting={id:'real-meeting',profile_id:pid,character_id:cid,
 started_at:'2026-11-22T17:10:00.000Z',ended_at:'2026-11-22T17:51:00.000Z',finished_at:'2026-11-22T17:51:00.000Z',
 location:'公寓露台',summary:'',ai_summary:'',message_ids:['real-1'],
 entries:[{id:'real-1',sender:'user',text:scene,created_at:'2026-11-22T17:22:00.000Z'}]};
const pack=JSON.parse(engine.exportData());
pack.data.profiles=[p];
pack.data.relations[pair]={profile_id:pid,character_id:cid,status:'matched',mode:'chat',active_meeting_id:'',updated_at:meeting.ended_at};
pack.data.messages=[
 {id:'real-1',profile_id:pid,character_id:cid,mode:'meeting',meeting_id:meeting.id,sender:'user',engine:'human',text:scene,created_at:'2026-11-22T17:22:00.000Z'},
 {id:'future-claim',profile_id:pid,character_id:cid,mode:'chat',sender:'user',engine:'human',text:'下周准备去冰岛',created_at:'2026-11-22T20:50:00.000Z'}
];
pack.data.meetings=[meeting];
pack.data.surveillance={
 [pair]:{byDate:{[day]:{date:day,profile_id:pid,character_id:cid,engine:'live',
  slots:[
   {id:'fantasy',start:'07:00',end:'09:00',source:'schedule',location:'虚构特训基地',activity:'完成极限任务',scene:'已经完成挑战'},
   {id:'actual',start:'09:10',end:'09:51',source:'meeting',meeting_id:meeting.id,location:'公寓露台',activity:'面对面见面',scene:'一起喝了热汤'},
   {id:'future',start:'10:00',end:'23:59',source:'meeting_shift',meeting_id:meeting.id,is_planned:true,location:'计划中的机场',activity:'下一步计划训练',scene:'只是假设'}
  ]}}}
};
engine.importData(JSON.stringify(pack));
(async()=>{
 const first=await engine.request('/diary',{profileId:pid,characterId:cid,date:day});
 const demo=first.diary;
 assert(demo&&demo.engine==='demo');
 assert(demo.content.includes('公寓露台'),'confirmed meeting must survive in default diary');
 assert(demo.content.includes('计划')&&demo.content.includes('不'),'projected itinerary must be explicitly qualified');
 assert(!demo.content.includes('去了虚构特训基地'),'unverified old schedule may not become completed travel');
 assert(!demo.content.includes('完成极限任务。'), 'old speculative task must not be narrated as accomplished');
 assert(!demo.sourceLocations.includes('虚构特训基地'),'projected location cannot be actual diary footprint');
 assert(demo.sourceLocations.includes('公寓露台'));
 await engine.request('/settings',{base_url:'https://example.invalid/v1',api_key:'mock-key',model:'fixture',auto_translate:false});
 const live=await engine.request('/diary',{profileId:pid,characterId:cid,date:day});
 assert.equal(live.diary.engine,'live');
 assert.equal(calls.length,1,'first live diary generation uses one model call');
 const text=JSON.stringify(calls[0].messages);
 assert(text.includes('已确认的现场足迹'),'AI must receive an observed-only section');
 assert(text.includes('【已发生的线下见面'),'AI must receive original meeting evidence');
 assert(text.includes(scene),'meeting raw transcript must ground diary when summary is absent');
 assert(text.includes('【2026-11-22 计划与模型推演'),'predicted routes must be labeled unverified');
 assert(text.includes('虚构特训基地')&&text.includes('未证实发生'),'projected route tagged as not observed');
 assert(!text.includes('日记主要来源于你这一天的监控行踪'),'old treating-all-slots-as-facts rule must be removed');
 assert(!text.includes('OTHER_PROFILE_PRIVATE'),'no external Profile evidence');
 const second=await engine.request('/diary',{profileId:pid,characterId:cid,date:day});
 assert.equal(calls.length,1,'reopening an existing live diary must never silently regenerate paid content');
 assert.equal(second.diary.content,live.diary.content);
 const backup=JSON.parse(engine.exportData());
 assert(backup.data.meetings[0].entries.some(x=>x.text===scene));
 assert(backup.data.messages.some(x=>x.text===scene));
 assert(backup.data.diaries[pair].byDate[day].content.includes('公寓露台'));
 console.log('M02 C-11 diary: fallback/AI actual-vs-predicted, raw meeting, no phantom completion, persistence, and no surprise paid overwrite passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});