const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..');
const source=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(source,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
new Function(source);
const current=Date.parse('2026-11-22T12:52:00-08:00');
class Clock extends Date{
  constructor(...args){super(...(args.length?args:[current]));}
  static now(){return current;}
}
const window={},storage=new Map();
vm.runInNewContext(source,{
  window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},
  crypto:require('node:crypto').webcrypto,Date:Clock,URLSearchParams,JSON,Math,TextEncoder,TextDecoder,
  AbortController,setTimeout,clearTimeout,console,fetch:async()=>{throw Error('no live model calls')}
});
const engine=window.ParallelOffline;
const profile={id:'lin-continuity',name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,
  sources:[],interests:[],bio:'',intent:'',avatar:'',role_character_id:'',created_at:'2026-11-20T00:00:00Z'};
const cid='re-game:carlos:re3',key=profile.id+'|'+cid;
const msg=(id,mode,sender,text,date,meeting_id='')=>({
  id,profile_id:profile.id,character_id:cid,mode,sender,engine:sender==='ai'?'live':'human',
  text,created_at:date,meeting_id
});
const oldText='我就在你家楼下，赶紧开门！';
const archived=[
  msg('scene-1','meeting','user','我们一起喝完汤，坐到了宿舍露台。','2026-11-22T17:35:00Z','meet-carlos'),
  msg('scene-2','meeting','ai','Carl说露台风有点凉，递过了外套。','2026-11-22T17:42:00Z','meet-carlos'),
  msg('scene-3','meeting','user','已经上午了，我们先结束今天的见面吧。','2026-11-22T17:48:00Z','meet-carlos'),
  msg('scene-4','meeting','ai','好，今天先这样，我们晚点手机上聊。','2026-11-22T17:50:00Z','meet-carlos')
];
const pack=JSON.parse(engine.exportData());
const d=pack.data;
d.profiles=[profile];
d.relations[key]={profile_id:profile.id,character_id:cid,status:'matched',mode:'chat',
  active_meeting_id:'',updated_at:'2026-11-22T17:51:00Z'};
d.messages=[
  msg('old-user','chat','user','你还不回来吗，家里门禁快关了。','2026-11-22T06:35:00Z'),
  msg('old-door','chat','ai',oldText,'2026-11-22T06:36:00Z'),
  ...archived,
  msg('new-user','chat','user','今天小狗好安静啊～','2026-11-22T20:50:00Z')
];
d.meetings=[{id:'meet-carlos',profile_id:profile.id,character_id:cid,location:'宿舍外廊露台',
  started_at:'2026-11-22T06:38:00Z',ended_at:'2026-11-22T17:50:00Z',finished_at:'2026-11-22T17:51:00Z',
  summary:'本次见面原文已完整保存，剧情小结尚未生成成功；可点击「重新整理整场梗概」补全。',
  ai_summary:'',message_ids:archived.map(m=>m.id),
  entries:archived.map(m=>({id:m.id,sender:m.sender,text:m.text,created_at:m.created_at}))}];
engine.importData(JSON.stringify(pack));
const prompt=engine.buildPromptPreview(profile.id,cid,'chat',{latestText:'今天小狗好安静啊～',simulatedAt:current});
const system=prompt[0].content;
const turns=prompt.filter(m=>m.role!=='system');
assert(system.includes('线下见面结束 → 当前手机聊天'),'explicit mode transition required');
assert(system.includes('今天先这样，我们晚点手机上聊'),'the actual ending must be available even if recap fails');
assert(system.includes('小结尚未生成成功'),'incomplete summary must stay honest');
assert(!turns.some(m=>m.content.includes(oldText)||m.content.includes('门禁快关了')),
  'pre-meeting SMS must never appear in new live assistant/user turns');
assert(turns.some(m=>m.content==='今天小狗好安静啊～'),'new user message must remain');
assert(!turns.some(m=>m.content.includes('Carl说露台')),'meeting paragraphs must not be treated as SMS turns');
const snapshot=JSON.parse(engine.exportData()).data;
assert.equal(snapshot.messages.length,7,'all archived messages must survive the prompt fix');
assert.equal(snapshot.meetings[0].entries.length,4,'archived scene must remain complete');
const good=JSON.parse(engine.exportData());
good.data.meetings[0].summary='两人在宿舍外廊露台喝汤，并且约定稍后通过短信继续聊天。';
good.data.meetings[0].ai_summary=good.data.meetings[0].summary;
engine.importData(JSON.stringify(good));
const after=engine.buildPromptPreview(profile.id,cid,'chat',{latestText:'今天小狗好安静啊～',simulatedAt:current})[0].content;
assert(after.includes('线下见面结束 → 当前手机聊天'),'successful digest also needs a hard boundary');
assert(after.includes('约定稍后通过短信继续聊天'),'successful digest still used');
assert(!after.includes('现场原文 #'),'ordinary messages should not fetch detailed meeting excerpts');
console.log('Post-meeting SMS continuity: hard historical boundary, missing-summary raw ending, and intact saved scene passed.');
