  const SCENE_RULES={cancel:new RegExp("^(?:不去了|取消(?:见面|约会|计划)?|改天(?:吧|再见)?|算了(?:吧)?|我(?:不能|没法|不想)去|(?:let['’]s )?cancel|not coming|can['’]t make it|rain check|another day)",'i'),confirm:new RegExp("^(?:好(?:啊|呀|的|吧|哦|，|,|。|！|!|$)|行(?:啊|呀|，|。|$)|可以(?:啊|呀|，|。|$)|没问题|就这么定了|不见不散|我会到|我会去|一言为定|okay\\b|ok\\b|sure\\b|deal\\b|sounds good\\b|see you there\\b|i['’]ll be there\\b|agreed\\b)",'i'),arrival:new RegExp("^(?:我(?:已经|刚刚?)?(?:到了|到啦|抵达了)|(?:已经|刚刚?)?到(?:了|啦)|我到啦|i['’]m here|i am here|i(?:['’]ve| have| just)? arrived|made it)(?:[！!。.,，\\s…~～]*(?:你在哪(?:儿)?[？?]?|where are you[?]?|$))$",'i'),proposalZh:new RegExp("(?:在|去|到|约在)\\s*[「『“\"]?([^，。！？；、\\n「」『』“”\"]{1,40}?)[」』”\"]?\\s*(?:见面|碰面|见吧|见你|等你|汇合)",'i'),proposalEn:new RegExp("\\b(?:let['’]s meet|meet me|we (?:can|could|should) meet|shall we meet|how about meeting)\\s+(?:at|in|on|by|outside|inside)\\s+([^.!?;,\\n]{1,100})",'i'),stateZh:new RegExp("^(?:我(?:现在|此刻|目前)?(?:正)?在|我(?:刚刚?|已经)?(?:抵达|到了|到达|回到|登上|来到)|(?:刚刚?|已经)(?:到了|抵达|回到|登上|来到)|(?:我)?正(?:坐|站|躺)在)\\s*[「『“\"]?([^，。！？；、\\n「」『』“”\"]{1,48})",'i'),stateEn:new RegExp("^(?:i(?:['’]m| am)\\s+(?:(?:currently|right now|already)\\s+)?(?:at|in|on|inside|outside|by)|i\\s+(?:(?:just|already)\\s+)?(?:arrived at|got to|reached|returned to))\\s+([^.!?;,\\n]{1,100})",'i'),reject:new RegExp("^(?:想|考虑|思考|打算|准备|计划|担心|等你|等着|忙|工作|吃|喝|睡|看|说|做|跟|和你|给|想象|这里|那里|这儿|那儿|路上|发消息|开玩笑|生气|等一下|trouble\\b|love\\b|a loss\\b|a hurry\\b|the mood\\b|it\\b|my way\\b|your side\\b|the middle of\\b|pain\\b|shock\\b|a good mood\\b|a bad mood\\b|need\\b|doubt\\b|denial\\b|tears\\b|danger\\b|the phone\\b|a call\\b|touch\\b|charge\\b|a position\\b)",'i'),uncertain:new RegExp("(?:如果|假如|可能|也许|假设|还没|没有到|没到|不是|不在|打算|准备去|等会儿|待会|(?:\\bif\\b|\\bmaybe\\b|\\bprobably\\b|\\bnot yet\\b|\\bwould\\b|\\bwill be\\b|\\bgoing to\\b))",'i')};
  const normalizeSceneText=t=>String(t??'').trim().replace(/’/g,"'");
  // Interjections after an arrival ("我已经到了诶…") are not place names.
  const isNonPlaceText=raw=>{
    const val=String(raw||'').trim();
    return !val||/^[\s.,，。…！!?？~～-]*$/.test(val)||
      /^(?:诶|欸|哎|唉|啊|呀|嗯|呃|额|哦|噢|啦|了|嘿|hey|uh|um|eh|huh)[\s.,，。…！!?？~～-]*$/i.test(val);
  };
  function cleanScenePlace(raw,isEnglish=false){
    let value=normalizeSceneText(raw).replace(/^[「『“"'（(]+|[」』”"')）.!。！?？]+$/g,'').trim();
    if(isEnglish)value=value.replace(/\s+(?:at\s+\d|tomorrow\b|tonight\b|today\b|this (?:evening|afternoon|morning)\b|right now\b|now\b|waiting for\b|waiting\b|having\b|with\b).*$/i,'').trim();
    else value=value.replace(/(?:等你|等着你|等着|等人|看风景|吹风|喝咖啡|休息|坐着|站着|给你发消息|呢|这里|这儿).*$/,'').trim();
    if(isNonPlaceText(value)||value.length>40||SCENE_RULES.reject.test(value)||/[\n\r:：?？<>]/.test(value)||SCENE_RULES.uncertain.test(value))return '';
    if(isEnglish&&/^(?:here|there|somewhere|anywhere|nowhere)$/i.test(value))return '';
    if(!isEnglish&&/^(?:家|外面|里面)$/.test(value))return value;
    return value;
  }
  function locationFromReport(raw){
    const text=normalizeSceneText(raw)
      .replace(/^我(?:就|还|仍然)(?:站)?在/,'我现在在')
      .replace(/^(i(?:'m| am))\s+right\s+outside\b/i,'$1 outside');
    if(!text||/^[「『“"*>]/.test(text)||/[?？]$/.test(text)||SCENE_RULES.uncertain.test(text))return '';
    const en=text.match(SCENE_RULES.stateEn);
    if(en)return cleanScenePlace(en[1],true);
    const zh=text.match(SCENE_RULES.stateZh);
    return zh?cleanScenePlace(zh[1],false):'';
  }
  function explicitArrivalPlace(raw){
    const text=normalizeSceneText(raw);
    if(!text||/^[「『“"*>]/.test(text)||SCENE_RULES.uncertain.test(text))return '';
    // A user who explicitly arrives may tell us the location even without a prior proposal.
    // This is useful for a manual meeting; it is not sufficient to auto-switch.
    const zh=text.match(/^(?:(?:我)?(?:已经|刚刚?|已)?(?:到了?|抵达(?:了)?|到达(?:了)?))[，,。 ]*(?:在)?[「『“"]?([^，。！？；、\n「」『』“”"]{1,40})/);
    if(zh){const loc=cleanScenePlace(zh[1].replace(/^了|了$/g,''));if(loc&&!/^(?:啦|吗|吧|呀|哟|喽|哦)$/.test(loc))return loc;}
    const en=text.match(/^(?:i(?:['’]ve| have| just)? arrived(?: at| in)?|i (?:just )?got to|i made it to)\s+([^.!?;,\n]{1,100})/i);
    return en?cleanScenePlace(en[1],true):'';
  }
  function proposalLocation(raw){
    const text=normalizeSceneText(raw);
    if(!text||/^[「『“"*>]/.test(text)||SCENE_RULES.uncertain.test(text)||SCENE_RULES.cancel.test(text))return '';
    const en=text.match(SCENE_RULES.proposalEn);if(en)return cleanScenePlace(en[1],true);
    const zh=text.match(SCENE_RULES.proposalZh);
    if(zh)return cleanScenePlace(zh[1],false);
    const pickup=text.match(/(?:来|到|去|在)\s*([^，。！？；、\n「」『』“”"]{2,30}?)\s*接(?:上)?(?:我|你)/);
    return pickup?cleanScenePlace(pickup[1],false):'';
  }
  // Locations taken from an actual player's present-tense description, never
  // from an AI guess or a hypothetical future plan.
  function meetingPlaceInPlayerTurn(raw,profileName){
    const t=String(raw||'').trim();
    if(!t||/^(?:假如|如果|要是|万一|明天|下次|以后)/.test(t))return '';
    const bedroom=/(?:赖|躺|睡|窝|待|坐|留|趴|靠|滚|倒).{0,16}(?:我(?:家)?(?:的)?床(?:上|边)?)/;
    const namedBedroom=/(?:正在|现在|已经|此刻|就|还|仍|已经).{0,24}(?:在|待在|回到|走进|进入|来到)我(?:家)?(?:的)?(?:卧室|房间)/;
    const home=/(?:正在|现在|已经|此刻|就|还|仍).{0,20}(?:在|到了|回到|走进|进入|来到)我(?:的)?家(?:里)?/;
    if(bedroom.test(t)||namedBedroom.test(t)||/\b(?:on my bed|in my bedroom)\b/i.test(t))return profileName+' 的卧室';
    if(home.test(t)||/(?:带|领|接|跟|陪).{0,12}(?:他|她|你|[A-Za-z]+)?.{0,8}(?:回|到)(?:了)?我(?:的)?家|(?:带|领|接|跟|陪).{0,12}(?:他|她|你|[A-Za-z]+)?.{0,8}回家了?|\b(?:at my place|in my home)\b/i.test(t))return profileName+' 的家';
    // Only completed transport/arrival performed in this scene, never an
    // itinerary or an intention to be somewhere later.
    if(/(?:下车|下了车|停车|停下了车|送到了|已经到达|已经抵达)/.test(t)&&
      !/(?:如果|假如|打算|准备|将要|计划|还没|没有|尚未|梦见|想象)/.test(t)){
      const movement=t.match(/(?:在|到了?|到达|抵达(?:了)?|送(?:我|你)?到(?:了)?|送到(?:了)?|停车在)\s*([^，。！？；、\n]{2,32}?)(?:下(?:了)?车|停(?:了)?车|，|。|！|$)/);
      if(movement){
        const place=cleanScenePlace(movement[1]);
        if(place&&!/^(?:我|你|他|她|这里|那里|这儿|那儿|家|路边|车里)$/.test(place)&&!/[我你他她]/.test(place))return place;
      }
    }
    return '';
  }

  // A meeting monitor follows the character's *witnessed physical position*.
  // A mention of another room, a plan to go there, or a sound from next door
  // does not establish that the character arrived there.
  const SCENE_INTERIOR_RE=/(?:卧室|房间|屋内|室内|寝室|宿舍|客厅|厨房|浴室|卫生间|洗手间|走廊|门厅|露台|阳台|庭院|花园|楼下|楼上|咖啡馆|咖啡店|餐厅|街道|车里|车内|车上|车厢|停车场|床沿|床边|床上)/;
  const SCENE_MOVE_RE=/(?:走进|走入|进入|步入|迈入|踏进|回到|来到|抵达|到达|到了|进了|出了|走出|带进|抱进|抱回|推门进入|推开.{0,36}门.{0,30}(?:走进|进入|走入|床沿|床边|床上)|穿过.{0,35}(?:门|走廊)|在.{0,18}(?:床沿|床边|床上)(?:坐下|坐|躺下|停住|落下)|(?:坐|躺|落|放|陷|坐定|停住).{0,18}(?:床沿|床边|床上)|下了车|下车|停好车|到了家)/;
  const SCENE_NOT_ARRIVED_RE=/(?:打算|准备|计划|想要|想去|还没|尚未|没有|如果|假如|也许|或许|可能|梦见|想象|本来要|即将|正要|试图|差点|朝.{0,14}走去|向.{0,14}走去|走向.{0,14}|通往.{0,16}(?:门|房|室|厅))/;
  function meetingRoomName(current,room,pName){
    const where=String(current||'').trim();
    const base=where.replace(/(?:外廊露台|屋顶露台|露台|阳台|外廊|走廊|卧室|寝室|房间|客厅|厨房|浴室|卫生间|洗手间|门厅|庭院|花园|楼下|楼上)$/,'').trim();
    const roomKind=/^(?:床沿|床边|床上|卧室|寝室)$/.test(room)?'卧室':/^(?:室内|屋内|房间)$/.test(room)?'室内':room;
    if(where.includes('卧室')&&roomKind==='卧室')return where;
    if(where===pName+' 的家'||where===pName+' 的卧室'||where.startsWith(pName+' 的'))return pName+' 的'+roomKind;
    if(base&&base!==where&&base.length<=24)return base+roomKind;
    return roomKind;
  }
  function sceneLocationFromCharacter(raw,current,pName,cName=''){
    const text=String(raw||'');
    if(!text||!SCENE_INTERIOR_RE.test(text)||!SCENE_MOVE_RE.test(text))return null;
    const destination=/(?:走进|走入|进入|步入|迈入|踏进|回到|来到|抵达|到达|到了|进了|出了|走出|带进|抱进|抱回|推门进入)\s*[了的进到入过]?[\s「『“"]*(?:(?:这间|那间|自己|他们|她|他|我们|我|你|Lin|Carlos)\s*的?)?[\s「『“"]*((?:[\u4e00-\u9fff]{1,12}的)?(?:卧室|寝室|房间|客厅|厨房|浴室|卫生间|洗手间|室内|屋内|露台|阳台|庭院|花园|走廊|楼下|楼上|咖啡馆|咖啡店|餐厅|车里|车内|车上|停车场|街道))/g;
    const seen=[...text.matchAll(destination)].filter(m=>{
      const before=text.slice(0,m.index||0);
      const prefix=before.slice(-22),after=text.slice(m.index,m.index+m[0].length+8);
      const insideQuote=before.lastIndexOf('“')>before.lastIndexOf('”')||
        before.lastIndexOf('「')>before.lastIndexOf('」')||
        before.lastIndexOf('『')>before.lastIndexOf('』');
      const clause=before.slice(Math.max(before.lastIndexOf('。'),before.lastIndexOf('！'),before.lastIndexOf('？'),before.lastIndexOf('；'),before.lastIndexOf('，'))+1);
      const characterSubject=Boolean(cName&&clause.includes(cName))||/(?:他|她)[^，。！？]{0,12}(?:抱着|扶着|带着|牵着|领着|背着)/.test(clause);
      const otherActor=/(?:护士|保安|店员|路人|警卫|朋友|陌生人|门卫)[^，。！？]{0,6}$/.test(clause)||
        Boolean(pName&&clause.slice(-12).includes(pName));
      return !insideQuote&&(!otherActor||characterSubject)&&
        !SCENE_NOT_ARRIVED_RE.test(prefix)&&!/(?:准备|打算|想要|试图|正要|还没|没有|尚未|不要|别|禁止)/.test(prefix)&&!/[？?]/.test(after);
    }).map(m=>({place:m[1],evidence:m[0],pos:m.index||0}));
    // Indirect but physically completed: opened a door to the interior and
    // arrived at the bed. Not merely "we should go to bed".
    const bedtime=/(?:床沿|床边|床上|床铺|床垫|被褥)/g;
    const bed=[...text.matchAll(bedtime)].filter(m=>{
      const around=text.slice(Math.max(0,(m.index||0)-85),Math.min(text.length,(m.index||0)+60));
      return /(?:推开|踹开|关上|走进|迈进|穿过|抱着|托抱|抱回|进入|到了|倒在|坐在|停住|陷进|落在|躺到|躺在)/.test(around)&&
        !/(?:如果|假如|打算|准备|计划|想象|梦里|还没|尚未)/.test(around);
    });
    if(bed.length&&/露台|阳台|屋外|室外|走廊|门外/.test(String(current||''))&&
       /(?:推开|走进|迈进|穿过|关上|抱回|进入|回到|通往室内)/.test(text)){
      const item=bed.at(-1);
      seen.push({place:'卧室',evidence:text.slice(Math.max(0,item.index-60),Math.min(text.length,item.index+50)),pos:item.index||0});
    }
    if(!seen.length)return null;
    const last=seen.sort((a,b)=>a.pos-b.pos).at(-1);
    let location=meetingRoomName(current,last.place,pName);
    if(last.place.startsWith(pName+' 的'))location=last.place;
    if(!location||isNonPlaceText(location)||location.length>40||location===current)return null;
    return {location,evidence:last.evidence,kind:'scene'};
  }
  function isPotentialMeetingMovement(text){
    const src=String(text||'');
    // A generic verb such as “遇到了” is not a physical arrival; avoid
    // wasting API calls and replacing the model payload with a classifier.
    return SCENE_INTERIOR_RE.test(src)&&/(?:走进|走入|进入|步入|迈入|踏进|回到|来到|抵达|到达|进了|走出|带进|抱进|抱回|推门进入|推开.{0,36}门|穿过.{0,35}(?:门|走廊)|下了车|下车|停好车|(?:坐|躺|倒|抱|落|陷|放).{0,24}(?:床沿|床边|床上))/.test(src);
  }
  async function classifyMeetingMovement(p,c,characterText,current,options={}){
    const deterministic=sceneLocationFromCharacter(characterText,current,p.name,c.name);
    if(deterministic)return deterministic;
    if(!isPotentialMeetingMovement(characterText)||pub().mode!=='live')return null;
    // Only ambiguous physical scene shifts require an additional small model
    // check. Normal stationary dialogue adds zero API calls.
    try{
      const raw=await llm([
        {role:'system',content:'你是线下小说现场的地点事实核对员，不续写故事。追踪角色本人实际所在的地点。仅当本条正文已经明确完成物理移动且地点改变时才输出 changed:true。提议、将来时、假设、想象、路过提及、朝某处走去但未抵达、别人的位置，全部 changed:false。地点应是具体、简短且能与原场景关联的地点，例如从宿舍露台进入室内床边可归纳为宿舍卧室。必须把正文中实际证明“已到达”的连续原文短句逐字复制到 evidence；不能编造移动。只输出 JSON {"changed":false,"location":"","evidence":"","actor":"none"} 或 {"changed":true,"location":"新地点","evidence":"原文逐字连续片段","actor":"character"}。'},
        {role:'user',content:'原先角色当前位置：'+current+'\n角色：'+c.name+'\n最新角色正文：\n'+String(characterText).slice(-8500)}
      ],{json_mode:true,profile:p,character:c,mode:'surveillance',entry_point:'meeting_scene_location',background:true,temperature:0.1,signal:options.signal});
      const parsed=JSON.parse(raw);
      const location=cleanScenePlace(parsed?.location||''),evidence=String(parsed?.evidence||'').trim();
      if(parsed?.changed!==true||parsed?.actor!=='character'||!location||location===current||
         evidence.length<5||!String(characterText).includes(evidence)||SCENE_NOT_ARRIVED_RE.test(evidence))return null;
      return {location,evidence,kind:'model'};
    }catch{return null;}
  }

  // Every new meeting response is a structured narrative plus an independent
  // physical location label. The label is NOT evidence of travel by itself;
  // it must agree with a witnessed movement in the original player/AI text.
  function parseMeetingSceneTurn(raw,current=''){
    const source=String(raw??'').trim();
    const clean=source.replace(/^\`\`\`(?:json)?\s*|\s*\`\`\`$/gi,'').trim();
    let parsed=null;
    if(clean.startsWith('{')){
      try{parsed=JSON.parse(clean)}catch{
        // Never show malformed JSON or partial protocol as meeting prose.
        throw Error('见面回复结构化 JSON 不完整；已保留当前原文，等待重试');
      }
    }
    const structured=Boolean(parsed&&typeof parsed==='object'&&!Array.isArray(parsed));
    if(structured&&(typeof parsed.text!=='string'||typeof parsed.location!=='string'))
      throw Error('见面回复缺少正文或每轮地点字段');
    const text=cleanMeetingNovelText(structured?parsed.text:source).trim();
    if(!text||/^[\\s.…。]+$/.test(text))throw Error('见面回复没有有效正文');
    const location=structured?cleanScenePlace(parsed.location):cleanScenePlace(current);
    if(structured&&!location)throw Error('见面回复未提供有效地点名称');
    const evidence=structured?String(parsed.location_evidence||'').trim().slice(0,250):'';
    const activity=structured?String(parsed.monitor_activity||'').trim().slice(0,100):'';
    const scene=structured?String(parsed.monitor_scene||'').trim().slice(0,500):'';
    return {text,location:location||String(current||'').slice(0,40),evidence,structured,activity,scene};
  }
  function resolveMeetingSceneTurnLocation(p,c,turn,current,userMsg=null){
    const base=cleanScenePlace(current)||'见面地点待确认';
    const claimed=cleanScenePlace(turn?.location);
    // The structured location is the scene contract, not a regex-derived guess.
    if(turn?.structured&&claimed&&!isPendingMeetingPlace(claimed))
      return {location:claimed,evidence:String(turn.evidence||''),kind:claimed===base?'stable':'structured'};
    if(!claimed||claimed===base)return {location:base,evidence:'',kind:'stable'};
    const deterministic=sceneLocationFromCharacter(turn.text,base,p.name,c.name);
    const evidence=String(turn.evidence||'').trim();
    const fromNarration=evidence.length>=4&&turn.text.includes(evidence)&&
      isPotentialMeetingMovement(evidence)&&!SCENE_NOT_ARRIVED_RE.test(evidence);
    const playerPlace=userMsg?meetingPlaceInPlayerTurn(userMsg.text,p.name):'';
    const fromPlayer=Boolean(playerPlace===claimed&&evidence.length>=4&&
      String(userMsg.text||'').includes(evidence));
    // A scene-specific room inferred from real action is authoritative even
    // if the model picked a vague or wrong structured label.
    if(deterministic&&deterministic.location!==base){
      if(claimed===deterministic.location||fromNarration)
        return {location:claimed,evidence:evidence||deterministic.evidence,kind:'structured'};
      return deterministic;
    }
    if(fromNarration||fromPlayer)return {location:claimed,evidence,kind:'structured'};
    return {location:base,evidence:'',kind:'unconfirmed'};
  }
  function recoverPreMeetingPlace(p,c,began){
    // Reconstruct the original stop from the player's pre-meeting plans.
    // A concrete named venue is evidence; an AI-generated schedule is not.
    const previous=messagesOf(p.id,c.id).filter(m=>m.mode==='chat'&&m.sender==='user'&&
      Number.isFinite(Date.parse(m.created_at))&&Date.parse(m.created_at)<=began).slice(-32);
    for(let i=previous.length-1;i>=0;i--){
      const line=String(previous[i].text||'').trim();
      const explicit=line.match(/(?:店名|咖啡馆名|餐厅名)(?:就)?叫\s*[「『“"']?([^，。！？；\s「」『“”"'、]{2,32})/);
      if(explicit&&!isNonPlaceText(explicit[1]))return explicit[1];
      const proposed=proposalLocation(line)||explicitArrivalPlace(line);
      if(proposed&&!isNonPlaceText(proposed))return proposed;
    }
    return '';
  }
  function meetingSceneSignature(text){
    let h=2166136261;
    for(const ch of String(text||''))h=Math.imul(h^ch.charCodeAt(0),16777619)>>>0;
    return h.toString(16);
  }
  function isPendingMeetingPlace(place){
    return isNonPlaceText(place)||/^(?:约定的见面地点|见面地点待确认|地点待确认|未知地点|不确定地点|当前地点未确认|未确认地点|尚未确认地点|待确认|未知|不确定|unknown|tbd)$/i.test(String(place||'').trim());
  }
  function activeMeetingLocationHistory(p,c){
    const r=relation(p.id,c.id);
    if(!r||r.mode!=='meeting')return [];
    const startMs=Date.parse(r.meeting_started_at||'');
    const began=Number.isFinite(startMs)?startMs:Date.now();
    const prior=Array.isArray(r.meeting_location_history)?r.meeting_location_history:[];
    const initial=prior.find(x=>x.source==='start');
    // Preserve the original start even when the first AI turn supplied a location.
    const startingLoc=initial?initial.location:(prior.length?'见面地点待确认':
      (!isPendingMeetingPlace(r.meeting_location)?String(r.meeting_location).trim():
        (recoverPreMeetingPlace(p,c,began)||'见面地点待确认')));
    const events=[{at:new Date(began).toISOString(),location:startingLoc,source:'start'}];
    const manual=prior.filter(x=>['manual','resume'].includes(x.source)&&Number.isFinite(Date.parse(x.at))&&Date.parse(x.at)>=began&&!isPendingMeetingPlace(x.location));
    const activeTurns=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&
      (!r.active_meeting_id||!m.meeting_id||m.meeting_id===r.active_meeting_id)&&m.engine!=='recalled'&&!m.recalled&&
      Number.isFinite(Date.parse(m.created_at))&&Date.parse(m.created_at)>=began);
    const allEvents=events.concat(manual);
    const candidate=activeTurns.slice().sort((a,b)=>Date.parse(a.created_at)-Date.parse(b.created_at));
    const hasStructured=candidate.some(m=>m.sender==='ai'&&m.scene_location_structured&&m.scene_location_signature===meetingSceneSignature(m.text)&&!isPendingMeetingPlace(m.scene_location));
    for(const m of candidate){
      let loc='';
      if(m.sender==='user'&&!hasStructured)loc=meetingPlaceInPlayerTurn(m.text,p.name);
      else if(m.sender==='ai'){
        const current=allEvents.filter(e=>Date.parse(e.at)<=Date.parse(m.created_at)).sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1)?.location||startingLoc;
        const evidence=(m.scene_location&&m.scene_location_signature===meetingSceneSignature(m.text))
          ?{location:m.scene_location}:sceneLocationFromCharacter(m.text,current,p.name,c.name);
        loc=evidence?.location||'';
      }
      const previous=allEvents.filter(e=>Date.parse(e.at)<=Date.parse(m.created_at))
        .sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)).at(-1)?.location||startingLoc;
      if(loc&&!isPendingMeetingPlace(loc)&&loc!==previous){
        allEvents.push({at:m.created_at,location:loc,source:m.sender==='user'?'scene':'ai_scene',message_id:m.id});
      }
    }
    events.length=0;events.push(...allEvents);
    const priority={start:0,scene:1,ai_scene:2,resume:3,manual:4};
    events.sort((a,b)=>Date.parse(a.at)-Date.parse(b.at)||(priority[a.source]-priority[b.source]));
    const settled=[];
    for(const event of events){
      if(settled.at(-1)?.location===event.location){
        // Still record a manual confirmation to keep later source precedence.
        if(event.source==='manual'&&settled.at(-1).source!=='start')settled.at(-1).source='manual';
        continue;
      }
      settled.push(event);
    }
    r.meeting_location_history=settled;
    const concrete=settled.filter(e=>!isPendingMeetingPlace(e.location));
    r.meeting_location=concrete.at(-1)?.location||'见面地点待确认';
    return concrete;
  }
  function confirmActiveMeetingLocation(p,c,place){
    const r=relation(p.id,c.id);
    const loc=String(place||'').trim().slice(0,40);
    if(!r||r.mode!=='meeting'||isPendingMeetingPlace(loc))return;
    const history=activeMeetingLocationHistory(p,c);
    if(history.at(-1)?.location!==loc)
      r.meeting_location_history.push({at:stamp(),location:loc,source:'manual'});
    // A manual confirmation of the same place must not erase the original start event.
    r.meeting_location=loc;
  }
  function meetingSurveillanceSegments(p,c,date,untilMs=Date.now(),summary=''){
    const history=activeMeetingLocationHistory(p,c);
    const r=relation(p.id,c.id);
    const startMs=Date.parse(r?.meeting_started_at||'');
    const firstMs=Number.isFinite(startMs)?startMs:Date.now();
    const dayStart=new Date(date+'T00:00:00').getTime();
    const dayFinish=new Date(date+'T23:59:59').getTime();
    const finish=Math.min(untilMs,dayFinish);
    if(!history.length||!Number.isFinite(dayStart)||finish<Math.max(dayStart,firstMs))return [];
    const parts=[];
    for(let i=0;i<history.length;i++){
      const e=history[i],next=history[i+1];
      const begin=Math.max(firstMs,dayStart,Date.parse(e.at));
      const end=Math.min(finish,next?Date.parse(next.at):finish);
      if(!Number.isFinite(begin)||!Number.isFinite(end)||end<begin)continue;
      const startLabel=fmtHHMM(begin),endLabel=fmtHHMM(end);
      // Preserve distinct stops even when two transitions occur in the same minute.
      // The previous place gets the recap for its completed scene; do not
      // put a later global digest into every historical monitor slot.
      const sceneRecap=next?.message_id
        ?(db.meetingCheckpoints||[]).find(cp=>cp.kind==='scene_transition'&&
          cp.profile_id===p.id&&cp.character_id===c.id&&
          cp.meeting_id===r.active_meeting_id&&cp.transition_message_id===next.message_id&&
          isValidMeetingSceneCheckpoint(cp,p.id,c.id,r.active_meeting_id))?.summary:'';
      const sceneTurns=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.sender==='ai'&&
        m.meeting_id===r.active_meeting_id&&!m.recalled&&m.engine!=='recalled'&&
        Date.parse(m.created_at)>=Date.parse(e.at)&&Date.parse(m.created_at)<=finish&&
        (!next||Date.parse(m.created_at)<Date.parse(next.at)||(Date.parse(m.created_at)===Date.parse(next.at)&&m.id!==next.message_id&&m.scene_location===e.location))&&
        m.scene_location===e.location&&m.scene_location_signature===meetingSceneSignature(m.text));
      const latest=sceneTurns.at(-1);
      const activity=latest?.scene_monitor_activity||'现场互动';
      const scene=latest?.scene_monitor_scene||sceneRecap||(latest?cleanMeetingNovelText(latest.text).slice(0,350):'');
      parts.push({
        id:'slot_meeting_'+r.active_meeting_id+'_'+i+'_'+date,
        start:startLabel,end:endLabel,
        location:e.location,status:'线下见面足迹',
        activity,
        scene,
        source:'meeting',meeting_id:r.active_meeting_id||'',actual_started_at:r.meeting_started_at||'',
        isCurrent:i===history.length-1
      });
    }
    return parts;
  }
  function currentPlanRows(pid,cid){
    const boundary=(db.events||[]).filter(e=>e.profile_id===pid&&e.character_id===cid&&['matched','unmatched','return','meeting'].includes(e.type)).at(-1);
    const cutoff=boundary?Date.parse(boundary.created_at):0;
    return messagesOf(pid,cid).filter(m=>m.mode==='chat'&&!isChatArtifact(m)&&m.engine!=='recalled'&&!m.recalled&&Date.parse(m.created_at)>=cutoff).slice(-41);
  }
  const inferMeetingLocation=(pid,cid,customLoc='')=>{
    const cleanCustom=String(customLoc||'').trim();
    if(cleanCustom)return cleanCustom.slice(0,40);
    const recent=currentPlanRows(pid,cid).slice(-24);
    // Current, witnessed SMS location wins over any older appointment venue.
    // A user's location is not a claim about the character's whereabouts.
    for(let i=recent.length-1;i>=0;i--){
      const m=recent[i];
      const loc=m.sender==='ai'?locationFromReport(m.text):explicitArrivalPlace(m.text);
      if(loc)return loc;
    }
    // Only if no on-scene location exists may an un-cancelled proposed venue
    // guide the opening. Never promote an AI surveillance itinerary to fact.
    for(let i=recent.length-1;i>=0;i--){
      const m=recent[i],t=normalizeSceneText(m.text);
      if(SCENE_RULES.cancel.test(t)||/(?:没去|未赴约|没赴约|没有去|放鸽子|没能赴约|没赶上|no.show|didn't go|never went)/i.test(t))break;
      const planned=proposalLocation(t);
      if(planned)return planned;
    }
    return '见面地点待确认';
  };
  // Preserve every scene, but bound each stage so the model can complete JSON.
  function meetingSummaryChunks(mMsgs,p,c){
    const out=[],limit=4200;
    let chunk='';
    for(const m of mMsgs){
      const original=String(m.text||'').replace(/\s+/g,' ').trim();
      const max=240;
      const excerpt=original.length<=max?original:original.slice(0,Math.floor(max*.6))+' … '+original.slice(-Math.floor(max*.4));
      const stampText=meetingArchiveClock(m.created_at);
      const line='['+stampText+'] '+(m.sender==='user'?p.name:c.name)+'：'+excerpt+'\n';
      if(chunk&&chunk.length+line.length>limit){out.push(chunk);chunk='';}
      chunk+=line;
    }
    if(chunk)out.push(chunk);
    return out;
  }
  function meetingArchiveClock(value){const d=new Date(value);if(!value||!Number.isFinite(d.getTime()))return '未记录';const pad=n=>String(n).padStart(2,'0');const offset=-d.getTimezoneOffset();return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+' '+pad(d.getHours())+':'+pad(d.getMinutes())+' (UTC'+(offset>=0?'+':'-')+pad(Math.floor(Math.abs(offset)/60))+':'+pad(Math.abs(offset)%60)+')';}
  // A provider may return malformed JSON with finish_reason=stop.
  // Retry only structured-output errors, never save a guessed completion.
  async function reliableMeetingSummaryJson(messages,opts){
    let priorError=null;
    for(let attempt=0;attempt<2;attempt++){
      try{
        const req=attempt?[
          {...messages[0],content:messages[0].content+'\n上一轮结构化返回可能不完整。只输出一个完整的 JSON 对象，形如 {"summary":"完整摘要"}，不要附加其他文字。'},
          ...messages.slice(1)
        ]:messages;
        const raw=await llm(req,{...opts,min_output_tokens:attempt?3072:2048});
        const parsed=JSON.parse(raw);
        const summary=String(parsed?.summary||'').trim();
        if(summary.length<6)throw Error('结构化见面小结为空或内容过少');
        return summary;
      }catch(error){
        priorError=error;
        const code=String(error?.apiError?.error_code||error?.code||'');
        const retryable=error instanceof SyntaxError||/INVALID_STRUCTURED_JSON|OUTPUT_TRUNCATED|EMPTY_CONTENT/.test(code)||
          /结构化见面小结为空|JSON/.test(String(error?.message||''));
        if(attempt||!retryable)throw error;
      }
    }
    throw priorError;
  }
  async function summarizeCompleteMeeting(p,c,mMsgs,location,times={}){
    if(!mMsgs.length)return null;
    const mid=mMsgs[0]?.meeting_id||'';
    const groups=mid?completedMeetingGroups(p.id,c.id,mid):[];
    const checkpoints=mid?validMeetingCheckpoints(p.id,c.id,mid,groups):[];
    const sceneRecaps=checkpoints.filter(x=>x.kind==='scene_transition'&&x.summary_source==='ai');
    const legacy=sceneRecaps.length?[]:checkpoints.filter(x=>x.kind!=='scene_transition');
    const legacyExpected=Math.floor(groups.length/50);
    const reuseLegacy=legacyExpected>0&&legacy.length===legacyExpected;
    const reused=sceneRecaps.length?sceneRecaps:(reuseLegacy?legacy:[]);
    const lastStage=reused.at(-1);
    const split=sceneRecaps.length
      ?mMsgs.findIndex(m=>m.id===lastStage.transition_message_id)
      :reuseLegacy?groups.slice(0,legacyExpected*50).flat().length:0;
    const trailing=split>=0?mMsgs.slice(split):mMsgs;
    const chunks=meetingSummaryChunks(trailing,p,c);
    const timeContext='见面开始：'+meetingArchiveClock(times.started_at||mMsgs[0].created_at)+'；确认结束：'+meetingArchiveClock(times.finished_at)+'；末次原文：'+meetingArchiveClock(mMsgs.at(-1).created_at)+'。以上是现实本地日期和时区，跨日不得合并为同一天，未记录的结束不可推测。';
    const opts={json_mode:true,profile:p,character:c,mode:'meeting_summary',entry_point:'meeting_finalize',background:true,temperature:0.25};
    const instruction='你是见面剧情的事实归档员。输出可供下次见面准确接续的纪实摘要，不得用第一句和最后一句拼凑。只记录原文实际发生的动作、人物之间的关键对话、感情和态度变化、具体物品去向、场景转换、约定、拒绝与未解决事件。区分玩笑、提议和真正承诺；绝不凭空补写台词、行为或人物心理。亲密场景概括实际互动即可，不要重复露骨身体细节。严格按时间顺序保留关键转折；跨午夜要保留睡前与次日醒来的变化。只输出一个完整 JSON 对象，唯一字段 summary。';
    const partSummaries=reused.map(cp=>cp.kind==='scene_transition'
      ?'在「'+cp.from_location+'」的现场（'+cp.started_at+'至'+cp.ended_at+'）：'+cp.summary
      :'历史第'+cp.round_start+'–'+cp.round_end+'组（'+cp.started_at+'至'+cp.ended_at+'）：'+cp.summary+
        '；具体事件：'+(cp.details||[]).join('；')+
        '；关键对话：'+(cp.key_dialogues||[]).map(x=>x.speaker+'「'+x.quote+'」').join('；'));
    for(let i=0;i<chunks.length;i++){
      const part=await reliableMeetingSummaryJson([
        {role:'system',content:instruction+'这次只整理第 '+(i+1)+'/'+chunks.length+' 段确实发生的事情（建议160–260字），着重保留重要行为及其后果，而不是首尾引言。'},
        {role:'user',content:timeContext+'\n地点线索（不等于所有事都在此发生）：'+location+'；整场消息总数：'+mMsgs.length+'。\n'+chunks[i]}
      ],opts);
      partSummaries.push(part);
    }
    if(partSummaries.length===1)return {summary:partSummaries[0]};
    const summary=await reliableMeetingSummaryJson([
      {role:'system',content:instruction+'以下是同一场见面按时间顺序整理的 '+partSummaries.length+' 段事实小结。合并为整场见面梗概（建议350–600字），务必保留关键对话、关系转折、角色行动、地点变化与未完成安排，不得遗漏早期重要事件，不要简单说从何开始到何结束。'},
      {role:'user',content:timeContext+'\n最后已知地点：'+location+'。\n'+partSummaries.map((x,i)=>'第'+(i+1)+'/'+partSummaries.length+'段：'+x).join('\n')}
    ],opts);
    return {summary};
  }
  const buildMeetingSummaryText=(p,c,loc,mMsgs,aiSummary='',isManual=false)=>{
    if(aiSummary&&String(aiSummary).trim().length>=6)return isManual?String(aiSummary).trim():stripProtocolTags(String(aiSummary),{preserveParagraphs:false}).slice(0,850);
    // No faux narrative: preserve the transcript and make the missing digest explicit.
    return '本次见面原文已完整保存，剧情小结尚未生成成功；可点击「重新整理整场梗概」补全。';
  };
  const upsertMeetingRecord=(p,c,meetingId,mMsgs,customLoc='',aiSummary='',finishedAt='',summarySource='')=>{
    if(!mMsgs||!mMsgs.length)return null;
    const existing=(db.meetings||[]).find(x=>x.id===meetingId);
    const rel=relation(p.id,c.id),isActive=rel?.mode==='meeting'&&rel.active_meeting_id===meetingId;
    // Freeze the confirmed scene with the meeting itself. A different itinerary
    // or later relationship cannot rewrite this meeting's last real position.
    const archivedHistory=Array.isArray(existing?.location_history)?existing.location_history:[];
    const sceneHistory=isActive?activeMeetingLocationHistory(p,c).map(e=>({...e})):archivedHistory.map(e=>({...e}));
    const confirmedPlace=sceneHistory.at(-1)?.location||'';
    const loc=confirmedPlace||String(customLoc||existing?.location||'').trim()||
      inferMeetingLocation(p.id,c.id,'');
    const startedAt=(isActive&&rel.meeting_started_at)||existing?.started_at||mMsgs[0].created_at||stamp();
    const actualFinish=finishedAt||existing?.finished_at||'';
    const endedAt=actualFinish||mMsgs[mMsgs.length-1].created_at||startedAt;
    const timeStr=chatClockLabel(startedAt);
    const unchanged=existing?.entries?.length===mMsgs.length&&existing.entries.every((x,i)=>x.id===mMsgs[i].id&&x.text===(mMsgs[i].sender==='user'?String(mMsgs[i].text??''):cleanMeetingNovelText(mMsgs[i].text)));
    const explicitSummary=String(aiSummary||'').trim();
    const retainedAi=explicitSummary||(unchanged?existing?.ai_summary:'')||'';
    const manualSummary=Boolean(retainedAi)&&(summarySource==='manual'||(!explicitSummary&&unchanged&&existing?.summary_source==='manual'));
    const summary=buildMeetingSummaryText(p,c,loc,mMsgs,retainedAi,manualSummary);
    const entries=mMsgs.map(m=>({id:m.id,sender:m.sender,speaker:m.sender==='user'?p.name:c.name,text:m.sender==='user'?String(m.text??''):cleanMeetingNovelText(m.text),created_at:m.created_at}));
    const rec={
      id:meetingId,
      profile_id:p.id,
      character_id:c.id,
      location:loc,
      location_history:sceneHistory,
      time:timeStr,
      started_at:startedAt,
      ended_at:endedAt,
      finished_at:actualFinish,
      duration_ms:Math.max(0,Date.parse(endedAt)-Date.parse(startedAt)),
      summary,
      ai_summary:retainedAi,
      summary_source:retainedAi?(manualSummary?'manual':'ai'):'fallback',
      summary_edited_at:manualSummary?(summarySource==='manual'?stamp():String(existing?.summary_edited_at||'')):'',
      message_ids:mMsgs.map(m=>m.id),
      entries
    };
    for(const m of mMsgs)m.meeting_id=meetingId;
    if(existing)Object.assign(existing,rec);
    else db.meetings.push(rec);
    // An AI-only holding shot is not proof that the player ever arrived.
    // Keep the original card/transcript, but do not mint an experienced memory.
    if(!mMsgs.some(m=>m.sender==='user'&&m.mode==='meeting'&&!m.recalled&&m.engine!=='recalled'))return rec;
    const oldMemory=db.episodicMemories.find(x=>x.owner_id===c.id&&x.profile_id===p.id&&x.source_key==='meeting:'+meetingId);
    if(oldMemory?.disputed)return rec; // preserve explicit user corrections
    appendEpisodicMemory({
      owner_id:c.id,
      profile_id:p.id,
      source_type:'meeting_summary',
      source_key:'meeting:'+meetingId,
      knowledge_mode:'experienced',
      summary:`和 ${p.name} 在「${loc}」见面（开始：${meetingArchiveClock(startedAt)}；确认结束：${meetingArchiveClock(actualFinish)}；末次互动：${meetingArchiveClock(mMsgs.at(-1)?.created_at)}）：${summary}`,
      tags:[loc,'见面',...extractMemoryTags(summary,5)],
      importance:4,
      emotional_weight:4,
      unresolved:0,
      raw_msg_ids:rec.message_ids,
      meeting_id:meetingId,
      // The canonical full transcript is db.meetings[meetingId]. New memories
      // only store a meeting_id reference. Existing inline legacy copies are
      // intentionally preserved by appendEpisodicMemory's existing fallback.
      meeting_data:null,
      event_at:endedAt
    });
    const updated=db.episodicMemories.find(x=>x.owner_id===c.id&&x.profile_id===p.id&&x.source_key==='meeting:'+meetingId);
    if(updated){updated.raw_msg_ids=rec.message_ids.slice();updated.archive_stale=false;}
    return rec;
  };
  // Permanent deletion differs from soft recall: no placeholder, archived transcript or linked memory survives.
  function forgetMessages(p,c,messageIds,wholeMeetingIds=[]){
    const ids=new Set(messageIds.map(String));
    const whole=new Set(wholeMeetingIds.map(String));
    const removed=db.messages.filter(m=>m.profile_id===p.id&&m.character_id===c.id&&ids.has(m.id));
    if(!removed.length)return {removedIds:[],removedMeetingIds:[]};
    const affectedMeetings=new Set([...whole,...removed.filter(m=>m.mode==='meeting').map(m=>m.meeting_id).filter(Boolean)]);
    const affectedDates=new Set(removed.map(m=>localDateStr(Date.parse(m.created_at))));
    const erasedMeetings=(db.meetings||[]).filter(rec=>rec.profile_id===p.id&&rec.character_id===c.id&&whole.has(rec.id));
    const oldMeetingIds=new Set(affectedMeetings);
    const oldMemIds=new Set();
    for(const mem of db.episodicMemories||[]){
      if(mem.owner_id!==c.id||mem.profile_id!==p.id)continue;
      const sources=[...(mem.raw_msg_ids||[]),...(mem.meeting_data?.message_ids||[])];
      if(sources.some(id=>ids.has(id))||
         [...whole].some(mid=>mem.meeting_id===mid||mem.source_key==='meeting:'+mid)||
         (mem.source_type==='daily-summary'&&affectedDates.has(String(mem.source_key||'').replace(/^day:/,'')))){
        oldMemIds.add(mem.id);
      }
    }
    db.episodicMemories=(db.episodicMemories||[]).filter(mem=>!oldMemIds.has(mem.id)&&!(mem.owner_id===c.id&&mem.profile_id===p.id&&oldMemIds.has(mem.clarifies_id)));
    db.messages=db.messages.filter(m=>!(m.profile_id===p.id&&m.character_id===c.id&&ids.has(m.id)));
    pruneMeetingCheckpoints(p.id,c.id);
    for(const msg of db.messages)if(msg.profile_id===p.id&&msg.character_id===c.id&&ids.has(msg.quote?.id))msg.quote=null;
    for(const id of ids)invalidateTranslation(id);
    const oldEventIds=new Set(removed.map(m=>m.id));
    db.events=(db.events||[]).filter(e=>{
      if(e.profile_id!==p.id||e.character_id!==c.id)return true;
      if(oldEventIds.has(e.message_id)||whole.has(e.meeting_id))return false;
      if((e.type==='meeting'||e.type==='return')&&erasedMeetings.some(rec=>{
        const marker=e.type==='meeting'?rec.started_at:(rec.finished_at||rec.ended_at);
        return Number.isFinite(Date.parse(marker))&&Math.abs(Date.parse(e.created_at)-Date.parse(marker))<15000;
      }))return false;
      if(['user_message','ai_message','message_recalled'].includes(e.type)&&removed.some(m=>Math.abs(Date.parse(e.created_at)-Date.parse(m.created_at))<1200&&String(e.summary||'').includes(String(m.text||'').slice(0,30))))return false;
      return true;
    });
    const q=db.queue[pairKey(p.id,c.id)];
    if(q){q.pending=(q.pending||[]).filter(id=>!ids.has(id));if(!q.pending.length)q.dueAt=0;}
    for(const mode of ['chat','meeting']){
      const ts=getTaskState(p.id,c.id,mode);
      if(ts?.pending_ids)ts.pending_ids=ts.pending_ids.filter(id=>!ids.has(id));
      if(mode==='meeting'&&affectedMeetings.has(ts?.meeting_id))clearTaskState(p.id,c.id,'meeting');
    }
    const store=episodeStore();
    store.jobs=store.jobs.filter(job=>job.owner_id!==c.id||job.profile_id!==p.id||!(
      ids.has(String(job.source_key||'').replace(/^episode:/,''))||
      (job.raw_msg_ids||[]).some(id=>ids.has(id))
    ));
    store.deleted=store.deleted.filter(x=>x.owner_id!==c.id||x.profile_id!==p.id||!(x.raw_msg_ids||[]).some(id=>ids.has(id)));
    const diary=db.diaries?.[pairKey(p.id,c.id)];
    if(diary?.byDate)for(const date of affectedDates)delete diary.byDate[date];
    const surveil=db.surveillance?.[pairKey(p.id,c.id)];
    if(surveil?.byDate)for(const daily of Object.values(surveil.byDate)){
      if(Array.isArray(daily.slots))daily.slots=daily.slots.filter(x=>!oldMeetingIds.has(x.meeting_id));
    }
    const removedMeetingIds=[];
    for(const mid of affectedMeetings){
      const remaining=messagesOf(p.id,c.id).filter(m=>m.mode==='meeting'&&m.meeting_id===mid);
      if(remaining.length){
        const rec=(db.meetings||[]).find(x=>x.id===mid);
        if(rec){rec.ai_summary='';rec.finished_at=rec.finished_at||'';}
        upsertMeetingRecord(p,c,mid,remaining,rec?.location||'');
      }else{
        db.meetings=(db.meetings||[]).filter(x=>!(x.id===mid&&x.profile_id===p.id&&x.character_id===c.id));
        db.episodicMemories=(db.episodicMemories||[]).filter(x=>!(x.owner_id===c.id&&x.profile_id===p.id&&(x.meeting_id===mid||x.source_key==='meeting:'+mid)));
        removedMeetingIds.push(mid);
      }
    }
    const rel=relation(p.id,c.id);
    if(rel?.mode==='chat'&&erasedMeetings.some(rec=>rec.location===rel.meeting_location)){
      const latest=(db.meetings||[]).filter(x=>x.profile_id===p.id&&x.character_id===c.id).sort((a,b)=>String(b.ended_at).localeCompare(String(a.ended_at)))[0];
      rel.meeting_location=latest?.location||'';
    }
    episodeList(p,c);
    return {removedIds:[...ids],removedMeetingIds};
  }
  const ensureMeetingRecords=(p,c)=>{
    const allMsgs=messagesOf(p.id,c.id);
    const groups=new Map();
    const existingMembership=new Map();
    for(const rec of db.meetings||[])if(rec.profile_id===p.id&&rec.character_id===c.id)
      for(const msgId of rec.message_ids||[])existingMembership.set(msgId,rec.id);
    let legacyMid='';
    for(const m of allMsgs){
      if(m.mode!=='meeting'){legacyMid='';continue;}
      const mid=m.meeting_id||existingMembership.get(m.id)||legacyMid||('meet_'+m.id);
      if(!m.meeting_id)m.meeting_id=mid;
      legacyMid=mid;
      if(!groups.has(mid))groups.set(mid,[]);
      groups.get(mid).push(m);
    }
    const r=relation(p.id,c.id);
    for(const [mid,msgs] of groups){
      const customLoc=r?.active_meeting_id===mid?(r.meeting_location||''):'';
      upsertMeetingRecord(p,c,mid,msgs,customLoc);
    }
    // Reopened sessions can be non-contiguous. Remove orphan cards, never split by chat boundaries.
    db.meetings=(db.meetings||[]).filter(rec=>rec.profile_id!==p.id||rec.character_id!==c.id||groups.has(rec.id));
    db.episodicMemories=(db.episodicMemories||[]).filter(m=>{
      if(m.owner_id!==c.id||m.profile_id!==p.id)return true;
      if(m.source_type==='meeting_summary'&&m.meeting_id&&!groups.has(m.meeting_id))return false;
      if(m.source_type==='milestone')return false;
      if(m.source_type==='dialogue'){
        if(String(m.summary||'').includes('陈述（见面文字）')||String(m.summary||'').includes('（见面发言）'))return false;
        const hasProm=PROMISE_KEYWORDS.some(w=>String(m.summary||'').includes(w));
        if(!hasProm&&!m.unresolved&&!m.disputed&&String(m.summary||'').includes('陈述（对话文字）'))return false;
      }
      return true;
    });
  };
  // Episode archive: grouping is deterministic; the model only summarizes supplied records.
