const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const offline=read('public/parallel/offline.js'),app=read('public/parallel/app.js');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'));
assert.equal(app,read('parallel_src/parallel_ai_date/static/app.js'));
assert(app.includes("api('/mode',{profileId,characterId:id,mode:'meeting',triggerOpening:true})"));
assert(!offline.includes('现已在「'),'old forced meeting acknowledgement must be gone');
const store=new Map(),requests=[];
let nextId=0,generated='Leon正在靠窗的位置等候，低头看了看手机。窗外的雨还没停，谁也没有走上前打招呼。';
const fetch=async(url,opts)=>{
  const body=JSON.parse(opts.body);requests.push(body);
  return {ok:true,status:200,json:async()=>({choices:[{message:{role:'assistant',content:generated},finish_reason:'stop'}]})};
};
function boot(){
  const window={};const ctx={window,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID:()=> 'id-'+(++nextId)},URLSearchParams,Date,JSON,Math,TextEncoder,AbortController,console,fetch};
  vm.createContext(ctx);vm.runInContext(offline,ctx);return window.ParallelOffline;
}
(async()=>{
  let e=boot();
  const profile=(await e.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['male'],min_age:18,max_age:60,sources:['生化危机']})).profile;
  const pair={profileId:profile.id,characterId:'re-game:leon:re6'};
  let matched=false;
  for(let i=0;i<15;i++)if((await e.request('/swipe',{...pair,direction:'right'})).matched){matched=true;break;}
  assert(matched,'fixture must be matched');
  const prior=await e.request('/message',{...pair,text:'在咖啡馆碰面吧，我快到了'});
  assert.equal(prior.mode,'chat');
  await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock-model'});
  const opening=await e.request('/mode',{...pair,mode:'meeting',location:'咖啡馆',triggerOpening:true});
  assert.equal(opening.mode,'meeting');assert(opening.openingReply);
  const ms=requests.at(-1).messages;
  assert(ms.some(x=>x.role==='system'&&x.content.includes('首次接触由玩家决定')));
  assert(ms.some(x=>x.role==='system'&&x.content.includes('不代表双方已经实际照面')));
  assert(ms.some(x=>x.role==='user'&&x.content.includes('候场镜头')));
  assert(ms.some(x=>x.role==='system'&&x.content.includes('强制 1:1')));
  assert(ms.at(-1).role==='user','preserve custom preset order and final user role');
  const first=opening.openingReply;
  generated='Leon把外套挂好，重新坐回窗边等候。杯沿留着一圈淡淡的水汽。';
  const rolled=await e.request('/message-regenerate',{...pair,messageId:first.id});
  assert(rolled.ok&&rolled.reply.id!==first.id);
  const rm=requests.at(-1).messages;
  assert(rm.some(x=>x.role==='system'&&x.content.includes('首次接触由玩家决定')),'reroll of opening must stay observational');
  assert(!JSON.stringify(rm).includes('窗外的雨还没停'),'reroll must not see discarded original');
  generated='Leon抬起头，看见Lin已经来到桌边，神情里闪过笑意。';
  const msg=await e.request('/message',{...pair,text:'我走到桌边，轻声跟他打了个招呼'});
  assert(msg.reply);
  const later=requests.at(-1).messages;
  assert(!later.some(x=>x.role==='system'&&x.content.includes('首次接触由玩家决定')),'opening restriction must end after player action');
  const old=JSON.parse(e.exportData()).data;
  assert.equal(old.messages.filter(m=>m.mode==='meeting'&&m.sender==='user').length,1);
  const demo=await e.request('/mode',{...pair,mode:'chat',finalizeMeeting:false});
  assert.equal(demo.mode,'chat');
  await e.request('/settings',{demo_enabled:true,base_url:'',model:''});
  const openDemo=await e.request('/mode',{...pair,mode:'meeting',triggerOpening:true});
  assert(openDemo.openingReply);
  assert(!/听见你的脚步声|定格在你身上|朝你走近|你到了|走吧，我们/.test(openDemo.openingReply.text));
  console.log('Manual mode switch, preset-aware observational opening, role order, opening reroll and post-contact freedom passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
