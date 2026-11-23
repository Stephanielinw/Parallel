// M03-B isolated proof of concept: NEVER included in production bundles.
// Operates on synthetic exported backup data within Playwright's throwaway
// browser context, without changing ParallelOffline's source of truth.
(function(root){
  'use strict';
  const NAME_RE=/^parallel-m03b-lab-[A-Za-z0-9_-]{1,80}$/;
  const SOURCE_KEY='parallel-portable-v2';
  const SEGMENTS=['profiles','messages','meetings','episodicMemories','chatPhotoFiles'];
  function validName(name){
    if(typeof name!=='string'||!NAME_RE.test(name))throw Error('M03B requires a disposable lab database name');
    return name;
  }
  function requestResult(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(Error('IndexedDB request failed'));
    });
  }
  function openLab(name){
    validName(name);
    if(!root.indexedDB) return Promise.reject(Error('IndexedDB unavailable'));
    return new Promise((resolve,reject)=>{
      const req=root.indexedDB.open(name,1);
      req.onupgradeneeded=()=>{
        const db=req.result;
        if(!db.objectStoreNames.contains('records'))db.createObjectStore('records');
        if(!db.objectStoreNames.contains('control'))db.createObjectStore('control');
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(Error('Cannot open disposable IndexedDB lab'));
      req.onblocked=()=>reject(Error('Disposable IndexedDB lab is blocked'));
    });
  }
  function transactionDone(tx){
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onabort=()=>reject(Error('IndexedDB atomic transaction aborted'));
      tx.onerror=()=>reject(Error('IndexedDB atomic transaction failed'));
    });
  }
  async function sha(value){
    if(!root.crypto||!root.crypto.subtle)throw Error('SHA-256 unavailable');
    const bytes=new TextEncoder().encode(value);
    const buf=await root.crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,'0')).join('');
  }
  function getSource(){
    const raw=root.localStorage.getItem(SOURCE_KEY);
    if(typeof raw!=='string'||!raw)throw Error('Synthetic legacy source is missing');
    if(!raw.startsWith('{')&&!raw.startsWith('PARALLEL-LZW14-V1:'))throw Error('Unrecognized legacy save encoding');
    return raw;
  }
  function parseExport(json){
    if(typeof json!=='string'||!json||json.length>100*1024*1024)throw Error('Invalid M03B backup input size');
    let pack;
    try{pack=JSON.parse(json)}catch{throw Error('M03B source is not JSON');}
    if(pack?.format!=='parallel-portable-backup'||pack.schemaVersion!==1||!pack.data||
      !Array.isArray(pack.data.messages)||!Array.isArray(pack.data.profiles))
      throw Error('M03B unsupported backup schema');
    const credential=pack.data.connection||{};
    if(credential.api_key||credential.image_api_key||credential.archive_api_key)
      throw Error('M03B export contains an API credential');
    return pack;
  }
  function partition(pack){
    // Keep every unknown legacy key in exactly its original object position.
    // Only the five large collections move into individual IDB records.
    const template=JSON.parse(JSON.stringify(pack));
    const segments={};
    for(const key of SEGMENTS){
      const parent=key==='chatPhotoFiles'?pack:pack.data;
      const target=key==='chatPhotoFiles'?template:template.data;
      if(!Object.prototype.hasOwnProperty.call(parent,key))continue;
      if(!Array.isArray(parent[key]))throw Error('M03B collection is malformed: '+key);
      segments[key]=parent[key];
      target[key]=[];
    }
    return {template,segments};
  }
  async function loadLab(name,{requireCurrent=true}={}){
    const db=await openLab(name);
    try{
      const tx=db.transaction(['control','records'],'readonly');
      const done=transactionDone(tx);
      const manifestPromise=requestResult(tx.objectStore('control').get('committed'));
      const recordsPromise=requestResult(tx.objectStore('records').getAll());
      const keysPromise=requestResult(tx.objectStore('records').getAllKeys());
      const [manifest,records,keys]=await Promise.all([manifestPromise,recordsPromise,keysPromise]);
      await done;
      if(!manifest||manifest.version!==1||!manifest.template||!manifest.counts)
        throw Error('No committed M03B snapshot');
      if(keys.length!==records.length)throw Error('M03B record index mismatch');
      const pack=JSON.parse(JSON.stringify(manifest.template));
      const seen=new Set();
      for(let i=0;i<keys.length;i++){
        const key=keys[i],value=records[i];
        if(!Array.isArray(key)||key.length!==2||!SEGMENTS.includes(key[0])||
          !Number.isInteger(key[1])||key[1]<0)throw Error('M03B invalid record key');
        const sig=key[0]+'#'+key[1];
        if(seen.has(sig))throw Error('M03B duplicate record');seen.add(sig);
        const target=key[0]==='chatPhotoFiles'?pack:pack.data;
        if(!Array.isArray(target[key[0]]))throw Error('M03B unexpected record');
        target[key[0]][key[1]]=value;
      }
      for(const [segment,count] of Object.entries(manifest.counts)){
        const parent=segment==='chatPhotoFiles'?pack:pack.data;
        const arr=parent[segment];
        if(!Array.isArray(arr)||arr.length!==count)throw Error('M03B missing collection rows');
        for(let i=0;i<count;i++)if(!seen.has(segment+'#'+i))
          throw Error('M03B missing record '+segment+' '+i);
      }
      const digest=await sha(JSON.stringify(pack));
      if(digest!==manifest.backupSha256)throw Error('M03B snapshot digest mismatch');
      if(requireCurrent&&await sha(getSource())!==manifest.sourceSha256)
        throw Error('M03B staged snapshot is stale compared with active legacy save');
      return {manifest,pack};
    }finally{db.close();}
  }
  async function stage({name,backup,fault=''}){
    validName(name);
    const before=getSource(),sourceSha256=await sha(before);
    const pack=parseExport(backup);
    const canonical=JSON.stringify(pack);
    const backupSha256=await sha(canonical);
    // Refuse a changed source rather than treating a stale backup as current.
    if(await sha(getSource())!==sourceSha256)throw Error('Legacy source changed before staging');
    const {template,segments}=partition(pack);
    const counts={};
    for(const [key,arr] of Object.entries(segments))counts[key]=arr.length;
    const manifest={
      version:1,kind:'staged-backup-only',sourceSha256,backupSha256,
      sourceEncoding:before.startsWith('PARALLEL-LZW14-V1:')?'LZW14':'plain-json',
      counts,template
    };
    const db=await openLab(name);
    try{
      const tx=db.transaction(['control','records'],'readwrite'),done=transactionDone(tx);
      const rows=tx.objectStore('records'),control=tx.objectStore('control');
      rows.clear();
      let written=0;
      for(const [section,arr] of Object.entries(segments)){
        for(let i=0;i<arr.length;i++){
          rows.put(arr[i],[section,i]);
          written++;
          if(fault==='mid-write-abort'&&written>=Math.max(1,Math.floor(pack.data.messages.length/2))){
            tx.abort();await done;throw Error('injected failure');
          }
        }
      }
      control.put(manifest,'committed');
      if(fault==='before-commit-abort'){tx.abort();await done;throw Error('injected failure');}
      await done;
    }finally{db.close();}
    if(fault==='after-commit-interrupt')throw Error('Simulated interrupted test after atomic commit');
    const result=await loadLab(name);
    if(JSON.stringify(result.pack)!==canonical)throw Error('M03B roundtrip changed original data ordering');
    if(getSource()!==before)throw Error('Legacy save changed while copying');
    return {
      verified:true,sourceEncoding:manifest.sourceEncoding,sourceSha256,
      backupSha256,counts,sourceStillAuthoritative:true
    };
  }
  root.M03BShadowLab={stage,loadLab};
})(window);
