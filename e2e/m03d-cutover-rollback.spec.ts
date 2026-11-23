import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// TEST-ONLY scripts, injected in throwaway WebKit context: not in dist.
const B=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/m03b-shadow-lab.js'),'utf8');
const C=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/m03c-shadow-challenge.js'),'utf8');
const D=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/m03d-cutover-rehearsal.js'),'utf8');
const KEY='parallel-portable-v2';
const PHOTO='data:image/jpeg;base64,AQID';

async function boot(page:any){
  await page.goto('/Parallel/');
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).ParallelOffline))).toBe(true);
  await page.addScriptTag({content:B});
  await page.addScriptTag({content:C});
  await page.addScriptTag({content:D});
}
async function seed(page:any,count=66){
  return page.evaluate(async({count,photo,key}:{count:number,photo:string,key:string})=>{
    const engine=(window as any).ParallelOffline;
    const pack=JSON.parse(engine.exportData());
    const pid='m03d-synthetic',cid='re-game:leon:re6';
    pack.data.profiles=[{id:pid,name:'Synthetic Test',age:25,gender:'female',
      interested_in:['all'],min_age:18,max_age:65,sources:[],interests:['电影'],bio:'lab',
      intent:'交朋友',avatar:'',role_character_id:'',created_at:'2026-11-20T10:00:00Z'}];
    pack.data.messages=Array.from({length:count},(_,i)=>({
      id:'m03d-msg-'+i,profile_id:pid,character_id:cid,
      sender:i%2?'ai':'user',engine:i%2?'live':'human',mode:'chat',
      text:'中文、Emoji、完整原文 🐕‍🦺。'.repeat(12)+' '+i,
      created_at:new Date(Date.parse('2026-11-20T10:00:00Z')+i*60000).toISOString()
    }));
    pack.data.messages[0].photo_kind='gallery';
    pack.data.messages[0].photo_ref='m03d-photo';
    pack.data.meetings=[{id:'m03d-meeting',profile_id:pid,character_id:cid,
      started_at:'2026-11-20T12:00:00Z',ended_at:'2026-11-20T13:00:00Z',
      entries:[{id:'m03d-entry',text:'见面记录原文绝不能消失 🐕‍🦺'}],
      message_ids:[],summary:'合成见面'}];
    pack.data.episodicMemories=[{id:'m03d-memory',profile_id:pid,owner_id:cid,
      summary:'记得这次见面',meeting_data:pack.data.meetings[0]}];
    pack.data.diaries={[pid+'|'+cid]:{byDate:{'2026-11-20':{
      date:'2026-11-20',content:'真实事实来源合成测试日记'}}}};
    pack.data.surveillance={[pid+'|'+cid]:{byDate:{'2026-11-20':{
      date:'2026-11-20',slots:[{source:'meeting',activity:'一起吃饭',start:'12:00',end:'13:00'}]}}}};
    engine.importData(JSON.stringify(pack));
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos');
      };
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite');
      tx.objectStore('photos').put(photo,'m03d-photo');
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
    });db.close();
    const captured=await (window as any).M03CShadowProbe.capture();
    const full=JSON.parse(captured.backup);
    full.chatPhotoFiles=[{ref:'m03d-photo',data:photo}];
    return {sourceSha256:captured.sourceSha256,backup:JSON.stringify(full),
      original:localStorage.getItem(key),count};
  },{count,photo:PHOTO,key:KEY});
}
async function prepare(page:any,token:any){
  return page.evaluate(async token=>{
    const ctl=(window as any).M03DCutoverRehearsal;
    const name=(window as any).M03CShadowProbe.newName();
    return ctl.stageCandidate({name,...token});
  },token);
}

test('M03-D: switch lab read route, reload, rollback without editing legacy or photos',async({page})=>{
  await boot(page);
  const token=await seed(page,75);
  const candidate=await prepare(page,token);
  const controlName=await page.evaluate(()=> (window as any).M03DCutoverRehearsal.newControlName());
  const original=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readPreview(name),controlName);
  expect(original.origin).toBe('legacy');
  expect(original.state.revision).toBe(0);
  const armed=await page.evaluate(({controlName,candidate})=>
    (window as any).M03DCutoverRehearsal.switchToShadow({controlName,expectedRevision:0,candidate}),
    {controlName,candidate});
  expect(armed.mode).toBe('shadow');
  expect(armed.revision).toBe(1);
  const preview=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readPreview(name),controlName);
  expect(preview.origin).toBe('shadow');
  expect(preview.data.messages).toHaveLength(75);
  expect(preview.data.meetings[0].entries[0].text).toContain('原文绝不能消失');
  expect(preview.data.episodicMemories[0].meeting_data.entries[0].text)
    .toBe(preview.data.meetings[0].entries[0].text);
  expect(preview.data.diaries['m03d-synthetic|re-game:leon:re6'].byDate['2026-11-20'].content)
    .toContain('合成测试日记');
  expect(preview.photos[0].ref).toBe('m03d-photo');
  await boot(page); // Simulates refresh/app restart: the lab route survived in IDB.
  const recovered=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readPreview(name),controlName);
  expect(recovered.state.revision).toBe(1);
  expect(recovered.origin).toBe('shadow');
  expect(recovered.data.messages).toEqual(preview.data.messages);
  const rolled=await page.evaluate(name=>
    (window as any).M03DCutoverRehearsal.rollback({controlName:name,expectedRevision:1}),controlName);
  expect(rolled.mode).toBe('legacy');
  expect(rolled.revision).toBe(2);
  const after=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readPreview(name),controlName);
  expect(after.origin).toBe('legacy');
  expect(after.data.messages).toEqual(preview.data.messages);
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(token.original);
  const intact=await page.evaluate(name=> (window as any).M03BShadowLab.loadLab(name),candidate.name);
  expect(intact.pack.data.messages).toHaveLength(75);
});

test('M03-D: concurrent tabs cannot overwrite route without matching revision',async({page,context})=>{
  await boot(page);
  const token=await seed(page,48);
  const candidate=await prepare(page,token);
  const name=await page.evaluate(()=> (window as any).M03DCutoverRehearsal.newControlName());
  const other=await context.newPage();
  await boot(other);
  const ops=await Promise.allSettled([page,other].map(tab=>tab.evaluate(({name,candidate})=>
    (window as any).M03DCutoverRehearsal.switchToShadow({
      controlName:name,expectedRevision:0,candidate
    }),{name,candidate})));
  expect(ops.filter(v=>v.status==='fulfilled')).toHaveLength(1);
  expect(ops.filter(v=>v.status==='rejected')).toHaveLength(1);
  const loser=ops.find(v=>v.status==='rejected') as PromiseRejectedResult;
  expect(String(loser.reason)).toContain('revision conflict');
  const snapshot=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readState(name),name);
  expect(snapshot.revision).toBe(1);
  expect(snapshot.mode).toBe('shadow');
  const rollbackError=await other.evaluate(async name=>{
    try{
      await (window as any).M03DCutoverRehearsal.rollback({controlName:name,expectedRevision:0});
      return 'UNSAFE SUCCESS';
    }catch(e){return String((e as Error).message);}
  },name);
  expect(rollbackError).toContain('revision conflict');
  const rolled=await page.evaluate(name=>
    (window as any).M03DCutoverRehearsal.rollback({controlName:name,expectedRevision:1}),name);
  expect(rolled.revision).toBe(2);
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(token.original);
  await other.close();
});

test('M03-D: interrupted route commit is recoverable; corrupted shadow fails closed',async({page})=>{
  await boot(page);
  const token=await seed(page,57);
  const candidate=await prepare(page,token);
  const name=await page.evaluate(()=> (window as any).M03DCutoverRehearsal.newControlName());
  const failure=await page.evaluate(async ({name,candidate})=>{
    try{
      await (window as any).M03DCutoverRehearsal.switchToShadow({
        controlName:name,expectedRevision:0,candidate,fault:'after-pointer-commit'
      });
      return 'UNSAFE SUCCESS';
    }catch(e){return String((e as Error).message);}
  },{name,candidate});
  expect(failure).toContain('lost acknowledgement');
  await boot(page);
  const committed=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readPreview(name),name);
  expect(committed.state.mode).toBe('shadow');
  expect(committed.data.messages).toHaveLength(57);
  const corruption=await page.evaluate(async ({name,candidate})=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open(candidate.name,1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('records','readwrite');
      tx.objectStore('records').put({id:'m03d-msg-0',text:'TAMPERED'},['messages',0]);
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
    });db.close();
    let failure='';
    try{await (window as any).M03DCutoverRehearsal.readPreview(name);}
    catch(e){failure=String((e as Error).message);}
    const route=await (window as any).M03DCutoverRehearsal.readState(name);
    const rolled=await (window as any).M03DCutoverRehearsal.rollback({
      controlName:name,expectedRevision:route.revision
    });
    return {failure,rolled};
  },{name,candidate});
  expect(corruption.failure).toContain('digest mismatch');
  expect(corruption.rolled.mode).toBe('legacy');
  const after=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readPreview(name),name);
  expect(after.data.messages).toHaveLength(57);
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(token.original);
});

test('M03-D: photo divergence or newer legacy source blocks shadow read, permits rollback',async({page})=>{
  await boot(page);
  const token=await seed(page,35);
  const candidate=await prepare(page,token);
  const name=await page.evaluate(()=> (window as any).M03DCutoverRehearsal.newControlName());
  await page.evaluate(({name,candidate})=>
    (window as any).M03DCutoverRehearsal.switchToShadow({
      controlName:name,expectedRevision:0,candidate
    }),{name,candidate});
  const failedPhoto=await page.evaluate(async name=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite');
      tx.objectStore('photos').put('data:image/jpeg;base64,BAUG','m03d-photo');
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
    });db.close();
    try{await (window as any).M03DCutoverRehearsal.readPreview(name);return 'UNSAFE SUCCESS';}
    catch(e){return String((e as Error).message);}
  },name);
  expect(failedPhoto).toContain('source photo missing or changed');
  await page.evaluate(name=>
    (window as any).M03DCutoverRehearsal.rollback({controlName:name,expectedRevision:1}),name);
  // Changing the authoritative legacy save invalidates a previously verified
  // shadow generation, even when that generation's own records are intact.
  const second=await page.evaluate(async ({name,photo})=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite');
      tx.objectStore('photos').put(photo,'m03d-photo');
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
    });db.close();
    const ctr=(window as any).M03DCutoverRehearsal;
    const next=await ctr.switchToShadow({controlName:name,expectedRevision:2,
      candidate:(window as any).__m03dCandidateForTest});
    return next;
  },{name,photo:PHOTO}).catch(e=>String(e));
  // The test deliberately requires an explicit fresh candidate token rather
  // than accepting a missing or implicit candidate from another page.
  expect(String(second)).toContain('disposable verified shadow generation');
  const armed=await page.evaluate(({name,candidate})=>
    (window as any).M03DCutoverRehearsal.switchToShadow({
      controlName:name,expectedRevision:2,candidate
    }),{name,candidate});
  expect(armed.revision).toBe(3);
  const changed=await page.evaluate(async name=>{
    const api=(window as any).ParallelOffline;
    const pack=JSON.parse(api.exportData());
    pack.data.messages.push({
      id:'m03d-new-legacy-record',profile_id:'m03d-synthetic',
      character_id:'re-game:leon:re6',sender:'user',engine:'human',
      mode:'chat',text:'新的真实原文',created_at:'2026-11-21T12:00:00Z'
    });
    api.importData(JSON.stringify(pack));
    let error='';
    try{await (window as any).M03DCutoverRehearsal.readPreview(name);}
    catch(e){error=String((e as Error).message);}
    const rolled=await (window as any).M03DCutoverRehearsal.rollback({
      controlName:name,expectedRevision:3
    });
    return {error,rolled,newSource:localStorage.getItem('parallel-portable-v2')};
  },name);
  expect(changed.error).toMatch(/stale|legacy source changed/);
  expect(changed.rolled.mode).toBe('legacy');
  expect(changed.newSource).not.toBe(token.original);
  const restored=await page.evaluate(name=> (window as any).M03DCutoverRehearsal.readPreview(name),name);
  expect(restored.data.messages.at(-1).id).toBe('m03d-new-legacy-record');
});
