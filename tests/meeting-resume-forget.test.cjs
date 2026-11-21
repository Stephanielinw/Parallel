const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read('public/parallel/offline.js'),ui=read('public/parallel/app.js');
assert.equal(src,read('parallel_src/parallel_ai_date/static/offline.js'));
assert.equal(ui,read('parallel_src/parallel_ai_date/static/app.js'));
new Function(src);new Function(ui);
const saved=new Map();let seq=0,now=Date.parse('2026-11-21T09:29:00-08:00'),answer='Leon 看了看她，接着说道：好。';const requests=[];
class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
const mock=async(url,opts)=>{const body=JSON.parse(opts.body);requests.push(body);const response=body.response_format?JSON.stringify({summary:'先在警局见面，之后交谈，电影之前约定稍后继续。'}):answer;return {ok:true,status:200,json:async()=>({choices:[{message:{content:response},finish_reason:'stop'}]})};};
function make(){const window={};vm.runInNewContext(src,{window,localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},crypto:{randomUUID:()=> 'id'+(++seq)},URLSearchParams,Date:Clock,JSON,Math,TextEncoder,AbortController,setTimeout:()=>0,clearTimeout:()=>{},console,fetch:mock});return window.ParallelOffline;}
(async()=>{
 let app=make(),p=(await app.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
 const cid='re-game:leon:re2',pair={profileId:p.id,characterId:cid},threadUri='/thread?profileId='+p.id+'&characterId='+cid;
 for(let n=0;n<20;n++)if((await app.request('/swipe',{...pair,direction:'right'})).matched)break;
 await app.request('/settings',{base_url:'https://example.com/v1',api_key:'fake',model:'mock',auto_translate:false});
 const first=await app.request('/mode',{...pair,mode:'meeting',location:'公寓',triggerOpening:false});
 assert(first.active_meeting_id);
 const original=await app.request('/message',{...pair,text:'第一场的事实：去看电影。'});
 assert(original.user&&original.reply);
 const firstMsgId=original.user.id;
 now+=3600000;
 const finished=await app.request('/mode',{...pair,mode:'chat',finalizeMeeting:true});
 assert.equal(finished.meetingRecord.id,first.active_meeting_id);
 const second=await app.request('/mode',{...pair,mode:'meeting',location:'警局',triggerOpening:false});
 answer='警局的错误第二场内容，应当消失。';
 const unwanted=await app.request('/message',{...pair,text:'误开的第二场，不要记住。'});
 now+=60000;
 await app.request('/mode',{...pair,mode:'chat',finalizeMeeting:true});
 let thread=await app.request(threadUri);
 assert.equal(thread.meetings.length,2,'the unintended second meeting is a separate card');
 // The explicit delete must erase all messages belonging to only the mistaken card.
 const removal=await app.request('/meeting-forget',{...pair,meetingId:second.active_meeting_id});
 assert(removal.ok&&removal.removedIds.includes(unwanted.user.id));
 thread=await app.request(threadUri);
 assert.equal(thread.meetings.length,1,'whole-card deletion removes the accidental card');
 assert(!JSON.stringify(thread).includes('误开的第二场，不要记住'),'deleted text cannot survive in archived records');
 assert(!JSON.stringify(thread).includes('警局的错误第二场内容'),'deleted AI text must also vanish');
 // Reopen the original meeting with its existing ID; do not charge for a fresh opener.
 const before=requests.length;
 const resumed=await app.request('/mode',{...pair,mode:'meeting',resumeMeetingId:first.active_meeting_id,triggerOpening:false});
 assert.equal(resumed.active_meeting_id,first.active_meeting_id);
 assert.equal(requests.length,before,'resuming must not auto generate a new first scene');
 thread=await app.request(threadUri);
 assert.equal(thread.relation.meeting_started_at,new Date(Date.parse('2026-11-21T09:29:00-08:00')).toISOString());
 const continuation=await app.request('/message',{...pair,text:'接回第一场的新事实：继续看电影。'});
 assert(continuation.reply);
 thread=await app.request(threadUri);
 assert.equal(thread.meetings.length,1,'reopened sessions remain a single record');
 assert(thread.meetings[0].entries.some(x=>x.id===firstMsgId),'early turns remain intact');
 assert(thread.meetings[0].entries.some(x=>x.id===continuation.user.id),'new turns join the old card');
 assert.equal(thread.meetings[0].started_at,new Date(Date.parse('2026-11-21T09:29:00-08:00')).toISOString());
 // Hard delete one early message and ensure its contents disappear from archived memories.
 const forgotten=await app.request('/message-forget',{...pair,messageId:firstMsgId});
 assert(forgotten.ok);
 thread=await app.request(threadUri);
 assert(!thread.messages.some(x=>x.id===firstMsgId));
 assert(!JSON.stringify(thread.meetings).includes('第一场的事实：去看电影。'));
 const memory=await app.request('/memories?profileId='+p.id+'&characterId='+cid);
 assert(!JSON.stringify(memory.memories||[]).includes('第一场的事实：去看电影。'));
 assert(thread.meetings[0].entries.some(x=>x.id===continuation.user.id),'other meeting content retained');
 assert(ui.includes('继续这次见面'));
 assert(ui.includes('删除整场见面与关联记忆'));
 assert(ui.includes('永久删除此段'));
 assert(ui.includes("if(a==='resume-meeting')"));
 assert(src.includes("case '/meeting-forget':")&&src.includes("case '/message-forget':"));
 assert(read('parallel_src/parallel_ai_date/server.py').includes("if route=='/api/meeting-forget':"));
 console.log('Reopen archived meeting ID, preserve start time, delete mistaken card, permanently forget a turn, and keep independent cards passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
