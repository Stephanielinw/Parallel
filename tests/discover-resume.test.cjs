const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const src=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
const app=fs.readFileSync(path.join(root,'public/parallel/app.js'),'utf8');
assert.equal(src,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
assert.equal(app,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/app.js'),'utf8'));
const storage=new Map();let uid=0,discoveryCalls=0,shouldFail=false;
const photo='一张人物肖像照，深色外套肩线清晰，室内侧光照亮半边脸，背景是略微虚焦的城市街道与建筑轮廓，神态自然，面向镜头。';
const fetch=async(url,opts)=>{
  const payload=JSON.parse(opts.body),system=payload.messages?.[0]?.content||'';
  let content='';
  if(system.includes('候选人物档案')){
    discoveryCalls++;
    const request=JSON.parse(payload.messages.at(-1).content);
    content=shouldFail?'模型的分析过程：我准备写 JSON':JSON.stringify({profiles:request.kind==='known'?
      request.people.map(c=>({id:c.id,bio:'我喜欢安静的散步，也喜欢认识不同的人。',tags:['认真','可靠'],photo_description:photo})) :[]});
  }else if(system.includes('只输出 JSON 对象 {"match"'))content='{"match":true}';
  else content='很高兴认识你。';
  return {ok:true,status:200,json:async()=>({choices:[{message:{content},finish_reason:'stop'}]})};
};
function start(){
 const win={};
 vm.runInNewContext(src,{window:win,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},
 crypto:{randomUUID:()=> 'uuid'+(++uid)},URLSearchParams,Date,JSON,Math,TextEncoder,AbortController,setTimeout,clearTimeout,console,fetch});
 return win.ParallelOffline;
}
(async()=>{
 let e=start();
 const create=async name=>(await e.request('/profile',{name,age:25,gender:'female',interested_in:['male'],min_age:18,max_age:60,sources:['生化危机']})).profile;
 const p1=await create('Lin'),p2=await create('Other');const pair={profileId:p1.id};
 await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock'});
 const first=await e.request('/discover',pair);
 assert.equal(first.index,0);assert(first.batch_id&&first.candidates.length>=5);
 assert.equal(discoveryCalls,4);
 const ids=first.candidates.map(c=>c.id);
 assert.equal((await e.request('/discover',pair)).batch_id,first.batch_id);
 assert.equal(discoveryCalls,4,'tab revisit should not call model again');
 for(let i=0;i<4;i++){
   const progress=await e.request('/discover-progress',{...pair,batchId:first.batch_id,index:i,characterId:ids[i]});
   assert(progress.ok&&progress.index===i+1);
 }
 const match=await e.request('/swipe',{...pair,characterId:ids[0],direction:'right'});
 assert(match.matched,'first profile should be matched in test fixture');
 let saved=JSON.parse(e.exportData()).data;
 assert.equal(saved.discoverSessions[p1.id].index,4);
 assert.equal(Array.from(saved.discoverSessions[p1.id].ids).join('|'),ids.join('|'),'saved ID order must match original deck');
 const exported=e.exportData();
 e=start();
 let resumed=await e.request('/discover',pair);
 assert(resumed.resumed);assert.equal(resumed.batch_id,first.batch_id);
 assert.equal(resumed.index,4);assert.equal(resumed.candidates[4].id,ids[4]);
 assert.equal(discoveryCalls,4,'real reopen should not call discovery API again');
 assert(resumed.candidates.some(c=>c.id===ids[0]),'matched earlier card must not invalidate batch');
 const stale=await e.request('/discover-progress',{...pair,batchId:'stale-batch',index:4,characterId:ids[4]});
 assert.equal(stale.ok,false);assert.equal((await e.request('/discover',pair)).index,4);
 shouldFail=true;
 const failed=await e.request('/discover',{...pair,refresh:true});
 assert.equal(failed.refresh_not_applied,true);assert.equal(failed.batch_id,first.batch_id);assert.equal(failed.index,4);
 shouldFail=false;
 const second=await e.request('/discover',{profileId:p2.id});
 assert(second.batch_id&&second.index===0);assert.notEqual(second.batch_id,first.batch_id);
 assert.equal((await e.request('/discover',pair)).index,4,'different Profile must not reset first Profile');
 const restored=e.importData(exported);
 assert.equal(restored.profiles,2);
 resumed=await e.request('/discover',pair);
 assert.equal(resumed.index,4);assert.equal(resumed.batch_id,first.batch_id);
 const next=await e.request('/discover',{...pair,refresh:true});
 assert.equal(next.resumed,false);assert.equal(next.index,0);assert.notEqual(next.batch_id,first.batch_id);
 for(let i=0;i<next.candidates.length;i++){
   await e.request('/discover-progress',{...pair,batchId:next.batch_id,index:i,characterId:next.candidates[i].id});
 }
 e=start();const exhausted=await e.request('/discover',pair);
 assert.equal(exhausted.index,exhausted.candidates.length,'exhausted deck should remain exhausted after restart');
 const before=discoveryCalls;await e.request('/discover',pair);
 assert.equal(discoveryCalls,before,'finished deck must not silently refresh');
 // A changed preference invalidates only this Profile's saved deck.
 const profile=(await e.request('/bootstrap')).profiles.find(p=>p.id===p1.id);
 await e.request('/profile',{...profile,max_age:58});
 const changed=await e.request('/discover',pair);
 assert.equal(changed.resumed,false);assert.equal(changed.index,0);assert.notEqual(changed.batch_id,next.batch_id);
 console.log('Discovery cursor survives matched swipes, browser reload, profile switch, backup restore, failed refresh and exhausted deck; only explicit refresh or filter change creates a new batch.');
})().catch(e=>{console.error(e);process.exitCode=1});
