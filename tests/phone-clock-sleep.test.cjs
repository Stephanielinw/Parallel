const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const o=read('public/parallel/offline.js'),a=read('public/parallel/app.js');
assert.equal(o,read('parallel_src/parallel_ai_date/static/offline.js'));assert.equal(a,read('parallel_src/parallel_ai_date/static/app.js'));
const helpers=o.slice(o.indexOf('  function isSleepingSlot('),o.indexOf('  const syncSurveillanceFromChat='));
const f=new Function('hhmmToMin','activeSlotIndex','localDateStr','fmtHHMM',helpers+'\nreturn {isSleepingSlot,wakeSlotFromMessage,chatClockContext,chatClockLabel}')(
s=>{const [h,m]=s.split(':').map(Number);return h*60+m},
(slots,n)=>slots.findLastIndex(s=>{const [h,m]=s.start.split(':').map(Number),[eh,em]=s.end.split(':').map(Number);return h*60+m<=n&&n<=eh*60+em}),
ts=>{const d=new Date(ts);return [d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-')},
ts=>{const d=new Date(ts);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')});
const slot={id:'one',start:'00:00',end:'07:00',location:'公寓',status:'夜间熟睡',activity:'深度睡眠休整',scene:'浅眠',source:'schedule'};
assert(f.isSleepingSlot(slot));
assert(!f.isSleepingSlot({...slot,status:'准备入睡',activity:'准备睡觉'}));
const arr=[slot,{id:'two',start:'07:00',end:'23:59',location:'公园',status:'晨跑',activity:'跑步',scene:'晨光',source:'schedule'}];
assert(f.wakeSlotFromMessage(arr,'02:15','Leon',()=> 'wake'));
assert.deepEqual(arr.map(x=>[x.start,x.end,x.status]),[['00:00','02:15','夜间熟睡'],['02:15','07:00','已醒来发消息'],['07:00','23:59','晨跑']]);
assert(!f.wakeSlotFromMessage(arr,'02:16','Leon',()=> 'duplicate'));
const now=new Date(2026,10,19,8,0).getTime(),last=new Date(2026,10,18,23,0).toISOString();
const hint=f.chatClockContext([{sender:'user',created_at:last}],now);
assert(hint.includes('2026-11-19 08:00'));assert(hint.includes('上午'));assert(hint.includes('2026-11-18 23:00'));assert(hint.includes('540 分钟'));
assert(!a.includes("\${esc(s.start)} – \${esc(s.end)}"));assert(!a.includes("\${esc(cur.start||'00:00')} – \${esc(cur.end||'23:59')}"));
assert(o.includes('chatClockContext(workingHistory)+survHint'));
assert(o.includes("['live','demo'].includes(engine)&&!isChatArtifact(m))reconcilePhoneActivity"));
console.log('Sleep wake reconciliation, cross-midnight current time and start-only monitoring passed');
