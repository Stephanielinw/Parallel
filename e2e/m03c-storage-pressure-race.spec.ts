import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

// Synthetic data only. These scripts never ship inside dist/Parallel.
const B=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/m03b-shadow-lab.js'),'utf8');
const C=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/m03c-shadow-challenge.js'),'utf8');
const KEY='parallel-portable-v2';
const PHOTO='data:image/jpeg;base64,AQID';

async function boot(page:any){
  await page.goto('/Parallel/');
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).ParallelOffline))).toBe(true);
  await page.addScriptTag({content:B});
  await page.addScriptTag({content:C});
}
async function seed(page:any,count:number){
  return page.evaluate(async ({count,key,photo}:{count:number,key:string,photo:string})=>{
    const engine=(window as any).ParallelOffline;
    const backup=JSON.parse(engine.exportData());
    const pid='m03c-synthetic',cid='re-game:leon:re6';
    backup.data.profiles=[{id:pid,name:'Synthetic only',age:25,gender:'female',
      interested_in:['all'],min_age:18,max_age:65,sources:[],interests:['电影'],
      bio:'synthetic',intent:'交朋友',avatar:'',role_character_id:'',created_at:'2026-11-20T10:00:00Z'}];
    backup.data.messages=Array.from({length:count},(_,i)=>({
      id:'m03c-msg-'+i,profile_id:pid,character_id:cid,
      sender:i%2?'ai':'user',engine:i%2?'live':'human',mode:'chat',
      text:'真实原文不能丢 🐕‍🦺。'.repeat(24)+' #'+i,
      created_at:new Date(Date.parse('2026-11-20T10:00:00Z')+i*60000).toISOString()
    }));
    backup.data.messages[0].photo_kind='gallery';
    backup.data.messages[0].photo_ref='m03c-photo';
    backup.data.meetings=[{id:'m03c-meeting',profile_id:pid,character_id:cid,
      started_at:'2026-11-20T12:00:00Z',ended_at:'2026-11-20T13:00:00Z',
      entries:[{id:'m03c-entry',text:'见面时一起吃了晚饭 🐕‍🦺'}],
      summary:'合成记录',message_ids:[]}];
    backup.data.episodicMemories=[{id:'m03c-memory',profile_id:pid,owner_id:cid,
      summary:'合成见面',meeting_data:backup.data.meetings[0]}];
    engine.importData(JSON.stringify(backup));
    // Populate ONLY the throwaway WebKit context's actual photo store.
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos');
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite');
      tx.objectStore('photos').put(photo,'m03c-photo');
      tx.oncomplete=()=>resolve();
      tx.onabort=tx.onerror=()=>reject(tx.error);
    });
    db.close();
    const token=await (window as any).M03CShadowProbe.capture();
    const complete=JSON.parse(token.backup);
    complete.chatPhotoFiles=[{ref:'m03c-photo',data:photo}];
    return {backup:JSON.stringify(complete),sourceSha256:token.sourceSha256,
      original:localStorage.getItem(key),count};
  },{count,key:KEY,photo:PHOTO});
}
async function makeToken(page:any){
  return page.evaluate(async photo=>{
    const token=await (window as any).M03CShadowProbe.capture();
    const pack=JSON.parse(token.backup);
    pack.chatPhotoFiles=[{ref:'m03c-photo',data:photo}];
    return {...token,backup:JSON.stringify(pack)};
  },PHOTO);
}
async function stage(page:any,token:any,fault=''){
  return page.evaluate(({token,fault}:{token:any,fault:string})=>{
    const probe=(window as any).M03CShadowProbe;
    return probe.stage({name:probe.newName(),...token,fault});
  },{token,fault});
}
test('M03-C: simulated quota abort preserves prior verified generation and localStorage',async({page})=>{
  await boot(page);
  const fixture=await seed(page,360);
  const first=await page.evaluate(async token=>{
    const probe=(window as any).M03CShadowProbe;
    const name=probe.newName();
    const result=await probe.stage({name,...token});
    return {name,result};
  },fixture);
  expect(first.result.verified).toBe(true);
  expect(first.result.photoCount).toBe(1);
  const fault=await page.evaluate(async ({name,token})=>{
    const lab=(window as any).M03BShadowLab;
    const probe=(window as any).M03CShadowProbe;
    const original=localStorage.getItem('parallel-portable-v2');
    let error='',kind='';
    try{await lab.stage({name,backup:token.backup,fault:'simulated-quota-abort'});}
    catch(e){error=String((e as Error).message);kind=(e as Error).name;}
    const intact=await probe.verify({name,...token});
    return {error,kind,intact,unchanged:localStorage.getItem('parallel-portable-v2')===original};
  },{name:first.name,token:fixture});
  expect(fault.kind).toBe('QuotaExceededError');
  expect(fault.error).toContain('Simulated');
  expect(fault.intact.verified).toBe(true);
  expect(fault.unchanged).toBe(true);
  const freshFail=await page.evaluate(async token=>{
    const probe=(window as any).M03CShadowProbe,lab=(window as any).M03BShadowLab;
    const name=probe.newName();
    let error='',uncommitted='';
    try{await probe.stage({name,...token,fault:'simulated-quota-abort'});}
    catch(e){error=String((e as Error).message);}
    try{await lab.loadLab(name);}catch(e){uncommitted=String((e as Error).message);}
    return {error,uncommitted};
  },fixture);
  expect(freshFail.error).toContain('Simulated');
  expect(freshFail.uncommitted).toContain('No committed');
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(fixture.original);
});

test('M03-C: stale second tab cannot publish, concurrent fresh tabs use disjoint generations',async({page,context})=>{
  await boot(page);
  await seed(page,55);
  const other=await context.newPage();
  await boot(other);
  const stale=await makeToken(other);
  const newer=await seed(page,63);
  const rejection=await other.evaluate(async token=>{
    const probe=(window as any).M03CShadowProbe;
    try{await probe.stage({name:probe.newName(),...token});return 'UNSAFE SUCCESS';}
    catch(e){return String((e as Error).message);}
  },stale);
  expect(rejection).toContain('stale source token');
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(newer.original);
  // Reload tab two so both engines observe the same *new* source.
  await boot(other);
  const fromOther=await makeToken(other);
  const both=await Promise.all([stage(page,newer),stage(other,fromOther)]);
  expect(both[0].verified).toBe(true);
  expect(both[1].verified).toBe(true);
  expect(both[0].name).not.toBe(both[1].name);
  const snapshots=await page.evaluate(async names=>{
    const lab=(window as any).M03BShadowLab;
    return Promise.all(names.map(async (name:string)=>(await lab.loadLab(name)).pack.data.messages.length));
  },both.map(x=>x.name));
  expect(snapshots).toEqual([63,63]);
  expect(await page.evaluate(key=>localStorage.getItem(key),KEY)).toBe(newer.original);
  await other.close();
});

test('M03-C: photo source divergence rejects verification, existing shadow never promoted',async({page})=>{
  await boot(page);
  const fixture=await seed(page,84);
  const first=await stage(page,fixture);
  expect(first.verified).toBe(true);
  const outcome=await page.evaluate(async token=>{
    const probe=(window as any).M03CShadowProbe;
    const original=localStorage.getItem('parallel-portable-v2');
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('photos','readwrite');
      tx.objectStore('photos').put('data:image/jpeg;base64,BAUG','m03c-photo');
      tx.oncomplete=()=>resolve();tx.onabort=tx.onerror=()=>reject(tx.error);
    });
    db.close();
    let readError='',stageError='';
    try{await probe.verify({name:token.name,sourceSha256:token.sourceSha256,backup:token.backup});}
    catch(e){readError=String((e as Error).message);}
    try{await probe.stage({name:probe.newName(),sourceSha256:token.sourceSha256,backup:token.backup});}
    catch(e){stageError=String((e as Error).message);}
    const intact=await (window as any).M03BShadowLab.loadLab(token.name);
    return {readError,stageError,unchanged:localStorage.getItem('parallel-portable-v2')===original,
      oldRows:intact.pack.data.messages.length};
  },{...fixture,name:first.name});
  expect(outcome.readError).toContain('source photo missing or changed');
  expect(outcome.stageError).toContain('source photo missing or changed');
  expect(outcome.unchanged).toBe(true);
  expect(outcome.oldRows).toBe(84);
});
