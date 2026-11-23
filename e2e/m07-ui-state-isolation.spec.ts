import {test,expect} from '@playwright/test';

declare global {
  interface Window {
    ParallelOffline?:{exportData():string;importData(text:string):unknown;request(path:string,data?:unknown):Promise<any>};
    __m07Release?:()=>void;
    __m07Requested?:boolean;
  }
}
test.use({browserName:'webkit',viewport:{width:390,height:844},isMobile:true,hasTouch:true});

const CID='re-game:carlos:re3';
async function setupTwoProfiles(page:any){
  await page.goto('/Parallel/');
  await expect.poll(()=>page.evaluate(()=>Boolean(window.ParallelOffline)),{timeout:12000}).toBe(true);
  await page.evaluate((cid:string)=>{
    const engine=window.ParallelOffline!;
    const pack=JSON.parse(engine.exportData());
    const date='2026-11-21T10:00:00Z';
    pack.data.profiles=['p1','p2'].map((id,i)=>({
      id,name:i?'Profile B':'Profile A',age:25,gender:'female',
      interested_in:['all'],min_age:18,max_age:65,sources:[],
      interests:[],bio:'M07 isolated UI test only',intent:'认识朋友',
      avatar:'',role_character_id:'',created_at:date
    }));
    pack.data.messages=['p1','p2'].map((id,i)=>({
      id:'m07-'+id,profile_id:id,character_id:cid,
      mode:'chat',sender:'ai',engine:'live',
      text:i?'这是 B 的聊天内容':'这是 A 的聊天内容',
      created_at:date
    }));
    pack.data.relations={
      ['p1|'+cid]:{profile_id:'p1',character_id:cid,status:'matched',
        mode:'chat',active_meeting_id:'',updated_at:date},
      ['p2|'+cid]:{profile_id:'p2',character_id:cid,status:'matched',
        mode:'chat',active_meeting_id:'',updated_at:date}
    };
    engine.importData(JSON.stringify(pack));
    localStorage.setItem('parallel-active-profile','p1');
  },CID);
  await page.reload();
  await expect.poll(()=>page.evaluate(()=>Boolean(window.ParallelOffline)),{timeout:12000}).toBe(true);
  const modeChoice=page.locator('#modal-overlay [data-action="choose-api-mode"][data-demo="no"]');
  if(await modeChoice.isVisible().catch(()=>false))await modeChoice.click();
  else if(await page.locator('#modal-overlay').isVisible().catch(()=>false)){
    await page.locator('#modal-overlay [data-action="close-modal"]').first().click();
  }
  await page.locator('#mobile-nav [data-action="nav"][data-tab="messages"]').click();
  await expect(page.locator('.thread-card')).toHaveCount(1);
  await page.locator('.thread-card').first().click();
  await expect(page.locator('#chat-input')).toBeVisible();
}
async function switchProfile(page:any,to:string){
  await page.locator('[data-action="toggle-profile-menu"]').first().click();
  await expect(page.locator('[data-action="quick-switch-profile"][data-id="'+to+'"]')).toBeVisible();
  await page.locator('[data-action="quick-switch-profile"][data-id="'+to+'"]').click();
  await expect(page.locator('.thread-card')).toHaveCount(1);
  await page.locator('.thread-card').first().click();
  await expect(page.locator('#chat-input')).toBeVisible();
}
test('M07: same Carlos, two Profiles never inherit each other\'s unsent drafts',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await setupTwoProfiles(page);
  await expect(page.locator('#view')).toContainText('这是 A 的聊天内容');
  await page.locator('#chat-input').fill('P1 的私密草稿：等我忙完再找你 🐕‍🦺');
  await switchProfile(page,'p2');
  await expect(page.locator('#view')).toContainText('这是 B 的聊天内容');
  await expect(page.locator('#view')).not.toContainText('这是 A 的聊天内容');
  await expect(page.locator('#chat-input')).toHaveValue('');
  await page.locator('#chat-input').fill('P2 不同的故事 🦋');
  await switchProfile(page,'p1');
  await expect(page.locator('#chat-input')).toHaveValue('P1 的私密草稿：等我忙完再找你 🐕‍🦺');
  await expect(page.locator('#view')).toContainText('这是 A 的聊天内容');
  await expect(page.locator('#view')).not.toContainText('这是 B 的聊天内容');
  await switchProfile(page,'p2');
  await expect(page.locator('#chat-input')).toHaveValue('P2 不同的故事 🦋');
  expect(errors).toEqual([]);
});

test('M07: a closed pending memory modal may not resurrect after its slow request completes',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await setupTwoProfiles(page);
  await page.evaluate(()=>{
    const engine=window.ParallelOffline!;
    const old=engine.request.bind(engine);
    window.__m07Requested=false;
    engine.request=async(path:string,data?:unknown)=>{
      if(path.startsWith('/memories?')&&!window.__m07Requested){
        window.__m07Requested=true;
        await new Promise<void>(r=>{window.__m07Release=r;});
      }
      return old(path,data);
    };
  });
  await page.locator('[data-action="open-char-hub"]').click();
  await expect(page.locator('#modal-overlay')).toBeVisible();
  await page.locator('#modal-overlay [data-action="open-memories"]').click();
  await expect.poll(()=>page.evaluate(()=>window.__m07Requested)).toBe(true);
  // The character hub stays visible while the request is pending. Close it.
  await page.locator('#modal-overlay [data-action="close-modal"]').first().click();
  await expect(page.locator('#modal-overlay')).toHaveCount(0);
  await page.evaluate(()=>window.__m07Release?.());
  await page.waitForTimeout(250);
  await expect(page.locator('#modal-overlay')).toHaveCount(0);
  await expect(page.locator('#chat-input')).toBeVisible();
  expect(errors).toEqual([]);
});
