const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const {SHARED,sourceRoot,publicRoot,verifyAssets}=require('../scripts/assemble-frontend.cjs');
const {assembleOffline,verifyOutputs}=require('../scripts/assemble-offline.cjs');

assert.deepEqual([...SHARED].sort(),['app.js','index.html','style.css'].sort());
assert(verifyAssets().every(x=>x.matches),'All published shared UI files must match the canonical source');
for(const name of SHARED){
  const source=fs.readFileSync(path.join(sourceRoot,name),'utf8');
  const destination=path.join(publicRoot,name);
  const modified=verifyAssets(file=>file===destination?source+'\\n// synthetic M08 stale mirror':fs.readFileSync(file,'utf8'));
  assert(modified.some(x=>x.name===name&&!x.matches),'M08 must detect divergence in '+name);
}
assert(verifyOutputs(assembleOffline()).every(x=>x.matches),'M06 engine source mirrors remain identical');
const staticApp=read('parallel_src/parallel_ai_date/static/app.js');
const publicApp=read('public/parallel/app.js');
assert.equal(staticApp,publicApp,'Python, downloaded HTML and Pages must use exactly one UI logic version');
assert(staticApp.includes('data-action="save-meeting-summary"'),'Manual meeting editor remains present in all browsers');
const pythonShell=read('parallel_src/parallel_ai_date/static/index.html');
const publicShell=read('public/parallel/index.html');
const reactShell=read('src/App.tsx');
for(const id of ['app','view','modal-root','side-nav','mobile-nav','toast','topbar-actions','section-title']){
  assert(pythonShell.includes('id="'+id+'"'),'Python shell missing '+id);
  assert(reactShell.includes('id="'+id+'"'),'Pages shell missing '+id);
}
assert(pythonShell.includes('<script src="/app.js" defer></script>'),'Legacy Python shell uses the same app.js, served locally');
assert(reactShell.includes('parallel/offline.js?v='),'Pages loads local portable engine explicitly');
assert(reactShell.includes('parallel/app.js?v='),'Pages loads the canonical app UI explicitly');
const standalone=read('parallel_src/parallel_ai_date/build_portable.cjs');
for(const file of ['offline.js','app.js','style.css','index.html']){
  assert(standalone.includes("'"+file+"'"),'Portable distribution must embed canonical '+file);
}

// Route names are compared, not semantic equivalence. Python SQLite and browser
// storage are deliberately distinct and must never be silently interchanged.
const routeRegexJS=/case '[/]([^']+)':/g;
const routeRegexPY=/if route=='[/]api[/]([^']+)'/g;
const browserRoutes=new Set([...read('parallel_src/parallel_ai_date/offline_modules/14-request-router.js').matchAll(routeRegexJS)].map(x=>x[1]));
const pythonRoutes=new Set([...read('parallel_src/parallel_ai_date/server.py').matchAll(routeRegexPY)].map(x=>x[1]));
const browserOnly=['chat-photo-read','chat-photos','discover-progress','discover-session','episode-archive-tick'];
assert.deepEqual([...browserRoutes].filter(x=>!pythonRoutes.has(x)).sort(),browserOnly,'unexpected browser-only route: investigate feature drift');
assert.deepEqual([...pythonRoutes].filter(x=>!browserRoutes.has(x)).sort(),[],'unexpected Python-only route: investigate fork');
for(const route of ['meeting-summary-save','meeting-summary-refresh','message-forget','meeting-forget','mode','thread','memories'])
  assert(browserRoutes.has(route)&&pythonRoutes.has(route),'critical route missing in one runtime: '+route);
const py=read('parallel_src/parallel_ai_date/server.py');
assert(py.includes('def save_meeting_summary_request('),'Python must support no-LLM manual recap saves');
assert(py.includes('summary_edited_at'),'Python must protect manual text from automatic refresh/rebuild');
assert(py.includes("if route=='/api/meeting-summary-save':"),'Python HTTP write route must exist');
const workflow=read('.github/workflows/pages.yml');
assert(workflow.includes('node tests/m08-version-parity.test.cjs'),'M08 parity test must gate pull requests and Pages deployment');
const pkg=JSON.parse(read('package.json'));
assert(pkg.scripts['build:downloads'].includes('assemble-frontend.cjs --check'),
  'Build must refuse stale frontend mirrors (all three assets)');
console.log('M08: canonical UI JS/CSS/index, source/mirror drift rejection, Pages/portable/Python shell contract, explicit runtime-route exceptions passed.');
