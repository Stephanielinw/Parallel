const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.resolve(__dirname,'..'),src=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(src,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
let now=Date.parse('2026-11-20T17:00:00Z'),i=0,fail=true,calls=[];
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const storage=new Map(),window={};
vm.runInNewContext(src,{window,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},crypto:{randomUUID:()=> 'id'+(++i)},Date:Clock,URLSearchParams,TextEncoder,AbortController,setTimeout:()=>0,clearTimeout:()=>{},console,
 fetch:async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push(body);
  const data=JSON.parse(body.messages.at(-1).content);
  const rec={title:'旧情节',summary:'基于原文归档',relatedPeople:[],keywords:['测试'],keyInformation:['对话事实'],emotionalMemory:'情绪未确认',evidenceMessageIds:[data.records[0].id]};
  return {ok:true,status:200,json:async()=>({choices:[{message:{content:fail?'{"title":':JSON.stringify(rec)},finish_reason:'stop'}]})};
 }});
const e=window.ParallelOffline,pack=JSON.parse(e.exportData()),d=pack.data,cid='re-game:leon:re6',p1='p1',p2='p2';
const profile=id=>({id,name:id,age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'',avatar:'',role_character_id:'',created_at:new Date(now).toISOString()});
const row=(id,pid,h)=>({id,profile_id:pid,character_id:cid,sender:'user',mode:'chat',text:'原文 '+id,engine:'human',created_at:new Date(now-h*3600000).toISOString()});
d.profiles=[profile(p1),profile(p2)];for(const pid of [p1,p2])d.relations[pid+'|'+cid]={profile_id:pid,character_id:cid,status:'matched',mode:'chat',hot_chat:true,updated_at:new Date(now).toISOString()};
const old=row('old',p2,48),other=row('other',p1,8),recent=row('recent',p1,1);
d.messages=[old,other,recent];
d.episodeArchive={since:now,jobs:[{owner_id:cid,profile_id:p2,source_key:'episode:old',signature:e.episodeSignature([old]),status:'failed',attempts:2,retry_at:now-1000,error:'previous error'}],deleted:[]};
d.queue[p1+'|'+cid]={pending:['recent'],paused:true,blocked:true,status:'paused'};
(async()=>{
  e.importData(JSON.stringify(pack));
  await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock',archive_mode:'custom'});
  let r=await e.request('/episode-archive-tick',{profileId:p1});
  assert.equal(r.status,'config');assert.equal(calls.length,0);
  await e.request('/settings',{archive_mode:'inherit'});
  r=await e.request('/episode-archive-tick',{profileId:p1});
  assert.equal(r.status,'failed');assert.equal(calls.length,1);
  assert.equal(JSON.parse(calls[0].messages.at(-1).content).records[0].id,'old');
  assert(r.retryAt>now);assert(r.reason.includes('INVALID_STRUCTURED_JSON'));
  r=await e.request('/episode-archive-tick',{profileId:p1});assert.equal(calls.length,1);
  now=r.retryAt||now+21*60000;fail=false;
  r=await e.request('/episode-archive-tick',{profileId:p1});assert.equal(r.status,'done');assert.equal(r.profileId,p2);
  assert.equal(calls.length,2);
  now+=61000;r=await e.request('/episode-archive-tick',{profileId:p1});assert.equal(r.status,'done');assert.equal(r.profileId,p1);
  const saved=JSON.parse(e.exportData()).data;
  assert.equal(saved.episodicMemories.filter(m=>m.source_type==='episode-summary').length,2);
  assert.equal(saved.messages.length,3);assert.equal(saved.queue[p1+'|'+cid].pending.length,1);
  now+=61000;await e.request('/episode-archive-tick',{profileId:p1});assert.equal(calls.length,3);
  await e.request('/settings',{archive_enabled:false});
  now+=4*3600000;r=await e.request('/episode-archive-tick',{profileId:p1});assert.equal(calls.length,3);
  const mem=await e.request('/memories?profileId='+p1+'&characterId='+cid);
  const pending=mem.memories.find(m=>m.source_type==='episode-pending');
  assert(pending);
  r=await e.request('/memory-action',{profileId:p1,characterId:cid,action:'archive-episode',sourceKey:pending.source_key,signature:pending.signature});
  assert.equal(r.status,'done');assert.equal(calls.length,4);
  console.log('Automatic archive: historical backlog, inactive profiles, paused queues, no Web Locks, retry and optional manual fallback passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
