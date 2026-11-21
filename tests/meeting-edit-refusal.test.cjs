const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),path=require('node:path');
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
const store=new Map(),calls=[];let n=0,now=new Date(2026,10,20,19,45,0).getTime();
let answer='我无法参与浪漫或涉及性爱描写的虚构情境，也不能继续进行此类角色扮演。如果你需要其他类型的内容创作，可以告诉我。';
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const fetchMock=async(url,opts)=>{
  const request=JSON.parse(opts.body);calls.push(request);
  const content=request.response_format?JSON.stringify({location:'Cafe',summary:'约在咖啡馆见面。'}):answer;
  return {ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content},finish_reason:'stop'}]})};
};
function start(){
  const window={};
  vm.runInNewContext(src,{window,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID:()=> 'x'+(++n)},URLSearchParams,Date:Clock,JSON,Math,TextEncoder,AbortController,setTimeout:()=>0,clearTimeout:()=>{},console,fetch:fetchMock});
  return window.ParallelOffline;
}
(async()=>{
  const e=start(),p=(await e.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
  const cid='re-game:carlos:re3',pair={profileId:p.id,characterId:cid},uri='/thread?profileId='+p.id+'&characterId='+cid;
  for(let i=0;i<15;i++)if((await e.request('/swipe',{...pair,direction:'right'})).matched)break;
  await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock',auto_translate:false});
  await e.request('/mode',{...pair,mode:'meeting',location:'Cafe',triggerOpening:false});
  const first=await e.request('/message',{...pair,text:'旧的用户发言',location:'Cafe'});
  assert(first.user);
  assert.equal(first.apiError?.error_code,'MODEL_REFUSAL','HTTP 200 refusal must be an API error, not a successful story');
  let thread=await e.request(uri);
  assert(thread.messages.some(m=>m.id===first.user.id&&m.text==='旧的用户发言'),'preserve the player input');
  assert(!thread.messages.some(m=>m.sender==='ai'&&m.text.includes('我无法参与')),'never store refusal as an AI scene');
  assert.equal(thread.taskState?.status,'paused','preserve retry state after refusal');

  const edited=await e.request('/message-edit',{...pair,messageId:first.user.id,text:'修改后的用户发言'});
  assert(edited.ok&&edited.changed&&edited.regenerate);
  assert.equal(edited.message.id,first.user.id,'edit in place to keep player turn identity');
  answer='Carlos听完后将杯子放在桌边，等她继续说。';
  const rebuilt=await e.request('/reply',{...pair,location:'Cafe'});
  assert(rebuilt.reply&&rebuilt.reply.text.includes('杯子'));
  assert(JSON.stringify(calls.at(-1)).includes('修改后的用户发言'));
  assert(!JSON.stringify(calls.at(-1)).includes('旧的用户发言'),'old wording must not leak into fresh model context');

  const oldReply=rebuilt.reply;
  const editAfterAI=await e.request('/message-edit',{...pair,messageId:first.user.id,text:'第三版用户发言'});
  assert(editAfterAI.removedIds.includes(oldReply.id),'invalidate the dependent AI reply');
  thread=await e.request(uri);
  assert(!thread.messages.some(m=>m.id===oldReply.id));
  assert(!JSON.stringify(thread.meetings).includes('将杯子放在桌边'),'meeting archive must not retain the superseded AI scene');
  assert(JSON.stringify(thread.meetings).includes('第三版用户发言'));
  answer='Carlos把水杯挪到一旁，继续听她说话。';
  const renewed=await e.request('/reply',{...pair,location:'Cafe'});
  assert(renewed.reply);
  const identical=await e.request('/message-edit',{...pair,messageId:first.user.id,text:'第三版用户发言'});
  assert.equal(identical.changed,false,'unchanged edit must not delete the existing reply');

  answer='我无法参与浪漫或涉及性爱描写的虚构情境，也不能继续进行此类角色扮演。';
  const refusedReroll=await e.request('/message-regenerate',{...pair,messageId:renewed.reply.id});
  assert.equal(refusedReroll.ok,false);
  thread=await e.request(uri);
  assert(thread.messages.some(m=>m.id===renewed.reply.id),'reroll refusal must preserve the original AI scene');
  assert(!thread.messages.some(m=>m.sender==='ai'&&m.text.includes('我无法参与')));

  answer='Carlos点了点头。';
  const second=await e.request('/message',{...pair,text:'我又说了一句'});
  assert(second.user&&second.reply);
  let blocked=false;
  try{await e.request('/message-edit',{...pair,messageId:first.user.id,text:'试图改老发言'});}catch{blocked=true;}
  assert(blocked,'only the latest user turn should be editable');
  blocked=false;
  try{await e.request('/message-edit',{...pair,messageId:second.reply.id,text:'擅自改AI回复'});}catch{blocked=true;}
  assert(blocked,'meeting AI reply is not editable through the player edit endpoint');
  const finalEdit=await e.request('/message-edit',{...pair,messageId:second.user.id,text:'最新发言修正版'});
  assert(finalEdit.changed&&finalEdit.removedIds.includes(second.reply.id));

  console.log('Model refusal isolation, latest meeting user edit, dependent reply cleanup and reroll preservation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
