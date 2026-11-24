const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const src=read('public/parallel/app.js');
assert.equal(src,read('parallel_src/parallel_ai_date/static/app.js'));
new Function(src);

const extractedModal=src.slice(
  src.indexOf('let inboxRequestSeq=0,threadRequestSeq=0;'),
  src.indexOf('const isIncoming='));
const extractedState=src.slice(
  src.indexOf('const typingRequests=new Map();'),
  src.indexOf('async function loadThread(cid'));
assert(extractedModal.includes('beginPairModalRequest'));
assert(extractedState.includes('function activateProfile(nextId)'));
const state={
  tab:'messages',profiles:[{id:'p1'},{id:'p2'}],
  activeId:'p1',threadId:'re-game:carlos:re3',
  renderedThreadId:JSON.stringify(['p1','re-game:carlos:re3']),
  threads:[{character:{id:'re-game:carlos:re3'}}],
  messages:[{id:'p1-secret',text:'只属于第一个 Profile 的对话'}],
  translations:{secret:'private'},meetings:[{id:'p1-scene'}],
  lastMemoriesData:{memories:[{id:'p1-private-memory'}]},
  surveillanceMap:{},diaryMap:{},diarySummaryMap:{},
  draftInputs:{},queue:{status:'paused'},taskState:{status:'paused'},
  bgErrors:{error:'old'},candidates:[{id:'candidate'}],profileDraft:{id:'p1'},
  profileMenuOpen:true,hiddenReplyIds:new Set(),chatMode:'meeting',
  activeMeetingId:'p1-meeting',meetingLocation:'p1-bedroom',memoryCategory:'meeting'
};
const rows=new Map();
const input={value:'P1 Carlos 还没发送的私密草稿 🐕‍🦺'};
const $=id=>id==='chat-input'?input:null;
const localStorage={setItem:(k,v)=>rows.set(k,v)};
let closed=0;
function closeModal(){closed++;}
const h=new Function('state','$','localStorage','closeModal','renderMessages','isCurrentThreadPaused',`
let activeChatQuote={profileId:'p1',characterId:'re-game:carlos:re3',text:'P1 quote'};
`+extractedModal+extractedState+`
return {
  typingPair,beginPairModalRequest,ownsPairModalRequest,activateProfile,
  renderPair:()=>loadedThreadPair,quote:()=>activeChatQuote,
  token:()=>modalRequestSeq
};`)(state,$,localStorage,closeModal,()=>{},()=>false);
const cid='re-game:carlos:re3';
const pair1=h.typingPair('p1',cid);
const pair2=h.typingPair('p2',cid);
assert.notEqual(pair1,pair2,'identical character in different Profiles needs isolated UI keys');
assert.equal(state.renderedThreadId,pair1);
const old=h.beginPairModalRequest('p1',cid);
assert(h.ownsPairModalRequest(old));
assert.equal(h.activateProfile('p2'),true);
assert.equal(rows.get('parallel-active-profile'),'p2');
assert.equal(state.draftInputs[pair1],input.value);
assert.equal(state.draftInputs[pair2],undefined,'new Profile never inherits old unsent text');
assert.equal(h.ownsPairModalRequest(old),false,'stale P1 modal cannot reopen in P2');
assert.equal(state.threadId,'');
assert.equal(state.renderedThreadId,'');
assert.deepEqual(state.messages,[]);
assert.deepEqual(state.meetings,[]);
assert.deepEqual(state.translations,{});
assert.equal(state.lastMemoriesData,null);
assert.equal(state.meetingLocation,'');
assert.equal(state.chatMode,'chat');
assert.equal(h.quote(),null);
assert.equal(state.queue.status,'idle');
assert.equal(h.renderPair(),'');
assert.equal(closed,1);
assert.equal(h.activateProfile('p2'),false,'same Profile is a no-op');
assert.equal(closed,1);
assert.equal(h.activateProfile('unknown'),false,'unknown Profile is rejected');
state.threadId=cid;
const current=h.beginPairModalRequest('p2',cid);
assert(h.ownsPairModalRequest(current));
const newer=h.beginPairModalRequest('p2',cid);
assert.equal(h.ownsPairModalRequest(current),false,'later request supersedes earlier modal');
assert(h.ownsPairModalRequest(newer));
state.tab='discover';
assert.equal(h.ownsPairModalRequest(newer),false,'navigating away rejects late modal');
state.tab='messages';state.threadId='re-game:leon:re6';
assert.equal(h.ownsPairModalRequest(newer),false,'switching character rejects stale content');
const revived=h.beginPairModalRequest('p2','re-game:leon:re6');
assert(h.ownsPairModalRequest(revived));
assert.equal(h.activateProfile('p1'),true);
assert.equal(h.ownsPairModalRequest(revived),false);
assert.equal(state.draftInputs[pair1],input.value);
const guardedFunctions=[
  ['surveillance','async function openSurveillanceModal(', 'if(!ownsPairModalRequest(scope))return;'],
  ['diary','async function openDiaryModal(', 'if(!ownsPairModalRequest(scope))return;'],
  ['memories','async function openMemoriesModal(', 'if(!ownsPairModalRequest(scope))return;'],
  ['photo','async function openChatPhoto(', 'if(!ownsPairModalRequest(scope))return;']
];
for(const [label,marker,guard] of guardedFunctions){
  const start=src.indexOf(marker);
  assert(start>=0,'missing '+label+' async modal');
  const following=src.slice(start,start+1800);
  assert(following.includes('beginPairModalRequest('),'missing '+label+' owner capture');
  assert(following.includes(guard),'missing '+label+' stale request guard');
}
for(const [field,expr] of [
  ['drafts','state.draftInputs[typingPair(state.activeId,state.threadId)]'],
  ['surveillance','state.surveillanceMap[typingPair(state.activeId,c.id)]'],
  ['diary','state.diaryMap[typingPair(pid,c.id)]'],
  ['diary-summary','state.diarySummaryMap[typingPair(pid,c.id)]']
])assert(src.includes(expr),field+' still uses unscoped role keys');
assert(!src.includes('state.diarySummaryMap[cid]'),'unscoped diary summary is forbidden');
assert(!src.includes('state.surveillanceMap[cid]'),'unscoped surveillance is forbidden');
assert(!src.includes('state.draftInputs[state.threadId]'),'unscoped drafts are forbidden');
// A gallery ref from two different Profiles must not share a preview cache.
const photoSnippet=src.slice(src.indexOf('const chatPhotoCache=new Map();'),src.indexOf('async function hydrateChatPhotos()'));
const scopedPhotos=new Function('state','chatPhotoAsset','esc',
  photoSnippet+'return {chatPhotoCache,chatPhotoKey,renderChatPhoto};')(
  state,()=>'',String
);
const sameRef='possibly-restored-reference';
const photoA=scopedPhotos.chatPhotoKey('p1','re-game:carlos:re3',sameRef);
const photoB=scopedPhotos.chatPhotoKey('p2','re-game:carlos:re3',sameRef);
assert.notEqual(photoA,photoB,'photo preview is Profile-scoped even when ref collides');
scopedPhotos.chatPhotoCache.set(photoA,'data:image/jpeg;base64,AAA');
state.activeId='p2';state.threadId='re-game:carlos:re3';
assert(!scopedPhotos.renderChatPhoto({id:'photo-from-b',photo_kind:'gallery',photo_ref:sameRef,sender:'user'}).includes('base64,AAA'),
  'the second Profile must not display the first Profile photo');
scopedPhotos.chatPhotoCache.set(photoB,'data:image/jpeg;base64,BBB');
assert(scopedPhotos.renderChatPhoto({id:'photo-from-b',photo_kind:'gallery',photo_ref:sameRef,sender:'user'}).includes('base64,BBB'),
  'each Profile retrieves its own gallery preview');
assert(src.includes('if(loadedThreadPair!==typingPair(pid,cid))++modalRequestSeq;'),
  'switching character invalidates old async modal before network response');
const workflow=read('.github/workflows/pages.yml');
assert(workflow.includes('node tests/m07-ui-state-isolation.test.cjs'));
console.log('M07: two-Profile same-character drafts, modal epochs, identity switch cleanup and source guards passed.');
