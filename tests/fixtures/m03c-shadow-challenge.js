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
  // Mirror the live engine's LZW14 *reader* so a stale tab cannot take a
  // freshly observed localStorage hash and pair it with its old in-memory DB.
  // This decoder is test-only and never writes the legacy key.
  function decodeSource(raw){
    const prefix='PARALLEL-LZW14-V1:';
    if(!raw.startsWith(prefix))return raw;
    const dictionary=new Array(16384);
    let next=257,previous='',buffer=new Uint8Array(Math.max(8192,Math.min(32*1024*1024,raw.length*3))),used=0;
    const append=entry=>{
      if(used+entry.length>100*1024*1024)throw Error('M03C source decode limit exceeded');
      if(used+entry.length>buffer.length){
        let size=buffer.length;
        while(size<used+entry.length)size*=2;
        const grown=new Uint8Array(size);grown.set(buffer);buffer=grown;
      }
      for(let i=0;i<entry.length;i++)buffer[used++]=entry.charCodeAt(i);
    };
    for(let i=prefix.length;i<raw.length;i++){
      const code=raw.charCodeAt(i)-32;
      if(code===256){dictionary.fill(undefined);next=257;previous='';continue;}
      if(code<0||code>=16384)throw Error('M03C invalid compressed source code');
      const entry=code<256?String.fromCharCode(code):
        (dictionary[code]||(code===next&&previous?previous+previous[0]:null));
      if(!entry)throw Error('M03C corrupt compressed source');
      append(entry);
      if(previous&&next<16384)dictionary[next++]=previous+entry[0];
      previous=entry;
    }
    return new TextDecoder('utf-8',{fatal:true}).decode(buffer.subarray(0,used));
  }
  function verifiedEngineExport(raw){
    if(!root.ParallelOffline||root.ParallelOffline.storageAvailable!==true||
       typeof root.ParallelOffline.exportData!=='function')
      throw Error('M03C synthetic export engine unavailable');
    let live;
    try{live=JSON.parse(decodeSource(raw));}catch{throw Error('M03C source cannot be decoded');}
    const candidate=JSON.parse(root.ParallelOffline.exportData());
    const scrubbed=JSON.parse(JSON.stringify(live));
    if(!scrubbed.connection||typeof scrubbed.connection!=='object')
      throw Error('M03C source connection missing');
    for(const key of ['api_key','image_api_key','archive_api_key'])scrubbed.connection[key]='';
    delete scrubbed.systemLogs;
    if(JSON.stringify(scrubbed)!==JSON.stringify(candidate.data))
      throw Error('M03C in-memory engine differs from live source');
    return JSON.stringify(candidate);
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
    const raw=currentRaw(),backup=verifiedEngineExport(raw);
    const sourceSha256=await sha(raw);
    if(currentRaw()!==raw)throw Error('M03C source changed during capture');
    return {sourceSha256,backup};
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
    verifiedEngineExport(currentRaw());
    await verifyPhotoSource(backup);
    if(await sha(currentRaw())!==sourceSha256)throw Error('M03C source changed during photo preflight');
    // Each attempt MUST use a separate random DB name. Neither this probe nor
    // its consumer writes an active-snapshot pointer or production metadata.
    await root.M03BShadowLab.stage({name,backup,fault});
    return verify({name,sourceSha256,backup});
  }
  root.M03CShadowProbe={newName,capture,stage,verify,verifyPhotoSource};
})(window);
