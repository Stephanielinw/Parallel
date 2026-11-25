  function selectTurnWindow(rows,mode,protectedIds=[],meetingMaxGroups=10){
    if(!rows.length)return [];
    const groups=[];
    for(const row of rows){
      const g=groups[groups.length-1];
      if(!g||(row.sender==='user'&&g[g.length-1].sender==='ai'))groups.push([row]);
      else g.push(row);
    }
    const protect=new Set(protectedIds||[]);
    const protectedStart=groups.findIndex(g=>g.some(m=>protect.has(m.id)));
    const budget=mode==='meeting'&&meetingMaxGroups===5?Infinity:(mode==='meeting'?36000:12000),maxGroups=mode==='meeting'?meetingMaxGroups:12;
    let cost=0,start=groups.length-1;
    for(let i=groups.length-1;i>=0;i--){
      const next=groups[i].reduce((n,m)=>n+String(m.text??'').length+40,0);
      const mustKeep=i===groups.length-1||(protectedStart>=0&&i>=protectedStart);
      if(!mustKeep&&(cost+next>budget||groups.length-i>maxGroups))break;
      start=i;cost+=next;
    }
    return groups.slice(start).flat();
  }
  const selectWorkingHistory=(pid,cid,mode='chat',excludeIds=null,protectedIds=[],at=Date.now())=>{
    const all=messagesOf(pid,cid).filter(m=>!isChatArtifact(m)&&!(excludeIds&&excludeIds.has(m.id)));
    if(mode==='meeting'){
      const r=relation(pid,cid),activeMid=r?.active_meeting_id||'';
      if(activeMid){
        const checkpointed=validMeetingCheckpoints(pid,cid,activeMid).length>0;
        return selectTurnWindow(all.filter(m=>m.mode==='meeting'&&m.meeting_id===activeMid),mode,protectedIds,checkpointed?5:10);
      }
      const trailing=[];
      for(let i=all.length-1;i>=0&&all[i].mode==='meeting';i--)trailing.unshift(all[i]);
      return selectTurnWindow(trailing,mode,protectedIds);
    }
    // A finished face-to-face meeting is a hard chronological boundary for SMS
    // generation. Older SMS remain in the archive and episodic recall, but must
    // never masquerade as the immediately preceding exchange after the meeting.
    const lastFinished=(db.meetings||[]).reduce((end,m)=>{
      if(m.profile_id!==pid||m.character_id!==cid)return end;
      const time=Date.parse(m.finished_at||m.ended_at||'');
      return Number.isFinite(time)&&time<=at?Math.max(end,time):end;
    },0);
    const protectedSet=new Set(protectedIds||[]);
    const chats=all.filter(m=>m.mode==='chat'&&(!lastFinished||Date.parse(m.created_at)>lastFinished||protectedSet.has(m.id)));
    return selectTurnWindow(chats,mode,protectedIds);
  };
  const selectPreMeetingChatContext=(pid,cid,limit=6)=>{
    const all=messagesOf(pid,cid);
    if(!all.length)return [];
    return all.filter(m=>m.mode==='chat'&&m.engine!=='recalled'&&!m.recalled&&!isChatArtifact(m)).slice(-limit);
  };
  const expandPresetMacros=(text,p,c)=>{
    return String(text??'')
      .replace(/\{\{\s*user\s*\}\}/gi,p.name)
      .replace(/\{\{\s*char\s*\}\}/gi,c.name)
      .replace(/<\s*user\s*>/gi,p.name)
      .replace(/<\s*char\s*>/gi,c.name);
  };
  const isPostHistoryPreset=entry=>{
    if(!entry)return false;
    if(entry.role!=='system')return true;
    const g=inferPresetGroup(entry).toUpperCase();
    const nm=String(entry.name||'').toUpperCase();
    return g==='COT'||g.includes('底部')||g.includes('誓约')||nm.includes('COT')||nm.includes('动笔前')||nm.includes('连续性检查')||nm.includes('底部誓约');
  };
  const event=(pid,cid,type,summary,at=0)=>{
    const nowStr=at?new Date(at).toISOString():stamp();
    const cleanSum=type==='user_message'?String(summary??'').trim():stripProtocolTags(summary,{preserveParagraphs:false});
    db.events.push({id:uid(),profile_id:pid,character_id:cid,type,summary:cleanSum.slice(0,500),created_at:nowStr});
  };
  const quoteSnapshot=(pid,cid,id)=>{
    if(!id)return null;
    const m=db.messages.find(x=>x.id===id&&x.profile_id===pid&&x.character_id===cid&&x.mode==='chat'&&!x.recalled&&x.engine!=='recalled'&&!isChatArtifact(x));
    if(!m)return null;
    return {id:m.id,sender:m.sender,text:String(m.text||'').replace(/\s+/g,' ').trim().slice(0,220)};
  };
  const write=(pid,cid,sender,mode,text,engine='human',at=0,quoteId='')=>{
    const r=relation(pid,cid);
    if(characterFrozen(pid,cid))bodyErr('角色休眠中，请先解除冻结');
    const photoDescription=sender==='ai'&&mode==='chat'&&engine==='live'?parseChatPhoto(text):'';
    const cleanTxt=photoDescription?photoDescriptionText(sender,photoDescription):(sender==='ai'&&engine!=='error'&&engine!=='recalled')
      ?(mode==='meeting'?cleanMeetingNovelText(text):(cleanChatBubbleText(text)||'…'))
      :String(text??'');
    const m={id:uid(),profile_id:pid,character_id:cid,sender,mode,text:cleanTxt,engine,meeting_id:mode==='meeting'?(r?.active_meeting_id||''):'',created_at:at?new Date(at).toISOString():stamp(),...(at?{generated_at:stamp()}: {})};
    if(sender==='user'&&mode==='chat'&&quoteId){
      const quote=quoteSnapshot(pid,cid,quoteId);
      if(!quote)bodyErr('引用的原消息已失效，请重新选择');
      m.quote=quote;
    }
    if(photoDescription){m.photo_kind='virtual';m.photo_description=photoDescription;}
    // A user can send another message while historical recovery is generating.
    // Insert recovered bubbles at their original chronological position in this pair.
    const later=at?db.messages.findIndex(row=>row.profile_id===pid&&row.character_id===cid&&Date.parse(row.created_at)>at):-1;
    if(later>=0)db.messages.splice(later,0,m);else db.messages.push(m);
    if(sender==='ai'&&mode==='chat'&&['live','demo'].includes(engine)&&!isChatArtifact(m))reconcilePhoneActivity(pid,cid,at||Date.now());
    if(at){const diary=db.diaries[pairKey(pid,cid)]?.byDate?.[localDateStr(at)];if(diary)diary.stale_after_recovery=true;}
    return m;
  };
  const rawMessagesOf=(pid,cid)=>db.messages.filter(m=>m.profile_id===pid&&m.character_id===cid);
  const messagesOf=(pid,cid)=>db.messages.filter(m=>m.profile_id===pid&&m.character_id===cid&&!isLegacyErrorArtifact(m));
  const sourceMatches=(tag,c)=>{
    let q=String(tag||'').toLocaleLowerCase().trim().replace(/\s+/g,' ').replace(/^[\s·・\-—]+|[\s·・\-—]+$/g,'');
    if(q.length<2)return false;
    const aliases={
      'resident evil':'生化危机',
      'biohazard':'生化危机',
      're':'生化危机',
      'marvel':'漫威',
      'marvel mcu':'漫威mcu',
      'mcu':'漫威mcu',
      '漫威电影':'漫威mcu',
      '漫威电影宇宙':'漫威mcu',
      '复仇者联盟':'漫威mcu',
      'the witcher':'巫师',
      'witcher':'巫师',
      '猎魔人':'巫师',
      'cyberpunk 2077':'赛博朋克 2077',
      'cyberpunk':'赛博朋克 2077',
      '赛博朋克':'赛博朋克 2077'
    };
    q=aliases[q]||q;
    q=q.replace(/^resident\s*evil\s*(\d+)$/,'生化危机$1').replace(/^re\s*(\d+)$/,'生化危机$1').replace(/^生化\s*(\d+)$/,'生化危机$1').replace(/^(?:the\s*)?witcher\s*(\d+)$/,'巫师$1').replace(/^猎魔人\s*(\d+)$/,'巫师$1');
    const clean=x=>x.replace(/[\s·・:：_.\-—]+/g,'');
    const cq=clean(q);
    const rawTarget=(c.source+' '+c.version).toLocaleLowerCase();
    const extra=[];
    if(rawTarget.includes('生化危机')){
      for(const m of c.version.matchAll(/\b(\d{1,2})\b/g))extra.push(`生化危机${m[1]} 生化${m[1]} re${m[1]} residentevil${m[1]}`);
    }
    if(rawTarget.includes('巫师')){
      for(const m of c.version.matchAll(/\b(\d{1,2})\b/g))extra.push(`巫师${m[1]} 猎魔人${m[1]} witcher${m[1]} thewitcher${m[1]}`);
    }
    if(rawTarget.includes('漫威'))extra.push('漫威电影 漫威电影宇宙 复仇者联盟 marvel mcu');
    if(rawTarget.includes('赛博朋克'))extra.push('赛博朋克2077 cyberpunk2077 2077');
    return clean(rawTarget+' '+extra.join(' ')).includes(cq);
  };
  const eligibleCandidate=(p,c)=>relation(p.id,c.id)?.status!=='matched'&&(!p.sources.length||p.sources.some(tag=>sourceMatches(tag,c)))&&p.role_character_id!==c.id&&(!p.interested_in.length||p.interested_in.includes('all')||p.interested_in.includes(c.gender))&&(!c.age||c.age>=p.min_age&&c.age<=p.max_age);
  const candidates=p=>Array.from(byId.values()).filter(c=>eligibleCandidate(p,c));
  const shuffle=a=>{const out=a.slice();for(let i=out.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;};
  const idMatches=(name,source='')=>{
    const q=name.toLowerCase().trim().replace(/\s+/g,' ');
    if(!q)return [];
    const norm=s=>s.toLowerCase().replace(/[\s·・.·\-_]+/g,'');
    const nq=norm(q);
    const aliasMap={
      '艾达王':'ada wong',
      '里昂肯尼迪':'leon s. kennedy',
      '吉尔瓦伦丁':'jill valentine',
      '克莱尔雷德菲尔德':'claire redfield',
      '克里斯雷德菲尔德':'chris redfield',
      '阿尔伯特威斯克':'albert wesker',
      '史蒂夫罗杰斯':'steve rogers',
      '巴基巴恩斯':'bucky barnes',
      '冬日战士':'bucky barnes',
      '娜塔莎罗曼诺夫':'natasha romanoff',
      '托尼斯塔克':'tony stark',
      '钢铁侠':'tony stark'
    };
    const mapped=norm(aliasMap[nq]||q);
    return Array.from(byId.values()).filter(c=>(!source||c.source===source||c.version===source||sourceMatches(source,c))&&[c.name,...c.aliases].some(a=>a.toLowerCase()===q||a.toLowerCase().split(/\s+/).includes(q)||norm(a)===nq||norm(a)===mapped||(nq.length>=2&&norm(a).includes(nq)))).slice(0,20).map(c=>({id:c.id,name:c.name,source:c.source,version:c.version,age:c.age,canon:c.canon,identity_origin:c.identity_origin||'curated'}));
  };
  // The opening camera observes the character; clicking Meet never acts for
  // the player or establishes that the two have spotted one another.
  const meetingOpeningDirection=(p,c,loc)=>
    '【第一幕 · 候场镜头（首次接触由玩家决定）】地点：「'+loc+'」。'+
    '遵守当前已启用的面对面小说预设，描写 '+c.name+' 此刻在哪儿、等待或做什么，以及环境、衣着、神情、手边物件和符合原作个性的细微动作。让玩家拥有可自主进入的具体现场。'+
    '短信约定、既有关系或“我到了”之类的话语只构成背景，不代表双方已经实际照面、认出、靠近或开始交谈。'+
    '不要描写 '+p.name+' 的到达、站位、动作、台词、身体感受、心理、选择；不要让 '+c.name+' 主动认出 '+p.name+'、走上前打招呼、触碰、邀请落座或把他们写成已经交谈。'+
    '角色可以自己看门口、继续手头活动、注意周围人流，但不要确认玩家就在视线中。停在尚未发生首次实际接触的开放状态；由玩家的下一条动作或台词决定怎么接触。'+
    '这里只限定本次开场，既不修改预设的文风、视角和篇幅，也不限制之后角色的自主行动。';
  function meetingClockContext(rel,history,now=Date.now(),rerollAt=0,currentInputId=''){
    const first=history[0]?.created_at;
    const startRaw=Date.parse(rel?.meeting_started_at||first||''),start=Number.isFinite(startRaw)?Math.min(startRaw,now):now;
    const anchor=rerollAt?Math.max(start,Math.min(now,rerollAt)):now;
    const elapsed=Math.max(0,Math.floor((anchor-start)/1000));
    // The just-submitted input is already persisted. It is not the previous scene.
    const prior=history.filter(m=>m.id!==currentInputId&&m.engine!=='recalled'&&!m.recalled)
      .map(m=>Date.parse(m.created_at||'')).filter(t=>Number.isFinite(t)&&t<=anchor&&t>=start);
    const lastAt=prior.length?Math.max(...prior):null;
    const gap=lastAt===null?null:Math.floor((anchor-lastAt)/1000);
    const zone=-new Date(anchor).getTimezoneOffset(),abs=Math.abs(zone);
    const offset='UTC'+(zone>=0?'+':'-')+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
    const hour=new Date(anchor).getHours(),period=hour<5?'凌晨':hour<12?'上午':hour<18?'下午':'晚上';
    return '【面对面现实时间规则 · 强制 1:1 · 系统事实最高优先级】应用本地现实时间：'+chatClockLabel(now)+'；本次见面实际开始：'+chatClockLabel(start)+'；本幕时间：'+chatClockLabel(anchor)+'（'+period+'，'+offset+'）；本幕距见面开始 '+elapsed+' 秒（约 '+Math.floor(elapsed/60)+' 分钟），'+(gap===null?'没有更早的有效现场记录。':'上一条已发生现场记录：'+chatClockLabel(lastAt)+'；距上一条现场记录 '+gap+' 秒（不含本轮刚发送的输入）。')+(rerollAt?'本次是对同一幕的替代版本，以原先本幕时间为锚点。不得续写、记得或承认已弃用版本。真实见面计时没有暂停或重置，下一轮按当时现实时间继续。':'现实经过几秒，见面就经过几秒；不要因生成一段长正文就推进数分钟或数小时。')+' 本幕时间是唯一可用的现在，优先于任何预设的“紧接最后一秒”、历史正文、日程与角色习惯；角色查看钟表或直接报现在几点，必须与本幕本地钟点一致。没有必要时不要报时；不得自行改写分钟或时段。跨日按完整日期区分昨天、今天。长间隔只说明真实时间流逝，不证明角色何时醒来、做过什么或玩家一直维持某个姿势；不得倒填未经确认的精确时间、共同经历或用户状态。允许角色从现在起自主行动，不得替玩家补写空白期间的行动。现实日期不改变原作年份、年龄与科技。禁止擅自跳时、结束见面或在正文输出时间元数据。';
  }
  // Only reject unambiguous present-clock readings; historical times and plans
  // must remain valid prose. A bare clock reading after checking a watch is present.
  function meetingCurrentClockConflict(text,anchor){
    const d=new Date(anchor);
    if(!Number.isFinite(d.getTime()))return '';
    const hour=d.getHours(),minute=d.getMinutes();
    const digits='零一二三四五六七八九';
    const number=s=>{
      if(/^\d+$/.test(s))return Number(s);
      if(s==='两')return 2;
      if(s.includes('十')){const [x,y]=s.split('十');return (x?digits.indexOf(x):1)*10+(y?digits.indexOf(y):0);}
      return s.length===1?digits.indexOf(s):NaN;
    };
    const source=String(text||'');
    const expr=/(?:(凌晨|早上|上午|中午|下午|傍晚|晚上|夜里)\s*)?([0-9零一二两三四五六七八九十]{1,3})(?:[:：]([0-9]{2})|[点時时](?:([0-9零一二三四五六七八九十]{1,3})分|(半|一刻|三刻))?)/g;
    for(const m of source.matchAll(expr)){
      const before=source.slice(Math.max(0,m.index-140),m.index);
      const after=source.slice(m.index+m[0].length,m.index+m[0].length+24);
      const direct=/(?:现在|此刻|这会儿)(?:已经|刚过|才|都|是|已到|正好)?\s*$/.test(before)&&!/^(?:见面|出发|回来|开门|结束|睡觉|起床|吃饭|开始)/.test(after);
      const watch=/(?:手表|腕表|钟表|挂钟|时钟|表盘|手机时间)/.test(before)&&/[“「]\s*$/.test(before)&&/^[。！!，,？?]?[”」]/.test(after);
      if(!direct&&!watch)continue;
      const h=number(m[2]),min=m[3]!==undefined?Number(m[3]):m[4]!==undefined?number(m[4]):m[5]==='半'?30:m[5]==='一刻'?15:m[5]==='三刻'?45:null;
      if(!Number.isInteger(h)||h<0||h>23||(min!==null&&(!Number.isInteger(min)||min<0||min>59)))continue;
      let hours=[h];
      if(h>=1&&h<=12){
        if(/下午|傍晚|晚上|夜里/.test(m[1]||''))hours=[h===12?(m[1]==='下午'?12:0):h+12];
        else if(/凌晨|早上|上午/.test(m[1]||''))hours=[h===12?0:h];
        else if(!m[1])hours=[h%12,h%12+12];
      }
      if(!hours.includes(hour)||(min!==null&&min!==minute))return m[0];
    }
    return '';
  }
  // Derived only from this profile/character's archived original meeting turns.
  // A poor fallback summary or unrelated SMS topic must not hide a recent encounter.
  const needsMeetingDetail=text=>{
    const s=String(text||'');
    const past=/上次|上回|那次|那天|那晚|那会儿|当时|见面时|约会时|那下午|那时候|还记得|你记得|我记得|我们之前|昨天我们|那一晚/.test(s);
    const specific=/具体|细节|说了什么|说过什么|怎么做|怎么回事|为什么|哪里|哪个|什么时候|如何|睡|醒|吻|亲|抱|当时|那会儿|发生|去了|做的时候/.test(s);
    return (past&&specific)||/做的时候|睡着的时候|醒来的时候|我们在床上|在一起的那天下午/.test(s);
  };
  function recentActualMeetingContext(p,c,query='',at=Date.now()){
    const rel=relation(p.id,c.id),active=rel?.mode==='meeting'?rel.active_meeting_id:'';
    const candidates=(db.meetings||[]).filter(m=>m.profile_id===p.id&&m.character_id===c.id&&m.id!==active&&Array.isArray(m.entries)&&m.entries.some(e=>e.sender==='user'))
      .filter(m=>{const end=Date.parse(m.finished_at||m.ended_at||'');return Number.isFinite(end)&&end<=at;})
      .sort((a,b)=>Date.parse(b.finished_at||b.ended_at)-Date.parse(a.finished_at||a.ended_at));
    if(!candidates.length)return '';
    const detail=needsMeetingDetail(query);
    const terms=extractQueryTerms(query).filter(t=>t.length>=2);
    if(detail&&candidates.length>1)candidates.sort((a,b)=>{
      const score=m=>terms.reduce((n,t)=>n+(JSON.stringify([m.ai_summary,m.summary,m.entries]).toLowerCase().includes(String(t).toLowerCase())?1:0),0);
      return score(b)-score(a)||Date.parse(b.finished_at||b.ended_at)-Date.parse(a.finished_at||a.ended_at);
    });
    const meeting=candidates[0];
    const summary=String(meeting.ai_summary||meeting.summary||'').trim().slice(0,500);
    const overview='\n\n【过去真实见面的原始记录索引 · 不是 AI 生成的事实小结】\n'+String(meeting.started_at||'').slice(0,16)+' 至 '+String(meeting.finished_at||meeting.ended_at||'').slice(0,16)+'，保存有与 '+p.name+' 的线下见面记录。模型生成的小结可能含推断，已从提示词中移除；所有具体对白、到访、共同活动必须以此场保存的原文为证。预约、监控推演、总结文案均不能证明确曾发生。';
    const entries=(Array.isArray(meeting.entries)?meeting.entries:[]).filter(m=>
      ['user','ai'].includes(m?.sender)&&String(m.text||'').trim()&&
      !(m.sender==='user'&&/(?:心想|心里|内心独白|默念|梦见|如果|假如)/.test(String(m.text))));
    // The summary API can fail while the underlying meeting transcript survives.
    // Always ground the SMS handoff in the last observed scene, even for a
    // casual first message such as "今天好安静". Never resume old doorstep SMS.
    const hasMissingDigest=!summary||/小结尚未生成成功|小结等待重建/.test(summary);
    const finalTurns=entries.slice(hasMissingDigest?-8:-4).map(m=>{
      const cleaned=String(m.text).replace(/\s+/g,' ').trim();
      return '- '+(m.sender==='user'?p.name:c.name)+'：'+cleaned.slice(0,220);
    }).join('\n');
    const handoff='\n\n【线下见面结束 → 当前手机聊天 · 强制时间线分界】\n这场线下见面已经结束，当前互动是结束后的手机短信，不是重演见面前的短信。见面开始前有关开门、正在楼下、正在路上、即将抵达等话语均已成为过去的聊天历史；绝不能因为读到这些旧信息就再次等待开门、再次赶去赴约或把旧计划当作此刻进行中的行动。现场未明确证实的离开、回家、到达及后续行动也不能自行补写。只以见面中实际发生的事情和最新短信为依据。'+
      (finalTurns?'\n【这场见面最后的真实交互（来自保存的现场原文，不是新短信）】\n'+finalTurns:'\n（目前未读取到现场末尾原文；不可假造结局。）')+
      (hasMissingDigest?'\n整场 AI 小结尚未生成成功；以上现场末尾原文是可确认依据，缺失的中间情节保持未知，不得把见面前计划当成见面后的事实。':'');
    const context=overview+handoff;
    // Compact ordinary-SMS continuity is drawn from saved transcript text,
    // not the model's potentially fabricated ai_summary. Keep high-impact
    // witnessed turns even when the user changes topic (M02 contract).
    const factualPatterns=[
      /(?:没(?:有)?(?:去|看|做)|电影并没有看|取消|改了行程|改成|改为)/,
      /(?:相拥睡|睡着|睡了|睡醒|午睡|入睡)/,
      /(?:亲密相处|吻|亲了|拥抱)/,
      /(?:下车|送.{0,14}(?:到|回)|告别|再见)/
    ];
    const grounded=[];
    for(const pat of factualPatterns){
      const match=entries.find(e=>pat.test(String(e.text||'')));
      if(match&&!grounded.includes(match))grounded.push(match);
    }
    const groundedLines=grounded.slice(0,4).map(e=>
      '- '+(e.sender==='user'?p.name:c.name)+'：'+String(e.text||'').replace(/\s+/g,' ').slice(0,220)).join('\n');
    const groundedContext=groundedLines?'\n【从存档原文核对的关键片段 · 原文里的计划仍不是成行事实】\n'+groundedLines:'';
    if(!detail)return context+groundedContext;
    if(!entries.length)return context;
    const queryTerms=extractQueryTerms(query).filter(t=>t.length>=2);
    const important=/(?:本来|原本|没(?:有)?(?:去|看|做)|没有|后来|随后|最终|最后|决定|离开|送.{0,14}(?:到|回|去)|接.{0,12}(?:到|回)|下车|车门|抵达|到达|相拥|拥抱|抱着|睡着|睡了|亲吻|接吻|亲密|亲了|吻痕|衣服|外套|生气|吃醋|告别|再见)/;
    const n=entries.length;
    const anchors=[0,Math.floor(n/4),Math.floor(n/2),Math.floor(n*3/4),Math.max(0,n-3),Math.max(0,n-2),n-1];
    const selected=new Set(anchors);
    const ranked=entries.map((e,i)=>{
      const body=String(e.text);
      const hits=queryTerms.reduce((n,t)=>n+(body.toLowerCase().includes(t.toLowerCase())?1:0),0);
      return {i,score:hits*7+(important.test(body)?5:0)+(e.sender==='user'?1:0)};
    }).sort((a,b)=>b.score-a.score||b.i-a.i);
    // Preserve on-scene milestones independently of the SMS query or repeated
    // high-scoring kisses/farewells; never turn plans into historical facts.
    const milestones=[
      /(?:睡着|睡了|睡醒|醒来|午睡|入睡|相拥而眠|睡过去)/,
      /(?:没有(?:去|看|做)|没(?:去|看|做)|取消|改成|改为)/,
      /(?:回家|到家|家里|卧室|床上)/,
      /(?:下车|送.{0,12}(?:到|回)|告别|再见)/
    ];
    const focused=new Map();
    for(const pattern of milestones){
      const candidate=ranked.find(x=>pattern.test(String(entries[x.i].text)));
      if(candidate){selected.add(candidate.i);focused.set(candidate.i,pattern);}
    }
    for(const item of ranked){if(selected.size>=13)break;if(item.score>0)selected.add(item.i);}
    const lines=[];let used=0;
    for(const i of [...selected].sort((a,b)=>a-b)){
      const e=entries[i],whole=String(e.text).replace(/\s+/g,' ').trim();
      const focus=focused.get(i)?.exec(whole);
      let excerpt=whole.length>205?whole.slice(0,115)+' … '+whole.slice(-85):whole;
      if(whole.length>205&&focus){
        const start=Math.max(0,Math.min(focus.index-90,whole.length-205));
        excerpt=(start?'… ':'')+whole.slice(start,start+205)+(start+205<whole.length?' …':'');
      }
      const line='['+(e.sender==='user'?p.name:c.name)+' · 现场原文 #'+(i+1)+'] '+excerpt;
      if(used+line.length>3400)continue;
      used+=line.length;lines.push(line);
    }
    if(!lines.length)return context;
    return context+'\n\n【最近一次真实线下见面 · 有来源的原文节选】\n以下仅属于你与 '+p.name+' 的这场见面，不属于任何其他角色实例；发生时间 '+String(meeting.started_at||'').slice(0,16)+' 至 '+String(meeting.finished_at||meeting.ended_at||'').slice(0,16)+'。\n'+
      lines.join('\n')+'\n以上是节选而非完整情节；见面前约定看电影、吃饭、接送等不证明最后真的完成。若原文发生的行动与旧计划或监控草案冲突，以已经发生的现场行为为准；不要虚构电影、餐食、旅程或否定对方共同亲历的事情。见面发生的这段时间不能被描述成角色一整天都在巡逻、值班、开车或完成其他无记录的事务；未被证实的生活安排保持未知。私人内心不可当作角色亲眼所见；没有展示的情节保持不确定。';
  }
  // A generated slot can mix versions of a character. Do not promote that
  // speculation to observed identity or pass it to a paid chat request.
  function incompatibleCharacterSlot(c,slot){
    if(!slot||!c)return false;
    const body=[slot.location,slot.status,slot.activity,slot.scene].map(x=>String(x||'')).join(' ');
    return c.id==='re-game:leon:re2'&&/(?:\bDSO\b|特工|联邦调查|华盛顿特区|安全公寓|防窃听|总统护卫|加密终端|政府机密)/i.test(body);
  }
  function verifiedSlotForDisplay(c,slot){
    if(!incompatibleCharacterSlot(c,slot))return slot?.source==='schedule'?{...slot,is_planned:true}:slot;
    return {...slot,location:'地点未确认',status:'日程待核实',activity:'原日程与本角色时期冲突，不作为已发生事实',scene:c.name+'的此时位置尚无有效证据。',source:'unverified'};
  }
  // A synthetic itinerary can describe a missed appointment as a shared
  // activity. Mark it uncertain at read time, including old saved slots.
  // Keep character-only daily plans usable; do not mutate the old archive.
  const witnessedSurveillanceSlot=(p,c,slot)=>{
    const checked=verifiedSlotForDisplay(c,slot);
    if(checked?.source!=='schedule')return checked;
    const body=[checked.location,checked.status,checked.activity,checked.scene].join(' ');
    const shared=/(?:两人|双方|我们俩|一起|共同|共进|相伴|和你|与你|跟你|陪你)/.test(body)||
      (p?.name&&body.includes(p.name)&&/(?:见面|约会|吃饭|晚餐|回家|接送|接到|送回|进屋|相拥|拥抱|抵达)/.test(body));
    if(!shared)return {...checked,is_planned:true};
    return {...checked,location:'地点未确认',status:'约定待核实',
      activity:'双方是否实际见面、同行或用餐均未确认',
      scene:c.name+'的个人安排可能改变；预约与推演不代表两人已实际见面。',
      is_planned:true,is_unconfirmed:true};
  };
  const prompt=(p,c,mode,pendingIds=[],options={})=>{
    const macros=t=>expandPresetMacros(t,p,c);
    const excludeSet=options.excludeMessageIds?new Set(options.excludeMessageIds):null;
    const protectedIds=mode==='chat'?(pendingIds.length?pendingIds:(queueInfo(p.id,c.id).pendingIds||[])):(getTaskState(p.id,c.id,'meeting')?.pending_ids||[]);
    const workingHistory=selectWorkingHistory(p.id,c.id,mode,excludeSet,protectedIds,options.simulatedAt||Date.now());
    const isMeetingOpening=mode==='meeting'&&workingHistory.length===0;
    const workingIds=new Set(workingHistory.map(m=>m.id));
    ensureMeetingRecords(p,c);
    episodeList(p,c);
    const preChatContext=mode==='meeting'?selectPreMeetingChatContext(p.id,c.id,6):[];
    const querySeed=(options.latestText||'').trim()
      ||workingHistory.slice(-3).filter(m=>m.sender==='user').map(m=>String(m.text??'').trim()).join(' ')
      ||workingHistory.slice(-2).map(m=>m.sender==='user'?String(m.text??'').trim():cleanChatBubbleText(m.text)).join(' ')
      ||preChatContext.slice(-2).map(m=>m.sender==='user'?String(m.text??'').trim():cleanChatBubbleText(m.text)).join(' ');
    const activeMid=mode==='meeting'?(relation(p.id,c.id)?.active_meeting_id||''):'';
    const recalled=retrieveRelevantMemories(p.id,c.id,querySeed,workingIds,4,1200,options.simulatedAt||0,excludeSet,activeMid);
    const relSummary=relationshipBaselineSummary(p.id,c.id,p.name);
    const interestsStr=(p.interests||[]).join('、')||'未填写';
    const intentStr=p.intent||'未填写';
    // Face-to-face location must never be seeded from projected surveillance.
    const curSurv=mode==='chat'?getCurrentSurveillanceSlot(p,c,options.simulatedAt||Date.now()):null;
    const meetingLoc=mode==='meeting'?(relation(p.id,c.id)?.meeting_location||'见面地点待确认'):(curSurv?.location||'地点待确认');
    let sys='你正在扮演一个真实存在于其原作时间线中的虚构角色。不得跳出角色解释自己是语言模型。记忆严格按当前角色 ID 与当前聊天对象隔离，绝不混入其他人物或其他 Profile 的经历。区分“系统已确认事实”与“对方在对话中的主观陈述”，不因对方随口一句话而篡改你的原作设定。\n';
    sys+='现实日历日期仅用于应用调度与记录；原作时期、人物年龄、历史事件与技术水平保持对应版本，不因现实年份改变。\n';
    if(mode==='meeting'){
      sys+=`【第一层 · 身份记忆 (Identity Memory)】\n你的身份：${c.name}（角色ID：${c.id}）。来源：${c.source}。时期：${c.version}。已收录背景：${c.canon}。\n当前互动对象 Profile：${p.name}，${p.age}岁，性别${p.gender}，交友目的：${intentStr}，兴趣爱好：${interestsStr}；公开简介：${p.bio}。`;
    }else{
      const profileMeta=[p.name,p.age?`${p.age}岁`:'',p.gender?`性别${p.gender}`:'',p.intent?`交友目的：${p.intent}`:'',(p.interests&&p.interests.length)?`兴趣：${p.interests.join('、')}`:'',p.bio?`简介：${p.bio}`:''].filter(Boolean).join('，');
      sys+=`【第一层 · 身份记忆 (Identity Memory)】\n你的身份：${c.name}（原作：${c.source} · ${c.version}）。背景设定：${c.canon}\n当前聊天对象资料：${profileMeta}。（注：若对方在下方实时聊天中重新做了自我介绍或使用英文/其他语言对话，请优先顺应对方在当前聊天中的自称、话题与语言。）`;
    }
    if(p.role_character_id&&byId.has(p.role_character_id)){const x=byId.get(p.role_character_id);sys+=`\n对方扮演的原作人物：${x.name}（${x.source} ${x.version}），${x.canon}。`}
    else if(p.role_hint)sys+=`\n对方提供的身份说明（未验证）：${p.role_hint.slice(0,240)}`;
    sys+=`\n\n【第二层 · 关系记忆基线 (Relationship Memory)】\n${relSummary}`;
    if(mode==='chat'){
      if(relSummary.includes('再次重逢'))sys+='\n关系阶段提示：你们曾解除匹配后重新匹配，你清楚记得过往相处经历，不必装作初次认识。';
      else if(messagesOf(p.id,c.id).length<=8)sys+='\n关系阶段提示：你们刚通过交友软件匹配不久，请保持角色自然的社交边界、幽默感或分寸，不要过度自来熟，也不要像客服一样生硬盘问或长篇解释个人设定。';
    }
    if(mode==='meeting'){
      sys+=`\n当前见面地点（来自实际互动，不参考监控预排）：「${meetingLoc}」。进入见面模式不代表对方已到、双方已见面或共同活动。`;
    }
    sys+=reconnectDirective(p.id,c.id);
    if(mode==='chat')sys+=recentActualMeetingContext(p,c,querySeed,options.simulatedAt||Date.now());
    sys+='\n【共同经历事实优先级】当前真实互动/实际现场原文 > 带时间戳的角色位置陈述 > 已确认但未发生的约定 > 监控/日程推演。任何预定见面、吃饭、回家、接送，未经现场原文证实均不得用过去时说成双方曾一起做过；不得为对方杜撰对白或自称记得没有证据的共同经历。模型摘要是线索而非证言。';
    if(recalled.length){
      sys+=`\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n`+recalled.map(formatEpisodicEntry).join('\n');
    }else{
      sys+=`\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n`+(mode==='meeting'?'（当前话题未触发额外远期档案，仅依靠下方今日活跃上下文连贯交流）':'（无额外远期档案命中，请直接聚焦下方当前聊天。）');
    }
    if(mode==='meeting'&&activeMid)sys+=meetingCheckpointPromptContext(p,c,activeMid,querySeed);
    if(mode==='meeting'&&preChatContext.length){
      const smsLines=preChatContext.map(m=>{
        const who=m.sender==='ai'?c.name:p.name;
        const body=m.sender==='user'?String(m.text??'').trim():(cleanChatBubbleText(m.text)||'…');
        return `- [${chatClockLabel(m.created_at)} 手机消息] ${who}：${body.slice(0,140)}`;
      });
      sys+=`\n\n【见面前的近期手机联系脉络（仅供剧情前情参考，严禁模仿手机短信的简短篇幅或气泡格式）】\n`+smsLines.join('\n');
    }
    const timelineLines=[];
    const historyTurns=[];
    workingHistory.forEach((m,idx)=>{
      const role=m.sender==='ai'?'assistant':'user';
      if(m.engine==='recalled'||m.recalled){
        historyTurns.push({role,content:'[系统提示：对方刚刚撤回了一条消息（你看见对方撤回了消息，但不知道具体撤回了什么内容）]'});
        return;
      }
      const tTag=chatClockLabel(m.created_at);
      const mLabel=m.mode==='meeting'?'线下见面':'线上短信';
      const who=m.sender==='ai'?c.name:p.name;
      timelineLines.push(`#${idx+1} ${tTag}（${mLabel}·${who}）`);
      const originalBody=m.sender==='user'?String(m.text??''):(m.mode==='meeting'?cleanMeetingNovelText(m.text):(cleanChatBubbleText(m.text)||'…'));
      const quoted=m.quote&&m.mode==='chat'?('[引用'+(m.quote.sender==='user'?'自己':'对方')+'的消息：「'+String(m.quote.text||'').slice(0,220)+'」]\n'):'';
      const cleanBody=quoted+originalBody;
      const useVision=mode==='chat'&&m.sender==='user'&&m.photo_kind==='gallery'&&m.photo_ref&&(protectedIds.includes(m.id)||(!protectedIds.length&&workingHistory.slice(idx+1).every(x=>x.sender==='user')));
      const sceneMark=mode==='meeting'&&m.sender==='ai'&&m.scene_location&&
        m.scene_location_signature===meetingSceneSignature(m.text)
        ?'\n【此条角色正文结束时的现场地点】'+m.scene_location:'';
      historyTurns.push({role,content:cleanBody+sceneMark,...(useVision?{photo_ref:m.photo_ref}:{})});
    });
    if(timelineLines.length){
      sys+=`\n\n【近期活跃对话时间与模式索引（系统元数据，仅供把握时间跨度与场景，严禁在回复正文中输出时间或模式前缀）】\n`+timelineLines.join(' ｜ ');
    }
    const presets=db.presets.filter(x=>x.mode===mode&&x.enabled).sort((a,b)=>a.sort_order-b.sort_order);
    if(mode==='meeting'){
      // Split presets into pre-history foundational system rules vs post-history (COT / non-system / bottom pledge)
      let splitIdx=presets.findIndex(x=>isPostHistoryPreset(x));
      if(splitIdx<0)splitIdx=presets.length;
      const corePresets=presets.slice(0,splitIdx);
      const postPresets=presets.slice(splitIdx);
      const coreSysText=corePresets.filter(x=>x.role==='system').map(x=>macros(x.content)).join('\n\n');
      if(coreSysText)sys+='\n\n'+coreSysText;
      const chat=[{role:'system',content:sys}];
      // Any non-system entries that appeared early in corePresets
      for(const x of corePresets){
        if(x.role!=='system')chat.push({role:x.role,content:macros(x.content)});
      }
      const hasTrailingUser=historyTurns.length>0&&historyTurns[historyTurns.length-1].role==='user';
      const priorHistory=hasTrailingUser?historyTurns.slice(0,-1):historyTurns.slice();
      const finalUserTurn=hasTrailingUser
        ?historyTurns[historyTurns.length-1]
        :{
          role:'user',
          content:historyTurns.length===0
            ?meetingOpeningDirection(p,c,meetingLoc)
            :(options.latestText||`【继续推进】请紧接上一轮结尾的现场状态、动作与气氛，继续往下描写 ${c.name} 在「${meetingLoc}」中的反应与场景推进，不要重复上一轮已写过的内容，严格遵循当前已启用预设的文风与篇幅规则，在自然交接点收束。`)
        };
      chat.push(...priorHistory);
      const postSystemParts=postPresets.filter(x=>x.role==='system').map(x=>macros(x.content));
      postSystemParts.push(meetingClockContext(relation(p.id,c.id),workingHistory,options.clockNow??Date.now(),options.rerollAt||0,hasTrailingUser?workingHistory.at(-1)?.id:''));
      if(isMeetingOpening)postSystemParts.push(meetingOpeningDirection(p,c,meetingLoc));
      postSystemParts.push(`【第四层 · 当前状态 (Current State)】角色最后经现场实际行动确认的地点：「${meetingLoc}」。此定位是过去确认的状态，不是不可更改的固定舞台；如果本轮角色确实移至新地点，应按真实移动过程继续，并使后续监控更新。不能因目的地被提及、打算过去、角色猜测而假定已经到达。必须优先承接最新现场行动，不得让旧日程或旧地名覆盖新的实际位置。请严格按照上方已启用的预设模块规则（含文风、视角、去油腻、连续性及正文篇幅要求）输出面对面小说正文；只决定 ${c.name} 自己与环境中合理的事，不要替 ${p.name} 说话、行动或决定心理，不要在正文开头添加任何时间或模式标签。`);
      // Structured scene metadata travels out-of-band: only text becomes
      // visible prose. Each response must explicitly state where the character
      // really is, using actions in this scene rather than surveillance plans.
      postSystemParts.push('【每轮见面回复的结构化契约 · 必须遵守】只返回一个 JSON 对象，字段恰好是 {"text":"完整的第三人称小说正文","location":"角色在本条正文结束时真实所在的具体地点","location_evidence":"如果地点变化，请从本条正文或玩家最新一条原文逐字复制证明确实已经到达的连续短句；没换地点则填空字符串"}。text 必须是完整自然的小说叙事，不要把地点标签写进 text。location 每轮必填，即使没有移动也必须重复上一轮已确认的地点。单纯讨论、邀约、计划、将来时、想象、监控推演或 NPC 在别处不构成移动；未实际到达则沿用上一轮地点。若真实走出或进入新地点，在正文里交代完成移动的动作，再填新的 location。不得替玩家行动或发言。JSON 外不要有解释、代码围栏或其他内容。');
      chat.push({role:'system',content:postSystemParts.join('\n\n')});
      for(const x of postPresets){
        if(x.role!=='system')chat.push({role:x.role,content:macros(x.content)});
      }
      chat.push(finalUserTurn);
      return chat;
    }
    const sysPresetsText=presets.filter(x=>x.role==='system').map(x=>macros(x.content)).join('\n\n');
    if(sysPresetsText)sys+='\n\n'+sysPresetsText;
    let batchHint='';
    const effectivePending=(Array.isArray(pendingIds)&&pendingIds.length)?pendingIds:(queueInfo(p.id,c.id).pendingIds||[]);
    if(mode==='chat'&&effectivePending.length>1){
      const bundledRows=effectivePending.map(id=>db.messages.find(x=>x.id===id)).filter(Boolean);
      if(bundledRows.length>1){
        const recent=(options.simulatedAt||Date.now())-Date.parse(bundledRows[0].created_at)<3600000;
        batchHint=`\n【连续消息提示】对方${recent?'刚刚连续发来了':'此前陆续发来了'}最后 ${bundledRows.length} 条消息（见下方对话末尾）。你现在拿起手机一并读完，请把握这几条消息之间的递进关系、调侃或话锋转折，像真人聊天一样自然连贯地回应整体意思，不必逐条机械拆解作答。`;
      }
    }
    const survHint=curSurv&&curSurv.source!=='unverified'?`\n【个人日程草案（不是已发生的事实）】可参考：「${curSurv.location}」·「${curSurv.activity}」。${isSleepingSlot(curSurv)?'原日程为睡眠，但你现在正在回复手机，应当是醒着的。':''}如果与真实见面原文或实际行动冲突，必须以亲历现场为准；不得把预定行程当作已经完成的生活经历。`:'';
    const langHint='\n'+buildCharacterLanguageDirective(db.connection?.character_language_pref||'natural',db.connection?.character_language_custom||'');
    sys+='\n\n【第四层 · 当前状态 (Current State)】当前必须以真实约会 App 手机聊天气泡发出回复，不写旁白，不要在正文开头添加任何时间或模式标签。紧扣对方刚刚发来的话自然接招（对方用英文则用英文回复，对方开玩笑、吐槽或换话题则以符合角色性格的方式自然互动，不必每轮结尾都强行提问）。像真人聊天一样时长时短：有时只发 1 条简短气泡，有时可分 2–4 条长短交替的气泡连续发出（多条气泡之间用换行符或 ||| 分隔）。'+survHint+batchHint+langHint;
    sys+='\n【照片消息】可以在自然合适的时候自主发送虚拟照片，也可以回应对方索要照片。每张照片必须单独占一个气泡，格式严格为 [[PHOTO: 一段镜头内可见的照片描写]]，其中不能包含换行或 |||；普通短信仍按原有格式回复，最多四个气泡。不要把文字说明或分析当成照片，不需要每轮发图。对方照片描写或视觉输入仅作为对方实际发送的照片内容。';
    // Keep the real time anchor at the very end of the system message, nearest to the conversation.
    sys+='\n'+chatClockContext(workingHistory,options.simulatedAt||Date.now());
    const chat=[{role:'system',content:sys},...presets.filter(x=>x.role!=='system').map(x=>({role:x.role,content:macros(x.content)})),...historyTurns];
    return chat;
  };
