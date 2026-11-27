const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const offline=read('public/parallel/offline.js'),app=read('public/parallel/app.js');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'));assert.equal(app,read('parallel_src/parallel_ai_date/static/app.js'));
const now=new Date(2026,10,19,8,0).getTime(),since=new Date(2026,10,18,22,0).getTime();
class Clock extends Date{constructor(...x){super(...(x.length?x:[now]))}static now(){return now}}
const store=new Map(),calls=[];let inflight=0,peak=0,failOnce=true,leakOnce=true;
const leak='思维过程：\n\n1. **分析当前情境与对话背景**：\n* 方案A：候选台词|||候选二。\n4. **符合规范**：\n* 语气自然。真实台词。|||第二句。';
function start(){
  const win={};
  const ctx={window:win,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:webcrypto,Date:Clock,JSON,Math,URLSearchParams,TextEncoder,AbortController,console,setTimeout,clearTimeout,fetch:async(url,init)=>{
    const body=JSON.parse(init.body);calls.push(body);inflight++;peak=Math.max(peak,inflight);
    await new Promise(resolve=>setTimeout(resolve,8));inflight--;
    const user=body.messages.find(m=>m.role==='user'&&String(m.content).startsWith('fixture:'))?.content||'';
    if(user==='fixture:failed'&&failOnce){failOnce=false;return {ok:false,status:503,text:async()=>JSON.stringify({error:{message:'mock unavailable'}})}}
    if(user==='fixture:failed'&&leakOnce){leakOnce=false;return {ok:true,status:200,json:async()=>({choices:[{message:{content:leak,reasoning_content:''},finish_reason:'stop'}]})};}
    return {ok:true,status:200,json:async()=>({choices:[{message:{content:user==='fixture:due'?'<think>draft|||candidate</think>Recovered reply.|||Second bubble.':'Recovered reply.|||Second bubble.',reasoning_content:'private analysis'},finish_reason:'stop'}]})};
  }};
  vm.createContext(ctx);vm.runInContext(offline,ctx);return win.ParallelOffline;
}
(async()=>{
  let e=start();
  assert.equal(e.guardChatReasoning(leak),null);
  assert.equal(e.guardChatReasoning('Analysis:\n1. draft|||candidate'),null);
  assert.equal(e.guardChatReasoning('<think>draft|||candidate</think>Hi.|||Bye.'),'Hi.|||Bye.');
  assert.equal(e.guardChatReasoning('<think>draft'),null);
  assert.equal(e.guardChatReasoning('你能说说你的思维过程吗？'),'你能说说你的思维过程吗？');
  assert.equal(e.guardChatReasoning('Analysis: I saw that movie.'),'Analysis: I saw that movie.');
  const pack=JSON.parse(e.exportData()),d=pack.data;
  const profile=id=>({id,name:id,age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'',avatar:'',role_character_id:'',created_at:new Date(since-2000).toISOString()});
  d.profiles=[profile('p1'),profile('p2')];
  const due1=since+30*60000,due2=since+120*60000,due3=since+180*60000;
  function seed(pid,cid,name,due,kind=''){
    const k=pid+'|'+cid,mid='m-'+name;
    d.relations[k]={profile_id:pid,character_id:cid,status:'matched',mode:'chat',updated_at:new Date(since-1000).toISOString()};
    d.messages.push({id:mid,profile_id:pid,character_id:cid,sender:'user',mode:'chat',engine:'human',text:'fixture:'+name,created_at:new Date(since+1000).toISOString()});
    const q=d.queue[k]={pending:[mid],dueAt:due,status:'idle',blocked:false,paused:false,revision:0};
    if(kind){q.status=kind==='interrupted'?'inflight':'paused';q.paused=kind!=='interrupted';q.blocked=q.paused;q.userPaused=kind==='user';q.pending=kind==='interrupted'?[]:[mid];q.dueAt=0;q.scheduledDueAt=due;
      d.taskStates[k+'|chat']={id:'t-'+name,profile_id:pid,character_id:cid,mode:'chat',status:q.status,paused:q.paused,userPaused:q.userPaused,pending_ids:[mid],scheduled_due_at:due,last_error:kind==='error'?{title:'old failure'}:null,attempt:1};}
    return k;
  }
  const a=seed('p1','re-game:leon:re2','due',due1);
  const b=seed('p1','re-game:leon:re4','interrupted',due2,'interrupted');
  const c=seed('p1','re-game:leon:re6','failed',due3,'error');
  const pa=seed('p2','re-game:leon:re2','paused',due3,'user');
  const fu=seed('p2','re-game:leon:re4','future',now+3600000);
  const le=seed('p2','re-game:leon:re6','legacy',0,'error');
  e.importData(JSON.stringify(pack));await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake',model:'mock'});
  e=start(); // reload interrupted queue from saved data
  const first=await e.request('/chat-recover',{openedAt:now,offlineSince:since,session:'reopen-1',profileId:'p1'});
  assert.equal(calls.length,4);assert.equal(peak,2);assert.equal(first.flushed.filter(x=>x.reply).length,3);assert.equal(first.flushed.filter(x=>x.apiError).length,1);
  let saved=JSON.parse(e.exportData()).data;
  const replies=k=>saved.messages.filter(m=>m.profile_id+'|'+m.character_id===k&&m.sender==='ai');
  assert.deepEqual(replies(a).map(m=>Date.parse(m.created_at)),[due1,due1]);
  assert.deepEqual(replies(a).map(m=>m.text),['Recovered reply.','Second bubble.']);
  assert.deepEqual(replies(b).map(m=>Date.parse(m.created_at)),[due2,due2]);
  assert.equal(replies(le)[0].created_at,new Date(now).toISOString());
  assert.equal(saved.queue[pa].pending.length,1);assert.equal(saved.queue[fu].pending.length,1);assert.equal(saved.queue[c].paused,true);
  assert.equal(saved.taskStates[c+'|chat'].scheduled_due_at,due3);
  const log=e.getSystemLogs().find(x=>x.simulated_reply_at===new Date(due1).toISOString());
  assert(log);assert.equal(log.created_at,new Date(now).toISOString());assert(log.request_payload.messages[0].content.includes('2026-11-18 22:30'));
  for(const body of calls)assert.equal(body.messages.filter(m=>m.role==='user'&&String(m.content).startsWith('fixture:')).length,1,'cross-conversation isolation');
  await e.request('/chat-recover',{openedAt:now,offlineSince:since,session:'reopen-1',profileId:'p1'});assert.equal(calls.length,4);
  await e.request('/chat-recover',{openedAt:now,offlineSince:since,session:'reopen-2',profileId:'p1'});assert.equal(calls.length,5);
  saved=JSON.parse(e.exportData()).data;
  assert.equal(replies(c).length,0);
  assert.equal(saved.queue[c].paused,true);
  const rejected=e.getSystemLogs().find(x=>x.raw_content===leak);
  assert(rejected);assert.notEqual(rejected.status,'success');assert.equal(rejected.parsed_content,'');
  assert(!JSON.stringify(saved.messages).includes('候选台词'));
  await e.request('/chat-recover',{openedAt:now,offlineSince:since,session:'reopen-3',profileId:'p1'});assert.equal(calls.length,6);
  saved=JSON.parse(e.exportData()).data;assert.equal(replies(c)[0].created_at,new Date(due3).toISOString());
  assert.equal(replies(pa).length,0);assert.equal(replies(fu).length,0);
  assert(app.includes("await recoverOnOpen(offlineSince)"));assert(app.includes('retry-backlog'));
  console.log('Backlog recovery: scheduled time, two workers, interrupted tasks, errors, pauses, dedupe, and profile isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1});

// Also exercise the orphaned-pause and preflight regression in the existing CI job.
require('./chat-queue-recovery.test.cjs');
