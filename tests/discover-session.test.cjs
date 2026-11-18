const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public/parallel/app.js'),'utf8');
const offline=fs.readFileSync(path.join(root,'public/parallel/offline.js'),'utf8');
assert.equal(app,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/app.js'),'utf8'));
assert.equal(offline,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/offline.js'),'utf8'));
function between(s,a,b){return s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a)))}
async function run(){
  const setup=String.raw`
    const state={tab:'discover',activeId:'A',candidates:[],deckIndex:0,loading:false};
    const profiles={A:{id:'A',sources:['A']},B:{id:'B',sources:['B']}};
    const activeProfile=()=>profiles[state.activeId];
    const calls=[],renders=[],controls={defer:null,fail:false,next:0};
    const $=()=>({innerHTML:'',style:{}}),I=()=>'',renderProfileDropdownHtml=()=>'',empty=()=>'',toast=()=>{},refreshInboxQuietly=()=>{},matchModal=()=>{};
    const setTimeout=(fn)=>fn();
    const renderDiscover=total=>renders.push([state.tab,state.activeId,state.deckIndex,total]);
    const api=async(route,data)=>{
      calls.push([route,data.profileId,Boolean(data.refresh)]);
      if(route==='/swipe')return {matched:false};
      if(controls.fail)throw Error('failed');
      if(controls.defer)await controls.defer;
      const n=++controls.next;
      return {candidates:[{id:data.profileId+n+'-1'},{id:data.profileId+n+'-2'},{id:data.profileId+n+'-3'}],total_available:20};
    };
  `;
  const source=setup+between(app,'const discoverDecks=new Map()','function empty(')+'\n'+between(app,'async function doSwipe(','function matchModal(')+'\nreturn {state,loadCandidates,doSwipe,discoverDecks,discoverRequests,calls,renders,controls};';
  const h=new Function(source)();const {state,loadCandidates,doSwipe,calls,renders,controls}=h;
  await loadCandidates(); const original=state.candidates.map(x=>x.id);
  await doSwipe('left');await doSwipe('left');
  state.tab='messages';state.tab='discover';await loadCandidates();
  assert.equal(state.deckIndex,2); assert.deepEqual(state.candidates.map(x=>x.id),original);
  assert.equal(calls.filter(x=>x[0]==='/discover').length,1);
  await doSwipe('left'); await loadCandidates();assert.equal(state.deckIndex,3);
  state.activeId='B';await loadCandidates();assert.equal(state.deckIndex,0);
  state.activeId='A';await loadCandidates();assert.equal(state.deckIndex,3);
  await loadCandidates(true);assert.equal(state.deckIndex,0);assert.notDeepEqual(state.candidates.map(x=>x.id),original);
  const refreshed=state.candidates.map(x=>x.id);controls.fail=true;await loadCandidates(true);controls.fail=false;assert.deepEqual(state.candidates.map(x=>x.id),refreshed);
  let release;controls.defer=new Promise(r=>release=r);const before=calls.length;const p1=loadCandidates(true),p2=loadCandidates(true);state.tab='messages';const renderCount=renders.length;release();await Promise.all([p1,p2]);controls.defer=null;
  assert.equal(calls.length,before+1);assert.equal(renders.length,renderCount);
  state.tab='discover';await loadCandidates();assert.equal(calls.length,before+1);
  const parser=between(offline,'  const PROTOCOL_LEADING_TAG_RE=','  const sanitizeStoredData=')+'\n'+between(offline,'  const splitChatBubbles=','  const photoText=')+'\nreturn {splitChatBubbles,isChatArtifact};';
  const {splitChatBubbles:split,isChatArtifact}=new Function(parser)();
  for(const raw of ['旁白','旁白：','【旁白】','[旁白]','Narrator:','Narration','*旁白*','[短信] 旁白'])assert.deepEqual(split(raw),[],raw);
  assert.deepEqual(split('旁白|||Hi, Bryan!'),['Hi, Bryan!']);
  assert.deepEqual(split('我喜欢这部电影的旁白。'),['我喜欢这部电影的旁白。']);
  assert(isChatArtifact({sender:'ai',mode:'chat',text:'旁白'}));assert(!isChatArtifact({sender:'user',mode:'chat',text:'旁白'}));assert(!isChatArtifact({sender:'ai',mode:'meeting',text:'旁白'}));
  console.log('Discover navigation, profile isolation, exhausted deck, refresh, concurrent request, stale render and narration checks passed');
}
run().catch(e=>{console.error(e);process.exitCode=1});
