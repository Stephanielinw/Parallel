const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const app=read('public/parallel/app.js');
assert.equal(app,read('parallel_src/parallel_ai_date/static/app.js'),'Pages and local UI must stay identical');
const begin=app.indexOf('let activeSwipeGesture=false;');
const end=app.indexOf('async function doSwipe(direction){',begin);
assert(begin>=0&&end>begin,'swipe handlers are available');
const swipeSource=app.slice(begin,end);
const handlers=new Map(),classes=new Set(),swipes=[],stamps={like:{style:{}},nope:{style:{}}};
let captured=null,frameId=0;
const frames=new Map();
const card={
  isConnected:true,style:{transform:'',opacity:'1'},
  classList:{add:x=>classes.add(x),remove:x=>classes.delete(x)},
  querySelector:sel=>sel==='#stamp-like'?stamps.like:sel==='#stamp-nope'?stamps.nope:null,
  addEventListener:(name,callback,options)=>handlers.set(name,{callback,options}),
  setPointerCapture:id=>{captured=id;},
  hasPointerCapture:id=>captured===id,
  releasePointerCapture:id=>{if(captured===id)captured=null;}
};
const state={loading:false,activeId:'test-profile'};
vm.runInNewContext(swipeSource+';attachSwipe();',{
  state,discoverRequests:new Map(),$:id=>id==='swipe-card'?card:null,
  doSwipe:direction=>swipes.push(direction),
  requestAnimationFrame:callback=>{const id=++frameId;frames.set(id,callback);return id;},
  cancelAnimationFrame:id=>frames.delete(id)
});
const flush=()=>{for(const [id,callback] of [...frames]){frames.delete(id);callback();}};
const touch=(x,y,id=7)=>({identifier:id,clientX:x,clientY:y});
const fire=(name,values={})=>{
  const record=handlers.get(name);assert(record,'missing '+name+' handler');
  const e={...values,prevented:false,stopped:false,cancelable:true,preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};
  record.callback(e);
  return e;
};
const touchStart=(x,y)=>fire('touchstart',{touches:[touch(x,y)],changedTouches:[touch(x,y)]});
const touchMove=(x,y)=>fire('touchmove',{touches:[touch(x,y)],changedTouches:[touch(x,y)]});
const touchEnd=(x,y)=>fire('touchend',{touches:[],changedTouches:[touch(x,y)]});
const touchCancel=()=>fire('touchcancel',{touches:[],changedTouches:[]});
assert.equal(handlers.get('touchmove').options.passive,false,'horizontal motion must be able to prevent browser panning');
assert.equal(handlers.get('touchstart').options.passive,true,'touch start should not block normal scrolling');
// Finger starts over the full-size photo button: bubbled touch events still swipe.
touchStart(100,150);
const draggedRight=touchMove(230,153);flush();
assert(draggedRight.prevented,'horizontal movement should disable default touch handling');
assert(classes.has('dragging'),'the card should visually track the finger');
assert(card.style.transform.includes('130px'),'card should visibly move right');
touchEnd(230,153);
assert.deepEqual(swipes,['right']);
assert(!classes.has('dragging'));
// Next gesture must work in the opposite direction without remounting the card.
touchStart(220,150);const draggedLeft=touchMove(92,151);flush();touchEnd(90,151);
assert(draggedLeft.prevented);assert.deepEqual(swipes,['right','left']);
// Short drags snap back, but must not consume a candidate.
touchStart(100,150);touchMove(132,153);touchEnd(132,153);
assert.equal(swipes.length,2);assert.equal(card.style.transform,'');
// Vertical scroll remains native and never swipes.
touchStart(100,110);const scrolled=touchMove(103,200);touchEnd(103,200);
assert(!scrolled.prevented,'up/down scrolling must remain possible');
assert.equal(swipes.length,2);
// Safari cancellation must clear the drag; the next swipe must still succeed.
touchStart(100,150);touchMove(145,150);touchCancel();
assert(!classes.has('dragging'));assert.equal(swipes.length,2);
touchStart(100,150);touchMove(230,150);touchEnd(230,150);
assert.deepEqual(swipes,['right','left','right']);
// Legacy pointer touch events cannot fight the touch handlers.
fire('pointerdown',{pointerType:'touch',isPrimary:true,button:0,pointerId:8,clientX:100,clientY:100});
fire('pointermove',{pointerType:'touch',pointerId:8,clientX:250,clientY:100});
fire('pointerup',{pointerType:'touch',pointerId:8,clientX:250,clientY:100});
assert.equal(swipes.length,3);
// Mouse and pen continue to use pointer capture and commit normally.
fire('pointerdown',{pointerType:'mouse',isPrimary:true,button:0,pointerId:9,clientX:200,clientY:150});
fire('pointermove',{pointerType:'mouse',pointerId:9,clientX:90,clientY:150});flush();
fire('pointerup',{pointerType:'mouse',pointerId:9,clientX:90,clientY:150});
assert.deepEqual(swipes,['right','left','right','left']);
// Tap on photo must not be blocked; click after a completed drag is suppressed.
touchStart(100,120);touchEnd(100,120);
assert(!fire('click').prevented,'a normal photo tap should still work');
touchStart(100,120);touchMove(180,120);touchEnd(180,120);
assert(fire('click').prevented,'a drag must not accidentally open the photo');
// The saved-card session/progress is intentionally still handled by doSwipe.
assert(app.includes("api('/discover-progress',{profileId:pid,batchId:deck.batchId,index,characterId:c.id})"));
console.log('iPhone touch swipe right/left, vertical scroll, cancel recovery, photo tap and desktop pointer swipe passed.');
