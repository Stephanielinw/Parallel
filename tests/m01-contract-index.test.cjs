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

assert.equal(index.version, 'M01-2026-11-22');
assert.equal(index.repository, 'Stephanielinw/Parallel');
assert.equal(index.contractKind, 'documented-current-behavior-and-open-gaps');
assert(Array.isArray(index.contracts) && index.contracts.length >= 18);
assert(doc.includes('**发布约束**'), 'documentation must state that M01 changes no runtime contracts');

const requiredAreas = [
  '身份与隔离', '发现', '聊天', '见面', '记忆',
  '监控', '日记', '存档', '时间', '预设', '运行安全',
  '跨模块', '客户端'
];
const ids = new Set(), areas = new Set();
let covered = 0, gaps = 0, linked = 0;
for (const c of index.contracts) {
  assert(/^C-\d{2}$/.test(c.id), 'stable contract ID required');
  assert(!ids.has(c.id), 'duplicate contract ID '+c.id);
  ids.add(c.id);
  areas.add(c.area);
  for (const field of ['title','expected','forbidden']) {
    assert(typeof c[field] === 'string' && c[field].trim().length >= 8, c.id+' missing '+field);
  }
  assert(Array.isArray(c.scenarios) && c.scenarios.length >= 1, c.id+' needs reproducible scenario(s)');
  assert(c.scenarios.every(x => typeof x==='string' && x.trim().length>=8), c.id+' vague scenario');
  assert(Array.isArray(c.tests), c.id+' must include test file array');
  assert(['covered','gap'].includes(c.status), c.id+' unsupported status');
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
assert(gaps>=3 && covered>=15, 'new gaps may be added; do not silently mark all contracts covered');
for (const id of ['C-11','C-17','C-18']) {
  assert.equal(index.contracts.find(c=>c.id===id).status,'gap',
    'no diary evidence, complete lifecycle or real Safari E2E guarantee yet');
}
// M01 is documentation and safety checks only. No running engine or schema
// is changed; these automated links cannot replace M02 real behavior tests.
console.log('M01 contract index verified: '+index.contracts.length+' contracts ('+covered+
  ' test-linked, '+gaps+' transparently open gaps), '+linked+' CI evidence links.');
