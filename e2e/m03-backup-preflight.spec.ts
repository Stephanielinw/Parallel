import {test,expect} from '@playwright/test';

// WebKit, mobile viewport and touch configuration come from playwright.m02.config.ts.
test('M03: two JSON copies are checked locally without changing the active save',async({page})=>{
  const errors:string[]=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('/Parallel/');
  await expect.poll(()=>page.evaluate(()=>Boolean((window as any).ParallelOffline))).toBe(true);
  const prompt=page.locator('#modal-overlay [data-action="choose-api-mode"][data-demo="no"]');
  if(await prompt.isVisible()){await prompt.click();await expect(page.locator('#modal-overlay')).toHaveCount(0);}
  await page.locator('#mobile-nav [data-action="nav"][data-tab="terminal"]').click();
  await expect(page.locator('#portable-backup-check')).toHaveCount(1);
  const snapshot=await page.evaluate(()=>JSON.parse((window as any).ParallelOffline.exportData()).data);
  const fileData=await page.evaluate(()=>{
    const pack=JSON.parse((window as any).ParallelOffline.exportData());
    pack.data.messages.push({
      id:'m03-json-only',profile_id:'m03-fixture',character_id:'re-game:leon:re6',
      mode:'chat',sender:'user',text:'这段长文本绝不能出现在核验报告里 🐕‍🦺',
      created_at:'2026-11-22T17:45:00Z'
    });
    return JSON.stringify(pack);
  });
  const buffer=Buffer.from(fileData,'utf8');
  await page.locator('#portable-backup-check').setInputFiles([
    {name:'M03_backup_copy_A.json',mimeType:'application/json',buffer},
    {name:'M03_backup_copy_B.json',mimeType:'application/json',buffer}
  ]);
  await expect(page.locator('#modal-overlay')).toContainText('两份文件的 SHA-256 一致');
  await expect(page.locator('#modal-overlay')).toContainText('消息 1');
  await expect(page.locator('#modal-overlay')).not.toContainText('这段长文本绝不能出现在核验报告里');
  const after=await page.evaluate(()=>JSON.parse((window as any).ParallelOffline.exportData()).data);
  expect(after).toEqual(snapshot);
  await page.locator('#modal-overlay [data-action="close-modal"]').first().click();
  await page.locator('#portable-backup-check').setInputFiles({
    name:'M03_broken.json',mimeType:'application/json',buffer:Buffer.from('not valid JSON')
  });
  await expect(page.locator('#modal-overlay')).toContainText('备份检查未通过');
  expect(await page.evaluate(()=>JSON.parse((window as any).ParallelOffline.exportData()).data)).toEqual(snapshot);
  expect(errors).toEqual([]);
});