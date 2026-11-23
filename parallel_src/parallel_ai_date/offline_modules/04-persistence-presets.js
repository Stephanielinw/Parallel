  const inferPresetGroup=p=>{
    if(p&&typeof p.group==='string'&&p.group.trim())return p.group.trim();
    const nm=String(p?.name||'');
    const slashIdx=nm.indexOf(' / ');
    return slashIdx>0?nm.slice(0,slashIdx).trim():'';
  };
  const ensureDbFields=target=>{
    target.photoDescriptions ||= {};
    target.discoveredCharacters ||= {};
    target.discoverSeen ||= {};
    if(!target.discoverSessions||typeof target.discoverSessions!=='object'||Array.isArray(target.discoverSessions))target.discoverSessions={};
    target.queue ||= {};
    target.taskStates ||= {};
    target.bgErrors ||= {};
    target.portraits ||= {};
    target.bios ||= {};
    target.bioTags ||= {};
    target.proactiveLog ||= {};
    target.surveillance ||= {};
    target.diaries ||= {};
    target.translations ||= {};
    target.meetings ||= [];
    if(!Array.isArray(target.meetingCheckpoints))target.meetingCheckpoints=[];
    target.episodicMemories ||= [];
    target.episodeArchive ||= {since:Date.now(),jobs:[],deleted:[]};
    target.episodeArchive.jobs ||= [];
    target.episodeArchive.deleted ||= [];
    for(const q of Object.values(target.queue)){
      if(!q||typeof q!=='object')continue;
      q.pending=Array.isArray(q.pending)?q.pending:[];
      if(q.status==='inflight'){
        q.status=q.paused?'paused':'idle';
        q.inflight='';
        if(q.paused)q.blocked=true;
      }
      if(q.paused){
        q.scheduledDueAt=Number(q.scheduledDueAt||q.dueAt||0);
        q.blocked=true;
        q.status='paused';
        q.dueAt=0;
      }
    }
    for(const [tk,t] of Object.entries(target.taskStates)){
      if(!t||typeof t!=='object'){delete target.taskStates[tk];continue;}
      if(t.status==='inflight'){
        t.interrupted=true;
        t.status='paused';
        t.paused=true;
        t.inflight_token='';
      }
      if((t.paused||t.status==='paused')&&t.mode==='chat'&&t.profile_id&&t.character_id){
        const qk=pairKey(t.profile_id,t.character_id);
        const q=target.queue[qk]||(target.queue[qk]={pending:[],dueAt:0,status:'paused',blocked:true,paused:true,revision:1,inflight:'',paceMode:'daily',delayMinutes:1,targetTimeLabel:'',scheduleReason:''});
        if(Array.isArray(t.pending_ids)){
          for(const mid of t.pending_ids){
            if(mid&&!q.pending.includes(mid))q.pending.push(mid);
          }
        }
        q.scheduledDueAt=Number(t.scheduled_due_at||q.scheduledDueAt||q.dueAt||0);
        q.paused=true;
        q.blocked=true;
        q.status='paused';
        q.dueAt=0;
      }
    }
    if(target.connection){
      target.connection.image_base_url ||= '';
      target.connection.image_api_key ||= '';
      target.connection.image_model ||= '';
      target.connection.proactive_mode ||= 'daily';
      if(target.connection.auto_translate===undefined)target.connection.auto_translate=true;
      if(!['natural','zh','en','custom'].includes(target.connection.character_language_pref))target.connection.character_language_pref='natural';
      if(typeof target.connection.character_language_custom!=='string')target.connection.character_language_custom='';
      target.connection.max_tokens=validTokenBudget(target.connection.max_tokens)||4096;
      target.connection.task_max_tokens=taskTokenOverrides(target.connection.task_max_tokens);
    }
    if(Array.isArray(target.presets)){
      const cm=target.presets.find(x=>x.id==='chat-main');
      if(cm&&cm.content&&cm.content.includes('用自然、个性化、符合角色的简短聊天气泡')&&!cm.content.includes('|||')){
        cm.content=DEFAULT_PRESETS[0].content;
      }
      for(const p of target.presets){
        if(p&&typeof p==='object'&&!p.group){
          const g=inferPresetGroup(p);
          if(g)p.group=g;
        }
      }
    }
    sanitizeStoredData(target);
  };
  let legacySystemLogs=[];
  try {
    const raw=localStorage.getItem(STORE_KEY);
    lastSavedRaw=raw;
    const decoded=raw?decompressStoredJson(raw):'';
    lastSavedDataRaw=decoded||null;
    db=raw?JSON.parse(decoded):empty();
    if(!db||!Array.isArray(db.profiles))throw Error('broken');
    legacySystemLogs=Array.isArray(db.systemLogs)?db.systemLogs:[];
    delete db.systemLogs;
    ensureDbFields(db);syncDiscoveredCatalog(db);
  }catch(err){db=empty();storageAvailable=false;mainStoreReadable=false;}
  const save=()=>{
    if(!mainStoreReadable)throw Error('无法安全读取原存档，已停止覆盖；请先导出备份。');
    try{
      const raw=JSON.stringify(db);
      if(raw===lastSavedDataRaw&&lastSavedRaw&&lastSavedRaw.startsWith(STORAGE_COMPRESSED_PREFIX)&&localStorage.getItem(STORE_KEY)===lastSavedRaw){storageAvailable=true;return;}
      const stored=encodeStoredJson(raw);
      localStorage.setItem(STORE_KEY,stored);
      lastSavedRaw=stored;lastSavedDataRaw=raw;storageAvailable=true;
    }
    catch(err){storageAvailable=false;throw Error('浏览器本地空间不足或禁止保存。请先导出备份并释放空间。后续保存会继续尝试，不会静默跳过。');}
  };
  // Diagnostics never share the authoritative save or its failure state.
  const LOG_MAX_COUNT=40,LOG_MAX_BYTES=4*1024*1024;
  const logByteSize=x=>{const s=JSON.stringify(x);return typeof TextEncoder==='function'?new TextEncoder().encode(s).length:s.length*3;};
  const boundedLogs=entries=>{
    const out=[],seen=new Set();let bytes=0;
    for(const row of entries){
      if(!row||typeof row!=='object'||!row.id||seen.has(row.id))continue;
      let item=row,n=logByteSize(item)+64;
      if(n>LOG_MAX_BYTES){
        item={...row,request_payload:null,raw_response:null,raw_content:'',parsed_content:'',reasoning_content:'',active_presets:[],disabled_presets:[],storage_warning:'本条日志超过独立存储容量，仅保留元数据。'};
        n=logByteSize(item)+64;
      }
      if(out.length>=LOG_MAX_COUNT||bytes+n>LOG_MAX_BYTES)continue;
      seen.add(item.id);out.push(item);bytes+=n;
    }
    return out;
  };
  const safeLog=entry=>{
    let serialized=JSON.stringify(entry);
    for(const secret of [db.connection.api_key,db.connection.image_api_key,db.connection.archive_api_key]){
      if(secret&&secret.length>=8)serialized=serialized.split(JSON.stringify(secret).slice(1,-1)).join('***REDACTED***');
    }
    return JSON.parse(serialized);
  };
  let logState={enabled:true,logs:boundedLogs(legacySystemLogs.map(safeLog))},logDb=null,logStorage='session',logSettled=false,logPending=[],logWrites=Promise.resolve();
  legacySystemLogs=[];
  const openLogDb=()=>new Promise(resolve=>{
    if(typeof indexedDB==='undefined'){resolve(null);return;}
    let settled=false;
    const finish=value=>{if(settled){try{value?.close();}catch{}return;}settled=true;resolve(value);};
    try{
      const req=indexedDB.open('parallel-generation-logs-v1',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('logs'))req.result.createObjectStore('logs');};
      req.onsuccess=()=>finish(req.result);req.onerror=()=>finish(null);req.onblocked=()=>finish(null);
      if(typeof setTimeout==='function')setTimeout(()=>{if(!settled)finish(null);},1500);
    }catch{finish(null);}
  });
  const readLogState=()=>new Promise((resolve,reject)=>{
    try{const tx=logDb.transaction('logs','readonly'),req=tx.objectStore('logs').get('state');
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.onabort=()=>reject(tx.error);}
    catch(e){reject(e);}
  });
  const writeLogState=()=>new Promise((resolve,reject)=>{
    if(!logDb){resolve();return;}
    try{const tx=logDb.transaction('logs','readwrite');tx.objectStore('logs').put({enabled:logState.enabled,logs:logState.logs},'state');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}
    catch(e){reject(e);}
  });
  const disableLogPersistence=()=>{try{logDb?.close();}catch{}logDb=null;logStorage='session';};
  const persistLogState=()=>{
    logWrites=logWrites.then(()=>writeLogState()).catch(()=>{disableLogPersistence();});
    return logWrites;
  };
  const logReady=(async()=>{
    try{
      logDb=await openLogDb();
      if(logDb){
        const prior=await readLogState();
        if(prior){
          logState.enabled=prior.enabled!==false;
          logState.logs=boundedLogs([...logState.logs,...(Array.isArray(prior.logs)?prior.logs:[])].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))));
        }
        logStorage='indexeddb';
      }
    }catch{disableLogPersistence();}
    logSettled=true;
    if(logState.enabled)logState.logs=boundedLogs([...logPending,...logState.logs]);
    logPending=[];
    await persistLogState();
  })();
  // Keep the authoritative in-memory save if the first write fails.
  if(mainStoreReadable){try{save();}catch{}}
  const bodyErr=s=>{throw Error(s)};
  const validatePresetPackage=(pack)=>{
    if(pack&&pack.format==='elsewhere-preset'){
      if(pack.schemaVersion!==1||!Array.isArray(pack.entries)||pack.entries.length<1||pack.entries.length>200)bodyErr('Elsewhere 自有预设结构无效');
      const ids=new Set(),entries=pack.entries.map((x,i)=>{
        if(!x||typeof x.id!=='string'||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||typeof x.content!=='string'||x.content.length>60000||!['system','user','assistant'].includes(x.role)||typeof x.enabled!=='boolean')bodyErr('Elsewhere 条目 '+(i+1)+' 格式无效');
        ids.add(x.id);const group=String(x.group||'').trim().slice(0,70);const rawName=x.name.trim();
        return {mode:'meeting',name:((group?group+' / ':'')+rawName).slice(0,100),raw_name:rawName.slice(0,100),group,source_id:x.id,origin:'elsewhere',role:x.role,content:x.content,enabled:x.enabled,sort_order:i};
      });return {modes:['meeting'],entries};
    }
    if(!pack||typeof pack!=='object'||Array.isArray(pack)||pack.format!=='parallel-text-preset'||pack.schemaVersion!==1)
      bodyErr('仅支持 Parallel 自有预设 JSON（v1），不支持第三方预设格式');
    const modes=pack.modes,entries=pack.entries;
    if(!Array.isArray(modes)||modes.length<1||modes.length>2||new Set(modes).size!==modes.length||modes.some(x=>!['chat','meeting'].includes(x)))bodyErr('预设的模式列表无效');
    if(!Array.isArray(entries)||entries.length<1||entries.length>200)bodyErr('预设应包含 1–200 个条目');
    if(new TextEncoder().encode(JSON.stringify(pack)).length>4*1024*1024)bodyErr('预设文件超过 4 MB');
    const reqFields=['mode','name','role','enabled','content','sort_order'];
    const optFields=new Set(['mode','name','role','enabled','content','sort_order','group','source_id','origin','raw_name']);
    return {modes,entries:entries.map((x,i)=>{
      const valid=x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>optFields.has(k))&&reqFields.every(k=>Object.prototype.hasOwnProperty.call(x,k))&&modes.includes(x.mode)&&['system','user','assistant'].includes(x.role)&&typeof x.name==='string'&&x.name.trim().length>0&&x.name.length<=100&&typeof x.content==='string'&&x.content.length<=60000&&typeof x.enabled==='boolean'&&Number.isInteger(x.sort_order)&&x.sort_order>=0&&x.sort_order<=10000;
      if(!valid)bodyErr('预设条目 '+(i+1)+' 格式无效');
      const group=String(x.group||inferPresetGroup(x)||'').trim().slice(0,70);
      return {mode:x.mode,name:x.name.trim(),raw_name:String(x.raw_name||x.name).trim().slice(0,100),group,source_id:String(x.source_id||''),origin:String(x.origin||'parallel'),role:x.role,enabled:x.enabled,content:x.content,sort_order:x.sort_order};
    })};
  };
  const diagnosePresets=(mode='meeting')=>{
    const all=(db.presets||[]).filter(x=>x.mode===mode).sort((a,b)=>a.sort_order-b.sort_order);
    const enabled=all.filter(x=>x.enabled);
    const disabled=all.filter(x=>!x.enabled);
    const isDefaultEntry=x=>DEFAULT_PRESET_IDS.has(x.id)||(mode==='meeting'&&(x.name==='面对面 · 小说模式'||x.name==='线下见面 · 小说模式'||x.name==='克制与连贯')&&!x.group);
    const defaultEnabled=enabled.filter(isDefaultEntry);
    const customEnabled=enabled.filter(x=>!isDefaultEntry(x));
    const defaultAndCustomCoexist=defaultEnabled.length>0&&customEnabled.length>0;
    const seenContent=new Map();
    const duplicateEntries=[];
    for(const item of all){
      const key=`${item.role}::${String(item.name||'').trim()}::${String(item.content||'').trim().slice(0,240)}`;
      if(seenContent.has(key)){
        duplicateEntries.push({id:item.id,name:item.name,enabled:!!item.enabled,duplicateOf:seenContent.get(key)});
      }else{
        seenContent.set(key,item.id);
      }
    }
    const styleEntries=all.filter(x=>{
      const g=inferPresetGroup(x);
      return g.includes('文风')||String(x.name||'').startsWith('文风');
    });
    const enabledStyleEntries=styleEntries.filter(x=>x.enabled);
    const cotEntries=enabled.filter(x=>{
      const g=inferPresetGroup(x);
      return g.toUpperCase()==='COT'||String(x.name||'').includes('动笔前')||String(x.name||'').toUpperCase().includes('COT /');
    });
    const pledgeEntries=enabled.filter(x=>x.role==='assistant'||inferPresetGroup(x).includes('誓约')||String(x.name||'').includes('誓约'));
    const warnings=[];
    if(defaultAndCustomCoexist){
      warnings.push(`检测到系统默认保底预设（${defaultEnabled.map(x=>x.name).join('、')}）与导入的自定义预设同时启用。这通常是因为导入时选择了「追加导入」，可能导致简短保底指令稀释自定义预设的文风与篇幅规则。`);
    }
    if(duplicateEntries.length>0){
      warnings.push(`检测到 ${duplicateEntries.length} 个重复的预设条目（可能是多次点击「追加导入」所致），重复注入会浪费上下文预算。`);
    }
    if(styleEntries.length>0&&enabledStyleEntries.length>1){
      warnings.push(`「文风（单选）」分组当前同时启用了 ${enabledStyleEntries.length} 个文风条目（${enabledStyleEntries.map(x=>x.name).join('、')}），建议仅启用 1 个以防文风打架。`);
    }else if(styleEntries.length>0&&enabledStyleEntries.length===0){
      warnings.push(`「文风（单选）」分组当前未启用任何文风条目（共 ${styleEntries.length} 个均已停用）。`);
    }
    const rolesBreakdown={
      system:enabled.filter(x=>x.role==='system').length,
      user:enabled.filter(x=>x.role==='user').length,
      assistant:enabled.filter(x=>x.role==='assistant').length
    };
    return {
      mode,
      totalCount:all.length,
      enabledCount:enabled.length,
      disabledCount:disabled.length,
      totalEnabledChars:enabled.reduce((acc,x)=>acc+String(x.content||'').length,0),
      hasCustomPresets:customEnabled.length>0,
      defaultAndCustomCoexist,
      defaultEnabledIds:defaultEnabled.map(x=>x.id),
      duplicateCount:duplicateEntries.length,
      duplicateEntries,
      styleGroupTotal:styleEntries.length,
      enabledStyleCount:enabledStyleEntries.length,
      enabledStyleNames:enabledStyleEntries.map(x=>x.name),
      disabledStyleNames:styleEntries.filter(x=>!x.enabled).map(x=>x.name),
      hasCotCheck:cotEntries.length>0,
      hasBottomPledge:pledgeEntries.length>0,
      rolesBreakdown,
      warnings
    };
  };

