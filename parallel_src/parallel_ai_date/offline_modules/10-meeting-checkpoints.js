  const MEETING_CHECKPOINT_INTERVAL=50;
  const meetingCheckpointJobs=new Map();
  function completedMeetingGroups(pid,cid,mid){
    const rows=messagesOf(pid,cid).filter(m=>m.mode==='meeting'&&m.meeting_id===mid&&!m.recalled&&m.engine!=='recalled'&&!isChatArtifact(m));
    const groups=[];
    for(const m of rows){
      const last=groups.at(-1);
      if(m.sender==='user'){
        if(!last||last.some(x=>x.sender==='ai'))groups.push([m]);
        else last.push(m);
      }else if(m.sender==='ai'){
        if(!last)groups.push([m]);else last.push(m);
      }
    }
    return groups.filter(g=>g.some(m=>m.sender==='user')&&g.some(m=>m.sender==='ai'));
  }
  function meetingBlockSignature(groups){
    let hash=2166136261,len=0;
    for(const m of groups.flat()){
      const line=String(m.id)+'\u0000'+String(m.text||'')+'\u0001';
      len+=line.length;
      for(let i=0;i<line.length;i++)hash=Math.imul(hash^line.charCodeAt(i),16777619)>>>0;
    }
    return len+':'+hash.toString(16);
  }
  function validMeetingCheckpoints(pid,cid,mid,groups=null){
    const full=groups||completedMeetingGroups(pid,cid,mid),valid=[];
    for(const cp of db.meetingCheckpoints||[]){
      if(cp.profile_id!==pid||cp.character_id!==cid||cp.meeting_id!==mid)continue;
      const validSource=cp.kind==='scene_transition'
        ?isValidMeetingSceneCheckpoint(cp,pid,cid,mid)
        :(full.slice((cp.block_index-1)*50,cp.block_index*50).length===50&&
          cp.source_signature===meetingBlockSignature(full.slice((cp.block_index-1)*50,cp.block_index*50)));
      if(!validSource){
        const source=cp.kind==='scene_transition'
          ?'meeting-scene:'+mid+':'+cp.transition_message_id
          :'meeting-checkpoint:'+mid+':'+cp.block_index;
        const mem=db.episodicMemories.find(m=>m.owner_id===cid&&m.profile_id===pid&&m.source_key===source);
        if(mem)mem.archive_stale=true;
      }else valid.push(cp);
    }
    return valid.sort((x,y)=>Date.parse(x.ended_at)-Date.parse(y.ended_at));
  }
  function pruneMeetingCheckpoints(pid,cid,mid=''){
    const groupsByMeeting=new Map(),removed=[];
    db.meetingCheckpoints=(db.meetingCheckpoints||[]).filter(cp=>{
      if(cp.profile_id!==pid||cp.character_id!==cid||(mid&&cp.meeting_id!==mid))return true;
      if(!groupsByMeeting.has(cp.meeting_id))groupsByMeeting.set(cp.meeting_id,completedMeetingGroups(pid,cid,cp.meeting_id));
      const full=groupsByMeeting.get(cp.meeting_id);
      const part=full.slice((cp.block_index-1)*50,cp.block_index*50);
      const valid=cp.kind==='scene_transition'
        ?isValidMeetingSceneCheckpoint(cp,pid,cid,cp.meeting_id)
        :(part.length===50&&cp.source_signature===meetingBlockSignature(part));
      if(!valid)removed.push(cp.kind==='scene_transition'
        ?'meeting-scene:'+cp.meeting_id+':'+cp.transition_message_id
        :'meeting-checkpoint:'+cp.meeting_id+':'+cp.block_index);
      return valid;
    });
    if(removed.length)db.episodicMemories=db.episodicMemories.filter(m=>m.profile_id!==pid||m.owner_id!==cid||!removed.includes(m.source_key));
    return removed.length;
  }
  // Scene transitions replace the old fixed 50-group trigger. Each section is
  // sourced from the recorded message IDs and the *actual meeting* location
  // history (not a projected surveillance slot).
  function meetingSceneStages(p,c,mid){
    const rows=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===mid&&
      m.engine!=='recalled'&&!m.recalled&&!isChatArtifact(m));
    const relationRow=relation(p.id,c.id);
    const active=relationRow?.mode==='meeting'&&relationRow.active_meeting_id===mid;
    const record=(db.meetings||[]).find(m=>m.id===mid&&m.profile_id===p.id&&m.character_id===c.id);
    const history=active?activeMeetingLocationHistory(p,c):(record?.location_history||[]);
    let start=0,from=history[0]?.location||record?.location||'见面地点待确认';
    const results=[];
    for(const event of history.slice(1)){
      if(!event.message_id||!['scene','ai_scene'].includes(event.source))continue;
      const index=rows.findIndex(m=>m.id===event.message_id);
      if(index<start||index<0||!event.location||event.location===from)continue;
      const segment=rows.slice(start,index),transition=rows[index],location=event.location;
      results.push({
        index:results.length+1,from_location:from,to_location:location,
        transition_message_id:event.message_id,transition,
        messages:segment,message_ids:segment.map(m=>m.id),
        source_signature:meetingBlockSignature([segment, [transition]])+'|'+from+'|'+location
      });
      start=index;from=location;
    }
    return results;
  }
  function isValidMeetingSceneCheckpoint(cp,pid,cid,mid){
    const p=db.profiles.find(x=>x.id===pid),c=byId.get(cid);
    if(!p||!c||cp.kind!=='scene_transition')return false;
    const matching=meetingSceneStages(p,c,mid).find(s=>s.transition_message_id===cp.transition_message_id);
    return Boolean(matching&&matching.messages.length&&
      matching.from_location===cp.from_location&&matching.to_location===cp.to_location&&
      matching.source_signature===cp.source_signature&&
      JSON.stringify(matching.message_ids)===JSON.stringify(cp.message_ids));
  }
  function meetingCheckpointSource(groups,p,c){
    return groups.flat().map(m=>{
      const body=String(m.text||'').replace(/\s+/g,' ').trim(),max=m.sender==='user'?300:480;
      const excerpt=body.length<=max?body:body.slice(0,Math.ceil(max*.65))+' … '+body.slice(-Math.floor(max*.35));
      return '['+m.id+' @ '+String(m.created_at||'').slice(0,19)+'] '+(m.sender==='user'?p.name:c.name)+'：'+excerpt;
    }).join('\n');
  }
  function normalizedMeetingCheckpoint(data,p,c,mid,index,block,signature){
    const src=block.flat(),byId=new Map(src.map(m=>[m.id,m]));
    const clean=v=>stripProtocolTags(String(v||''),{preserveParagraphs:false}).trim();
    const summary=clean(data?.summary).slice(0,560);
    if(summary.length<12)throw Error('见面阶段小结缺少有效梗概');
    const keywords=(Array.isArray(data?.keywords)?data.keywords:[]).map(x=>clean(x).slice(0,22)).filter(x=>x.length>=2).slice(0,14);
    const details=(Array.isArray(data?.details)?data.details:[]).map(x=>clean(x).slice(0,160)).filter(Boolean).slice(0,18);
    const keyDialogues=(Array.isArray(data?.key_dialogues)?data.key_dialogues:[]).map(x=>{
      const m=byId.get(String(x?.message_id||'')),quote=clean(x?.quote).slice(0,150);
      return m&&quote&&String(m.text||'').includes(quote)?{message_id:m.id,speaker:m.sender==='user'?p.name:c.name,quote}:null;
    }).filter(Boolean).slice(0,10);
    const participants=[p.name,c.name,...(Array.isArray(data?.participants)?data.participants:[])]
      .map(x=>clean(x).slice(0,40)).filter(Boolean).filter((x,i,arr)=>arr.indexOf(x)===i).slice(0,12);
    return {id:'checkpoint:'+mid+':'+index,profile_id:p.id,character_id:c.id,meeting_id:mid,block_index:index,
      round_start:(index-1)*50+1,round_end:index*50,started_at:src[0].created_at,ended_at:src.at(-1).created_at,
      participants,summary,keywords,details,key_dialogues:keyDialogues,message_ids:src.map(x=>x.id),
      source_signature:signature,created_at:stamp()};
  }
  // M11: one factual scene recap is generated AFTER an observed location
  // transition, not after an arbitrary number of conversational turns.
  async function generateMeetingSceneSummary(p,c,stage){
    if(pub().mode!=='live'){
      return {summary:'在「'+stage.from_location+'」的这一段现场原文已保存（'+stage.messages.length+
        '条）；这是离线占位记录，具体互动请核对对应原文。',source:'fallback'};
    }
    const chunks=meetingSummaryChunks(stage.messages,p,c);
    const pieces=[];
    for(let i=0;i<chunks.length;i++){
      const raw=await llm([
        {role:'system',content:'你是见面现场的纪实档案员，只依据原始现场记录小结刚结束的这一段场景。严格按发生顺序概括真实动作、双方确实说过的话、未完成的安排以及重要情绪变化。不要杜撰台词、地点、移动或身体接触。提议不等于行动，不能把未来路线写成已经发生。只输出 JSON {"summary":"120–350字纪实小结"}。'},
        {role:'user',content:'这一场景的实际位置是「'+stage.from_location+'」，后来有现场证据确认进入「'+stage.to_location+'」。本次只总结转场之前的原始互动，第'+(i+1)+'/'+chunks.length+'段：\n'+chunks[i]}
      ],{json_mode:true,profile:p,character:c,mode:'archive',entry_point:'meeting_scene_checkpoint',
        background:true,temperature:0.2,max_tokens:1300,min_output_tokens:320});
      const parsed=JSON.parse(raw),part=stripProtocolTags(String(parsed?.summary||''),{preserveParagraphs:false}).trim();
      if(part.length<12)throw Error('地点变更阶段小结缺少有效内容');
      pieces.push(part);
    }
    if(pieces.length===1)return {summary:pieces[0].slice(0,850),source:'ai'};
    const raw=await llm([
      {role:'system',content:'以下是同一实际地点内按顺序记录的真实片段。只合并已发生的事实，保持关键对话和未完成问题。严禁补写没有发生的动作。只输出 JSON {"summary":"200–450字纪实小结"}。'},
      {role:'user',content:'地点：「'+stage.from_location+'」。\n'+pieces.join('\n')}
    ],{json_mode:true,profile:p,character:c,mode:'archive',entry_point:'meeting_scene_checkpoint_merge',
      background:true,temperature:0.2,max_tokens:1300,min_output_tokens:320});
    const combined=stripProtocolTags(String(JSON.parse(raw)?.summary||''),{preserveParagraphs:false}).trim();
    if(combined.length<12)throw Error('合并阶段小结缺少有效内容');
    return {summary:combined.slice(0,850),source:'ai'};
  }
  async function runMeetingSceneSummaries(p,c,mid){
    const done=[];
    for(const stage of meetingSceneStages(p,c,mid)){
      // An empty holding shot alone is not a witnessed shared encounter.
      if(!stage.messages.length||!stage.messages.some(m=>m.sender==='user'))continue;
      const existing=(db.meetingCheckpoints||[]).find(cp=>cp.kind==='scene_transition'&&
        cp.profile_id===p.id&&cp.character_id===c.id&&cp.meeting_id===mid&&
        cp.transition_message_id===stage.transition_message_id);
      if(existing&&isValidMeetingSceneCheckpoint(existing,p.id,c.id,mid)){
        done.push(existing);continue;
      }
      let generated;
      try{generated=await generateMeetingSceneSummary(p,c,stage);}
      catch(err){
        recordBgError(p.id,c.id,'meeting_scene_checkpoint',err.apiError||{message:String(err.message||err)});
        generated={source:'fallback',summary:'在「'+stage.from_location+'」的这一段原始互动已完整保存。阶段小结生成失败，请以这段现场原文为准。'};
      }
      if(!archiveStoredCurrent())throw Error('场景阶段小结生成期间其他标签页改变了存档');
      const current=meetingSceneStages(p,c,mid).find(x=>x.transition_message_id===stage.transition_message_id);
      const r=relation(p.id,c.id);
      if(!current||current.source_signature!==stage.source_signature||
        !r||r.active_meeting_id!==mid||r.mode!=='meeting')return done;
      const cp={
        id:'scene:'+mid+':'+stage.transition_message_id,kind:'scene_transition',
        profile_id:p.id,character_id:c.id,meeting_id:mid,block_index:stage.index,
        transition_message_id:stage.transition_message_id,
        from_location:stage.from_location,to_location:stage.to_location,
        round_start:Math.max(1,stage.index),round_end:stage.index,
        started_at:stage.messages[0].created_at,ended_at:stage.messages.at(-1).created_at,
        participants:[p.name,c.name],summary:generated.summary,
        keywords:extractMemoryTags(stage.messages.map(m=>m.text).join(' ').slice(0,3500),10),
        details:[],key_dialogues:[],message_ids:stage.message_ids,
        source_signature:stage.source_signature,summary_source:generated.source,created_at:stamp()
      };
      db.meetingCheckpoints=db.meetingCheckpoints.filter(x=>!(
        x.kind==='scene_transition'&&x.profile_id===p.id&&x.character_id===c.id&&x.meeting_id===mid&&
        x.transition_message_id===stage.transition_message_id));
      db.meetingCheckpoints.push(cp);
      if(generated.source==='ai'){
        appendEpisodicMemory({owner_id:c.id,profile_id:p.id,source_type:'meeting_checkpoint',
          source_key:'meeting-scene:'+mid+':'+stage.transition_message_id,
          meeting_id:mid,knowledge_mode:'experienced',
          summary:'与 '+p.name+' 在「'+stage.from_location+'」的真实见面片段：'+cp.summary,
          tags:['见面',stage.from_location,...cp.keywords],importance:4,emotional_weight:3,
          raw_msg_ids:stage.message_ids,event_at:stage.ended_at,
          meeting_data:{scene_transition:stage.transition_message_id,from_location:stage.from_location,to_location:stage.to_location}});
      }
      const monitor=getOrInitSurveillance(p,c,localDateStr(stage.transition.created_at));
      if(monitor.live_override?.meeting_id===mid){
        monitor.live_override.location=stage.to_location;
        monitor.live_override.last_scene_summary=cp.summary;
      }
      monitor.updated_at=stamp();
      save();done.push(cp);
    }
    return done;
  }
  async function ensureMeetingSceneSummaries(p,c,mid){
    if(!mid)return [];
    const key=pairKey(p.id,c.id)+'|'+mid;
    const prior=meetingCheckpointJobs.get(key);
    if(prior)return await prior;
    const job=runMeetingSceneSummaries(p,c,mid);
    meetingCheckpointJobs.set(key,job);
    try{return await job;}
    finally{if(meetingCheckpointJobs.get(key)===job)meetingCheckpointJobs.delete(key);}
  }
  // Historical 50-group checkpoint records remain readable and exportable;
  // the old threshold is no longer an automatic generation trigger.
  async function ensureMeetingCheckpoints(p,c,mid){
    return mid?validMeetingCheckpoints(p.id,c.id,mid):[];
  }
  function meetingCheckpointPromptContext(p,c,mid,query=''){
    const groups=completedMeetingGroups(p.id,c.id,mid),records=validMeetingCheckpoints(p.id,c.id,mid,groups);
    if(!records.length)return '';
    const summaries=records.map(cp=>'第'+cp.round_start+'–'+cp.round_end+'组｜'+cp.started_at+' 至 '+cp.ended_at+
      '｜人物：'+cp.participants.join('、')+'\n小结：'+cp.summary+
      '\n关键词：'+cp.keywords.join('、')+'\n关键对话：'+cp.key_dialogues.map(q=>q.speaker+'「'+q.quote+'」').join('；')+
      '\n具体内容：'+cp.details.join('；')).join('\n\n');
    const text=String(query||'').toLowerCase(),excerpts=[];
    const matches=records.map(cp=>({cp,hits:cp.keywords.filter(k=>k.length>=2&&!['我们','你们','他们','自己','这个','那个','见面','现在','刚才','今天','昨天'].includes(k)&&text.includes(k.toLowerCase()))})).filter(x=>x.hits.length);
    for(const {cp,hits} of matches.slice(-3)){
      const offset=(cp.block_index-1)*50,segment=groups.slice(offset,offset+50);
      const candidates=segment.map((g,i)=>({g,i,score:g.reduce((n,m)=>n+hits.filter(k=>String(m.text||'').toLowerCase().includes(k.toLowerCase())).length,0)}))
        .filter(x=>x.score).sort((x,y)=>y.score-x.score).slice(0,2).sort((x,y)=>x.i-y.i);
      for(const x of candidates)excerpts.push('第'+(offset+x.i+1)+'组附近原文（'+hits.join('、')+'）：\n'+meetingCheckpointSource(segment.slice(Math.max(0,x.i-1),Math.min(50,x.i+2)),p,c).slice(0,2600));
    }
    return '\n\n【本次见面 · 已归档的全部50组阶段小结】\n'+summaries+
      '\n这些是已发生的事实；最近五组对话决定当前状态，不能用旧档案覆盖当前行动。'+
      (excerpts.length?'\n\n【关键词命中的现场原文 · 带原始消息ID】\n'+excerpts.join('\n\n'):'');
  }

  // Keep complete user/assistant bursts under a soft character budget. The latest
  // burst and every pending message are protected, including across midnight.
