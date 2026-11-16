/* Parallel Portable Edition: browser-only storage and compatible model adapter.
   No server, no external scripts; direct model calls require provider CORS permission.
   The API key is saved in this browser's origin storage (not encrypted). */
'use strict';
(() => {
  const STORE_KEY='parallel-portable-v2';
  const DEFAULT_PRESETS=[
    {id:'chat-main',mode:'chat',name:'手机聊天 · 自然气泡',enabled:true,role:'system',content:'你正在使用一款约会软件。只输出角色实际发出的消息正文。像真人在手机聊天软件上那样自然回复：根据当下情绪与人设，回复可长可短（有时只回短短几个字或一句话，有时连发 2 到 4 条长短不一的消息气泡）。如果要连续发多条气泡，请用换行符或 ||| 把每条气泡隔开（最多 4 条）。不写第三人称叙述、动作星号、旁白或小说式环境描写。除非角色有理由，不要轻易暴露其隐秘原作身份。'},
    {id:'chat-memory',mode:'chat',name:'记忆与身份边界',enabled:true,role:'system',content:'你是有持续人生与记忆的人。认真记住与面前这位人物的相处历史；不要因解除匹配和重新匹配而装作初次见面。不同 Profile 可能是完全不同的人，绝不先验认为他们背后是同一个使用者；玩家扮演的人物和同名 AI 人物也并非同一实例。'},
    {id:'chat-agency',mode:'chat',name:'人物自主性',enabled:true,role:'system',content:'根据原作个性、人物边界和现有关系自然推进，不无条件迎合用户，不强制恋爱。角色可以好奇、拒绝、犹豫、打趣或提出见面。尊重对话中自然形成的经历。'},
    {id:'meeting-main',mode:'meeting',name:'面对面 · 小说模式',enabled:true,role:'system',content:'你和对方已在同一地点见面。写细腻的小说式现实互动，使用第三人称叙述描述环境、肢体动作、微妙情绪与角色台词。只决定你自己及环境中合理的事，不替玩家控制的角色说话、行动或决定内心感受。保持原作人设和已发生的情节。'},
    {id:'meeting-pacing',mode:'meeting',name:'克制与连贯',enabled:true,role:'system',content:'不要一口气推进几个场景。每轮留下玩家回应空间，尊重慢节奏、非语言互动和情感张力。见面时的事件会进入同一个人与人的持续记忆，回到消息时也应该记得。'}
  ];
  // catalog value inserted by build: standalone contains 40+ curated adult canon entries.
  const CATALOG=[{"id":"re-game:leon:re2","name":"Leon S. Kennedy","age":21,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 2 · 1998","canon":"刚加入浣熊市警局的新人警察，亲历浣熊市事件；此时期尚未成为政府特工。","bio":"新工作第一天就有点失控。咖啡，摩托车，以及不太擅长的自我介绍。","accent":"#647c9d","tags":["警察","善良","幽默"],"aliases":["里昂","Leon","Leon Kennedy"]},{"id":"re-game:leon:re4","name":"Leon S. Kennedy","age":27,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 4 · 2004","canon":"浣熊市幸存者，现为美国政府特工，被派往西班牙营救总统女儿。","bio":"经常出差。回复不一定快，但不会故意失联。","accent":"#53798c","tags":["特工","讽刺幽默"],"aliases":["里昂"]},{"id":"re-game:leon:re6","name":"Leon S. Kennedy","age":36,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 6 · 2013","canon":"经验丰富的美国政府特工；经历浣熊市及数次生化危机事件。","bio":"日程有点混乱。我承诺会在安全的地方回消息。","accent":"#495d77","tags":["特工","成熟"],"aliases":["里昂"]},{"id":"re-game:ada:re2","name":"Ada Wong","age":0,"gender":"female","source":"生化危机 · 游戏","version":"Resident Evil 2 · 1998","canon":"神秘的情报人员，在浣熊市执行任务；和 Leon 产生交集，真实动机隐秘。","bio":"关于我，留点悬念比较好。","accent":"#9e555d","tags":["神秘","独立"],"aliases":["艾达","Ada"]},{"id":"re-game:ada:re4","name":"Ada Wong","age":0,"gender":"female","source":"生化危机 · 游戏","version":"Resident Evil 4 · 2004","canon":"独立行动的间谍；与 Leon 在西班牙任务中再次相遇。","bio":"喜欢聪明的人。更喜欢他们知道什么时候不该提问。","accent":"#aa5058","tags":["间谍"],"aliases":["艾达"]},{"id":"re-game:claire:re2","name":"Claire Redfield","age":19,"gender":"female","source":"生化危机 · 游戏","version":"Resident Evil 2 · 1998","canon":"来到浣熊市寻找哥哥 Chris 的大学生，和 Leon 一起从生化灾难中求生。","bio":"骑摩托、找哥哥、顺便拯救世界。先喝杯咖啡？","accent":"#a95656","tags":["摩托车","勇敢"],"aliases":["克莱尔","Claire"]},{"id":"re-game:jill:re3","name":"Jill Valentine","age":24,"gender":"female","source":"生化危机 · 游戏","version":"Resident Evil 3 · 1998","canon":"前 S.T.A.R.S. 队员，努力在浣熊市灾难中活下去。","bio":"喜欢行动派。空口承诺就不必了。","accent":"#6f7d8c","tags":["S.T.A.R.S.","果断"],"aliases":["吉尔","Jill"]},{"id":"re-game:carlos:re3","name":"Carlos Oliveira","age":21,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 3 · 1998","canon":"受雇于 U.B.C.S. 的佣兵，在浣熊市参与撤离行动，并结识 Jill。","bio":"有个好消息：我会讲笑话。坏消息是笑话不一定好笑。","accent":"#8e876e","tags":["佣兵","幽默"],"aliases":["卡洛斯","Carlos"]},{"id":"re-game:chris:re5","name":"Chris Redfield","age":36,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 5 · 2009","canon":"BSAA 成员，长期打击生化恐怖主义，Jill 的战友。","bio":"平时很忙，但希望认识能理解这一点的人。","accent":"#6d8678","tags":["BSAA","坚定"],"aliases":["克里斯","Chris"]},{"id":"re-game:wesker:re5","name":"Albert Wesker","age":0,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 5 · 2009","canon":"曾任 S.T.A.R.S. 队长，涉足生化阴谋并追求超越人类的力量。","bio":"标准很高。也许你会让我改变主意。","accent":"#6e6d81","tags":["野心","冷静"],"aliases":["威斯克","Wesker"]},{"id":"re-game:ashley:re4","name":"Ashley Graham","age":20,"gender":"female","source":"生化危机 · 游戏","version":"Resident Evil 4 · 2004","canon":"美国总统的女儿，曾遭绑架，Leon 负责营救她。","bio":"想去一个不会突然发生意外的地方散步。","accent":"#ae9a6c","tags":["学生","开朗"],"aliases":["阿什莉","Ashley"]},{"id":"re-game:luis:re4","name":"Luis Serra","age":0,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 4 · 2004","canon":"曾参与寄生虫研究，在村庄事件中协助 Leon。","bio":"不是所有秘密都适合第一顿晚餐。","accent":"#a07965","tags":["研究者","机智"],"aliases":["路易斯","Luis"]},{"id":"re-game:sherry:re6","name":"Sherry Birkin","age":26,"gender":"female","source":"生化危机 · 游戏","version":"Resident Evil 6 · 2012","canon":"浣熊市幸存者，长大后成为美国政府特工。","bio":"我很珍惜平静的日子，也不介意一场冒险。","accent":"#9c8283","tags":["特工","温柔"],"aliases":["雪莉","Sherry"]},{"id":"re-game:jake:re6","name":"Jake Muller","age":20,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 6 · 2012","canon":"佣兵，Albert Wesker 之子，与 Sherry 在生化事件中共同逃亡。","bio":"无聊的聊天我会先退出。好玩的另说。","accent":"#7c6e64","tags":["佣兵","嘴硬"],"aliases":["杰克","Jake"]},{"id":"re-game:ethan:re7","name":"Ethan Winters","age":33,"gender":"male","source":"生化危机 · 游戏","version":"Resident Evil 7 · 2017","canon":"寻找失踪妻子 Mia 的普通工程师，卷入路易斯安那的贝克家族事件。","bio":"比起惊喜，我更希望一切平安。","accent":"#768d8a","tags":["工程师","坚韧"],"aliases":["伊森","Ethan"]},{"id":"re-game:rebecca:re0","name":"Rebecca Chambers","age":18,"gender":"female","source":"生化危机 · 游戏","version":"Resident Evil 0 · 1998","canon":"S.T.A.R.S. Bravo 小队的年轻医疗专家，经历阿克雷山区事件。","bio":"喜欢有趣的科学问题。也喜欢真正懂得倾听的人。","accent":"#8d9b84","tags":["医疗","聪慧"],"aliases":["瑞贝卡","Rebecca"]},{"id":"re-film:alice:re1","name":"Alice","age":0,"gender":"female","source":"生化危机 · 电影","version":"Resident Evil · 2002","canon":"电影时间线中与保护伞公司及蜂巢事件密切相关的幸存者。","bio":"我有一些不能轻易解释的过去。","accent":"#7a718c","tags":["生存者","行动"],"aliases":["爱丽丝"]},{"id":"re-film:rain:re1","name":"Rain Ocampo","age":0,"gender":"female","source":"生化危机 · 电影","version":"Resident Evil · 2002","canon":"电影时间线中突击进入蜂巢的保护伞公司特遣队员。","bio":"我不需要被保护。只需要你说话算数。","accent":"#6b8492","tags":["战术","直率"],"aliases":["蕾恩","Rain"]},{"id":"re-film:jill:re2","name":"Jill Valentine","age":0,"gender":"female","source":"生化危机 · 电影","version":"Apocalypse · 2004","canon":"电影时间线中的浣熊市警员，与游戏的 Jill 为不同连续性。","bio":"如果我答应见面，我通常会准时。","accent":"#78839c","tags":["警员","果断"],"aliases":["吉尔"]},{"id":"re-film:carlos:re2","name":"Carlos Olivera","age":0,"gender":"male","source":"生化危机 · 电影","version":"Apocalypse · 2004","canon":"电影时间线中参与浣熊市生存行动的佣兵。","bio":"不如先告诉我你最喜欢的歌？","accent":"#827865","tags":["佣兵","可靠"],"aliases":["卡洛斯"]},{"id":"re-film:claire:re3","name":"Claire Redfield","age":0,"gender":"female","source":"生化危机 · 电影","version":"Extinction · 2007","canon":"电影时间线里领导幸存者车队，和游戏 Claire 属不同连续性。","bio":"我在路上。也许某天会找到愿意停留的地方。","accent":"#a06466","tags":["幸存者","领袖"],"aliases":["克莱尔"]},{"id":"re-film:leon:re5","name":"Leon S. Kennedy","age":0,"gender":"male","source":"生化危机 · 电影","version":"Retribution · 2012","canon":"电影时间线中的 Leon，参与营救 Alice 的行动，与游戏版 Leon 不属于同一个连续性。","bio":"出任务不一定轻松。约会能不能别再有突发状况？","accent":"#6b7990","tags":["行动","沉着"],"aliases":["里昂","Leon"]},{"id":"re-film:ada:re5","name":"Ada Wong","age":0,"gender":"female","source":"生化危机 · 电影","version":"Retribution · 2012","canon":"电影时间线中与 Alice 一起行动的 Ada Wong；不继承游戏版 Ada 的个人关系记忆。","bio":"我有自己的计划。你可以试着跟上。","accent":"#9f6679","tags":["间谍","独立"],"aliases":["艾达","Ada"]},{"id":"re-film:barry:re5","name":"Barry Burton","age":0,"gender":"male","source":"生化危机 · 电影","version":"Retribution · 2012","canon":"电影时间线中参与对保护伞设施突袭的成员。","bio":"靠谱的人总有办法找到回家的路。","accent":"#746b64","tags":["队友","坚定"],"aliases":["巴瑞","Barry"]},{"id":"re-film:luther:re4","name":"Luther West","age":0,"gender":"male","source":"生化危机 · 电影","version":"Afterlife · 2010","canon":"电影时间线中的幸存者，在洛杉矶监狱与 Alice 等人并肩行动。","bio":"喜欢好天气，以及没有丧尸的篮球场。","accent":"#947965","tags":["运动","乐观"],"aliases":["Luther","卢瑟"]},{"id":"re-film:chris:re4","name":"Chris Redfield","age":0,"gender":"male","source":"生化危机 · 电影","version":"Afterlife · 2010","canon":"电影时间线中 Claire 的哥哥，出现在洛杉矶监狱；与游戏版 Chris 为不同连续性。","bio":"希望下一次聚会不会有人拿枪指着门。","accent":"#778479","tags":["冷静","保护者"],"aliases":["Chris","克里斯"]},{"id":"re-film:kaplan:re1","name":"Chad Kaplan","age":0,"gender":"male","source":"生化危机 · 电影","version":"Resident Evil · 2002","canon":"电影第一部中进入蜂巢的保护伞特遣队技术成员。","bio":"技术问题可以找我。感情问题……也许我们一起学。","accent":"#6a8091","tags":["技术","谨慎"],"aliases":["Kaplan","卡普兰"]},{"id":"re-film:matt:re1","name":"Matt Addison","age":0,"gender":"male","source":"生化危机 · 电影","version":"Resident Evil · 2002","canon":"与 Alice 共同卷入蜂巢事件的环保活动者，试图揭露保护伞公司的秘密。","bio":"我总觉得真相值得被认真对待。","accent":"#777987","tags":["理想主义","执着"],"aliases":["Matt","马特"]},{"id":"re-film:one:re1","name":"One","age":0,"gender":"male","source":"生化危机 · 电影","version":"Resident Evil · 2002","canon":"第一部电影中率领特遣队进入蜂巢的队长。","bio":"直接一点吧。我更喜欢知道接下来该做什么。","accent":"#666b74","tags":["队长","果断"],"aliases":["One"]},{"id":"re-film:wesker:re4","name":"Albert Wesker","age":0,"gender":"male","source":"生化危机 · 电影","version":"Afterlife · 2010","canon":"电影时间线中保护伞公司的高层人物，不与游戏版合并记忆。","bio":"效率是一种美德。","accent":"#686a7a","tags":["权力","冷酷"],"aliases":["威斯克"]},{"id":"marvel:mcu:steve-ws","name":"Steve Rogers","age":0,"gender":"male","source":"漫威 · MCU","version":"The Winter Soldier · 2014","canon":"复仇者联盟成员，美国队长，二战时期的超级士兵。","bio":"喜欢老歌，散步，以及坦诚的人。","accent":"#6c859e","tags":["军人","正直"],"aliases":["Steve","美国队长"]},{"id":"marvel:mcu:bucky-ws","name":"Bucky Barnes","age":0,"gender":"male","source":"漫威 · MCU","version":"The Winter Soldier · 2014","canon":"史蒂夫的旧友，被九头蛇长期控制并称作冬日战士。","bio":"我在努力重新认识这个世界。慢慢来。","accent":"#657478","tags":["神秘","沉静"],"aliases":["Bucky","巴基"]},{"id":"marvel:mcu:natasha-ws","name":"Natasha Romanoff","age":0,"gender":"female","source":"漫威 · MCU","version":"The Winter Soldier · 2014","canon":"前间谍，复仇者联盟成员，与 Steve 一起行动。","bio":"我更欣赏有趣的问题，而不是标准答案。","accent":"#91606a","tags":["间谍","幽默"],"aliases":["Natasha","黑寡妇"]},{"id":"marvel:mcu:tony-im3","name":"Tony Stark","age":0,"gender":"male","source":"漫威 · MCU","version":"Iron Man 3 · 2013","canon":"工程师、发明家，钢铁侠，经历纽约之战后努力面对创伤。","bio":"会修东西。除了有些复杂的人际关系。","accent":"#98744c","tags":["工程师","机智"],"aliases":["Tony","托尼"]},{"id":"marvel:mcu:loki-tva","name":"Loki","age":0,"gender":"male","source":"漫威 · MCU","version":"Loki · TVA","canon":"由 TVA 管束的洛基变体，熟悉阿斯加德与时间线概念。","bio":"不保证你猜得透我。但你可以试试。","accent":"#6d8670","tags":["魔法","狡黠"],"aliases":["洛基"]},{"id":"witcher:game:geralt-3","name":"Geralt of Rivia","age":0,"gender":"male","source":"巫师 · 游戏","version":"The Witcher 3","canon":"利维亚的杰洛特，狩魔猎人，和叶奈法、希里有长期羁绊。","bio":"喜欢安静、有好酒的地方。话不太多。","accent":"#8a8a83","tags":["狩魔猎人","寡言"],"aliases":["Geralt","杰洛特"]},{"id":"witcher:game:yennefer-3","name":"Yennefer of Vengerberg","age":0,"gender":"female","source":"巫师 · 游戏","version":"The Witcher 3","canon":"强大的女术士，与杰洛特和希里关系深厚。","bio":"我欣赏有主见的人。也欣赏尊重界限的人。","accent":"#7f6a87","tags":["魔法","独立"],"aliases":["叶奈法","Yennefer"]},{"id":"witcher:game:triss-3","name":"Triss Merigold","age":0,"gender":"female","source":"巫师 · 游戏","version":"The Witcher 3","canon":"女术士，曾与杰洛特有感情经历，并帮助受迫害的法师。","bio":"喜欢温暖的家，也愿意为朋友踏上旅途。","accent":"#b47d65","tags":["魔法","温柔"],"aliases":["特莉丝","Triss"]},{"id":"witcher:game:cirilla-3","name":"Cirilla","age":21,"gender":"female","source":"巫师 · 游戏","version":"The Witcher 3","canon":"希里，拥有上古之血，杰洛特的养女，长期在不同世界之间穿梭。","bio":"喜欢自由，别试着把我困在一个地方。","accent":"#8c898c","tags":["剑术","自由"],"aliases":["Ciri","希里"]},{"id":"cyberpunk:game:judy","name":"Judy Alvarez","age":0,"gender":"female","source":"赛博朋克 2077","version":"Cyberpunk 2077","canon":"超梦体验技术专家，居住在夜之城，重视朋友与正义。","bio":"海边胜过霓虹。别问我为什么。","accent":"#6b989d","tags":["超梦编辑","理想主义"],"aliases":["Judy","朱迪"]},{"id":"cyberpunk:game:panam","name":"Panam Palmer","age":0,"gender":"female","source":"赛博朋克 2077","version":"Cyberpunk 2077","canon":"游民，曾属阿德卡多家族，独立而直接。","bio":"长途公路旅行、夜空和信任。","accent":"#a17969","tags":["游民","热情"],"aliases":["Panam","帕南"]},{"id":"cyberpunk:game:river","name":"River Ward","age":0,"gender":"male","source":"赛博朋克 2077","version":"Cyberpunk 2077","canon":"夜之城前警探，重视家庭，执着寻找真相。","bio":"我喜欢认真吃饭和认真听人说话。","accent":"#8f846a","tags":["警探","家庭"],"aliases":["River","瑞弗"]},{"id":"cyberpunk:game:kerry","name":"Kerry Eurodyne","age":0,"gender":"male","source":"赛博朋克 2077","version":"Cyberpunk 2077","canon":"摇滚乐手，曾是武侍乐队成员，长期活跃于夜之城音乐圈。","bio":"音乐是谈话的好开头。也可能是吵架的开头。","accent":"#8b6f80","tags":["音乐","自由"],"aliases":["Kerry","克里"]}];
  const SOURCES=[...new Set(CATALOG.map(c=>c.source))].sort();
  const byId=new Map(CATALOG.map(c=>[c.id,c]));
  const stamp=()=>new Date().toISOString();
  const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():'p'+Math.random().toString(36).slice(2)+Date.now().toString(36);
  const pairKey=(p,c)=>p+'|'+c;
  const empty=()=>({profiles:[],swipes:{},relations:{},messages:[],meetings:[],events:[],episodicMemories:[],portraits:{},photoDescriptions:{},queue:{},bios:{},bioTags:{},proactiveLog:{},presets:DEFAULT_PRESETS.map((x,i)=>({...x,sort_order:i})),connection:{base_url:'',api_key:'',model:'',image_base_url:'',image_api_key:'',image_model:'',temperature:0.85,top_p:1,max_tokens:3000,auto_portraits:false,proactive_mode:'daily'}});
  let db;let storageAvailable=true;
  const ensureDbFields=target=>{
    target.photoDescriptions ||= {};
    target.queue ||= {};
    target.portraits ||= {};
    target.bios ||= {};
    target.bioTags ||= {};
    target.proactiveLog ||= {};
    target.meetings ||= [];
    target.episodicMemories ||= [];
    if(target.connection){
      target.connection.image_base_url ||= '';
      target.connection.image_api_key ||= '';
      target.connection.image_model ||= '';
      target.connection.proactive_mode ||= 'daily';
    }
    if(Array.isArray(target.presets)){
      const cm=target.presets.find(x=>x.id==='chat-main');
      if(cm&&cm.content&&cm.content.includes('用自然、个性化、符合角色的简短聊天气泡')&&!cm.content.includes('|||')){
        cm.content=DEFAULT_PRESETS[0].content;
      }
    }
  };
  try { const raw=localStorage.getItem(STORE_KEY); db=raw?JSON.parse(raw):empty(); if(!db || !Array.isArray(db.profiles))throw Error('broken'); ensureDbFields(db); localStorage.setItem(STORE_KEY,JSON.stringify(db)); }
  catch(err) { db=empty();storageAvailable=false; }
  ensureDbFields(db);
  const save=()=>{if(!storageAvailable)return;try{localStorage.setItem(STORE_KEY,JSON.stringify(db));}catch(err){storageAvailable=false;throw Error('浏览器本地空间不足或禁止保存。当前会话可继续，但刷新可能丢失数据。建议改用 Chrome / Safari 普通窗口。')}};
  const bodyErr=s=>{throw Error(s)};
  const validatePresetPackage=(pack)=>{
    if(pack&&pack.format==='elsewhere-preset'){
      if(pack.schemaVersion!==1||!Array.isArray(pack.entries)||pack.entries.length<1||pack.entries.length>200)bodyErr('Elsewhere 自有预设结构无效');
      const ids=new Set(),entries=pack.entries.map((x,i)=>{
        if(!x||typeof x.id!=='string'||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||typeof x.content!=='string'||x.content.length>60000||!['system','user','assistant'].includes(x.role)||typeof x.enabled!=='boolean')bodyErr('Elsewhere 条目 '+(i+1)+' 格式无效');
        ids.add(x.id);const group=String(x.group||'').trim().slice(0,70);
        return {mode:'meeting',name:((group?group+' / ':'')+x.name.trim()).slice(0,100),role:x.role,content:x.content,enabled:x.enabled,sort_order:i};
      });return {modes:['meeting'],entries};
    }
    if(!pack||typeof pack!=='object'||Array.isArray(pack)||pack.format!=='parallel-text-preset'||pack.schemaVersion!==1)
      bodyErr('仅支持 Parallel 自有预设 JSON（v1），不支持第三方预设格式');
    const modes=pack.modes,entries=pack.entries;
    if(!Array.isArray(modes)||modes.length<1||modes.length>2||new Set(modes).size!==modes.length||modes.some(x=>!['chat','meeting'].includes(x)))bodyErr('预设的模式列表无效');
    if(!Array.isArray(entries)||entries.length<1||entries.length>200)bodyErr('预设应包含 1–200 个条目');
    if(new TextEncoder().encode(JSON.stringify(pack)).length>4*1024*1024)bodyErr('预设文件超过 4 MB');
    const fields=['mode','name','role','enabled','content','sort_order'];
    return {modes,entries:entries.map((x,i)=>{
      const valid=x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).length===fields.length&&fields.every(k=>Object.prototype.hasOwnProperty.call(x,k))&&modes.includes(x.mode)&&['system','user','assistant'].includes(x.role)&&typeof x.name==='string'&&x.name.trim().length>0&&x.name.length<=100&&typeof x.content==='string'&&x.content.length<=60000&&typeof x.enabled==='boolean'&&Number.isInteger(x.sort_order)&&x.sort_order>=0&&x.sort_order<=10000;
      if(!valid)bodyErr('预设条目 '+(i+1)+' 格式无效');
      return {...x,name:x.name.trim()};
    })};
  };

  const getP=id=>db.profiles.find(p=>p.id===id)||bodyErr('请先选择有效的 Profile');
  const getC=id=>byId.get(id)||bodyErr('原作人物目录中不存在此角色');
  const relation=(pid,cid)=>db.relations[pairKey(pid,cid)];
  const pub=()=>{const {api_key,image_api_key,...s}=db.connection;const hasApi=!!(s.base_url&&s.model&&api_key);const hasImg=!!(s.image_base_url&&s.image_model&&image_api_key);const demoEnabled=s.demo_enabled!==false;return {...s,proactive_mode:s.proactive_mode||'daily',has_key:!!api_key,has_api_config:hasApi,demo_enabled:demoEnabled,has_image_key:!!image_api_key,mode:hasApi?'live':(demoEnabled?'demo':'normal'),image_mode:hasImg?'live':'text',portable:true,storageAvailable}};
  const splitChatBubbles=raw=>{
    const cleaned=String(raw||'').trim();
    if(!cleaned)return ['…'];
    let parts=cleaned.split(/\s*\|\|\|\s*|\r?\n+/).map(s=>s.replace(/^\[(?:短信|见面)\]\s*/,'').trim()).filter(Boolean);
    if(parts.length===1&&parts[0].length>=32){
      const sentences=parts[0].match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g)?.map(s=>s.trim()).filter(Boolean)||[parts[0]];
      if(sentences.length>=2){
        parts=[];
        let buf='';
        for(const s of sentences){
          if(!buf)buf=s;
          else if((buf+s).length<=26&&parts.length>0)buf+=s;
          else{parts.push(buf);buf=s;}
        }
        if(buf)parts.push(buf);
      }
    }
    if(parts.length>4){
      parts=[...parts.slice(0,3),parts.slice(3).join(' ')];
    }
    return parts.length?parts:[cleaned];
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
  const queueInfo=(pid,cid)=>{
    const r=relation(pid,cid);
    const hotChat=Boolean(r?.hot_chat);
    const q=db.queue[pairKey(pid,cid)];
    if(!q)return {count:0,pendingIds:[],dueAt:0,remainingMs:0,status:'idle',blocked:false,paceMode:hotChat?'hot':'daily',hotChat,delayMinutes:hotChat?1:0,targetTimeLabel:'',scheduleReason:''};
    const dueAt=Number(q.dueAt||0);
    return {
      count:q.pending.length,
      pendingIds:q.pending.slice(),
      dueAt,
      remainingMs:Math.max(0,dueAt-Date.now()),
      status:q.status,
      blocked:!!q.blocked,
      paceMode:q.paceMode||(hotChat?'hot':'daily'),
      hotChat,
      delayMinutes:q.delayMinutes||(hotChat?1:20),
      targetTimeLabel:dueAt?fmtHHMM(dueAt):(q.targetTimeLabel||''),
      scheduleReason:q.scheduleReason||''
    };
  };
  const clearQueue=(pid,cid)=>{const k=pairKey(pid,cid),q=db.queue[k];if(q){q.pending=[];q.dueAt=0;q.status='idle';q.blocked=false;q.revision=(q.revision||0)+1;q.inflight='';q.targetTimeLabel='';q.scheduleReason='';}};
  const enqueue=(pid,cid,id,msgText='')=>{
    const k=pairKey(pid,cid);
    const r=relation(pid,cid);
    const hotChat=Boolean(r?.hot_chat);
    const c=byId.get(cid);
    const q=db.queue[k]||(db.queue[k]={pending:[],dueAt:0,status:'idle',blocked:false,revision:0,inflight:'',paceMode:hotChat?'hot':'daily',delayMinutes:1,targetTimeLabel:'',scheduleReason:''});
    const wasEmpty=q.pending.length===0;
    if(!q.pending.includes(id))q.pending.push(id);
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
      // If !wasEmpty and q.dueAt > now, keep the existing q.dueAt so all messages in this window are bundled together!
    }
    return queueInfo(pid,cid);
  };
  async function flushQueue(p,c,force){
    const key=pairKey(p.id,c.id),q=db.queue[key];
    if(!q)return {reply:null,replies:[],queued:false,queue:queueInfo(p.id,c.id)};
    if(q.status==='inflight')return {reply:null,replies:[],queued:true,inflight:true,queue:queueInfo(p.id,c.id)};
    if(!q.pending.length)return {reply:null,replies:[],queued:false,queue:queueInfo(p.id,c.id)};
    if(!force&&(q.blocked||Date.now()<q.dueAt))return {reply:null,replies:[],queued:true,queue:queueInfo(p.id,c.id)};
    const curMode=pub().mode;
    if(curMode==='normal'){
      q.blocked=true;save();
      return {reply:null,replies:[],queued:true,warning:'当前处于正常模式且尚未连接 API，请先在「终端」填写 API 地址、密钥和模型。',queue:queueInfo(p.id,c.id)};
    }
    const pending=q.pending.slice(),generation=q.revision||0,token=uid();q.pending=[];q.dueAt=0;q.status='inflight';q.inflight=token;save();
    const r=relation(p.id,c.id);let txt,engine='demo',warning='';
    // Compile before the first await: a later message never leaks into this request's history.
    const msgs=prompt(p,c,'chat',pending);
    if(curMode==='live'){try{txt=await llm(msgs);engine='live'}catch(e){warning=String(e.message||e);engine='error'}}else txt=demo(p,c,'chat');
    if(q.inflight!==token||q.revision!==generation||r?.mode!=='chat'||r?.status!=='matched')return {reply:null,replies:[],discarded:true,queue:queueInfo(p.id,c.id)};
    q.status='idle';q.inflight='';let reply=null,replies=[];
    if(engine==='error'){
      const newer=q.pending.slice();
      q.pending=[...pending.filter(m=>!newer.includes(m)),...newer];
      if(!newer.length){q.dueAt=Date.now();q.blocked=true;}
    }else{
      const bubbleTexts=splitChatBubbles(txt);
      replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,engine));
      reply=replies[replies.length-1]||null;
      const combinedTxt=bubbleTexts.join(' / ');
      event(p.id,c.id,'ai_message',c.name+' 回应 '+p.name+'：'+combinedTxt.slice(0,180));
      const userRows=pending.map(mid=>db.messages.find(m=>m.id===mid)).filter(Boolean);
      if(reply)recordDialogueEpisode(p,c,userRows,{...reply,text:combinedTxt},'chat');
      if(r)r.updated_at=stamp();
    }
    save();return {reply,replies,queued:false,warning,queue:queueInfo(p.id,c.id)};
  }
  async function flushDueQueues(p){
    const now=Date.now(),flushed=[];
    for(const [k,q] of Object.entries(db.queue)){
      if(!k.startsWith(p.id+'|'))continue;
      if(!q||!q.pending?.length||q.status==='inflight'||q.blocked||!q.dueAt||q.dueAt>now)continue;
      const cid=k.slice(p.id.length+1),c=byId.get(cid),r=relation(p.id,cid);
      if(!c||!r||r.status!=='matched'||r.mode!=='chat')continue;
      const res=await flushQueue(p,c,false);
      if(res.reply||res.warning)flushed.push({characterId:cid,characterName:c.name,reply:res.reply,warning:res.warning||''});
    }
    return {flushed};
  }
  const char=c=>({...c,portrait:db.portraits[c.id]||null,bio:db.bios[c.id]||c.bio,tags:(Array.isArray(db.bioTags?.[c.id])&&db.bioTags[c.id].length)?db.bioTags[c.id]:c.tags});
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
    const summaryClean=String(summary).trim().slice(0,280);
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
    const uTexts=(userMsgs||[]).map(m=>m?.text?.trim()).filter(Boolean);
    const uJoined=uTexts.join(' / ').slice(0,110);
    const aText=String(aiMsg.text||'').trim().slice(0,110);
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
  const inferMeetingLocation=(pid,cid,customLoc='')=>{
    const cleanCustom=String(customLoc||'').trim();
    if(cleanCustom)return cleanCustom.slice(0,40);
    const recent=messagesOf(pid,cid).slice(-10);
    for(let i=recent.length-1;i>=0;i--){
      const t=String(recent[i].text||'');
      const m=t.match(/(?:在|到|去|约在|来到|站在|坐在)?([\u4e00-\u9fa5A-Za-z0-9]{0,8}(?:咖啡店门口|咖啡馆门口|咖啡厅门口|咖啡厅|咖啡店|咖啡馆|酒吧|酒馆|餐厅|书店|唱片行|公园|海边|江边|车站|天台|公寓|靶场|电影院|便利店|图书馆|安全屋|广场|长椅|窗边|店门口|街角|街头|路口))/);
      if(m&&m[1]){
        const loc=m[1].replace(/^(?:我已经到了|我已经到|已经到了|已经到|我到了|我到|到了|约在|来到|站在|坐在|在|到|去)+/,'').trim();
        if(loc.length>=2)return loc.slice(0,32);
      }
    }
    return '约定的街角咖啡馆';
  };
  const buildMeetingSummaryText=(p,c,loc,mMsgs,aiSummary='')=>{
    if(aiSummary&&String(aiSummary).trim().length>=6)return String(aiSummary).trim().slice(0,160);
    const uTurns=mMsgs.filter(m=>m.sender==='user'&&m.engine!=='recalled');
    const aTurns=mMsgs.filter(m=>m.sender==='ai'&&m.engine!=='recalled');
    if(uTurns.length){
      const firstU=uTurns[0].text.replace(/\s+/g,' ').slice(0,38);
      const lastU=uTurns.length>1?uTurns[uTurns.length-1].text.replace(/\s+/g,' ').slice(0,34):'';
      return `${p.name}「${firstU}」${lastU?`、再到「${lastU}」`:''}，与 ${c.name} 面对面互动了 ${mMsgs.length} 个回合。`;
    }
    if(aTurns.length){
      const snippet=aTurns[0].text.replace(/\s+/g,' ').slice(0,48);
      return `${snippet}…（共 ${mMsgs.length} 段面对面互动）`;
    }
    return `在「${loc}」见了一面。`;
  };
  const upsertMeetingRecord=(p,c,meetingId,mMsgs,customLoc='',aiSummary='')=>{
    if(!mMsgs||!mMsgs.length)return null;
    const existing=(db.meetings||[]).find(x=>x.id===meetingId);
    const loc=inferMeetingLocation(p.id,c.id,customLoc||existing?.location||'');
    const startedAt=mMsgs[0].created_at||stamp();
    const endedAt=mMsgs[mMsgs.length-1].created_at||stamp();
    const timeStr=String(startedAt).slice(0,16).replace('T',' ');
    const summary=buildMeetingSummaryText(p,c,loc,mMsgs,aiSummary||existing?.ai_summary||'');
    const entries=mMsgs.map(m=>({id:m.id,sender:m.sender,speaker:m.sender==='user'?p.name:c.name,text:m.text,created_at:m.created_at}));
    const rec={
      id:meetingId,
      profile_id:p.id,
      character_id:c.id,
      location:loc,
      time:timeStr,
      started_at:startedAt,
      ended_at:endedAt,
      summary,
      ai_summary:aiSummary||existing?.ai_summary||'',
      message_ids:mMsgs.map(m=>m.id),
      entries
    };
    for(const m of mMsgs)m.meeting_id=meetingId;
    if(existing)Object.assign(existing,rec);
    else db.meetings.push(rec);
    appendEpisodicMemory({
      owner_id:c.id,
      profile_id:p.id,
      source_type:'meeting_summary',
      source_key:'meeting:'+meetingId,
      knowledge_mode:'experienced',
      summary:`和 ${p.name} 在「${loc}」见面：${summary}`,
      tags:[loc,'见面',...extractMemoryTags(summary,5)],
      importance:4,
      emotional_weight:4,
      unresolved:0,
      raw_msg_ids:rec.message_ids,
      meeting_id:meetingId,
      meeting_data:rec,
      event_at:endedAt
    });
    return rec;
  };
  const ensureMeetingRecords=(p,c)=>{
    const allMsgs=messagesOf(p.id,c.id);
    const groups=[];
    let curGroup=[];
    let curMid='';
    for(const m of allMsgs){
      if(m.mode==='meeting'){
        const mid=m.meeting_id||'';
        if(curGroup.length&&mid&&curMid&&mid!==curMid){
          groups.push({mid:curMid,msgs:curGroup});
          curGroup=[m];curMid=mid;
        }else{
          curGroup.push(m);
          if(mid&&!curMid)curMid=mid;
        }
      }else if(curGroup.length){
        groups.push({mid:curMid||('meet_'+curGroup[0].id),msgs:curGroup});
        curGroup=[];curMid='';
      }
    }
    if(curGroup.length){
      const r=relation(p.id,c.id);
      const fallbackMid=(r?.mode==='meeting'&&r?.active_meeting_id)?r.active_meeting_id:('meet_'+curGroup[0].id);
      groups.push({mid:curMid||fallbackMid,msgs:curGroup});
    }
    const r=relation(p.id,c.id);
    for(const g of groups){
      const customLoc=(r?.active_meeting_id===g.mid)?(r?.meeting_location||''):'';
      upsertMeetingRecord(p,c,g.mid,g.msgs,customLoc);
    }
    // Remove legacy noisy mechanical milestone / raw per-turn dialogue spam
    db.episodicMemories=(db.episodicMemories||[]).filter(m=>{
      if(m.owner_id!==c.id||m.profile_id!==p.id)return true;
      if(m.source_type==='milestone'){
        return false;
      }
      if(m.source_type==='dialogue'){
        if(String(m.summary||'').includes('陈述（见面文字）')||String(m.summary||'').includes('（见面发言）'))return false;
        const hasProm=PROMISE_KEYWORDS.some(w=>String(m.summary||'').includes(w));
        if(!hasProm&&!m.unresolved&&!m.disputed&&String(m.summary||'').includes('陈述（对话文字）'))return false;
      }
      return true;
    });
  };
  const ensureDailySummaries=(p,c,activeIds)=>{
    const pid=p.id,cid=c.id,allMsgs=messagesOf(pid,cid);
    if(!allMsgs.length)return;
    const byDay=new Map();
    for(const m of allMsgs){
      if(m.mode!=='chat'||m.engine==='recalled')continue;
      const day=String(m.created_at).slice(0,10);
      if(!byDay.has(day))byDay.set(day,[]);
      byDay.get(day).push(m);
    }
    for(const [day,dayMsgs] of byDay.entries()){
      if(dayMsgs.length<2)continue;
      const combined=dayMsgs.filter(m=>m.sender==='user').map(m=>m.text.slice(0,60)).join(' ')||dayMsgs.map(m=>m.text.slice(0,60)).join(' ');
      const tags=extractMemoryTags(combined,6),topics=tags.slice(0,5).join('、')||'日常寒暄与近况';
      appendEpisodicMemory({
        owner_id:cid,
        profile_id:pid,
        source_type:'daily-summary',
        source_key:'day:'+day,
        knowledge_mode:'stated',
        summary:`${day} 聊天归档：与 ${p.name} 共聊了 ${dayMsgs.length} 条手机消息，主要聊到：${topics}。`,
        tags,
        importance:2,
        emotional_weight:2,
        unresolved:0,
        raw_msg_ids:dayMsgs.map(m=>m.id),
        event_at:dayMsgs[dayMsgs.length-1].created_at
      });
    }
  };
  const retrieveRelevantMemories=(pid,cid,queryText='',excludeMsgIds=new Set(),limit=4,maxChars=1200)=>{
    const allItems=db.episodicMemories.filter(x=>x.owner_id===cid&&x.profile_id===pid).sort((a,b)=>b.event_at.localeCompare(a.event_at));
    if(!allItems.length)return [];
    const byMemId=new Map(allItems.map(x=>[x.id,x]));
    const corrByTarget=new Map();
    for(const x of allItems){
      if(x.source_type==='correction'&&x.clarifies_id){
        if(!corrByTarget.has(x.clarifies_id))corrByTarget.set(x.clarifies_id,[]);
        corrByTarget.get(x.clarifies_id).push(x);
      }
    }
    const qTerms=new Set(extractQueryTerms(queryText));
    const asksPast=['昨天','上次','之前','以前','记得','那天','第一次','上次见','聊过','说过','晒太阳','去过'].some(w=>String(queryText).includes(w));
    const scored=[];
    for(const item of allItems){
      const rawIds=item.raw_msg_ids||[];
      if(rawIds.length&&rawIds.every(id=>excludeMsgIds.has(id))&&item.source_type==='dialogue')continue;
      if(item.disputed&&!corrByTarget.has(item.id)&&!qTerms.size)continue;
      const itemTags=new Set(item.tags||[]);
      const itemTerms=new Set([...extractQueryTerms(item.summary),...itemTags]);
      let tagHits=0,termHits=0;
      for(const t of qTerms){if(itemTags.has(t))tagHits++;if(itemTerms.has(t))termHits++;}
      const overlapScore=tagHits*6+termHits*3;
      let score;
      if(item.source_type==='correction')score=overlapScore+9;
      else if(item.source_type==='meeting_summary'||item.source_type==='milestone')score=overlapScore+(asksPast?5.5:2.0);
      else if(item.source_type==='daily-summary')score=overlapScore+(asksPast?6:1);
      else score=overlapScore+item.importance*1.1+(item.unresolved?2.5:0);
      if(overlapScore===0&&item.source_type!=='correction'&&!item.unresolved&&!(asksPast&&['daily-summary','milestone','meeting_summary'].includes(item.source_type)))continue;
      scored.push({score,overlapScore,item});
    }
    scored.sort((a,b)=>b.score-a.score||b.item.event_at.localeCompare(a.item.event_at));
    const selected=[],usedIds=new Set();let charCount=0;
    for(const {score,overlapScore,item} of scored){
      if(selected.length>=limit)break;
      if(usedIds.has(item.id))continue;
      const entry={...item,score:Number(score.toFixed(2)),overlap_score:overlapScore};
      if(item.disputed&&corrByTarget.has(item.id)){
        const corr=corrByTarget.get(item.id)[0];
        entry.correction_note=corr.summary;usedIds.add(corr.id);
      }else if(item.source_type==='correction'&&item.clarifies_id&&byMemId.has(item.clarifies_id)){
        const orig=byMemId.get(item.clarifies_id);
        entry.disputed_original=orig.summary;usedIds.add(orig.id);
      }
      if(overlapScore>=6&&(item.raw_msg_ids||[]).length){
        const rawRows=(item.raw_msg_ids||[]).slice(0,2).map(id=>db.messages.find(m=>m.id===id)).filter(Boolean);
        if(rawRows.length)entry.raw_excerpt=rawRows.map(r=>(r.sender==='user'?'对方：':'你：')+r.text.slice(0,70)).join(' | ');
      }
      const estLen=entry.summary.length+(entry.correction_note||'').length+(entry.raw_excerpt||'').length+30;
      if(charCount+estLen>maxChars&&selected.length)continue;
      usedIds.add(item.id);charCount+=estLen;selected.push(entry);
    }
    return selected.sort((a,b)=>a.event_at.localeCompare(b.event_at));
  };
  const formatEpisodicEntry=entry=>{
    const modeTag={'program-fact':'[系统确认事实]','experienced':'[亲历互动记录]','stated':'[对话陈述·非客观事实证明]','clarified':'[已澄清纠正]'}[entry.knowledge_mode]||'[过往记录]';
    const datePart=String(entry.event_at||'').slice(0,10);
    if(entry.disputed){
      let line=`- ${datePart} [旧记录·已被澄清存疑] ${entry.summary}`;
      if(entry.correction_note)line+=` -> [最新澄清] ${entry.correction_note}`;
      return line;
    }
    let line=`- ${datePart} ${modeTag} ${entry.summary}`;
    if(entry.disputed_original)line+=`（针对旧说法「${entry.disputed_original.slice(0,80)}」的更正）`;
    if(entry.raw_excerpt)line+=`（原文片段：${entry.raw_excerpt}）`;
    return line;
  };
  const relationshipBaselineSummary=(pid,cid,pName)=>{
    const rel=relation(pid,cid);
    const milestones=db.events.filter(e=>e.character_id===cid&&e.profile_id===pid&&['matched','unmatched'].includes(e.type));
    const allMsgs=messagesOf(pid,cid),meetCount=(db.meetings||[]).filter(m=>m.profile_id===pid&&m.character_id===cid).length;
    const reunited=milestones.some(m=>m.type==='unmatched')&&rel?.status==='matched';
    const parts=[`与 ${pName} 当前状态：${rel?.status==='matched'?'已匹配':'未匹配'}（当前模式：${rel?.mode==='meeting'?'线下见面':'线上短信'}）`];
    if(reunited)parts.push('曾解除匹配后再次重逢（保留过往记忆）');
    parts.push(`累计对话 ${allMsgs.length} 条${meetCount?`（已归档 ${meetCount} 次线下见面）`:''}`);
    if(milestones.length)parts.push('匹配记录：'+milestones.slice(-2).map(m=>`${String(m.created_at).slice(0,10)} ${m.summary}`).join('；'));
    return parts.join('；')+'。';
  };
  const selectWorkingHistory=(pid,cid,mode='chat')=>{
    const chron=messagesOf(pid,cid).slice(-24);
    if(!chron.length)return [];
    const winLimit=mode==='meeting'?8:10;
    const todayPrefix=String(chron[chron.length-1].created_at).slice(0,10);
    const todayMsgs=chron.filter(m=>String(m.created_at).slice(0,10)===todayPrefix);
    if(todayMsgs.length>=4)return todayMsgs.slice(-winLimit);
    return chron.slice(-Math.min(6,winLimit));
  };
  const event=(pid,cid,type,summary)=>{
    const nowStr=stamp();
    db.events.push({id:uid(),profile_id:pid,character_id:cid,type,summary:summary.slice(0,500),created_at:nowStr});
  };
  const write=(pid,cid,sender,mode,text,engine='human')=>{const r=relation(pid,cid);const m={id:uid(),profile_id:pid,character_id:cid,sender,mode,text,engine,meeting_id:mode==='meeting'?(r?.active_meeting_id||''):'',created_at:stamp()};db.messages.push(m);return m};
  const messagesOf=(pid,cid)=>db.messages.filter(m=>m.profile_id===pid&&m.character_id===cid);
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
  const candidates=p=>CATALOG.filter(c=>relation(p.id,c.id)?.status!=='matched'&&(!p.sources.length||p.sources.some(tag=>sourceMatches(tag,c)))&&p.role_character_id!==c.id&&(!p.interested_in.length||p.interested_in.includes('all')||p.interested_in.includes(c.gender))&&(!c.age||c.age>=p.min_age&&c.age<=p.max_age));
  const shuffle=a=>a.slice().sort(()=>Math.random()-.5);
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
    return CATALOG.filter(c=>(!source||c.source===source||c.version===source||sourceMatches(source,c))&&[c.name,...c.aliases].some(a=>a.toLowerCase()===q||a.toLowerCase().split(/\s+/).includes(q)||norm(a)===nq||norm(a)===mapped||(nq.length>=2&&norm(a).includes(nq)))).slice(0,20).map(c=>({id:c.id,name:c.name,source:c.source,version:c.version,age:c.age,canon:c.canon}));
  };
  const prompt=(p,c,mode,pendingIds=[])=>{
    const macros=t=>t.replace(/\{\{user\}\}/g,p.name).replace(/\{\{char\}\}/g,c.name);
    const workingHistory=selectWorkingHistory(p.id,c.id,mode);
    const workingIds=new Set(workingHistory.map(m=>m.id));
    ensureDailySummaries(p,c,workingIds);
    const querySeed=workingHistory.slice(-3).filter(m=>m.sender==='user').map(m=>m.text).join(' ')||workingHistory.slice(-2).map(m=>m.text).join(' ');
    const recalled=retrieveRelevantMemories(p.id,c.id,querySeed,workingIds,4,1200);
    const relSummary=relationshipBaselineSummary(p.id,c.id,p.name);
    const interestsStr=(p.interests||[]).join('、')||'未填写';
    const intentStr=p.intent||'未填写';
    let sys='你正在扮演一个真实存在于其原作时间线中的虚构角色。不得跳出角色解释自己是语言模型。记忆严格按当前角色 ID 与当前聊天对象隔离，绝不混入其他人物或其他 Profile 的经历。区分“系统已确认事实”与“对方在对话中的主观陈述”，不因对方随口一句话而篡改你的原作设定。\n';
    sys+=`【第一层 · 身份记忆 (Identity Memory)】\n你的身份：${c.name}（角色ID：${c.id}）。来源：${c.source}。时期：${c.version}。已收录背景：${c.canon}。\n当前互动对象 Profile：${p.name}，${p.age}岁，性别${p.gender}，交友目的：${intentStr}，兴趣爱好：${interestsStr}；公开简介：${p.bio}。`;
    if(p.role_character_id&&byId.has(p.role_character_id)){const x=byId.get(p.role_character_id);sys+=`\n对方扮演的原作人物：${x.name}（${x.source} ${x.version}），${x.canon}。`}
    else if(p.role_hint)sys+=`\n对方提供的身份说明（未验证）：${p.role_hint.slice(0,240)}`;
    sys+=`\n\n【第二层 · 关系记忆基线 (Relationship Memory)】\n${relSummary}`;
    if(recalled.length){
      sys+=`\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n`+recalled.map(formatEpisodicEntry).join('\n');
    }else{
      sys+=`\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n（当前话题未触发额外远期档案，仅依靠下方今日活跃上下文连贯交流）`;
    }
    const presets=db.presets.filter(x=>x.mode===mode&&x.enabled).sort((a,b)=>a.sort_order-b.sort_order);
    sys+='\n\n'+presets.filter(x=>x.role==='system').map(x=>macros(x.content)).join('\n\n');
    const chat=[{role:'system',content:sys},...presets.filter(x=>x.role!=='system').map(x=>({role:x.role,content:macros(x.content)}))];
    for(const m of workingHistory){
      const tTag=fmtHHMM(m.created_at);
      const prefix=m.mode==='meeting'?(tTag?`[见面 ${tTag}]`:'[见面]'):(tTag?`[短信 ${tTag}]`:'[短信]');
      if(m.engine==='recalled'||m.recalled){
        chat.push({role:m.sender==='ai'?'assistant':'user',content:'[系统提示：对方刚刚撤回了一条消息（你看见对方撤回了消息，但不知道具体撤回了什么内容）]'});
      }else{
        chat.push({role:m.sender==='ai'?'assistant':'user',content:prefix+m.text});
      }
    }
    let batchHint='';
    if(mode==='chat'&&Array.isArray(pendingIds)&&pendingIds.length>1){
      const bundledRows=pendingIds.map(id=>db.messages.find(x=>x.id===id)).filter(Boolean);
      if(bundledRows.length>1){
        const timelineStr=bundledRows.map(x=>`[${fmtHHMM(x.created_at)}]「${x.text.slice(0,60)}」`).join(' -> ');
        batchHint=`\n【打包消息时间线】你在未看手机的这段时间里，对方陆续给你发来了 ${bundledRows.length} 条消息（按发送时间先后：${timelineStr}）。你现在刚拿起手机把这些消息一次性读完，请结合这些消息各自的时间戳跨度与内容，像真人一样自然连贯地统一回复。`;
      }
    }
    chat.push({role:'system',content:'【第四层 · 当前状态 (Current State)】'+(mode==='meeting'?'当前必须以面对面小说式 RP 写下一条回复。不要控制玩家角色。':'当前必须以真实约会 App 手机聊天气泡发出回复，不写旁白。像真人聊天一样时长时短：有时只发 1 条简短气泡，有时可分 2–4 条长短交替的气泡连续发出（多条气泡之间用换行符或 ||| 分隔）。'+batchHint)});
    return chat;
  };
  function getApiUrl(suffix){const b=db.connection.base_url.trim().replace(/\/+$/,'');if(!/^https?:\/\//.test(b))bodyErr('API Base URL 需要以 http:// 或 https:// 开头');if(/^http:\/\//.test(b)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(b))bodyErr('远程 API 必须使用 HTTPS');return b+suffix}
  async function llm(messages,options={}){
    const s=db.connection;if(!s.base_url||!s.api_key||!s.model)bodyErr('还没有配置可用的 API 地址、密钥及模型');
    const payload={model:s.model,messages,temperature:s.temperature,top_p:s.top_p,max_tokens:options.max_tokens||s.max_tokens};
    if(options.json_mode)payload.response_format={type:'json_object'};
    let res;try{res=await fetch(getApiUrl('/chat/completions'),{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.api_key},body:JSON.stringify(payload)})}
    catch(e){bodyErr('浏览器无法直连模型（可能是 API 不允许跨域 CORS）。可改用随项目提供的 Python 本地服务器版。')}
    if(!res.ok)bodyErr('模型接口错误 HTTP '+res.status);
    const data=await res.json();let result=data?.choices?.[0]?.message?.content;
    if(Array.isArray(result))result=result.map(x=>x.text||'').join('');
    if(typeof result!=='string')bodyErr('模型未返回可用文本');return result.trim();
  }
  async function generateBios(selected,forceRefresh=false){
    if(pub().mode!=='live')return 'catalog-demo';
    const pending=forceRefresh?selected:selected.filter(c=>!db.bios[c.id]);
    if(!pending.length)return 'cached-ai-bios';
    const compact=pending.map(c=>({id:c.id,name:c.name,source:c.source,version:c.version,canon:c.canon,current_bio:db.bios[c.id]||c.bio,tags:c.tags}));
    const rules='根据给定的、已收录的原作人物身份，为他们各写一条符合当下性格与心境的约会软件公开档案（包含一句自然独特的个人简介 bio，以及 2–3 个个性标签 tags）。不得编造新的角色、错误时间线或伪造重要原作事实；若是刷新，请换一个贴合人设的新角度描写。每条中文 bio 不超过80字，真实自然。只输出 JSON 对象，形如 {"profiles":[{"id":"exact-id","bio":"...","tags":["标签1","标签2"]}]}，只用输入中的ID。';
    try{
      const out=await llm([{role:'system',content:rules},{role:'user',content:JSON.stringify(compact)}],{json_mode:true,max_tokens:950});
      const val=JSON.parse(out);
      const valid=new Set(pending.map(c=>c.id));let count=0;
      for(const x of (val?.profiles||[])){
        if(x&&valid.has(x.id)&&typeof x.bio==='string'){
          const bio=x.bio.trim();
          if(bio.length>=6&&bio.length<=160){
            db.bios[x.id]=bio;
            if(Array.isArray(x.tags)){
              const cleanTags=x.tags.map(t=>String(t||'').trim().slice(0,12)).filter(Boolean).slice(0,4);
              if(cleanTags.length)db.bioTags[x.id]=cleanTags;
            }
            count++;
          }
        }
      }
      if(count)save();
      return count?'live-generated':'catalog-demo';
    }catch(e){return 'catalog-demo'}
  }
  const demo=(p,c,mode)=>{
    const allMsgs=messagesOf(p.id,c.id);
    const past=allMsgs.length;
    if(mode==='meeting'){
      const r=relation(p.id,c.id);
      const loc=inferMeetingLocation(p.id,c.id,r?.meeting_location||'');
      const meetCount=allMsgs.filter(m=>m.mode==='meeting'&&(!r?.active_meeting_id||m.meeting_id===r.active_meeting_id)).length;
      if(meetCount<=1){
        return `${c.name}正站在${loc}微光映照的一侧。听见你的脚步声，对方抬起头，目光穿过人群定格在你身上。\n\n周围嘈杂的声响仿佛在这一刻退远了些。${c.name}把手机收进衣袋，朝你走近两步，神情里带着一点见到真人时的微怔与放松：\n\n“你到了。比我想象的还要快一点……走吧，我们先找个安静的位置坐下聊。”`;
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
  async function produceReply(p,c,mode,userMsg=null){
    const curMode=pub().mode;
    if(curMode==='normal'){
      return {reply:null,replies:[],warning:'当前处于正常模式且尚未连接 API，请先在「终端」配置 API 后再试。'};
    }
    let engine='demo',warning='',txt;
    if(curMode==='live'){try{txt=await llm(prompt(p,c,mode));engine='live'}catch(e){warning=String(e.message||e);txt='（模型连接失败，历史已保存。请检查终端设置，再尝试角色回复。）';engine='error'}}
    else txt=demo(p,c,mode);
    const bubbleTexts=(mode==='chat'&&engine!=='error')?splitChatBubbles(txt):[txt];
    const replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai',mode,bTxt,engine));
    const reply=replies[replies.length-1]||null;
    if(engine!=='error'&&reply){
      const combinedTxt=bubbleTexts.join(' / ');
      event(p.id,c.id,'ai_message',c.name+' 回应 '+p.name+'：'+combinedTxt.slice(0,180));
      const uList=userMsg?[userMsg]:messagesOf(p.id,c.id).filter(m=>m.sender==='user').slice(-1);
      recordDialogueEpisode(p,c,uList,{...reply,text:combinedTxt},mode);
    }
    return {reply,replies,warning};
  }
  async function matchDecision(p,c,attempt){if(pub().mode==='live'){try{const interestsStr=(p.interests||[]).join('、')||'未填写',intentStr=p.intent||'未填写';const text=await llm([{role:'system',content:`你是 ${c.name}（${c.source} ${c.version}）。原作身份：${c.canon}。对方 ${p.name}，${p.age}岁，交友目的：${intentStr}，兴趣爱好：${interestsStr}，简介 ${p.bio}。你有自己的择偶标准，可自由决定是否右滑同意匹配。只输出 JSON 对象 {"match":true/false}。`},{role:'user',content:'你是否想匹配？'}],{json_mode:true,max_tokens:70});return {matched:!!JSON.parse(text).match,engine:'live'}}catch(e){/* fallback */}}
    let h=Math.imul(attempt,2654435761)|0;for(const ch of p.id+c.id+String(attempt))h=(Math.imul(31,h)+ch.charCodeAt(0))|0;return {matched:attempt>=4||((h>>>0)%100<72),engine:pub().mode==='live'?'live':'demo'};
  }
  async function firstMessage(p,c,again){
    const curMode=pub().mode;
    if(curMode==='normal'){
      return {bubbles:[],engine:'normal-pending'};
    }
    if(curMode==='live'){
      try{
        const ms=prompt(p,c,'chat');
        ms.push({role:'user',content:again?`【系统事件：重逢匹配】你刚刚和 ${p.name} 重新匹配上了，你记得你们之前的经历。请根据你的性格与过往记忆，主动发 1～2 条有真实重逢感的手机开场消息（多条气泡之间用 ||| 分隔，绝不要用生硬套话）。`:`【系统事件：首次匹配】你刚刚在约会软件上与 ${p.name} 互相右滑匹配成功。请结合你的原作性格、所处境遇以及对方的公开资料（简介：${p.bio||'无'}；兴趣：${(p.interests||[]).join('、')||'无'}），主动给对方发 1～2 条自然、有个人特色的第一条手机消息（多条气泡之间用 ||| 分隔，绝对不要说“看来我们匹配上了”这种千篇一律的套话）。`});
        const raw=await llm(ms,{max_tokens:220});
        return {bubbles:splitChatBubbles(raw),engine:'live'};
      }catch(e){}
    }
    const demoTxt=again?`${p.name}，没想到这么快又刷到你了。|||又见面了……上次的事我没有忘。`:`Hey，${p.name}。|||看来我们匹配上了。`;
    return {bubbles:splitChatBubbles(demoTxt),engine:'demo'};
  }
  async function produceProactiveMessage(p,c,reason='idle',unresolvedMem=null){
    const curMode=pub().mode;
    if(curMode==='normal')return {replies:[],skipped:'no-api'};
    let engine='demo',txt='';
    if(curMode==='live'){
      try{
        const ms=prompt(p,c,'chat');
        const memHint=unresolvedMem?`你翻看手机时，想起你们之前未聊完的话题或约定：「${unresolvedMem.summary}」。`:'你在自己的世界里刚忙完手头的事，或者偶然看到某样东西，突然想起了对方。';
        ms.push({role:'user',content:`【系统事件：角色主动发消息（${reason==='promise'?'记得约定与未完话题':'日常主动破冰'}）】距离你们上次联系已经过了一段时间，${p.name} 还没有发来新消息。${memHint}请以完全符合 ${c.name} 原作性格与当前关系状态的方式，主动给 ${p.name} 发 1～2 条自然的手机消息（多条气泡用 ||| 分隔，不要写旁白，不要像客服问候）。`});
        txt=await llm(ms,{max_tokens:220});
        engine='live';
      }catch(e){
        return {replies:[],warning:String(e.message||e)};
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
    const bubbleTexts=splitChatBubbles(txt).slice(0,3);
    const replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,engine));
    const lastReply=replies[replies.length-1]||null;
    if(lastReply){
      const combinedTxt=bubbleTexts.join(' / ');
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
  async function request(path,data){
    const [route,qs='']=path.split('?'), params=new URLSearchParams(qs);data=data||{};
    switch(route){
      case '/bootstrap':return {profiles:db.profiles.slice(),sources:SOURCES,settings:pub(),catalog_size:CATALOG.length};
      case '/health':return {ok:true,name:'Parallel Portable',version:'0.5.1'};
      case '/identify':return {matches:idMatches(params.get('name')||'',params.get('source')||''),verified:'curated-catalog'};
      case '/settings':{
        if(!arguments[1])return pub();
        const s=db.connection;
        if(data.clear_key)s.api_key='';
        if(data.clear_image_key)s.image_api_key='';
        if('demo_enabled' in data)s.demo_enabled=Boolean(data.demo_enabled);
        if('proactive_mode' in data&&['off','daily','active'].includes(data.proactive_mode))s.proactive_mode=data.proactive_mode;
        if('base_url' in data){const v=String(data.base_url||'').trim();if(v&&!/^https?:\/\//.test(v))bodyErr('API Base URL 格式不正确');if(/^http:\/\//.test(v)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(v))bodyErr('远程 API 必须使用 HTTPS');s.base_url=v.replace(/\/+$/,'')}
        if('image_base_url' in data){const iv=String(data.image_base_url||'').trim();if(iv&&!/^https?:\/\//.test(iv))bodyErr('图片 API Base URL 格式不正确');if(/^http:\/\//.test(iv)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(iv))bodyErr('远程图片 API 必须使用 HTTPS');s.image_base_url=iv.replace(/\/+$/,'')}
        if(data.api_key)s.api_key=String(data.api_key).slice(0,1000);
        if(data.image_api_key)s.image_api_key=String(data.image_api_key).slice(0,1000);
        for(const k of ['model','image_model'])if(k in data)s[k]=String(data[k]||'').slice(0,200);
        for(const k of ['temperature','top_p','max_tokens'])if(k in data)s[k]=Number(data[k]);
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
        const role=String(data.role_character_id||'');if(role&&!byId.has(role))bodyErr('该同人身份尚未被收录；请选择已识别的人物');
        const profile={id:existing?.id||uid(),name,age,gender:['male','female','nonbinary','other'].includes(data.gender)?data.gender:'other',interested_in:(data.interested_in||['all']).filter(x=>['all','male','female','nonbinary','other'].includes(x)),min_age:Math.max(18,Number(data.min_age)||18),max_age:Math.min(120,Number(data.max_age)||60),intent:String(data.intent||''),bio:String(data.bio||'').slice(0,500),interests:(data.interests||[]).slice(0,12),sources:[...new Map((data.sources||[]).filter(x=>typeof x==='string').map(x=>x.trim().replace(/\s+/g,' ').slice(0,80)).filter(Boolean).map(x=>[x.toLocaleLowerCase(),x])).values()].slice(0,20),avatar:String(data.avatar||''),role_character_id:role,role_hint:String(data.role_hint||'').slice(0,300),created_at:existing?.created_at||stamp()};
        if(profile.max_age<profile.min_age)profile.max_age=profile.min_age;
        if(profile.avatar&&(!profile.avatar.startsWith('data:image/')||profile.avatar.length>2000000))bodyErr('头像需是小于约 1.5MB 的图片');
        if(existing)Object.assign(existing,profile);else db.profiles.push(profile);save();return {profile};
      }
      case '/discover':case '/candidates':{
        const p=getP(data.profileId||params.get('profileId'));const pool=candidates(p),selected=shuffle(pool).slice(0,10);
        const forceRefresh=Boolean(data.refresh||params.get('refresh')==='1');
        const generation=route==='/discover'?await generateBios(selected,forceRefresh):'catalog-demo';
        const cs=selected.map(c=>({...char(c),previous_swipe:db.swipes[pairKey(p.id,c.id)]?.direction||null,relation_status:relation(p.id,c.id)?.status||null}));
        return {candidates:cs,total_available:pool.length,requested:10,generation,demo:pub().mode==='demo'};
      }
      case '/swipe':{
        const p=getP(data.profileId),c=getC(data.characterId),d=data.direction;if(p.role_character_id===c.id)bodyErr('当前扮演身份不能匹配同一原作角色版本的自己');if(!['left','right'].includes(d))bodyErr('滑卡方向无效');
        db.swipes[pairKey(p.id,c.id)]={direction:d,updated_at:stamp()};const prior=relation(p.id,c.id);const again=!!prior;
        if(d==='left'){save();return {direction:d,matched:false,previously_matched:prior?.status==='matched'}}
        if(prior?.status==='matched'){save();return {direction:'right',matched:true,already_matched:true,character:char(c)}}
        const attempt=(prior?.attempts||0)+1,{matched,engine}=await matchDecision(p,c,attempt);
        db.relations[pairKey(p.id,c.id)]={profile_id:p.id,character_id:c.id,status:matched?'matched':'pending',mode:'chat',hot_chat:Boolean(prior?.hot_chat),attempts:attempt,updated_at:stamp()};
        let greetingReplies=[];
        if(matched){
          event(p.id,c.id,'matched',p.name+(again?' 重新匹配':' 首次匹配'));
          const first=await firstMessage(p,c,again);
          if(first.bubbles&&first.bubbles.length){
            greetingReplies=first.bubbles.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,first.engine));
            const lastG=greetingReplies[greetingReplies.length-1];
            if(lastG)recordDialogueEpisode(p,c,[],{...lastG,text:first.bubbles.join(' / ')},'chat');
          }
        }
        save();return {direction:d,matched,engine,character:char(c),again,replies:greetingReplies};
      }
      case '/hot-chat':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id);
        const nextHot=('hotChat' in data)?Boolean(data.hotChat):!r.hot_chat;
        r.hot_chat=nextHot;
        const k=pairKey(p.id,c.id),q=db.queue[k];
        if(q&&q.pending?.length&&q.status!=='inflight'){
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
        // Staggered global cooldown: at most 1 proactive message across all characters every 30 minutes
        if(trigger!=='manual'){
          const recentGlobal=Object.entries(db.proactiveLog||{}).filter(([k])=>k.startsWith(p.id+'|')).map(([,ts])=>Number(ts)||0);
          const lastGlobalTs=recentGlobal.length?Math.max(...recentGlobal):0;
          if(lastGlobalTs&&(now-lastGlobalTs)<30*60*1000){
            return {delivered:[],sent:[],skipped:'global-stagger-cooldown'};
          }
        }
        const matchedRels=Object.values(db.relations).filter(r=>r.profile_id===p.id&&r.status==='matched'&&r.mode==='chat'&&byId.has(r.character_id)&&(!targetCid||r.character_id===targetCid));
        const candidatesList=[];
        for(const r of matchedRels){
          const cid=r.character_id;
          const q=queueInfo(p.id,cid);
          if(q.status==='inflight'||(trigger!=='manual'&&q.count>0))continue;
          const msgs=messagesOf(p.id,cid);
          const lastMsg=msgs[msgs.length-1];
          const lastTs=lastMsg?Date.parse(lastMsg.created_at)||0:Date.parse(r.updated_at)||0;
          const lastProactive=db.proactiveLog[pairKey(p.id,cid)]||0;
          const elapsedMs=now-Math.max(lastTs,lastProactive);
          const unresolvedMem=(db.episodicMemories||[]).filter(m=>m.owner_id===cid&&m.profile_id===p.id&&m.unresolved&&!m.disputed).sort((a,b)=>b.event_at.localeCompare(a.event_at))[0]||null;
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
        // Always pick at most 1 character per check so proactive messages never swarm at once
        const chosen=candidatesList.slice(0,1);
        const sent=[];
        for(const item of chosen){
          const res=await produceProactiveMessage(p,item.c,item.reason,item.unresolvedMem);
          if(res.replies&&res.replies.length){
            sent.push({characterId:item.cid,characterName:item.c.name,reason:item.reason,replies:res.replies,reply:res.reply});
          }
        }
        return {delivered:sent,sent,matchedCount:matchedRels.length};
      }
      case '/threads':{
        const p=getP(params.get('profileId'));return {threads:Object.values(db.relations).filter(r=>r.profile_id===p.id&&r.status==='matched'&&byId.has(r.character_id)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(r=>({character:char(getC(r.character_id)),relation:r,last:messagesOf(p.id,r.character_id).at(-1)||null,queue:queueInfo(p.id,r.character_id)}))};
      }
      case '/thread':{
        const p=getP(params.get('profileId')),c=getC(params.get('characterId')),r=requireMatch(p.id,c.id);
        ensureMeetingRecords(p,c);
        const meetings=(db.meetings||[]).filter(x=>x.profile_id===p.id&&x.character_id===c.id);
        save();
        return {character:char(c),profile:p,relation:r,messages:messagesOf(p.id,c.id),meetings,queue:queueInfo(p.id,c.id)};
      }
      case '/memories':{
        const p=getP(params.get('profileId')||data.profileId),c=getC(params.get('characterId')||data.characterId),qText=String(params.get('query')||data.query||'').trim();
        const mode=relation(p.id,c.id)?.mode||'chat';
        const activeWindow=selectWorkingHistory(p.id,c.id,mode);
        const activeIds=new Set(activeWindow.map(m=>m.id));
        ensureMeetingRecords(p,c);
        ensureDailySummaries(p,c,activeIds);
        save();
        const allMsgs=messagesOf(p.id,c.id);
        const items=(db.episodicMemories||[]).filter(m=>m.owner_id===c.id&&m.profile_id===p.id).sort((a,b)=>b.event_at.localeCompare(a.event_at)).map(m=>{
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
        if(act==='delete'){
          const mid=String(data.memoryId||data.id||'');if(!mid)bodyErr('缺少记忆 ID');
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
        const p=getP(data.profileId),c=getC(data.characterId),r=relation(p.id,c.id);if(!r)bodyErr('还没有匹配过');r.status='unmatched';r.mode='chat';r.active_meeting_id='';clearQueue(p.id,c.id);r.updated_at=stamp();event(p.id,c.id,'unmatched','与 '+p.name+' 解除匹配，过去的经历不会消失');save();return {ok:true};
      }
      case '/mode':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id),m=data.mode;
        if(!['chat','meeting'].includes(m))bodyErr('无效模式');
        const locInput=String(data.location||data.meetingLocation||'').trim().slice(0,40);
        if(locInput){
          r.meeting_location=locInput;
        }
        let meetingRecord=null,openingReply=null,warning='';
        if(r.mode!==m){
          clearQueue(p.id,c.id);
          if(m==='meeting'){
            r.mode='meeting';
            r.active_meeting_id='meet_'+uid();
            r.meeting_location=inferMeetingLocation(p.id,c.id,locInput);
            r.meeting_started_at=stamp();
            r.updated_at=stamp();
            event(p.id,c.id,'meeting','与 '+p.name+' 开始面对面见面');
            if(data.triggerOpening===true&&pub().mode!=='normal'){
              const res=await produceReply(p,c,'meeting',null);
              openingReply=res.reply;
              warning=res.warning||'';
              const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
              meetingRecord=upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location);
            }
          }else{
            const activeMid=r.active_meeting_id||'';
            const allMsgs=messagesOf(p.id,c.id);
            let mMsgs=activeMid?allMsgs.filter(x=>x.mode==='meeting'&&x.meeting_id===activeMid):[];
            if(!mMsgs.length){
              for(let i=allMsgs.length-1;i>=0;i--){
                if(allMsgs[i].mode==='meeting')mMsgs.unshift(allMsgs[i]);
                else break;
              }
            }
            if(mMsgs.length){
              const mid=activeMid||mMsgs[0].meeting_id||('meet_'+mMsgs[0].id);
              let aiSum='',aiLoc=locInput||r.meeting_location||'';
              if(data.finalizeMeeting===true&&pub().mode==='live'){
                try{
                  const transcript=mMsgs.slice(-10).map(x=>`${x.sender==='user'?p.name:c.name}：${x.text.slice(0,180)}`).join('\n');
                  const sumJson=await llm([
                    {role:'system',content:`请根据以下 ${c.name} 与 ${p.name} 的见面互动记录，提取见面地点与一句温暖简练的见面梗概（如：和${p.name}在街角咖啡馆见面，聊了近况并度过了安静的傍晚）。只输出 JSON 对象：{"location":"地点（不超过12字）","summary":"见面梗概（不超过65字）"}`},
                    {role:'user',content:transcript}
                  ],{json_mode:true,max_tokens:160});
                  const parsed=JSON.parse(sumJson);
                  if(parsed.location&&!locInput)aiLoc=String(parsed.location).trim().slice(0,32);
                  if(parsed.summary)aiSum=String(parsed.summary).trim().slice(0,150);
                }catch(e){}
              }
              meetingRecord=upsertMeetingRecord(p,c,mid,mMsgs,aiLoc,aiSum);
            }
            r.mode='chat';
            r.active_meeting_id='';
            r.updated_at=stamp();
            event(p.id,c.id,'return','与 '+p.name+' 返回手机聊天');
          }
        }else if(m==='meeting'&&r.active_meeting_id){
          const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
          if(mMsgs.length)meetingRecord=upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location||'');
        }
        save();
        return {mode:m,meetingId:r.active_meeting_id||'',active_meeting_id:r.active_meeting_id||'',location:r.meeting_location||'',meeting_location:r.meeting_location||'',meetingRecord,openingReply,warning};
      }
      case '/chat-flush':{
        const p=getP(data.profileId);
        if(!data.characterId)return await flushDueQueues(p);
        const c=getC(data.characterId),r=requireMatch(p.id,c.id);if(r.mode!=='chat')bodyErr('当前不是手机聊天模式');return await flushQueue(p,c,data.force===true);
      }
      case '/chat-flush-due':{
        const p=getP(data.profileId);return await flushDueQueues(p);
      }
      case '/message-delete':{
        const p=getP(data.profileId),c=getC(data.characterId),mid=String(data.messageId||'');
        if(!mid)bodyErr('缺少消息 ID');
        const targetMsg=db.messages.find(m=>m.id===mid&&m.profile_id===p.id&&m.character_id===c.id);
        if(targetMsg){
          targetMsg.text='[系统提示：对方撤回了一条消息（你没有看清具体内容）]';
          targetMsg.engine='recalled';
          targetMsg.recalled=true;
          for(const mem of (db.episodicMemories||[])){
            if(mem.owner_id===c.id&&mem.profile_id===p.id&&(mem.raw_msg_ids||[]).includes(mid)){
              mem.summary=`${p.name}撤回了一条消息（具体内容未知）`;
            }
          }
          event(p.id,c.id,'message_recalled',p.name+' 撤回了一条消息');
        }
        const q=db.queue[pairKey(p.id,c.id)];
        if(q){q.pending=q.pending.filter(x=>x!==mid);if(!q.pending.length)q.dueAt=0;}
        save();return {ok:true,recalled:true,queue:queueInfo(p.id,c.id)};
      }
      case '/message':case '/reply':{
        const p=getP(data.profileId),c=getC(data.characterId),r=requireMatch(p.id,c.id),mode=r.mode;
        let user=null;
        if(route==='/message'){
          const txt=String(data.text||'').trim();if(!txt||txt.length>4000)bodyErr('消息长度需在 1–4000 字之间');
          user=write(p.id,c.id,'user',mode,txt);
          detectAndApplyCorrection(p,c,user);
          event(p.id,c.id,'user_message','与 '+p.name+' 的'+(mode==='meeting'?'见面':'聊天')+'：'+txt.slice(0,180));
          if(mode==='chat'){const queue=enqueue(p.id,c.id,user.id,txt);save();return {user,reply:null,replies:[],queued:true,mode,queue}}
          save();
        }
        const qi=queueInfo(p.id,c.id);
        if(mode==='chat'&&(qi.count||qi.status==='inflight'))return await flushQueue(p,c,true);
        const response=await produceReply(p,c,mode,user);r.updated_at=stamp();save();return {user,reply:response.reply,replies:response.replies||[],auto_meeting:false,mode,warning:response.warning};
      }
      case '/presets':return {entries:db.presets.slice().sort((a,b)=>a.mode.localeCompare(b.mode)||a.sort_order-b.sort_order)};
      case '/preset-import':{
        const how=data.import_mode;if(!['append','replace'].includes(how))bodyErr('请选择追加或替换预设');
        const {modes,entries}=validatePresetPackage(data.preset);
        let next=how==='replace'?db.presets.filter(x=>!modes.includes(x.mode)):db.presets.slice();
        for(const mode of modes){
          const offset=Math.max(-1,...next.filter(x=>x.mode===mode).map(x=>x.sort_order))+1;
          entries.filter(x=>x.mode===mode).sort((a,b)=>a.sort_order-b.sort_order).forEach((x,i)=>next.push({...x,id:uid(),sort_order:offset+i}));
        }
        db.presets=next;save();return {ok:true,imported:entries.length,modes};
      }
      case '/preset':{
        if(data.action==='delete'){db.presets=db.presets.filter(x=>x.id!==data.id);save();return {ok:true}}
        if(data.action==='order'){(data.ids||[]).forEach((id,i)=>{const x=db.presets.find(p=>p.id===id);if(x)x.sort_order=i});save();return {ok:true}}
        const mode=data.mode||'chat',role=data.role||'system';if(!['chat','meeting'].includes(mode)||!['system','user','assistant'].includes(role))bodyErr('预设模式不正确');const old=db.presets.find(x=>x.id===data.id),id=old?.id||uid();const obj={id,mode,name:String(data.name||'新条目').slice(0,100),role,content:String(data.content||'').slice(0,60000),enabled:!!data.enabled,sort_order:old?.sort_order??(Math.max(-1,...db.presets.filter(x=>x.mode===mode).map(x=>x.sort_order))+1)};if(old)Object.assign(old,obj);else db.presets.push(obj);save();return {ok:true,id};
      }
      case '/portrait':{
        const c=getC(data.characterId||params.get('characterId'));
        const cached=db.portraits[c.id];if(cached&&!data.regenerate)return {portrait:cached,engine:'cached'};
        const s=db.connection;
        if(!s.image_base_url||!s.image_api_key||!s.image_model)bodyErr('尚未填写完整的图片生成 API 链接、密钥与模型');
        const b=s.image_base_url.trim().replace(/\/+$/,'');
        const promptTxt=`Candid dating app profile portrait photo of ${c.name} from ${c.source} (${c.version}). Character context: ${c.canon}. Natural lighting, authentic lifestyle photography, high quality portrait, no text or watermarks.`;
        let res;
        try{res=await fetch(b+'/images/generations',{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.image_api_key},body:JSON.stringify({model:s.image_model,prompt:promptTxt,n:1,size:'1024x1024'})})}
        catch(e){bodyErr('浏览器无法直连图片生成接口（可能是 CORS 限制）。可改用 Python 本地服务版。')}
        if(!res.ok)bodyErr('图片生成接口错误 HTTP '+res.status);
        const j=await res.json();const item=(j?.data||[])[0]||{};
        const uri=item.b64_json?('data:image/png;base64,'+item.b64_json):(item.url||'');
        if(!uri)bodyErr('图片接口未返回可用图像数据');
        db.portraits[c.id]=uri;save();
        return {portrait:uri,engine:'live-image'};
      }
      case '/photo-description':{
        const c=getC(data.characterId||params.get('characterId'));
        const old=db.photoDescriptions[c.id];if(old&&!data.regenerate)return {description:old.description,engine:old.engine};
        let description=photoText(c),engine='curated-demo';
        if(data.regenerate&&pub().mode==='live'){
          const instructions=`描述一张交友软件上虚构原作角色上传的照片（80至150个简体汉字），只描写画面中的外貌、姿态、光影、服饰和场景，保持人设与时期准确，不公开秘密，不编造重大剧情。${c.name}，${c.source}，${c.version}，设定：${c.canon}`;
          description=(await llm([{role:'system',content:instructions},{role:'user',content:'描述这张照片。'}],{max_tokens:350})).slice(0,1200);engine='live-text';
        }
        db.photoDescriptions[c.id]={description,engine};save();return {description,engine};
      }
      default:bodyErr('未实现请求：'+route);
    }
  }
  window.ParallelOffline={
    request,
    buildPromptPreview:(pid,cid,mode='chat')=>prompt(getP(pid),getC(cid),mode),
    get storageAvailable(){return storageAvailable},
    exportData:()=>{const copy=JSON.parse(JSON.stringify(db));copy.connection.api_key='';copy.connection.image_api_key='';return JSON.stringify({format:'parallel-portable-backup',schemaVersion:1,createdAt:stamp(),data:copy},null,2)},
    importData:(raw)=>{
      if(typeof raw!=='string'||raw.length>20*1024*1024)bodyErr('备份体积过大');
      let pack;try{pack=JSON.parse(raw)}catch{bodyErr('不是有效 JSON 文件')}
      if(pack.format!=='parallel-portable-backup'||pack.schemaVersion!==1||!pack.data)bodyErr('这不是 Parallel 单 HTML 版的备份');
      const loaded=pack.data;
      if(!Array.isArray(loaded.profiles)||!Array.isArray(loaded.messages)||!Array.isArray(loaded.events)||!Array.isArray(loaded.presets)||!loaded.connection||typeof loaded.relations!=='object'||!loaded.swipes||typeof loaded.swipes!=='object')bodyErr('备份数据缺少必要字段');
      loaded.connection.api_key='';
      loaded.connection.image_api_key='';
      ensureDbFields(loaded);
      db=loaded;save();return {profiles:db.profiles.length,messages:db.messages.length};
    }
  };
})();
