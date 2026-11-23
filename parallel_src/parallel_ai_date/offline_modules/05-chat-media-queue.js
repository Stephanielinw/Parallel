  const getP=id=>db.profiles.find(p=>p.id===id)||bodyErr('请先选择有效的 Profile');
  const getC=id=>byId.get(id)||bodyErr('原作人物目录中不存在此角色');
  const relation=(pid,cid)=>db.relations[pairKey(pid,cid)];
  const pub=()=>{const {api_key,image_api_key,archive_api_key,...s}=db.connection;const hasApi=!!(s.base_url&&s.model&&api_key);const hasImg=!!(s.image_base_url&&s.image_model&&image_api_key);const demoEnabled=s.demo_enabled!==false;return {...s,proactive_mode:s.proactive_mode||'daily',auto_translate:s.auto_translate!==false,character_language_pref:['natural','zh','en','custom'].includes(s.character_language_pref)?s.character_language_pref:'natural',character_language_custom:String(s.character_language_custom||''),has_key:!!api_key,has_archive_key:!!archive_api_key,archive_enabled:s.archive_enabled!==false,archive_mode:s.archive_mode||'inherit',has_api_config:hasApi,demo_enabled:demoEnabled,has_image_key:!!image_api_key,mode:hasApi?'live':(demoEnabled?'demo':'normal'),image_mode:hasImg?'live':'text',portable:true,storageAvailable}};
  // The provider may put analysis in content instead of reasoning_content.
  // Strip only complete leading tagged blocks; never guess from candidate bubbles.
  const guardChatReasoning=raw=>{
    let text=String(raw??'').trim(), removed=false;
    const open=/^<(think|thinking|reasoning|analysis)(?:\s[^<>]*)?>/i;
    const anyTag=/<\/?(?:think|thinking|reasoning|analysis)(?:\s[^<>]*)?>/i;
    for(let i=0;i<8;i++){
      const start=text.match(open);
      if(!start)break;
      const rest=text.slice(start[0].length);
      const close=new RegExp('</'+start[1]+'\\s*>','i').exec(rest);
      if(!close||anyTag.test(rest.slice(0,close.index)))return null;
      text=rest.slice(close.index+close[0].length).trim();
      removed=true;
    }
    if(open.test(text)||/^<\/(?:think|thinking|reasoning|analysis)\s*>/i.test(text))return null;
    if(removed&&(!text||anyTag.test(text)))return null;
    // Require a heading at the start, not a casual mention of the word.
    const heading=/^(?:#{1,6}[ \t]*)?(?:\*{1,2}[ \t]*)?(?:思维过程|思考过程|分析过程|推理过程|思维链|chain of thought|thinking process|reasoning process|reasoning|analysis)(?:[ \t]*\*{1,2})?[ \t]*[:：]?(?:[ \t]*\*{1,2})?[ \t]*(?:\r?\n|$)/i;
    if(heading.test(text))return null;
    return text;
  };
  // Chat photo descriptions are text metadata; the UI image is never model input.
  const parseChatPhoto=raw=>{
    const m=String(raw??'').trim().match(/^\[\[PHOTO:\s*([^\r\n]+?)\]\]$/);
    const d=m?.[1]?.trim();
    return d&&d.length<=2000&&!d.includes('[[')&&!d.includes(']]')&&!/\|{2,}/.test(d)?d:'';
  };
  const photoDescriptionText=(sender,description)=>'['+(sender==='user'?'对方':'我')+'发送了一张照片：'+description+']';
  const isGalleryImage=v=>typeof v==='string'&&v.length<=1500000&&/^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(v);
  let photoDbPromise;
  const openChatPhotoDb=()=>{
    if(typeof indexedDB==='undefined')return Promise.reject(Error('浏览器不支持独立照片存储'));
    if(!photoDbPromise)photoDbPromise=new Promise((resolve,reject)=>{
      const req=indexedDB.open('parallel-chat-photos-v1',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('photos'))req.result.createObjectStore('photos');};
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(Error('无法打开本地照片库'));
      req.onblocked=()=>reject(Error('本地照片库被占用'));
    }).catch(e=>{photoDbPromise=null;throw e;});
    return photoDbPromise;
  };
  const saveChatPhotoBatch=async rows=>{
    const store=await openChatPhotoDb();
    await new Promise((resolve,reject)=>{
      const tx=store.transaction('photos','readwrite'),os=tx.objectStore('photos');
      for(const row of rows)os.put(row.data,row.ref);
      tx.oncomplete=()=>resolve();
      tx.onabort=tx.onerror=()=>reject(Error('照片保存失败，可能是浏览器空间不足'));
    });
  };
  const readChatPhoto=async ref=>{
    const store=await openChatPhotoDb();
    return new Promise((resolve,reject)=>{
      const req=store.transaction('photos','readonly').objectStore('photos').get(ref);
      req.onsuccess=()=>isGalleryImage(req.result)?resolve(req.result):reject(Error('本地照片文件不存在或已损坏'));
      req.onerror=()=>reject(Error('读取本地照片失败'));
    });
  };
  const removeChatPhotos=async refs=>{
    if(!refs.length)return;
    const store=await openChatPhotoDb();
    await new Promise((resolve,reject)=>{
      const tx=store.transaction('photos','readwrite');
      for(const ref of refs)tx.objectStore('photos').delete(ref);
      tx.oncomplete=()=>resolve();tx.onerror=tx.onabort=()=>reject(Error('清理本地照片失败'));
    });
  };
  const resolveChatPhotoInput=async(messages,read=readChatPhoto)=>Promise.all(messages.map(async m=>{
    if(!m.photo_ref)return m;
    const {photo_ref,...plain}=m;
    if(plain.role!=='user')throw Error('无效的照片来源');
    const url=await read(photo_ref);
    if(!isGalleryImage(url))throw Error('本地照片格式无效');
    return {...plain,content:[{type:'text',text:plain.content},{type:'image_url',image_url:{url}}]};
  }));
  const maskPhotoInput=payload=>({...payload,messages:payload.messages.map(m=>Array.isArray(m.content)?{...m,content:m.content.map(part=>part.type==='image_url'?{type:'image_url',image_url:{url:'[LOCAL PHOTO REDACTED]'}}:part)}:m)});
  const splitChatBubbles=raw=>{
    const rawStr=String(raw||'').trim();
    if(!rawStr)return ['…'];
    let parts=explicitChatParts(rawStr);
    if(!parts.length&&(isBareChatDivider(rawStr.replace(PROTOCOL_LEADING_TAG_RE,''))||isNarrationMarker(cleanChatBubbleText(rawStr))))return [];
    if(parts.some(p=>p.includes('[[PHOTO:')&&!parseChatPhoto(p))||(parts.length>4&&parts.some(p=>parseChatPhoto(p))))return [];
    if(parts.length===1&&parts[0].length>=120&&!parseChatPhoto(parts[0])){
      const sentences=parts[0].match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g)?.map(s=>cleanChatBubbleText(s)).filter(Boolean)||[parts[0]];
      if(sentences.length>=2){
        parts=[];
        let buf='';
        for(const s of sentences){
          if(!buf)buf=s;
          else if((buf+s).length<=48||buf.length<24)buf+=s;
          else{parts.push(buf);buf=s;}
        }
        if(buf)parts.push(buf);
      }
    }
    if(parts.length>4){
      parts=[...parts.slice(0,3),parts.slice(3).join(' ')];
    }
    return parts.length?parts:['…'];
  };
  const photoText=c=>{
    const scenes=['靠近窗边的浅色日光','傍晚路口的柔和逆光','安静街角的背景','室内略微虚焦的背景'];
    let h=0;for(const ch of c.id)h=(Math.imul(31,h)+ch.charCodeAt(0))|0;
    const gestures=['微微侧身，像是有人临时叫住了他/她','没有刻意对镜头微笑，神情有片刻放松','姿势自然随意，目光却很专注','视线停在镜头外不远处，像是在听拍摄者说话'];
    return `照片里，${c.name}处在${scenes[(h>>>0)%4]}之中。${gestures[((h>>>2)>>>0)%4].replace('他/她',c.name)}。这并非精心布置的正式肖像，更像是某次短暂停留时留下的生活照。`;
  };
  const fmtHHMM=ts=>{
    try{
      const d=new Date(ts||Date.now());
      if(Number.isNaN(d.getTime()))return '';
      return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0');
    }catch{return ''}
  };
  const computePersonaDelay=(c,msgText='')=>{
    const txt=String(msgText||'');
    if(/到了|在门口|出来|急|快回|见一面|你在哪|抬头|等你/.test(txt)){
      return {delayMinutes:3,reason:'感知到你可能有急事或已在附近，很快拿起手机'};
    }
    let h=0;const seed=(c?.id||'')+new Date().toISOString().slice(0,13);
    for(const ch of seed)h=(Math.imul(31,h)+ch.charCodeAt(0))|0;
    const base=12+((h>>>0)%24); // 12 to 35 minutes
    return {delayMinutes:base,reason:`日常模式 · ${c?.name||'对方'}正在忙手头的事，预计 ${fmtHHMM(Date.now()+base*60000)} 左右看手机并统一回复`};
  };
  const TASK_LABELS={
    chat:'手机聊天回复',
    chat_flush:'手机聊天回复',
    chat_message:'手机聊天回复',
    chat_continue:'手机聊天继续生成',
    chat_first_message:'首次匹配打招呼',
    chat_proactive:'角色主动发消息',
    meeting:'面对面小说推进',
    meeting_message:'面对面小说推进',
    meeting_continue:'面对面小说续写',
    meeting_opening:'面对面小说开场',
    meeting_reroll:'面对面小说重 Roll',
    meeting_finalize:'见面总结归档',
    meeting_summary:'见面总结归档',
    discover_bios:'候选角色档案生成',
    bio:'候选角色档案生成',
    match_decision:'匹配意愿判定',
    match:'匹配意愿判定',
    portrait:'角色照片生成',
    photo_description:'照片描述生成',
    photo:'照片描述生成',
    surveillance:'每日监控行踪生成',
    diary:'角色私密日记生成',
    translation:'双语译文翻译',
    chat_translation:'双语译文翻译'
  };
  // --- Bilingual mobile chat translation helpers (independent companion store, zero prompt/memory pollution) ---
  const MINOR_ZH_CHAT_TOKENS=new Set([
    'ok','okay','app','wifi','ai','id','ip','vip','bgm','npc','cp',
    'ui','ux','api','vr','ar','pdf','gps','dna','mv','tv','cd',
    'usb','gif','png','jpg','atm','diy','ktv','ceo','hr','pr','qa',
    'pm','am','km','cm','kg','ml','mg','re','re0','re1','re2','re3',
    're4','re5','re6','re7','re8','mcu','tva','bsaa','stars','ubcs',
    'lol','omg','btw','vs','kfc','bmw','ps5','pc','ios','mac'
  ]);
  const TR_URL_RE=/https?:\/\/\S+|www\.\S+/gi;
  const TR_HAN_RE=/[\u4e00-\u9fff\u3400-\u4dbf]/g;
  const TR_KANA_RE=/[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff]/g;
  const TR_HANGUL_RE=/[\uac00-\ud7af\u1100-\u11ff]/g;
  const TR_OTHER_SCRIPT_RE=/[\u0400-\u04ff\u0370-\u03ff\u0600-\u06ff\u0e00-\u0e7f\u0590-\u05ff]/g;
  const TR_LATIN_WORD_RE=/[A-Za-z\u00c0-\u024f]+(?:'[A-Za-z\u00c0-\u024f]+)*/g;
  const computeContentVersion=text=>{
    const normalized=String(text??'').replace(/\r\n?/g,'\n').trim();
    let h1=0x811c9dc5;
    let h2=0x01000193;
    for(let i=0;i<normalized.length;i++){
      const ch=normalized.charCodeAt(i);
      h1^=ch;
      h1=Math.imul(h1,0x01000193)>>>0;
      h2^=(ch+(i&0xff));
      h2=Math.imul(h2,0x85ebca6b)>>>0;
    }
    return `v1:${normalized.length}:${h1.toString(16).padStart(8,'0')}${h2.toString(16).padStart(8,'0')}`;
  };
  const analyzeTranslationNeed=(rawText,ignoreNames=[])=>{
    const stripped=String(rawText??'').replace(TR_URL_RE,' ').trim();
    if(!stripped)return {needsTranslation:false,reason:'empty',detectedScript:'none'};
    const hanCount=(stripped.match(TR_HAN_RE)||[]).length;
    const kanaCount=(stripped.match(TR_KANA_RE)||[]).length;
    const hangulCount=(stripped.match(TR_HANGUL_RE)||[]).length;
    const otherForeignCount=(stripped.match(TR_OTHER_SCRIPT_RE)||[]).length;
    const allLatinWords=stripped.match(TR_LATIN_WORD_RE)||[];
    const ignoredTokens=new Set();
    for(const nm of (ignoreNames||[])){
      for(const part of (String(nm||'').match(TR_LATIN_WORD_RE)||[])){
        const lower=part.toLowerCase();
        if(lower.length>=2)ignoredTokens.add(lower);
      }
    }
    if(kanaCount>0)return {needsTranslation:true,reason:'japanese_or_other_script',detectedScript:hanCount>0&&allLatinWords.length>0?'mixed':'ja'};
    if(hangulCount>0)return {needsTranslation:true,reason:'japanese_or_other_script',detectedScript:'ko'};
    if(otherForeignCount>0)return {needsTranslation:true,reason:'japanese_or_other_script',detectedScript:'other'};
    const totalLatinChars=allLatinWords.reduce((s,w)=>s+w.length,0);
    if(hanCount===0&&totalLatinChars===0)return {needsTranslation:false,reason:'non_lexical',detectedScript:'none'};
    if(hanCount===0&&totalLatinChars>0){
      const substantive=allLatinWords.filter(w=>!MINOR_ZH_CHAT_TOKENS.has(w.toLowerCase())||allLatinWords.length>1);
      if(substantive.length>0||totalLatinChars>=2){
        if(allLatinWords.length===1&&MINOR_ZH_CHAT_TOKENS.has(allLatinWords[0].toLowerCase())){
          return {needsTranslation:false,reason:'zh_with_minor_loanword',detectedScript:'en'};
        }
        return {needsTranslation:true,reason:'foreign_only',detectedScript:'en'};
      }
      return {needsTranslation:false,reason:'non_lexical',detectedScript:'none'};
    }
    if(hanCount>0&&totalLatinChars===0)return {needsTranslation:false,reason:'already_zh_cn',detectedScript:'zh'};
    const substantiveLatinWords=allLatinWords.filter(w=>{
      const lower=w.toLowerCase();
      if(lower.length<=1)return false;
      if(MINOR_ZH_CHAT_TOKENS.has(lower))return false;
      if(ignoredTokens.has(lower))return false;
      return true;
    });
    const substantiveChars=substantiveLatinWords.reduce((s,w)=>s+w.length,0);
    if(substantiveLatinWords.length>=2||(substantiveLatinWords.length===1&&substantiveChars>=7)){
      return {needsTranslation:true,reason:'mixed_language',detectedScript:'mixed'};
    }
    return {needsTranslation:false,reason:'zh_with_minor_loanword',detectedScript:'zh'};
  };
  const needsChineseTranslation=(rawText,ignoreNames=[])=>analyzeTranslationNeed(rawText,ignoreNames).needsTranslation;
  const buildCharacterLanguageDirective=(pref='natural',customLanguage='')=>{
    const mode=['natural','zh','en','custom'].includes(pref)?pref:'natural';
    const custom=String(customLanguage||'').trim().slice(0,40);
    if(mode==='zh')return '【角色语言偏好：简体中文】本次手机聊天请优先使用自然、符合你原作性格与语气特色的简体中文回复（保留你原有的称呼习惯、幽默或克制感，不要翻译腔）。';
    if(mode==='en')return '【角色语言偏好：英语】本次手机聊天请优先使用自然、地道的英语回复，完整保留你的原作性格、俚语、讽刺幽默与称呼习惯。';
    if(mode==='custom'&&custom)return `【角色语言偏好：${custom}】本次手机聊天请优先使用「${custom}」自然回复，完整保留你的原作性格、情绪与说话方式。`;
    return '【角色语言策略：自然选择】请依据你自身的原作背景、母语、文化身份、个人语言能力与当前交流情境自然使用语言（例如欧美角色可用英语，日本角色可用日语，中国角色可用中文，多语言角色可根据情境自然切换），不强制统一语言，也绝不为了翻译功能改变原有性格或说话方式；用户可自由使用中文、英语或其他语言发消息。';
  };
  const buildBatchTranslationMessages=(items,characterName,characterCue='')=>{
    const cue=String(characterCue||'').trim().slice(0,120);
    const sys=[
      '你是 Parallel 手机聊天界面的系统阅读辅助翻译器。',
      '任务：将输入数组中每条角色消息准确翻译为自然、地道的简体中文。',
      '铁律：',
      '1. 忠实保留原文的情绪、幽默、讽刺、俚语、称呼、停顿与人物说话风格，避免生硬翻译腔。',
      '2. 严禁擅自添加任何解释、注释、旁白、动作描写、括号补充或改变角色原本表达的意思。',
      '3. 若某条消息为中外文混合，请整理为通顺自然的完整简体中文句意，专有名词可自然保留。',
      '4. 严格只输出一个 JSON 对象，格式为 {"translations":[{"id":"原id","zh":"对应简体中文译文"}]}，必须与输入 id 一一对应且数量完全一致。',
      characterName?`当前发言角色语气参考：${characterName}${cue?`（${cue}）`:''}。`:''
    ].filter(Boolean).join('\n');
    return [
      {role:'system',content:sys},
      {role:'user',content:JSON.stringify({items})}
    ];
  };
  const parseTranslationBatchResponse=(rawContent,expectedItems)=>{
    let candidate=String(rawContent??'').trim();
    const fenced=candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if(fenced&&fenced[1])candidate=fenced[1].trim();
    const parsed=JSON.parse(candidate);
    const list=Array.isArray(parsed?.translations)?parsed.translations:(Array.isArray(parsed)?parsed:null);
    if(!list)throw new Error('Translation JSON missing translations array');
    const expectedIds=new Set(expectedItems.map(x=>x.id));
    const translations={};
    for(const row of list){
      if(!row||typeof row!=='object')continue;
      const id=String(row.id||'').trim();
      const zh=String(row.zh??row.translation??row.text??'').trim();
      if(id&&expectedIds.has(id)&&zh)translations[id]=zh;
    }
    if(Object.keys(translations).length===0&&list.length===expectedItems.length){
      for(let i=0;i<expectedItems.length;i++){
        const row=list[i];
        const zh=typeof row==='string'?row.trim():String(row?.zh??row?.translation??'').trim();
        if(zh)translations[expectedItems[i].id]=zh;
      }
    }
    const missingIds=expectedItems.map(x=>x.id).filter(id=>!translations[id]);
    return {translations,missingIds};
  };
  const invalidateTranslation=mid=>{
    if(db.translations&&mid&&Object.prototype.hasOwnProperty.call(db.translations,mid)){
      delete db.translations[mid];
    }
  };
  const getMatchedTranslationsForThread=(pid,cid,msgs)=>{
    db.translations ||= {};
    const out={};
    for(const m of (msgs||[])){
      if(!m||m.sender!=='ai'||m.mode!=='chat'||m.recalled||m.engine==='recalled'||m.engine==='error'||m.isolated_error)continue;
      const entry=db.translations[m.id];
      if(!entry||typeof entry!=='object')continue;
      const clean=cleanChatBubbleText(m.text);
      const ver=computeContentVersion(clean);
      if(entry.content_version===ver){
        out[m.id]={...entry};
      }
    }
    return out;
  };
  const demoTranslateToZh=raw=>{
    const s=String(raw||'').trim();
    if(/just wrapped up|off duty/i.test(s))return '刚结束一轮漫长的值班，总算下班了。';
    if(/coffee/i.test(s))return '先喝杯咖啡喘口气，有事随时说。';
    if(/また後で|後で連絡/.test(s))return '晚点再联系你。';
    if(/お疲れ|おつかれ/.test(s))return '辛苦了。';
    return `（演示译文）${s}`;
  };
  const inflightControllers=new Map();
  const taskKeyOf=(pid,cid,mode='chat')=>`${pid||'_'}|${cid||'_'}|${mode||'chat'}`;
  const getTaskState=(pid,cid,mode='chat')=>{
    db.taskStates ||= {};
    return db.taskStates[taskKeyOf(pid,cid,mode)]||null;
  };
  const clearTaskState=(pid,cid,mode='chat')=>{
    db.taskStates ||= {};
    const k=taskKeyOf(pid,cid,mode);
    const ctrl=inflightControllers.get(k);
    if(ctrl){try{ctrl.abort();}catch{}inflightControllers.delete(k);}
    delete db.taskStates[k];
  };
  const meetingRerolls=new Map();
  const clearTaskStatesForPair=(pid,cid)=>{
    const roll=meetingRerolls.get(pairKey(pid,cid));if(roll){roll.controller?.abort();meetingRerolls.delete(pairKey(pid,cid));}
    clearTaskState(pid,cid,'chat');
    clearTaskState(pid,cid,'meeting');
  };
  const recordBgError=(pid,cid,taskType,errObj)=>{
    db.bgErrors ||= {};
    const k=pairKey(pid||'_',cid||'_');
    const existing=db.bgErrors[k]||{};
    existing[taskType]={
      task_type:taskType,
      task_label:TASK_LABELS[taskType]||taskType,
      profile_id:pid||'',
      character_id:cid||'',
      error_code:errObj?.error_code||'API_ERROR',
      http_status:errObj?.http_status||0,
      title:errObj?.title||'后台任务调用失败',
      message:errObj?.message||String(errObj||'请求失败'),
      count:((existing[taskType]?.count)||0)+1,
      updated_at:stamp()
    };
    db.bgErrors[k]=existing;
    save();
  };
  const clearBgError=(pid,cid,taskType='')=>{
    if(!db.bgErrors)return;
    const k=pairKey(pid||'_',cid||'_');
    if(!db.bgErrors[k])return;
    if(taskType)delete db.bgErrors[k][taskType];
    else delete db.bgErrors[k];
  };
  const queueInfo=(pid,cid)=>{
    const r=relation(pid,cid);
    const hotChat=Boolean(r?.hot_chat);
    const q=db.queue[pairKey(pid,cid)];
    const ts=getTaskState(pid,cid,'chat');
    if(!q)return {count:0,pendingIds:[],dueAt:0,remainingMs:0,status:ts?.status==='paused'?'paused':'idle',blocked:Boolean(ts?.status==='paused'),paused:Boolean(ts?.status==='paused'),taskState:ts,paceMode:hotChat?'hot':'daily',hotChat,delayMinutes:hotChat?1:0,targetTimeLabel:'',scheduleReason:''};
    const dueAt=Number(q.dueAt||0);
    const isPaused=Boolean(q.paused||(ts&&ts.status==='paused'));
    return {
      count:q.pending.length,
      pendingIds:q.pending.slice(),
      dueAt,
      remainingMs:isPaused?0:Math.max(0,dueAt-Date.now()),
      status:isPaused?'paused':q.status,
      blocked:!!q.blocked||isPaused,
      paused:isPaused,
      taskState:ts,
      recoveryKind:q.userPaused||ts?.userPaused?'user':ts?.interrupted?'interrupted':ts?.last_error?'error':'',
      paceMode:q.paceMode||(hotChat?'hot':'daily'),
      hotChat,
      delayMinutes:q.delayMinutes||(hotChat?1:20),
      targetTimeLabel:dueAt?fmtHHMM(dueAt):(q.targetTimeLabel||''),
      scheduleReason:isPaused?(ts?.last_error?.title?`回复已暂停 · 点击恢复（${ts.last_error.title}）`:'回复已暂停 · 点击恢复'):(q.scheduleReason||'')
    };
  };
  const clearQueue=(pid,cid)=>{
    const k=pairKey(pid,cid),q=db.queue[k];
    if(q){q.pending=[];q.dueAt=0;q.scheduledDueAt=0;q.status='idle';q.blocked=false;q.paused=false;q.revision=(q.revision||0)+1;q.inflight='';q.targetTimeLabel='';q.scheduleReason='';}
    clearTaskState(pid,cid,'chat');
  };
  const enqueue=(pid,cid,id,msgText='')=>{
    const k=pairKey(pid,cid);
    const r=relation(pid,cid);
    const hotChat=Boolean(r?.hot_chat);
    const c=byId.get(cid);
    const q=db.queue[k]||(db.queue[k]={pending:[],dueAt:0,status:'idle',blocked:false,paused:false,revision:0,inflight:'',paceMode:hotChat?'hot':'daily',delayMinutes:1,targetTimeLabel:'',scheduleReason:''});
    const ts=getTaskState(pid,cid,'chat');
    const isPaused=Boolean(q.paused||(ts&&ts.status==='paused'));
    const wasEmpty=q.pending.length===0;
    if(!q.pending.includes(id))q.pending.push(id);
    if(isPaused){
      q.paused=true;
      q.blocked=true;
      q.status='paused';
      if(ts){
        ts.pending_ids=q.pending.slice();
        ts.updated_at=stamp();
      }
      q.scheduleReason='回复已暂停 · 新消息已按顺序加入待回复队列，点击恢复后将一并发送';
      return queueInfo(pid,cid);
    }
    q.blocked=false;
    const now=Date.now();
    if(hotChat){
      q.paceMode='hot';
      q.delayMinutes=1;
      q.dueAt=now+60000;
      q.targetTimeLabel=fmtHHMM(q.dueAt);
      q.scheduleReason='热聊模式 · 停手 1 分钟后立即阅读并回复';
    }else{
      q.paceMode='daily';
      if(wasEmpty||!q.dueAt||q.dueAt<=now){
        const sched=computePersonaDelay(c,msgText);
        q.delayMinutes=sched.delayMinutes;
        q.dueAt=now+sched.delayMinutes*60000;
        q.targetTimeLabel=fmtHHMM(q.dueAt);
        q.scheduleReason=sched.reason;
      }
    }
    return queueInfo(pid,cid);
  };
  async function verifyGeneratedMeetingDetail(p,c,messages,draft,options={}){
    // Regular chat uses the concise recap. Only a drafted recollection requiring
    // precise facts triggers a second grounded generation before persistence.
    if(!draft||!needsMeetingDetail(draft)||messages[0]?.content?.includes('现场原文 #'))return draft;
    const source=recentActualMeetingContext(p,c,draft,options.simulatedAt||Date.now());
    if(!source.includes('现场原文 #'))return draft;
    const checked=messages.map((m,i)=>i===0?{...m,content:m.content+'\n【补充事实核对：角色想自主提及见面中的具体经历】'+source+'\n请重新生成同一轮回复，保留自然口吻，只能使用可核对的具体事实，不要让人物解释系统或引文。'}:m);
    try{
      return await llm(checked,{...options,mode:'chat',entry_point:'chat_meeting_detail_recall'});
    }catch{
      // A failed lookup must not publish an unsupported, confident recollection.
      return '那天的事我记得，不过有些细节我不想凭空说错。';
    }
  }
  async function flushQueue(p,c,force,retryOpts={}){
    const key=pairKey(p.id,c.id),q=db.queue[key];
    const tKey=taskKeyOf(p.id,c.id,'chat');
    const ts=getTaskState(p.id,c.id,'chat');
    if(!q)return {reply:null,replies:[],queued:false,queue:queueInfo(p.id,c.id)};
    if(q.status==='inflight'||ts?.status==='inflight'){
      return {reply:null,replies:[],queued:true,inflight:true,deduplicated:true,queue:queueInfo(p.id,c.id),taskState:ts};
    }
    if((!q.pending||!q.pending.length)&&Array.isArray(ts?.pending_ids)&&ts.pending_ids.length){
      q.pending=ts.pending_ids.slice();
    }
    if(!q.pending.length)return {reply:null,replies:[],queued:false,queue:queueInfo(p.id,c.id)};
    if((q.userPaused||ts?.userPaused)&&!retryOpts.manualResume){
      return {reply:null,replies:[],queued:true,paused:true,queue:queueInfo(p.id,c.id),taskState:ts};
    }
    if(!force&&(q.paused||ts?.status==='paused'||q.blocked||Date.now()<q.dueAt)){
      return {reply:null,replies:[],queued:true,paused:Boolean(q.paused||ts?.status==='paused'),queue:queueInfo(p.id,c.id),taskState:ts};
    }
    const curMode=pub().mode;
    if(curMode==='normal'){
      q.blocked=true;save();
      return {reply:null,replies:[],queued:true,warning:'当前处于正常模式且尚未连接 API，请先在「终端」填写 API 地址、密钥和模型。',queue:queueInfo(p.id,c.id)};
    }
    const scheduledDueAt=Number(q.dueAt||q.scheduledDueAt||ts?.scheduled_due_at||0);
    if(retryOpts.recovery&&scheduledDueAt>retryOpts.recovery.openedAt)return {reply:null,replies:[],queued:true,queue:queueInfo(p.id,c.id)};
    const pending=q.pending.slice();
    const simulatedAt=retryOpts.recovery?recoverReplyTime(p.id,c.id,pending,scheduledDueAt,retryOpts.recovery,ts):0;
    q.scheduledDueAt=scheduledDueAt;
    q.paused=false;
    q.userPaused=false;
    q.blocked=false;
    const generation=(q.revision||0)+1;
    q.revision=generation;
    const token=uid();
    const taskId=ts?.id||('task_'+uid());
    const retryOfTaskId=retryOpts.retryOfTaskId||(ts?.id||'');
    const attempt=(Number(ts?.attempt)||0)+1;
    q.pending=[];q.dueAt=0;q.status='inflight';q.inflight=token;
    const abortCtrl=typeof AbortController!=='undefined'?new AbortController():null;
    if(abortCtrl)inflightControllers.set(tKey,abortCtrl);
    db.taskStates ||= {};
    db.taskStates[tKey]={
      id:taskId,
      retry_of_task_id:retryOfTaskId,
      profile_id:p.id,
      character_id:c.id,
      character_name:c.name,
      mode:'chat',
      task_type:'chat_flush',
      task_label:TASK_LABELS.chat_flush,
      status:'inflight',
      attempt,
      pending_ids:pending.slice(),
      scheduled_due_at:scheduledDueAt,
      simulated_at:simulatedAt||0,
      inflight_token:token,
      revision:generation,
      last_error:null,
      updated_at:stamp()
    };
    save();
    const r=relation(p.id,c.id);let txt,engine='demo',warning='',apiError=null;
    const msgs=prompt(p,c,'chat',pending,{entry_point:'chat_flush',simulatedAt});
    if(curMode==='live'){
      try{
        txt=await llm(msgs,{
          profile:p,
          character:c,
          mode:'chat',
          entry_point:'chat_flush',
          task_id:taskId,
          retry_of_task_id:retryOfTaskId,
          attempt,
          simulatedAt,
          background:Boolean(retryOpts.background),
          signal:abortCtrl?.signal
        });
        txt=await verifyGeneratedMeetingDetail(p,c,msgs,txt,{
          profile:p,character:c,simulatedAt,
          task_id:taskId,retry_of_task_id:retryOfTaskId,attempt,
          background:Boolean(retryOpts.background),signal:abortCtrl?.signal
        });
        engine='live';
      }catch(e){
        warning=String(e.message||e);
        apiError=e.apiError||null;
        engine='error';
      }
    }else txt=demo(p,c,'chat');
    inflightControllers.delete(tKey);
    if(q.inflight!==token||q.revision!==generation||r?.mode!=='chat'||r?.status!=='matched'){
      if(r?.mode==='chat'&&r?.status==='matched'&&q.status==='paused'){
        const newer=q.pending.slice();
        q.pending=[...pending.filter(m=>!newer.includes(m)),...newer];
        if(db.taskStates[tKey])db.taskStates[tKey].pending_ids=q.pending.slice();
        save();
      }
      return {reply:null,replies:[],discarded:true,queue:queueInfo(p.id,c.id)};
    }
    q.inflight='';
    let reply=null,replies=[];
    if(engine==='error'){
      const newer=q.pending.slice();
      q.pending=[...pending.filter(m=>!newer.includes(m)),...newer];
      q.scheduledDueAt=scheduledDueAt;
      if(!newer.length)q.dueAt=0;
      q.blocked=true;
      q.paused=true;
      q.status='paused';
      db.taskStates[tKey]={
        ...(db.taskStates[tKey]||{}),
        id:taskId,
        profile_id:p.id,
        character_id:c.id,
        character_name:c.name,
        mode:'chat',
        task_type:'chat_flush',
        task_label:TASK_LABELS.chat_flush,
        status:'paused',
        attempt,
        pending_ids:q.pending.slice(),
        scheduled_due_at:scheduledDueAt,
        simulated_at:simulatedAt||0,
        inflight_token:'',
        last_error:apiError||{
          error_code:'API_ERROR',
          http_status:0,
          title:'手机聊天回复生成失败',
          message:warning||'模型请求失败',
          character_id:c.id,
          character_name:c.name,
          task_type:'chat_flush',
          task_label:TASK_LABELS.chat_flush
        },
        updated_at:stamp()
      };
      save();
      return {reply:null,replies:[],queued:true,paused:true,warning,apiError:db.taskStates[tKey].last_error,taskState:db.taskStates[tKey],queue:queueInfo(p.id,c.id)};
    }else{
      q.status='idle';
      q.paused=false;
      q.blocked=false;
      q.scheduledDueAt=0;
      clearTaskState(p.id,c.id,'chat');
      clearBgError(p.id,c.id,'chat_flush_bg');
      const bubbleTexts=splitChatBubbles(txt);
      replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,engine,simulatedAt));
      reply=replies[replies.length-1]||null;
      const combinedTxt=replies.map(m=>m.text).join(' / ');
      event(p.id,c.id,'ai_message',c.name+' 回应 '+p.name+'：'+combinedTxt.slice(0,180),simulatedAt);
      const userRows=pending.map(mid=>db.messages.find(m=>m.id===mid)).filter(Boolean);
      if(reply){
        recordDialogueEpisode(p,c,userRows,{...reply,text:combinedTxt},'chat');
        syncSurveillanceFromChat(p,c,userRows,combinedTxt,simulatedAt||Date.now());
      }
      if(r)r.updated_at=stamp();
      save();
      return {reply,replies,queued:false,warning:'',apiError:null,queue:queueInfo(p.id,c.id)};
    }
  }
  // Use authoritative dueAt only. Do not backdate beyond newer interactions.
  function recoverReplyTime(pid,cid,pending,due,recovery,task){
    const end=Number(recovery.openedAt),start=Number(recovery.offlineSince||0);
    const prior=Number(task?.simulated_at||0),candidate=prior||Number(due||0);
    if(!Number.isFinite(candidate)||candidate<=0||candidate>end||(!prior&&candidate<start))return 0;
    const rows=messagesOf(pid,cid).filter(m=>!isChatArtifact(m));
    if(pending.some(id=>!rows.some(m=>m.id===id)))return 0;
    if(rows.some(m=>!Number.isFinite(Date.parse(m.created_at))||Date.parse(m.created_at)>candidate))return 0;
    if(db.events.some(e=>e.profile_id===pid&&e.character_id===cid&&['matched','unmatched','meeting','return'].includes(e.type)&&Date.parse(e.created_at)>candidate))return 0;
    return candidate;
  }
  let recoveryRunning=null;
  const recoveredSessions=new Set();
  async function runQueueBatch(jobs,activePid,activeCid,recovery=null,concurrency=2){
    let next=0;const flushed=[];
    async function worker(){
      while(next<jobs.length){
        const {p,c,force}=jobs[next++];
        const isBackground=p.id!==activePid||!activeCid||activeCid!==c.id;
        try{
          const res=await flushQueue(p,c,Boolean(force),{recovery,background:isBackground});
          if(res.apiError&&isBackground)recordBgError(p.id,c.id,'chat_flush_bg',res.apiError);
          if(res.reply||res.warning||res.apiError)flushed.push({profileId:p.id,characterId:c.id,characterName:c.name,reply:res.reply,warning:res.warning||'',apiError:res.apiError||null,taskState:res.taskState||null,background:isBackground});
        }catch(e){flushed.push({profileId:p.id,characterId:c.id,characterName:c.name,warning:String(e.message||e),background:isBackground});}
      }
    }
    await Promise.all(Array.from({length:Math.min(concurrency,jobs.length)},()=>worker()));
    return {flushed};
  }
  async function recoverDueQueues(data){
    if(recoveryRunning)return recoveryRunning;
    if(pub().mode==='normal')return {flushed:[]};
    const openedAt=Math.min(Date.now(),Number(data.openedAt)||Date.now());
    const offlineSince=Math.max(0,Math.min(openedAt,Number(data.offlineSince)||0));
    const session=String(data.session||''),manual=data.manual===true;
    if(!manual&&(!session||recoveredSessions.has(session)))return {flushed:[]};
    if(!manual){recoveredSessions.add(session);if(recoveredSessions.size>32)recoveredSessions.delete(recoveredSessions.values().next().value);}
    const jobs=[];
    for(const p of db.profiles){
      if(manual&&p.id!==data.profileId)continue;
      for(const [k,q] of Object.entries(db.queue)){
        if(!k.startsWith(p.id+'|'))continue;
        const cid=k.slice(p.id.length+1),c=byId.get(cid),r=relation(p.id,cid),ts=getTaskState(p.id,cid,'chat');
        if(!c||r?.status!=='matched'||r.mode!=='chat'||!q?.pending?.length||q.status==='inflight'||ts?.status==='inflight'||q.userPaused||ts?.userPaused)continue;
        const failed=Boolean(q.paused||q.blocked||ts?.status==='paused');
        const recoverable=Boolean(ts?.interrupted||ts?.last_error);
        const due=Number(q.dueAt||q.scheduledDueAt||ts?.scheduled_due_at||0);
        if(failed&&!recoverable)continue;
        if(manual&&!failed)continue;
        if(due>openedAt||(!failed&&!due))continue;
        jobs.push({p,c,force:failed,due});
      }
    }
    jobs.sort((x,y)=>x.due-y.due||x.c.id.localeCompare(y.c.id));
    recoveryRunning=runQueueBatch(jobs,String(data.profileId||''),String(data.activeCharacterId||''),manual?null:{openedAt,offlineSince});
    try{return await recoveryRunning;}finally{recoveryRunning=null;}
  }
  async function flushDueQueues(p,activeCid=''){
    if(recoveryRunning)return {flushed:[]};
    const now=Date.now(),jobs=[];
    for(const [k,q] of Object.entries(db.queue)){
      if(!k.startsWith(p.id+'|'))continue;
      const cid=k.slice(p.id.length+1),ts=getTaskState(p.id,cid,'chat');
      if(!q||!q.pending?.length||q.status==='inflight'||q.paused||ts?.status==='paused'||q.blocked||!q.dueAt||q.dueAt>now)continue;
      const c=byId.get(cid),r=relation(p.id,cid);
      if(!c||!r||r.status!=='matched'||r.mode!=='chat')continue;
      jobs.push({p,c,force:false});
    }
    return runQueueBatch(jobs,p.id,activeCid,null,1);
  }
  const char=(c,pid='')=>{
    const rel=pid?relation(pid,c.id):null;
    const nick=String(rel?.nickname||'').trim();
    return {...c,nickname:nick,display_name:nick||c.name,portrait:db.portraits[c.id]||null,bio:db.bios[c.id]||c.bio,tags:(Array.isArray(db.bioTags?.[c.id])&&db.bioTags[c.id].length)?db.bioTags[c.id]:c.tags};
  };
