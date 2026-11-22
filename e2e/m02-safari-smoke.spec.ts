import {test,expect} from '@playwright/test';

declare global {
  interface Window { ParallelOffline?: {exportData():string;importData(raw:string):unknown;request(path:string,data?:unknown):Promise<unknown>}; }
}
test.use({browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true});

test('C-18: production bundle boots in mobile WebKit with matched browser scripts',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',error=>errors.push(String(error)));
  await page.goto('/Parallel/');
  try{
    await expect.poll(()=>page.evaluate(()=>Boolean(window.ParallelOffline)),{timeout:6500}).toBe(true);
  }catch{
    const diagnostic=await page.evaluate(()=>({
      href:location.href,title:document.title,
      root:document.querySelector('#root')?.textContent?.slice(0,220),
      scripts:[...document.querySelectorAll('script[src]')].map(x=>x.getAttribute('src')),
      assets:performance.getEntriesByType('resource').filter(x=>x.name.includes('.js')).slice(-8).map(x=>x.name)
    }));
    throw new Error('WebKit startup diagnostic: '+JSON.stringify({diagnostic,errors}));
  }
  await expect(page.locator('#mobile-nav [data-action="nav"]')).toHaveCount(4);
  const loaded=await page.evaluate(()=>{
    const urls=[...document.querySelectorAll<HTMLScriptElement>('script[src]')].map(x=>x.src);
    return {
      engine: urls.find(x=>x.includes('/parallel/offline.js')),
      interface: urls.find(x=>x.includes('/parallel/app.js')),
      backup:JSON.parse(window.ParallelOffline!.exportData()).format
    };
  });
  expect(loaded.engine).toMatch(/\/Parallel\/parallel\/offline\.js\?v=m02-diary-evidence-20261122a$/);
  expect(loaded.interface).toMatch(/\/Parallel\/parallel\/app\.js\?v=/);
  expect(loaded.backup).toBe('parallel-portable-backup');
  expect(errors).toEqual([]);
});

test('C-18: long Unicode archive survives iPhone-size reload and opens a real thread',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('/Parallel/');
  try{
    await expect.poll(()=>page.evaluate(()=>Boolean(window.ParallelOffline)),{timeout:6500}).toBe(true);
  }catch{
    const diagnostic=await page.evaluate(()=>({
      href:location.href,title:document.title,
      root:document.querySelector('#root')?.textContent?.slice(0,220),
      scripts:[...document.querySelectorAll('script[src]')].map(x=>x.getAttribute('src')),
      assets:performance.getEntriesByType('resource').filter(x=>x.name.includes('.js')).slice(-8).map(x=>x.name)
    }));
    throw new Error('WebKit startup diagnostic: '+JSON.stringify({diagnostic,errors}));
  }
  await page.evaluate(()=>{
    const engine=window.ParallelOffline!;
    const pack=JSON.parse(engine.exportData());
    const pid='m02-webkit',cid='re-game:carlos:re3',pair=pid+'|'+cid;
    pack.data.profiles=[{
      id:pid,name:'M02 Test Profile',age:25,gender:'female',
      interested_in:['all'],min_age:18,max_age:65,sources:[],
      interests:['电影'],bio:'只存在于自动测试里',intent:'了解彼此',
      avatar:'',role_character_id:'',created_at:'2026-11-20T00:00:00Z'
    }];
    pack.data.relations[pair]={
      profile_id:pid,character_id:cid,status:'matched',mode:'chat',
      active_meeting_id:'',updated_at:'2026-11-22T20:50:00Z'
    };
    pack.data.messages=Array.from({length:280},(_,i)=>({
      id:'m02-webkit-msg-'+i,profile_id:pid,character_id:cid,
      mode:'chat',sender:i%2?'ai':'user',engine:i%2?'live':'human',
      text:'M02长记录 '+i+'：电影、热汤、卷毛与表情 🐕‍🦺 汉字的安全保存。'.repeat(4),
      created_at:new Date(Date.parse('2026-11-20T12:00:00Z')+i*60_000).toISOString()
    }));
    // The archive card must reference a real original meeting message.
    // Orphan cards without source messages are intentionally pruned by
    // ensureMeetingRecords; the test must not inject an impossible state.
    pack.data.messages.push({
      id:'archive-only',profile_id:pid,character_id:cid,
      mode:'meeting',meeting_id:'m02-webkit-meeting',
      sender:'ai',engine:'live',text:'很长的历史也要记住。',
      created_at:'2026-11-22T17:30:00Z'
    });
    pack.data.messages.push({
      id:'m02-webkit-last',profile_id:pid,character_id:cid,
      mode:'chat',sender:'user',engine:'human',
      text:'WebKit 刷新后的消息没有消失 🐕‍🦺',
      created_at:'2026-11-22T20:50:00Z'
    });
    pack.data.meetings=[{
      id:'m02-webkit-meeting',profile_id:pid,character_id:cid,
      started_at:'2026-11-22T16:00:00Z',ended_at:'2026-11-22T17:51:00Z',
      finished_at:'2026-11-22T17:51:00Z',location:'宿舍露台',
      summary:'在露台见过面。',ai_summary:'在露台见过面。',
      message_ids:['archive-only'],entries:[{id:'archive-only',sender:'ai',text:'很长的历史也要记住。',created_at:'2026-11-22T17:30:00Z'}]
    }];
    engine.importData(JSON.stringify(pack));
    localStorage.setItem('parallel-active-profile',pid);
  });
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>window.ParallelOffline&&JSON.parse(window.ParallelOffline.exportData()).data.messages.length)).toBe(282);
  // A new isolated mobile browser legitimately prompts for Demo vs Normal
  // if no API key is configured. Exercise the real no-API choice instead of
  // forcing a click through the blocking dialog.
  const modeChoice=page.locator('#modal-overlay [data-action="choose-api-mode"][data-demo="no"]');
  await modeChoice.waitFor({state:'visible',timeout:10000});
  await modeChoice.click();
  await expect(page.locator('#modal-overlay')).toHaveCount(0);
  await page.locator('#mobile-nav [data-action="nav"][data-tab="messages"]').click();
  await expect(page.locator('.thread-card')).toHaveCount(1);
  await page.locator('.thread-card').first().click();
  await expect(page.locator('#view')).toContainText('WebKit 刷新后的消息没有消失');
  await expect.poll(()=>page.evaluate(()=>{
    const data=JSON.parse(window.ParallelOffline!.exportData()).data;
    return data.meetings[0].entries[0].text;
  })).toBe('很长的历史也要记住。');
  await page.reload();
  try{
    await expect.poll(()=>page.evaluate(()=>Boolean(window.ParallelOffline)),{timeout:6500}).toBe(true);
  }catch{
    const diagnostic=await page.evaluate(()=>({
      href:location.href,title:document.title,
      root:document.querySelector('#root')?.textContent?.slice(0,220),
      scripts:[...document.querySelectorAll('script[src]')].map(x=>x.getAttribute('src')),
      assets:performance.getEntriesByType('resource').filter(x=>x.name.includes('.js')).slice(-8).map(x=>x.name)
    }));
    throw new Error('WebKit startup diagnostic: '+JSON.stringify({diagnostic,errors}));
  }
  const state=await page.evaluate(()=>{
    const d=JSON.parse(window.ParallelOffline!.exportData()).data;
    return {count:d.messages.length,tail:d.messages.at(-1)?.text,meeting:d.meetings[0]?.id,profile:d.profiles[0]?.name};
  });
  expect(state).toEqual({count:282,tail:'WebKit 刷新后的消息没有消失 🐕‍🦺',
    meeting:'m02-webkit-meeting',profile:'M02 Test Profile'});
  expect(errors).toEqual([]);
});