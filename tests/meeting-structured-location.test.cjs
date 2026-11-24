const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..'),src=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(src,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
new Function(src);
let now=Date.parse('2026-11-24T16:00:00-08:00'),counter=0,answer='',paidNarratives=0,paidSummaries=0;
const generated=[];
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now}}
const fetchMock=async(url,options)=>{
 const req=JSON.parse(options.body);const sys=req.messages.find(x=>x.role==='system')?.content||'';
 let content;
 if(sys.includes('纪实档案员')||sys.includes('事实')&&sys.includes('实际场景')) {
   paidSummaries++;
   const stageText=req.messages.find(x=>x.role==='user')?.content||'';
   const stageName=stageText.includes('宿舍外廊露台')?'宿舍外廊露台':'宿舍卧室';
   content=JSON.stringify({summary:'他们在'+stageName+'真实地聊过当天的计划，随后按照现场行动转换了空间。'});
 }else if(sys.includes('地点事实核对员')){
   content=JSON.stringify({changed:false,location:'',evidence:'',actor:'none'});
 }else{
   paidNarratives++;content=answer;
   assert(req.messages.some(x=>String(x.content||'').includes('每轮见面回复的结构化契约')),
      'each novel reply prompt requests a separate location field');
   assert(!req.messages.some(x=>String(x.content||'').includes('日程草案')),
      'meeting narrative must not read projected personal schedule');
 }
 generated.push({sys,content});
 return {ok:true,status:200,json:async()=>({choices:[{message:{content},finish_reason:'stop'}]})};
};
const store=new Map(),win={};
vm.runInNewContext(src,{window:win,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},
 crypto:{randomUUID:()=> 'scene-'+(++counter)},Date:Clock,URLSearchParams,JSON,Math,TextEncoder,AbortController,
 setTimeout,clearTimeout,console,fetch:fetchMock});
const app=win.ParallelOffline;
const turn=(text,location,evidence='')=>JSON.stringify({text,location,location_evidence:evidence});
(async()=>{
 const p=(await app.request('/profile',{name:'Test',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:[]})).profile;
 const pair={profileId:p.id,characterId:'re-game:carlos:re3'};
 for(let i=0;i<25;i++)if((await app.request('/swipe',{...pair,direction:'right'})).matched)break;
 await app.request('/settings',{base_url:'https://example.invalid/v1',api_key:'synthetic-token',model:'mock',auto_translate:false});
 const opened=await app.request('/mode',{...pair,mode:'meeting',location:'宿舍外廊露台',triggerOpening:false});
 const mid=opened.active_meeting_id;
 answer=turn('Carlos坐在宿舍外廊露台的椅子上，侧耳听她讲课。','宿舍外廊露台');
 let r=await app.request('/message',{...pair,text:'还要坐一会儿吗？'});
 assert(r.reply);
 assert.equal(r.reply.scene_location,'宿舍外廊露台','even stationary AI turn must store a separate location');
 assert(!r.reply.text.includes('location_evidence'),'location field never enters visible narrative');
 assert.equal(JSON.parse(app.exportData()).data.meetingCheckpoints.length,0);
 now+=150000;
 answer=turn('Carlos推开门，走进卧室，在床沿坐下来。','宿舍卧室','走进卧室');
 r=await app.request('/message',{...pair,text:'我们进去避一下风吧。'});
 assert.equal(r.reply.scene_location,'宿舍卧室');
 let data=JSON.parse(app.exportData()).data;
 let cp=data.meetingCheckpoints.filter(x=>x.kind==='scene_transition'&&x.meeting_id===mid);
 assert.equal(cp.length,1,'one location change triggers one scene recap');
 assert.equal(cp[0].from_location,'宿舍外廊露台');
 assert.equal(cp[0].to_location,'宿舍卧室');
 assert(cp[0].message_ids.length>=2,'scene recap must retain original source IDs');
 const current=await app.request('/surveillance',{...pair});
 assert.equal(current.current.location,'宿舍卧室','monitor follows scene, not projected schedule');
 const patio=current.unlockedSlots.find(x=>x.source==='meeting'&&x.location==='宿舍外廊露台');
 assert(patio,'past observed location remains on monitor');
 assert(patio.scene.includes('宿舍外廊露台'),'recap is attached to just-finished stage');
 assert(paidSummaries>=1,'actual transition generates a bounded mini-summary');
 const before=paidSummaries;
 now+=100000;
 answer=turn('Carlos没有起身，只是笑着说：“下次我们去厨房试试。”','宿舍厨房','下次我们去厨房试试');
 r=await app.request('/message',{...pair,text:'下次好呀。'});
 assert.equal(r.reply.scene_location,'宿舍卧室','a plan cannot teleport the scene');
 assert.equal(paidSummaries,before,'no recap for hypothetical travel');
 data=JSON.parse(app.exportData()).data;
 assert.equal(data.meetingCheckpoints.filter(x=>x.kind==='scene_transition').length,1);
 now+=100000;
 answer=turn('Carlos走进厨房，将杯子放在料理台上。','宿舍厨房','走进厨房');
 r=await app.request('/message',{...pair,text:'好了，我们真的进厨房了。'});
 assert.equal(r.reply.scene_location,'宿舍厨房');
 data=JSON.parse(app.exportData()).data;
 assert.equal(data.meetingCheckpoints.filter(x=>x.kind==='scene_transition').length,2);
 assert.equal(data.meetingCheckpoints.filter(x=>x.kind!=='scene_transition').length,0,'no 50-exchange checkpoint emitted');
 const preview=app.buildPromptPreview(p.id,pair.characterId,'meeting',{latestText:'刚才在卧室聊了什么？'});
 assert(preview[0].content.includes('按实际地点切换归档的阶段小结'));
 assert.equal((await app.request('/thread?profileId='+p.id+'&characterId='+pair.characterId)).relation.meeting_location,'宿舍厨房');
 const changed=JSON.parse(app.exportData());
 const source=changed.data.messages.find(x=>x.id===cp[0].message_ids[0]);
 source.text='此前真实记录已经修改，这一段旧小结不可继续引用';
 app.importData(JSON.stringify(changed));
 const stale=app.buildPromptPreview(p.id,pair.characterId,'meeting',{latestText:'刚才说了什么'});
 assert(!stale[0].content.includes('他们在宿舍外廊露台真实地聊过当天的计划'),
   'source edit prevents prior scene summary from being trusted');
 assert(paidNarratives>=4);
 console.log('M11: per-turn separate place, two observed scene transitions, source-bound recaps, monitor sync and no 50-group generation passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
