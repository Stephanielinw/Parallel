  const beginCharacterFreeze=(p,c,r,at)=>{
    const plan=r.freeze_schedule;
    if(r.mode==='meeting'){
      const mid=r.active_meeting_id||'';
      const rows=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===mid);
      if(mid&&rows.length){
        const rec=upsertMeetingRecord(p,c,mid,rows,r.meeting_location||'','',at);
        if(rec)syncSurveillanceOnMeetingEnd(p,c,rec);
      }
      r.mode='chat';r.active_meeting_id='';r.meeting_started_at='';
    }
    r.frozen_at=at;r.freeze_departure=plan?.farewell_text||'';
    delete r.freeze_schedule;
    clearQueue(p.id,c.id);clearTaskStatesForPair(p.id,c.id);cancelPairModelCalls(p.id,c.id);
    const q=db.queue[pairKey(p.id,c.id)];if(q)q.userPaused=false;
    clearBgError(p.id,c.id);
    r.freeze_revision=Number(r.freeze_revision||0)+1;r.updated_at=at;
  };
  const applyScheduledFreezes=()=>{
    const changed=[];
    for(const rel of Object.values(db.relations)){
      if(rel.status!=='matched'||rel.frozen_at||!freezeDue(rel))continue;
      const p=db.profiles.find(x=>x.id===rel.profile_id),c=byId.get(rel.character_id);
      if(!p||!c)continue;
      beginCharacterFreeze(p,c,rel,rel.freeze_schedule.at);
      changed.push({profileId:p.id,characterId:c.id});
    }
    if(changed.length)save();
    return changed;
  };
  async function request(path,data){
    const [route,qs='']=path.split('?'), params=new URLSearchParams(qs);data=data||{};
    const transitioned=applyScheduledFreezes();
    const scopedPid=String(data.profileId||params.get('profileId')||''),scopedCid=String(data.characterId||params.get('characterId')||'');
    const frozenAllowed=new Set(['/thread','/task-state','/memories','/memory-action','/nickname','/unmatch','/character-freeze','/proactive-check','/chat-flush','/chat-photo-read']);
    if(scopedPid&&scopedCid&&characterFrozen(scopedPid,scopedCid)&&!frozenAllowed.has(route))bodyErr('角色休眠中，请先解除冻结');
    switch(route){
      case '/character-freeze-tick':{
        const p=getP(data.profileId);
        if(data.allowFarewell!==true||pub().mode==='normal'||proactiveQuietReason([],Date.now()))return {transitioned,sent:[]};
        const now=Date.now();
        const eligible=Object.values(db.relations).filter(rel=>{
          const plan=rel.freeze_schedule,due=Date.parse(plan?.at||'');
          const q=queueInfo(p.id,rel.character_id);
          return rel.profile_id===p.id&&rel.status==='matched'&&rel.mode==='chat'&&!rel.frozen_at&&plan?.farewell&&!plan.farewell_text&&!plan.attempted_at&&due>now&&due-now<=30*60000&&q.status!=='inflight'&&!q.count&&!q.paused&&!proactiveQuietReason(messagesOf(p.id,rel.character_id),now);
        }).sort((a,b)=>Date.parse(a.freeze_schedule.at)-Date.parse(b.freeze_schedule.at));
        const rel=eligible[0];if(!rel)return {transitioned,sent:[]};
        const c=getC(rel.character_id);rel.freeze_schedule.attempted_at=stamp();save();
        const result=await produceProactiveMessage(p,c,'freeze_farewell',null,true);
        return {transitioned:[...transitioned,...applyScheduledFreezes()],sent:result.replies?.length?[{characterId:c.id,characterName:c.name,replies:result.replies}]:[]};
      }
      case '/character-freeze':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id);
        const at=stamp(),key=pairKey(p.id,c.id);
        if(data.cancelSchedule===true){
          if(r.frozen_at)bodyErr('已到冻结时间，请解除冻结');
          delete r.freeze_schedule;save();return {ok:true,relation:r,character:char(c,p.id)};
        }
        if(data.startAt){
          if(r.frozen_at)bodyErr('角色已休眠，请先解除冻结');
          const ms=Date.parse(data.startAt);
          if(!Number.isFinite(ms)||ms<=Date.now()||ms%60000!==0)bodyErr('请选择未来的整分钟时间');
          r.freeze_schedule={id:uid(),at:new Date(ms).toISOString(),farewell:data.farewell===true,created_at:at};
          save();return {ok:true,relation:r,character:char(c,p.id)};
        }
        if(typeof data.frozen!=='boolean')bodyErr('冻结状态无效');
        if(Boolean(r.frozen_at)===data.frozen)return {ok:true,relation:r,character:char(c,p.id)};
        if(data.frozen)beginCharacterFreeze(p,c,r,at);
        else{
          const old=r.freeze_reconnect&&!r.freeze_reconnect.explanation?r.freeze_reconnect:null;
          r.freeze_reconnect={from:old?.from||r.frozen_at,to:at,explanation:'',farewell_text:r.freeze_departure||old?.farewell_text||''};
          r.frozen_at='';delete r.freeze_departure;
          db.proactiveLog[key]=Date.now();
          clearQueue(p.id,c.id);clearTaskStatesForPair(p.id,c.id);
          const q=db.queue[key];if(q)q.userPaused=false;
          r.freeze_revision=Number(r.freeze_revision||0)+1;r.updated_at=at;
        }
        save();return {ok:true,relation:r,character:char(c,p.id)};
      }
      case '/bootstrap':episodeStore();try{save();}catch{}return {profiles:db.profiles.slice(),sources:[...new Set([...SOURCES,...Array.from(byId.values(),c=>c.source)])].sort(),settings:pub(),catalog_size:byId.size};
      case '/health':return {ok:true,name:'Parallel Portable',version:'0.5.1'};
      case '/identify':return await identifyProfileCanon(data.name||params.get('name')||'',data.source||params.get('source')||'',data.hint||'',data.profileId||'');
      case '/settings':{
        if(!arguments[1])return pub();
        const s=db.connection;
        const nextTaskTokens='task_max_tokens' in data?mergeTaskTokenOverrides(s.task_max_tokens,data.task_max_tokens):null;
        if('max_tokens' in data&&validTokenBudget(data.max_tokens)===null)bodyErr('Max tokens 必须为 100–32768 的整数');
        if(data.clear_key)s.api_key='';
        if('archive_enabled' in data)s.archive_enabled=Boolean(data.archive_enabled);
        if(['inherit','custom'].includes(data.archive_mode))s.archive_mode=data.archive_mode;
        if('archive_base_url' in data){const v=String(data.archive_base_url||'').trim();if(v)getApiUrl('',{base_url:v});s.archive_base_url=v.replace(/\/+$/,'');}
        if('archive_model' in data)s.archive_model=String(data.archive_model||'').slice(0,200);
        if(data.archive_api_key)s.archive_api_key=String(data.archive_api_key).slice(0,1000);
        if(data.clear_archive_key)s.archive_api_key='';
        if(data.clear_image_key)s.image_api_key='';
        if('demo_enabled' in data)s.demo_enabled=Boolean(data.demo_enabled);
        if('proactive_mode' in data&&['off','daily','active'].includes(data.proactive_mode))s.proactive_mode=data.proactive_mode;
        if('auto_translate' in data)s.auto_translate=Boolean(data.auto_translate);
        if('character_language_pref' in data&&['natural','zh','en','custom'].includes(data.character_language_pref))s.character_language_pref=data.character_language_pref;
        if('character_language_custom' in data)s.character_language_custom=String(data.character_language_custom||'').trim().slice(0,40);
        if('base_url' in data){const v=String(data.base_url||'').trim();if(v&&!/^https?:\/\//.test(v))bodyErr('API Base URL 格式不正确');if(/^http:\/\//.test(v)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(v))bodyErr('远程 API 必须使用 HTTPS');s.base_url=v.replace(/\/+$/,'')}
        if('image_base_url' in data){const iv=String(data.image_base_url||'').trim();if(iv&&!/^https?:\/\//.test(iv))bodyErr('图片 API Base URL 格式不正确');if(/^http:\/\//.test(iv)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(iv))bodyErr('远程图片 API 必须使用 HTTPS');s.image_base_url=iv.replace(/\/+$/,'')}
        if(data.api_key)s.api_key=String(data.api_key).slice(0,1000);
        if(data.image_api_key)s.image_api_key=String(data.image_api_key).slice(0,1000);
        for(const k of ['model','image_model'])if(k in data)s[k]=String(data[k]||'').slice(0,200);
        for(const k of ['temperature','top_p','max_tokens'])if(k in data)s[k]=Number(data[k]);
        if(nextTaskTokens!==null)s.task_max_tokens=nextTaskTokens;
        if(Object.keys(data).some(k=>['archive_enabled','archive_mode','archive_base_url','archive_model','archive_api_key','base_url','api_key','model','task_max_tokens'].includes(k))){
          const store=episodeStore();store.retry_at=0;for(const j of store.jobs)if(j.status==='failed')j.retry_at=0;lastArchiveTick=0;
        }
        save();return {settings:pub()};
      }
      case '/models':{
        const s=db.connection;if(!s.api_key||!s.base_url)bodyErr('请先保存 API 地址和密钥');let r;
        try{r=await fetch(getApiUrl('/models'),{headers:{'Authorization':'Bearer '+s.api_key}})}catch(e){bodyErr('浏览器无法访问模型列表，可能是 API 的 CORS 限制。可使用 Python 本地服务版。')}
        if(!r.ok)bodyErr('模型列表 HTTP '+r.status);const j=await r.json();return {models:(j.data||[]).map(x=>x.id).filter(x=>typeof x==='string')};
      }
      case '/image-models':{
        const s=db.connection;if(!s.image_api_key||!s.image_base_url)bodyErr('请先保存图片 API 地址和密钥');
        const b=s.image_base_url.trim().replace(/\/+$/,'');let r;
        try{r=await fetch(b+'/models',{headers:{'Authorization':'Bearer '+s.image_api_key}})}catch(e){bodyErr('浏览器无法访问图片模型列表，可能是 API 的 CORS 限制。可使用 Python 本地服务版。')}
        if(!r.ok)bodyErr('图片模型列表 HTTP '+r.status);const j=await r.json();return {models:(j.data||[]).map(x=>x.id).filter(x=>typeof x==='string')};
      }
      case '/profile':{
        const name=String(data.name||'').trim().slice(0,80);const age=Number(data.age);if(!name||!Number.isInteger(age)||age<18||age>120)bodyErr('请填写姓名和有效年龄（18+）');
        const existing=db.profiles.find(x=>x.id===data.id);if(data.id&&!existing)bodyErr('Profile 不存在');
        const role=String(data.role_character_id||'');
        let canonIdentity=null;
        if(role){
          const submitted=normalizeProfileCanon(data.canon_identity);
          const retained=existing?.role_character_id===role?profileCanon(existing):null;
          canonIdentity=(submitted?.id===role?submitted:null)||(retained?.id===role?retained:null)||catalogProfileCanon(byId.get(role));
          if(!canonIdentity)bodyErr('原作档案无效，请重新搜索并选择角色');
        }
        const profile={id:existing?.id||uid(),name,age,gender:['male','female','nonbinary','other'].includes(data.gender)?data.gender:'other',interested_in:(data.interested_in||['all']).filter(x=>['all','male','female','nonbinary','other'].includes(x)),min_age:Math.max(18,Number(data.min_age)||18),max_age:Math.min(120,Number(data.max_age)||60),intent:String(data.intent||''),bio:String(data.bio||'').slice(0,500),interests:(data.interests||[]).slice(0,12),sources:[...new Map((data.sources||[]).filter(x=>typeof x==='string').map(x=>x.trim().replace(/\s+/g,' ').slice(0,80)).filter(Boolean).map(x=>[x.toLocaleLowerCase(),x])).values()].slice(0,20),avatar:String(data.avatar||''),role_character_id:role,canon_identity:canonIdentity,role_source:canonText(data.role_source,160),role_hint:String(data.role_hint||'').slice(0,300),created_at:existing?.created_at||stamp()};
        if(profile.max_age<profile.min_age)profile.max_age=profile.min_age;
        if(profile.avatar&&(!profile.avatar.startsWith('data:image/')||profile.avatar.length>2000000))bodyErr('头像需是小于约 1.5MB 的图片');
        if(existing)Object.assign(existing,profile);else db.profiles.push(profile);save();return {profile};
      }
      case '/discover-session':{
        const p=getP(data.profileId||params.get('profileId'));
        const session=readDiscoverySession(p);
        return {exists:Boolean(session),index:session?.index||0};
      }
      case '/discover-progress':{
        const p=getP(data.profileId),session=readDiscoverySession(p);
        if(!session||session.batch_id!==data.batchId)return {ok:false,reason:'stale'};
        const index=Number(data.index),characterId=String(data.characterId||'');
        if(!Number.isInteger(index)||index<0||index>=session.ids.length||session.ids[index]!==characterId)bodyErr('滑卡进度与当前卡组不一致');
        if(index+1>session.index){session.index=index+1;session.updated_at=stamp();save();}
        return {ok:true,index:session.index,batch_id:session.batch_id};
      }
      case '/discover':case '/candidates':{
        const p=getP(data.profileId||params.get('profileId'));
        const forceRefresh=Boolean(data.refresh||params.get('refresh')==='1');
        const stored=route==='/discover'?readDiscoverySession(p):null;
        if(stored&&!forceRefresh)return discoverySessionResponse(p,stored);
        const pool=candidates(p);
        const excluded=Array.isArray(data.excludeIds)?data.excludeIds.filter(x=>typeof x==='string'):[];
        const bioRes=route==='/discover'?await generateDiscovery(p,pool,forceRefresh,excluded)
          :{selected:shuffle(pool).slice(0,10),generation:'catalog-demo',apiError:null,new_count:0};
        if(stored&&(bioRes.apiError||bioRes.generation==='cached-ai-bios')){
          return discoverySessionResponse(p,stored,{
            warning:'本次刷新未生成新的一批，已保留原卡组与进度。',
            refresh_not_applied:true,batch_failures:bioRes.batch_failures||0,
            apiError:null
          });
        }
        if(route==='/discover'&&!bioRes.apiError&&bioRes.selected.length){
          const total=candidates(p).length;
          const session=createDiscoverySession(p,bioRes.selected.map(c=>c.id),total);
          return discoverySessionResponse(p,session,{
            generation:bioRes.generation,new_count:bioRes.new_count||0,
            batch_failures:bioRes.batch_failures||0,warning:bioRes.warning||'',
            resumed:false
          });
        }
        const cs=bioRes.selected.filter(c=>eligibleCandidate(p,c)).map(c=>({
          ...char(c),photo_description:db.photoDescriptions[c.id]?.description||'',
          photo_engine:db.photoDescriptions[c.id]?.engine||'',
          previous_swipe:db.swipes[pairKey(p.id,c.id)]?.direction||null,
          relation_status:relation(p.id,c.id)?.status||null
        }));
        return {candidates:cs,index:0,batch_id:'',total_available:candidates(p).length,
          requested:10,new_count:bioRes.new_count||0,batch_failures:bioRes.batch_failures||0,
          generation:bioRes.generation,apiError:bioRes.apiError||null,
          warning:bioRes.warning||'',demo:pub().mode==='demo'};
      }
      case '/swipe':{
        const p=getP(data.profileId),c=getC(data.characterId),d=data.direction;if(sameProfileCharacter(p,c))bodyErr('当前扮演身份不能匹配同一原作角色版本的自己');if(!['left','right'].includes(d))bodyErr('滑卡方向无效');
        db.swipes[pairKey(p.id,c.id)]={direction:d,updated_at:stamp()};const prior=relation(p.id,c.id);const again=!!prior;
        if(d==='left'){save();return {direction:d,matched:false,previously_matched:prior?.status==='matched'}}
        if(prior?.status==='matched'){save();return {direction:'right',matched:true,already_matched:true,character:char(c)}}
        save(); // record the swipe before any slow model call
        const attempt=(prior?.attempts||0)+1,{matched,engine}=await matchDecision(p,c,attempt);
        db.relations[pairKey(p.id,c.id)]={profile_id:p.id,character_id:c.id,status:matched?'matched':'pending',mode:'chat',hot_chat:Boolean(prior?.hot_chat),attempts:attempt,updated_at:stamp()};
        let greetingReplies=[],apiError=null,taskState=null,warning='';
        if(matched){
          event(p.id,c.id,'matched',p.name+(again?' 重新匹配':' 首次匹配'));
          save();
          const first=await firstMessage(p,c,again);
          if(first.bubbles&&first.bubbles.length){
            greetingReplies=first.bubbles.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,first.engine));
            const lastG=greetingReplies[greetingReplies.length-1];
            if(lastG)recordDialogueEpisode(p,c,[],{...lastG,text:first.bubbles.join(' / ')},'chat');
          }else if(first.apiError){
            apiError=first.apiError;
            taskState=first.taskState||null;
            warning=first.warning||'';
          }
        }
        save();return {direction:d,matched,engine,character:char(c),again,replies:greetingReplies,apiError,taskState,warning};
      }
      case '/hot-chat':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id);
        const nextHot=('hotChat' in data)?Boolean(data.hotChat):!r.hot_chat;
        r.hot_chat=nextHot;
        const k=pairKey(p.id,c.id),q=db.queue[k];
        if(q&&q.pending?.length&&q.status!=='inflight'&&!q.paused){
          const now=Date.now();
          if(nextHot){
            q.paceMode='hot';
            q.delayMinutes=1;
            q.dueAt=now+60000;
            q.targetTimeLabel=fmtHHMM(q.dueAt);
            q.scheduleReason='热聊模式 · 停手 1 分钟后立即阅读并回复';
          }else{
            const lastMsg=db.messages.find(m=>m.id===q.pending[q.pending.length-1]);
            const sched=computePersonaDelay(c,lastMsg?.text||'');
            q.paceMode='daily';
            q.delayMinutes=sched.delayMinutes;
            q.dueAt=now+sched.delayMinutes*60000;
            q.targetTimeLabel=fmtHHMM(q.dueAt);
            q.scheduleReason=sched.reason;
          }
        }
        save();
        return {ok:true,hotChat:nextHot,relation:r,queue:queueInfo(p.id,c.id)};
      }
      case '/proactive-check':{
        const p=getP(data.profileId||params.get('profileId'));
        const trigger=String(data.trigger||'startup');
        const targetCid=String(data.characterId||'');
        const curMode=pub().mode;
        const pMode=db.connection.proactive_mode||'daily';
        if(curMode==='normal')return {sent:[],skipped:'no-api'};
        if(pMode==='off'&&trigger!=='manual')return {sent:[],skipped:'off'};
        const now=Date.now();
        // M10: the user's local overnight quiet window is a hard automatic gate,
        // even if startup/idle or an old unresolved memory wants to message.
        if(trigger!=='manual'&&proactiveQuietReason([],now))
          return {delivered:[],sent:[],skipped:'overnight-quiet-hours'};
        if(trigger!=='manual'){
          const recentGlobal=Object.entries(db.proactiveLog||{}).filter(([k])=>k.startsWith(p.id+'|')).map(([,ts])=>Number(ts)||0);
          const lastGlobalTs=recentGlobal.length?Math.max(...recentGlobal):0;
          if(lastGlobalTs&&(now-lastGlobalTs)<30*60*1000){
            return {delivered:[],sent:[],skipped:'global-stagger-cooldown'};
          }
        }
        const matchedRels=Object.values(db.relations).filter(r=>r.profile_id===p.id&&r.status==='matched'&&!characterFrozen(p.id,r.character_id)&&r.mode==='chat'&&byId.has(r.character_id)&&(!targetCid||r.character_id===targetCid));
        const candidatesList=[];
        for(const r of matchedRels){
          const cid=r.character_id;
          const q=queueInfo(p.id,cid);
          if(q.status==='inflight'||q.paused||(trigger!=='manual'&&q.count>0))continue;
          const msgs=messagesOf(p.id,cid);
          if(proactiveQuietReason(msgs,now,trigger==='manual'))continue;
          const lastMsg=msgs[msgs.length-1];
          const lastTs=lastMsg?Date.parse(lastMsg.created_at)||0:Date.parse(r.updated_at)||0;
          const lastProactive=db.proactiveLog[pairKey(p.id,cid)]||0;
          const elapsedMs=now-Math.max(lastTs,lastProactive);
          const unresolvedMem=(r.freeze_reconnect&&!r.freeze_reconnect.explanation)?null:(db.episodicMemories||[]).filter(m=>m.owner_id===cid&&m.profile_id===p.id&&m.unresolved&&!m.disputed&&!m.isolated_error).sort((a,b)=>b.event_at.localeCompare(a.event_at))[0]||null;
          let eligible=false,reason='idle',priority=0;
          if(trigger==='manual'){
            eligible=true;
            reason=unresolvedMem?'promise':'idle';
            priority=unresolvedMem?100:50;
          }else if(trigger==='startup'){
            if(unresolvedMem&&elapsedMs>=30*60*1000){eligible=true;reason='promise';priority=90;}
            else if(elapsedMs>=4*3600*1000){eligible=true;reason='reentry';priority=60;}
          }else if(trigger==='idle'){
            if(elapsedMs>=30*60*1000){
              eligible=true;
              reason=unresolvedMem?'promise':'idle';
              priority=unresolvedMem?85:40;
            }
          }
          if(eligible)candidatesList.push({cid,c:getC(cid),reason,unresolvedMem,priority,lastTs});
        }
        candidatesList.sort((a,b)=>(b.priority-a.priority)||(b.lastTs-a.lastTs));
        const chosen=candidatesList.slice(0,1);
        const sent=[];
        for(const item of chosen){
          const res=await produceProactiveMessage(p,item.c,item.reason,item.unresolvedMem,trigger!=='manual');
          if(res.replies&&res.replies.length){
            sent.push({characterId:item.cid,characterName:item.c.name,reason:item.reason,replies:res.replies,reply:res.reply});
          }
        }
        return {delivered:sent,sent,matchedCount:matchedRels.length};
      }
      case '/threads':{
        const p=getP(params.get('profileId'));return {threads:Object.values(db.relations).filter(r=>r.profile_id===p.id&&r.status==='matched'&&byId.has(r.character_id)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(r=>{
          const cid=r.character_id;
          const cleanMsgs=messagesOf(p.id,cid).filter(m=>!isChatArtifact(m));
          const ts=getTaskState(p.id,cid,r.mode||'chat')||getTaskState(p.id,cid,'chat');
          return {
            character:char(getC(cid),p.id),
            relation:r,
            last:cleanMsgs.at(-1)||null,
            last_incoming:cleanMsgs.filter(m=>m.sender==='ai'&&m.engine!=='error'&&m.engine!=='recalled'&&!m.recalled).at(-1)||null,
            queue:queueInfo(p.id,cid),
            taskState:ts,
            bgErrors:db.bgErrors?.[pairKey(p.id,cid)]||null
          };
        })};
      }
      case '/thread':{
        const p=getP(params.get('profileId')),c=getC(params.get('characterId')),r=requireMatch(p.id,c.id);
        if(!r.frozen_at){ensureMeetingRecords(p,c);getOrInitSurveillance(p,c);}
        const diaryPayload=r.frozen_at?{latestDate:'',availableDates:[],diary:null}:buildDiaryPayload(p,c);
        const meetings=(db.meetings||[]).filter(x=>x.profile_id===p.id&&x.character_id===c.id);
        const ts=getTaskState(p.id,c.id,r.mode||'chat')||getTaskState(p.id,c.id,'chat');
        const threadMsgs=messagesOf(p.id,c.id);
        const translations=getMatchedTranslationsForThread(p.id,c.id,threadMsgs);
        // Opening a conversation is a read. Even if quota is exhausted,
        // returning the existing transcript must not depend on a write.
        try{save();}catch{}
        return {
          character:char(c,p.id),
          profile:p,
          relation:r,
          messages:threadMsgs,
          translations,
          meetings,
          queue:queueInfo(p.id,c.id),
          taskState:ts,
          bgErrors:db.bgErrors?.[pairKey(p.id,c.id)]||null,
          surveillance:r.frozen_at?null:buildSurveillancePayload(p,c),
          diarySummary:{latestDate:diaryPayload.latestDate,availableDates:diaryPayload.availableDates,latestTitle:diaryPayload.diary?.title||''}
        };
      }
      case '/task-state':{
        const pid=String(params.get('profileId')||data.profileId||'');
        const cid=String(params.get('characterId')||data.characterId||'');
        const mode=String(params.get('mode')||data.mode||'chat');
        return {
          taskState:getTaskState(pid,cid,mode),
          chatTaskState:getTaskState(pid,cid,'chat'),
          meetingTaskState:getTaskState(pid,cid,'meeting'),
          queue:pid&&cid?queueInfo(pid,cid):null,
          bgErrors:db.bgErrors?.[pairKey(pid||'_',cid||'_')]||null
        };
      }
      case '/task-action':{
        const p=getP(data.profileId),c=getC(data.characterId);
        const r=relation(p.id,c.id);
        const mode=String(data.mode||r?.mode||'chat');
        const act=String(data.action||'');
        const tKey=taskKeyOf(p.id,c.id,mode);
        const curTs=getTaskState(p.id,c.id,mode);
        if(act==='pause'){
          const ctrl=inflightControllers.get(tKey);
          if(ctrl){try{ctrl.abort();}catch{}inflightControllers.delete(tKey);}
          const q=db.queue[pairKey(p.id,c.id)];
          if(mode==='chat'&&q){
            q.paused=true;
            q.userPaused=true;
            q.blocked=true;
            q.status='paused';
            q.dueAt=0;
            q.revision=(q.revision||0)+1;
            q.inflight='';
            if(Array.isArray(curTs?.pending_ids)){
              for(const pid of curTs.pending_ids)if(pid&&!q.pending.includes(pid))q.pending.unshift(pid);
            }
          }
          db.taskStates ||= {};
          db.taskStates[tKey]={
            ...(curTs||{
              id:'task_'+uid(),
              profile_id:p.id,
              character_id:c.id,
              character_name:c.name,
              mode,
              task_type:mode==='meeting'?'meeting_message':'chat_flush',
              task_label:TASK_LABELS[mode]
            }),
            status:'paused',
            paused:true,
            userPaused:true,
            inflight_token:'',
            revision:((curTs?.revision)||0)+1,
            pending_ids:mode==='chat'?(db.queue[pairKey(p.id,c.id)]?.pending?.slice()||curTs?.pending_ids||[]):(curTs?.pending_ids||[]),
            updated_at:stamp()
          };
          save();
          return {ok:true,paused:true,taskState:db.taskStates[tKey],queue:queueInfo(p.id,c.id)};
        }
        if(act==='clear'||act==='dismiss-bg'){
          if(act==='dismiss-bg'){
            clearBgError(p.id,c.id,String(data.taskType||''));
            save();
            return {ok:true};
          }
          clearTaskState(p.id,c.id,mode);
          const q=db.queue[pairKey(p.id,c.id)];
          if(mode==='chat'&&q){q.paused=false;q.userPaused=false;q.blocked=false;if(q.status==='paused')q.status='idle';}
          save();
          return {ok:true,taskState:null,queue:queueInfo(p.id,c.id)};
        }
        if(act==='resume'||act==='retry'){
          requireMatch(p.id,c.id);
          if(curTs?.status==='inflight'){
            return {ok:true,inflight:true,deduplicated:true,taskState:curTs,queue:queueInfo(p.id,c.id)};
          }
          if(curTs?.task_type==='chat_first_message'){
            const first=await firstMessage(p,c,Boolean(curTs.again),{retryOfTaskId:curTs.id});
            let greetingReplies=[];
            if(first.bubbles&&first.bubbles.length){
              greetingReplies=first.bubbles.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,first.engine));
              const lastG=greetingReplies[greetingReplies.length-1];
              if(lastG)recordDialogueEpisode(p,c,[],{...lastG,text:first.bubbles.join(' / ')},'chat');
              save();
            }
            return {
              ok:!first.apiError,
              reply:greetingReplies[greetingReplies.length-1]||null,
              replies:greetingReplies,
              apiError:first.apiError||null,
              taskState:first.taskState||getTaskState(p.id,c.id,'chat'),
              warning:first.warning||'',
              queue:queueInfo(p.id,c.id)
            };
          }
          if(mode==='chat'){
            const q=db.queue[pairKey(p.id,c.id)]||(db.queue[pairKey(p.id,c.id)]={pending:[],dueAt:0,status:'idle',blocked:false,paused:false,userPaused:false,revision:0,inflight:''});
            q.userPaused=false;
            if(curTs)curTs.userPaused=false;
            if(!q.pending.length&&Array.isArray(curTs?.pending_ids)&&curTs.pending_ids.length){
              q.pending=curTs.pending_ids.slice();
            }
            if(q.pending.length){
              return await flushQueue(p,c,true,{retryOfTaskId:curTs?.id||'',manualResume:true});
            }
            const lastUser=messagesOf(p.id,c.id).filter(m=>m.mode==='chat'&&m.sender==='user').slice(-1)[0]||null;
            return await produceReply(p,c,'chat',lastUser,curTs?.task_type||'chat_continue',{retryOfTaskId:curTs?.id||''});
          }
          const ep=curTs?.task_type||'meeting_continue';
          const lastUserMsg=ep==='meeting_opening'?null:(messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===r?.active_meeting_id&&m.sender==='user').slice(-1)[0]||null);
          const res=await produceReply(p,c,'meeting',lastUserMsg,ep,{retryOfTaskId:curTs?.id||''});
          if(r?.active_meeting_id&&res.reply){
            const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
            if(mMsgs.length)upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location||'');
          }
          save();
          return {...res,mode:'meeting',queue:queueInfo(p.id,c.id)};
        }
        bodyErr('未知任务操作：'+act);
      }
      case '/surveillance':{
        const p=getP(params.get('profileId')||data.profileId),c=getC(params.get('characterId')||data.characterId);
        const reqDate=String(params.get('date')||data.date||'').trim();
        requireMatch(p.id,c.id);
        await ensureLiveSurveillance(p,c,Boolean(data.refresh),reqDate);
        save();
        return buildSurveillancePayload(p,c,reqDate);
      }
      case '/diary':{
        const p=getP(params.get('profileId')||data.profileId),c=getC(params.get('characterId')||data.characterId);
        const reqDate=String(params.get('date')||data.date||'').trim();
        requireMatch(p.id,c.id);
        ensureDiariesUpToDate(p,c);
        await ensureLiveDiary(p,c,reqDate,Boolean(data.refresh||data.forceRefresh));
        save();
        return buildDiaryPayload(p,c,reqDate);
      }
      case '/nickname':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id);
        const nick=String(data.nickname||'').trim().slice(0,36);
        r.nickname=nick;
        if(data.affectionBoost!==undefined)r.affection_boost=Number(data.affectionBoost)||0;
        r.updated_at=stamp();
        save();
        return {ok:true,nickname:nick,character:char(c,p.id),relation:r};
      }
      case '/episode-archive-tick':return await tickEpisodeArchive(String(data.profileId||''));
      case '/memories':{
        const p=getP(params.get('profileId')||data.profileId),c=getC(params.get('characterId')||data.characterId),qText=String(params.get('query')||data.query||'').trim();
        const mode=relation(p.id,c.id)?.mode||'chat';
        const activeWindow=selectWorkingHistory(p.id,c.id,mode);
        const activeIds=new Set(activeWindow.map(m=>m.id));
        ensureMeetingRecords(p,c);
        const pendingEpisodes=episodeList(p,c).map(episodePendingCard);
        save();
        const allMsgs=messagesOf(p.id,c.id);
        const items=[...(db.episodicMemories||[]),...pendingEpisodes].filter(m=>m.owner_id===c.id&&m.profile_id===p.id&&!m.isolated_error).sort((a,b)=>b.event_at.localeCompare(a.event_at)).map(m=>{
          // Read-only compatibility layer: new records use meeting_id instead
          // of embedding a second full transcript. Older embedded copies stay
          // untouched in storage, while the UI always gets the canonical
          // current meeting when it exists for this exact profile/character.
          if(m.source_type==='meeting_summary'&&m.meeting_id){
            const record=(db.meetings||[]).find(x=>x.id===m.meeting_id&&x.profile_id===p.id&&x.character_id===c.id);
            if(record)return {...m,meeting_data:record};
          }
          if(['episode-summary','episode-pending'].includes(m.source_type)){
            const rawSet=new Set(m.raw_msg_ids||[]);
            return {...m,day_messages:allMsgs.filter(x=>rawSet.has(x.id)&&x.engine!=='recalled'&&!x.recalled).map(x=>({id:x.id,sender:x.sender,speaker:x.sender==='user'?p.name:c.name,text:x.text,mode:x.mode,created_at:x.created_at}))};
          }
          if(m.source_type==='daily-summary'&&!m.day_messages){
            const rawSet=new Set(m.raw_msg_ids||[]);
            const dayStr=String(m.source_key||'').replace('day:','');
            const dMsgs=allMsgs.filter(x=>rawSet.has(x.id)||(dayStr&&String(x.created_at).slice(0,10)===dayStr&&x.mode==='chat')).map(x=>({id:x.id,sender:x.sender,speaker:x.sender==='user'?p.name:c.name,text:x.text,created_at:x.created_at}));
            return {...m,day_messages:dMsgs};
          }
          return m;
        });
        const previewQuery=qText||(allMsgs.slice(-4).map(m=>m.text).join('\n'));
        const recalled=retrieveRelevantMemories(p.id,c.id,previewQuery,qText?new Set():activeIds,4,1200);
        const meetings=(db.meetings||[]).filter(x=>x.profile_id===p.id&&x.character_id===c.id);
        return {
          ownerId:c.id,
          characterId:c.id,
          profileId:p.id,
          baseline:relationshipBaselineSummary(p.id,c.id,p.name),
          workingWindowCount:activeWindow.length,
          totalMessagesCount:allMsgs.length,
          memories:items,
          episodic:items,
          meetings,
          recalledPreview:recalled.map(m=>({...m,formatted:formatEpisodicEntry(m)}))
        };
      }
      case '/memory-action':{
        const p=getP(data.profileId),c=getC(data.characterId),act=String(data.action||'');
        if(act==='affinity'){
          const r=requireMatch(p.id,c.id);
          r.affection_boost=(Number(r.affection_boost)||0)+(Number(data.delta)||0);
          r.updated_at=stamp();
          save();
          return {ok:true,affection_boost:r.affection_boost,intimacy:computeIntimacyInfo(p,c)};
        }
        if(act==='archive-episode'){
          const candidate=episodeList(p,c).find(x=>x.source_key===data.sourceKey&&x.signature===data.signature);
          if(!candidate)bodyErr('情节已变化或已经归档');
          if(!archiveStoredCurrent())return archiveOutcome('blocked','存档已在另一页面更新，请使用最新页面');
          save();return await archiveOne(p,c,candidate,true);
        }
        if(act==='delete'){
          const mid=String(data.memoryId||data.id||'');if(!mid)bodyErr('缺少记忆 ID');
          const old=db.episodicMemories.find(x=>x.id===mid&&x.owner_id===c.id&&x.profile_id===p.id);
          const pending=mid.startsWith('pending:')?episodeList(p,c).find(x=>'pending:'+x.source_key===mid):null;
          const deleted=old?.source_type==='episode-summary'?old:pending;
          if(deleted)episodeStore().deleted.push({owner_id:c.id,profile_id:p.id,source_key:deleted.source_key,raw_msg_ids:deleted.raw_msg_ids});
          db.episodicMemories=(db.episodicMemories||[]).filter(m=>!(m.id===mid&&m.owner_id===c.id&&m.profile_id===p.id));
          save();return {ok:true};
        }
        if(act==='correct'){
          const mid=String(data.memoryId||data.id||''),corr=String(data.correction||data.clarification||'').trim();
          if(!mid||!corr)bodyErr('请提供需要澄清的记忆与纠正内容');
          const old=(db.episodicMemories||[]).find(m=>m.id===mid&&m.owner_id===c.id&&m.profile_id===p.id);
          if(!old)bodyErr('未找到该条记忆');
          old.disputed=1;old.unresolved=0;
          const entryId=appendEpisodicMemory({
            owner_id:c.id,profile_id:p.id,source_type:'correction',source_key:'corr:'+uid(),knowledge_mode:'clarified',
            summary:`${p.name}明确澄清/纠正：${corr.slice(0,160)}（原记忆已标记存疑）`,
            importance:5,emotional_weight:4,unresolved:0,disputed:0,clarifies_id:mid
          });
          save();return {ok:true,id:entryId};
        }
        if(act==='add'){
          const summary=String(data.summary||'').trim();
          if(!summary||summary.length>500)bodyErr('记忆摘要需在 1–500 字之间');
          const entryId=appendEpisodicMemory({
            owner_id:c.id,profile_id:p.id,source_type:'confirmed_fact',source_key:'manual:'+uid(),knowledge_mode:'experienced',
            summary,importance:4,emotional_weight:3,unresolved:data.unresolved?1:0
          });
          save();return {ok:true,id:entryId};
        }
        bodyErr('未知记忆操作');
      }
      case '/unmatch':{
        const p=getP(data.profileId),c=getC(data.characterId),r=relation(p.id,c.id);if(!r)bodyErr('还没有匹配过');
        r.status='unmatched';r.mode='chat';r.active_meeting_id='';
        clearQueue(p.id,c.id);
        clearTaskStatesForPair(p.id,c.id);
        r.updated_at=stamp();
        event(p.id,c.id,'unmatched','与 '+p.name+' 解除匹配，过去的经历不会消失');
        save();return {ok:true};
      }
      case '/mode':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id),m=data.mode;
        if(!['chat','meeting'].includes(m))bodyErr('无效模式');
        // Reject old automatic-transition requests from cached frontends.
        if(Object.prototype.hasOwnProperty.call(data,'autoArrivalId'))return {mode:r.mode,autoRejected:true};
        const proposedLoc=String(data.location||data.meetingLocation||'').trim().slice(0,40);
        const locInput=isNonPlaceText(proposedLoc)?'':proposedLoc;
        if(locInput&&m==='meeting'){
          if(r.mode==='meeting')confirmActiveMeetingLocation(p,c,locInput);
          else r.meeting_location=locInput;
        }
        let meetingRecord=null,openingReply=null,warning='',apiError=null,taskState=null,summaryError=null;
        if(r.mode!==m){
          clearQueue(p.id,c.id);
          clearTaskStatesForPair(p.id,c.id);
          if(m==='meeting'){
            const resumeMid=String(data.resumeMeetingId||'').trim();
            if(resumeMid){
              const prior=(db.meetings||[]).find(x=>x.id===resumeMid&&x.profile_id===p.id&&x.character_id===c.id);
              const priorMessageIds=new Set(prior?.message_ids||[]);
              const oldTurns=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&(x.meeting_id===resumeMid||priorMessageIds.has(x.id)));
              if(!prior||!oldTurns.length)bodyErr('旧见面已不存在，无法续接');
              if(!archiveStoredCurrent())bodyErr('存档已在其他页面更新，请刷新后再继续');
              r.mode='meeting';
              r.active_meeting_id=resumeMid;
              r.meeting_started_at=prior.started_at||oldTurns[0].created_at;
              const savedScene=Array.isArray(prior.location_history)?prior.location_history
                .filter(e=>e&&Number.isFinite(Date.parse(e.at))&&!isNonPlaceText(e.location)).map(e=>({...e})):[];
              const latestConfirmed=oldTurns.slice().reverse().filter(m=>m.sender==='user').map(m=>meetingPlaceInPlayerTurn(m.text,p.name)).find(Boolean)||'';
              const archivedPlace=savedScene.at(-1)?.location||'';
              // Only this meeting's archived snapshot and own original turns count.
              // Never use the current surveillance slot, or a different meeting's relation history.
              r.meeting_location=locInput||archivedPlace||latestConfirmed||(!isNonPlaceText(prior.location)?prior.location:'')||
                recoverPreMeetingPlace(p,c,Date.parse(r.meeting_started_at))||'约定的见面地点';
              const initialPlace=savedScene[0]?.location||recoverPreMeetingPlace(p,c,Date.parse(r.meeting_started_at))||prior.location||r.meeting_location;
              r.meeting_location_history=savedScene.length?savedScene:[{at:r.meeting_started_at,location:initialPlace,source:'start'}];
              r.meeting_location_history.push({at:stamp(),location:r.meeting_location,source:'resume'});
              r.updated_at=stamp();
              // An archived recap is no longer final; refresh a factual recap after the new ending.
              prior.finished_at='';
              prior.ai_summary='';
              prior.summary_source='';
              prior.summary_edited_at='';
              const memory=db.episodicMemories.find(x=>x.owner_id===c.id&&x.profile_id===p.id&&x.source_key==='meeting:'+resumeMid);
              if(memory)memory.archive_stale=true;
              upsertMeetingRecord(p,c,resumeMid,oldTurns,r.meeting_location);
              const currentSurv=getOrInitSurveillance(p,c,localDateStr());
              currentSurv.slots=currentSurv.slots.filter(x=>!(x.source==='meeting_shift'&&x.meeting_id===resumeMid));
              delete currentSurv.post_meeting_anchor;
              delete currentSurv.post_meeting_id;
              delete currentSurv.post_meeting_location;
              syncSurveillanceOnMeetingStart(p,c,r.meeting_location,resumeMid);
            }else{
            const inferredLoc=inferMeetingLocation(p.id,c.id,locInput);
            r.mode='meeting';
            r.active_meeting_id='meet_'+uid();
            r.meeting_location=inferredLoc;
            r.meeting_started_at=stamp();
            r.meeting_location_history=[{at:r.meeting_started_at,location:r.meeting_location,source:'start'}];
            r.updated_at=stamp();
            syncSurveillanceOnMeetingStart(p,c,r.meeting_location,r.active_meeting_id);
            event(p.id,c.id,'meeting','与 '+p.name+' 进入面对面候场（尚未确认双方接触）');
            db.events.at(-1).meeting_id=r.active_meeting_id;
            save(); // the real start survives a failed or interrupted opening
            if(data.triggerOpening===true&&pub().mode!=='normal'){
              const res=await produceReply(p,c,'meeting',null,'meeting_opening');
              openingReply=res.reply;
              warning=res.warning||'';
              apiError=res.apiError||null;
              taskState=res.taskState||null;
              const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
              meetingRecord=upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location);
            }
            }
          }else{
            const activeMid=r.active_meeting_id||'',finishedAt=stamp();
            const allMsgs=messagesOf(p.id,c.id);
            let mMsgs=activeMid?allMsgs.filter(x=>x.mode==='meeting'&&x.meeting_id===activeMid):[];
            if(!activeMid&&!mMsgs.length){
              for(let i=allMsgs.length-1;i>=0;i--){
                if(allMsgs[i].mode==='meeting')mMsgs.unshift(allMsgs[i]);
                else break;
              }
            }
            if(mMsgs.length){
              const mid=activeMid||mMsgs[0].meeting_id||('meet_'+mMsgs[0].id);
              const aiLoc=r.meeting_location||''; // scene authority, never stale finale UI payload
              meetingRecord=upsertMeetingRecord(p,c,mid,mMsgs,aiLoc,'',finishedAt);
              if(meetingRecord)syncSurveillanceOnMeetingEnd(p,c,meetingRecord);
            }
            r.mode='chat';
            r.active_meeting_id='';
            r.meeting_started_at='';
            r.updated_at=finishedAt;
            clearTaskState(p.id,c.id,'meeting');
            event(p.id,c.id,'return','与 '+p.name+' 返回手机聊天',Date.parse(finishedAt));
            db.events.at(-1).meeting_id=activeMid;
            save(); // persist actual finish and raw transcript before any paid call
            if(meetingRecord&&data.finalizeMeeting===true&&pub().mode==='live'){
              try{
                const parsed=await summarizeCompleteMeeting(p,c,mMsgs,meetingRecord.location,meetingRecord);
                const current=(db.meetings||[]).find(x=>x.id===meetingRecord.id&&x.profile_id===p.id&&x.character_id===c.id);
                if(!parsed?.summary)throw Error('未收到有效小结');
                if(!archiveStoredCurrent()||r.mode!=='chat'||!current||current.finished_at!==finishedAt||current.summary_source==='manual')throw Error('见面记录在整理期间已变化，未覆盖当前记录');
                const latest=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===current.id);
                if(latest.map(x=>x.id+'='+x.text).join('\n')!==mMsgs.map(x=>x.id+'='+x.text).join('\n'))throw Error('原文已变化，请重新整理');
                meetingRecord=upsertMeetingRecord(p,c,current.id,latest,current.location,String(parsed.summary).trim().slice(0,850),finishedAt);
                clearBgError(p.id,c.id,'meeting_finalize');save();
              }catch(e){
                summaryError=e.apiError||{message:String(e.message||e)};
                recordBgError(p.id,c.id,'meeting_finalize',summaryError);
              }
            }
            if(meetingRecord)await replanRemainingDayAfterMeeting(p,c,meetingRecord);
          }
        }else if(m==='meeting'&&r.active_meeting_id){
          if(locInput)syncSurveillanceOnMeetingStart(p,c,r.meeting_location,r.active_meeting_id);
          const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
          if(mMsgs.length)meetingRecord=upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location||'');
        }
        save();
        return {mode:m,meetingId:r.active_meeting_id||'',active_meeting_id:r.active_meeting_id||'',location:r.meeting_location||'',meeting_location:r.meeting_location||'',meetingRecord,openingReply,warning,apiError,taskState,summaryError,surveillance:buildSurveillancePayload(p,c)};
      }
      // Manually pasted recaps remain a user-controlled index; source scene text stays canonical.
      case '/meeting-summary-save':{
        const p=getP(data.profileId),c=getC(data.characterId),mid=String(data.meetingId||'').trim();
        const existing=(db.meetings||[]).find(x=>x.id===mid&&x.profile_id===p.id&&x.character_id===c.id);
        if(!existing)bodyErr('未找到当前角色的见面记录');
        if(relation(p.id,c.id)?.active_meeting_id===mid)bodyErr('这场见面仍在进行，请结束后编辑最终总结');
        const summary=String(data.summary??'').trim();
        if(summary.length<6||summary.length>4000)bodyErr('见面总结须为 6–4000 字，请检查粘贴的内容');
        const mMsgs=(db.messages||[]).filter(x=>x.mode==='meeting'&&x.profile_id===p.id&&x.character_id===c.id&&x.meeting_id===mid);
        if(!mMsgs.length)bodyErr('原始见面记录不可用，无法保存总结');
        if(!archiveStoredCurrent())bodyErr('存档已在另一页面更新，请先刷新页面');
        const snapshot=JSON.stringify(db);
        try{
          const rec=upsertMeetingRecord(p,c,mid,mMsgs,existing.location||'',summary,existing.finished_at||'','manual');
          save();
          return {ok:true,meetingRecord:rec};
        }catch(e){db=JSON.parse(snapshot);throw e;}
      }
      case '/meeting-summary-refresh':{
        const p=getP(data.profileId),c=getC(data.characterId),mid=String(data.meetingId||'');
        const existing=(db.meetings||[]).find(x=>x.id===mid&&x.profile_id===p.id&&x.character_id===c.id);
        if(!existing)bodyErr('未找到当前角色的见面记录');
        if(existing.summary_source==='manual'&&data.overwriteManual!==true)bodyErr('已存在手动总结，需要确认后才能让 AI 覆盖');
        const editVersion=String(existing.summary_edited_at||'');
        const mMsgs=(db.messages||[]).filter(x=>x.mode==='meeting'&&x.profile_id===p.id&&x.character_id===c.id&&x.meeting_id===mid);
        if(!mMsgs.length)bodyErr('原始见面记录不可用，无法重新整理');
        if(!archiveStoredCurrent())bodyErr('存档已在另一页面更新，请先刷新页面');
        const signature=mMsgs.map(x=>x.id+'='+x.text).join('\n');
        const parsed=await summarizeCompleteMeeting(p,c,mMsgs,existing.location||'',existing);
        if(!archiveStoredCurrent())bodyErr('整理期间存档被其他页面修改，请刷新后再试');
        const latest=(db.messages||[]).filter(x=>x.mode==='meeting'&&x.profile_id===p.id&&x.character_id===c.id&&x.meeting_id===mid);
        if(latest.map(x=>x.id+'='+x.text).join('\n')!==signature)bodyErr('见面原文已更新，请重新整理');
        if(String(existing.summary_edited_at||'')!==editVersion)bodyErr('整理期间手动总结已更新，已取消本次覆盖');
        const rec=upsertMeetingRecord(p,c,mid,latest,existing.location||'',parsed.summary,existing.finished_at||'');
        clearBgError(p.id,c.id,'meeting_finalize');save();
        return {ok:true,meetingRecord:rec};
      }
      case '/chat-flush':{
        const p=getP(data.profileId);
        if(!data.characterId)return await flushDueQueues(p,String(data.activeCharacterId||''));
        const c=getC(data.characterId),r=requireMatch(p.id,c.id);if(r.mode!=='chat')bodyErr('当前不是手机聊天模式');return await flushQueue(p,c,data.force===true,{manualResume:Boolean(data.manualResume)});
      }
      case '/chat-recover':return recoverDueQueues(data);
      case '/chat-flush-due':{
        const p=getP(data.profileId);const result=await flushDueQueues(p,String(data.activeCharacterId||''));void tickEpisodeArchive(p.id).catch(()=>{});return result;
      }
      case '/message-forget':{
        const p=getP(data.profileId),c=getC(data.characterId),mid=String(data.messageId||'');
        if(!mid)bodyErr('缺少消息 ID');
        const target=db.messages.find(m=>m.id===mid&&m.profile_id===p.id&&m.character_id===c.id);
        if(!target)bodyErr('消息已不存在');
        if(getTaskState(p.id,c.id,'meeting')?.status==='inflight'||getTaskState(p.id,c.id,'chat')?.status==='inflight')bodyErr('请在模型回复完成或暂停后删除');
        if(!archiveStoredCurrent())bodyErr('存档已在其他页面更新，请刷新后再删除');
        const snapshot=JSON.stringify(db);
        try{
          const photo=target.photo_ref;
          const result=forgetMessages(p,c,[mid]);
          save();
          if(photo)void removeChatPhotos([photo]).catch(()=>{});
          return {ok:true,...result};
        }catch(e){db=JSON.parse(snapshot);throw e;}
      }
      case '/meeting-forget':{
        const p=getP(data.profileId),c=getC(data.characterId),mid=String(data.meetingId||'');
        const rec=(db.meetings||[]).find(x=>x.id===mid&&x.profile_id===p.id&&x.character_id===c.id);
        if(!rec)bodyErr('见面记录已不存在');
        const r=requireMatch(p.id,c.id);
        if(r.mode==='meeting'&&r.active_meeting_id===mid)bodyErr('正在进行的见面不能整场删除，请先结束见面');
        if(getTaskState(p.id,c.id,'meeting')?.status==='inflight')bodyErr('请等待当前模型生成结束');
        if(!archiveStoredCurrent())bodyErr('存档已在其他页面更新，请刷新后再删除');
        const snapshot=JSON.stringify(db);
        try{
          const priorIds=new Set(rec.message_ids||[]);
          const rows=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&(m.meeting_id===mid||priorIds.has(m.id)));
          const photos=rows.map(m=>m.photo_ref).filter(Boolean);
          const result=forgetMessages(p,c,rows.map(m=>m.id),[mid]);
          if(!rows.length){db.meetings=db.meetings.filter(x=>x.id!==mid);db.episodicMemories=db.episodicMemories.filter(x=>x.source_key!=='meeting:'+mid);}
          save();
          if(photos.length)void removeChatPhotos(photos).catch(()=>{});
          return {ok:true,...result};
        }catch(e){db=JSON.parse(snapshot);throw e;}
      }
      case '/message-delete':{
        const p=getP(data.profileId),c=getC(data.characterId),mid=String(data.messageId||'');
        if(!mid)bodyErr('缺少消息 ID');
        const targetMsg=db.messages.find(m=>m.id===mid&&m.profile_id===p.id&&m.character_id===c.id);
        if(!targetMsg)bodyErr('消息不存在');
        if(targetMsg.sender!=='user')bodyErr('只能撤回自己发送的消息');
        if(targetMsg){
          const photoRef=targetMsg.photo_ref;
          delete targetMsg.photo_ref;delete targetMsg.photo_kind;delete targetMsg.photo_description;
          targetMsg.text='[系统提示：对方撤回了一条消息（你没有看清具体内容）]';
          targetMsg.engine='recalled';
          targetMsg.recalled=true;
          if(targetMsg.mode==='meeting')pruneMeetingCheckpoints(p.id,c.id,targetMsg.meeting_id);
          invalidateTranslation(mid);
          for(const mem of (db.episodicMemories||[])){
            if(mem.owner_id===c.id&&mem.profile_id===p.id&&(mem.raw_msg_ids||[]).includes(mid)){
              if(mem.source_type==='episode-summary')mem.archive_stale=true;
              else mem.summary=`${p.name}撤回了一条消息（具体内容未知）`;
            }
          }
          event(p.id,c.id,'message_recalled',p.name+' 撤回了一条消息');
          // Keep bytes until the recall metadata has been committed.
          for(const other of db.messages)if(other.profile_id===p.id&&other.character_id===c.id&&other.quote?.id===mid)other.quote=null;
          if(photoRef){save();void removeChatPhotos([photoRef]).catch(()=>{});}
        }
        const q=db.queue[pairKey(p.id,c.id)];
        if(q){q.pending=q.pending.filter(x=>x!==mid);if(!q.pending.length)q.dueAt=0;}
        const ts=getTaskState(p.id,c.id,'chat');
        if(ts&&Array.isArray(ts.pending_ids)){ts.pending_ids=ts.pending_ids.filter(x=>x!==mid);}
        save();return {ok:true,recalled:true,queue:queueInfo(p.id,c.id)};
      }
      case '/message-edit':{
        const p=getP(data.profileId),c=getC(data.characterId),mid=String(data.messageId||'').trim();
        const rawTxt=String(data.text||'').trim();
        if(!mid)bodyErr('缺少消息 ID');
        if(!rawTxt||rawTxt.length>4000)bodyErr('消息长度需在 1–4000 字之间');
        const targetMsg=db.messages.find(m=>m.id===mid&&m.profile_id===p.id&&m.character_id===c.id);
        if(!targetMsg)bodyErr('消息不存在');
        if(targetMsg.recalled||targetMsg.engine==='recalled')bodyErr('已撤回的消息无法编辑');
        if(targetMsg.mode==='meeting'){
          const rel=requireMatch(p.id,c.id),meetingId=rel.active_meeting_id||'';
          if(rel.mode!=='meeting'||!meetingId||targetMsg.meeting_id!==meetingId||targetMsg.sender!=='user')
            bodyErr('只能编辑当前面对面见面中自己最新的一段内容');
          if(meetingRerolls.has(pairKey(p.id,c.id))||getTaskState(p.id,c.id,'meeting')?.status==='inflight')
            bodyErr('当前现场正在生成，请在完成或暂停后编辑');
          const session=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===meetingId&&!m.recalled&&m.engine!=='recalled');
          const latestUser=session.filter(m=>m.sender==='user').at(-1);
          if(!latestUser||latestUser.id!==mid)bodyErr('只能编辑当前见面最新一条自己发出的内容');
          if(targetMsg.text===rawTxt)return {ok:true,message:targetMsg,changed:false,removedIds:[],translationInvalidated:false};
          if(!archiveStoredCurrent())bodyErr('存档已在另一页面更新，请刷新后再编辑');
          const snapshot=JSON.stringify(db);
          try{
            const original=targetMsg.text,position=db.messages.indexOf(targetMsg);
            const removed=db.messages.slice(position+1).filter(m=>m.profile_id===p.id&&m.character_id===c.id&&m.mode==='meeting'&&m.meeting_id===meetingId&&m.sender==='ai');
            const removedIds=removed.map(m=>m.id),affected=new Set([mid,...removedIds]);
            targetMsg.text=rawTxt;targetMsg.edited_at=stamp();
            if(removedIds.length)db.messages=db.messages.filter(m=>!affected.has(m.id)||m.id===mid);
            pruneMeetingCheckpoints(p.id,c.id,meetingId);
            for(const rid of affected)invalidateTranslation(rid);
            const staleMemIds=new Set();
            for(const mem of db.episodicMemories){
              if(mem.profile_id!==p.id||mem.owner_id!==c.id)continue;
              if([...(mem.raw_msg_ids||[]),...(mem.meeting_data?.message_ids||[])].some(id=>affected.has(id))){
                mem.archive_stale=true;staleMemIds.add(mem.id);
              }
            }
            for(const mem of db.episodicMemories)
              if(mem.profile_id===p.id&&mem.owner_id===c.id&&staleMemIds.has(mem.clarifies_id))mem.archive_stale=true;
            const userEvent='与 '+p.name+' 的见面：'+String(original).slice(0,180);
            const replacementEvent='与 '+p.name+' 的见面：'+rawTxt.slice(0,180);
            let changedEvent=false;
            db.events=db.events.filter(e=>{
              if(e.profile_id!==p.id||e.character_id!==c.id)return true;
              if(e.type==='ai_message'&&removedIds.includes(e.message_id))return false;
              if(e.type==='user_message'&&(e.message_id===mid||(e.summary===userEvent&&Math.abs(Date.parse(e.created_at)-Date.parse(targetMsg.created_at))<10000))){
                e.summary=replacementEvent;e.message_id=mid;changedEvent=true;
              }
              return true;
            });
            if(!changedEvent){event(p.id,c.id,'user_message',replacementEvent);db.events.at(-1).message_id=mid;}
            const oldDiary=db.diaries[pairKey(p.id,c.id)]?.byDate?.[localDateStr(Date.parse(targetMsg.created_at))];
            if(oldDiary)oldDiary.stale_after_recovery=true;
            clearTaskState(p.id,c.id,'meeting');
            const current=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===meetingId);
            if(current.length)upsertMeetingRecord(p,c,meetingId,current,rel.meeting_location||'');
            episodeList(p,c);rel.updated_at=stamp();save();
            return {ok:true,message:targetMsg,changed:true,removedIds,translationInvalidated:true,regenerate:true};
          }catch(e){db=JSON.parse(snapshot);throw e;}
        }
        if(targetMsg.mode!=='chat')bodyErr('不支持编辑此类型消息');
        if(targetMsg.photo_kind==='gallery')bodyErr('真实照片不能编辑，请撤回后重新发送');
        if(targetMsg.photo_kind==='virtual'){
          if(rawTxt.length>2000)bodyErr('照片描写最多 2000 字');
          targetMsg.photo_description=rawTxt;targetMsg.text=photoDescriptionText(targetMsg.sender,rawTxt);
        }else targetMsg.text=targetMsg.sender==='ai'?(cleanChatBubbleText(rawTxt)||rawTxt):rawTxt;
        targetMsg.edited_at=stamp();
        invalidateTranslation(mid);
        save();
        return {ok:true,message:targetMsg,translationInvalidated:true};
      }
      case '/message-regenerate':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id);
        if(r.mode==='meeting')return regenerateMeeting(p,c,r,String(data.messageId||'').trim(),data.location);
        if(r.mode!=='chat')bodyErr('当前模式不支持重新生成');
        const threadMsgs=messagesOf(p.id,c.id).filter(m=>!isChatArtifact(m));
        const trailingAi=[];
        for(let i=threadMsgs.length-1;i>=0;i--){
          const m=threadMsgs[i];
          if(m.mode!=='chat')break;
          if(m.recalled||m.engine==='recalled')continue;
          if(m.sender==='ai')trailingAi.unshift(m);
          else break;
        }
        if(!trailingAi.length)bodyErr('当前没有可重新生成的角色回复');
        const reqMid=String(data.messageId||'').trim();
        if(reqMid&&!trailingAi.some(m=>m.id===reqMid))bodyErr('仅支持重新生成角色最新一轮回复');
        const curMode=pub().mode;
        if(curMode==='normal'){
          return {ok:false,replies:[],reply:null,removedIds:[],warning:'还没有配置 API，无法重新生成。请前往「终端」配置模型，或开启演示模式。',apiError:null};
        }
        const removedIds=trailingAi.map(m=>m.id);
        const excludeSet=new Set(removedIds);
        let rawText='',engine='demo';
        if(curMode==='live'){
          try{
            const ms=prompt(p,c,'chat',[],{entry_point:'chat_continue',excludeMessageIds:removedIds});
            if(!ms.some(x=>x.role==='user')){
              ms.push({role:'user',content:`【系统事件：重新生成开场】请结合你的原作性格与当前关系，重新发 1～2 条自然的手机聊天开场消息（多条气泡之间用 ||| 分隔）。`});
            }
            rawText=await llm(ms,{max_tokens:Math.min(1024,db.connection.max_tokens||4096),profile:p,character:c,mode:'chat',entry_point:'chat_continue'});
            engine='live';
          }catch(e){
            return {ok:false,replies:[],reply:null,removedIds:[],warning:String(e.message||e),apiError:e.apiError||null};
          }
        }else{
          const lastUser=threadMsgs.filter(m=>m.sender==='user'&&!excludeSet.has(m.id)).at(-1)||null;
          rawText=demoReply(p,c,lastUser?.text||'', 'chat');
          engine='demo';
        }
        const bubbleTexts=splitChatBubbles(rawText);
        if(!bubbleTexts.length){
          return {ok:false,replies:[],reply:null,removedIds:[],warning:'模型返回内容为空，已保留原有消息。',apiError:null};
        }
        db.messages=db.messages.filter(m=>!excludeSet.has(m.id));
        for(const rid of removedIds)invalidateTranslation(rid);
        const replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,engine));
        const reply=replies[replies.length-1]||null;
        if(reply){
          r.updated_at=stamp();
          event(p.id,c.id,'ai_message',c.name+' 重新回应 '+p.name+'：'+bubbleTexts.join(' / ').slice(0,180));
        }
        save();
        return {ok:true,removedIds,replies,reply,warning:'',apiError:null};
      }
      case '/translate-messages':{
        const p=getP(data.profileId),c=getC(data.characterId);
        requireMatch(p.id,c.id);
        db.translations ||= {};
        const force=Boolean(data.force);
        const autoEnabled=db.connection.auto_translate!==false;
        const threadMsgs=messagesOf(p.id,c.id);
        const reqIdSet=Array.isArray(data.messageIds)&&data.messageIds.length?new Set(data.messageIds.map(x=>String(x))):null;
        const targetMsgs=threadMsgs.filter(m=>{
          if(!m||m.sender!=='ai'||m.mode!=='chat'||m.photo_kind||m.recalled||m.engine==='recalled'||m.engine==='error'||m.isolated_error||isChatArtifact(m))return false;
          if(reqIdSet&&!reqIdSet.has(m.id))return false;
          return true;
        });
        if(!force&&!autoEnabled){
          return {ok:true,skipped:'disabled',calledApi:false,translations:getMatchedTranslationsForThread(p.id,c.id,threadMsgs),translatedIds:[],cachedIds:[],skippedIds:targetMsgs.map(m=>m.id),failedIds:[]};
        }
        const ignoreNames=[c.name,p.name,...(c.aliases||[])];
        const toTranslate=[];
        const cachedIds=[];
        const skippedIds=[];
        for(const m of targetMsgs){
          const clean=cleanChatBubbleText(m.text);
          const ver=computeContentVersion(clean);
          if(!needsChineseTranslation(clean,ignoreNames)){
            skippedIds.push(m.id);
            continue;
          }
          const existing=db.translations[m.id];
          if(!force&&existing&&existing.status==='ready'&&existing.content_version===ver&&existing.translated_text){
            cachedIds.push(m.id);
            continue;
          }
          toTranslate.push({id:m.id,text:clean,content_version:ver});
        }
        if(!toTranslate.length){
          return {ok:true,calledApi:false,translations:getMatchedTranslationsForThread(p.id,c.id,threadMsgs),translatedIds:[],cachedIds,skippedIds,failedIds:[]};
        }
        const curMode=pub().mode;
        if(curMode==='normal'){
          return {ok:true,skipped:'no-api',calledApi:false,translations:getMatchedTranslationsForThread(p.id,c.id,threadMsgs),translatedIds:[],cachedIds,skippedIds,failedIds:[]};
        }
        const batch=toTranslate.slice(0,12);
        if(curMode==='demo'){
          const translatedIds=[];
          for(const item of batch){
            db.translations[item.id]={
              message_id:item.id,
              profile_id:p.id,
              character_id:c.id,
              content_version:item.content_version,
              target_lang:'zh-CN',
              translated_text:demoTranslateToZh(item.text),
              status:'ready',
              error_code:'',
              error_message:'',
              provider_model:'demo',
              updated_at:stamp()
            };
            translatedIds.push(item.id);
          }
          save();
          return {ok:true,calledApi:false,engine:'demo',translations:getMatchedTranslationsForThread(p.id,c.id,threadMsgs),translatedIds,cachedIds,skippedIds,failedIds:[]};
        }
        const charCue=(c.tags||[]).slice(0,4).join('、');
        const promptMsgs=buildBatchTranslationMessages(batch.map(x=>({id:x.id,text:x.text})),c.name,charCue);
        const totalChars=batch.reduce((s,x)=>s+x.text.length,0);
        const maxTokens=Math.min(1600,Math.max(260,Math.ceil(totalChars*4)+120));
        try{
          const raw=await llm(promptMsgs,{
            mode:'translation',
            task_type:'translation',
            entry_point:'chat_translation',
            json_mode:true,
            temperature:0.25,
            max_tokens:maxTokens,
            profile:p,
            character:c,
            background:true
          });
          const parsed=parseTranslationBatchResponse(raw,batch);
          const translatedIds=[];
          const failedIds=[];
          const nowTs=stamp();
          for(const item of batch){
            const zh=parsed.translations[item.id];
            if(zh){
              db.translations[item.id]={
                message_id:item.id,
                profile_id:p.id,
                character_id:c.id,
                content_version:item.content_version,
                target_lang:'zh-CN',
                translated_text:zh,
                status:'ready',
                error_code:'',
                error_message:'',
                provider_model:db.connection.model||'',
                updated_at:nowTs
              };
              translatedIds.push(item.id);
            }else{
              db.translations[item.id]={
                message_id:item.id,
                profile_id:p.id,
                character_id:c.id,
                content_version:item.content_version,
                target_lang:'zh-CN',
                translated_text:'',
                status:'error',
                error_code:'INCOMPLETE_TRANSLATION',
                error_message:'模型未返回该气泡的对应译文，可点击重试翻译。',
                provider_model:db.connection.model||'',
                updated_at:nowTs
              };
              failedIds.push(item.id);
            }
          }
          save();
          return {ok:failedIds.length===0,calledApi:true,engine:'live',translations:getMatchedTranslationsForThread(p.id,c.id,threadMsgs),translatedIds,cachedIds,skippedIds,failedIds,apiError:null};
        }catch(e){
          const apiErr=e.apiError||createApiError({
            error_code:'TRANSLATION_FAILED',
            http_status:0,
            title:'双语译文翻译失败',
            message:String(e.message||e),
            character_id:c.id,
            character_name:c.name,
            profile_id:p.id,
            task_type:'translation',
            task_label:TASK_LABELS.translation,
            background:true
          });
          const nowTs=stamp();
          const failedIds=[];
          for(const item of batch){
            db.translations[item.id]={
              message_id:item.id,
              profile_id:p.id,
              character_id:c.id,
              content_version:item.content_version,
              target_lang:'zh-CN',
              translated_text:'',
              status:'error',
              error_code:apiErr.error_code||'TRANSLATION_FAILED',
              error_message:apiErr.title||apiErr.message||'翻译请求失败',
              provider_model:db.connection.model||'',
              updated_at:nowTs
            };
            failedIds.push(item.id);
          }
          save();
          return {ok:false,calledApi:true,engine:'live',translations:getMatchedTranslationsForThread(p.id,c.id,threadMsgs),translatedIds:[],cachedIds,skippedIds,failedIds,apiError:apiErr};
        }
      }
      case '/chat-photos':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id);
        if(r.mode!=='chat')bodyErr('照片只能在手机聊天模式发送');
        const items=data.items;
        if(!Array.isArray(items)||!items.length||items.length>12)bodyErr('每次请选择 1–12 张照片');
        const prepared=items.map(item=>{
          if(item?.kind==='virtual'){
            const description=String(item.description||'').trim();
            if(!description||description.length>2000)bodyErr('照片描写需在 1–2000 字之间');
            return {kind:'virtual',description};
          }
          if(item?.kind==='gallery'&&isGalleryImage(item.data)){
            if(pub().mode!=='live')bodyErr('真实照片需要已连接的聊天视觉模型');
            return {kind:'gallery',ref:uid(),data:item.data};
          }
          bodyErr('照片格式无效');
        });
        const photos=prepared.filter(x=>x.kind==='gallery');
        if(photos.length)await saveChatPhotoBatch(photos);
        if(relation(p.id,c.id)!==r||r.status!=='matched'||r.mode!=='chat'){
          await removeChatPhotos(photos.map(x=>x.ref)).catch(()=>{});bodyErr('当前会话已改变，未发送照片');
        }
        const snapshot=JSON.stringify(db);
        try{
          const users=[];
          for(const item of prepared){
            const txt=item.kind==='virtual'?photoDescriptionText('user',item.description):'[对方发送了一张真实照片]';
            const m=write(p.id,c.id,'user','chat',txt);
            m.photo_kind=item.kind;
            if(item.kind==='virtual')m.photo_description=item.description;else m.photo_ref=item.ref;
            event(p.id,c.id,'user_message','与 '+p.name+' 的聊天：'+txt.slice(0,180));
            enqueue(p.id,c.id,m.id,txt);
            users.push(m);
          }
          save();
          const queue=queueInfo(p.id,c.id);
          return {users,queue,queued:true,paused:Boolean(queue.paused),taskState:getTaskState(p.id,c.id,'chat')};
        }catch(e){
          db=JSON.parse(snapshot);
          await removeChatPhotos(photos.map(x=>x.ref)).catch(()=>{});
          throw e;
        }
      }
      case '/chat-photo-read':{
        const p=getP(data.profileId),c=getC(data.characterId);
        requireMatch(p.id,c.id);
        const m=messagesOf(p.id,c.id).find(x=>x.id===data.messageId&&x.photo_kind==='gallery'&&x.photo_ref&&x.engine!=='recalled'&&!x.recalled);
        if(!m)bodyErr('照片不存在或已撤回');
        return {data:await readChatPhoto(m.photo_ref)};
      }
      case '/message':case '/reply':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id),mode=r.mode;
        if(mode==='meeting'&&meetingRerolls.has(pairKey(p.id,c.id)))bodyErr('正在重 Roll，请等待当前一幕完成');
        // /message and /reply may be called by older cached pages carrying
        // a stale location field. Only the explicit /mode location editor
        // is authorized to confirm a manual position change.
        let user=null;
        if(route==='/message'){
          const txt=String(data.text||'').trim();if(!txt||txt.length>4000)bodyErr('消息长度需在 1–4000 字之间');
          user=write(p.id,c.id,'user',mode,txt,'human',0,mode==='chat'?String(data.quoteMessageId||''):'');
          if(mode==='meeting')activeMeetingLocationHistory(p,c);
          detectAndApplyCorrection(p,c,user);
          event(p.id,c.id,'user_message','与 '+p.name+' 的'+(mode==='meeting'?'见面':'聊天')+'：'+txt.slice(0,180));
          if(mode==='chat'){
            const queue=enqueue(p.id,c.id,user.id,txt);
            save();
            return {user,reply:null,replies:[],queued:true,paused:Boolean(queue.paused),taskState:getTaskState(p.id,c.id,'chat'),mode,queue,autoMeeting:null,auto_meeting:false};
          }
          const meetTs=getTaskState(p.id,c.id,'meeting');
          if(meetTs&&meetTs.status==='paused'&&!data.forceResume){
            meetTs.pending_ids=[...(meetTs.pending_ids||[]),user.id];
            meetTs.latest_text=txt;
            meetTs.updated_at=stamp();
            save();
            return {user,reply:null,replies:[],queued:true,paused:true,taskState:meetTs,mode};
          }
          save();
        }
        const qi=queueInfo(p.id,c.id);
        if(mode==='chat'&&(qi.count||qi.status==='inflight'))return await flushQueue(p,c,true);
        const ep=route==='/message'?(mode==='meeting'?'meeting_message':'chat_message'):(mode==='meeting'?'meeting_continue':'chat_continue');
        const response=await produceReply(p,c,mode,user,ep);
        if(mode==='meeting'&&r.active_meeting_id&&response.reply){
          const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
          if(mMsgs.length)upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location||'');
        }
        if(response.reply)r.updated_at=stamp();
        save();
        return {
          user,
          reply:response.reply,
          replies:response.replies||[],
          paused:Boolean(response.paused),
          inflight:Boolean(response.inflight),
          deduplicated:Boolean(response.deduplicated),
          apiError:response.apiError||null,
          taskState:response.taskState||getTaskState(p.id,c.id,mode),
          auto_meeting:false,
          mode,
          warning:response.warning||''
        };
      }
      case '/presets':return {
        entries:db.presets.slice().sort((a,b)=>a.mode.localeCompare(b.mode)||a.sort_order-b.sort_order),
        diagnostics:{chat:diagnosePresets('chat'),meeting:diagnosePresets('meeting')}
      };
      case '/preset-import':{
        const how=data.import_mode;if(!['append','replace'].includes(how))bodyErr('请选择追加或替换预设');
        const {modes,entries}=validatePresetPackage(data.preset);
        let next=how==='replace'?db.presets.filter(x=>!modes.includes(x.mode)):db.presets.slice();
        for(const mode of modes){
          const offset=Math.max(-1,...next.filter(x=>x.mode===mode).map(x=>x.sort_order))+1;
          entries.filter(x=>x.mode===mode).sort((a,b)=>a.sort_order-b.sort_order).forEach((x,i)=>next.push({...x,id:uid(),sort_order:offset+i}));
        }
        db.presets=next;save();return {ok:true,imported:entries.length,modes,diagnostics:{chat:diagnosePresets('chat'),meeting:diagnosePresets('meeting')}};
      }
      case '/preset':{
        if(data.action==='delete'){db.presets=db.presets.filter(x=>x.id!==data.id);save();return {ok:true,diagnostics:{chat:diagnosePresets('chat'),meeting:diagnosePresets('meeting')}}}
        if(data.action==='order'){(data.ids||[]).forEach((id,i)=>{const x=db.presets.find(p=>p.id===id);if(x)x.sort_order=i});save();return {ok:true,diagnostics:{chat:diagnosePresets('chat'),meeting:diagnosePresets('meeting')}}}
        if(data.action==='disable_defaults'){
          const targetMode=data.mode||'meeting';
          for(const x of db.presets){
            if(x.mode===targetMode&&(DEFAULT_PRESET_IDS.has(x.id)||(x.name==='面对面 · 小说模式'||x.name==='线下见面 · 小说模式'||x.name==='克制与连贯')&&!x.group)){
              x.enabled=false;
            }
          }
          save();return {ok:true,diagnostics:{chat:diagnosePresets('chat'),meeting:diagnosePresets('meeting')}};
        }
        if(data.action==='deduplicate'){
          const targetMode=data.mode||'meeting';
          const seen=new Set();
          db.presets=db.presets.filter(x=>{
            if(x.mode!==targetMode)return true;
            const k=`${x.role}::${String(x.name||'').trim()}::${String(x.content||'').trim().slice(0,240)}`;
            if(seen.has(k))return false;
            seen.add(k);
            return true;
          });
          save();return {ok:true,diagnostics:{chat:diagnosePresets('chat'),meeting:diagnosePresets('meeting')}};
        }
        const mode=data.mode||'chat',role=data.role||'system';if(!['chat','meeting'].includes(mode)||!['system','user','assistant'].includes(role))bodyErr('预设模式不正确');const old=db.presets.find(x=>x.id===data.id),id=old?.id||uid();const nameStr=String(data.name||'新条目').slice(0,100);const groupStr=String(data.group??old?.group??inferPresetGroup({name:nameStr})??'').trim().slice(0,70);const obj={id,mode,name:nameStr,group:groupStr,source_id:old?.source_id||'',origin:old?.origin||'parallel',role,content:String(data.content||'').slice(0,60000),enabled:!!data.enabled,sort_order:old?.sort_order??(Math.max(-1,...db.presets.filter(x=>x.mode===mode).map(x=>x.sort_order))+1)};if(old)Object.assign(old,obj);else db.presets.push(obj);save();return {ok:true,id,diagnostics:{chat:diagnosePresets('chat'),meeting:diagnosePresets('meeting')}};
      }
      case '/system-logs':{
        await logReady;
        const modeFilter=String(params.get('mode')||data.mode||'').trim();
        return {logs:logState.logs.filter(l=>!modeFilter||l.mode===modeFilter),enabled:logState.enabled,storage:logStorage};
      }
      case '/system-logs-settings':{
        await logReady;
        if(!('enabled' in data))return {enabled:logState.enabled,storage:logStorage};
        logState.enabled=Boolean(data.enabled);
        await persistLogState();
        return {ok:true,enabled:logState.enabled,storage:logStorage};
      }
      case '/system-logs-clear':{
        await logReady;
        const logId=String(data.id||'').trim();
        logState.logs=logId?logState.logs.filter(l=>l.id!==logId):[];
        await persistLogState();
        return {ok:true,count:logState.logs.length};
      }
      case '/portrait':{
        const c=getC(data.characterId||params.get('characterId'));
        const cached=db.portraits[c.id];if(cached&&!data.regenerate)return {portrait:cached,engine:'cached'};
        const s=db.connection;
        const startedMs=Date.now();
        const logBase={
          id:'log_'+uid(),
          created_at:stamp(),
          character_id:c.id,
          character_name:c.name,
          mode:'portrait',
          entry_point:'portrait',
          model:s.image_model||'',
          endpoint:(s.image_base_url||'')+'/images/generations'
        };
        if(!s.image_base_url||!s.image_api_key||!s.image_model){
          throwApiError({
            error_code:'IMAGE_CONFIG_MISSING',
            http_status:0,
            title:'图片生成 API 配置不完整',
            message:'尚未填写完整的图片生成 API 链接、密钥与模型，请前往「终端」配置。',
            suggest_terminal:true
          },logBase,startedMs);
        }
        const b=s.image_base_url.trim().replace(/\/+$/,'');
        const promptTxt=`Candid dating app profile portrait photo of ${c.name} from ${c.source} (${c.version}). Character context: ${c.canon}. Natural lighting, authentic lifestyle photography, high quality portrait, no text or watermarks.`;
        let res;
        try{res=await fetch(b+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.image_api_key},body:JSON.stringify({model:s.image_model,prompt:promptTxt,n:1,size:'1024x1024'})})}
        catch(e){
          throwApiError({
            error_code:'NETWORK_ERROR',
            http_status:0,
            title:'无法连接图片生成接口',
            message:'浏览器无法直连图片生成接口（可能是网络异常或 CORS 跨域限制）。',
            detail:String(e?.message||e),
            suggest_terminal:true
          },logBase,startedMs);
        }
        if(!res.ok){
          const {rawText}=await readResTextAndJson(res);
          const classified=classifyHttpStatusError(res.status,rawText,res);
          throwApiError(classified,logBase,startedMs,{raw_response:rawText});
        }
        const {data:j,parseErr}=await readResTextAndJson(res);
        if(parseErr||!j){
          throwApiError({error_code:'INVALID_RESPONSE_JSON',http_status:res.status,title:'图片接口返回了无效 JSON',message:'无法解析图片接口响应数据。'},logBase,startedMs);
        }
        const item=(j?.data||[])[0]||{};
        const uri=item.b64_json?('data:image/png;base64,'+item.b64_json):(item.url||'');
        if(!uri){
          throwApiError({error_code:'EMPTY_IMAGE_DATA',http_status:res.status,title:'图片接口未返回图像',message:'响应中不包含可用的 url 或 b64_json 图像数据。'},logBase,startedMs,{raw_response:j});
        }
        db.portraits[c.id]=uri;save();
        return {portrait:uri,engine:'live-image'};
      }
      case '/photo-description':{
        const c=getC(data.characterId||params.get('characterId'));
        const old=db.photoDescriptions[c.id];if(old&&!data.regenerate&&(old.engine==='live-text'||pub().mode!=='live'))return {description:old.description,engine:old.engine};
        let description=photoText(c),engine='curated-demo';
        if(pub().mode==='live'){
          const instructions=`描述一张交友软件上虚构原作角色上传的照片（80至150个简体汉字），只描写画面中的外貌、姿态、光影、服饰和场景，保持人设与时期准确，不公开秘密，不编造重大剧情。${c.name}，${c.source}，${c.version}，设定：${c.canon}`;
          description=(await llm([{role:'system',content:instructions},{role:'user',content:'描述这张照片。'}],{character:c,mode:'photo',entry_point:'photo_description'})).slice(0,1200);engine='live-text';
        }
        db.photoDescriptions[c.id]={description,engine};save();return {description,engine};
      }
      default:bodyErr('未实现请求：'+route);
    }
  }
  window.ParallelOffline={
    request,
    stripProtocolTags,
    cleanChatBubbleText,
    storedChatText,
    isChatArtifact,
    episodeGroups,episodeSignature,parseEpisodeResult,episodeChunks,
    isLegacyErrorArtifact,
    detectProxyWrappedError,
    cleanMeetingNovelText,
    splitChatBubbles,
    guardChatReasoning,
    parseChatPhoto, resolveChatPhotoInput, maskPhotoInput,
    sanitizeStoredData,
    diagnosePresets,
    getTaskState,
    getSystemLogs:()=>logState.logs.slice(),
    computeContentVersion,
    analyzeTranslationNeed,
    needsChineseTranslation,
    buildCharacterLanguageDirective,
    buildBatchTranslationMessages,
    parseTranslationBatchResponse,
    buildPromptPreview:(pid,cid,mode='chat',opts={})=>prompt(getP(pid),getC(cid),mode,Array.isArray(opts?.pendingIds)?opts.pendingIds:(queueInfo(pid,cid).pendingIds||[]),opts),
    get storageAvailable(){return storageAvailable},
    exportData:()=>{const copy=JSON.parse(JSON.stringify(db));copy.connection.api_key='';copy.connection.image_api_key='';copy.connection.archive_api_key='';delete copy.systemLogs;return JSON.stringify({format:'parallel-portable-backup',schemaVersion:1,createdAt:stamp(),data:copy},null,2)},
    async exportDataWithPhotos(){
      const pack=JSON.parse(this.exportData());
      const refs=[...new Set(pack.data.messages.filter(m=>m.photo_kind==='gallery'&&!m.recalled&&m.engine!=='recalled'&&m.photo_ref).map(m=>m.photo_ref))];
      pack.chatPhotoFiles=[];
      let size=JSON.stringify(pack).length;
      for(const ref of refs){
        const data=await readChatPhoto(ref);
        size+=data.length+150;
        if(size>100*1024*1024)bodyErr('含真实照片的备份超过 100 MB，请先减少照片数量或导出文字存档');
        pack.chatPhotoFiles.push({ref,data});
      }
      return JSON.stringify(pack);
    },
    async importDataWithPhotos(raw){
      if(typeof raw!=='string'||raw.length>100*1024*1024)bodyErr('备份体积过大');
      let pack;try{pack=JSON.parse(raw)}catch{bodyErr('不是有效 JSON 文件')}
      if(!Object.prototype.hasOwnProperty.call(pack,'chatPhotoFiles'))return this.importData(raw);
      if(pack.format!=='parallel-portable-backup'||pack.schemaVersion!==1||!Array.isArray(pack.data?.messages)||!Array.isArray(pack.chatPhotoFiles))bodyErr('照片备份格式无效');
      const byRef=new Map();
      for(const row of pack.chatPhotoFiles){
        if(typeof row?.ref!=='string'||!row.ref||byRef.has(row.ref)||!isGalleryImage(row.data))bodyErr('照片备份数据无效');
        byRef.set(row.ref,{ref:uid(),data:row.data});
      }
      const needed=new Set();
      for(const m of pack.data.messages){
        if(m.photo_kind!=='gallery'||m.recalled||m.engine==='recalled')continue;
        const row=byRef.get(m.photo_ref);
        if(!row)bodyErr('备份缺少聊天照片，已停止覆盖存档');
        needed.add(m.photo_ref);m.photo_ref=row.ref;
      }
      const rows=[...needed].map(ref=>byRef.get(ref));
      delete pack.chatPhotoFiles;
      const metadata=JSON.stringify(pack);
      if(metadata.length>20*1024*1024)bodyErr('文字存档体积过大');
      if(rows.length)await saveChatPhotoBatch(rows);
      try{return this.importData(metadata)}catch(e){await removeChatPhotos(rows.map(row=>row.ref)).catch(()=>{});throw e;}
    },
    importData:(raw)=>{
      if(typeof raw!=='string'||raw.length>20*1024*1024)bodyErr('备份体积过大');
      let pack;try{pack=JSON.parse(raw)}catch{bodyErr('不是有效 JSON 文件')}
      if(pack.format!=='parallel-portable-backup'||pack.schemaVersion!==1||!pack.data)bodyErr('这不是 Parallel 单 HTML 版的备份');
      const loaded=pack.data;
      if(!Array.isArray(loaded.profiles)||!Array.isArray(loaded.messages)||!Array.isArray(loaded.events)||!Array.isArray(loaded.presets)||!loaded.connection||typeof loaded.relations!=='object'||!loaded.swipes||typeof loaded.swipes!=='object')bodyErr('备份数据缺少必要字段');
      loaded.connection.api_key='';
      loaded.connection.image_api_key='';
      loaded.connection.archive_api_key='';
      delete loaded.systemLogs;
      ensureDbFields(loaded);
      const previous=db;
      db=loaded;try{save();syncDiscoveredCatalog(db);}catch(e){db=previous;syncDiscoveredCatalog(db);throw e;}return {profiles:db.profiles.length,messages:db.messages.length};
    }
  };
})();
