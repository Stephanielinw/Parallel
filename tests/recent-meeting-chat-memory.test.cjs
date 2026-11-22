const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..');
const offline=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(offline,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
new Function(offline);
const slice=offline.slice(offline.indexOf('  const SCENE_RULES='),offline.indexOf('  function currentPlanRows('));
const parse=new Function(slice+'return {proposalLocation,meetingPlaceInPlayerTurn};')();
assert.equal(parse.proposalLocation('Leon：我来日落大道接你。'),'日落大道');
assert.equal(parse.meetingPlaceInPlayerTurn('我在日落大道下车了。','Lin'),'日落大道');
assert.equal(parse.meetingPlaceInPlayerTurn('Leon把我送到了日落大道，我下车了。','Lin'),'日落大道');
assert.equal(parse.meetingPlaceInPlayerTurn('我准备在日落大道下车。','Lin'),'');
assert.equal(parse.meetingPlaceInPlayerTurn('如果我在日落大道下车了呢','Lin'),'');
const at=Date.parse('2026-11-21T20:24:00-08:00');
class Clock extends Date{constructor(...args){super(...(args.length?args:[at]));}static now(){return at;}}
const window={},storage=new Map();
vm.runInNewContext(offline,{window,localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},crypto:require('node:crypto').webcrypto,Date:Clock,URLSearchParams,JSON,Math,TextEncoder,AbortController,setTimeout,clearTimeout,console,fetch:async()=>{throw Error('No paid model network calls permitted')}});
const app=window.ParallelOffline;
const p={id:'lin-profile',name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[],interests:[],bio:'研究生',intent:'约会',avatar:'',role_character_id:'',created_at:new Clock().toISOString()};
const cid='re-game:leon:re2',key=p.id+'|'+cid;
const begin=at-4*3600000,finish=at-70*60000;
const scene=Array.from({length:119},(_,i)=>{
 const line=i===0?'我们最初约好看电影。':
  i===59?'结果电影并没有看。我们在家里亲密相处，后来相拥睡了两个小时。':
  i===76?'Leon替我盖好外套。虽然我们已经亲密相处，他还是舍不得我走。':
  i===117?'我在日落大道下车了，Leon送我来这里见朋友。':
  '第'+i+'回合，我们在室内面对面交谈。';
 return {id:'scene-'+i,profile_id:p.id,character_id:cid,meeting_id:'meeting-119',mode:'meeting',sender:i===117?'user':'ai',engine:'live',text:line,created_at:new Clock(begin+i*100000).toISOString()};
});
const pack=JSON.parse(app.exportData()),d=pack.data;
d.profiles=[p];
d.relations[key]={profile_id:p.id,character_id:cid,status:'matched',mode:'chat',active_meeting_id:'',updated_at:new Clock().toISOString()};
d.messages=[
 {id:'old-plan',profile_id:p.id,character_id:cid,mode:'chat',sender:'ai',engine:'live',text:'明天一起去电影院看电影，买爆米花。',created_at:new Clock(begin-3600000).toISOString()},
 ...scene,
 {id:'user-latest',profile_id:p.id,character_id:cid,mode:'chat',sender:'user',engine:'human',text:'今天舒服吗……做的时候',created_at:new Clock(at-60000).toISOString()}
];
d.meetings=[{id:'meeting-119',profile_id:p.id,character_id:cid,location:'日落大道',started_at:new Clock(begin).toISOString(),ended_at:new Clock(finish).toISOString(),finished_at:new Clock(finish).toISOString(),
 summary:'Lin探头进来了、Lin说下次见，共互动119回合',ai_summary:'',message_ids:scene.map(x=>x.id),
 location_history:[{at:new Clock(finish).toISOString(),location:'日落大道',source:'scene'}],
 entries:scene.map(x=>({id:x.id,sender:x.sender,speaker:x.sender==='user'?p.name:'Leon',text:x.text,created_at:x.created_at}))}];
d.surveillance={[key]:{byDate:{'2026-11-21':{date:'2026-11-21',profile_id:p.id,character_id:cid,engine:'live',slots:[{id:'unsafe',start:'00:00',end:'23:59',location:'特工安全公寓',status:'特工工作',activity:'DSO加密终端与政府机密文件',scene:'他在华盛顿特区处理事务',source:'schedule'}]}}}};
app.importData(JSON.stringify(pack));
const prompt=app.buildPromptPreview(p.id,cid,'chat',{latestText:'今天舒服吗……做的时候',simulatedAt:at});
const text=prompt.map(x=>x.content).join('\n');
assert(text.includes('最近一次真实线下见面'),'recent scene must be retrieved independent of phone keywords');
assert(text.includes('电影并没有看'),'actual canceled film must reach chat system');
assert(text.includes('亲密相处'),'actual intimacy must reach chat system');
assert(text.includes('日落大道下车'),'actual drop-off must reach chat system');
assert(!text.includes('特工安全公寓'),'invalid RE6-era safe house must be blocked');
assert(!text.includes('DSO加密终端'),'old agent job must not be injected into RE2 prompt');
const surv=app.buildPromptPreview(p.id,cid,'chat',{latestText:'你回家了？',simulatedAt:at});
assert(!surv[0].content.includes('DSO加密终端'),'cached unverified slot must stay suppressed across queries');
const copy=JSON.parse(app.exportData()).data;
assert.equal(copy.meetings[0].entries.length,119,'archived transcript must stay intact');
assert.equal(copy.messages.filter(x=>x.mode==='meeting').length,119);
const c2='re-game:leon:re6';
copy.relations[p.id+'|'+c2]={profile_id:p.id,character_id:c2,status:'matched',mode:'chat',active_meeting_id:''};
app.importData(JSON.stringify({format:'parallel-portable-backup',schemaVersion:1,data:copy}));
const promptOther=app.buildPromptPreview(p.id,c2,'chat',{latestText:'你今天在哪'});
assert(!promptOther.map(x=>x.content).join('\n').includes('我们在家里亲密相处'),'other Leon must not receive young Leon meeting');
console.log('Recent real 119-turn meeting overrides stale movie plan and RE6-era surveillance; per-character isolation and pickup parser passed.');
