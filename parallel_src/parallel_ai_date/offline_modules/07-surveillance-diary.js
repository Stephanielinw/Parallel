  const localDateStr=ts=>{
    try{
      const d=new Date(ts||Date.now());
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    }catch{return new Date().toISOString().slice(0,10)}
  };
  const hhmmToMin=str=>{
    const m=String(str||'00:00').match(/^(\d{1,2}):(\d{2})/);
    if(!m)return 0;
    return Math.min(1439,Math.max(0,Number(m[1])*60+Number(m[2])));
  };
  const minToHHMM=mins=>{
    const clamped=Math.min(1439,Math.max(0,Math.round(mins)));
    return `${String(Math.floor(clamped/60)).padStart(2,'0')}:${String(clamped%60).padStart(2,'0')}`;
  };
  const offsetDateStr=(baseDateStr,deltaDays)=>{
    try{
      const [y,m,d]=String(baseDateStr||localDateStr()).split('-').map(Number);
      const dt=new Date(y,(m||1)-1,(d||1)+deltaDays);
      return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,'0')}-${String(dt.getDate()).padStart(2,'0')}`;
    }catch{return localDateStr(Date.now()+deltaDays*86400000)}
  };
  const buildDefaultSurveillanceSlots=(p,c,dateStr)=>{
    const src=String(c.source||'');
    let h=0;for(const ch of (c.id+dateStr))h=(Math.imul(31,h)+ch.charCodeAt(0))|0;
    const shift=((h>>>0)%3)*10;
    const variant=((h>>>2)>>>0)%3;
    let raw=[];
    if(src.includes('巫师')){
      const morningLocs=['城郊林间小径','旧磨坊外围林地','河谷旧哨站遗址'];
      const morningActs=['沿途勘查与采集草药','排查委托留下的痕迹','巡视周边地形与水源'];
      const afternoonLocs=['工匠铺与市集街口','炼金材料铺与铁匠坊','城门告示板与草药摊'];
      const afternoonActs=['补充物资与修整银剑','采购炼金基底与保养皮具','核对近期委托与购置补给'];
      raw=[
        ['00:00','06:50','旅店二楼客房','深眠休整','夜间休整与冥想',`${c.name}在安静的木屋客房里休整，常用的随身装备整齐搁在床尾矮凳上，呼吸平缓。`],
        ['06:50','08:30','旅店后院与马厩','清晨整备','晨起洗漱与擦拭装备',`晨雾还未散尽，${c.name}坐在院子长凳上检查随身护具与行囊，为白天的行程做准备。`],
        ['08:30','11:30',morningLocs[variant],'外出巡查',morningActs[variant],`林间光线斑驳，${c.name}沿着小路缓步前行，步伐沉稳，留意着四周的风吹草动。`],
        ['11:30','13:30','旧城区酒馆靠窗座','午间小憩','吃简餐与稍作休息',`酒馆里人不算多，${c.name}选了最僻静的角落位置坐下用午餐，目光偶尔投向窗外街道。`],
        ['13:30','16:30',afternoonLocs[variant],'处理日常事务',afternoonActs[variant],`与熟识的匠人交谈了几句，仔细清点完所需物资，正准备前往下一个歇脚处。`],
        ['16:30','19:00','约定的街角咖啡馆','傍晚闲暇','坐在靠窗位置喝热饮放松',`${c.name}坐在靠窗的木桌旁，手边放着一杯温热的饮品，难得享受片刻安静时光。`],
        ['19:00','21:00','河畔石桥步道','傍晚散步','沿河岸慢步透气',`夕阳余晖洒在水面上，${c.name}双手插在衣袋里沿河岸慢走，难得没有紧绷的任务压力。`],
        ['21:00','22:45','落脚处 · 起居室','夜间独处','擦拭随身器械与翻阅手记',`室内点着柔和的暖灯，${c.name}卸下外衣靠在椅背上，整理着白天的见闻与手记。`],
        ['22:45','23:59','落脚处 · 卧室','准备入睡','熄灯休息',`结束了白天的奔波，房间归于安静，随身物品妥善放在床头。`]
      ];
    }else if(src.includes('赛博朋克')){
      const morningLocs=['工作室与设备间','地下超梦剪辑室','车库改装台'];
      const morningActs=['调试设备与处理手头委托','校准超梦轨道与清理缓存','检修引擎线路与改装配件'];
      const afternoonLocs=['城区外勤路线','日本街电子零件铺','河谷区旧仓库街口'];
      const afternoonActs=['在城里跑腿与交接事务','淘换绝版芯片与老旧零件','完成中间人交代的收尾工作'];
      raw=[
        ['00:00','07:30','沃森区公寓 · 卧室','深夜熟睡','拉下百叶窗休息',`百叶窗滤掉了窗外霓虹广告牌的微光，${c.name}在安静的房间里熟睡，手机连着充电线放在床头。`],
        ['07:30','09:00','街角合成咖啡摊','晨间醒神','买热咖啡与早点',`${c.name}站在清晨人还不多的街角摊位前等一杯热美式，迎着微凉的晨风活动了一下肩膀。`],
        ['09:00','12:00',morningLocs[variant],'专注忙碌',morningActs[variant],`工作台上亮着几块全息屏幕，${c.name}专注地处理着手头的工作，偶尔停下来喝口水。`],
        ['12:00','13:45','丽姿街区简餐店','午休时间','吃午餐与放空',`挑了个离音响远一点的卡座，${c.name}慢条斯理地解决午餐，看着窗外匆忙的行人。`],
        ['13:45','16:30',afternoonLocs[variant],'外出办事',afternoonActs[variant],`穿过午后车流密集的街区，${c.name}刚办完手头的一桩正事，靠在路边栏杆旁歇脚。`],
        ['16:30','19:00','约定的街角咖啡馆','傍晚小憩','喝咖啡听歌放松',`店里放着舒缓的旧时代音乐，${c.name}坐在靠窗的位置，手指轻轻叩着杯壁。`],
        ['19:00','21:15','海边观景栈道','吹风散步','看日落与晚风散步',`晚风带着一点微凉的湿气，${c.name}站在栏杆边望着远处的灯火，神色平静柔和。`],
        ['21:15','23:00','沃森区公寓 · 客厅','居家独处','窝在沙发里听老唱片与整理工具',`换上了舒适的居家T恤，室内留了一盏落地灯，${c.name}正半靠在沙发上听音乐放松。`],
        ['23:00','23:59','沃森区公寓 · 卧室','夜间休整','准备入睡',`洗漱完毕后关掉了客厅大灯，房间里只余下微弱的待机指示灯。`]
      ];
    }else if(src.includes('漫威')){
      const morningLocs=['总部简报室与训练区','战术模拟训练馆','市区联络站档案室'];
      const morningActs=['审阅简报与日常格斗训练','完成高强度体能与战术对抗','复盘近期行动记录与安全巡检'];
      const afternoonLocs=['装备维护区与档案室','布鲁克林旧街区书店','后勤保障中心'];
      const afternoonActs=['核对档案与维护随身装备','翻看历史旧刊与补充日用品','测试新调校的战术护具'];
      raw=[
        ['00:00','07:00','私人公寓 · 卧室','夜间熟睡','深度睡眠休整',`房间里十分安静，窗外是城市凌晨的微光，${c.name}呼吸均匀，正在休息。`],
        ['07:00','08:30','晨间公园跑道','晨练与买早餐','晨跑后顺路买咖啡',`刚结束清晨的例行锻炼，${c.name}手里拎着热咖啡和纸袋早餐，步履轻快地走回住处。`],
        ['08:30','11:45',morningLocs[variant],'日常勤务',morningActs[variant],`${c.name}正在专注处理白天的日常勤务与训练，神情认真投入。`],
        ['11:45','13:30','街区复古简餐厅','午间休息','吃午饭与看报',`阳光透过玻璃窗照在餐桌上，${c.name}摘下外套搭在椅背上，享受安静的午餐时间。`],
        ['13:30','16:30',afternoonLocs[variant],'午后事务',afternoonActs[variant],`下午的事务不算紧急，${c.name}有条不紊地收尾手头的事情。`],
        ['16:30','19:00','约定的街角咖啡馆','傍晚闲暇','喝咖啡看书小憩',`选了店里最安静的靠窗角落，${c.name}面前放着一杯热饮，目光温和地望向窗外行人。`],
        ['19:00','21:00','旧唱片行与河岸步道','傍晚散步','逛旧书店与散步回程',`顺路逛了逛街角的旧书与唱片店，随后沿着河岸步道慢慢走回家。`],
        ['21:00','22:50','私人公寓 · 客厅','居家放松','听黑胶老歌与阅读书籍',`留声机里放着轻柔的爵士乐，${c.name}坐在沙发旁看书，享受夜晚的独处时光。`],
        ['22:50','23:59','私人公寓 · 卧室','睡前休息','准备熄灯入睡',`夜色渐深，${c.name}整理好明天的安排，靠在床头准备休息。`]
      ];
    }else{
      const morningLocs=['外勤联络处与靶场','战术射击训练场','行动简报室与装备库'];
      const morningActs=['战术训练与装备校准','进行例行射击考核与体能训练','整理外勤装备与查阅行动简报'];
      const afternoonLocs=['档案室与街区巡查点','西区安全屋与器材室','市政街区外围巡查线'];
      const afternoonActs=['整理卷宗与外勤巡查','清点应急物资与核对路线','完成例行街区安全排查'];
      raw=[
        ['00:00','07:00','个人住所 · 卧室','深夜休整','安静熟睡休息',`房间窗帘拉得很严，随身物品整齐放在床头柜上，${c.name}呼吸平稳克制。`],
        ['07:00','08:30','街角晨间咖啡店','晨间醒神','买热美式与简餐',`趁早高峰前靠在吧台边等一杯黑咖啡，${c.name}顺手规划着白天的勤务安排。`],
        ['08:30','11:40',morningLocs[variant],'日常勤务',morningActs[variant],`${c.name}刚完成上午的例行训练与装备维护，正在擦拭随身器械并核对勤务记录。`],
        ['11:40','13:30','旧城区小餐馆','午间简餐','靠窗位置用餐小憩',`选了视野开阔的角落位置吃午饭，${c.name}神情比工作时松弛了不少。`],
        ['13:30','16:30',afternoonLocs[variant],'午后事务',afternoonActs[variant],`${c.name}翻阅着近期的报告卷宗，偶尔停下笔望向窗外街道，指尖轻轻敲击桌面。`],
        ['16:30','19:00','约定的街角咖啡馆','傍晚小憩','喝咖啡与看书放松',`靠窗的位置放着一杯喝了一半的咖啡，${c.name}正低头翻阅旧书，享受片刻清闲。`],
        ['19:00','20:45','河畔步道与便利超市','傍晚散步','采购日用品与散步',`拎着刚买的日用品沿河岸慢步走回住处，晚风吹动${c.name}的外套衣角。`],
        ['20:45','22:45','个人住所 · 客厅','居家独处','换上便服保养装备与看书',`换上了宽松舒适的居家便服，电台低声放着背景音，${c.name}正坐在桌旁整理私人物品。`],
        ['22:45','23:59','个人住所 · 书桌旁','睡前整理','夜读与准备休息',`台灯亮着暖黄色的光，结束了白天的忙碌，${c.name}正准备洗漱休息。`]
      ];
    }
    return raw.map((item,idx)=>{
      let sMin=hhmmToMin(item[0]);
      let eMin=hhmmToMin(item[1]);
      if(idx>0&&idx<raw.length-1){
        sMin=Math.min(1400,sMin+shift);
        eMin=Math.min(1425,eMin+shift);
      }else if(idx===0){
        eMin=Math.min(1400,eMin+shift);
      }else if(idx===raw.length-1){
        sMin=Math.min(1425,sMin+shift);
      }
      return {
        id:`slot_${idx+1}`,
        start:idx===0?'00:00':minToHHMM(sMin),
        end:idx===raw.length-1?'23:59':minToHHMM(eMin),
        location:item[2],
        status:item[3],
        activity:item[4],
        scene:item[5],
        source:'schedule'
      };
    });
  };
  const getSurveillanceStore=(p,c)=>{
    db.surveillance ||= {};
    const key=pairKey(p.id,c.id);
    let store=db.surveillance[key];
    // Migrate legacy single-day record if needed
    if(store&&store.date&&Array.isArray(store.slots)){
      const legacy=store;
      store={byDate:{[legacy.date]:legacy}};
      db.surveillance[key]=store;
    }
    if(!store||typeof store.byDate!=='object'||!store.byDate){
      store={byDate:{}};
      db.surveillance[key]=store;
    }
    const today=localDateStr();
    const yesterday=offsetDateStr(today,-1);
    const twoDaysAgo=offsetDateStr(today,-2);
    for(const dStr of [twoDaysAgo,yesterday,today]){
      if(!store.byDate[dStr]||!Array.isArray(store.byDate[dStr].slots)||!store.byDate[dStr].slots.length){
        store.byDate[dStr]={
          date:dStr,
          profile_id:p.id,
          character_id:c.id,
          engine:'demo',
          updated_at:stamp(),
          slots:buildDefaultSurveillanceSlots(p,c,dStr)
        };
      }
    }
    // Also ensure any date that had historical meetings or messages has a surveillance record
    for(const m of (db.meetings||[])){
      if(m.profile_id===p.id&&m.character_id===c.id&&m.started_at){
        const mDate=localDateStr(m.started_at);
        if(/^\d{4}-\d{2}-\d{2}$/.test(mDate)&&!store.byDate[mDate]){
          store.byDate[mDate]={
            date:mDate,
            profile_id:p.id,
            character_id:c.id,
            engine:'demo',
            updated_at:stamp(),
            slots:buildDefaultSurveillanceSlots(p,c,mDate)
          };
        }
      }
    }
    return store;
  };
  const getOrInitSurveillance=(p,c,targetDate='')=>{
    const store=getSurveillanceStore(p,c);
    const today=localDateStr();
    const dStr=(targetDate&&/^\d{4}-\d{2}-\d{2}$/.test(targetDate))?targetDate:today;
    if(!store.byDate[dStr]||!Array.isArray(store.byDate[dStr].slots)||!store.byDate[dStr].slots.length){
      store.byDate[dStr]={
        date:dStr,
        profile_id:p.id,
        character_id:c.id,
        engine:'demo',
        updated_at:stamp(),
        slots:buildDefaultSurveillanceSlots(p,c,dStr)
      };
    }
    return store.byDate[dStr];
  };
  const getCurrentSurveillanceSlot=(p,c,at=Date.now())=>{
    const rec=getOrInitSurveillance(p,c,localDateStr(at));
    const r=relation(p.id,c.id);
    const nowHHMM=fmtHHMM(at)||'12:00';
    const nowMin=hhmmToMin(nowHHMM);
    if(r?.mode==='meeting'){
      const history=activeMeetingLocationHistory(p,c);
      const loc=history.at(-1)?.location||'约定的见面地点';
      return {
        id:'live_meeting',
        start:r.meeting_started_at&&localDateStr(r.meeting_started_at)!==localDateStr(at)?'00:00':fmtHHMM(r.meeting_started_at||at)||nowHHMM,
        end:nowHHMM,
        location:loc,
        status:`与 ${p.name} 见面中（接触待确认）`,
        activity:`在「${loc}」参与本次见面；是否已经接触由现场实际行为决定`,
        scene:`${c.name}在「${loc}」进行本次见面，不能预先替 ${p.name} 决定出现、接近或搭话。`,
        source:'meeting',
        meeting_id:r.active_meeting_id||'',
        actual_started_at:r.meeting_started_at||new Date(at).toISOString(),
        isCurrent:true,
        isMeetingLive:true
      };
    }
    const active=rec.slots[activeSlotIndex(rec.slots,nowMin)]||rec.slots.filter(s=>hhmmToMin(s.start)<=nowMin).at(-1)||rec.slots[0];
    // Older saved builds may still contain the 09:51–23:59 placeholder.
    // Display it as unknown whereabouts, never as a verified 13:00 scene.
    const legacyPending=Boolean(active?.source==='meeting_shift'&&rec.post_meeting_id&&
      (active?.is_unconfirmed||String(active?.id||'').startsWith('slot_meeting_shift_'))&&!active?.is_planned);
    const display=legacyPending?{
      ...active,is_unconfirmed:true,status:'见面后去向待核实',
      activity:'最近一次确认在见面地点；之后没有位置证据',
      scene:c.name+'的上次确认地点为「'+String(rec.post_meeting_location||active.location||'未知地点')+'」，当前去向尚未核实；不能把推测当成真实足迹。'
    }:active;
    return {...witnessedSurveillanceSlot(p,c,display),isCurrent:true,isMeetingLive:false};
  };
  // Meeting is a live wall-clock interval, not a guessed future schedule.
  const syncSurveillanceOnMeetingStart=(p,c,loc,meetingId)=>{
    const rec=getOrInitSurveillance(p,c,localDateStr());
    const cut=hhmmToMin(fmtHHMM(Date.now()));
    // Invalidate all speculative future rows as soon as the real scene starts.
    rec.slots=rec.slots.flatMap(slot=>{
      const start=hhmmToMin(slot.start),end=hhmmToMin(slot.end);
      if(start>=cut)return [];
      return [end>cut?{...slot,end:minToHHMM(cut)}:slot];
    });
    rec.live_override={meeting_id:meetingId,location:loc,started_at:relation(p.id,c.id)?.meeting_started_at||stamp()};
    delete rec.post_meeting_anchor;delete rec.post_meeting_location;delete rec.post_meeting_id;
    rec.updated_at=stamp();
    return rec;
  };
  const syncSurveillanceOnMeetingEnd=(p,c,meetingRecord)=>{
    if(!meetingRecord||!meetingRecord.entries?.some(m=>m.sender==='user'))return null;
    const begin=Date.parse(meetingRecord.started_at),finish=Date.parse(meetingRecord.ended_at);
    if(!Number.isFinite(begin)||!Number.isFinite(finish)||finish<begin)return null;
    const loc=meetingRecord.location||'约定的街角咖啡馆';
    let rec=null;
    // The surveillance store retains recent days. Do not synthesize future minutes
    // or pretend a cross-midnight meeting occurred on just one calendar day.
    const dates=[...new Set([localDateStr(begin),offsetDateStr(localDateStr(finish),-2),offsetDateStr(localDateStr(finish),-1),localDateStr(finish)])].sort();
    for(const date of dates){
      if(date<localDateStr(begin)||date>localDateStr(finish))continue;
      rec=getOrInitSurveillance(p,c,date);
      const segmentRows=meetingSurveillanceSegments(p,c,date,finish,meetingRecord.summary).map(x=>({...x,meeting_id:meetingRecord.id,actual_ended_at:meetingRecord.ended_at,isCurrent:false}));
      const slots=segmentRows.length?segmentRows:[{id:'slot_meet_'+meetingRecord.id+'_'+date,start:date===localDateStr(begin)?fmtHHMM(begin):'00:00',end:date===localDateStr(finish)?fmtHHMM(finish):'23:59',location:loc,status:'线下见面足迹',activity:'与 '+p.name+' 在「'+loc+'」当面见面',scene:meetingRecord.summary,source:'meeting',meeting_id:meetingRecord.id}];
      const base=rec.slots.filter(x=>x.meeting_id!==meetingRecord.id);
      rec.slots=overlayActualSlots(base,slots);rec.updated_at=stamp();
      if(date===localDateStr(finish))anchorRemainingDayAfterMeeting(p,c,meetingRecord,finish);
    }
    return rec;
  };
  // A finished real meeting invalidates only the *remaining* tentative itinerary.
  // Keep everything before the meeting end, including confirmed physical events.
  function anchorRemainingDayAfterMeeting(p,c,meetingRecord,fromMs=Date.parse(meetingRecord?.ended_at||'')){
    if(!Number.isFinite(fromMs))return null;
    const rec=getOrInitSurveillance(p,c,localDateStr(fromMs));
    const end=hhmmToMin(fmtHHMM(fromMs)),last=1439;
    if(end>=last)return null;
    const loc=String(meetingRecord.location||'约定的见面地点');
    const known={
      id:'slot_meeting_shift_'+meetingRecord.id+'_'+end,
      start:minToHHMM(end),end:'23:59',location:loc,
      status:'见面后去向待核实',
      activity:'最近一次确认在见面地点；之后没有位置证据',
      scene:c.name+'与 '+p.name+' 的见面已结束，最后确认地点是「'+loc+'」。目前并无证据证明仍在原地，待日程重排。',
      source:'meeting_shift',meeting_id:meetingRecord.id,is_unconfirmed:true
    };
    rec.slots=overlayActualSlots(rec.slots,[known]);
    rec.post_meeting_anchor=meetingRecord.ended_at;
    rec.post_meeting_location=loc;
    rec.post_meeting_id=meetingRecord.id;
    rec.updated_at=stamp();
    return rec;
  }
  // At most one model call per character while resuming an unfinished replan.
  const pendingPostMeetingPlans=new Map();
  async function replanRemainingDayAfterMeeting(p,c,meetingRecord,fromMs=Date.parse(meetingRecord?.ended_at||'')){
    if(pub().mode!=='live'||!Number.isFinite(fromMs)||!meetingRecord?.id||!meetingRecord.entries?.some(m=>m.sender==='user'))return null;
    const originalFinish=Date.parse(meetingRecord.ended_at||'');
    if(!Number.isFinite(originalFinish))return null;
    const anchor=Math.max(fromMs,originalFinish);
    if(localDateStr(anchor)!==localDateStr())return null; // do not rewrite history
    const key=pairKey(p.id,c.id);
    if(pendingPostMeetingPlans.has(key))return pendingPostMeetingPlans.get(key);
    const task=(async()=>{
      let rec=getOrInitSurveillance(p,c,localDateStr(anchor));
      // The ending is anchored only once. Retrying later must preserve intervening
      // confirmed SMS locations rather than overwriting the whole afternoon.
      if(rec.post_meeting_id!==meetingRecord.id||!rec.post_meeting_anchor){
        rec=anchorRemainingDayAfterMeeting(p,c,meetingRecord,originalFinish)||rec;
      }
      const meetingId=rec.post_meeting_id,meetingAnchor=rec.post_meeting_anchor;
      const minute=hhmmToMin(fmtHHMM(anchor)),last=1439;
      if(minute>=last-2)return rec;
      const isDelayed=anchor-originalFinish>=10*60000;
      const settleEnd=isDelayed?minute:Math.min(last,minute+15);
      const planFrom=minToHHMM(settleEnd);
      // A chat can confirm a subsequent location. Such evidence outranks the
      // last meeting room; speculative itinerary does not.
      const observed=rec.slots.filter(x=>x.source==='chat_update'&&hhmmToMin(x.start)<=minute)
        .sort((a,b)=>hhmmToMin(a.start)-hhmmToMin(b.start)).at(-1);
      const lastKnown=String(observed?.location||meetingRecord.location||'地点未确认').slice(0,40);
      const postChat=messagesOf(p.id,c.id).filter(m=>m.mode==='chat'&&!m.recalled&&m.engine!=='recalled'&&!isChatArtifact(m))
        .filter(m=>{const at=Date.parse(m.created_at);return Number.isFinite(at)&&at>originalFinish&&at<=Date.now();})
        .slice(-12);
      const latestChatAt=postChat.at(-1)?.created_at||meetingRecord.ended_at;
      const chatEvidence=postChat.map(m=>
        '['+chatClockLabel(m.created_at)+' '+(m.sender==='user'?p.name:c.name)+'] '+
        String(m.text||'').replace(/\s+/g,' ').slice(0,200)).join('\n');
      const realTurns=(meetingRecord.entries||[]).filter(m=>['user','ai'].includes(m?.sender))
        .slice(-8).map(m=>
          '['+String(m.created_at||'').slice(0,19)+' '+(m.sender==='user'?p.name:c.name)+'] '+
          String(m.text||'').replace(/\s+/g,' ').slice(0,260)).join('\n');
      const digest=String(meetingRecord.ai_summary||meetingRecord.summary||'').slice(0,600);
      rec.post_meeting_attempted_at=stamp();
      try{
        const rules='你是角色个人日程规划器。按照已经发生的面对面见面、之后的手机聊天，以及角色独立的工作与生活，重排今天剩下尚未发生的日程。'+
          '见面已于 '+fmtHHMM(originalFinish)+' 结束，最近一次确认的地点是「'+lastKnown+'」。'+
          (isDelayed?'现在已是 '+fmtHHMM(anchor)+'；中间未记录的行动属于未知，不得声称已证实角色这几小时始终停留在见面地点，也不得凭空倒填已经发生的行动。':'见面刚刚结束，后续移动必须有合理的步行、交通或工作衔接。')+
          '已说出的计划不等于真的完成；明确取消的计划不应执行。没有发生的约会不能当作事实。'+
          '合理安排角色自己的工作、补给、休息或社交，不得让角色永远停在见面场景，也不要全天围绕对方打转。'+
          '首段开始不早于 '+planFrom+'，连续覆盖至23:59，给出2至4段。它们属于推演的未来安排，不是假装已经亲眼目睹的事实。'+
          '只输出JSON：{"slots":[{"start":"HH:MM","end":"HH:MM","location":"地点","status":"简短状态","activity":"具体行为","scene":"第三人称画面"}]}。';
        const raw=await llm([{role:'system',content:rules},
          {role:'user',content:'角色：'+c.name+'；原作时期：'+c.version+'；原作资料：'+String(c.canon||'').slice(0,350)+
            '\n结束见面时间：'+chatClockLabel(originalFinish)+'；现在：'+chatClockLabel(anchor)+
            '\n见面摘要（如果是生成失败提示则不能作为事件依据）：'+digest+
            '\n【见面最后真实现场原文】\n'+(realTurns||'未取得现场原文')+
            '\n【见面结束后真正发生的手机聊天】\n'+(chatEvidence||'尚无后续聊天')+
            '\n请据此推演今后日程，明确区分亲历事实、谈话计划及合理推测。'}],
          {json_mode:true,profile:p,character:c,mode:'surveillance',entry_point:'surveillance_after_meeting',background:true,temperature:0.35,max_tokens:2048});
        const result=JSON.parse(raw);
        const rows=Array.isArray(result?.slots)?result.slots:[];
        if(!rows.length)throw Error('见面后日程生成未提供有效时间段');
        // Ignore obsolete replies if a new meeting began while the model was busy.
        const fresh=getOrInitSurveillance(p,c,localDateStr(anchor));
        if(fresh!==rec||relation(p.id,c.id)?.mode==='meeting'||
          rec.post_meeting_id!==meetingId||rec.post_meeting_anchor!==meetingAnchor)return rec;
        let cursor=settleEnd;
        const planned=[];
        for(const row of rows.slice(0,5)){
          if(!row||typeof row!=='object')continue;
          const endRaw=/^\d{2}:\d{2}$/.test(String(row.end||''))?hhmmToMin(row.end):NaN;
          if(!Number.isFinite(endRaw)||endRaw<=cursor)continue;
          const end=Math.min(last,endRaw);
          const loc=String(row.location||lastKnown).trim().slice(0,30)||lastKnown;
          if(incompatibleCharacterSlot(c,row))continue;
          planned.push({
            id:'slot_replanned_'+meetingId+'_'+planned.length+'_'+cursor,
            start:minToHHMM(cursor),end:minToHHMM(end),location:loc,
            status:String(row.status||'调整后行程').slice(0,16),
            activity:String(row.activity||'根据实际见面调整后续安排').slice(0,90),
            scene:String(row.scene||'后续日程根据最新互动重新安排。').slice(0,170),
            source:'meeting_shift',meeting_id:meetingId,is_planned:true
          });
          cursor=end;
          if(cursor>=last)break;
        }
        if(!planned.length)throw Error('见面后日程没有可用的未来时间段');
        if(cursor<last)planned[planned.length-1].end='23:59';
        const settle=isDelayed?[]:[{
          id:'slot_post_on_site_'+meetingId+'_'+minute,
          start:minToHHMM(minute),end:planFrom,location:lastKnown,
          status:'见面后整理',activity:'结束见面，开始整理接下来的安排',
          scene:c.name+'刚结束见面，接下来的安排将从最后确认的地点合理衔接。',
          source:'meeting_shift',meeting_id:meetingId,is_planned:true
        }];
        // Keep actual chat-derived locations authoritative even if the future
        // planner generated an incompatible location for the same minute.
        const confirmed=rec.slots.filter(x=>x.source==='chat_update'&&hhmmToMin(x.end)>minute);
        rec.slots=overlayActualSlots(overlayActualSlots(rec.slots,[...settle,...planned]),confirmed);
        rec.engine='live';
        rec.post_meeting_planned_at=stamp();
        rec.post_meeting_evidence_at=latestChatAt;
        rec.post_meeting_retry_at=0;
        rec.post_meeting_attempts=0;
        rec.updated_at=stamp();
        clearBgError(p.id,c.id,'surveillance');
        save();
      }catch(e){
        // Do not silently freeze at "just ended meeting" for the entire day.
        const stillCurrent=getOrInitSurveillance(p,c,localDateStr(anchor));
        if(stillCurrent===rec&&rec.post_meeting_id===meetingId){
          const attempts=Math.min(8,Number(rec.post_meeting_attempts||0)+1);
          rec.post_meeting_attempts=attempts;
          rec.post_meeting_retry_at=Date.now()+Math.min(20*60000,(2**Math.min(attempts-1,4))*2*60000);
          rec.updated_at=stamp();
          recordBgError(p.id,c.id,'surveillance',e.apiError||{message:String(e?.message||e),title:'见面后日程重排失败'});
          rec._lastApiError=e.apiError||{message:String(e?.message||e),title:'见面后日程重排失败'};
        }
      }
      return rec;
    })();
    pendingPostMeetingPlans.set(key,task);
    try{return await task}finally{if(pendingPostMeetingPlans.get(key)===task)pendingPostMeetingPlans.delete(key)}
  }
  function activeSlotIndex(slots,minute){
    for(let i=slots.length-1;i>=0;i--)if(hhmmToMin(slots[i].start)<=minute&&minute<=hhmmToMin(slots[i].end))return i;
    return -1;
  }
  function overlayActualSlots(base,actual){
    let result=base.slice();
    for(const observed of actual){
      const start=hhmmToMin(observed.start),end=hhmmToMin(observed.end);
      if(end<start)continue;
      const next=[];
      for(const slot of result){
        const a=hhmmToMin(slot.start),b=hhmmToMin(slot.end);
        if(b<=start||a>=end){next.push(slot);continue;}
        if(a<start)next.push({...slot,end:observed.start});
        if(b>end)next.push({...slot,id:slot.id+'_after_'+observed.end,start:observed.end});
      }
      next.push(observed);result=next.sort((a,b)=>hhmmToMin(a.start)-hhmmToMin(b.start));
    }
    return result;
  }
  // An accepted outgoing phone message is evidence of wakefulness, not a claim
  // that the character slept until the planned end or will remain awake forever.
  function isSleepingSlot(slot){
    if(!slot||['meeting','chat_update'].includes(slot.source))return false;
    const status=String(slot.status||''),activity=String(slot.activity||''),scene=String(slot.scene||'');
    const actual=/(?:熟睡|深眠|浅眠|睡眠|沉睡|已入睡|正在睡|睡着|已睡|安睡|\basleep\b|\bsleeping\b|\bdeep sleep\b|\bslumber\b)/i;
    const preparing=/(?:准备(?:入睡|睡觉)|睡前|即将入睡|打算睡|\bprepar(?:e|ing) (?:to sleep|for bed)\b|\bgetting ready for bed\b)/i;
    if(actual.test(status))return true;
    if(preparing.test(status)||preparing.test(activity))return false;
    return actual.test(activity)||actual.test(scene);
  }
  function wakeSlotFromMessage(slots,hhmm,characterName,makeId){
    const minute=hhmmToMin(hhmm),idx=activeSlotIndex(slots,minute);
    if(idx<0||!isSleepingSlot(slots[idx]))return false;
    const old=slots[idx];
    const observed={...old,id:makeId(),start:hhmm,status:'已醒来发消息',activity:'已醒来查看并发送手机消息，尚未确认再次入睡',scene:characterName+'已经发出手机消息，原先的睡眠安排被打断。',source:'chat_update'};
    if(hhmmToMin(old.start)<minute)slots.splice(idx,1,{...old,end:hhmm},observed);
    else slots.splice(idx,1,observed);
    return true;
  }
  function reconcilePhoneActivity(pid,cid,at=Date.now()){
    const p=db.profiles.find(x=>x.id===pid),c=byId.get(cid);
    if(!p||!c||relation(pid,cid)?.mode==='meeting')return;
    const rec=getOrInitSurveillance(p,c,localDateStr(at));
    if(wakeSlotFromMessage(rec.slots,fmtHHMM(at)||'12:00',c.name,()=> 'slot_chat_'+uid()))rec.updated_at=stamp();
  }
  function chatClockLabel(ts){
    const d=new Date(ts??Date.now());
    if(!Number.isFinite(d.getTime()))return '时间未知';
    return localDateStr(d.getTime())+' '+fmtHHMM(d.getTime());
  }
  // This is a time-anchor for content, not a time-of-day keyword ban.
  // In particular, future-night talk must not automatically become a "go to bed now" reply.
  function chatTemporalTopicHint(history,now=Date.now()){
    const hour=new Date(now).getHours();
    if(hour<5||hour>=18)return '';
    const recent=(history||[]).slice(-12).filter(m=>m.engine!=='recalled'&&!m.recalled).map(m=>String(m.text??'')).join(' ');
    if(!/(?:今晚|今夜|晚上|夜里|晚安|梦里|做梦|梦见|梦到|睡觉|洗漱|钻被窝|上床|休息)/.test(recent))return '';
    const lastUsers=(history||[]).slice(-5).filter(m=>m.sender==='user'&&m.engine!=='recalled').map(m=>String(m.text??'')).join(' ');
    const explicitlyRestingNow=/(?:我现在|现在就|这会儿|我先|我要|我准备|马上|立刻|刚好).{0,10}(?:睡觉|睡了|睡一觉|午睡|睡午觉|睡午觉了|睡午觉啦|休息|眯一会)|(?:我去睡了|我去睡觉|困得不行|要睡了)/.test(lastUsers);
    return '\n【白天讨论夜晚·情境校准】最近的短信涉及晚上、梦境或睡眠话题，但现在仍是'+(hour<12?'上午':'下午')+'。这些是谈论中的时间，不表示对方已经准备立刻睡觉或当前已经入夜。'+(explicitlyRestingNow?'对方最近可能明确提到当前要休息；可以尊重并自然回应，但不要把下午误写成夜晚。':'对方没有明确表示此刻要睡：不要把话题当作睡前告别，不要直接催其现在洗漱、钻被窝或以“晚安”结束当前聊天。可以自然说“今晚再说”“晚上做个好梦”，但必须保持时间指向正确。');
  }
  // M10: background outreach must respect the phone owner's local night and
  // an explicit recent request to sleep. This is a send gate, not an AI hint:
  // the model cannot override it by narrating a different time of day.
  // Manual "trigger now" is a deliberate user action and bypasses quiet hours.
  function proactiveQuietReason(history,now=Date.now(),manual=false){
    if(manual)return '';
    const hour=new Date(now).getHours();
    if(hour>=23||hour<8)return 'overnight-quiet-hours';
    const rows=(Array.isArray(history)?history:[]).filter(m=>
      m&&m.sender==='user'&&m.mode==='chat'&&!m.recalled&&m.engine!=='recalled'&&
      Number.isFinite(Date.parse(m.created_at)));
    const last=rows.at(-1);
    if(!last)return '';
    const latest=Date.parse(last.created_at);
    if(latest>now+60000||now-latest>4*3600000)return '';
    const grouped=rows.slice(-12).filter(m=>latest-Date.parse(m.created_at)<=15*60000&&
      Date.parse(m.created_at)<=latest).map(m=>String(m.text||''));
    const tail=String(last.text||'');
    if(/(?:醒了|起床了|睡醒了|不睡了|还没睡|我不困|i(?:'| a)?m awake|woke up)/i.test(tail))return '';
    if(grouped.some(s=>/(?:准备.{0,8}(?:睡|躺平)|(?:我|先|要|去|准备|打算).{0,6}(?:睡觉|睡了|睡一觉|大睡|休息|补觉)|(?:晚安|good ?night|going to bed|off to bed|going to sleep|need some sleep|我困了|睡不动了))/i.test(s)))
      return 'recent-explicit-sleep';
    return '';
  }
  // A conservative last-resort rejection for obviously impossible
  // "it's noon / the sun is overhead" assertions during deep night.
  // Do not rewrite AI text: suppress that proactive turn instead.
  function proactiveTimeContradiction(text,now=Date.now()){
    if(new Date(now).getHours()>=5)return false;
    return /(?:太阳.{0,10}(?:升到头顶|升到正头顶|晒屁股|已经当空|正当空)|(?:都|已经|这都|现在|马上|快)(?:.{0,5})(?:大中午|中午了|早上了|上午了|天亮了)|大白天了|早上好|good morning|good afternoon)/i.test(String(text||''));
  }
  function chatClockContext(history,now=Date.now()){
    const d=new Date(now),offset=-d.getTimezoneOffset(),sign=offset>=0?'+':'-',abs=Math.abs(offset);
    const zone='UTC'+sign+String(Math.floor(abs/60)).padStart(2,'0')+':'+String(abs%60).padStart(2,'0');
    const hours=d.getHours(),period=hours<5?'凌晨':hours<12?'上午':hours<18?'下午':'晚上';
    const last=[...history].reverse().find(m=>m.sender==='user'&&Number.isFinite(Date.parse(m.created_at)));
    const previous=last?'最近一条用户消息实际发送于 '+chatClockLabel(last.created_at)+'，距现在约 '+Math.max(0,Math.floor((now-Date.parse(last.created_at))/60000))+' 分钟。':'';
    return '\n【本次手机回复的当前时间 · 事实优先级最高】'+chatClockLabel(now)+'（'+period+'，'+zone+'，应用本地时钟）。'+previous+'现实时钟与用户最新的明确行动决定当前状态；历史聊天中的“今晚、晚安、睡觉、做梦”仅表示说话时的内容，不是现在已经入夜或正在睡觉的证据。绝不因为当前话题在谈将来的晚上，就把现在改写成夜晚、催对方立即入睡或提前结束对话。只有对方当前明确表示现在要睡/休息、或角色明说是提前祝福时，才在白天自然使用睡前告别。发送前默默检查时间指向：讨论未来的夜晚与此刻的白天必须区分；不要机械报时，不要输出时间元数据，也不要把现实日期改变为原作年份。'+chatTemporalTopicHint(history,now);
  }
  const syncSurveillanceFromChat=(p,c,userRows,aiText,at=Date.now())=>{
    const txt=String(aiText||'').trim();
    if(!txt||relation(p.id,c.id)?.mode==='meeting')return;
    const newLoc=txt.split(/\s+\/\s+|\|\|\||\n/).map(locationFromReport).filter(Boolean).at(-1);
    if(!newLoc||incompatibleCharacterSlot(c,{location:newLoc}))return;
    const rec=getOrInitSurveillance(p,c,localDateStr(at));
    const nowHHMM=fmtHHMM(at)||'12:00',nowMin=hhmmToMin(nowHHMM),idx=activeSlotIndex(rec.slots,nowMin);
    if(idx<0)return;
    const slot=rec.slots[idx];
    if(slot.location===newLoc&&slot.source==='chat_update')return;
    const observed={...slot,id:'slot_chat_'+uid(),start:nowHHMM,location:newLoc,status:'聊天动态同步',activity:`在「${newLoc}」活动（角色亲自提及）`,scene:`${c.name}在消息里提到此刻身处「${newLoc}」。`,source:'chat_update'};
    if(hhmmToMin(slot.start)<nowMin)rec.slots.splice(idx,1,{...slot,end:nowHHMM},observed);
    else rec.slots.splice(idx,1,observed);
    rec.updated_at=stamp();
  };
  const appointmentPlanningEvidence=(p,c,dateStr)=>{
    const chat=messagesOf(p.id,c.id).filter(m=>m.mode==='chat'&&!m.recalled&&m.engine!=='recalled'&&!isChatArtifact(m));
    const target=new Date(dateStr+'T12:00:00').getTime();
    const relevant=/约|见面|见你|碰面|接你|接我|咖啡|电影|吃饭|晚饭|午饭|烧烤|火锅|约会|见(?:一面|一见)|meet|date|dinner|lunch|movie|coffee|tomorrow|明天|后天|周末|星期|下周/i;
    const dated=/点半?|[0-2]?\d:\d\d|明天|后天|今天|今晚|周末|星期|下周|月\d{1,2}日|\d{1,2}号|约好|定好|确定|不见不散|meet|tomorrow/i;
    const matches=[];
    chat.forEach((m,i)=>{
      const when=Date.parse(m.created_at);
      if(Number.isFinite(when)&&when<=target+12*3600000&&target-when<=31*86400000&&relevant.test(m.text)&&dated.test(m.text))matches.push(i);
    });
    const selected=new Set();
    for(const i of matches.slice(-12))for(let j=Math.max(0,i-2);j<Math.min(chat.length,i+4);j++)selected.add(j);
    return [...selected].sort((a,b)=>a-b).slice(-28).map(i=>{
      const m=chat[i];return '['+chatClockLabel(m.created_at)+'] '+(m.sender==='user'?p.name:c.name)+'：'+String(m.text||'').slice(0,130);
    }).join('\n').slice(-3500);
  };
  async function ensureLiveSurveillance(p,c,forceRefresh=false,targetDate=''){
    const today=localDateStr();
    const dStr=(targetDate&&/^\d{4}-\d{2}-\d{2}$/.test(targetDate))?targetDate:today;
    const rec=getOrInitSurveillance(p,c,dStr);
    delete rec._lastApiError;
    if(pub().mode!=='live')return rec;
    // Live meeting truth wins; re-generating a fake day while together is counterproductive.
    if(dStr===today&&relation(p.id,c.id)?.mode==='meeting')return rec;
    if(dStr===today&&rec.post_meeting_anchor&&rec.post_meeting_id){
      // Earlier versions saved a full-day "just ended meeting" placeholder even
      // when the replan model failed. Upgrade those saves without touching scenes.
      const oldPlan=rec.slots.some(x=>String(x.id||'').startsWith('slot_replanned_')&&x.meeting_id===rec.post_meeting_id);
      if(oldPlan&&!rec.post_meeting_planned_at){
        rec.post_meeting_planned_at=rec.updated_at||rec.post_meeting_anchor;
        rec.post_meeting_evidence_at=rec.post_meeting_anchor;
      }
      const meeting=(db.meetings||[]).find(x=>x.id===rec.post_meeting_id&&x.profile_id===p.id&&x.character_id===c.id);
      const now=Date.now(),lastPlan=Date.parse(rec.post_meeting_planned_at||'')||0;
      const laterChat=messagesOf(p.id,c.id).filter(m=>m.mode==='chat'&&!m.recalled&&m.engine!=='recalled'&&!isChatArtifact(m))
        .some(m=>{const at=Date.parse(m.created_at);return Number.isFinite(at)&&at>Date.parse(rec.post_meeting_evidence_at||rec.post_meeting_anchor||'')&&at<=now;});
      const staleForChat=Boolean(lastPlan&&laterChat&&now-lastPlan>=15*60000);
      const shouldRetry=!lastPlan||staleForChat;
      if(meeting&&(forceRefresh||(shouldRetry&&now>=Number(rec.post_meeting_retry_at||0)))){
        return await replanRemainingDayAfterMeeting(p,c,meeting,now);
      }
      // Preserve confirmed meeting and SMS footprints; never reconstruct an
      // unrelated full day from 00:00 just because this date was revisited.
      return rec;
    }
    if(rec.engine==='live'&&!forceRefresh)return rec;
    try{
      const appointmentEvidence=appointmentPlanningEvidence(p,c,dStr);
      const relSummary=relationshipBaselineSummary(p.id,c.id,p.name);
      const sys=`你是日程与世界线生成引擎。请为角色 ${c.name}（来源：${c.source} · ${c.version}，背景：${c.canon}）生成 ${dStr} 从 00:00 到 23:59 的完整一日生活足迹监控表（共 8 到 9 个连续时间段，无缝覆盖全天）。现实日历日期仅用于应用调度与记录；原作时期、人物年龄、历史事件与技术水平保持对应版本，不因现实年份改变。
要求：
1. 严密贴合 ${c.name} 的原作职业、性格与独立生活习惯，角色有自己的工作、同伴与日常，不要整天围着 ${p.name} 转（当前关系：${relSummary}）。
2. 每个时间段包含：start ("HH:MM"), end ("HH:MM"), location (具体地点，不超过14字), status (简短状态标签，4-6字), activity (正在做的事，不超过16字), scene (极具画面感的第三人称现场微描写，35-70字，描写环境光影、小动作或神态，严禁使用任何 emoji)。
3. 只输出 JSON 对象，格式严格为：{"slots":[{"start":"00:00","end":"07:00","location":"...","status":"...","activity":"...","scene":"..."}]}`;
      const appointmentRules='\n已确认的约会优先于普通日程。根据以下带日期的短信往来判断双方是否明确同意，只有已经相互确认、日期匹配的安排才预留相应时间和往返交通；单方面建议、模糊邀约、已经取消的约定不能写成真实计划。必须区分发送日的“明天”与目标日。约好不代表已经发生，实际见面会覆盖计划。';
      const out=await llm([{role:'system',content:sys+appointmentRules},{role:'user',content:`目标日期 ${dStr}；可供核对的邀约上下文（不一定已经确认）：\n${appointmentEvidence||'无可核对的约会证据'}\n请生成 ${c.name} 的全天足迹 JSON。`}],{json_mode:true,profile:p,character:c,mode:'surveillance',entry_point:'surveillance',background:!forceRefresh});
      const parsed=JSON.parse(out);
      if(Array.isArray(parsed?.slots)&&parsed.slots.length>=5){
        const preserved=rec.slots.filter(s=>['meeting','chat_update','meeting_shift'].includes(s.source));
        const aiSlots=parsed.slots.slice(0,12).map((s,i)=>({
          id:`slot_ai_${i+1}`,
          start:/^\d{2}:\d{2}$/.test(String(s.start||''))?String(s.start):'08:00',
          end:/^\d{2}:\d{2}$/.test(String(s.end||''))?String(s.end):'10:00',
          location:String(s.location||'日常地点').trim().slice(0,24),
          status:String(s.status||'日常动态').trim().slice(0,12),
          activity:String(s.activity||'日常活动').trim().slice(0,28),
          scene:String(s.scene||'').trim().slice(0,160),
          source:'schedule'
        }));
        rec.slots=overlayActualSlots(aiSlots.map(slot=>verifiedSlotForDisplay(c,slot)),preserved);
        rec.engine='live';
        rec.updated_at=stamp();
        clearBgError(p.id,c.id,'surveillance');
        save();
      }
    }catch(e){
      recordBgError(p.id,c.id,'surveillance',e.apiError||{message:String(e.message||e)});
      if(forceRefresh)rec._lastApiError=e.apiError||null;
    }
    return rec;
  }
  const buildSurveillancePayload=(p,c,requestedDate='')=>{
    const store=getSurveillanceStore(p,c);
    const today=localDateStr();
    const selDate=(requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)&&requestedDate<=today)?requestedDate:today;
    const isToday=(selDate===today);
    const rec=getOrInitSurveillance(p,c,selDate);
    const availableDates=Object.keys(store.byDate).filter(d=>d<=today).sort((a,b)=>b.localeCompare(a));
    const nowHHMM=fmtHHMM(Date.now())||'12:00';
    const nowMin=hhmmToMin(nowHHMM);
    const current=isToday?getCurrentSurveillanceSlot(p,c):null;
    // The live meeting is an authoritative interval, not an extra event
    // appended alongside an incompatible generated schedule.
    const actualMeetingSlots=isToday&&current?.isMeetingLive?
      meetingSurveillanceSegments(p,c,selDate,Date.now()):[];
    // Current live scene is authoritative. Never display an old tentative itinerary
    // after the real meeting began as though that itinerary had already occurred.
    const visibleSlots=actualMeetingSlots.length?(()=>{
      const activeMid=relation(p.id,c.id)?.active_meeting_id||'';
      const first=actualMeetingSlots[0].start,cut=hhmmToMin(first);
      const before=rec.slots.filter(s=>s.meeting_id!==activeMid&&hhmmToMin(s.start)<cut)
        .map(s=>hhmmToMin(s.end)>cut?{...s,end:first}:s);
      return [...before,...actualMeetingSlots];
    })():rec.slots;
    const unlocked=[];
    let lockedCount=0;
    for(const rawSlot of visibleSlots){
      const s=witnessedSurveillanceSlot(p,c,rawSlot);
      if(!isToday||hhmmToMin(s.start)<=nowMin){
        unlocked.push({
          ...s,
          isCurrent:Boolean(isToday&&current&&(current.isMeetingLive?s.source==='meeting'&&s.start===actualMeetingSlots.at(-1)?.start&&s.location===current.location:(s.id===current.id||(s.start===current.start&&s.location===current.location))))
        });
      }else{
        lockedCount++;
      }
    }
    const bgErr=db.bgErrors?.[pairKey(p.id,c.id)]?.surveillance||null;
    const apiErr=rec._lastApiError||null;
    delete rec._lastApiError;
    return {
      date:rec.date,
      today,
      isToday,
      availableDates,
      nowTime:nowHHMM,
      engine:rec.engine,
      characterId:c.id,
      characterName:c.name,
      current,
      unlockedSlots:unlocked.slice().reverse(),
      totalSlots:rec.slots.length,
      totalSlotsCount:rec.slots.length,
      lockedCount,
      bgError:bgErr,
      apiError:apiErr
    };
  };
  const computeIntimacyInfo=(p,c)=>{
    const rel=relation(p.id,c.id);
    const allMsgs=messagesOf(p.id,c.id).filter(m=>m.engine!=='recalled');
    const meetings=(db.meetings||[]).filter(x=>x.profile_id===p.id&&x.character_id===c.id);
    const boost=Number(rel?.affection_boost||0);
    const score=Math.min(100,Math.round(meetings.length*22+allMsgs.length*1.5+boost));
    if(score>=75){
      return {score,stage:'deep_love',label:'深陷偏爱 · 满心是你',desc:'角色已对你产生极深的情感依恋，日常行踪与思绪都会不自觉牵挂着你'};
    }
    if(score>=30){
      return {score,stage:'warming',label:'渐生熟稔 · 心有牵挂',desc:'角色保持着自己独立的工作与生活，但闲暇时会自然记起与你的对话'};
    }
    return {score,stage:'independent',label:'独立生活 · 自有天地',desc:'角色拥有独立完整的生活重心与日常，日记主要记录自身经历，不以你为生活核心'};
  };
  // M02 C-11: the surveillance ledger is partly a schedule, not a camera.
  // An AI-imagined itinerary (including legacy rows without an is_planned
  // marker) must never become a factual diary entry merely because it is in
  // the past. Only explicit face-to-face and chat-observed rows are evidence.
  const isDiaryObservedSlot=slot=>
    Boolean(slot)&&!slot.is_planned&&!slot.is_unconfirmed&&
    (slot.source==='meeting'||slot.source==='chat_update');
  const diarySourceEvidence=(p,c,dateStr,survRec)=>{
    const all=Array.isArray(survRec?.slots)?survRec.slots:[];
    const actual=all.filter(isDiaryObservedSlot);
    const projected=all.filter(s=>s&&!isDiaryObservedSlot(s));
    const meetingRecords=(db.meetings||[]).filter(m=>m.profile_id===p.id&&m.character_id===c.id&&Array.isArray(m.entries)&&m.entries.some(e=>e.sender==='user')&&
      m.started_at&&(localDateStr(m.started_at)===dateStr||localDateStr(m.ended_at||m.finished_at||m.started_at)===dateStr));
    const messages=messagesOf(p.id,c.id).filter(m=>m.created_at&&localDateStr(m.created_at)===dateStr&&
      m.engine!=='recalled'&&!m.recalled);
    return {actual,projected,meetingRecords,messages};
  };
  const diaryRows=slots=>slots.map(s=>String(s.start||'')+'-'+String(s.end||'')+
    ' 【'+String(s.location||'地点未知')+'】'+String(s.activity||'')+
    '（'+String(s.scene||'')+'）').join('\n');
  const buildDefaultDiary=(p,c,dateStr,survRec)=>{
    const evidence=diarySourceEvidence(p,c,dateStr,survRec);
    const {actual,projected,meetingRecords:dayMeetings,messages:dayMsgs}=evidence;
    const intimacy=computeIntimacyInfo(p,c);
    let h=0;for(const ch of (c.id+dateStr))h=(Math.imul(31,h)+ch.charCodeAt(0))|0;
    const weathers=['晴朗微风','多云转晴','微凉阴天','夜风清朗','浅雾转晴'];
    const moods=intimacy.stage==='deep_love'?['心绪温柔','满怀牵挂','平静而笃定']:['专注沉稳','平静松弛','略感倦意但踏实','波澜不惊'];
    const weather=weathers[(h>>>0)%weathers.length],mood=moods[((h>>>2)>>>0)%moods.length];
    let title='《'+dateStr+' · 日常记录》';
    const first=actual[0],last=actual.at(-1);
    const paras=[];
    if(first){
      paras.push('今天有明确记录的一段行踪是在「'+first.location+'」：'+first.activity+'。'+
        (actual.length>1?'后来可确认的地点还包括「'+last.location+'」。':'其他时段并没有足够的现场记录。')+
        '我宁愿只记下能确定的部分，也不替那些空白编造答案。');
    }else{
      paras.push('今天没有完整、可核对的现场行踪记录。即使日程表上安排得很满，也不能断定所有事情都照计划发生。工作与生活还有很多没有留下记录的细节。');
    }
    if(projected.length){
      paras.push('原先的日程里还计划去「'+String(projected[0].location||'其他地方')+'」处理「'+String(projected[0].activity||'个人事务')+
        '」。这只是计划或推演，我不知道最后是否成行。无论如何，明天还有自己的事情要安排。');
    }else{
      paras.push('今天留给自己的时间也很重要。工作、休息和生活都应按实际情况调整；没有记录的部分暂且不下结论。');
    }
    if(dayMeetings.length||actual.some(s=>s.source==='meeting')){
      const mLoc=dayMeetings[0]?.location||actual.find(s=>s.source==='meeting')?.location||'约定的地方';
      title='《在'+mLoc+'相见的一天》';
      paras.push('今天确实在「'+mLoc+'」和 '+p.name+' 当面见过。这是有现场记录的一段经历，值得记住。至于分别之后各自去了哪里，若没有后续证据，就留待以后再说。');
    }else if(dayMsgs.length){
      const quote=dayMsgs.filter(m=>m.sender==='user').at(-1)?.text?.slice(0,28)||'近况';
      paras.push('今天在手机上和 '+p.name+' 交流过，谈到了「'+quote+'」。聊天中说过的计划未必就已经兑现。其他时间也要留给自己的生活。');
    }else{
      paras.push(intimacy.stage==='deep_love'
        ?'今天没有可确认的线下相处或短信互动，但安静下来时，我还是会想起 '+p.name+'。这份牵挂是真实的心绪，不代表今天已经见面或有过联系。自己的生活也仍要好好过下去。'
        :'今天没有可确认的线下相处或短信互动。那些没被记录下来的日常不必强行写成已经发生的故事；先整理心绪，接着过自己的生活。');
    }
    return {
      id:'diary_'+c.id+'_'+dateStr,date:dateStr,profile_id:p.id,character_id:c.id,
      title,weather,mood,
      intimacy_stage:intimacy.stage,intimacyStage:intimacy.stage,
      intimacy_label:intimacy.label,intimacy_score:intimacy.score,
      content:paras.join('\n\n'),
      footprints:actual.slice(0,4).map(s=>s.start+' '+s.location+'（'+s.activity+'）'),
      sourceLocations:actual.slice(0,4).map(s=>s.location),
      engine:'demo',created_at:stamp()
    };
  };
  const ensureDiariesUpToDate=(p,c)=>{
    db.diaries ||= {};
    const key=pairKey(p.id,c.id);
    if(!db.diaries[key]||typeof db.diaries[key].byDate!=='object'){
      db.diaries[key]={byDate:{}};
    }
    const diaryStore=db.diaries[key];
    const survStore=getSurveillanceStore(p,c);
    const today=localDateStr();
    let newlyGenerated=[];
    const pastDates=Object.keys(survStore.byDate).filter(d=>d<today).sort((a,b)=>a.localeCompare(b));
    for(const dStr of pastDates){
      if(!diaryStore.byDate[dStr]){
        diaryStore.byDate[dStr]=buildDefaultDiary(p,c,dStr,survStore.byDate[dStr]);
        newlyGenerated.push(dStr);
      }
    }
    return {diaryStore,newlyGenerated};
  };
  async function ensureLiveDiary(p,c,targetDate='',forceRefresh=false){
    const {diaryStore}=ensureDiariesUpToDate(p,c);
    const today=localDateStr();
    const yesterday=offsetDateStr(today,-1);
    const avail=Object.keys(diaryStore.byDate).sort((a,b)=>b.localeCompare(a));
    const dStr=(targetDate&&/^\d{4}-\d{2}-\d{2}$/.test(targetDate)&&targetDate<today)?targetDate:(avail[0]||yesterday);
    const survRec=getOrInitSurveillance(p,c,dStr);
    if(!diaryStore.byDate[dStr]||(forceRefresh&&pub().mode!=='live')){
      diaryStore.byDate[dStr]=buildDefaultDiary(p,c,dStr,survRec);
    }
    const entry=diaryStore.byDate[dStr];
    delete entry._lastApiError;
    // Existing diaries remain intact until explicit refresh; no surprise paid rewrite.
    if(pub().mode!=='live')return entry;
    if(entry.stale_after_recovery&&!forceRefresh)return entry;
    if(entry.engine==='live'&&!forceRefresh)return entry;
    try{
      const intimacy=computeIntimacyInfo(p,c);
      const evidence=diarySourceEvidence(p,c,dStr,survRec);
      const slotsTxt=diaryRows(evidence.actual)||'未取得可确认的现场地点记录';
      const planTxt=diaryRows(evidence.projected)||'无';
      const meetingTxt=evidence.meetingRecords.map(m=>{
        const turns=(m.entries||[]).filter(e=>e.sender==='user'||e.sender==='ai').slice(-4);
        return '已发生的见面 '+String(m.started_at||'')+' 至 '+String(m.ended_at||m.finished_at||'')+'，最后确认地点：'+String(m.location||'未知')+'；末尾原文：'+turns.map(e=>(e.sender==='user'?p.name:c.name)+'：'+String(e.text||'').replace(/\s+/g,' ').slice(0,180)).join(' / ');
      }).join('\n')||'没有确认的线下见面';
      const dayMsgs=messagesOf(p.id,c.id).filter(m=>m.created_at&&localDateStr(m.created_at)===dStr&&m.engine!=='recalled');
      const chatTxt=dayMsgs.length?dayMsgs.slice(-8).map(m=>`${m.sender==='user'?p.name:c.name}：${m.text.slice(0,80)}`).join('\n'):'当日无手机聊天';
      const sys=`你是 ${c.name}（来自《${c.source}》· ${c.version}，设定：${c.canon}）。现在是午夜 00:00 之后，请根据你【${dStr} 全天的监控行踪记录】写一篇你自己的第一人称私密日记。现实日历日期仅用于应用调度与记录；原作时期、人物年龄、历史事件与技术水平保持对应版本，不因现实年份改变。
核心铁律（必须严格遵守）：
1. 日记只把【确实发生的现场足迹】和【真实见面原文】当作已发生事实；【计划/AI 推演】只能用“原计划”“本想”“尚未确认”一类措辞提及，绝不能用“我去了”“我已经完成”等完成式陈述。即便日期已过去，推演也不会自动升级成事实。原始短信中对未来的约定也不等于已经兑现。已确认事实优先于推演。
2. 记住：你有自己独立完整的生活、事业与世界，并不是以用户（${p.name}）为生活核心！
   - 当前你对 ${p.name} 的感情阶段为：${intimacy.label}（阶段代码：${intimacy.stage}，好感分：${intimacy.score}/100）。
   - 如果阶段不是 deep_love（深陷偏爱）：日记 80%–90% 必须写你自己的工作、日常经历与独处感想；如果当天和 ${p.name} 聊过天或见过面，只在日记中自然、克制地顺带提一两句；如果当天没有互动，就完全不提或仅一笔带过，绝不围着用户转！
   - 只有当阶段为 deep_love（爱到不行了）时，才会在记录日常之余流露出对 ${p.name} 浓烈的爱意与反复回味。
3. 严禁使用任何 emoji 表情符号！文风必须符合 ${c.name} 的性格（第一人称“我”，分 3 个自然段，段与段之间用 \\n\\n 分隔）。
4. 只输出 JSON 对象，格式为：{"title":"《...》","weather":"纯文字天气（如：夜风微凉）","mood":"纯文字心情（如：平静专注）","content":"第一人称日记正文（3段）"}`;
      const out=await llm([{role:'system',content:sys},{role:'user',content:`【${dStr} 已确认的现场足迹（可以作为事实）】：\n${slotsTxt}\n\n【已发生的线下见面与末尾原文】：\n${meetingTxt}\n\n【${dStr} 计划与模型推演（未证实发生，禁止倒填为事实）】：\n${planTxt}\n\n【${dStr} 与 ${p.name} 的真实消息（消息中的主张或未来计划不自动成为客观事实）】：\n${chatTxt}\n\n请严格区分已发生事实与推测，生成该日日记 JSON。`}],{json_mode:true,profile:p,character:c,mode:'diary',entry_point:'diary',background:!forceRefresh});
      const parsed=JSON.parse(out);
      if(parsed&&parsed.content&&String(parsed.content).trim().length>=30){
        entry.title=String(parsed.title||entry.title).trim().slice(0,40);
        entry.weather=String(parsed.weather||entry.weather).trim().slice(0,16);
        entry.mood=String(parsed.mood||entry.mood).trim().slice(0,16);
        entry.content=String(parsed.content).trim().slice(0,2400);
        entry.intimacy_stage=intimacy.stage;
        entry.intimacyStage=intimacy.stage;
        entry.intimacy_label=intimacy.label;
        entry.intimacy_score=intimacy.score;
        entry.engine='live';
        delete entry.stale_after_recovery;
        entry.updated_at=stamp();
        clearBgError(p.id,c.id,'diary');
        save();
      }
    }catch(e){
      recordBgError(p.id,c.id,'diary',e.apiError||{message:String(e.message||e)});
      if(forceRefresh)entry._lastApiError=e.apiError||null;
    }
    return entry;
  }
  const buildDiaryPayload=(p,c,requestedDate='')=>{
    const {diaryStore,newlyGenerated}=ensureDiariesUpToDate(p,c);
    const today=localDateStr();
    const latestDate=Object.keys(diaryStore.byDate).sort((a,b)=>b.localeCompare(a))[0]||offsetDateStr(today,-1);
    const selectedDate=(requestedDate&&/^\d{4}-\d{2}-\d{2}$/.test(requestedDate)&&requestedDate<today)?requestedDate:latestDate;
    if(!diaryStore.byDate[selectedDate]){
      diaryStore.byDate[selectedDate]=buildDefaultDiary(p,c,selectedDate,getOrInitSurveillance(p,c,selectedDate));
    }
    const availableDates=Object.keys(diaryStore.byDate).sort((a,b)=>b.localeCompare(a));
    const diary=diaryStore.byDate[selectedDate];
    const intimacy=computeIntimacyInfo(p,c);
    const bgErr=db.bgErrors?.[pairKey(p.id,c.id)]?.diary||null;
    const apiErr=diary?._lastApiError||null;
    if(diary)delete diary._lastApiError;
    return {
      characterId:c.id,
      characterName:c.name,
      date:selectedDate,
      latestDate,
      selectedDate,
      availableDates,
      newlyGenerated,
      intimacy,
      diary,
      bgError:bgErr,
      apiError:apiErr
    };
  };
  // Location recognition is advisory only; the user chooses when to enter meeting mode.
