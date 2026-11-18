const fs=require('fs'); const vm=require('vm'); const assert=require('assert');
const src=fs.readFileSync(require('path').join(__dirname,'../static/offline.js'),'utf8');
const map=new Map();
const localStorage={getItem:k=>map.get(k)||null,setItem:(k,v)=>map.set(k,v)};
function start(){const win={};const context={window:win,localStorage,crypto:require('crypto').webcrypto,URLSearchParams,Date,JSON,Math,TextEncoder,console,fetch:async()=>{throw Error('network disabled in tests')}};vm.createContext(context);vm.runInContext(src,context);return win.ParallelOffline}
(async()=>{
 let app=start(); let p=(await app.request('/profile',{name:'Stephanie',age:26,gender:'female',interested_in:['all'],min_age:18,max_age:65,intent:'认识朋友',sources:['生化危机 · 游戏'],bio:'你好',interests:[],avatar:'',role_character_id:''})).profile;
 let me=(await app.request('/profile',{name:'Leon',age:21,gender:'male',interested_in:['all'],min_age:18,max_age:65,intent:'寻找缘分',sources:['生化危机 · 游戏'],bio:'',interests:[],avatar:'',role_character_id:'re-game:leon:re2'})).profile;
 let candidates=(await app.request('/discover',{profileId:me.id})).candidates;
 assert(!candidates.some(x=>x.id==='re-game:leon:re2'),'player Leon cannot match AI same-era Leon');
 const list=await app.request('/identify?name=Leon');assert(list.matches.length>2,'multiple canonical versions can resolve');
 const cid='re-game:leon:re2';const uriGuard=()=>`/thread?profileId=${p.id}&characterId=${cid}`;let match=null;
 for(let i=0;i<15;i++){match=await app.request('/swipe',{profileId:p.id,characterId:cid,direction:'right'});if(match.matched)break}
 let tagged=(await app.request('/profile',{name:'Custom',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:60,sources:['生化危机','完全未收录的小说'],bio:'',interests:[],avatar:'',role_character_id:''})).profile;
 assert.deepStrictEqual([...tagged.sources],['生化危机','完全未收录的小说']);
 const tagCandidates=(await app.request('/discover',{profileId:tagged.id})).candidates;
 assert(tagCandidates.every(c=>c.source.includes('生化危机')));
 assert(match.matched,'match eventually succeeds');
 let firstQueue=await app.request('/message',{profileId:p.id,characterId:cid,text:'我们明天见'});
 assert(firstQueue.queued&&firstQueue.reply===null,'chat text queued without immediate reply');
 let secondQueue=await app.request('/message',{profileId:p.id,characterId:cid,text:'等一下，我还有一句'});
 assert(secondQueue.queue.count===2,'two SMS share quiet queue');
 let beforeDue=await app.request('/chat-flush',{profileId:p.id,characterId:cid});
 assert(beforeDue.queued&&beforeDue.reply===null,'no response before 60s');
 let batched=await app.request('/chat-flush',{profileId:p.id,characterId:cid,force:true});
 assert(batched.reply&&batched.queue.count===0,'manual flush returns one batched AI reply');
 let dup=await app.request('/chat-flush',{profileId:p.id,characterId:cid,force:true});assert(!dup.reply,'no duplicate flush');
 let switchQueue=await app.request('/message',{profileId:p.id,characterId:cid,text:'先发完再见面'});
 assert(switchQueue.queue.count===1);
 
 await app.request('/mode',{profileId:p.id,characterId:cid,mode:'meeting'});
 assert((await app.request(uriGuard())).queue.count===0,'switching to meeting cancels pending chat reply');
 let r=await app.request('/reply',{profileId:p.id,characterId:cid});assert(r.reply.mode==='meeting','reply should use the mode switched after the last text');
 await app.request('/mode',{profileId:p.id,characterId:cid,mode:'chat'});
 await app.request('/reply',{profileId:p.id,characterId:cid});
 const uri=`/thread?profileId=${p.id}&characterId=${cid}`;
 let msgs=(await app.request(uri)).messages;
 assert(msgs.some(x=>x.mode==='meeting')&&msgs.some(x=>x.mode==='chat'));
 await app.request('/unmatch',{profileId:p.id,characterId:cid});
 let earlier=msgs.length;
 for(let i=0;i<15;i++){match=await app.request('/swipe',{profileId:p.id,characterId:cid,direction:'right'});if(match.matched)break}
 assert(match.matched);
 assert((await app.request(uri)).messages.length>earlier);
 const initPresets=(await app.request('/presets')).entries;
 const ownPreset={format:'parallel-text-preset',schemaVersion:1,modes:['chat'],name:'测试',entries:[{mode:'chat',name:'角色一致性',role:'system',enabled:false,content:'保持角色本人的说话方式',sort_order:0}]};
 let rejected=false;
 try{await app.request('/preset-import',{import_mode:'replace',preset:{...ownPreset,format:'sillytavern'}})}catch(e){rejected=true}
 assert(rejected,'no third-party preset import');
 await app.request('/preset-import',{import_mode:'append',preset:ownPreset});
 let entries=(await app.request('/presets')).entries;
 assert.equal(entries.length,initPresets.length+1);
 assert(entries.find(x=>x.name==='角色一致性').enabled===false);
 await app.request('/preset-import',{import_mode:'replace',preset:ownPreset});
 entries=(await app.request('/presets')).entries;
 assert.equal(entries.filter(x=>x.mode==='chat').length,1);
 assert.equal(entries.filter(x=>x.mode==='meeting').length,initPresets.filter(x=>x.mode==='meeting').length);
 assert.equal(entries.find(x=>x.name==='角色一致性').content,ownPreset.entries[0].content);
 const photo=await app.request('/photo-description',{characterId:cid});assert(photo.description.includes('Leon'),'photo is described textually');
 const ownElsewhere={format:'elsewhere-preset',schemaVersion:1,entries:[
   {id:'one',name:'角色一致性',group:'基础',role:'system',enabled:true,content:'{{char}} 知道 {{user}} 的名字'},
   {id:'two',name:'隐藏条目',group:'文风',role:'system',enabled:false,content:'禁用'},
   {id:'three',name:'确认',group:'收尾',role:'assistant',enabled:true,content:'我会遵守角色规则'}]};
 const res=await app.request('/preset-import',{import_mode:'replace',preset:ownElsewhere});assert(res.imported===3);
 let imported=(await app.request('/presets')).entries.filter(x=>x.mode==='meeting').sort((a,b)=>a.sort_order-b.sort_order);
 assert(imported.length===3&&imported[2].role==='assistant'&&!imported[1].enabled,'Elsewhere owned JSON imported to meeting only');
  const backup=JSON.parse(app.exportData());assert(!backup.data.connection.api_key);
 app=start();assert((await app.request(uri)).messages.length>earlier,'localStorage persistence across refresh');
 const restored=app.importData(JSON.stringify(backup));assert(restored.profiles===3,'data restore');

 // Regression checks for v0.5 bug fixes:
 // 1. Partial backup without photoDescriptions / queue / bios does not crash
 const partialBackup=JSON.parse(JSON.stringify(backup));
 delete partialBackup.data.photoDescriptions;
 delete partialBackup.data.queue;
 delete partialBackup.data.bios;
 app.importData(JSON.stringify(partialBackup));
 const photoAfterRestore=await app.request('/photo-description',{characterId:cid});
 assert(photoAfterRestore.description.includes('Leon'),'photo-description works after restoring legacy backup');

 // 2. Source alias matching ('巫师3', '生化2') & Chinese character identify ('艾达王')
 const witcherProfile=(await app.request('/profile',{name:'GeraltFan',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:99,sources:['巫师3'],bio:'',interests:['昆特牌'],intent:'认真恋爱'})).profile;
 const witcherCand=(await app.request('/discover',{profileId:witcherProfile.id})).candidates;
 assert(witcherCand.length>0 && witcherCand.every(c=>c.source==='巫师 · 游戏'),'巫师3 matches 巫师 · 游戏');
 const adaIdentify=await app.request('/identify?name=艾达王');
 assert(adaIdentify.matches.some(m=>m.name.includes('Ada Wong')),'艾达王 matches Ada Wong');

 // 3. Matched character is excluded from discover pool & returns already_matched on duplicate right-swipe
 const pDiscover=(await app.request('/discover',{profileId:p.id})).candidates;
 assert(!pDiscover.some(c=>c.id===cid),'already matched character excluded from discover pool');
 const dupSwipe=await app.request('/swipe',{profileId:p.id,characterId:cid,direction:'right'});
 assert(dupSwipe.already_matched===true,'duplicate right swipe flags already_matched');

 // 4. Message delete cleans up queue
 const msgToDel=await app.request('/message',{profileId:p.id,characterId:cid,text:'待删除消息'});
 assert(msgToDel.queue.count===1);
 const threadNow=await app.request(uri);
 const lastMsg=threadNow.messages[threadNow.messages.length-1];
 const afterDel=await app.request('/message-delete',{profileId:p.id,characterId:cid,messageId:lastMsg.id});
 assert(afterDel.ok && afterDel.queue.count===0,'deleting queued message clears queue');

 // 5. Image AI settings (image_base_url, image_api_key, image_mode, clear_image_key)
 const imgCfg=(await app.request('/settings',{image_base_url:'https://img.example.org/v1',image_api_key:'secret-img-key',image_model:'gpt-image-1'})).settings;
 assert(imgCfg.has_image_key===true && imgCfg.image_mode==='live' && !('image_api_key' in imgCfg),'image AI live mode enabled and key stripped');
 const expWithImg=JSON.parse(app.exportData());
 assert(!expWithImg.data.connection.image_api_key,'image_api_key stripped from backup export');
 const clearedImg=(await app.request('/settings',{clear_image_key:true})).settings;
 assert(clearedImg.has_image_key===false && clearedImg.image_mode==='text','clearing image key switches back to text mode');

 // 6. Four-layer memory isolation, on-demand retrieval, and conversational correction
 const otherP=(await app.request('/profile',{name:'OtherPerson',age:28,gender:'female',interested_in:['all'],min_age:18,max_age:99,sources:['生化危机 · 游戏'],bio:'',interests:[],intent:'认识朋友'})).profile;
 for(let i=0;i<15;i++){const m=await app.request('/swipe',{profileId:otherP.id,characterId:cid,direction:'right'});if(m.matched)break}
 await app.request('/memory-action',{profileId:otherP.id,characterId:cid,action:'add',summary:'与 OtherPerson 在柏林喝过黑啤'});
 const pPrompt=JSON.stringify(app.buildPromptPreview(p.id,cid,'chat'));
 assert(!pPrompt.includes('OtherPerson')&&!pPrompt.includes('柏林'),'strict per-character+profile memory isolation without cross-contamination');

 await app.request('/memory-action',{profileId:p.id,characterId:cid,action:'add',summary:'约定秋天一起去京都看红叶'});
 const memRes=await app.request(`/memories?profileId=${p.id}&characterId=${encodeURIComponent(cid)}&query=${encodeURIComponent('京都红叶')}`);
 assert(memRes.recalledPreview.some(m=>m.summary.includes('京都看红叶')),'on-demand bigram retrieval recalls matching memory');

 await app.request('/message',{profileId:p.id,characterId:cid,text:'你记错了，我们没有去京都看红叶'});
 const memAfterCorr=await app.request(`/memories?profileId=${p.id}&characterId=${encodeURIComponent(cid)}&query=${encodeURIComponent('京都')}`);
 assert(memAfterCorr.memories.some(m=>m.summary.includes('京都看红叶')&&m.disputed===1),'conversational correction marks memory disputed');
 assert(memAfterCorr.memories.some(m=>m.source_type==='correction'),'correction record added');

 // 7. ROUND-02: Meeting prompt compilation structure (core system -> history -> COT + Layer 4 -> assistant bottom pledge -> trailing user turn) & diagnostics
 const r2Pack={format:'elsewhere-preset',schemaVersion:1,entries:[
   {id:'e1',name:'入园与选角仪式',group:'核心定位',role:'system',enabled:true,content:'核心扮演：{{char}} 与 {{user}}'},
   {id:'e2',name:'高饱和度感官电影流',group:'文风（单选）',role:'system',enabled:true,content:'电影感镜头'},
   {id:'e3',name:'毛姆式冷眼世故',group:'文风（单选）',role:'system',enabled:false,content:'冷眼旁观禁用测试'},
   {id:'e4',name:'动笔前连续性检查',group:'COT',role:'system',enabled:true,content:'COT自检：先承接 {{user}} 的动作'},
   {id:'e5',name:'底部誓约与状态确认',group:'收尾',role:'assistant',enabled:true,content:'我已完全进入 {{char}} 并锁定 {{user}}'}
 ]};
 const r2Imp=await app.request('/preset-import',{import_mode:'replace',preset:r2Pack});
 assert(r2Imp.imported===5 && r2Imp.diagnostics.meeting.enabledCount===4 && r2Imp.diagnostics.meeting.disabledCount===1,'ROUND-02 preset diagnostics');
 const meetPreview=app.buildPromptPreview(p.id,cid,'meeting',{triggerOpening:true});
 assert(meetPreview[0].role==='system' && meetPreview[0].content.includes('核心扮演：Leon S. Kennedy 与 Stephanie'),'core system preset with macro expansion');
 assert(!JSON.stringify(meetPreview).includes('冷眼旁观禁用测试'),'disabled style never enters meeting prompt');
 assert(meetPreview[meetPreview.length-3].role==='system' && meetPreview[meetPreview.length-3].content.includes('COT自检：先承接 Stephanie 的动作'),'COT placed post-history');
 assert(meetPreview[meetPreview.length-2].role==='assistant' && meetPreview[meetPreview.length-2].content.includes('我已完全进入 Leon S. Kennedy 并锁定 Stephanie'),'assistant bottom pledge placed second to last');
 assert(meetPreview[meetPreview.length-1].role==='user' && (meetPreview[meetPreview.length-1].content.includes('【场景开启】') || meetPreview[meetPreview.length-1].content.includes('【继续推进】')),'trailing message in meeting mode is always user role');

 console.log('Portable HTML data tests passed: profile role exclusion, timeline, mode, reply, reunion, persistence, backup, v0.5 4-layer memory, and ROUND-02 preset compilation');
})().catch(e=>{console.error(e);process.exit(1)});


