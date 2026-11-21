const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
process.env.TZ='America/Los_Angeles';
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const offline=read('public/parallel/offline.js'),appSource=read('public/parallel/app.js');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'));
assert.equal(appSource,read('parallel_src/parallel_ai_date/static/app.js'));
new Function(offline);new Function(appSource);
const store=new Map(),calls=[];let seq=0;
let now=Date.parse('2026-11-21T09:29:00-08:00');
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const fetchMock=async(url,opts)=>{
 const request=JSON.parse(opts.body);calls.push(request);
 const system=request.messages.find(m=>m.role==='system')?.content||'';
 let content='Leon 随手收起外套，在 Lin 家里继续和她说话。';
 if(system.includes('你是角色个人日程规划器')){
   content=JSON.stringify({slots:[
    {start:'14:32',end:'17:00',location:'Lin 家附近街道',status:'返程途中',activity:'从 Lin 家慢慢离开，步行回去',scene:'Leon 收拾装备，沿街返回日常岗位。'},
    {start:'17:00',end:'23:59',location:'警局附近',status:'值班整备',activity:'恢复自己的日常工作',scene:'天色转暗后，他整理档案。'}
   ]});
 }else if(request.response_format)content=JSON.stringify({summary:'先在警局相遇，之后到 Lin 家待在一起，下午结束了见面。'});
 return {ok:true,status:200,json:async()=>({choices:[{message:{content},finish_reason:'stop'}]})};
};
function start(){
 const window={};
 vm.runInNewContext(offline,{window,localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},crypto:{randomUUID:()=> 'id'+(++seq)},URLSearchParams,Date:Clock,JSON,Math,TextEncoder,AbortController,setTimeout,clearTimeout,console,fetch:fetchMock});
 return window.ParallelOffline;
}
(async()=>{
 const app=start(),p=(await app.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['all'],min_age:18,max_age:65,sources:['生化危机']})).profile;
 const pair={profileId:p.id,characterId:'re-game:leon:re2'},uri='/thread?profileId='+encodeURIComponent(p.id)+'&characterId='+encodeURIComponent(pair.characterId);
 for(let i=0;i<30;i++)if((await app.request('/swipe',{...pair,direction:'right'})).matched)break;
 await app.request('/settings',{base_url:'https://example.com/v1',api_key:'not-real',model:'mock',auto_translate:false});
 const initial=await app.request('/mode',{...pair,mode:'meeting',location:'警局二楼警员休息室',triggerOpening:false});
 assert(initial.active_meeting_id);
 now=Date.parse('2026-11-21T10:17:00-08:00');
 const actual=await app.request('/message',{...pair,text:'已经把你带回我家了，我们在我的家里继续说话。'});
 assert(actual.user&&actual.reply);
 now=Date.parse('2026-11-21T14:14:00-08:00');
 let surv=await app.request('/surveillance',{...pair,date:'2026-11-21'});
 assert.equal(surv.current.location,'Lin 的家','last real on-site scene overrides police station');
 assert.equal(surv.current.source,'meeting');
 assert(surv.unlockedSlots.some(x=>x.source==='meeting'&&x.location==='Lin 的家'));
 assert(!surv.unlockedSlots.some(x=>x.source==='schedule'&&x.start>='09:29'),'future schedule cannot masquerade as actual during the live meeting');
 const before=calls.length;
 await app.request('/surveillance',{...pair,date:'2026-11-21',refresh:true});
 assert.equal(calls.length,before,'refresh while meeting must not re-roll a contradictory full day');
 now=Date.parse('2026-11-21T14:16:00-08:00');
 const closed=await app.request('/mode',{...pair,mode:'chat',finalizeMeeting:false});
 assert.equal(closed.meetingRecord.location,'Lin 的家');
 assert.equal(closed.meetingRecord.started_at,new Date(Date.parse('2026-11-21T09:29:00-08:00')).toISOString());
 assert(calls.some(x=>(x.messages?.[0]?.content||'').includes('你是角色个人日程规划器')),'end meeting must trigger one post-meeting replan');
 const plannerCall=calls.find(x=>(x.messages?.[0]?.content||'').includes('你是角色个人日程规划器'));
 assert(JSON.stringify(plannerCall).includes('Lin 的家'),'new schedule must anchor to last real place');
 surv=await app.request('/surveillance',{...pair,date:'2026-11-21'});
 assert(surv.unlockedSlots.some(s=>s.source==='meeting'&&s.location==='Lin 的家'));
 assert(surv.unlockedSlots.some(s=>s.source==='meeting_shift'&&s.start==='14:16'),'post-meeting begins at actual finish');
 assert(!surv.unlockedSlots.some(s=>s.source==='schedule'&&s.start==='14:14'),'old afternoon route must be superseded');
 now=Date.parse('2026-11-21T14:45:00-08:00');
 const resumed=await app.request('/mode',{...pair,mode:'meeting',resumeMeetingId:initial.active_meeting_id,triggerOpening:false});
 assert.equal(resumed.location,'Lin 的家','reopening chooses last confirmed user scene over stale archive location');
 surv=await app.request('/surveillance',{...pair,date:'2026-11-21'});
 assert.equal(surv.current.location,'Lin 的家');
 assert(!surv.unlockedSlots.some(s=>s.source==='meeting_shift'&&s.start==='14:16'),'previous post-meeting plan disappears on reopening');
 assert(!surv.unlockedSlots.some(s=>s.source==='schedule'&&s.start>='09:29'));
 const corrected=await app.request('/mode',{...pair,mode:'meeting',location:'Lin 的卧室'});
 assert.equal(corrected.surveillance.current.location,'Lin 的卧室','manual correction must override old scene');
 const full=await app.request(uri);
 assert.equal(full.relation.meeting_location,'Lin 的卧室');
 assert.equal(full.meetings.length,1,'resumed meeting remains one card');
 assert(appSource.includes('resume-meeting-place'),'UI supports one-time correction from archive modal');
 console.log('Meeting supersedes speculative timeline; home is restored on resume; future is replanned after end, and old plans clear on reopening.');
})().catch(e=>{console.error(e);process.exitCode=1});
