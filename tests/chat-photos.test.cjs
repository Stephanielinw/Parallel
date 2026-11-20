const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('public/parallel/offline.js');
assert.equal(source,read('parallel_src/parallel_ai_date/static/offline.js'));
assert.equal(read('public/parallel/app.js'),read('parallel_src/parallel_ai_date/static/app.js'));
const storage=new Map(),photos=new Map(),calls=[];
let n=0;
const idb={open(name){const req={};Promise.resolve().then(()=>{
  if(name!=='parallel-chat-photos-v1'){req.onerror?.();return;}
  req.result={objectStoreNames:{contains:()=>true},transaction(){
    const tx={objectStore:()=>({put:(v,k)=>photos.set(k,v),delete:k=>photos.delete(k),get:k=>{
      const rr={result:photos.get(k)};Promise.resolve().then(()=>rr.onsuccess?.());return rr;
    }})};
    Promise.resolve().then(()=>tx.oncomplete?.());return tx;
  }};
  req.onsuccess?.();
});return req;}};
const makeEngine=()=>{
  const win={};
  vm.runInNewContext(source,{window:win,localStorage:{getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)},indexedDB:idb,
    crypto:{randomUUID:()=> 'm'+(++n)},URLSearchParams,AbortController,TextEncoder,setTimeout,clearTimeout,console,
    fetch:async(url,opts)=>{calls.push(JSON.parse(opts.body));return {ok:true,status:200,json:async()=>({choices:[{message:{content:'Nice photos.|||[[PHOTO: A coffee mug on a wooden desk.]]|||Do you want one?'},finish_reason:'stop'}]})}}
  });
  return win.ParallelOffline;
};
(async()=>{
  const e=makeEngine(),pack=JSON.parse(e.exportData()),d=pack.data,pid='p1',cid='re-game:leon:re6';
  d.profiles=[{id:pid,name:'Fixture',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:[],bio:'',intent:'',avatar:'',role_character_id:'',created_at:new Date().toISOString()}];
  d.relations[pid+'|'+cid]={profile_id:pid,character_id:cid,status:'matched',mode:'chat',hot_chat:true,updated_at:new Date().toISOString()};
  e.importData(JSON.stringify(pack));
  await e.request('/settings',{base_url:'https://example.com/v1',api_key:'fake-key',model:'mock-vision',auto_translate:false});
  const payload={profileId:pid,characterId:cid};
  const first=await e.request('/chat-photos',{...payload,items:[{kind:'gallery',data:'data:image/jpeg;base64,AA=='},{kind:'gallery',data:'data:image/jpeg;base64,AQ=='},{kind:'virtual',description:'一张虚拟自拍。'}]});
  assert.equal(first.users.length,3);assert.equal(first.queue.pendingIds.length,3);
  await e.request('/message',{...payload,text:'Look at these.'});
  assert.equal(calls.length,0);
  const result=await e.request('/chat-flush',{...payload,force:true});
  assert.equal(result.replies.length,3);assert.equal(result.replies[1].photo_kind,'virtual');assert.equal(result.replies[1].photo_description,'A coffee mug on a wooden desk.');
  assert.equal(calls.length,1);
  const pic=calls[0].messages.filter(m=>Array.isArray(m.content));
  assert.equal(pic.length,2);assert.equal(pic[0].content[1].image_url.url,'data:image/jpeg;base64,AA==');
  assert(calls[0].messages.some(m=>typeof m.content==='string'&&m.content.includes('一张虚拟自拍。')));
  assert(!JSON.stringify(calls[0]).includes('chat-photo-user.webp'));
  assert(!e.exportData().includes('data:image/jpeg;base64'));
  assert(!JSON.stringify(e.getSystemLogs()).includes('data:image/jpeg;base64'));
  assert(e.getSystemLogs().some(l=>JSON.stringify(l.request_payload).includes('[LOCAL PHOTO REDACTED]')));
  const saved=JSON.parse(await e.exportDataWithPhotos());assert.equal(saved.chatPhotoFiles.length,2);
  const mid=first.users[0].id;
  assert.equal((await e.request('/chat-photo-read',{...payload,messageId:mid})).data,'data:image/jpeg;base64,AA==');
  await e.request('/message-delete',{...payload,messageId:mid});
  await assert.rejects(e.request('/chat-photo-read',{...payload,messageId:mid}));
  await e.importDataWithPhotos(JSON.stringify(saved));
  assert.equal((await e.request('/chat-photo-read',{...payload,messageId:mid})).data,'data:image/jpeg;base64,AA==');
  const after=JSON.parse(e.exportData()).data.messages.find(m=>m.id===mid);assert.notEqual(after.photo_ref,first.users[0].photo_ref);
  assert.equal(e.parseChatPhoto('[[PHOTO: a cup]]'),'a cup');
  assert.equal(e.parseChatPhoto('ordinary text'),'');
  assert.equal(e.splitChatBubbles('[[PHOTO: broken').length,0);
  console.log('Chat photo integration, batching, backup, recall, redaction and protocol checks passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
