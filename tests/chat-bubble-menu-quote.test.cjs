const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const app=read('public/parallel/app.js'),engineCode=read('public/parallel/offline.js');
assert.equal(app,read('parallel_src/parallel_ai_date/static/app.js'));
assert.equal(engineCode,read('parallel_src/parallel_ai_date/static/offline.js'));
new Function(app);new Function(engineCode);
assert(app.includes('data-action="open-chat-bubble-actions"'),'bubble itself must open context menu');
assert(app.includes('重抽整轮（'),'latest AI batch is presented as an entire round');
assert(app.includes('chat-quoted-content'),'quoted message has an inline visual');
assert(app.includes('chat-quote-compose'),'composer shows quote and cancellation');
const store=new Map(),window={};
vm.runInNewContext(engineCode,{window,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},crypto:require('node:crypto').webcrypto,Date,URLSearchParams,TextEncoder,JSON,Math,AbortController,setTimeout,clearTimeout,console,fetch:async()=>{throw Error('No paid requests')}});
const e=window.ParallelOffline;
const data=JSON.parse(e.exportData()).data;
const pid='lin-p',cid='re-game:leon:re2',iso=new Date().toISOString();
data.profiles=[{id:pid,name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'',avatar:'',role_character_id:'',created_at:iso}];
data.relations[pid+'|'+cid]={profile_id:pid,character_id:cid,status:'matched',mode:'chat',updated_at:iso};
data.messages=[
 {id:'ai-1',profile_id:pid,character_id:cid,sender:'ai',mode:'chat',text:'第一条回复',engine:'live',created_at:iso},
 {id:'ai-2',profile_id:pid,character_id:cid,sender:'ai',mode:'chat',text:'第二条回复',engine:'live',created_at:iso}
];
e.importData(JSON.stringify({format:'parallel-portable-backup',schemaVersion:1,data}));
(async()=>{
 const sent=await e.request('/message',{profileId:pid,characterId:cid,text:'我引用你刚才的话',quoteMessageId:'ai-1'});
 assert.equal(sent.user.quote.id,'ai-1');
 assert.equal(sent.user.quote.text,'第一条回复');
 const generated=e.buildPromptPreview(pid,cid,'chat',{latestText:'我引用你刚才的话'}).map(x=>x.content).join('\n');
 assert(generated.includes('引用对方的消息'),'quote is model-visible context');
 const thread=await e.request('/thread?profileId='+pid+'&characterId='+cid);
 assert(thread.messages.some(x=>x.id===sent.user.id&&x.quote?.id==='ai-1'));
 await assert.rejects(e.request('/message-delete',{profileId:pid,characterId:cid,messageId:'ai-1'}),/只能撤回自己/);
 const revoked=await e.request('/message-delete',{profileId:pid,characterId:cid,messageId:sent.user.id});
 assert.equal(revoked.recalled,true);
 assert.equal((await e.request('/thread?profileId='+pid+'&characterId='+cid)).messages.find(x=>x.id==='ai-1').engine,'live');
 const second=await e.request('/message',{profileId:pid,characterId:cid,text:'再引用',quoteMessageId:'ai-2'});
 assert.equal(second.user.quote.id,'ai-2');
 await e.request('/message-forget',{profileId:pid,characterId:cid,messageId:'ai-2'});
 const final=await e.request('/thread?profileId='+pid+'&characterId='+cid);
 assert(!final.messages.find(x=>x.id===second.user.id).quote,'permanent deletion removes live quote snapshot');
 console.log('Bubble actions, quoted SMS persistence, owned-only recall, and deleted-source cleanup passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
