const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const offline=read('public/parallel/offline.js');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'));
const i=offline.indexOf('  function meetingSummaryChunks('),j=offline.indexOf('  const upsertMeetingRecord=',i);
assert(i>0&&j>i,'summary and retry implementation exist');
const part=offline.slice(i,j);
let replies=[],sent=[];
const fake=async(msg,opts)=>{
 sent.push({msg,opts});
 if(!replies.length)throw Error('unconfigured mock response');
 const v=replies.shift();
 if(v instanceof Error)throw v;
 return v;
};
const runtime=new Function('llm','stripProtocolTags',part+'return {reliableMeetingSummaryJson,meetingSummaryChunks,buildMeetingSummaryText,summarizeCompleteMeeting};')(fake,(v)=>String(v));
const sys=[{role:'system',content:'只返回 JSON 格式的 summary'},{role:'user',content:'Lin明确表示会同行，Leon答应一起离开安全屋。'}];
const opts={mode:'meeting_summary',entry_point:'meeting_finalize',temperature:0.25,json_mode:true};
(async()=>{
 // Actual reported case: HTTP 200 and finish_reason=stop, but an open JSON string.
 replies=['{"summary":"Lin确认愿意与Leon一起走，随后从安全屋出发',JSON.stringify({summary:'Lin明确表示会陪 Leon 离开安全屋；双方把衣物收拾好，乘摩托车前往学校。'})];
 const good=await runtime.reliableMeetingSummaryJson(sys,opts);
 assert(good.includes('摩托车'));
 assert.equal(sent.at(-2).opts.min_output_tokens,2048);
 assert.equal(sent.at(-1).opts.min_output_tokens,3072);
 assert(sent.at(-1).msg[0].content.includes('上一轮结构化返回'));
 // No guessing: two invalid responses must never create a pseudo-memory.
 replies=['{"summary":"第一段','{"summary":"第二段'];
 await assert.rejects(()=>runtime.reliableMeetingSummaryJson(sys,opts));
 const backup=runtime.buildMeetingSummaryText({name:'Lin'},{name:'Leon'},'学校门口',[
  {sender:'user',text:'我喜欢你'},{sender:'user',text:'回家吧'}
 ]);
 assert(backup.includes('小结尚未生成成功'),'failed archive is transparent');
 assert(!backup.includes('再到「'),'fallback must not concatenate first and last messages');
 const rich=('先从安全屋的相处谈起，Lin告诉Leon希望他不要再把自己推开，她说“你去哪，我去哪”；Leon逐渐松口。'
   +'两人休息后在安全屋吃早饭，Lin想带走Leon的大号T恤当睡裙。Leon载她回大学，在校门口告别。').repeat(6);
 assert(runtime.buildMeetingSummaryText({}, {},'',[],rich).length>320,'rich summary is no longer cut to 320 characters');
 // A 151-message encounter must have at least two source digests, not 1 giant request.
 const m=Array.from({length:151},(_,k)=>({
  id:'m'+k,sender:k%2?'ai':'user',meeting_id:'',created_at:'2026-11-22T00:00:00',
  text:(k%2?'Leon开口回答Lin，随后收拾东西与她讨论下一步安排。':'Lin说出自己的决定，并与Leon讨论这次见面的具体情况。').repeat(5)
 }));
 const chunks=runtime.meetingSummaryChunks(m,{name:'Lin'},{name:'Leon'});
 assert(chunks.length>=3,'long encounter is partitioned into smaller windows');
 sent=[];replies=Array.from({length:chunks.length},()=>JSON.stringify({summary:'两人讨论了相处计划和接下来要做的事情，Leon保持回应。'}));
 replies.push(JSON.stringify({summary:rich}));
 const finalized=await runtime.summarizeCompleteMeeting({name:'Lin'},{name:'Leon'},m,'学校门口');
 assert.equal(finalized.summary,rich);
 assert.equal(sent.length,chunks.length+1,'each chunk and final merge must complete');
 assert(sent.at(-1).msg[0].content.includes('合并为整场见面梗概'));
 assert(!sent.some(x=>x.msg[0].content.includes('120至240字')),'never squash 151 messages into 120–240 characters');
 console.log('Malformed stop-reason JSON retried with real output budget; rich chronology, truthful pending state and 151-message summaries verified.');
})().catch(e=>{console.error(e);process.exitCode=1});