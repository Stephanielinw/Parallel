const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
process.env.TZ='America/Los_Angeles';
const store=new Map(),calls=[];let n=0,now=new Date(2026,10,20,23,58,0).getTime(),answer='初始见面：他把蓝色雨伞放在椅边。';
let error=false,deferred=null;
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const mock=async(url,opts)=>{const body=JSON.parse(opts.body);calls.push(body);if(deferred)await deferred;
  const text=body.messages[0].content;
  const content=body.response_format?JSON.stringify({location:'屋顶',summary:'在屋顶见面并自然告别。'}):answer;
  return {ok:!error,status:error?503:200,json:async()=>error?{error:{message:'mock outage'}}:{choices:[{message:{content},finish_reason:'stop'}]}};
};
function start(){const window={};vm.runInNewContext(src,{window,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID:()=> 'm'+(++n)},URLSearchParams,Date:Clock,JSON,Math,TextEncoder,AbortController,setTimeout:()=>0,clearTimeout:()=>{},console,fetch:mock});return window.ParallelOffline}

const clockStart=src.indexOf('  function meetingClockContext('),clockEnd=src.indexOf('  // Derived only',clockStart);
const clockHelpers=new Function('chatClockLabel',src.slice(clockStart,clockEnd)+'\nreturn {meetingClockContext,meetingCurrentClockConflict}')(
  t=>{const d=new Date(t);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')+' '+String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');});
const noon=Date.parse('2026-11-24T21:10:00Z'),midnight=Date.parse('2026-11-24T08:20:00Z');
const sceneHistory=[{id:'previous',sender:'ai',created_at:new Date(midnight).toISOString()},{id:'input',sender:'user',created_at:new Date(noon).toISOString()}];
const timeContext=clockHelpers.meetingClockContext({meeting_started_at:'2026-11-24T03:16:00Z'},sceneHistory,noon,0,'input');
assert(timeContext.includes('上一条已发生现场记录：2026-11-24 00:20'));
assert(timeContext.includes('距上一条现场记录 46200 秒'));
assert(timeContext.includes('2026-11-24 13:10'));
assert(timeContext.includes('下午，UTC-08:00'));
assert(clockHelpers.meetingClockContext({},[sceneHistory[1]],noon,0,'input').includes('没有更早的有效现场记录'));
assert.equal(clockHelpers.meetingCurrentClockConflict('他扫了一眼床头柜上的手表。\n\n“十二点半。”',noon),'十二点半');
assert.equal(clockHelpers.meetingCurrentClockConflict('他看了眼手表。“下午一点十分。”',noon),'');
assert.equal(clockHelpers.meetingCurrentClockConflict('他说：“明天十二点半见。”',noon),'');
assert.equal(clockHelpers.meetingCurrentClockConflict('他昨晚十二点半才回来。',noon),'');

(async()=>{
 let e=start();const p=(await e.request('/profile',{name:'Fixture',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
 const cid='re-game:leon:re6',pair={profileId:p.id,characterId:cid},uri='/thread?profileId='+p.id+'&characterId='+cid;
 for(let i=0;i<15;i++)if((await e.request('/swipe',{...pair,direction:'right'})).matched)break;
 await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock',auto_translate:false});
 const started=now;
 const open=await e.request('/mode',{...pair,mode:'meeting',location:'屋顶',triggerOpening:true});
 assert(open.openingReply);const first=open.openingReply;
 assert(JSON.stringify(calls.at(-1)).includes('强制 1:1'));assert(JSON.stringify(calls.at(-1)).includes('本幕距见面开始 0 秒'));
 now+=90000;answer='替代开场：他把围巾折好，朝她点了点头。';
 const rolled=await e.request('/message-regenerate',{...pair,messageId:first.id});
 assert(rolled.ok);assert.equal(rolled.reply.created_at,first.created_at);assert.notEqual(rolled.reply.id,first.id);
 assert(!JSON.stringify(calls.at(-1)).includes('蓝色雨伞'));assert(JSON.stringify(calls.at(-1)).includes('同一幕的替代版本'));
 let thread=await e.request(uri);assert.equal(thread.relation.meeting_started_at,new Date(started).toISOString());assert(!thread.messages.some(m=>m.id===first.id));assert(!JSON.stringify(thread.meetings).includes('蓝色雨伞'));
 error=true;const failed=await e.request('/message-regenerate',{...pair,messageId:rolled.reply.id});assert(!failed.ok);error=false;
 assert((await e.request(uri)).messages.some(m=>m.id===rolled.reply.id));
 answer='思维过程：\n1. 元分析';
 const leak=await e.request('/message-regenerate',{...pair,messageId:rolled.reply.id});assert(!leak.ok);
 answer='第二次替代：他稍微往旁边挪了半步。';
 const again=await e.request('/message-regenerate',{...pair,messageId:rolled.reply.id});assert(again.ok);assert.equal(again.reply.reroll_count,2);
 now+=120000;e=start();thread=await e.request(uri);assert.equal(thread.relation.meeting_started_at,new Date(started).toISOString());
 answer='他听完她的话，笑了一下。';const msg=await e.request('/message',{...pair,text:'你好。',location:'屋顶'});
 assert(msg.reply);assert(JSON.stringify(calls.at(-1)).includes('本幕距见面开始 210 秒'));
 assert(!JSON.stringify(calls.at(-1)).includes('蓝色雨伞'));assert(!JSON.stringify(calls.at(-1)).includes('把围巾折好'));
 let guard=false;try{await e.request('/message-regenerate',{...pair,messageId:again.reply.id})}catch{guard=true}assert(guard);
 now+=30000;
 const closed=await e.request('/mode',{...pair,mode:'chat',finalizeMeeting:true});
 assert.equal(closed.meetingRecord.duration_ms,240000);assert.equal(closed.meetingRecord.started_at,new Date(started).toISOString());assert.equal(closed.meetingRecord.ended_at,new Date(now).toISOString());
 thread=await e.request(uri);assert.equal(thread.meetings[0].duration_ms,240000);
 const pack=JSON.parse(e.exportData()).data;
 const slots=Object.values(pack.surveillance[p.id+'|'+cid].byDate).flatMap(d=>d.slots).filter(s=>s.meeting_id===closed.meetingRecord.id);
 assert(slots.some(s=>s.start==='23:58'&&s.end==='23:59'));assert(slots.some(s=>s.start==='00:00'&&s.end==='00:02'));
 assert(!JSON.stringify(thread.meetings).includes('蓝色雨伞'));
 console.log('Meeting reroll, preserved original on errors, stable wall clock after reload, cross-midnight duration and surveillance passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
