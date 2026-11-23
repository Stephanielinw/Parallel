// Parallel M04: inactive, reusable incremental IndexedDB store candidate.
//
// SAFETY GATE: Only disposable parallel-m04-lab-* databases are accepted.
// This file is NOT imported by the live app and never reads/writes localStorage
// or the separately owned parallel-chat-photos-v1 database. Do not loosen
// the name gate or enable live read/write without the M03 backup prerequisites.
(function(root){
  'use strict';
  const SCHEMA=1;
  const NAME_RE=/^parallel-m04-lab-[a-f0-9]{32}$/;
  const SHA_RE=/^[a-f0-9]{64}$/;
  const SEGMENTS=Object.freeze([
    'profiles','messages','meetings','meetingCheckpoints',
    'episodicMemories','events','presets'
  ]);
  const SEGMENT_SET=new Set(SEGMENTS);
  const serial=value=>{
    const result=JSON.stringify(value);
    if(typeof result!=='string')throw Error('M04 requires JSON-serializable values');
    return result;
  };
  const copy=value=>JSON.parse(serial(value));
  async function sha(text){
    if(!root.crypto?.subtle)throw Error('M04 SHA-256 unavailable');
    const bytes=new TextEncoder().encode(text);
    const digest=await root.crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  // Synchronous accidental-corruption guard; not a cryptographic signature.
  function orderHash(ids){
    const str=JSON.stringify(ids);
    let h=2166136261;
    for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619)>>>0;
    return h.toString(16).padStart(8,'0');
  }
  function validName(name){
    if(typeof name!=='string'||!NAME_RE.test(name))
      throw Error('M04 requires disposable random lab database name');
    return name;
  }
  function validId(id){
    if(typeof id!=='string'||!id||id.length>500)
      throw Error('M04 requires stable nonempty string record IDs');
    return id;
  }
  function validSection(section){
    if(!SEGMENT_SET.has(section))throw Error('M04 unsupported record collection');
    return section;
  }
  function newName(){
    if(!root.crypto?.getRandomValues)throw Error('M04 secure random unavailable');
    const bytes=root.crypto.getRandomValues(new Uint8Array(16));
    return 'parallel-m04-lab-'+[...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function open(name,create=false){
    validName(name);
    if(!root.indexedDB)return Promise.reject(Error('M04 IndexedDB unavailable'));
    return new Promise((resolve,reject)=>{
      let created=false;
      const req=root.indexedDB.open(name,SCHEMA);
      req.onupgradeneeded=()=>{
        created=true;
        if(!create){req.transaction.abort();return;}
        const db=req.result;
        for(const store of ['meta','root','records','orders'])
          if(!db.objectStoreNames.contains(store))db.createObjectStore(store);
      };
      req.onsuccess=()=>{
        const db=req.result;
        if(created&&!create){db.close();reject(Error('M04 lab not initialized'));return;}
        if(['meta','root','records','orders'].some(s=>!db.objectStoreNames.contains(s))){
          db.close();reject(Error('M04 database schema invalid'));return;
        }
        resolve(db);
      };
      req.onerror=()=>reject(Error(create?'M04 IndexedDB initialization failed':'M04 database missing or unavailable'));
      req.onblocked=()=>reject(Error('M04 database open blocked'));
    });
  }
  function txResult(req){
    return new Promise((resolve,reject)=>{
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error||Error('M04 IndexedDB read failed'));
    });
  }
  function txCompleted(tx){
    return new Promise((resolve,reject)=>{
      tx.oncomplete=()=>resolve();
      tx.onerror=tx.onabort=()=>reject(tx.error||Error('M04 IndexedDB transaction aborted'));
    });
  }
  function checkedHead(head){
    if(!head||head.schemaVersion!==SCHEMA||!Number.isSafeInteger(head.revision)||
      head.revision<1||!Array.isArray(head.fields)||!Array.isArray(head.sections)||
      !head.counts||typeof head.counts!=='object'||!SHA_RE.test(head.sourceSha256||''))
      throw Error('M04 missing or malformed committed head');
    const fieldSet=new Set(head.fields);
    if(fieldSet.size!==head.fields.length||head.fields.some(x=>typeof x!=='string'||!x))
      throw Error('M04 invalid field list');
    if(new Set(head.sections).size!==head.sections.length||
       head.sections.some(x=>!SEGMENT_SET.has(x)||!fieldSet.has(x)))
      throw Error('M04 invalid section list');
    return head;
  }
  function validateSnapshot(snapshot){
    if(!snapshot||typeof snapshot!=='object'||Array.isArray(snapshot))
      throw Error('M04 snapshot must be an object');
    const data=copy(snapshot);
    if(!Array.isArray(data.profiles)||!Array.isArray(data.messages)||
       !data.connection||typeof data.connection!=='object')
      throw Error('M04 snapshot missing required legacy fields');
    const fields=Object.keys(data),sections=fields.filter(x=>SEGMENT_SET.has(x));
    const orders={},roots={},records=[],counts={};
    for(const field of fields){
      if(!SEGMENT_SET.has(field)){roots[field]=data[field];continue;}
      if(!Array.isArray(data[field]))throw Error('M04 collection is not an array: '+field);
      const ids=[],seen=new Set();
      for(const value of data[field]){
        if(!value||typeof value!=='object'||Array.isArray(value))
          throw Error('M04 malformed record in '+field);
        const id=validId(value.id);
        if(seen.has(id))throw Error('M04 duplicate record ID in '+field);
        seen.add(id);ids.push(id);records.push({collection:field,id,value});
      }
      orders[field]=ids;counts[field]=ids.length;
    }
    return {data,fields,sections,orders,roots,records,counts};
  }
  function prepareChanges(changes){
    if(!Array.isArray(changes)||changes.length===0||changes.length>3000)
      throw Error('M04 requires 1-3000 incremental changes');
    const seen=new Set();
    return changes.map(change=>{
      if(!change||typeof change!=='object')throw Error('M04 invalid change');
      if(change.op==='set-root'){
        if(typeof change.key!=='string'||!change.key||SEGMENT_SET.has(change.key))
          throw Error('M04 root key invalid');
        const token='root:'+change.key;
        if(seen.has(token))throw Error('M04 repeated root change');
        seen.add(token);
        return {op:'set-root',key:change.key,value:copy(change.value)};
      }
      if(change.op!=='put'&&change.op!=='delete')throw Error('M04 unknown change operation');
      const collection=validSection(change.collection);
      const id=validId(change.op==='put'?change.record?.id:change.id);
      const token=collection+':'+id;
      if(seen.has(token))throw Error('M04 repeated record change');
      seen.add(token);
      return change.op==='put'
        ?{op:'put',collection,id,record:copy(change.record)}
        :{op:'delete',collection,id};
    });
  }
  function storeFor(name){
    validName(name);
    async function initialize({snapshot,sourceSha256,fault=''}){
      if(!SHA_RE.test(sourceSha256||''))throw Error('M04 source fingerprint required');
      const prepared=validateSnapshot(snapshot);
      const rootWrites=await Promise.all(Object.entries(prepared.roots).map(async ([key,value])=>
        ({key,row:{value,sha256:await sha(serial(value))}})));
      const rowWrites=await Promise.all(prepared.records.map(async rec=>({
        collection:rec.collection,id:rec.id,row:{
          value:rec.value,sha256:await sha(serial(rec.value))
        }
      })));
      const head={schemaVersion:SCHEMA,revision:1,
        sourceSha256,initialSnapshotSha256:await sha(serial(prepared.data)),
        fields:prepared.fields,sections:prepared.sections,
        counts:prepared.counts};
      const db=await open(name,true);
      let failure=null;
      try{
        await new Promise((resolve,reject)=>{
          const tx=db.transaction(['meta','root','records','orders'],'readwrite');
          tx.oncomplete=()=>resolve();
          tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('M04 initialization aborted'));
          const req=tx.objectStore('meta').get('head');
          req.onsuccess=()=>{
            try{
              if(req.result)throw Error('M04 database already initialized; refusing overwrite');
              const roots=tx.objectStore('root'),records=tx.objectStore('records'),
                orders=tx.objectStore('orders');
              for(const item of rootWrites)roots.put(item.row,item.key);
              for(const item of rowWrites)records.put(item.row,[item.collection,item.id]);
              for(const [section,ids] of Object.entries(prepared.orders))
                orders.put({ids,hash:orderHash(ids)},section);
              tx.objectStore('meta').put(head,'head');
              if(fault==='quota-abort'){
                failure=Object.assign(Error('M04 simulated quota abort'),{name:'QuotaExceededError'});
                tx.abort();
              }
            }catch(e){failure=e;try{tx.abort();}catch{}}
          };
        });
      }finally{db.close();}
      if(fault==='after-commit-interrupt')
        throw Error('M04 simulated lost acknowledgement after initial commit');
      return {revision:1,recordsWritten:rowWrites.length,
        rootKeysWritten:rootWrites.length,sourceSha256};
    }

    async function readHead(){
      const db=await open(name);
      try{
        const tx=db.transaction('meta','readonly'),done=txCompleted(tx);
        const head=await txResult(tx.objectStore('meta').get('head'));
        await done;
        return copy(checkedHead(head));
      }finally{db.close();}
    }

    async function load(){
      const db=await open(name);
      let head,rootKeys,rootRows,recordKeys,recordRows,orderKeys,orderRows;
      try{
        const tx=db.transaction(['meta','root','records','orders'],'readonly'),done=txCompleted(tx);
        [head,rootKeys,rootRows,recordKeys,recordRows,orderKeys,orderRows]=await Promise.all([
          txResult(tx.objectStore('meta').get('head')),
          txResult(tx.objectStore('root').getAllKeys()),
          txResult(tx.objectStore('root').getAll()),
          txResult(tx.objectStore('records').getAllKeys()),
          txResult(tx.objectStore('records').getAll()),
          txResult(tx.objectStore('orders').getAllKeys()),
          txResult(tx.objectStore('orders').getAll())
        ]);
        await done;
      }finally{db.close();}
      checkedHead(head);
      const sections=new Set(head.sections),fields=new Set(head.fields);
      const wantedRoots=new Set(head.fields.filter(x=>!sections.has(x)));
      if(rootKeys.length!==wantedRoots.size||recordKeys.length!==recordRows.length||
         orderKeys.length!==sections.size)
        throw Error('M04 collection manifest mismatch');
      const roots=new Map(),records=new Map(),orders=new Map();
      for(let i=0;i<rootKeys.length;i++){
        const key=rootKeys[i],row=rootRows[i];
        if(!wantedRoots.has(key)||!row||await sha(serial(row.value))!==row.sha256)
          throw Error('M04 root digest or manifest mismatch');
        roots.set(key,row.value);
      }
      for(let i=0;i<orderKeys.length;i++){
        const key=orderKeys[i],row=orderRows[i];
        if(!sections.has(key)||!row||!Array.isArray(row.ids)||
           new Set(row.ids).size!==row.ids.length||
           orderHash(row.ids)!==row.hash||row.ids.length!==head.counts[key])
          throw Error('M04 order digest or count mismatch');
        orders.set(key,row.ids);
      }
      for(let i=0;i<recordKeys.length;i++){
        const key=recordKeys[i],row=recordRows[i];
        if(!Array.isArray(key)||key.length!==2||!sections.has(key[0])||
           !row||row.value?.id!==key[1]||
           await sha(serial(row.value))!==row.sha256)
          throw Error('M04 record digest or key mismatch');
        const token=JSON.stringify(key);
        if(records.has(token))throw Error('M04 duplicate stored row');
        records.set(token,row.value);
      }
      const data={};
      for(const field of head.fields){
        if(!sections.has(field)){data[field]=roots.get(field);continue;}
        const ids=orders.get(field),arr=[];
        for(const id of ids){
          const token=JSON.stringify([field,id]);
          if(!records.has(token))throw Error('M04 missing indexed row');
          arr.push(records.get(token));
        }
        data[field]=arr;
      }
      if(records.size!==[...orders.values()].reduce((sum,ids)=>sum+ids.length,0))
        throw Error('M04 orphan indexed row');
      if(head.revision===1&&await sha(serial(data))!==head.initialSnapshotSha256)
        throw Error('M04 initial snapshot digest mismatch');
      return {revision:head.revision,sourceSha256:head.sourceSha256,data};
    }

    async function applyBatch({expectedRevision,changes,fault=''}){
      if(!Number.isSafeInteger(expectedRevision)||expectedRevision<1)
        throw Error('M04 expected revision required');
      const ops=prepareChanges(changes);
      const prepared=await Promise.all(ops.map(async op=>{
        if(op.op==='put')return {...op,row:{
          value:op.record,sha256:await sha(serial(op.record))
        }};
        if(op.op==='set-root')return {...op,row:{
          value:op.value,sha256:await sha(serial(op.value))
        }};
        return op;
      }));
      const touched=[...new Set(prepared.filter(x=>x.collection).map(x=>x.collection))];
      const db=await open(name);
      let failure=null,result=null;
      try{
        await new Promise((resolve,reject)=>{
          const tx=db.transaction(['meta','root','records','orders'],'readwrite');
          const meta=tx.objectStore('meta'),rows=tx.objectStore('records'),
            roots=tx.objectStore('root'),orders=tx.objectStore('orders');
          const abort=e=>{failure=e;try{tx.abort();}catch{}};
          tx.oncomplete=()=>resolve();
          tx.onabort=tx.onerror=()=>reject(failure||tx.error||Error('M04 incremental transaction aborted'));
          const headReq=meta.get('head');
          headReq.onsuccess=()=>{
            let head;
            try{
              head=checkedHead(headReq.result);
              if(head.revision!==expectedRevision)throw Error('M04 revision conflict');
              for(const op of prepared){
                if(op.collection&&!head.sections.includes(op.collection))
                  throw Error('M04 collection not initialized');
                if(op.op==='set-root'&&!head.fields.includes(op.key))
                  throw Error('M04 root key not initialized');
              }
            }catch(e){abort(e);return;}
            const priorOrders=new Map(),priorRows=new Map();
            let pending=touched.length+prepared.filter(x=>x.collection).length;
            function write(){
              try{
                const updatedOrders=new Map();
                for(const col of touched){
                  const row=priorOrders.get(col);
                  if(!row||!Array.isArray(row.ids)||row.ids.length!==head.counts[col]||
                     orderHash(row.ids)!==row.hash)
                    throw Error('M04 existing order corrupted');
                  updatedOrders.set(col,row.ids.slice());
                }
                const structural=new Set(),counts={...head.counts};
                for(const op of prepared){
                  if(!op.collection)continue;
                  const ids=updatedOrders.get(op.collection);
                  const has=ids.includes(op.id);
                  const stored=priorRows.get(op.collection+':'+op.id);
                  if(Boolean(stored)!==has)throw Error('M04 row/order inconsistency');
                  if(op.op==='delete'){
                    if(!has)throw Error('M04 cannot delete absent row');
                    ids.splice(ids.indexOf(op.id),1);
                    rows.delete([op.collection,op.id]);structural.add(op.collection);
                  }else{
                    if(!has){ids.push(op.id);structural.add(op.collection);}
                    rows.put(op.row,[op.collection,op.id]);
                  }
                }
                for(const col of structural){
                  const ids=updatedOrders.get(col);
                  orders.put({ids,hash:orderHash(ids)},col);
                  counts[col]=ids.length;
                }
                for(const op of prepared)if(op.op==='set-root')roots.put(op.row,op.key);
                meta.put({...head,revision:head.revision+1,counts},'head');
                result={revision:head.revision+1,
                  recordWrites:prepared.filter(x=>x.op==='put').length,
                  recordDeletes:prepared.filter(x=>x.op==='delete').length,
                  rootWrites:prepared.filter(x=>x.op==='set-root').length,
                  orderWrites:structural.size};
                if(fault==='quota-abort'){
                  const e=Object.assign(Error('M04 simulated quota abort'),{name:'QuotaExceededError'});
                  abort(e);
                }
              }catch(e){abort(e);}
            }
            if(!pending){write();return;}
            const completed=()=>{pending--;if(!pending)write();};
            for(const col of touched){
              const req=orders.get(col);
              req.onsuccess=()=>{priorOrders.set(col,req.result);completed();};
            }
            for(const op of prepared)if(op.collection){
              const req=rows.get([op.collection,op.id]);
              req.onsuccess=()=>{priorRows.set(op.collection+':'+op.id,req.result);completed();};
            }
          };
        });
      }finally{db.close();}
      if(fault==='after-commit-interrupt')
        throw Error('M04 simulated lost acknowledgement after incremental commit');
      return result;
    }

    async function readRecord(collection,id){
      validSection(collection);validId(id);
      const db=await open(name);
      let head,record,order;
      try{
        const tx=db.transaction(['meta','records','orders'],'readonly'),done=txCompleted(tx);
        [head,record,order]=await Promise.all([
          txResult(tx.objectStore('meta').get('head')),
          txResult(tx.objectStore('records').get([collection,id])),
          txResult(tx.objectStore('orders').get(collection))
        ]);
        await done;
      }finally{db.close();}
      checkedHead(head);
      if(!head.sections.includes(collection))throw Error('M04 collection not initialized');
      if(!order||orderHash(order.ids)!==order.hash||!order.ids.includes(id))
        throw Error('M04 record not indexed');
      if(!record||record.value?.id!==id||await sha(serial(record.value))!==record.sha256)
        throw Error('M04 record missing or corrupted');
      return {revision:head.revision,record:record.value};
    }
    return Object.freeze({initialize,readHead,load,applyBatch,readRecord});
  }
  root.ParallelM04Incremental=Object.freeze({newLabName:newName,createStore:storeFor,segments:SEGMENTS.slice()});
})(window);
