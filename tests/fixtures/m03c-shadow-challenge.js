// M03-C test-only probe. Injected into disposable Playwright WebKit contexts.
// Never imported by production app; never promotes a shadow snapshot.
(function(root){
  'use strict';
  const SOURCE_KEY='parallel-portable-v2';
  const NAME_RE=/^parallel-m03b-lab-m03c-[a-f0-9]{32}$/;
  function currentRaw(){
    const raw=root.localStorage?.getItem(SOURCE_KEY);
    if(typeof raw!=='string'||!raw)throw Error('M03C legacy source unavailable');
    return raw;
  }
  async function sha(raw){
    if(!root.crypto?.subtle)throw Error('M03C SHA-256 unavailable');
    const sum=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw));
    return [...new Uint8Array(sum)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function newName(){
    if(!root.crypto?.getRandomValues)throw Error('M03C secure random unavailable');
    const bytes=root.crypto.getRandomValues(new Uint8Array(16));
    return 'parallel-m03b-lab-m03c-'+[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function requireName(name){
    if(typeof name!=='string'||!NAME_RE.test(name))
      throw Error('M03C requires a fresh disposable generation name');
  }
  function parsePhotos(backup){
    let pack;
    try{pack=JSON.parse(backup);}catch{throw Error('M03C malformed export');}
    if(!Array.isArray(pack?.data?.messages))throw Error('M03C missing messages');
    const refs=new Set();
    for(const msg of pack.data.messages){
      if(msg?.photo_kind==='gallery'&&!msg.recalled&&msg.engine!=='recalled'){
        if(typeof msg.photo_ref!=='string'||!msg.photo_ref)
          throw Error('M03C gallery reference missing');
        refs.add(msg.photo_ref);
      }
    }
    if(!refs.size)return new Map();
    if(!Array.isArray(pack.chatPhotoFiles))throw Error('M03C full photo backup required');
    const files=new Map();
    for(const row of pack.chatPhotoFiles){
      if(!row||typeof row.ref!=='string'||!row.ref||
         typeof row.data!=='string'||files.has(row.ref))
        throw Error('M03C malformed or duplicate photo');
      files.set(row.ref,row.data);
    }
    if([...refs].some(ref=>!files.has(ref)))throw Error('M03C missing photo bundle item');
    return new Map([...refs].map(ref=>[ref,files.get(ref)]));
  }
  function openExistingPhotoDb(){
    if(!root.indexedDB) return Promise.reject(Error('M03C IndexedDB unavailable'));
    return new Promise((resolve,reject)=>{
      let upgraded=false;
      const req=root.indexedDB.open('parallel-chat-photos-v1',1);
      // Never initialize or alter a missing source DB during a read-only preflight.
      req.onupgradeneeded=()=>{upgraded=true;req.transaction.abort();};
      req.onsuccess=()=>{
        const db=req.result;
        if(upgraded||!db.objectStoreNames.contains('photos')){
          db.close();reject(Error('M03C source photo database missing'));return;
        }
        resolve(db);
      };
      req.onerror=()=>reject(Error('M03C source photo database unavailable'));
      req.onblocked=()=>reject(Error('M03C source photo database blocked'));
    });
  }
  async function verifyPhotoSource(backup){
    const files=parsePhotos(backup);
    if(!files.size)return 0;
    const db=await openExistingPhotoDb();
    try{
      const tx=db.transaction('photos','readonly');
      const store=tx.objectStore('photos');
      const done=new Promise((resolve,reject)=>{
        tx.oncomplete=()=>resolve();
        tx.onerror=tx.onabort=()=>reject(Error('M03C source photo read failed'));
      });
      const reads=[...files].map(([ref,expected])=>new Promise((resolve,reject)=>{
        const req=store.get(ref);
        req.onsuccess=()=>req.result===expected
          ?resolve():reject(Error('M03C source photo missing or changed: '+ref));
        req.onerror=()=>reject(Error('M03C source photo read failed'));
      }));
      await Promise.all(reads);
      await done;
      return files.size;
    }finally{db.close();}
  }
  async function capture(){
    if(!root.ParallelOffline||typeof root.ParallelOffline.exportData!=='function')
      throw Error('M03C synthetic export engine missing');
    const sourceSha256=await sha(currentRaw());
    return {sourceSha256,backup:root.ParallelOffline.exportData()};
  }
  async function verify({name,sourceSha256,backup}){
    requireName(name);
    if(await sha(currentRaw())!==sourceSha256)throw Error('M03C stale source token');
    const candidate=await root.M03BShadowLab.loadLab(name);
    if(JSON.stringify(candidate.pack)!==JSON.stringify(JSON.parse(backup)))
      throw Error('M03C candidate differs from requested snapshot');
    const photos=await verifyPhotoSource(backup);
    if(await sha(currentRaw())!==sourceSha256)throw Error('M03C source changed during verification');
    return {name,verified:true,photoCount:photos,sourceStillAuthoritative:true};
  }
  async function stage({name,sourceSha256,backup,fault=''}){
    requireName(name);
    if(typeof backup!=='string'||!sourceSha256)throw Error('M03C missing captured snapshot');
    if(!root.M03BShadowLab)throw Error('M03C isolated M03-B lab unavailable');
    if(await sha(currentRaw())!==sourceSha256)throw Error('M03C stale source token');
    await verifyPhotoSource(backup);
    if(await sha(currentRaw())!==sourceSha256)throw Error('M03C source changed during photo preflight');
    // Each attempt MUST use a separate random DB name. Neither this probe nor
    // its consumer writes an active-snapshot pointer or production metadata.
    await root.M03BShadowLab.stage({name,backup,fault});
    return verify({name,sourceSha256,backup});
  }
  root.M03CShadowProbe={newName,capture,stage,verify,verifyPhotoSource};
})(window);
