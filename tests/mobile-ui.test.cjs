const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'../public/parallel/app.js'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'../public/parallel/style.css'),'utf8');
const source=app.slice(app.indexOf('const READ_CURSOR_KEY='),app.indexOf('async function loadThreads('));
test('unread cursors track incoming messages, not sent or pending messages, and isolate profiles',()=>{
  const values=new Map();
  const storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
  const state={activeId:'p1',tab:'discover',threadId:'',messages:[],hiddenReplyIds:new Set()};
  const doc={hidden:false,querySelectorAll:()=>[]};
  const h=new Function('localStorage','state','document',source+';return {applyInboxSnapshot,threadHasUnread,markDisplayedIncomingRead,isIncoming};')(storage,state,doc);
  const m=(id,sender='ai',p='p1')=>({id,sender,profile_id:p,character_id:'c1',mode:'chat',engine:'live',text:'hello'});
  const t=(incoming,queue=0)=>({character:{id:'c1'},last_incoming:incoming,queue:{count:queue}});
  h.applyInboxSnapshot('p1',[t(m('old'))]);
  assert.equal(h.threadHasUnread(t(m('old'),3)),false);
  assert.equal(h.threadHasUnread(t(m('user','user'),3)),false);
  assert.equal(h.threadHasUnread(t(m('new'))),true);
  state.tab='messages';state.threadId='c1';state.messages=[m('new')];doc.hidden=true;
  h.markDisplayedIncomingRead();assert.equal(h.threadHasUnread(t(m('new'))),true);
  doc.hidden=false;h.markDisplayedIncomingRead();assert.equal(h.threadHasUnread(t(m('new'))),false);
  state.hiddenReplyIds.add('future');state.messages.push(m('future'));h.markDisplayedIncomingRead();
  assert.equal(h.threadHasUnread(t(m('future'))),true);
  state.activeId='p2';h.applyInboxSnapshot('p2',[]);
  assert.equal(h.threadHasUnread(t(m('new','ai','p2'))),true);
  assert.equal(h.threadHasUnread(t({...m('error','ai','p2'),engine:'error'})),false);
  state.activeId='p1';assert.equal(h.threadHasUnread(t(m('new'))),false);
  const h2=new Function('localStorage','state','document',source+';return {threadHasUnread};')(storage,state,doc);
  assert.equal(h2.threadHasUnread(t(m('new'))),false);
});
test('layout locks document but keeps inner scroll and 16px editable controls',()=>{
  assert.match(css,/html,body,#root\{[^}]*overflow:hidden/);
  assert.match(css,/#app \.chat-body\{overflow-y:auto/);
  assert.match(css,/textarea,select,\[contenteditable="true"\]\{font-size:16px!important\}/);
  assert.doesNotMatch(app,/thread-queue-badge/);
});


test('model selector independently normalizes and searches chat and image IDs',()=>{
  const start=app.indexOf('const modelPickerConfig='),end=app.indexOf('function renderApiSettings(){');
  const source=app.slice(start,end);
  const h=new Function(source+';return {normalizeModelIds,filterModelIds,modelPickerConfig};')();
  assert.deepEqual(h.normalizeModelIds(['gemini-2.5-pro','gemini-2.5-pro','  gpt-4.1 ',null,9,'']),['gemini-2.5-pro','gpt-4.1']);
  assert.deepEqual(h.filterModelIds(['gemini-2.5-pro','gpt-4.1'],' GEMINI '),['gemini-2.5-pro']);
  assert.equal(h.modelPickerConfig.chat.route,'/models');
  assert.equal(h.modelPickerConfig.image.route,'/image-models');
});
test('model picker opens on successful pull without replacing manual ID, and selection is scoped',async()=>{
  const source=app.slice(app.indexOf('const modelPickerConfig='),app.indexOf('function renderApiSettings(){'));
  const nodes=new Map();
  function field(id,value=''){const obj={id,value,readOnly:false,hidden:false,disabled:false,isConnected:true,setAttribute(){},removeAttribute(){},addEventListener(){},focus(){this.focused=true;}};nodes.set(id,obj);return obj;}
  field('api-url','https://chat.invalid/v1');field('api-key');field('api-model','existing');
  field('api-image-url','https://image.invalid/v1');field('api-image-key');field('api-image-model','image-existing');
  field('model-picker-chat');field('model-picker-image');field('api-settings-form');field('model-picker-search');
  const state={settings:{base_url:'https://chat.invalid/v1',has_key:true,image_base_url:'https://image.invalid/v1',has_image_key:true},tab:'terminal',terminalTab:'api'};
  let modalHtml='',calls=[];const api=async route=>{calls.push(route);return {models:route==='/models'?['gemini-pro','gpt','gemini-pro']:['image-one']};};
  const h=new Function('$','state','api','modal','closeModal','toast','document','esc','I',source+';return {pullModelIds,availableModelIds,selectModelId,manualModelId,syncModelPicker,invalidateModelPicker};')(id=>nodes.get(id),state,api,html=>{modalHtml=html;},()=>{modalHtml='';},()=>{},{querySelector:()=>null},String,()=> '');
  await h.pullModelIds('chat');assert.equal(calls[0],'/models');assert.match(modalHtml,/gemini-pro/);assert.equal(nodes.get('api-model').value,'existing');assert.equal(nodes.get('api-model').readOnly,true);
  h.selectModelId('chat','gemini-pro');assert.equal(nodes.get('api-model').value,'gemini-pro');assert.equal(nodes.get('api-image-model').value,'image-existing');
  h.manualModelId('chat');assert.equal(nodes.get('api-model').readOnly,false);assert.equal(nodes.get('api-model').focused,true);
  await h.pullModelIds('image');assert.equal(calls[1],'/image-models');assert.deepEqual(h.availableModelIds('image'),['image-one']);
  h.selectModelId('image','image-one');assert.equal(nodes.get('api-image-model').value,'image-one');
  nodes.get('api-url').value='https://new.invalid/v1';h.syncModelPicker('chat');assert.deepEqual(h.availableModelIds('chat'),[]);assert.equal(nodes.get('api-model').readOnly,false);
  h.invalidateModelPicker('image');h.syncModelPicker('image');assert.equal(nodes.get('api-image-model').readOnly,false);
});
