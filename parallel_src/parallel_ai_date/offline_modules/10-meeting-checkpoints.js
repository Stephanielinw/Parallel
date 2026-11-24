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
  async function runMeetingCheckpoints(p,c,mid){
    if(!mid)return [];
    const groups=completedMeetingGroups(p.id,c.id,mid),total=Math.floor(groups.length/50),done=[];
    for(let index=1;index<=total;index++){
      const block=groups.slice((index-1)*50,index*50),signature=meetingBlockSignature(block);
      const current=(db.meetingCheckpoints||[]).find(x=>x.profile_id===p.id&&x.character_id===c.id&&x.meeting_id===mid&&x.block_index===index);
      if(current?.source_signature===signature){done.push(current);continue;}
      let data;
      if(pub().mode==='live'){
        const raw=await llm([
          {role:'system',content:'你是小说见面场景的事实档案员，只总结真实写出的事实。严格按时间顺序，记录场景地点、实际行为、重要对话、尚未解决的事情、改约/取消、状态变化，不得替玩家补写动作或臆测。只输出 JSON：{"summary":"300至500字中文纪实","participants":["真实出场人物"],"keywords":["2至14个准确的具体事件关键词"],"key_dialogues":[{"message_id":"原文ID","quote":"从该条原文复制的准确连续短句"}],"details":["5至18条清楚具体、有后续意义的已发生事件"]}。关键对话逐字摘录并带来源ID，不得编造。'},
          {role:'user',content:'第'+index+'段，完整互动50组。人物：'+p.name+'、'+c.name+'。每行附原文ID、时间。\n'+meetingCheckpointSource(block,p,c)}
        ],{json_mode:true,profile:p,character:c,mode:'archive',entry_point:'meeting_checkpoint',background:true,temperature:0.25});
        data=JSON.parse(raw);
      }else{
        const first=block[0][0],last=block.at(-1).at(-1);
        data={summary:'与 '+p.name+' 进行50组面对面互动。开头「'+String(first.text||'').replace(/\s+/g,' ').slice(0,80)+'」，结束于「'+String(last.text||'').replace(/\s+/g,' ').slice(0,80)+'」。离线暂存小结，细节须核对现场原文。',keywords:extractMemoryTags(block.map(g=>g.find(m=>m.sender==='user')?.text||'').join(' '),10),details:[],key_dialogues:[]};
      }
      if(!archiveStoredCurrent())throw Error('阶段小结生成期间其他标签页改变了存档');
      const latest=completedMeetingGroups(p.id,c.id,mid).slice((index-1)*50,index*50);
      if(latest.length!==50||meetingBlockSignature(latest)!==signature)throw Error('阶段小结生成期间原文已变化');
      const cp=normalizedMeetingCheckpoint(data,p,c,mid,index,latest,signature);
      db.meetingCheckpoints=db.meetingCheckpoints.filter(x=>!(x.profile_id===p.id&&x.character_id===c.id&&x.meeting_id===mid&&x.block_index===index));
      db.meetingCheckpoints.push(cp);
      appendEpisodicMemory({owner_id:c.id,profile_id:p.id,source_type:'meeting_checkpoint',source_key:'meeting-checkpoint:'+mid+':'+index,
        meeting_id:mid,knowledge_mode:'experienced',summary:'与 '+p.name+' 的第'+cp.round_start+'–'+cp.round_end+'组见面：'+cp.summary,
        tags:['见面',...cp.keywords],importance:4,emotional_weight:3,raw_msg_ids:cp.message_ids,
        meeting_data:{block_index:index,key_dialogues:cp.key_dialogues,details:cp.details},event_at:cp.ended_at});
      save();done.push(cp);
    }
    return done;
  }
  async function ensureMeetingCheckpoints(p,c,mid){
    if(!mid)return [];
    const key=pairKey(p.id,c.id)+'|'+mid;
    const prior=meetingCheckpointJobs.get(key);
    if(prior)return await prior;
    const job=runMeetingCheckpoints(p,c,mid);
    meetingCheckpointJobs.set(key,job);
    try{return await job;}
    finally{if(meetingCheckpointJobs.get(key)===job)meetingCheckpointJobs.delete(key);}
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
