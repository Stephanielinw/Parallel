#!/usr/bin/env node
'use strict';

/**
 * M08: one authoritative browser UI source for each shared asset.
 * Python localhost shell, portable HTML, and Pages intentionally have
 * different bootstraps, but the UI logic and CSS must not fork silently.
 *
 * --check is read-only and is required before any release.
 * --write copies only the three canonical static files to public/parallel.
 */
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const sourceRoot=path.join(root,'parallel_src/parallel_ai_date/static');
const publicRoot=path.join(root,'public/parallel');
const SHARED=Object.freeze(['app.js','style.css','index.html']);
const digest=text=>crypto.createHash('sha256').update(text).digest('hex');

function verifyAssets(read=filename=>fs.readFileSync(filename,'utf8')){
  return SHARED.map(name=>{
    const source=path.join(sourceRoot,name),dest=path.join(publicRoot,name);
    const canonical=read(source),released=read(dest);
    return {name,matches:canonical===released,sourceHash:digest(canonical),publicHash:digest(released)};
  });
}
function run(mode='--check'){
  if(!['--check','--write'].includes(mode))throw Error('Expected --check or --write');
  if(mode==='--write'){
    for(const name of SHARED){
      fs.copyFileSync(path.join(sourceRoot,name),path.join(publicRoot,name));
    }
  }
  const state=verifyAssets();
  const divergent=state.filter(x=>!x.matches);
  if(divergent.length)throw Error('[M08] Shared UI asset drift: '+divergent.map(x=>x.name).join(', ')+'. Change canonical parallel_src/parallel_ai_date/static files and run node scripts/assemble-frontend.cjs --write.');
  process.stdout.write('[M08] '+state.map(x=>x.name+'='+x.sourceHash.slice(0,12)).join(' ')+'; shared assets identical.\n');
  return state;
}
if(require.main===module){
  try{run(process.argv[2]||'--check');}
  catch(error){process.stderr.write(String(error?.stack||error)+'\n');process.exitCode=1;}
}
module.exports={SHARED,sourceRoot,publicRoot,verifyAssets,run};
