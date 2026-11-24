#!/usr/bin/env node
'use strict';
/**
 * M09 release provenance: content-addressed, no user state and no credentials.
 * The manifest is an output of the build, NOT a source file or a cloud backup.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const ROOT=path.resolve(__dirname,'..');
const OUT=path.join(ROOT,'dist');
const PUBLIC=path.join(ROOT,'public/parallel');
const MANIFEST='parallel/release-manifest.json';
const SCRIPT_ASSETS=Object.freeze(['offline.js','app.js','style.css']);
const RELEASE_ASSETS=Object.freeze([
  'index.html','parallel/index.html',
  'parallel/offline.js','parallel/app.js','parallel/style.css',
  'Parallel_v0.5_直接打开.html',
  'Parallel_v0.5_HTML与源码_修复版.zip'
]);
const hash=buf=>crypto.createHash('sha256').update(buf).digest('hex');
function releaseId(read=fs.readFileSync){
  const h=crypto.createHash('sha256');
  for(const name of SCRIPT_ASSETS){
    h.update(name+':');
    h.update(read(path.join(PUBLIC,name)));
    h.update('\n');
  }
  return h.digest('hex').slice(0,16);
}
function releaseManifest(read=fs.readFileSync){
  const entries=RELEASE_ASSETS.map(file=>{
    const bytes=read(path.join(OUT,file));
    return {path:file,sha256:hash(bytes),bytes:bytes.length};
  });
  return {format:'parallel-release-manifest',schemaVersion:1,releaseId:releaseId(read),assets:entries};
}
function run(mode='--check'){
  if(!['--check','--write'].includes(mode))throw Error('Use --check or --write');
  const expected=releaseManifest();
  const filename=path.join(OUT,MANIFEST);
  if(mode==='--write'){
    fs.mkdirSync(path.dirname(filename),{recursive:true});
    fs.writeFileSync(filename,JSON.stringify(expected,null,2)+'\n');
  }
  const actual=JSON.parse(fs.readFileSync(filename,'utf8'));
  if(JSON.stringify(actual)!==JSON.stringify(expected))
    throw Error('[M09] Published release manifest is stale or artifacts have changed');
  const html=fs.readFileSync(path.join(OUT,'index.html'),'utf8');
  if(!html.includes('/parallel/style.css?v='+expected.releaseId)&&
     !html.includes('/Parallel/parallel/style.css?v='+expected.releaseId))
    throw Error('[M09] Pages CSS cache key does not match build content');
  const bundleDir=path.join(OUT,'assets');
  const jsFiles=fs.readdirSync(bundleDir).filter(name=>name.endsWith('.js'));
  if(!jsFiles.some(name=>fs.readFileSync(path.join(bundleDir,name),'utf8').includes('parallel/offline.js?v='+expected.releaseId)))
    throw Error('[M09] Browser JS cache key is not current release ID');
  if(!jsFiles.some(name=>fs.readFileSync(path.join(bundleDir,name),'utf8').includes('parallel/app.js?v='+expected.releaseId)))
    throw Error('[M09] Browser UI cache key is not current release ID');
  if(mode==='--check')process.stdout.write('[M09] Release '+expected.releaseId+'; '+expected.assets.length+' artifact hashes verified.\n');
  return expected;
}
if(require.main===module){
  try{run(process.argv[2]||'--check')}
  catch(e){console.error(String(e?.stack||e));process.exitCode=1}
}
module.exports={ROOT,OUT,RELEASE_ASSETS,SCRIPT_ASSETS,releaseId,releaseManifest,run};
