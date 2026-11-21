const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const src=read('public/parallel/offline.js');
assert.equal(src,read('parallel_src/parallel_ai_date/static/offline.js'));
const dataStore=new Map(),calls=[];
let ids=0,round=0,failAll=false;
const validPhoto='一张近景侧拍，年轻男子穿着深色战术制服站在走廊灯光下，视线专注地望向镜头一侧，身后是模糊的门框和白色墙面。';
const piers={name:'Piers Nivans',aliases:['皮尔斯'],source:'生化危机 · 游戏',version:'Resident Evil 6 · 2012',age:25,gender:'male',canon:'BSAA成员，在东欧与中国的行动中和Chris Redfield并肩执行任务。',bio:'习惯把队友放在自己前面。休假时更喜欢安静吃顿饭。',tags:['BSAA','可靠'],photo_description:validPhoto};
const wrongSource={...piers,name:'Not From Resident Evil',source:'星球大战',version:'Film · 2017'};
const underage={...piers,name:'Underage NPC',age:16};
const mock=async(url,opts)=>{
  const payload=JSON.parse(opts.body);
  calls.push(payload);
  const request=JSON.parse(payload.messages.at(-1).content);
  let content='';
  if(failAll){content='王牌飞行员", "关键援护"]\n检查所有10个角色...';}
  else if(request.kind==='new'&&request.focus.startsWith('主要人物')){
    content='王牌飞行员", "关键援护"]\n检查所有10个角色...';
  }else if(request.kind==='new'){
    content=JSON.stringify({profiles:[piers,wrongSource,underage]});
  }else if(request.kind==='known'&&request.people[0]?.id){
    const c=request.people[0];
    content=JSON.stringify({profiles:[{id:c.id,bio:'散步比工作安排更能让我放松。',tags:['成熟','专注'],photo_description:validPhoto}]});
  }else{content='想了很久，但今天没有办法做完。';}
  if(round===1&&request.kind==='new'){content=JSON.stringify({profiles:[piers]});}
  if(round===1&&request.kind==='known'&&request.people[0]?.id){
    const c=request.people[0];content=JSON.stringify({profiles:[{id:c.id,bio:'今天也想认真认识一个新朋友。',tags:['认真','健谈'],photo_description:validPhoto}]});
  }
  return {ok:true,status:200,json:async()=>({choices:[{message:{content},finish_reason:'stop'}],usage:{prompt_tokens:0,completion_tokens:0,total_tokens:0}})};
};
function start(){
  const window={};
  vm.runInNewContext(src,{window,localStorage:{getItem:k=>dataStore.get(k)??null,setItem:(k,v)=>dataStore.set(k,v)},crypto:{randomUUID:()=> 'id-'+(++ids)},URLSearchParams,Date,Math,JSON,TextEncoder,AbortController,console,fetch:mock});
  return window.ParallelOffline;
}
(async()=>{
  let e=start();
  const p=(await e.request('/profile',{name:'Test',age:25,gender:'female',interested_in:['male'],min_age:18,max_age:60,sources:['生化危机']})).profile;
  await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock-proxy',auto_translate:false,task_max_tokens:{bio:4096}});
  const first=await e.request('/discover',{profileId:p.id,refresh:true});
  assert.equal(calls.length,4,'discovery should make four small independent calls');
  assert(calls.every(x=>JSON.parse(x.messages.at(-1).content).requested<=3),'large batch not allowed');
  assert(calls.some(c=>!('response_format' in c))&&calls.some(c=>c.response_format?.type==='json_object'),'both proxy-compatible modes used');
  assert(calls.every(c=>c.temperature===0.35&&c.max_tokens===4096),'respect user budget and use low generation temperature');
  assert.equal(first.new_count,1,'new canon identity survived malformed other batch');
  assert(first.batch_failures>=1);
  assert(first.candidates.length>=2,'known characters should still have usable cards');
  assert(!first.apiError,'partial success should not throw blocking modal');
  const c=first.candidates.find(c=>c.name==='Piers Nivans');
  assert(c&&c.identity_origin==='ai-discovered');
  assert.equal(c.photo_description,validPhoto);
  assert(!first.candidates.some(c=>c.name==='Not From Resident Evil'||c.name==='Underage NPC'));
  assert(first.candidates.every(c=>c.photo_engine==='live-text'&&c.photo_description===validPhoto),'never show static photo text in live result');
  assert(first.candidates.every(c=>c.gender==='male'));
  const desc=await e.request('/photo-description',{characterId:c.id});
  assert.equal(desc.description,validPhoto);assert.equal(calls.length,4,'generated photo should not call model again');
  assert(!e.exportData().includes('王牌飞行员'),'corrupted provider tail must not contaminate save');
  const stored=JSON.parse(e.exportData()).data;
  assert.equal(Object.keys(stored.discoveredCharacters).length,1);
  const sourceId=c.id;
  e=start();round=1;
  const again=await e.request('/discover',{profileId:p.id,refresh:true});
  assert.equal(again.new_count,0,'same person same version cannot be minted twice');
  assert(again.candidates.some(x=>x.id===sourceId),'discovered identity survives restart');
  assert.equal(Object.keys(JSON.parse(e.exportData()).data.discoveredCharacters).length,1);
  failAll=true;round=2;
  const kept=await e.request('/discover',{profileId:p.id,refresh:true});
  assert(!kept.apiError,'cached successful portraits should remain usable when every request fails');
  assert.equal(kept.generation,'saved-deck');assert.equal(kept.refresh_not_applied,true);assert.equal(kept.new_count,0);
  assert(kept.candidates.some(x=>x.id===sourceId&&x.photo_description===validPhoto));
  const restored=JSON.parse(e.exportData()).data;
  assert.equal(Object.keys(restored.discoveredCharacters).length,1);
  console.log('Four independent micro-batches, partial recovery, malformed JSON rejection, two response_format routes, identity dedupe, cached photos and all-failed fallback passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
