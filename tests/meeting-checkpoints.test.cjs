const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const source=read('public/parallel/offline.js');
assert.equal(source,read('parallel_src/parallel_ai_date/static/offline.js'));
new Function(source);
const store=new Map();let counter=0;
const window={};
vm.runInNewContext(source,{window,localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},
  crypto:{randomUUID:()=> 'checkpoint-test-'+(++counter)},Date,URLSearchParams,JSON,Math,TextEncoder,AbortController,setTimeout,clearTimeout,console,
  fetch:async()=>{throw Error('meeting stage test must not call paid model')}});
const app=window.ParallelOffline;
(async()=>{
  const p=(await app.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
  const pair={profileId:p.id,characterId:'re-game:carlos:re3'};
  for(let i=0;i<30;i++)if((await app.request('/swipe',{...pair,direction:'right'})).matched)break;
  const mode=await app.request('/mode',{...pair,mode:'meeting',location:'Lin的公寓',triggerOpening:false});
  const mid=mode.active_meeting_id;
  assert(mid,'active meeting exists');
  for(let i=1;i<=49;i++){
    const res=await app.request('/message',{...pair,text:i===1?'第1轮，我把祖母送的铜钥匙放进书桌抽屉里了。':'第'+i+'轮，今晚我们继续闲聊。'});
    assert(res.reply,'demo encounter reply created');
  }
  let data=JSON.parse(app.exportData()).data;
  assert.equal(data.meetingCheckpoints.length,0,'49 paired exchanges must not create a checkpoint');
  await app.request('/message',{...pair,text:'第50轮，约定明天去买牛奶。'});
  data=JSON.parse(app.exportData()).data;
  assert.equal(data.meetingCheckpoints.length,1,'50 paired exchanges create exactly one checkpoint');
  const cp=data.meetingCheckpoints[0];
  assert.equal(cp.round_start,1);assert.equal(cp.round_end,50);
  assert.equal(cp.profile_id,p.id);assert.equal(cp.character_id,pair.characterId);assert.equal(cp.meeting_id,mid);
  assert.equal(cp.message_ids.length,100,'the stage keeps all 50 user + 50 AI message IDs');
  assert(cp.summary&&cp.started_at&&cp.ended_at&&cp.participants.includes('Lin'));
  assert(data.episodicMemories.some(m=>m.source_key==='meeting-checkpoint:'+mid+':1'),'stage appears in memory library');
  cp.keywords=['铜钥匙','书桌抽屉'];
  cp.details=['Lin把祖母赠送的铜钥匙放进书桌抽屉'];
  const changedPack=JSON.parse(app.exportData());
  changedPack.data.meetingCheckpoints[0]=cp;
  app.importData(JSON.stringify(changedPack));
  const preview=app.buildPromptPreview(p.id,pair.characterId,'meeting',{latestText:'现在要去找那把铜钥匙吗？'});
  const joined=preview.map(m=>m.content).join('\n');
  assert(joined.includes('已归档的全部50组阶段小结'),'checkpoint included in meeting prompt');
  assert(joined.includes('关键词命中的现场原文'),'matching keyword retrieves source excerpt');
  assert(joined.includes('祖母送的铜钥匙'),'retrieved source shows old scene details');
  assert(!preview.slice(1).some(m=>String(m.content).includes('第1轮，我把祖母送的铜钥匙')),'old first turn is no longer part of default live five-group history');
  const noMatch=app.buildPromptPreview(p.id,pair.characterId,'meeting',{latestText:'今天天气怎么样？'});
  assert(!noMatch[0].content.includes('关键词命中的现场原文'),'unrelated dialogue uses only recaps');
  assert(noMatch[0].content.includes('已归档的全部50组阶段小结'));
  await app.request('/message',{...pair,text:'第51轮，新阶段的对话。'});
  data=JSON.parse(app.exportData()).data;
  assert.equal(data.meetingCheckpoints.length,1,'51st pair does not create duplicate summaries');
  const stale=JSON.parse(app.exportData());
  stale.data.messages.find(m=>m.id===cp.message_ids[0]).text='第一轮现在被修改，原来的事实无效';
  app.importData(JSON.stringify(stale));
  const after=app.buildPromptPreview(p.id,pair.characterId,'meeting',{latestText:'铜钥匙'});
  assert(!after[0].content.includes('已归档的全部50组阶段小结'),'editing source immediately invalidates stale checkpoint');
  console.log('50-complete-exchange checkpoints: timing, prompt shrink, keyword drilldown, original source IDs, isolation and stale invalidation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});