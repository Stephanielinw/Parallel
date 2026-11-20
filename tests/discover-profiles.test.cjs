const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
const store=new Map(),calls=[];let n=0,i=0;
const known={id:'re-game:leon:re4',bio:'我喜欢安静的咖啡馆。',tags:['成熟','冷幽默'],photo_description:'蓝色衬衫外面套着深色夹克，靠在墙边，侧光照亮脸庞。'};
const newRow={name:'Rebecca Chambers',aliases:['瑞贝卡'],source:'生化危机 · 游戏',version:'Resident Evil: Vendetta · 2017',age:37,gender:'female',canon:'长期研究生化病毒并在医疗领域参与对抗生化恐怖主义。',bio:'比起熬夜，我更喜欢和朋友聊天。',tags:['研究者','温和'],photo_description:'她穿着浅色外套，坐在实验室外的长椅上，手里捧着马克杯，阳光落在短发上。'};
const badRow={...newRow,name:'Wrong Source',source:'星球大战',version:'2019'};
const mock=async(url,opts)=>{
  const body=JSON.parse(opts.body);calls.push(body);
  let content=JSON.stringify({profiles:n++===0?[newRow,known,badRow,{...newRow}]:[{...newRow,bio:'忙完试验后想去散步。'},known]});
  return {ok:true,status:200,json:async()=>({choices:[{message:{content},finish_reason:'stop'}]})};
};
function start(){
  const window={};vm.runInNewContext(src,{window,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID:()=> 'm'+(++i)},URLSearchParams,Date,JSON,Math,TextEncoder,console,fetch:mock});return window.ParallelOffline;
}
(async()=>{
  let e=start();
  const p=(await e.request('/profile',{name:'Fixture',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
  await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock'});
  const first=await e.request('/discover',{profileId:p.id,refresh:true});
  assert.equal(first.candidates.length,2);assert.equal(first.new_count,1);
  const c=first.candidates.find(x=>x.identity_origin==='ai-discovered');assert(c);assert.equal(c.photo_description,newRow.photo_description);
  assert.equal(calls.length,1);assert.equal(calls[0].max_tokens,8192);
  const desc=await e.request('/photo-description',{characterId:c.id});assert.equal(desc.description,newRow.photo_description);assert.equal(calls.length,1);
  const other=first.candidates.find(x=>x.id===known.id);assert.equal(other.photo_description,known.photo_description);
  e=start();const next=await e.request('/discover',{profileId:p.id,refresh:true});
  assert.equal(next.new_count,0);assert(next.candidates.some(x=>x.id===c.id&&x.bio==='忙完试验后想去散步。'));
  const pack=JSON.parse(e.exportData());assert.equal(Object.keys(pack.data.discoveredCharacters).length,1);
  assert.equal(pack.data.photoDescriptions[c.id].engine,'live-text');
  const retained=await e.request('/identify?name=Rebecca');
  assert(retained.matches.some(x=>x.id===c.id));
  const p2=(await e.request('/profile',{name:'Rebecca',age:37,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机'],role_character_id:c.id})).profile;
  const self=await e.request('/candidates',{profileId:p2.id});assert(!self.candidates.some(x=>x.id===c.id));
  console.log('Discovery: new identities, stable IDs after restart, source and self filters, complete photo descriptions and no extra photo API calls passed.');
})().catch(e=>{console.error(e);process.exitCode=1;});
