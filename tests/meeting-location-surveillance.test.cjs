const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {webcrypto}=require('node:crypto');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const offline=read('public/parallel/offline.js'),app=read('public/parallel/app.js');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'));
assert.equal(app,read('parallel_src/parallel_ai_date/static/app.js'));
const scene=offline.slice(offline.indexOf('  const SCENE_RULES='),offline.indexOf('  function currentPlanRows('));
const parse=new Function(scene+'return {explicitArrivalPlace,meetingPlaceInPlayerTurn,isNonPlaceText};')();
assert.equal(parse.explicitArrivalPlace('我已经到了诶…'),'');
assert.equal(parse.explicitArrivalPlace('我到了，在咖啡店门口'),'咖啡店门口');
assert(parse.isNonPlaceText('诶…'));
assert.equal(parse.meetingPlaceInPlayerTurn('说着不留宿，还是赖在我床上了…','Lin'),'Lin 的卧室');
assert.equal(parse.meetingPlaceInPlayerTurn('如果明天在我床上赖着不走呢？','Lin'),'');
assert(app.includes('data-action="surv-close-meeting"'));
assert(app.includes("api('/mode',{profileId,characterId,mode:'meeting',location:next})"));
const now=Date.parse('2026-11-20T21:43:00.000Z');
class Clock extends Date{
  constructor(...args){super(...(args.length?args:[now]));}
  static now(){return now;}
}
const cache=new Map(),window={};
const ctx={window,localStorage:{getItem:k=>cache.get(k)??null,setItem:(k,v)=>cache.set(k,v)},crypto:webcrypto,URLSearchParams,Date:Clock,JSON,Math,TextEncoder,console,fetch:async()=>{throw Error('No paid network calls allowed')}};
vm.createContext(ctx);vm.runInContext(offline,ctx);
const e=window.ParallelOffline;
const at=min=>new Date(now-min*60000).toISOString();
(async()=>{
 const profile=(await e.request('/profile',{name:'Lin',age:25,gender:'female',interested_in:['male'],min_age:18,max_age:65,sources:['生化危机 · 游戏']})).profile;
 const pair={profileId:profile.id,characterId:'re-game:carlos:re3'};
 let matched=false;
 for(let i=0;i<20;i++)if((await e.request('/swipe',{...pair,direction:'right'})).matched){matched=true;break;}
 assert(matched,'fixture Carlos must match');
 const start=await e.request('/mode',{...pair,mode:'meeting',triggerOpening:false});
 assert.equal(start.mode,'meeting');
 const pack=JSON.parse(e.exportData());
 const rel=Object.values(pack.data.relations).find(x=>x.profile_id===profile.id&&x.character_id===pair.characterId);
 assert(rel);
 rel.meeting_started_at=at(165); // 18:58, with now fixed at 21:43
 rel.meeting_location='诶…'; // legacy false-positive to repair
 rel.meeting_location_history=[];
 pack.data.messages.push({id:'prior_cafe',profile_id:profile.id,character_id:pair.characterId,sender:'user',mode:'chat',text:'店名就叫Cafe',meeting_id:'',engine:'human',created_at:at(170)});
 pack.data.messages.push({id:'scene_room',profile_id:profile.id,character_id:pair.characterId,sender:'user',mode:'meeting',text:'说着不留宿，还是赖在我床上了…',meeting_id:rel.active_meeting_id,engine:'human',created_at:at(23)});
 e.importData(JSON.stringify(pack));
 const current=await e.request('/thread?profileId='+profile.id+'&characterId='+encodeURIComponent(pair.characterId));
 assert.equal(current.relation.meeting_location,'Lin 的卧室');
 const surv=current.surveillance;
 assert.equal(surv.current.location,'Lin 的卧室');
 const steps=surv.unlockedSlots;
 const meeting=steps.filter(x=>x.source==='meeting');
 assert(meeting.length>=2,'meeting should reflect start location and subsequent bedroom transition');
 assert(meeting.some(x=>x.location==='Cafe'&&x.start==='18:58'),'legacy phantom place must recover explicitly named pre-meeting café');
 assert(meeting.some(x=>x.location==='Lin 的卧室'&&x.start==='21:20'),'real user-scene movement must be retained');
 assert(!steps.some(x=>x.source==='schedule'&&x.start==='21:00'),'fictional 21:00 schedule must not coexist with ongoing meeting');
 assert(!steps.some(x=>x.location==='诶…'),'invalid place must be repaired throughout live view');
 const changed=await e.request('/mode',{...pair,mode:'meeting',location:'Lin 的客厅'});
 assert.equal(changed.surveillance.current.location,'Lin 的客厅');
 const again=await e.request('/thread?profileId='+profile.id+'&characterId='+encodeURIComponent(pair.characterId));
 assert.equal(again.relation.meeting_location,'Lin 的客厅','manual change must not get overridden by older dialogue');
 const persisted=JSON.parse(e.exportData()).data;
 const stored=Object.values(persisted.relations).find(x=>x.profile_id===profile.id&&x.character_id===pair.characterId);
 assert(stored.meeting_location_history.some(x=>x.source==='start'));
 assert(stored.meeting_location_history.some(x=>x.source==='manual'));
 await e.request('/mode',{...pair,mode:'chat',finalizeMeeting:false});
 const historic=await e.request('/surveillance',{...pair,date:'2026-11-20'});
 assert(historic.unlockedSlots.some(x=>x.source==='meeting'&&x.location==='Lin 的卧室'),'finalized meeting must retain room footprint');
 assert(!historic.unlockedSlots.some(x=>x.source==='schedule'&&x.start==='21:00'),'finalized meeting must suppress overlapping generated schedule');
 console.log('No phantom 诶… location; meeting-to-bedroom transition, manual override, on-site surveillance and final archive passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
