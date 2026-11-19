const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'public/parallel/app.js'),'utf8');
assert.equal(src,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/app.js'),'utf8'));
const helpers=src.slice(src.indexOf('const typingRequests=new Map()'),src.indexOf('async function loadThread(cid'));
const apiSource=src.slice(src.indexOf('const api=async(path,data)=>{'),src.indexOf('const TR_MINOR_TOKENS='));
const harness=new Function('rawApi',`
const state={tab:'messages',activeId:'P1',threadId:'A',chatMode:'chat',queue:{status:'idle'},taskState:null,flushBusy:false,chatBusy:false,revealingBubbles:false};
let renders=0;
function renderMessages(){renders++}
`+helpers+apiSource+`
function select(pid,cid,q='idle',task=null,mode='chat'){
 state.activeId=pid;state.threadId=cid;state.chatMode=mode;state.queue={status:q};state.taskState=task;loadedThreadPair=typingPair(pid,cid);
}
return {state,select,api,isCharacterTyping,setReveal(pid,cid){state.revealingBubbles=true;bubbleRevealPair=typingPair(pid,cid)},clearReveal(){state.revealingBubbles=false;bubbleRevealPair=''},getRenders:()=>renders};
`);
let pending=[];
const h=harness((path,data)=>new Promise((resolve,reject)=>pending.push({path,data,resolve,reject})));
(async()=>{
  const {state,select,api,isCharacterTyping:typing}=h;
  select('P1','A');
  const request=api('/chat-flush',{profileId:'P1',characterId:'A',force:true});
  assert.equal(typing(),true);
  state.flushBusy=true;
  for(const cid of ['B','C','D']){select('P1',cid);assert.equal(typing(),false,cid);}
  select('P2','A');assert.equal(typing(),false,'same canon character, different profile');
  select('P1','A');assert.equal(typing(),true);
  select('P1','B');pending.shift().resolve({});await request;assert.equal(typing(),false);
  select('P1','A');assert.equal(typing(),false,'finished request');
  const scan=api('/chat-flush-due',{profileId:'P1',activeCharacterId:'A'});assert.equal(typing(),false,'background scan does not imply generation');
  select('P1','B','inflight');assert.equal(typing(),true,'real per-pair queue status');
  state.threadId='C';assert.equal(typing(),false,'old queue before new snapshot');
  select('P1','C');pending.shift().resolve({});await scan;assert.equal(typing(),false);
  const passive=api('/proactive-check',{profileId:'P1',characterId:'C',trigger:'idle'});assert.equal(typing(),false);pending.shift().resolve({});await passive;
  h.setReveal('P1','A');select('P1','A');assert.equal(typing(),true);select('P1','B');assert.equal(typing(),false);select('P2','A');assert.equal(typing(),false);h.clearReveal();
  select('P1','A','idle',null,'meeting');
  const meet=api('/message',{profileId:'P1',characterId:'A',text:'hello'});assert.equal(typing(),true);select('P1','B','idle',null,'meeting');assert.equal(typing(),false);pending.shift().reject(Error('mock error'));await assert.rejects(()=>meet);select('P1','A','idle',null,'meeting');assert.equal(typing(),false);
  select('P1','A','paused',{status:'paused'},'meeting');
  const paused=api('/message',{profileId:'P1',characterId:'A',text:'saved only'});assert.equal(typing(),false);pending.shift().resolve({});await paused;
  const retry=api('/task-action',{profileId:'P1',characterId:'A',mode:'meeting',action:'retry'});assert.equal(typing(),true);select('P1','D');assert.equal(typing(),false);pending.shift().resolve({});await retry;
  assert.equal(typing(),false);
  assert(src.includes('if(isCurrentPair(profileId,id)&&hasCurrentThreadSnapshot())'));
  console.log('Per-profile/character typing, stale queue, background scan, pause, retry and reveal isolation passed');
})().catch(e=>{console.error(e);process.exitCode=1});
