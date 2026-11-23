import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Test the reusable M04 module in real WebKit, injected ONLY in disposable
// browser contexts. It is intentionally not imported by the live Parallel app.
const SCRIPT=fs.readFileSync(
  path.join(process.cwd(),'src/storage/parallelIncrementalIDB.js'),'utf8');
const LEGACY_KEY='parallel-portable-v2';
const PHOTO='data:image/jpeg;base64,AQID';

async function boot(page:any){
  await page.goto('/Parallel/');
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).ParallelOffline))).toBe(true);
  await page.addScriptTag({content:SCRIPT});
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).ParallelM04Incremental))).toBe(true);
}
async function seed(page:any,count=240){
  return page.evaluate(async ({count,photo}:{count:number,photo:string})=>{
    const engine=(window as any).ParallelOffline;
    const pack=JSON.parse(engine.exportData());
    const pid='m04-synthetic',cid='re-game:leon:re6',pair=pid+'|'+cid;
    pack.data.profiles=[{
      id:pid,name:'M04 合成档案',age:25,gender:'female',interested_in:['all'],
      min_age:18,max_age:65,sources:[],interests:['电影'],bio:'test-only',
      intent:'交朋友',avatar:'',role_character_id:'',created_at:'2026-11-20T10:00:00Z'
    }];
    pack.data.relations[pair]={
      profile_id:pid,character_id:cid,status:'matched',mode:'chat',
      active_meeting_id:'',updated_at:'2026-11-21T18:00:00Z'
    };
    pack.data.messages=Array.from({length:count},(_,i)=>({
      id:'m04-msg-'+i,profile_id:pid,character_id:cid,
      mode:i>=20&&i<40?'meeting':'chat',meeting_id:i>=20&&i<40?'m04-meeting':'',
      sender:i%2?'ai':'user',engine:i%2?'live':'human',
      text:'必须保留原始聊天、中文和 Emoji 🐕‍🦺🍲。'.repeat(8)+' #'+i,
      created_at:new Date(Date.parse('2026-11-20T10:00:00Z')+i*60000).toISOString()
    }));
    pack.data.messages[0].photo_kind='gallery';
    pack.data.messages[0].photo_ref='m04-photo-ref';
    const seen=pack.data.messages.slice(20,40);
    const meeting={
      id:'m04-meeting',profile_id:pid,character_id:cid,
      started_at:'2026-11-20T12:00:00Z',ended_at:'2026-11-20T13:00:00Z',
      location:'公寓露台',summary:'合成热汤见面',
      message_ids:seen.map((m:any)=>m.id),
      entries:seen.map((m:any)=>({
        id:m.id,sender:m.sender,text:m.text,created_at:m.created_at
      }))
    };
    pack.data.meetings=[meeting];
    pack.data.episodicMemories=[{
      id:'m04-memory',owner_id:cid,profile_id:pid,source_type:'meeting_summary',
      source_key:'meeting:m04-meeting',meeting_id:'m04-meeting',
      raw_msg_ids:meeting.message_ids,summary:'记得见面喝热汤',
      meeting_data:JSON.parse(JSON.stringify(meeting))
    }];
    pack.data.events=[{id:'m04-event',profile_id:pid,character_id:cid,
      created_at:'2026-11-20T13:00:00Z',type:'meeting',summary:'见面完成'}];
    pack.data.diaries={[pair]:{byDate:{
      '2026-11-20':{date:'2026-11-20',content:'日记原文：热汤的味道 🍲'}
    }}};
    pack.data.surveillance={[pair]:{byDate:{
      '2026-11-20':{date:'2026-11-20',slots:[{
        source:'meeting',location:'公寓露台',activity:'一起吃饭',
        start:'12:00',end:'13:00'
      }]}
    }}};
    pack.data.m04_unknown_future_field={keep:'绝不能悄悄删掉 🐕‍🦺',nested:[1,{x:true}]};
    engine.importData(JSON.stringify(pack));
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('photos'))
          req.result.createObjectStore('photos');
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite');
      tx.objectStore('photos').put(photo,'m04-photo-ref');
      tx.oncomplete=()=>resolve();
      tx.onerror=tx.onabort=()=>reject(tx.error);
    });db.close();
    const raw=localStorage.getItem('parallel-portable-v2');
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw||''));
    const sourceSha256=[...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
    return {sourceSha256,snapshot:JSON.parse(engine.exportData()).data,
      legacyRaw:raw};
  },{count,photo:PHOTO});
}

test('M04: bootstrap, incremental patch only touched rows, reload and no legacy writes',async({page})=>{
  await boot(page);
  const fixture=await seed(page,260);
  const created=await page.evaluate(async fixture=>{
    const m=(window as any).ParallelM04Incremental;
    const name=m.newLabName(),store=m.createStore(name);
    const initial=await store.initialize({
      snapshot:fixture.snapshot,sourceSha256:fixture.sourceSha256
    });
    const loaded=await store.load();
    const original=await store.readRecord('messages','m04-msg-15');
    const edited={...fixture.snapshot.messages[10],
      text:'只修改这一条消息，其他聊天不能被重写 ✅'};
    const incoming={...fixture.snapshot.messages[0],
      id:'m04-msg-added',photo_kind:undefined,photo_ref:undefined,
      text:'增量追加的一条聊天 🐕‍🦺'};
    delete incoming.photo_kind;delete incoming.photo_ref;
    const diary={...fixture.snapshot.diaries,
      'm04-extra-date':{byDate:{'2026-11-21':{date:'2026-11-21',content:'新的日记'}}}};
    const result=await store.applyBatch({expectedRevision:1,changes:[
      {op:'put',collection:'messages',record:edited},
      {op:'put',collection:'messages',record:incoming},
      {op:'set-root',key:'diaries',value:diary}
    ]});
    const after=await store.load();
    return {name,initial,loaded,result,after,original,
      source:localStorage.getItem('parallel-portable-v2')};
  },fixture);
  expect(created.initial.revision).toBe(1);
  expect(created.loaded.data).toEqual(fixture.snapshot);
  expect(created.original.record.text).toBe(fixture.snapshot.messages[15].text);
  expect(created.result).toMatchObject({
    revision:2,recordWrites:2,recordDeletes:0,rootWrites:1,orderWrites:1
  });
  expect(created.after.data.messages).toHaveLength(261);
  expect(created.after.data.messages[10].text).toContain('只修改这一条');
  expect(created.after.data.messages[15].text).toBe(fixture.snapshot.messages[15].text);
  expect(created.after.data.meetings[0].entries).toEqual(fixture.snapshot.meetings[0].entries);
  expect(created.after.data.episodicMemories).toEqual(fixture.snapshot.episodicMemories);
  expect(created.after.data.m04_unknown_future_field)
    .toEqual(fixture.snapshot.m04_unknown_future_field);
  expect(created.after.data.messages[0].photo_ref).toBe('m04-photo-ref');
  expect(created.source).toBe(fixture.legacyRaw);
  await boot(page);
  const reloaded=await page.evaluate(async name=>
    (window as any).ParallelM04Incremental.createStore(name).load(),created.name);
  expect(reloaded).toEqual(created.after);
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY_KEY))
    .toBe(fixture.legacyRaw);
  const photo=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    const result=await new Promise<string>((resolve,reject)=>{
      const req=db.transaction('photos','readonly').objectStore('photos').get('m04-photo-ref');
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });db.close();return result;
  });
  expect(photo).toBe(PHOTO);
});

test('M04: two tabs use one CAS epoch; the losing update can retry',async({page,context})=>{
  await boot(page);
  const fixture=await seed(page,60);
  const name=await page.evaluate(async fixture=>{
    const m=(window as any).ParallelM04Incremental,name=m.newLabName();
    await m.createStore(name).initialize(fixture);return name;
  },fixture);
  const other=await context.newPage();await boot(other);
  const conflict=await Promise.allSettled([page,other].map((p,i)=>p.evaluate(
    ({name,i})=>(window as any).ParallelM04Incremental.createStore(name).applyBatch({
      expectedRevision:1,changes:[{op:'put',collection:'messages',record:{
        id:'m04-concurrent-'+i,profile_id:'m04-synthetic',
        character_id:'re-game:leon:re6',sender:'user',mode:'chat',engine:'human',
        text:'两个标签页并发写入 '+i,created_at:'2026-11-22T10:00:00Z'
      }}]
    }),{name,i})));
  expect(conflict.filter(x=>x.status==='fulfilled')).toHaveLength(1);
  expect(conflict.filter(x=>x.status==='rejected')).toHaveLength(1);
  expect(String((conflict.find(x=>x.status==='rejected') as PromiseRejectedResult).reason))
    .toContain('revision conflict');
  const state=await page.evaluate(async name=>
    (window as any).ParallelM04Incremental.createStore(name).load(),name);
  expect(state.revision).toBe(2);
  expect(state.data.messages).toHaveLength(61);
  const retry=await other.evaluate(async name=>
    (window as any).ParallelM04Incremental.createStore(name).applyBatch({
      expectedRevision:2,changes:[{op:'put',collection:'messages',record:{
        id:'m04-later-retry',profile_id:'m04-synthetic',
        character_id:'re-game:leon:re6',sender:'user',mode:'chat',engine:'human',
        text:'读取最新版本后才重新尝试',created_at:'2026-11-22T11:00:00Z'
      }}]
    }),name);
  expect(retry.revision).toBe(3);
  const final=await page.evaluate(async name=>
    (window as any).ParallelM04Incremental.createStore(name).load(),name);
  expect(final.data.messages).toHaveLength(62);
  expect(final.data.messages.at(-1).text).toContain('重新尝试');
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY_KEY))
    .toBe(fixture.legacyRaw);
  await other.close();
});

test('M04: simulated quota abort and lost acknowledgement preserve committed data',async({page})=>{
  await boot(page);
  const fixture=await seed(page,85);
  const name=await page.evaluate(async fixture=>{
    const m=(window as any).ParallelM04Incremental,name=m.newLabName();
    await m.createStore(name).initialize(fixture);return name;
  },fixture);
  const failure=await page.evaluate(async name=>{
    const store=(window as any).ParallelM04Incremental.createStore(name);
    let kind='',message='';
    try{await store.applyBatch({expectedRevision:1,
      changes:[{op:'delete',collection:'messages',id:'m04-msg-0'}],
      fault:'quota-abort'
    });}catch(e){kind=(e as Error).name;message=String((e as Error).message);}
    return {kind,message,after:await store.load()};
  },name);
  expect(failure.kind).toBe('QuotaExceededError');
  expect(failure.message).toContain('simulated quota abort');
  expect(failure.after.revision).toBe(1);
  expect(failure.after.data).toEqual(fixture.snapshot);
  const interrupted=await page.evaluate(async name=>{
    const store=(window as any).ParallelM04Incremental.createStore(name);
    let error='';
    try{await store.applyBatch({expectedRevision:1,changes:[{
      op:'delete',collection:'messages',id:'m04-msg-23'
    }],fault:'after-commit-interrupt'});}
    catch(e){error=String((e as Error).message);}
    return error;
  },name);
  expect(interrupted).toContain('lost acknowledgement');
  await boot(page);
  const recovered=await page.evaluate(async name=>
    (window as any).ParallelM04Incremental.createStore(name).load(),name);
  expect(recovered.revision).toBe(2);
  expect(recovered.data.messages).toHaveLength(84);
  expect(recovered.data.messages.some((m:any)=>m.id==='m04-msg-23')).toBe(false);
  expect(recovered.data.meetings[0].entries)
    .toEqual(fixture.snapshot.meetings[0].entries);
  expect(await page.evaluate(k=>localStorage.getItem(k),LEGACY_KEY))
    .toBe(fixture.legacyRaw);
  const corruption=await page.evaluate(async name=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open(name,1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('records','readwrite');
      tx.objectStore('records').put({
        value:{id:'m04-msg-1',text:'CORRUPTED'},sha256:'0'.repeat(64)
      },['messages','m04-msg-1']);
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
    });db.close();
    try{await (window as any).ParallelM04Incremental.createStore(name).load();
      return 'UNSAFE SUCCESS';
    }catch(e){return String((e as Error).message);}
  },name);
  expect(corruption).toContain('record digest or key mismatch');
});

test('M04: reject duplicate IDs, invalid updates, and overwrite of an initialized store',async({page})=>{
  await boot(page);
  const fixture=await seed(page,26);
  const result=await page.evaluate(async fixture=>{
    const m=(window as any).ParallelM04Incremental;
    const badName=m.newLabName(),bad=m.createStore(badName);
    const duplicate=JSON.parse(JSON.stringify(fixture.snapshot));
    duplicate.messages[1].id=duplicate.messages[0].id;
    let invalid='';
    try{await bad.initialize({snapshot:duplicate,sourceSha256:fixture.sourceSha256});}
    catch(e){invalid=String((e as Error).message);}
    const name=m.newLabName(),store=m.createStore(name);
    await store.initialize(fixture);
    let overwrite='',missing='';
    try{await store.initialize(fixture);}catch(e){overwrite=String((e as Error).message);}
    try{await store.applyBatch({expectedRevision:1,changes:[
      {op:'delete',collection:'messages',id:'not-present'}
    ]});}catch(e){missing=String((e as Error).message);}
    return {invalid,overwrite,missing,state:await store.load(),
      source:localStorage.getItem('parallel-portable-v2')};
  },fixture);
  expect(result.invalid).toContain('duplicate record ID');
  expect(result.overwrite).toContain('refusing overwrite');
  expect(result.missing).toContain('cannot delete absent row');
  expect(result.state.revision).toBe(1);
  expect(result.state.data).toEqual(fixture.snapshot);
  expect(result.source).toBe(fixture.legacyRaw);
});
