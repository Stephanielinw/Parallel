const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'..');
const app=fs.readFileSync(path.join(root,'public/parallel/app.js'),'utf8');
const css=fs.readFileSync(path.join(root,'public/parallel/style.css'),'utf8');
assert.equal(app,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/app.js'),'utf8'));
assert.equal(css,fs.readFileSync(path.join(root,'parallel_src/parallel_ai_date/static/style.css'),'utf8'));
const start=app.indexOf('function getPresetGroupName('),end=app.indexOf('function renderSystemLogs(){',start);
assert(start>0&&end>start,'grouped preset UI functions exist');
const state={presets:[],presetMode:'meeting',collapsedPresetGroups:new Set()};
const esc=s=>String(s??'').replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
const saveCalls=[];
const panels=new Map();
const buttons=[];
function makeHeader(name){
  const panel={hidden:false},section={classList:{toggle(k,value){this[k]=value;}},querySelector(){return panel;}};
  const header={dataset:{group:name},attrs:{},closest(){return section;},setAttribute(k,v){this.attrs[k]=v;}};
  panels.set(name,panel);buttons.push(header);return header;
}
makeHeader('入园仪式');makeHeader('造梦犬行为');
const document={querySelectorAll:()=>buttons};
const factory=new Function('state','I','esc','renderPresetDiagnosticsBox','document','saveCollapsedPresetGroups',
  app.slice(start,end)+'\nreturn {getPresetGroupName,getPresetDisplayName,getPresetGroupRuns,renderPresets,setPresetGroupCollapsed,setAllPresetGroupsCollapsed,presetGroupStateKey};');
const ui=factory(state,()=>'<svg></svg>',esc,()=>'',document,()=>saveCalls.push([...state.collapsedPresetGroups]));
const make=(id,group,name,enabled=true,order=0)=>({id,mode:'meeting',name,group,role:'system',enabled,sort_order:order,content:'多行\nPrompt　规则 '+id});
state.presets=[
  make('a','入园仪式','入园仪式 / 乐园启动',true,0),
  make('b','入园仪式','入园仪式 / 造梦犬授名',true,1),
  make('c','造梦犬行为','造梦犬行为 / 去油腻',true,2),
  make('d','造梦犬行为','造梦犬行为 / 安全边界',false,3),
  make('e','文风（单选）','文风（单选） / 冷峻白描',true,4),
  make('f','','独立条目',true,5)
];
assert.equal(ui.getPresetGroupRuns(state.presets).length,4);
let html=ui.renderPresets();
assert.equal((html.match(/class="preset-group-header"/g)||[]).length,4);
assert(html.includes('入园仪式')&&html.includes('2 个条目 · 2 个启用'));
assert(html.includes('造梦犬行为')&&html.includes('2 个条目 · 1 个启用'));
assert(html.includes('文风（单选）')&&html.includes('未分组'));
assert(html.includes('#1')&&html.includes('#6'));
assert(html.includes('乐园启动')&&!html.includes('>#1 入园仪式 / 乐园启动'));
const order=['data-id="a"','data-id="b"','data-id="c"','data-id="d"','data-id="e"','data-id="f"'].map(t=>html.indexOf(t));
assert(order.every((x,i)=>x>=0&&(i===0||x>order[i-1])),'every row preserves original prompt order');
ui.setPresetGroupCollapsed('入园仪式',true);
assert.equal(panels.get('入园仪式').hidden,true);
assert.equal(buttons[0].attrs['aria-expanded'],'false');
assert(state.collapsedPresetGroups.has(ui.presetGroupStateKey('meeting','入园仪式')));
html=ui.renderPresets();
assert(html.includes('aria-expanded="false" aria-controls="preset-group-meeting-0"'));
assert(html.includes('id="preset-group-meeting-0" hidden'));
ui.setAllPresetGroupsCollapsed(false);
assert.equal(panels.get('入园仪式').hidden,false);
assert.equal(panels.get('造梦犬行为').hidden,false);
assert(!state.collapsedPresetGroups.has(ui.presetGroupStateKey('meeting','入园仪式')));
assert(saveCalls.length>=2,'collapse state persists');
const reordered=[state.presets[0],state.presets[2],state.presets[1]];
assert.equal(ui.getPresetGroupRuns(reordered).length,3,'interleaved groups stay in actual injection sequence');
state.presets.push(make('x','<script>','<script> / title',true,6));
html=ui.renderPresets();
assert(html.includes('&lt;script&gt;')&&!html.includes('<script>'),'imported group text must be escaped');
assert(css.includes('.preset-group-body[hidden]{display:none!important}'));
assert(css.includes('grid-template-columns:minmax(0,1fr)'));
assert(css.includes('grid-template-columns:28px minmax(0,1fr) 38px'));
assert(app.includes('id="pe-group"')&&app.includes("group:$('pe-group').value.trim()"),'group name can be edited and saved');
assert(app.includes('previousScroll')&&app.includes("if(previousScroll!==null"),'preserve preset-scroll position');
console.log('Preset grouped renderer, stable order, collapse/expand, escaping, mobile containment and editable group passed.');
