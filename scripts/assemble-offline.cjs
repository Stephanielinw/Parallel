#!/usr/bin/env node
'use strict';

/**
 * M06 · source-only modularization of the browser's single-file runtime.
 *
 * The modules below are ordered source sections. They deliberately share the
 * *same lexical IIFE scope*, so we do not introduce globals, imports, new
 * storage writes, async script races or a new network dependency.
 *
 * The published file and standalone HTML must remain byte-for-byte the same
 * as the original M05 runtime until a separately reviewed behavior change.
 *
 * Usage:
 *   node scripts/assemble-offline.cjs --check  (CI, safe by default)
 *   node scripts/assemble-offline.cjs --write  (explicitly regenerate both mirrors)
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const ROOT=path.resolve(__dirname,'..');
const SOURCE_DIR=path.join(ROOT,'parallel_src/parallel_ai_date/offline_modules');
const MODULE_FILES=Object.freeze([
  '01-engine-bootstrap.js',
  '02-storage-codec.js',
  '03-message-normalization.js',
  '04-persistence-presets.js',
  '05-chat-media-queue.js',
  '06-episodic-memory.js',
  '07-surveillance-diary.js',
  '08-meeting-scenes.js',
  '09-episode-archive-recall.js',
  '10-meeting-checkpoints.js',
  '11-prompt-context.js',
  '12-model-gateway.js',
  '13-discovery-replies.js',
  '14-request-router.js'
]);
const OUTPUTS=Object.freeze([
  path.join(ROOT,'parallel_src/parallel_ai_date/static/offline.js'),
  path.join(ROOT,'public/parallel/offline.js')
]);
const hash=s=>crypto.createHash('sha256').update(s,'utf8').digest('hex');

function assembleOffline(read=filename=>fs.readFileSync(filename,'utf8')){
  const segments=MODULE_FILES.map(filename=>{
    const content=read(path.join(SOURCE_DIR,filename));
    if(typeof content!=='string'||!content.length)
      throw Error('[M06] Empty or missing module: '+filename);
    return content;
  });
  if(!segments[0].startsWith('/* Parallel Portable Edition:')||
     !segments[0].includes("'use strict';\n(() => {"))
    throw Error('[M06] Invalid source preamble');
  if(!segments.at(-1).trimEnd().endsWith('})();'))
    throw Error('[M06] Invalid source closing IIFE');
  if(segments.slice(0,-1).some(s=>!s.endsWith('\n')))
    throw Error('[M06] Source chunks must preserve original line boundaries');
  const compiled=segments.join('');
  // Verify syntax without executing. Running the module is handled by the
  // existing offline VM tests + WebKit release suite.
  new Function(compiled);
  return compiled;
}

function verifyOutputs(compiled,read=filename=>fs.readFileSync(filename,'utf8')){
  const results=[];
  for(const filename of OUTPUTS){
    let actual;
    try{actual=read(filename);}catch{actual=null;}
    results.push({path:path.relative(ROOT,filename),matches:actual===compiled,
      expectedSha256:hash(compiled),actualSha256:typeof actual==='string'?hash(actual):null});
  }
  return results;
}

function run(command='--check'){
  if(!['--check','--write'].includes(command))
    throw Error('Usage: node scripts/assemble-offline.cjs --check | --write');
  const compiled=assembleOffline();
  if(command==='--write'){
    for(const filename of OUTPUTS){
      fs.writeFileSync(filename,compiled,'utf8');
    }
  }
  const results=verifyOutputs(compiled);
  for(const result of results)
    if(!result.matches)
      throw Error('[M06] Generated mirror drift: '+result.path+
        '. Run node scripts/assemble-offline.cjs --write and commit both artifacts.');
  process.stdout.write('[M06] '+MODULE_FILES.length+' source modules; both mirrors identical; sha256 '+
    hash(compiled)+'; '+(command==='--write'?'generated':'verified')+'.\n');
  return {modules:MODULE_FILES.length,sha256:hash(compiled)};
}

if(require.main===module){
  try{run(process.argv[2]||'--check');}
  catch(e){process.stderr.write(String(e?.stack||e)+'\n');process.exitCode=1;}
}

module.exports={ROOT,SOURCE_DIR,MODULE_FILES,OUTPUTS,assembleOffline,verifyOutputs,run};
