const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const portable=read('public/parallel/offline.js');
const backend=read('parallel_src/parallel_ai_date/server.py');
assert.equal(portable,read('parallel_src/parallel_ai_date/static/offline.js'),'offline mirrors stay identical');
new Function(portable);
const begin=portable.indexOf('  const appointmentPlanningEvidence=');
const finish=portable.indexOf('  async function ensureLiveSurveillance(',begin);
assert(begin>=0&&finish>begin,'appointment-planning evidence helper exists');
const rows=[
 {id:'m1',profile_id:'lin',character_id:'leon',mode:'chat',sender:'user',engine:'human',created_at:'2026-11-21T19:00:00-08:00',text:'我们明天下午一点半在咖啡馆见好不好？'},
 {id:'m2',profile_id:'lin',character_id:'leon',mode:'chat',sender:'ai',engine:'live',created_at:'2026-11-21T19:01:00-08:00',text:'好，一点半见。我会提前一点到。'},
 {id:'m3',profile_id:'lin',character_id:'leon',mode:'chat',sender:'user',engine:'human',created_at:'2026-11-21T19:02:00-08:00',text:'不见不散！'},
 {id:'m4',profile_id:'other',character_id:'leon',mode:'chat',sender:'user',engine:'human',created_at:'2026-11-21T19:04:00-08:00',text:'明天早上六点约好看电影'},
 {id:'m5',profile_id:'lin',character_id:'leon',mode:'chat',sender:'user',engine:'recalled',created_at:'2026-11-21T19:05:00-08:00',text:'撤回之前的虚假行程：明天凌晨三点见面'}
];
const messagesOf=(pid,cid)=>rows.filter(m=>m.profile_id===pid&&m.character_id===cid);
const evidenceFn=new Function('messagesOf','chatClockLabel','isChatArtifact',
  portable.slice(begin,finish)+'return appointmentPlanningEvidence;')(
  messagesOf,
  iso=>new Date(iso).toLocaleString('sv-SE',{timeZone:'America/Los_Angeles',hour12:false}),
  ()=>false
);
const evidence=evidenceFn({id:'lin',name:'Lin'},{id:'leon',name:'Leon'},'2026-11-22');
assert(evidence.includes('下午一点半'),'earlier agreement must be available for next day planning');
assert(evidence.includes('好，一点半见'),'both sides of the agreement must reach the planner');
assert(!evidence.includes('六点'),'other profile must not enter the appointment context');
assert(!evidence.includes('凌晨三点'),'recalled proposals must not enter the appointment context');
assert.equal(evidenceFn({id:'lin',name:'Lin'},{id:'leon',name:'Leon'},'2026-11-20'),'','later messages must not leak into earlier planning');
assert(portable.includes('只有已经相互确认、日期匹配的安排'),'AI schedule must distinguish agreed appointments from unilateral suggestions');
assert(backend.includes('只有明确互相同意且安排属于目标日期时才预留时间'),'Python schedule must do the same');
assert(portable.includes('async function verifyGeneratedMeetingDetail('),'self-initiated detail recall must be checked before sending');
assert(backend.includes("'chat-meeting-detail-recall'"),'server chat queue must check self-initiated details');
console.log('Appointment evidence, profile isolation, planned-vs-actual rules, and two-stage recall assertions passed.');
