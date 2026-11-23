import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const LAB_SCRIPT=fs.readFileSync(path.join(process.cwd(),'tests/fixtures/m03b-shadow-lab.js'),'utf8');
const KEY='parallel-portable-v2';

async function boot(page:any){
  const errors:string[]=[];
  page.on('pageerror',(e:Error)=>errors.push(String(e)));
  await page.goto('/Parallel/');
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).ParallelOffline))).toBe(true);
  await page.addScriptTag({content:LAB_SCRIPT});
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).M03BShadowLab))).toBe(true);
  return errors;
}
async function seed(page:any,{count=420,plain=false}={}){
  return page.evaluate(({count,plain,key}:{count:number,plain:boolean,key:string})=>{
    const engine=(window as any).ParallelOffline;
    const pack=JSON.parse(engine.exportData());
    const profileId='m03b-p',characterId='re-game:leon:re6',pair=profileId+'|'+characterId;
    pack.data.profiles=[{id:profileId,name:'Synthetic Profile',age:25,gender:'female',
      interested_in:['all'],min_age:18,max_age:65,sources:[],interests:['电影'],bio:'无现实身份',
      intent:'交朋友',avatar:'',role_character_id:'',created_at:'2026-11-20T10:00:00Z'}];
    pack.data.relations[pair]={profile_id:profileId,character_id:characterId,status:'matched',
      mode:'chat',active_meeting_id:'',updated_at:'2026-11-22T20:50:00Z'};
    const turn='现场说了今晚一起喝热汤，Leon认真回答；这是必须保存的中文原文 🐕‍🦺。';
    pack.data.messages=Array.from({length:count},(_,i)=>({
      id:'m03b-message-'+i,profile_id:profileId,character_id:characterId,
      meeting_id:i>=50&&i<110?'m03b-meeting':'',
      mode:i>=50&&i<110?'meeting':'chat',
      sender:i%2?'ai':'user',engine:i%2?'live':'human',
      text:turn.repeat(7)+' 第 '+i+' 条',
      created_at:new Date(Date.parse('2026-11-20T12:00:00Z')+i*60_000).toISOString()
    }));
    const rawMeeting=pack.data.messages.filter((m:any)=>m.meeting_id==='m03b-meeting');
    const meeting={
      id:'m03b-meeting',profile_id:profileId,character_id:characterId,
      started_at:'2026-11-22T16:10:00Z',ended_at:'2026-11-22T17:51:00Z',
      location:'安全屋露台',summary:'真实见面后结束',ai_summary:'真实见面后结束',
      message_ids:rawMeeting.map((m:any)=>m.id),entries:rawMeeting.map((m:any)=>({
        id:m.id,sender:m.sender,text:m.text,created_at:m.created_at
      })),location_history:[{at:'2026-11-22T16:10:00Z',location:'安全屋露台'}]
    };
    pack.data.meetings=[meeting];
    pack.data.episodicMemories=[{
      id:'m03b-memory',profile_id:profileId,owner_id:characterId,summary:'这场见面记得热汤',
      raw_msg_ids:meeting.message_ids,meeting_data:JSON.parse(JSON.stringify(meeting))
    }];
    pack.data.events=[{id:'m03b-event',profile_id:profileId,character_id:characterId,
      meeting_id:meeting.id,summary:'见面结束',created_at:meeting.ended_at}];
    pack.data.surveillance={[pair]:{byDate:{'2026-11-22':{
      date:'2026-11-22',slots:[{source:'meeting',location:'安全屋露台',activity:'喝热汤',start:'09:00',end:'09:51'}]}}}};
    pack.data.diaries={[pair]:{byDate:{'2026-11-22':{
      date:'2026-11-22',title:'《真实相处的一天》',content:'今晚见了面，随后各自安排生活。'}}}};
    pack.data.presets.push({id:'m03b-personal-preset',name:'私有提示词',mode:'meeting',
      role:'system',enabled:true,sort_order:42,content:'保持每场见面的完整事实链。'});
    pack.data.messages[0].photo_kind='gallery';
    pack.data.messages[0].photo_ref='synthetic-gallery-1';
    // Only test-generated input. No real photo bytes are accessed.
    engine.importData(JSON.stringify(pack));
    if(plain)localStorage.setItem(key,JSON.stringify(pack.data));
    const backup=JSON.parse(engine.exportData());
    backup.chatPhotoFiles=[{ref:'synthetic-gallery-1',data:'data:image/jpeg;base64,AQID'}];
    return {
      backup:JSON.stringify(backup),
      source:localStorage.getItem(key),
      expectedData:backup.data,
      counts:{messages:count,meetings:1,episodicMemories:1,chatPhotoFiles:1}
    };
  },{count,plain,key:KEY});
}

test('M03-B: atomically partition synthetic legacy save, photos, meetings and memories in isolated IDB',async({page})=>{
  const errors=await boot(page);
  const start=await seed(page,{count:480});
  const result=await page.evaluate(async backup=>{
    const lab=(window as any).M03BShadowLab;
    const status=await lab.stage({name:'parallel-m03b-lab-full',backup});
    const loaded=await lab.loadLab('parallel-m03b-lab-full');
    return {status,restored:loaded.pack,original:localStorage.getItem('parallel-portable-v2')};
  },start.backup);
  expect(result.status.verified).toBe(true);
  expect(result.status.counts.messages).toBe(480);
  expect(result.status.counts.meetings).toBe(1);
  expect(result.status.counts.episodicMemories).toBe(1);
  expect(result.status.counts.chatPhotoFiles).toBe(1);
  expect(result.status.sourceStillAuthoritative).toBe(true);
  expect(result.original).toBe(start.source);
  expect(result.restored).toEqual(JSON.parse(start.backup));
  expect(result.restored.data.meetings[0].entries.at(-1).text).toContain('中文原文 🐕‍🦺');
  expect(result.restored.data.episodicMemories[0].meeting_data.entries.at(-1).text)
    .toBe(result.restored.data.meetings[0].entries.at(-1).text);
  expect(result.restored.data.diaries['m03b-p|re-game:leon:re6'].byDate['2026-11-22'].content)
    .toContain('随后各自安排生活');
  expect(result.restored.chatPhotoFiles[0].ref).toBe('synthetic-gallery-1');
  expect(errors).toEqual([]);
});

test('M03-B: abort, recovery, source-change detection and corrupted candidate fail closed',async({page})=>{
  const errors=await boot(page);
  const first=await seed(page,{count:70,plain:true});
  const before=await page.evaluate(async backup=>{
    const lab=(window as any).M03BShadowLab;
    const s=await lab.stage({name:'parallel-m03b-lab-faults',backup});
    return {status:s,copy:(await lab.loadLab('parallel-m03b-lab-faults')).pack};
  },first.backup);
  expect(before.status.sourceEncoding).toBe('plain-json');
  expect(before.copy).toEqual(JSON.parse(first.backup));
  const second=await seed(page,{count:76,plain:false});
  const failed=await page.evaluate(async backup=>{
    const lab=(window as any).M03BShadowLab,source=localStorage.getItem('parallel-portable-v2');
    let error='';
    try{await lab.stage({name:'parallel-m03b-lab-faults',backup,fault:'mid-write-abort'});}
    catch(e){error=String((e as Error).message);}
    const old=(await lab.loadLab('parallel-m03b-lab-faults',{requireCurrent:false})).pack;
    let stale='';
    try{await lab.loadLab('parallel-m03b-lab-faults');}catch(e){stale=String((e as Error).message);}
    return {error,stale,old,unchanged:localStorage.getItem('parallel-portable-v2')===source};
  },second.backup);
  expect(failed.error).toMatch(/abort|failed|failure/);
  expect(failed.unchanged).toBe(true);
  expect(failed.old).toEqual(JSON.parse(first.backup));
  expect(failed.stale).toContain('stale');
  const recovered=await page.evaluate(async backup=>{
    const lab=(window as any).M03BShadowLab,source=localStorage.getItem('parallel-portable-v2');
    let interrupted='';
    try{await lab.stage({name:'parallel-m03b-lab-faults',backup,fault:'after-commit-interrupt'});}
    catch(e){interrupted=String((e as Error).message);}
    const copy=(await lab.loadLab('parallel-m03b-lab-faults')).pack;
    return {interrupted,copy,unchanged:localStorage.getItem('parallel-portable-v2')===source};
  },second.backup);
  expect(recovered.interrupted).toContain('interrupted');
  expect(recovered.copy).toEqual(JSON.parse(second.backup));
  expect(recovered.unchanged).toBe(true);
  const corruption=await page.evaluate(async()=>{
    const db=await new Promise<IDBDatabase>((resolve,reject)=>{
      const req=indexedDB.open('parallel-m03b-lab-faults',1);
      req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
    });
    await new Promise<void>((resolve,reject)=>{
      const tx=db.transaction('records','readwrite');
      tx.objectStore('records').put({id:'m03b-message-0',text:'TAMPERED'},['messages',0]);
      tx.oncomplete=()=>resolve();
      tx.onerror=tx.onabort=()=>reject(tx.error);
    });db.close();
    let error='';
    try{await (window as any).M03BShadowLab.loadLab('parallel-m03b-lab-faults');}
    catch(e){error=String((e as Error).message);}
    return error;
  });
  expect(corruption).toContain('digest mismatch');
  expect(errors).toEqual([]);
});
