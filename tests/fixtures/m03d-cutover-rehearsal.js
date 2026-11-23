// M03-D TEST-ONLY. Never imported by Parallel production or deployed as an asset.
// This demonstrates a reversible read ROUTE in a disposable IDB database,
// not an app storage migration. Legacy localStorage remains authoritative.
(function(root){
  'use strict';
  const CONTROL_RE=/^parallel-m03d-lab-[a-f0-9]{32}$/;
  const SHADOW_RE=/^parallel-m03b-lab-m03c-[a-f0-9]{32}$/;
  const SOURCE_KEY='parallel-portable-v2';
  const baseline=()=>({version:1,revision:0,mode:'legacy',name:null,sourceSha256:null,backupSha256:null});
  function validControl(name){
    if(typeof name!=='string'||!CONTROL_RE.test(name))
      throw Error('M03D disposable control database name required');
    return name;
  }
  function validShadow(name){
    if(typeof name!=='string'||!SHADOW_RE.test(name))
      throw Error('M03D disposable verified shadow generation required');
    return name;
  }
  function newControlName(){
    if(!root.crypto?.getRandomValues)throw Error('M03D secure random unavailable');
    const bytes=root.crypto.getRandomValues(new Uint8Array(16));
    return 'parallel-m03d-lab-'+[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function normalize(state){
    if(state===undefined)return baseline();
    if(!state||state.version!==1||!Number.isSafeInteger(state.revision)||state.revision<1||
      !['legacy','shadow'].includes(state.mode)||
      (state.mode==='legacy'&&state.name!==null)||
      (state.mode==='shadow'&&(!SHADOW_RE.test(state.name||'')||
        !/^[a-f0-9]{64}$/.test(state.sourceSha256||'')||
        !/^[a-f0-9]{64}$/.test(state.backupSha256||''))))
      throw Error('M03D control record malformed; fail closed');
    return state;
  }
  function openControl(name){
    validControl(name);
    if(!root.indexedDB) return Promise.reject(Error('M03D IndexedDB unavailable'));
    return new Promise((resolve,reject)=>{
      const req=root.indexedDB.open(name,1);
      req.onupgradeneeded=()=>{
        if(!req.result.objectStoreNames.contains('routes'))
          req.result.createObjectStore('routes');
      };
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(Error('M03D control database unavailable'));
      req.onblocked=()=>reject(Error('M03D control database blocked'));
    });
  }
  async function readState(controlName){
    const db=await openControl(controlName);
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('routes','readonly');
        const req=tx.objectStore('routes').get('active');
        let state;
        req.onsuccess=()=>{
          try{state=normalize(req.result);}catch(e){reject(e);}
        };
        tx.oncomplete=()=>resolve(state);
        tx.onabort=tx.onerror=()=>reject(Error('M03D control read failed'));
      });
    }finally{db.close();}
  }
  // IndexedDB readwrite transactions serialize for the same object store.
  // Expected revision is tested *inside* that transaction, not before it.
  async function compareAndSwap(controlName,expectedRevision,transition){
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)
      throw Error('M03D expected revision invalid');
    const db=await openControl(controlName);
    try{
      return await new Promise((resolve,reject)=>{
        const tx=db.transaction('routes','readwrite');
        const store=tx.objectStore('routes');
        let state,failure;
        const request=store.get('active');
        request.onsuccess=()=>{
          try{
            const previous=normalize(request.result);
            if(previous.revision!==expectedRevision)
              throw Error('M03D revision conflict');
            state=transition(previous);
            if(state.version!==1||state.revision!==previous.revision+1)
              throw Error('M03D invalid state transition');
            normalize(state);
            store.put(state,'active');
          }catch(e){
            failure=e;
            try{tx.abort();}catch{}
          }
        };
        tx.oncomplete=()=>resolve(state);
        tx.onabort=tx.onerror=()=>reject(failure||Error('M03D route transaction aborted'));
      });
    }finally{db.close();}
  }
  async function sha(value){
    if(!root.crypto?.subtle)throw Error('M03D SHA-256 unavailable');
    const digest=await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function checkLegacySource(){
    const raw=root.localStorage?.getItem(SOURCE_KEY);
    if(typeof raw!=='string'||!raw)throw Error('M03D legacy source missing');
    return raw;
  }
  async function stageCandidate({name,sourceSha256,backup,fault=''}){
    validShadow(name);
    if(typeof backup!=='string'||!sourceSha256)
      throw Error('M03D source token and full backup required');
    const proof=await root.M03CShadowProbe.stage({name,sourceSha256,backup,fault});
    const loaded=await root.M03BShadowLab.loadLab(name);
    if(!proof.verified||loaded.manifest.backupSha256!==await sha(JSON.stringify(JSON.parse(backup))))
      throw Error('M03D failed to prove candidate integrity');
    return {name,sourceSha256,backupSha256:loaded.manifest.backupSha256,
      photoCount:proof.photoCount,verified:true};
  }
  async function verifyCandidate(candidate){
    validShadow(candidate?.name);
    if(!/^[a-f0-9]{64}$/.test(candidate?.sourceSha256||'')||
       !/^[a-f0-9]{64}$/.test(candidate?.backupSha256||''))
      throw Error('M03D invalid verification token');
    if(await sha(checkLegacySource())!==candidate.sourceSha256)
      throw Error('M03D legacy source changed');
    const loaded=await root.M03BShadowLab.loadLab(candidate.name);
    if(loaded.manifest.sourceSha256!==candidate.sourceSha256||
       loaded.manifest.backupSha256!==candidate.backupSha256)
      throw Error('M03D shadow manifest mismatched');
    await root.M03CShadowProbe.verify({
      name:candidate.name,
      sourceSha256:candidate.sourceSha256,
      backup:JSON.stringify(loaded.pack)
    });
    if(await sha(checkLegacySource())!==candidate.sourceSha256)
      throw Error('M03D legacy source changed during verification');
    return loaded.pack;
  }
  // A shadow "switch" changes only the TEST lab's read route. The live app
  // does not consult this pointer and continues writing localStorage.
  async function switchToShadow({controlName,expectedRevision,candidate,fault=''}){
    validControl(controlName);
    await verifyCandidate(candidate);
    const next=await compareAndSwap(controlName,expectedRevision,prev=>{
      if(prev.mode!=='legacy')throw Error('M03D route must be legacy before switch');
      return {version:1,revision:prev.revision+1,mode:'shadow',
        name:candidate.name,sourceSha256:candidate.sourceSha256,
        backupSha256:candidate.backupSha256};
    });
    if(fault==='after-pointer-commit')
      throw Error('M03D simulated lost acknowledgement after route commit');
    // A concurrent change of localStorage or source photos after the CAS
    // cannot be atomically fenced across databases. Re-read fails closed.
    await verifyCandidate(candidate);
    return next;
  }
  async function readPreview(controlName){
    const state=await readState(controlName);
    if(state.mode==='legacy'){
      // A legacy preview is not a photo-complete backup; it only checks that
      // the synthetic tab engine still matches its actual legacy save.
      const capture=await root.M03CShadowProbe.capture();
      return {state,origin:'legacy',data:JSON.parse(capture.backup).data};
    }
    const pack=await verifyCandidate({
      name:state.name,sourceSha256:state.sourceSha256,
      backupSha256:state.backupSha256
    });
    // State can change while verification is awaiting IDB. Never present a
    // superseded snapshot as the currently selected generation.
    const latest=await readState(controlName);
    if(latest.revision!==state.revision||latest.mode!=='shadow')
      throw Error('M03D route changed during read');
    return {state,origin:'shadow',data:pack.data,photos:pack.chatPhotoFiles||[]};
  }
  async function rollback({controlName,expectedRevision}){
    validControl(controlName);
    // Rollback never reads the suspect shadow and never touches original data.
    const source=checkLegacySource();
    const state=await compareAndSwap(controlName,expectedRevision,prev=>{
      if(prev.mode!=='shadow')throw Error('M03D route is not shadow');
      return {version:1,revision:prev.revision+1,mode:'legacy',
        name:null,sourceSha256:null,backupSha256:null};
    });
    if(checkLegacySource()!==source)
      throw Error('M03D legacy source changed during rollback; reload before using');
    return state;
  }
  root.M03DCutoverRehearsal={
    newControlName,readState,readPreview,stageCandidate,verifyCandidate,
    switchToShadow,rollback
  };
})(window);
