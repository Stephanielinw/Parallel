  const STOPWORDS=new Set(['今天','昨天','明天','我们','你们','他们','什么','怎么','可以','觉得','知道','没有','就是','一个','还是','因为','所以','如果','已经','现在','这样','那样','哈哈','呵呵','嗯嗯','好的','好吧','不是','不要','不会','不能','自己','这里','那里','时候','地方','东西','事情','问题','真的','其实','或者','而且','然后','不过','但是','只是','虽然','一下','一点','一些','一直','一起','起来','出来','过来','进去','回去','看着','听着','说着','想着','请问','谢谢','你好','再见','晚安','早安','手机','消息','短信','见面','回应','陈述','对话','文字','对方','角色']);
  const extractQueryTerms=text=>{
    if(!text)return [];
    const s=String(text).toLocaleLowerCase(),terms=[],seen=new Set();
    for(const m of s.matchAll(/[a-z0-9]{2,}/g)){
      const w=m[0];if(!STOPWORDS.has(w)&&!seen.has(w)){seen.add(w);terms.push(w);}
    }
    for(const m of s.matchAll(/[\u4e00-\u9fff]{2,}/g)){
      const chunk=m[0];
      if(chunk.length>=2&&chunk.length<=4&&!STOPWORDS.has(chunk)&&!seen.has(chunk)){seen.add(chunk);terms.push(chunk);}
      for(let i=0;i<chunk.length-1;i++){
        const bg=chunk.slice(i,i+2);
        if(!STOPWORDS.has(bg)&&!seen.has(bg)){seen.add(bg);terms.push(bg);}
      }
    }
    return terms.slice(0,32);
  };
  const extractMemoryTags=(text,limit=6)=>extractQueryTerms(text).filter(t=>t.length>=2).slice(0,limit);
  const appendEpisodicMemory=({owner_id,profile_id,source_type,source_key,knowledge_mode='stated',summary='',tags=null,importance=2,emotional_weight=2,unresolved=0,clarifies_id='',disputed=0,raw_msg_ids=[],meeting_id='',meeting_data=null,event_at=null})=>{
    if(!owner_id||!profile_id||!summary)return null;
    const summaryClean=(source_type==='correction'||source_type==='manual'?String(summary).trim():stripProtocolTags(String(summary),{preserveParagraphs:false})).slice(0,280);
    const tagsClean=(tags||extractMemoryTags(summaryClean)).map(t=>String(t).slice(0,24)).filter(Boolean).slice(0,8);
    const imp=Math.max(1,Math.min(5,Number(importance)||2));
    const emo=Math.max(1,Math.min(5,Number(emotional_weight)||2));
    const nowStr=stamp(),evAt=event_at||nowStr;
    const existing=db.episodicMemories.find(x=>x.owner_id===owner_id&&x.profile_id===profile_id&&x.source_key===source_key);
    const item={
      id:existing?.id||uid(),
      owner_id,
      profile_id,
      source_type,
      memory_type:source_type==='daily-summary'?'daily_summary':source_type,
      source_key,
      knowledge_mode,
      summary:summaryClean,
      tags:tagsClean,
      importance:imp,
      emotional_weight:emo,
      unresolved:unresolved?1:0,
      clarifies_id:String(clarifies_id||''),
      disputed:disputed?1:0,
      raw_msg_ids:(raw_msg_ids||[]).map(String).filter(Boolean).slice(0,24),
      meeting_id:String(meeting_id||existing?.meeting_id||''),
      meeting_data:meeting_data||existing?.meeting_data||null,
      event_at:evAt,
      created_at:nowStr
    };
    if(existing)Object.assign(existing,item);
    else db.episodicMemories.push(item);
    return item.id;
  };
  const PROMISE_KEYWORDS=['约定','答应','下次','周末','明天见','约好','等你','不见不散','一起去','什么时候见','最喜欢','最讨厌','过敏','生日','秘密','记住','别忘'];
  const recordDialogueEpisode=(p,c,userMsgs,aiMsg,mode)=>{
    if(!aiMsg||mode==='meeting')return null;
    const uTexts=(userMsgs||[]).map(m=>String(m?.text??'').trim()).filter(Boolean);
    const uJoined=uTexts.join(' / ').slice(0,110);
    const aText=cleanChatBubbleText(String(aiMsg.text||'')).slice(0,110);
    const combined=uJoined+' '+aText;
    const hasPromiseOrFact=PROMISE_KEYWORDS.some(w=>combined.includes(w));
    if(!hasPromiseOrFact)return null;
    const unres=['下次','改天','明天','周末','约好','约定','答应','等你','一起去','不见不散'].some(w=>combined.includes(w))?1:0;
    const summary=uJoined?`与 ${p.name} 聊到约定/重点：「${uJoined.slice(0,75)}」（${c.name}回应：「${aText.slice(0,65)}」）`:`${c.name}提到：「${aText.slice(0,100)}」`;
    const rawIds=[...(userMsgs||[]).map(m=>m?.id).filter(Boolean),aiMsg.id];
    return appendEpisodicMemory({
      owner_id:c.id,
      profile_id:p.id,
      source_type:'dialogue',
      source_key:'turn:'+aiMsg.id,
      knowledge_mode:'stated',
      summary,
      tags:extractMemoryTags(uJoined||aText,6),
      importance:4,
      emotional_weight:3,
      unresolved:unres,
      raw_msg_ids:rawIds,
      event_at:aiMsg.created_at||stamp()
    });
  };
  const CORRECTION_PATTERNS=['不，我们没有','我们没有过','没有过','你记错了','记错了','记岔了','搞错了','不是在','没去过','从来没','并没有','没有这回事','那是别人','你认错人了'];
  const detectAndApplyCorrection=(p,c,userMsg)=>{
    const txt=String(userMsg?.text||'').trim();
    if(!txt||!CORRECTION_PATTERNS.some(pat=>txt.includes(pat)))return null;
    const pid=p.id,cid=c.id,qTerms=new Set(extractQueryTerms(txt));
    const candidates=db.episodicMemories.filter(x=>x.owner_id===cid&&x.profile_id===pid&&x.source_type!=='correction'&&!x.disputed).sort((a,b)=>b.event_at.localeCompare(a.event_at)).slice(0,30);
    let target=null,bestScore=-1;
    candidates.forEach((r,idx)=>{
      const rTerms=new Set([...extractQueryTerms(r.summary),...(r.tags||[])]);
      let overlap=0;for(const t of qTerms)if(rTerms.has(t))overlap++;
      const score=overlap*4+(idx===0?1:0);
      if(score>bestScore){bestScore=score;target=r;}
    });
    if(target){target.disputed=1;target.unresolved=0;}
    return appendEpisodicMemory({
      owner_id:cid,
      profile_id:pid,
      source_type:'correction',
      source_key:'corr:'+userMsg.id,
      knowledge_mode:'clarified',
      summary:`${p.name}明确澄清/纠正：${txt.slice(0,160)}（相关旧说法已标记存疑，不再作为既定事实）`,
      tags:extractMemoryTags(txt,6),
      importance:5,
      emotional_weight:4,
      unresolved:0,
      clarifies_id:target?.id||'',
      raw_msg_ids:[userMsg.id],
      event_at:userMsg.created_at||stamp()
    });
  };
