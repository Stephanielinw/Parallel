const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('node:path');const vm=require('node:vm');const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const offline=read('public/parallel/offline.js'),app=read('public/parallel/app.js');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'));assert.equal(app,read('parallel_src/parallel_ai_date/static/app.js'));
const cases=[["chat","chat_flush",null,8192],["meeting","meeting_continue",null,8192],["surveillance","surveillance",1200,4096],["diary","diary",900,4096],["bio","discover_bios",950,2048],["match","match_decision",70,1024],["chat","chat_first_message",220,1024],["chat","first-message",220,1024],["chat","chat_proactive",220,1024],["meeting_summary","meeting_finalize",160,1024],["archive","episode_archive",null,4000],["photo","photo_description",350,1024],["translation","chat_translation",560,560],["chat","chat_continue",1024,1024]];
const source=offline.slice(offline.indexOf('  const TASK_TOKEN_DEFAULTS='),offline.indexOf('  const empty='));
const {resolveTaskMaxTokens:r,mergeTaskTokenOverrides:m}=new Function(source+'\nreturn {resolveTaskMaxTokens,mergeTaskTokenOverrides}')();
for(const [mode,entry,explicit,expected] of cases){assert.equal(r({max_tokens:8192},mode,entry,explicit),expected,entry);}
const overrides={meeting:30000,diary:6000,translation:3000,first_message:2000};
assert.equal(r({max_tokens:700,task_max_tokens:overrides},'chat','chat_flush'),700);
for(const [mode,entry,expected] of [['meeting','meeting_opening',30000],['diary','diary',6000],['translation','chat_translation',3000],['chat','chat_first_message',2000]])assert.equal(r({max_tokens:700,task_max_tokens:overrides},mode,entry,1200),expected);
assert.deepEqual(m(overrides,{diary:null,surveillance:8000}),{meeting:30000,translation:3000,first_message:2000,surveillance:8000});
for(const bad of [99,32769,1.5,NaN,true,'foo'])assert.throws(()=>m({}, {diary:bad}));
assert.equal(r({max_tokens:700,task_max_tokens:{diary:-1}},'diary','diary'),4096);
function start(store,calls){
  const win={};
  const ctx={window:win,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:webcrypto,URLSearchParams,Date,JSON,Math,TextEncoder,console,fetch:async(url,init)=>{
    const body=JSON.parse(init.body);calls.push(body);
    let content='Hi there.';
    const sys=body.messages[0].content;
    if(sys.includes('日程与世界线生成引擎'))content=JSON.stringify({slots:Array.from({length:8},(_,i)=>({start:String(i*3).padStart(2,'0')+':00',end:i===7?'23:59':String((i+1)*3).padStart(2,'0')+':00',location:'公寓',status:'日常活动',activity:'休息',scene:'窗边安静。'}))});
    else if(sys.includes('第一人称私密日记'))content=JSON.stringify({title:'日记',weather:'晴',mood:'平静',content:'今天是平静的一天。我整理了装备，读了一些文件，晚上回家休息。明天还有其他安排。'});
    else if(body.response_format)content=JSON.stringify({match:true});
    return {ok:true,status:200,json:async()=>({choices:[{message:{content},finish_reason:'stop'}]})};
  }};vm.createContext(ctx);vm.runInContext(offline,ctx);return win.ParallelOffline;
}
(async()=>{
 const store=new Map(),calls=[];
 let e=start(store,calls);
 await e.request('/settings',{max_tokens:700});
 const profile=(await e.request('/profile',{name:'Budget test',age:24,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机 · 游戏']})).profile;
 const cid='re-game:leon:re4';
 for(let i=0;i<15;i++){if((await e.request('/swipe',{profileId:profile.id,characterId:cid,direction:'right'})).matched)break;}
 await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-test-key',model:'mock',max_tokens:8192,task_max_tokens:{diary:6000,meeting:30000}});
 e=start(store,calls);
 let s=await e.request('/settings');assert.equal(s.max_tokens,8192);assert.equal(s.task_max_tokens.diary,6000);assert.equal(s.task_max_tokens.meeting,30000);
 await e.request('/surveillance',{profileId:profile.id,characterId:cid,refresh:true});
 await e.request('/diary',{profileId:profile.id,characterId:cid,refresh:true});
 const sur=calls.find(x=>x.messages[0].content.includes('日程与世界线生成引擎'));
 const diary=calls.find(x=>x.messages[0].content.includes('第一人称私密日记'));
 assert.equal(sur.max_tokens,4096);assert.equal(diary.max_tokens,6000);
 const logs=e.getSystemLogs();assert(logs.some(x=>x.mode==='surveillance'&&x.sampling.max_tokens===4096&&x.request_payload.max_tokens===4096));assert(logs.some(x=>x.mode==='diary'&&x.sampling.max_tokens===6000&&x.request_payload.max_tokens===6000));
 await e.request('/settings',{task_max_tokens:{diary:null}});s=await e.request('/settings');assert.equal(s.task_max_tokens.diary,undefined);assert.equal(s.task_max_tokens.meeting,30000);
 await e.request('/diary',{profileId:profile.id,characterId:cid,refresh:true});assert.equal(calls.filter(x=>x.messages[0].content.includes('第一人称私密日记')).at(-1).max_tokens,4096);
 await assert.rejects(()=>e.request('/settings',{task_max_tokens:{diary:0}}));assert.equal((await e.request('/settings')).task_max_tokens.meeting,30000);
 console.log('Task budgets: resolver, settings persistence, mock requests and log parity passed');
})().catch(e=>{console.error(e);process.exitCode=1});
