const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {OUT,RELEASE_ASSETS,releaseId,releaseManifest,run}=require('../scripts/m09-release-manifest.cjs');
const filename=path.join(OUT,'parallel/release-manifest.json');
const actual=JSON.parse(fs.readFileSync(filename,'utf8'));
assert.deepEqual(actual,run('--check'),'Published release inventory must exactly match the built payload');
assert.deepEqual(actual,releaseManifest());
assert.equal(actual.releaseId,releaseId(),'The cache key and release ID must come from actual current source bytes');
assert.equal(new Set(actual.assets.map(x=>x.path)).size,RELEASE_ASSETS.length);
assert(actual.assets.every(x=>/^[a-f0-9]{64}$/.test(x.sha256)&&x.bytes>0));
assert(actual.assets.every(x=>!x.path.includes('private')&&!x.path.includes('secret')));
assert(!JSON.stringify(actual).includes('api_key'));
assert(!JSON.stringify(actual).includes('M09_FAKE_PRIVATE_TEXT'));
assert.equal(actual.format,'parallel-release-manifest');
assert.equal(actual.schemaVersion,1);
// Changing any release artifact bytes without rewriting its manifest must be detected.
const target=path.join(OUT,'parallel/app.js');
const altered=releaseManifest(file=>file===target
  ?Buffer.concat([fs.readFileSync(file),Buffer.from('// synthetic drift')])
  :fs.readFileSync(file));
assert.notDeepEqual(altered,actual,'M09 must reject a shipped JS file changed after release attestation');
assert.notEqual(altered.assets.find(x=>x.path==='parallel/app.js').sha256,
                actual.assets.find(x=>x.path==='parallel/app.js').sha256);
const canonical=path.join(__dirname,'../public/parallel/offline.js');
const different=releaseId(file=>file===canonical
  ?Buffer.concat([fs.readFileSync(file),Buffer.from('// changed engine')])
  :fs.readFileSync(file));
assert.notEqual(different,actual.releaseId,'M09 must rotate the browser cache key for a new engine');
const initial=fs.readFileSync(filename,'utf8');
run('--write');
assert.equal(fs.readFileSync(filename,'utf8'),initial,'Repeated builds must create identical metadata without timestamps');
const webkit=fs.readFileSync(path.join(__dirname,'../.github/workflows/pages.yml'),'utf8');
assert(webkit.includes('node tests/m09-release-integrity.test.cjs'),'Release provenance tests must gate Pages deployment');
console.log('M09: release fingerprints, deterministic manifest, static asset cache bust, tamper rejection passed.');
