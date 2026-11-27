const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');
const o=read('public/parallel/offline.js'),a=read('public/parallel/app.js');
assert.equal(a,read('parallel_src/parallel_ai_date/static/app.js'));assert.equal(o,read('parallel_src/parallel_ai_date/static/offline.js'));
const f=o.slice(o.indexOf('  function selectTurnWindow('),o.indexOf('  const selectWorkingHistory='));
const select=new Function(f+'\nreturn selectTurnWindow')();
const rows=Array.from({length:40},(_,i)=>({id:String(i),sender:i%2?'ai':'user',text:'x'.repeat(100),created_at:i<20?'2026-11-18':'2026-11-19'}));
assert.equal(select(rows,'chat').length,24);
assert.equal(select(rows,'chat')[0].sender,'user');
assert.equal(select(rows,'chat',['2'])[0].id,'2');
const burst=Array.from({length:30},(_,i)=>({id:'b'+i,sender:'user',text:'x'.repeat(1000)}));
assert.equal(select([...rows,...burst],'chat',burst.map(x=>x.id)).filter(x=>x.id.startsWith('b')).length,30);
const long=[{id:'a',sender:'user',text:'x'.repeat(15000)},{id:'b',sender:'ai',text:'x'.repeat(15000)},{id:'c',sender:'user',text:'new'}];assert.deepEqual(select(long,'chat').map(x=>x.id),['c']);
const code=a.slice(a.indexOf('let trackedChatBody='),a.indexOf('function renderMessages(){'));
let callback;
const harness=new Function('ResizeObserver','requestAnimationFrame',code+'\nreturn {bindChatScroll,restoreChatScroll,scheduleChatScroll,nearChatBottom}')(
 class{constructor(fn){callback=fn}observe(){}disconnect(){}},fn=>fn());
const body={scrollHeight:1000,clientHeight:500,scrollTop:500,isConnected:true,addEventListener(k,fn){this.onScroll=fn},querySelectorAll(){return []},getBoundingClientRect(){return {top:0}}};
const s=harness.bindChatScroll(body);body.clientHeight=200;callback();assert.equal(body.scrollTop,1000,'keyboard resize keeps pinned bottom');
body.scrollTop=100;body.onScroll();assert.equal(s.pinned,false);body.clientHeight=400;callback();assert.equal(body.scrollTop,100,'resize respects historical position');
body.scrollHeight=1600;harness.scheduleChatScroll(body,s);assert.equal(body.scrollTop,100);
assert(a.includes('!e.isComposing&&e.keyCode!==229'));
console.log('Chat anchor and turn-window tests passed');

const clockSource=o.slice(o.indexOf('  function phoneTurnClockMetadata('),o.indexOf('  const prompt=(p,c,mode'));
const phoneClock=new Function('chatClockLabel',clockSource+'\nreturn phoneTurnClockMetadata')(
  ts=>new Date(ts).toISOString().replace('T',' ').slice(0,16));
const overnight=[
  {sender:'user',mode:'chat',created_at:'2026-11-26T00:06:00Z',text:'晚安'},
  {sender:'ai',mode:'chat',created_at:'2026-11-26T00:13:00Z',text:'晚安'},
  {sender:'user',mode:'chat',created_at:'2026-11-26T09:37:00Z',text:'所以不出来玩吗'},
  {sender:'user',mode:'chat',created_at:'2026-11-26T09:37:00Z',text:'好可怜的宝宝'}
];
const now=Date.parse('2026-11-26T09:42:00Z');
assert.match(phoneClock(overnight,2,now),/距上一条消息 564 分钟/);
const current=phoneClock(overnight,3,now);
assert.match(current,/本轮回复时钟：2026-11-26 09:42/);
assert.match(current,/上次角色发言 2026-11-26 00:13（569 分钟前）/);
assert.match(current,/最后用户消息 2026-11-26 09:37（5 分钟前）/);
assert.match(current,/不能把旧活动、睡眠或告别当作此刻状态/);
assert(!phoneClock([{sender:'user',mode:'chat',created_at:''}],0,now).includes('NaN'));
console.log('Phone clock binding and overnight regression passed');
