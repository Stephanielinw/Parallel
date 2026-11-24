  const discoveryText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
  const discoveryTags=value=>Array.isArray(value)?[...new Set(value.filter(v=>typeof v==='string').map(v=>v.trim().slice(0,12)).filter(Boolean))].slice(0,3):[];
  function findKnownIdentity(c){
    const names=new Set([c.name,...(c.aliases||[])].map(identityNorm).filter(Boolean));
    const src=identityNorm(c.source),ver=identityNorm(c.version);
    return Array.from(byId.values()).find(x=>identityKey(x)===identityKey(c)||
      ([x.name,...(x.aliases||[])].some(n=>names.has(identityNorm(n)))&&identityNorm(x.source)===src&&identityNorm(x.version)===ver));
  }
  function parseDiscoveryRow(row,p,eligibleIds){
    const bio=discoveryText(row?.bio,160),photo=discoveryText(row?.photo_description,600),tags=discoveryTags(row?.tags);
    if(bio.length<6||photo.length<15||tags.length<2)return null;
    if(row.id&&byId.has(row.id)){
      const c=byId.get(row.id);
      return eligibleIds.has(c.id)&&eligibleCandidate(p,c)?{c,bio,photo,tags,isNew:false}:null;
    }
    // New entries must be actual named, adult canon characters. AI suggestions
    // are not independently verified, and never replace existing canon facts.
    const c={name:discoveryText(row.name,100),source:discoveryText(row.source,100),version:discoveryText(row.version,120),canon:discoveryText(row.canon,600),age:Number(row.age),gender:row.gender,aliases:Array.isArray(row.aliases)?row.aliases.filter(v=>typeof v==='string').map(v=>v.trim().slice(0,80)).filter(Boolean).slice(0,6):[],accent:'#857b89',bio,tags,identity_origin:'ai-discovered'};
    if(!c.name||!c.source||!c.version||c.canon.length<12||!Number.isInteger(c.age)||c.age<18||c.age>120||!['male','female','nonbinary','other'].includes(c.gender))return null;
    const known=findKnownIdentity(c);
    if(known)return eligibleIds.has(known.id)&&eligibleCandidate(p,known)?{c:known,bio,photo,tags,isNew:false}:null;
    // Refuse ambiguous same-name versions: require an explicitly different
    // dated work/era instead of accepting spelling variations as new people.
    const names=new Set([c.name,...c.aliases].map(identityNorm));
    const ambiguous=Array.from(byId.values()).some(x=>{
      if(![x.name,...(x.aliases||[])].some(n=>names.has(identityNorm(n))))return false;
      const sameWork=identityNorm(x.source)===identityNorm(c.source)||sourceMatches(x.source,c)||sourceMatches(c.source,x);
      if(!sameWork)return false;
      const oldYears=[...String(x.version).matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>m[0]);
      const newYears=[...c.version.matchAll(/\b(?:19|20)\d{2}\b/g)].map(m=>m[0]);
      return !oldYears.length||!newYears.length||oldYears.some(y=>newYears.includes(y));
    });
    if(ambiguous)return null;
    c.id='discovered:'+encodeURIComponent(identityKey(c));
    if(!eligibleCandidate(p,c))return null;
    return {c,bio,photo,tags,isNew:true};
  }
  // Do not make ten independently long portrait records one all-or-nothing
  // structured completion. Puppy and other OpenAI-style proxies occasionally
  // reply with HTTP 200 + finish_reason=stop but only the tail of invalid prose.
  // Small, separately validated batches preserve successful new identities.
  const discoverySessionFilter=p=>JSON.stringify([p.id,p.sources||[],p.interested_in||[],p.min_age,p.max_age,p.role_character_id||'']);
  // A swipe can create a match, but matching must not invalidate the saved batch.
  const validSavedCard=(p,c)=>c&&(!p.sources.length||p.sources.some(tag=>sourceMatches(tag,c)))&&
    p.role_character_id!==c.id&&(!p.interested_in.length||p.interested_in.includes('all')||p.interested_in.includes(c.gender))&&
    (!c.age||c.age>=p.min_age&&c.age<=p.max_age);
  const readDiscoverySession=p=>{
    const session=db.discoverSessions[p.id];
    if(!session||session.version!==1||session.filter_key!==discoverySessionFilter(p)||
      typeof session.batch_id!=='string'||!session.batch_id||
      !Array.isArray(session.ids)||!session.ids.length||session.ids.length>10||
      !Number.isInteger(session.index)||session.index<0||session.index>session.ids.length)return null;
    if(new Set(session.ids).size!==session.ids.length)return null;
    if(!session.ids.every(id=>typeof id==='string'&&validSavedCard(p,byId.get(id))))return null;
    return session;
  };
  const discoverySessionCards=(p,session)=>session.ids.map(id=>byId.get(id)).map(c=>({
    ...char(c),photo_description:db.photoDescriptions[c.id]?.description||'',
    photo_engine:db.photoDescriptions[c.id]?.engine||'',
    previous_swipe:db.swipes[pairKey(p.id,c.id)]?.direction||null,
    relation_status:relation(p.id,c.id)?.status||null
  }));
  const discoverySessionResponse=(p,session,extra={})=>({
    candidates:discoverySessionCards(p,session),index:session.index,batch_id:session.batch_id,
    total_available:Number(session.total_available)||candidates(p).length,requested:10,
    new_count:0,batch_failures:0,generation:'saved-deck',apiError:null,
    warning:'',demo:pub().mode==='demo',resumed:true,...extra
  });
  const createDiscoverySession=(p,ids,total)=>{
    const session={version:1,batch_id:uid(),filter_key:discoverySessionFilter(p),
      ids:ids.slice(0,10),index:0,total_available:total,created_at:stamp()};
    db.discoverSessions[p.id]=session;
    save();
    return session;
  };
  async function generateDiscovery(p,pool,forceRefresh=false,excludedIds=[]){
    const seen=new Set(db.discoverSeen[p.id]||[]),excluded=new Set(excludedIds);
    const eligible=pool.filter(c=>!excluded.has(c.id));
    const ordered=[...shuffle(eligible.filter(c=>!seen.has(c.id))),...shuffle(eligible.filter(c=>seen.has(c.id)))];
    if(pub().mode!=='live')return {selected:ordered.slice(0,10),generation:'catalog-demo',apiError:null,new_count:0,batch_failures:0};
    const knownIdentities=Array.from(byId.values())
      .filter(c=>!p.sources.length||p.sources.some(tag=>sourceMatches(tag,c)))
      .slice(0,90).map(c=>[c.name,c.source,c.version].join(' @ ')).join('；');
    const candidatesWithIdentity=ordered.slice(0,6);
    const shared='你负责同人约会软件的候选人物档案。仅使用真实存在的原作人物，不创作OC、不胡编作品或年龄，电影版和游戏版分开。人物属于用户选定的作品，符合其性别及年龄筛选。人物年龄若无法确认符合范围就跳过，宁可少人。每人写一条自然的中文约会简介 bio、两个或三个 tags，并写60-100字 photo_description：一张符合人物年代与外貌、服装、神情、镜头和环境的具体个人照片。只输出完整 JSON：{"profiles":[...]}，绝不写分析、草稿、字数检查或 Markdown。';
    const common={sources:p.sources,gender:p.interested_in,min_age:p.min_age,max_age:p.max_age};
    const knownRows=arr=>arr.map(c=>({id:c.id,name:c.name,source:c.source,version:c.version,canon:c.canon}));
    const jobs=[
      {kind:'new',index:0,limit:2,unformatted:true,
        body:{...common,kind:'new',requested:2,focus:'主要人物、重要配角、朋友或队友，优先之前未收录的男性角色',already_in_catalog:knownIdentities,format:'仅填 name,aliases,source,version,age,gender,canon,bio,tags,photo_description；source 尽量采用同系列的中文作品名'}},
      {kind:'new',index:1,limit:2,unformatted:false,
        body:{...common,kind:'new',requested:2,focus:'原作中真实存在但尚未收录的次要人物或不同作品时期，避免和上一批完全相同的人选',already_in_catalog:knownIdentities,format:'仅填 name,aliases,source,version,age,gender,canon,bio,tags,photo_description；source 尽量采用同系列的中文作品名'}},
      {kind:'known',index:2,limit:3,unformatted:true,ids:candidatesWithIdentity.slice(0,3).map(c=>c.id),
        body:{kind:'known',requested:3,people:knownRows(candidatesWithIdentity.slice(0,3)),format:'只为输入的 exact id 补齐 bio,tags,photo_description；不要添加其他人物或更改身份'}},
      {kind:'known',index:3,limit:3,unformatted:false,ids:candidatesWithIdentity.slice(3,6).map(c=>c.id),
        body:{kind:'known',requested:3,people:knownRows(candidatesWithIdentity.slice(3,6)),format:'只为输入的 exact id 补齐 bio,tags,photo_description；不要添加其他人物或更改身份'}}
    ].filter(job=>job.kind!=='known'||job.ids.length);
    const results=new Array(jobs.length);
    let cursor=0;
    const worker=async()=>{
      while(cursor<jobs.length){
        const i=cursor++,job=jobs[i];
        try{
          const out=await llm([
            {role:'system',content:shared+(job.kind==='new'?' 请推荐尚未收录的全新人物，不要用当前目录人物换名字充数。':' 只能填提供的已收录人物资料，不得更改原作设定。')},
            {role:'user',content:JSON.stringify(job.body)}
          ],{json_mode:true,omit_response_format:job.unformatted,mode:'bio',entry_point:'discover_bios',background:!forceRefresh,temperature:0.35});
          const parsed=JSON.parse(out);
          if(!parsed||!Array.isArray(parsed.profiles)||!parsed.profiles.length)throw Error('这一批没有返回任何完整的候选人物 JSON');
          results[i]={rows:parsed.profiles.slice(0,job.limit),job};
        }catch(error){results[i]={error,job};}
      }
    };
    // Two in flight at most; a proxy hiccup must not cancel other batches.
    await Promise.all([worker(),worker()]);
    const allowed=new Set(eligible.map(c=>c.id)),batchIds=new Set(),batchKeys=new Set(),selected=[],failed=[];
    let new_count=0,generated_count=0;
    for(const result of results){
      if(selected.length>=10)break;
      if(result.error){failed.push(result.error);continue;}
      let accepted=0;
      for(const row of result.rows){
        if(result.job.kind==='known'&&(!row?.id||!result.job.ids.includes(row.id)))continue;
        if(result.job.kind==='new'&&row?.id)continue;
        const item=parseDiscoveryRow(row,p,allowed);
        if(!item)continue;
        const {c,bio,photo,tags,isNew}=item;
        if(result.job.kind==='new'&&!isNew)continue;
        if(batchIds.has(c.id)||batchKeys.has(identityKey(c)))continue;
        batchIds.add(c.id);batchKeys.add(identityKey(c));
        if(isNew){db.discoveredCharacters[c.id]=c;byId.set(c.id,c);allowed.add(c.id);new_count++;}
        db.bios[c.id]=bio;db.bioTags[c.id]=tags;db.photoDescriptions[c.id]={description:photo,engine:'live-text'};
        selected.push(c);accepted++;generated_count++;if(selected.length>=10)break;
      }
      if(!accepted)failed.push(new Error('这一批人物不符合原作身份、年龄、性别或照片完整性校验'));
    }
    // Existing completed model-generated portraits are a safe fallback:
    // never substitute the same static photo template while claiming AI success.
    for(const c of ordered){
      if(selected.length>=10)break;
      if(batchIds.has(c.id)||!db.photoDescriptions[c.id]?.description||db.photoDescriptions[c.id]?.engine!=='live-text'||!db.bios[c.id])continue;
      batchIds.add(c.id);selected.push(c);
    }
    if(!selected.length){
      const first=failed.find(e=>e?.apiError)?.apiError;
      if(!forceRefresh)recordBgError('_','_','discover_bios',first||{message:String(failed[0]?.message||'所有分批均未返回有效人物 JSON')});
      return {selected:[],generation:'failed',apiError:first||createApiError({error_code:'DISCOVERY_BATCHES_FAILED',title:'角色档案生成失败',message:'四个独立小批次均未生成有效档案。可能是模型或反代返回了损坏的 JSON；原始回复已留在生成日志中。'}),new_count:0,batch_failures:failed.length,warning:'未生成新档案；原有角色和照片未被覆盖'};
    }
    selected.sort((x,y)=>Number(seen.has(x.id))-Number(seen.has(y.id)));
    db.discoverSeen[p.id]=[...new Set([...seen,...selected.map(c=>c.id)])].slice(-1000);
    save();
    // Individual provider errors remain visible in System Logs without raising
    // a blocking background-error banner when some cards are actually usable.
    clearBgError('_','_','discover_bios');
    return {selected,generation:generated_count?'live-generated':'cached-ai-bios',new_count,apiError:null,batch_failures:failed.length,warning:failed.length?'有 '+failed.length+' 个分批未成功；已保留其他成功生成的档案，未写入损坏内容。':''};
  }
  const demo=(p,c,mode)=>{
    const allMsgs=messagesOf(p.id,c.id);
    const past=allMsgs.length;
    if(mode==='meeting'){
      const r=relation(p.id,c.id);
      const loc=inferMeetingLocation(p.id,c.id,r?.meeting_location||'');
      const meetCount=allMsgs.filter(m=>m.mode==='meeting'&&(!r?.active_meeting_id||m.meeting_id===r.active_meeting_id)).length;
      if(meetCount<=1){
        return `${loc}里有人来人往，灯光在桌沿与玻璃上留下一层微光。${c.name}正待在入口附近，手边放着手机，偶尔查看屏幕，又把注意力转回周围。\n\n${c.name}随手调整了身旁的物件，继续做着眼前的事，像是在等一个约好的人，却没有因此停下自己的生活。门口仍有人进出，尚未发生任何招呼或接触。`;
      }
      const scenes=[
        `${c.name}安静地听完你的话，视线在你脸上停留了片刻，指尖轻轻碰了碰桌沿，眼底浮现出一丝温和的笑意。\n\n“原来你是这么想的。在手机里聊的时候我还不太确定，现在当面听你说，感觉完全不一样。”\n\n微风拂过${loc}的一角，${c.name}微微倾身靠近了些，示意你继续往下说。`,
        `${c.name}垂下眼眸思索了两秒，随后抬眼望向你，语气比平时在消息里更加坦诚低缓：\n\n“这种事我平时很少跟别人提。不过既然今天和你在这里见面……我觉得告诉你也没关系。”`,
        `四周的光影安静地流动着。${c.name}替你整理了一下手边的东西，紧绷的肩线彻底放松下来：\n\n“今天能出来见你一面，真的很不错。接下来你还想去哪里走走吗？”`
      ];
      return scenes[meetCount%scenes.length];
    }
    return past<3?'嗯，我在。|||你想先从什么聊起？':['这点倒是挺有意思。|||不过……你为什么会突然这么想？','等一下。|||我刚忙完手头的事，现在空下来了。|||你刚刚说的那个，我其实一直记得。','我可能需要想一想再回答你。','真的？|||你有时候真的会让我意外。|||那下次见面的时候，当面跟我细说吧。'][past%4];
  };
  async function produceReply(p,c,mode,userMsg=null,entryPoint='',retryOpts={}){
    if(mode==='meeting'&&meetingRerolls.has(pairKey(p.id,c.id)))return {reply:null,replies:[],warning:'正在重 Roll 当前一幕，请等待本次结果。'};
    const curMode=pub().mode;
    if(curMode==='normal'){
      return {reply:null,replies:[],warning:'当前处于正常模式且尚未连接 API，请先在「终端」配置 API 后再试。'};
    }
    const tKey=taskKeyOf(p.id,c.id,mode);
    const existingTs=getTaskState(p.id,c.id,mode);
    if(existingTs&&existingTs.status==='inflight'){
      return {reply:null,replies:[],inflight:true,deduplicated:true,taskState:existingTs};
    }
    const r=relation(p.id,c.id);
    const activeMid=mode==='meeting'?(r?.active_meeting_id||''):'';
    const ep=entryPoint||(mode==='meeting'?(userMsg?'meeting_message':'meeting_continue'):(userMsg?'chat_message':'chat_continue'));
    const taskId=existingTs?.id||('task_'+uid());
    const retryOfTaskId=retryOpts.retryOfTaskId||(existingTs?.id||'');
    const attempt=(Number(existingTs?.attempt)||0)+1;
    const generation=(Number(existingTs?.revision)||0)+1;
    const token=uid();
    const pendingIds=userMsg?[userMsg.id]:(existingTs?.pending_ids||[]);
    const abortCtrl=typeof AbortController!=='undefined'?new AbortController():null;
    if(abortCtrl)inflightControllers.set(tKey,abortCtrl);
    db.taskStates ||= {};
    db.taskStates[tKey]={
      id:taskId,
      retry_of_task_id:retryOfTaskId,
      profile_id:p.id,
      character_id:c.id,
      character_name:c.name,
      mode,
      meeting_id:activeMid,
      task_type:ep,
      task_label:TASK_LABELS[ep]||TASK_LABELS[mode]||'模型生成',
      status:'inflight',
      attempt,
      pending_ids:pendingIds,
      latest_text:userMsg?.text||(existingTs?.latest_text||''),
      inflight_token:token,
      revision:generation,
      last_error:null,
      updated_at:stamp()
    };
    save();
    let engine='demo',warning='',txt='',apiError=null,sceneTurn=null,sceneLocation=null;
    if(curMode==='live'){
      try{
        const compiled=prompt(p,c,mode,[],{entry_point:ep,latestText:userMsg?.text||(existingTs?.latest_text||'')});
        txt=await llm(compiled,{
          profile:p,
          character:c,
          mode,
          entry_point:ep,
          task_id:taskId,
          retry_of_task_id:retryOfTaskId,
          attempt,
          signal:abortCtrl?.signal,
          ...(mode==='meeting'?{json_mode:true,omit_response_format:true,skip_json_gateway:true}: {})
        });
        if(mode==='chat')txt=await verifyGeneratedMeetingDetail(p,c,compiled,txt,{
          profile:p,character:c,task_id:taskId,
          retry_of_task_id:retryOfTaskId,attempt,signal:abortCtrl?.signal
        });
        if(mode==='meeting'){
          const known=activeMeetingLocationHistory(p,c).at(-1)?.location||
            r?.meeting_location||'约定的见面地点';
          sceneTurn=parseMeetingSceneTurn(txt,known);
          txt=sceneTurn.text;
          sceneLocation=resolveMeetingSceneTurnLocation(p,c,sceneTurn,known,userMsg);
          // Compatibility for older providers that ignore structured hints.
          // Never let their raw text / a guessed schedule set the scene.
          if(!sceneTurn.structured&&sceneLocation.location===known){
            const actual=await classifyMeetingMovement(p,c,txt,known,{signal:abortCtrl?.signal});
            if(actual?.location)sceneLocation=actual;
          }
        }
        engine='live';
      }catch(e){
        warning=String(e.message||e);
        apiError=e.apiError||null;
        engine='error';
      }
    }else txt=demo(p,c,mode);
    if(mode==='meeting'&&engine==='demo'&&txt){
      const known=activeMeetingLocationHistory(p,c).at(-1)?.location||r?.meeting_location||'约定的见面地点';
      sceneTurn=parseMeetingSceneTurn(txt,known);
      txt=sceneTurn.text;
      sceneLocation=resolveMeetingSceneTurnLocation(p,c,sceneTurn,known,userMsg);
    }
    inflightControllers.delete(tKey);
    const curRel=relation(p.id,c.id);
    const curTs=getTaskState(p.id,c.id,mode);
    if(!curTs||curTs.inflight_token!==token||curTs.revision!==generation||curRel?.status!=='matched'||curRel?.mode!==mode||(mode==='meeting'&&activeMid&&curRel?.active_meeting_id!==activeMid)){
      return {reply:null,replies:[],discarded:true,taskState:getTaskState(p.id,c.id,mode)};
    }
    if(engine==='error'){
      db.taskStates[tKey]={
        ...curTs,
        status:'paused',
        inflight_token:'',
        last_error:apiError||createApiError({
          error_code:'API_ERROR',
          http_status:0,
          title:`${TASK_LABELS[ep]||'模型生成'}失败`,
          message:warning||'请求失败',
          character_id:c.id,
          character_name:c.name,
          profile_id:p.id,
          task_type:ep,
          task_label:TASK_LABELS[ep]
        }),
        updated_at:stamp()
      };
      if(mode==='chat'){
        const q=db.queue[pairKey(p.id,c.id)]||(db.queue[pairKey(p.id,c.id)]={pending:[],dueAt:0,status:'paused',blocked:true,paused:true,revision:generation,inflight:''});
        for(const pid of pendingIds)if(pid&&!q.pending.includes(pid))q.pending.push(pid);
        q.paused=true;q.blocked=true;q.status='paused';q.dueAt=0;
      }
      save();
      return {reply:null,replies:[],paused:true,warning,apiError:db.taskStates[tKey].last_error,taskState:db.taskStates[tKey]};
    }
    clearTaskState(p.id,c.id,mode);
    const bubbleTexts=mode==='chat'?splitChatBubbles(txt):[cleanMeetingNovelText(txt)];
    const replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai',mode,bTxt,engine));
    const reply=replies[replies.length-1]||null;
    if(reply&&mode==='meeting'){
      // Every successful turn carries an explicit scene position, even if the
      // character stayed put. The prose and label are stored separately.
      reply.scene_location=sceneLocation?.location||
        activeMeetingLocationHistory(p,c).at(-1)?.location||r.meeting_location;
      reply.scene_location_evidence=sceneLocation?.evidence||'';
      reply.scene_location_kind=sceneLocation?.kind||'stable';
      reply.scene_location_signature=meetingSceneSignature(reply.text);
      reply.scene_location_structured=Boolean(sceneTurn?.structured);
      const history=activeMeetingLocationHistory(p,c);
      const rec=getOrInitSurveillance(p,c,localDateStr(reply.created_at));
      if(rec.live_override&&rec.live_override.meeting_id===activeMid){
        rec.live_override.location=history.at(-1)?.location||rec.live_override.location;
        rec.updated_at=stamp();
      }
    }
    if(reply){
      const combinedTxt=replies.map(m=>m.text).join(' / ');
      event(p.id,c.id,'ai_message',c.name+' 回应 '+p.name+'：'+combinedTxt.slice(0,180));
      if(mode==='meeting')db.events.at(-1).message_id=reply.id;
      const uList=userMsg?[userMsg]:messagesOf(p.id,c.id).filter(m=>m.sender==='user').slice(-1);
      recordDialogueEpisode(p,c,uList,{...reply,text:combinedTxt},mode);
      if(mode==='chat')syncSurveillanceFromChat(p,c,uList,combinedTxt);
    }
    save();
    if(mode==='meeting'&&reply&&activeMid){
      try{await ensureMeetingSceneSummaries(p,c,activeMid);}
      catch(err){recordBgError(p.id,c.id,'meeting_scene_checkpoint',err.apiError||{message:String(err.message||err)});}
    }
    return {reply,replies,warning:'',apiError:null};
  }
  async function matchDecision(p,c,attempt){
    if(pub().mode==='live'){
      try{
        const interestsStr=(p.interests||[]).join('、')||'未填写',intentStr=p.intent||'未填写';
        const text=await llm([
          {role:'system',content:`你是 ${c.name}（${c.source} ${c.version}）。原作身份：${c.canon}。对方 ${p.name}，${p.age}岁，交友目的：${intentStr}，兴趣爱好：${interestsStr}，简介 ${p.bio}。你有自己的择偶标准，可自由决定是否右滑同意匹配。只输出 JSON 对象 {"match":true/false}。`},
          {role:'user',content:'你是否想匹配？'}
        ],{json_mode:true,skip_json_gateway:true,profile:p,character:c,mode:'match',entry_point:'match_decision'});
        return {matched:!!JSON.parse(text).match,engine:'live'};
      }catch(e){/* fallback for match decision boolean */}
    }
    let h=Math.imul(attempt,2654435761)|0;for(const ch of p.id+c.id+String(attempt))h=(Math.imul(31,h)+ch.charCodeAt(0))|0;
    return {matched:attempt>=4||((h>>>0)%100<72),engine:pub().mode==='live'?'live':'demo'};
  }
  async function firstMessage(p,c,again,retryOpts={}){
    const curMode=pub().mode;
    if(curMode==='normal'){
      return {bubbles:[],engine:'normal-pending'};
    }
    if(curMode==='live'){
      const tKey=taskKeyOf(p.id,c.id,'chat');
      const existingTs=getTaskState(p.id,c.id,'chat');
      const taskId=existingTs?.id||('task_'+uid());
      const retryOfTaskId=retryOpts.retryOfTaskId||(existingTs?.id||'');
      const attempt=(Number(existingTs?.attempt)||0)+1;
      try{
        const ms=prompt(p,c,'chat',[],{entry_point:'chat_first_message'});
        ms.push({role:'user',content:again?`【系统事件：重逢匹配】你刚刚和 ${p.name} 重新匹配上了，你记得你们之前的经历。请根据你的性格与过往记忆，主动发 1～2 条有真实重逢感的手机开场消息（多条气泡之间用 ||| 分隔，绝不要用生硬套话）。`:`【系统事件：首次匹配】你刚刚在约会软件上与 ${p.name} 互相右滑匹配成功。请结合你的原作性格、所处境遇以及对方的公开资料（简介：${p.bio||'无'}；兴趣：${(p.interests||[]).join('、')||'无'}），主动给对方发 1～2 条自然、有个人特色的第一条手机消息（多条气泡之间用 ||| 分隔，绝对不要说“看来我们匹配上了”这种千篇一律的套话）。`});
        const raw=await llm(ms,{profile:p,character:c,mode:'chat',entry_point:'chat_first_message',task_id:taskId,retry_of_task_id:retryOfTaskId,attempt});
        clearTaskState(p.id,c.id,'chat');
        return {bubbles:splitChatBubbles(raw),engine:'live'};
      }catch(e){
        const apiError=e.apiError||createApiError({
          error_code:'API_ERROR',
          http_status:0,
          title:'首次匹配打招呼生成失败',
          message:String(e.message||e),
          character_id:c.id,
          character_name:c.name,
          profile_id:p.id,
          task_type:'chat_first_message',
          task_label:TASK_LABELS.chat_first_message
        });
        db.taskStates ||= {};
        db.taskStates[tKey]={
          id:taskId,
          retry_of_task_id:retryOfTaskId,
          profile_id:p.id,
          character_id:c.id,
          character_name:c.name,
          mode:'chat',
          task_type:'chat_first_message',
          task_label:TASK_LABELS.chat_first_message,
          again:Boolean(again),
          status:'paused',
          attempt,
          pending_ids:[],
          inflight_token:'',
          last_error:apiError,
          updated_at:stamp()
        };
        save();
        return {bubbles:[],engine:'error',warning:String(e.message||e),apiError,taskState:db.taskStates[tKey]};
      }
    }
    const demoTxt=again?`${p.name}，没想到这么快又刷到你了。|||又见面了……上次的事我没有忘。`:`Hey，${p.name}。|||看来我们匹配上了。`;
    return {bubbles:splitChatBubbles(demoTxt),engine:'demo'};
  }
  async function produceProactiveMessage(p,c,reason='idle',unresolvedMem=null,isBackground=true){
    const curMode=pub().mode;
    if(curMode==='normal')return {replies:[],skipped:'no-api'};
    const previousLast=messagesOf(p.id,c.id).at(-1)?.id||'';
    let engine='demo',txt='';
    if(curMode==='live'){
      try{
        const ms=prompt(p,c,'chat',[],{entry_point:'chat_proactive'});
        const memHint=unresolvedMem?`你翻看手机时，想起你们之前未聊完的话题或约定：「${unresolvedMem.summary}」。`:'你在自己的世界里刚忙完手头的事，或者偶然看到某样东西，突然想起了对方。';
        ms.push({role:'user',content:`【系统事件：角色主动发消息（${reason==='promise'?'记得约定与未完话题':'日常主动破冰'}）】当前手机本地时刻是 ${chatClockLabel(Date.now())}。距离你们上次联系已经过了一段时间，${p.name} 还没有发来新消息。${memHint}必须遵守当前钟点：凌晨绝不是上午或中午；不要推断对方已经醒来、已起床或睡到了中午。不要把旧约定当成已经发生的共同经历。请以完全符合 ${c.name} 原作性格与当前关系状态的方式，主动给 ${p.name} 发 1～2 条自然的手机消息（多条气泡用 ||| 分隔，不要写旁白，不要像客服问候）。`});
        txt=await llm(ms,{profile:p,character:c,mode:'chat',entry_point:'chat_proactive',background:isBackground});
        engine='live';
        clearBgError(p.id,c.id,'chat_proactive');
      }catch(e){
        if(isBackground)recordBgError(p.id,c.id,'chat_proactive',e.apiError||{message:String(e.message||e)});
        return {replies:[],warning:String(e.message||e),apiError:e.apiError||null,background:isBackground};
      }
    }else{
      if(unresolvedMem){
        txt=`对了，${p.name}。|||之前我们聊到的那件事，我刚才突然想起来了。|||你现在有空吗？`;
      }else{
        const pool=[
          `今天怎么这么安静？|||刚忙完手头的事，顺便看看你在不在。`,
          `${p.name}，刚才路过一个地方，突然想起你上次说的话。`,
          `还在忙？|||等你有空了跟我说一声。`
        ];
        const idx=(messagesOf(p.id,c.id).length+c.name.length)%pool.length;
        txt=pool[idx];
      }
      engine='demo';
    }
    // M10: the asynchronous model call can outlive a user reply, a switch
    // to meeting mode, or the start of quiet hours. Revalidate *before* write.
    const latestRows=messagesOf(p.id,c.id);
    if((latestRows.at(-1)?.id||'')!==previousLast)
      return {replies:[],skipped:'conversation-changed'};
    const currentRel=relation(p.id,c.id);
    if(!currentRel||currentRel.status!=='matched'||currentRel.mode!=='chat')
      return {replies:[],skipped:'relation-changed'};
    if(isBackground&&proactiveQuietReason(latestRows,Date.now()))
      return {replies:[],skipped:'quiet-hours'};
    if(proactiveTimeContradiction(txt,Date.now())){
      // Rate-limit a bad provider completion; do not commit its impossible
      // clock narrative as a message, memory or event.
      db.proactiveLog[pairKey(p.id,c.id)]=Date.now();
      save();
      return {replies:[],skipped:'temporal-contradiction'};
    }
    const bubbleTexts=splitChatBubbles(txt).slice(0,3);
    const replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,engine));
    const lastReply=replies[replies.length-1]||null;
    if(lastReply){
      const combinedTxt=replies.map(m=>m.text).join(' / ');
      event(p.id,c.id,'ai_proactive',c.name+' 主动联系 '+p.name+'：'+combinedTxt.slice(0,180));
      recordDialogueEpisode(p,c,[],{...lastReply,text:combinedTxt},'chat');
      if(unresolvedMem&& unresolvedMem.unresolved){
        const found=(db.episodicMemories||[]).find(m=>m.id===unresolvedMem.id);
        if(found)found.unresolved=0;
      }
      const r=relation(p.id,c.id);
      if(r)r.updated_at=stamp();
      db.proactiveLog[pairKey(p.id,c.id)]=Date.now();
      save();
    }
    return {replies,reply:lastReply,engine};
  }
  const requireMatch=(pid,cid)=>{const r=relation(pid,cid);if(!r||r.status!=='matched')bodyErr('当前没有匹配关系');return r};
  async function regenerateMeeting(p,c,r,messageId,location=''){
    const key=pairKey(p.id,c.id),mid=r.active_meeting_id||'';
    if(!mid)bodyErr('当前没有有效的见面会话');
    if(meetingRerolls.has(key)||getTaskState(p.id,c.id,'meeting')?.status==='inflight')bodyErr('当前一幕正在生成，请勿重复请求');
    if(getTaskState(p.id,c.id,'meeting')?.status==='paused')bodyErr('先处理当前暂停的生成任务，再重 Roll 上一幕');
    const rows=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===mid&&!m.recalled&&m.engine!=='recalled');
    const old=rows.at(-1);
    if(!old||old.sender!=='ai'||(messageId&&old.id!==messageId))bodyErr('只可重 Roll 当前见面的最后一段角色正文');
    if(pub().mode==='normal')bodyErr('未连接可用模型，原正文已保留');
    const before=episodeSignature(rows),oldAt=Date.parse(old.created_at),anchor=Number.isFinite(oldAt)?oldAt:Date.now();
    const controller=typeof AbortController==='function'?new AbortController():null;
    const roll={controller,token:uid()};meetingRerolls.set(key,roll);
    let timer,raw='',engine='demo';
    try{
      if(controller&&typeof setTimeout==='function')timer=setTimeout(()=>controller.abort(),120000);
      if(pub().mode==='live'){
        const ms=prompt(p,c,'meeting',[],{entry_point:'meeting_reroll',excludeMessageIds:[old.id],rerollAt:anchor});
        // Leave the user's original final turn and all preset roles in their original positions.
        raw=await llm(ms,{profile:p,character:c,mode:'meeting',entry_point:'meeting_reroll',
          task_id:'task_'+roll.token,signal:controller?.signal,reject_truncated:true,
          json_mode:true,omit_response_format:true,skip_json_gateway:true});
        engine='live';
      }else raw=demo(p,c,'meeting');
      const prev=activeMeetingLocationHistory(p,c).filter(e=>e.message_id!==old.id&&Date.parse(e.at)<=anchor).at(-1)?.location||
        r.meeting_location||'约定的见面地点';
      const turn=parseMeetingSceneTurn(raw,prev),body=turn.text;
      let sceneLoc=resolveMeetingSceneTurnLocation(p,c,turn,prev);
      if(!turn.structured&&sceneLoc.location===prev){
        const actual=await classifyMeetingMovement(p,c,body,prev,{signal:controller?.signal});
        if(actual?.location)sceneLoc=actual;
      }
      const live=relation(p.id,c.id),current=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===mid&&!m.recalled&&m.engine!=='recalled');
      if(meetingRerolls.get(key)!==roll||live?.status!=='matched'||live.mode!=='meeting'||live.active_meeting_id!==mid||episodeSignature(current)!==before||!archiveStoredCurrent()){
        return {ok:false,removedIds:[],replies:[],reply:null,warning:'见面状态或原文已变化，已丢弃迟到的重 Roll 结果。'};
      }
      // Atomic replacement: do not remove the old scene until a complete alternative
      // has arrived, passed checks, and the original source is still current.
      const snapshot=JSON.stringify(db),id=uid();
      try{
        const replacement={...old,id,text:body,engine,created_at:old.created_at,rerolled_at:stamp(),reroll_count:(Number(old.reroll_count)||0)+1,
          scene_location:sceneLoc?.location||prev,scene_location_evidence:sceneLoc?.evidence||'',
          scene_location_kind:sceneLoc?.kind||'stable',scene_location_signature:meetingSceneSignature(body),
          scene_location_structured:Boolean(turn.structured)};
        const index=db.messages.findIndex(m=>m.id===old.id&&m.profile_id===p.id&&m.character_id===c.id);
        if(index<0)throw Error('原文不存在');
        db.messages[index]=replacement;invalidateTranslation(old.id);
        pruneMeetingCheckpoints(p.id,c.id,mid);
        const invalid=new Set();
        for(const mem of db.episodicMemories){
          if(mem.profile_id!==p.id||mem.owner_id!==c.id)continue;
          if([...(mem.raw_msg_ids||[]),...(mem.meeting_data?.message_ids||[])].includes(old.id)){
            mem.archive_stale=true;invalid.add(mem.id);
          }
        }
        for(const mem of db.episodicMemories)if(mem.profile_id===p.id&&mem.owner_id===c.id&&invalid.has(mem.clarifies_id))mem.archive_stale=true;
        db.events=db.events.filter(e=>!(e.profile_id===p.id&&e.character_id===c.id&&e.type==='ai_message'&&(e.message_id===old.id||(!e.message_id&&e.summary===c.name+' 回应 '+p.name+'：'+old.text.slice(0,180)&&Math.abs(Date.parse(e.created_at)-anchor)<10000))));
        event(p.id,c.id,'ai_message',c.name+' 回应 '+p.name+'：'+body.slice(0,180),anchor);db.events.at(-1).message_id=id;
        const oldDiary=db.diaries[key]?.byDate?.[localDateStr(anchor)];if(oldDiary)oldDiary.stale_after_recovery=true;
        // Old cached UIs may send the original scene name on reroll; it is
        // not an actual physical move and must not overwrite current reality.
        activeMeetingLocationHistory(p,c);
        const updated=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===mid);
        upsertMeetingRecord(p,c,mid,updated,live.meeting_location||'');
        try{await ensureMeetingSceneSummaries(p,c,mid);}
        catch(err){recordBgError(p.id,c.id,'meeting_scene_checkpoint',err.apiError||{message:String(err.message||err)});}
        episodeList(p,c);live.updated_at=stamp();save();
        return {ok:true,removedIds:[old.id],replies:[replacement],reply:replacement,warning:'',apiError:null};
      }catch(error){db=JSON.parse(snapshot);throw error;}
    }catch(e){return {ok:false,removedIds:[],replies:[],reply:null,warning:'重 Roll 未完成，原正文已保留。'+String(e.message||e),apiError:e.apiError||null};}
    finally{if(timer&&typeof clearTimeout==='function')clearTimeout(timer);if(meetingRerolls.get(key)===roll)meetingRerolls.delete(key);}
  }
