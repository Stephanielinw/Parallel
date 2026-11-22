const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const offline=read('public/parallel/offline.js'),ui=read('public/parallel/app.js'),server=read('parallel_src/parallel_ai_date/server.py');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'),'portable runtime mirrors');
assert.equal(ui,read('parallel_src/parallel_ai_date/static/app.js'),'app mirrors');
new Function(ui);
new Function(offline);
const start=offline.indexOf('  function meetingSummaryChunks('),end=offline.indexOf('  const buildMeetingSummaryText=',start);
assert(start>=0&&end>start,'whole meeting summary code exists');
const sent=[];
const {meetingSummaryChunks,summarizeCompleteMeeting}=new Function('llm',offline.slice(start,end)+'return {meetingSummaryChunks,summarizeCompleteMeeting};')(async(messages,opts)=>{
 sent.push({messages,opts});
 return JSON.stringify({summary:messages[0].content.includes('合并为整场见面梗概')?'昨晚见面、长谈、休息，次日早晨道别。':'记录本段的事实，后续再合并。'});
});
const profile={name:'Lin'},character={name:'Carlos'};
const history=Array.from({length:120},(_,i)=>({
 id:'m'+i,
 sender:i%2?'ai':'user',
 text:'TURN-'+i+' '+(i%2?'角色的连续行为与场景描述。':'用户的言语、动作与重要事实。').repeat(18),
 created_at:i<60?'2026-11-20T22:00:00':'2026-11-21T08:00:00'
}));
const chunks=meetingSummaryChunks(history,profile,character);
assert(chunks.length>1,'long multiday meeting must be chunked');
const chronological=chunks.join('');
for(let i=0;i<history.length;i++)assert(chronological.includes('TURN-'+i+' '),'missing chronological message '+i);
assert(chronological.indexOf('TURN-0 ')<chronological.indexOf('TURN-60 '),'original order must be preserved');
(async()=>{
 const result=await summarizeCompleteMeeting(profile,character,history,'咖啡馆');
 assert(result.summary.includes('昨晚见面'),'final summary should contain earlier phases');
 assert.equal(sent.length,chunks.length+1,'one factual digest per chunk and a merge');
 assert(sent.some(x=>x.messages[0].content.includes('合并为整场见面梗概')),'chronological merge must occur');
 assert(sent.every(x=>x.opts.mode==='meeting_summary'&&x.opts.temperature===0.25));
 assert(!offline.includes('mMsgs.slice(-10).map('),'must not summarize only the last ten messages');
 assert(offline.includes("case '/meeting-summary-refresh':"),'archived summary needs repair route');
 assert(ui.includes('重新整理整场梗概（消耗 Token）'));
 assert(ui.includes("if(a==='refresh-meeting-summary')"));
 assert(server.includes('def meeting_summary_chunks(')&&server.includes('def summarize_complete_meeting('));
 assert(server.includes("if route=='/api/meeting-summary-refresh':"));
 assert(!server.includes('for x in m_msgs[-10:]'),'Python must not retain last-ten-only summary');
 assert(offline.includes('.slice(0,850)'),'meeting summary storage must accommodate a rich recap');
 console.log('Full meeting archive regression passed: every turn contributes, phases merge, older cards can refresh and original transcripts stay intact.');
})().catch(e=>{console.error(e);process.exitCode=1});
