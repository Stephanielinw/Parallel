const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const indexPath = 'docs/maintenance/M01-contract-index.json';
const docPath = 'docs/maintenance/M01-functional-contracts.md';
const index = JSON.parse(read(indexPath));
const doc = read(docPath);
const workflow = read('.github/workflows/pages.yml');

assert.equal(index.version, 'M02-2026-11-22');
assert.equal(index.repository, 'Stephanielinw/Parallel');
assert.equal(index.contractKind, 'documented-behavior-regression-with-explicit-device-gap');
assert(Array.isArray(index.contracts) && index.contracts.length >= 18);
assert(doc.includes('**发布约束**'), 'documentation must state that M01 changes no runtime contracts');

const requiredAreas = [
  '身份与隔离', '发现', '聊天', '见面', '记忆',
  '监控', '日记', '存档', '时间', '预设', '运行安全',
  '跨模块', '客户端'
];
const ids = new Set(), areas = new Set();
let covered = 0, partial = 0, gaps = 0, linked = 0;
for (const c of index.contracts) {
  assert(/^C-\d{2}$/.test(c.id), 'stable contract ID required');
  assert(!ids.has(c.id), 'duplicate contract ID '+c.id);
  ids.add(c.id);
  areas.add(c.area);
  for (const field of ['title','expected','forbidden']) {
    assert(typeof c[field] === 'string' && c[field].trim().length >= 8, c.id+' missing '+field);
  }
  assert(Array.isArray(c.scenarios) && c.scenarios.length >= 1, c.id+' needs reproducible scenario(s)');
  assert(c.scenarios.every(x => typeof x==='string' && x.trim().length>=4), c.id+' vague scenario');
  assert(Array.isArray(c.tests), c.id+' must include test file array');
  assert(['covered','partial','gap'].includes(c.status), c.id+' unsupported status');
  assert(doc.includes(c.id), c.id+' missing from human-readable contract table');
  if (c.status === 'covered') {
    covered++;
    assert(c.tests.length > 0, c.id+' cannot claim test coverage without existing tests');
    for (const filename of c.tests) {
      assert(/^tests\/[-\w.]+\.test\.cjs$/.test(filename), c.id+' invalid test path');
      assert(fs.existsSync(path.join(root, filename)), c.id+' missing test '+filename);
      assert(workflow.includes('node '+filename), c.id+' test is NOT running in CI: '+filename);
      linked++;
    }
  } else if(c.status==='partial'){
    partial++;
    assert(c.id==='C-18','only the real-device Safari contract is partially covered');
    assert.deepEqual(c.tests,['e2e/m02-safari-smoke.spec.ts']);
    assert(fs.existsSync(path.join(root,c.tests[0])),'WebKit regression file missing');
    assert(workflow.includes('npx playwright test -c playwright.m02.config.ts'),
      'WebKit test must be an actual GitHub Actions release gate');
    assert(workflow.includes('npx playwright install --with-deps webkit'),
      'WebKit browser binary must actually be installed on CI');
    assert(/物理|iPhone/.test(c.note),'must not claim physical-device testing');
    linked++;
  } else {
    gaps++;
    assert(c.tests.length === 0, c.id+' unresolved contract must not claim test coverage');
    assert(Array.isArray(c.plannedTests) && c.plannedTests.length,
      c.id+' needs an explicit M02 test plan');
    assert(typeof c.note === 'string' && c.note.length>=20,
      c.id+' needs an honest description of what is not verified');
  }
}
for (const area of requiredAreas) assert(areas.has(area),'missing core area '+area);
assert.equal(index.contracts.length, ids.size);
assert(covered>=17 && partial===1 && gaps>=0,
  'do not claim complete device coverage or silently lose contract links');
for(const id of ['C-11','C-17'])
  assert.equal(index.contracts.find(c=>c.id===id).status,'covered',id+' needs checked-in CI regression tests');
assert.equal(index.contracts.find(c=>c.id==='C-18').status,'partial',
  'WebKit automation alone does not prove physical Safari/PWA reliability');
console.log('M02 contract index verified: '+index.contracts.length+' contracts ('+covered+
  ' CI-linked, '+partial+' WebKit-only partial, '+gaps+' open), '+linked+' CI evidence links.');
