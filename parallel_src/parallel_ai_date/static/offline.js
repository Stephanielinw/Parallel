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
  const DEFAULT_PRESET_IDS=new Set(DEFAULT_PRESETS.map(x=>x.id));
  const empty=()=>({profiles:[],swipes:{},relations:{},messages:[],meetings:[],events:[],episodicMemories:[],portraits:{},photoDescriptions:{},queue:{},bios:{},bioTags:{},proactiveLog:{},surveillance:{},diaries:{},presets:DEFAULT_PRESETS.map((x,i)=>({...x,sort_order:i})),connection:{base_url:'',api_key:'',model:'',image_base_url:'',image_api_key:'',image_model:'',temperature:0.85,top_p:1,max_tokens:4096,auto_portraits:false,proactive_mode:'daily'}});
  let db;let storageAvailable=true;let mainStoreReadable=true;
  const PROTOCOL_LEADING_TAG_RE=/^(?:[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)[ \t]*)+/gm;
  const INLINE_TIMED_TAG_SEQ_RE=/(?:(?:\[|【)\s*(?:短信|见面)[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?\s*(?:\]|】)[ \t]*)+/g;
  const PROSE_CONTINUATION_AFTER_TAG_RE=/^(?:[”"』」）》】\]，,。！？!?；;、：:]|那条|这条|该条|一条|哪条|每条|那段|这段|那个|这个|那封|这封|的|里|中|上|后|前|内|外|记录|消息|内容|截图|气泡|通知|提醒|历史|存档|文本|字样|标记|标签)/;
  const PROSE_PREFIX_BEFORE_TAG_RE=/(?:打开|查看|翻看|找到|看到|收到|发来|引用|提到|显示|写着|带有|出现|删除|撤回|转发|复制|截图|翻到|停在|指着|关于|在|把|将|从|向|对|按|照|用|拿|看|读|查|找|发|回)[ \t]*$/;
  const hasUnclosedQuoteBefore=prefix=>{
    if(((prefix.match(/“/g)||[]).length)>((prefix.match(/”/g)||[]).length))return true;
    if(((prefix.match(/「/g)||[]).length)>((prefix.match(/」/g)||[]).length))return true;
    if(((prefix.match(/『/g)||[]).length)>((prefix.match(/』/g)||[]).length))return true;
    if(((prefix.match(/"/g)||[]).length)%2===1)return true;
    return false;
  };
  const splitInlineProtocolLine=line=>{
    const hasLeadingTag=/^[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)/.test(line);
    const body=line.replace(PROTOCOL_LEADING_TAG_RE,'');
    if(!body)return '';
    return body.replace(INLINE_TIMED_TAG_SEQ_RE,(match,offset,fullStr)=>{
      const before=fullStr.slice(0,offset);
      const after=fullStr.slice(offset+match.length).trim();
      if(!before.trim()||!after)return match;
      if(hasUnclosedQuoteBefore(before))return match;
      if(PROSE_CONTINUATION_AFTER_TAG_RE.test(after))return match;
      const endedSentence=/[。！？!?；;…~～][ \t]*$/.test(before);
      const validInlineSplit=endedSentence||(hasLeadingTag&&/[ \t]$/.test(before)&&!PROSE_PREFIX_BEFORE_TAG_RE.test(before));
      return validInlineSplit?'|||':match;
    });
  };
  const stripProtocolTags=(raw,opts={})=>{
    const preserveParagraphs=Boolean(opts&&opts.preserveParagraphs);
    let text=String(raw??'').replace(/\r\n?/g,'\n');
    if(!text)return '';
    for(let i=0;i<6;i++){
      const prev=text;
      // Derived summaries can contain quoted user or AI prose: never guess at inline tags.
      text=text.replace(PROTOCOL_LEADING_TAG_RE,'');
      if(text===prev)break;
    }
    if(preserveParagraphs){
      return text.split('\n').map(line=>line.replace(/^[ \t]+|[ \t]+$/g,'')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    }
    return text.replace(/[ \t]{2,}/g,' ').trim();
  };
  const cleanChatBubbleText=raw=>stripProtocolTags(raw,{preserveParagraphs:false});
  const cleanMeetingNovelText=raw=>{
    const s=String(raw??'').trim();
    if(!s)return '…';
    return stripProtocolTags(s,{preserveParagraphs:true})||'…';
  };
  // Standalone narration markers are protocol artifacts, not phone messages.
  const isNarrationMarker=raw=>/^(?:旁白|【旁白】|\[旁白\]|（旁白）|\(旁白\)|\*旁白\*|narrator|narration)\s*[:：。.!！]?\s*$/i.test(String(raw??'').trim());
  const isBareChatDivider=raw=>/^[\s|｜]*[|｜]{2,}[\s|｜]*$/.test(String(raw??''));
  const pipeChatParts=line=>{
    if(isBareChatDivider(line))return [];
    const result=[];let start=0;
    for(const match of line.matchAll(/[|｜]{2,}/g)){
      const i=match.index,before=line.slice(0,i),after=line.slice(i+match[0].length);
      // Preserve literal separators inside quotes, code spans and escaped text.
      if(hasUnclosedQuoteBefore(before)||((before.match(/\x60/g)||[]).length%2)||/\\$/.test(before))continue;
      // A simple Boolean expression is not a chat separator.
      if(match[0]==='||'&&/^[\s(]*[a-z_$0-9][\w.$]*\s*$/.test(before)&&/^\s*[a-z_$0-9][\w.$]*[\s)]*$/.test(after))continue;
      result.push(line.slice(start,i));start=i+match[0].length;
    }
    result.push(line.slice(start));return result;
  };
  const explicitChatParts=raw=>String(raw??'').replace(/\r\n?/g,'\n').split('\n')
    .flatMap(line=>pipeChatParts(splitInlineProtocolLine(line))).map(s=>cleanChatBubbleText(s)).filter(s=>s&&!isBareChatDivider(s)&&!isNarrationMarker(s));
  const storedChatText=raw=>explicitChatParts(raw).join('\n');
  const isChatArtifact=m=>m?.sender==='ai'&&m.mode!=='meeting'&&m.engine!=='recalled'&&!m.recalled&&(isBareChatDivider(cleanChatBubbleText(m.text))||isNarrationMarker(cleanChatBubbleText(m.text)));
  const sanitizeStoredData=target=>{
    if(!target||typeof target!=='object')return false;
    let changed=false;
    if(Array.isArray(target.messages)){
      for(const m of target.messages){
        if(!m||typeof m.text!=='string'||m.sender==='user'||m.engine==='recalled'||m.recalled)continue;
        const cleaned=m.mode==='meeting'?cleanMeetingNovelText(m.text):(storedChatText(m.text)||m.text);
        if(cleaned!==m.text){m.text=cleaned;changed=true;}
      }
    }
    if(Array.isArray(target.meetings)){
      for(const rec of target.meetings){
        if(!rec||typeof rec!=='object')continue;
        if(typeof rec.summary==='string'){
          const cs=stripProtocolTags(rec.summary,{preserveParagraphs:false});
          if(cs&&cs!==rec.summary){rec.summary=cs;changed=true;}
        }
        if(typeof rec.ai_summary==='string'&&rec.ai_summary){
          const cas=stripProtocolTags(rec.ai_summary,{preserveParagraphs:false});
          if(cas!==rec.ai_summary){rec.ai_summary=cas;changed=true;}
        }
        if(Array.isArray(rec.entries)){
          for(const e of rec.entries){
            if(e&&e.sender!=='user'&&typeof e.text==='string'){
              const ce=cleanMeetingNovelText(e.text);
              if(ce!==e.text){e.text=ce;changed=true;}
            }
          }
        }
      }
    }
    if(Array.isArray(target.episodicMemories)){
      for(const mem of target.episodicMemories){
        if(!mem||typeof mem!=='object')continue;
        if(typeof mem.summary==='string'&&mem.source_type!=='correction'&&mem.source_type!=='manual'){
          const cs=stripProtocolTags(mem.summary,{preserveParagraphs:false});
          if(cs&&cs!==mem.summary){mem.summary=cs;changed=true;}
        }
        if(mem.meeting_data&&typeof mem.meeting_data==='object'){
          const md=mem.meeting_data;
          if(typeof md.summary==='string'){
            const mds=stripProtocolTags(md.summary,{preserveParagraphs:false});
            if(mds&&mds!==md.summary){md.summary=mds;changed=true;}
          }
          if(Array.isArray(md.entries)){
            for(const e of md.entries){
              if(e&&e.sender!=='user'&&typeof e.text==='string'){
                const ce=cleanMeetingNovelText(e.text);
                if(ce!==e.text){e.text=ce;changed=true;}
              }
            }
          }
        }
        if(Array.isArray(mem.day_messages)){
          for(const dm of mem.day_messages){
            if(dm&&dm.sender!=='user'&&typeof dm.text==='string'){
              const cdm=cleanChatBubbleText(dm.text)||'…';
              if(cdm!==dm.text){dm.text=cdm;changed=true;}
            }
          }
        }
      }
    }
    if(Array.isArray(target.events)){
      for(const ev of target.events){
        if(ev&&ev.type!=='user_message'&&typeof ev.summary==='string'){
          const ce=stripProtocolTags(ev.summary,{preserveParagraphs:false});
          if(ce&&ce!==ev.summary){ev.summary=ce;changed=true;}
        }
      }
    }
    if(target.surveillance&&typeof target.surveillance==='object'){
      for(const store of Object.values(target.surveillance)){
        const byDate=store?.byDate;
        if(!byDate||typeof byDate!=='object')continue;
        for(const dayRec of Object.values(byDate)){
          if(!Array.isArray(dayRec?.slots))continue;
          for(const slot of dayRec.slots){
            if(slot&&typeof slot.scene==='string'){
              const cs=stripProtocolTags(slot.scene,{preserveParagraphs:false});
              if(cs&&cs!==slot.scene){slot.scene=cs;changed=true;}
            }
          }
        }
      }
    }
    return changed;
  };
  const inferPresetGroup=p=>{
    if(p&&typeof p.group==='string'&&p.group.trim())return p.group.trim();
    const nm=String(p?.name||'');
    const slashIdx=nm.indexOf(' / ');
    return slashIdx>0?nm.slice(0,slashIdx).trim():'';
  };
  const ensureDbFields=target=>{
    target.photoDescriptions ||= {};
    target.queue ||= {};
    target.portraits ||= {};
    target.bios ||= {};
    target.bioTags ||= {};
    target.proactiveLog ||= {};
    target.surveillance ||= {};
    target.diaries ||= {};
    target.meetings ||= [];
    target.episodicMemories ||= [];
    if(target.connection){
      target.connection.image_base_url ||= '';
      target.connection.image_api_key ||= '';
      target.connection.image_model ||= '';
      target.connection.proactive_mode ||= 'daily';
      if(!target.connection.max_tokens||target.connection.max_tokens<100){
        target.connection.max_tokens=4096;
      }
    }
    if(Array.isArray(target.presets)){
      const cm=target.presets.find(x=>x.id==='chat-main');
      if(cm&&cm.content&&cm.content.includes('用自然、个性化、符合角色的简短聊天气泡')&&!cm.content.includes('|||')){
        cm.content=DEFAULT_PRESETS[0].content;
      }
      for(const p of target.presets){
        if(p&&typeof p==='object'&&!p.group){
          const g=inferPresetGroup(p);
          if(g)p.group=g;
        }
      }
    }
    sanitizeStoredData(target);
  };
  let legacySystemLogs=[];
  try {
    const raw=localStorage.getItem(STORE_KEY);
    db=raw?JSON.parse(raw):empty();
    if(!db||!Array.isArray(db.profiles))throw Error('broken');
    legacySystemLogs=Array.isArray(db.systemLogs)?db.systemLogs:[];
    delete db.systemLogs;
    ensureDbFields(db);
  }catch(err){db=empty();storageAvailable=false;mainStoreReadable=false;}
  const save=()=>{
    if(!mainStoreReadable)throw Error('无法安全读取原存档，已停止覆盖；请先导出备份。');
    try{localStorage.setItem(STORE_KEY,JSON.stringify(db));storageAvailable=true;}
    catch(err){storageAvailable=false;throw Error('浏览器本地空间不足或禁止保存。请先导出备份并释放空间。后续保存会继续尝试，不会静默跳过。');}
  };
  // Diagnostics never share the authoritative save or its failure state.
  const LOG_MAX_COUNT=40,LOG_MAX_BYTES=4*1024*1024;
  const logByteSize=x=>{const s=JSON.stringify(x);return typeof TextEncoder==='function'?new TextEncoder().encode(s).length:s.length*3;};
  const boundedLogs=entries=>{
    const out=[],seen=new Set();let bytes=0;
    for(const row of entries){
      if(!row||typeof row!=='object'||!row.id||seen.has(row.id))continue;
      let item=row,n=logByteSize(item)+64;
      if(n>LOG_MAX_BYTES){
        item={...row,request_payload:null,raw_response:null,raw_content:'',parsed_content:'',reasoning_content:'',active_presets:[],disabled_presets:[],storage_warning:'本条日志超过独立存储容量，仅保留元数据。'};
        n=logByteSize(item)+64;
      }
      if(out.length>=LOG_MAX_COUNT||bytes+n>LOG_MAX_BYTES)continue;
      seen.add(item.id);out.push(item);bytes+=n;
    }
    return out;
  };
  const safeLog=entry=>{
    let serialized=JSON.stringify(entry);
    for(const secret of [db.connection.api_key,db.connection.image_api_key]){
      if(secret&&secret.length>=8)serialized=serialized.split(JSON.stringify(secret).slice(1,-1)).join('***REDACTED***');
    }
    return JSON.parse(serialized);
  };
  let logState={enabled:true,logs:boundedLogs(legacySystemLogs.map(safeLog))},logDb=null,logStorage='session',logSettled=false,logPending=[],logWrites=Promise.resolve();
  legacySystemLogs=[];
  const openLogDb=()=>new Promise(resolve=>{
    if(typeof indexedDB==='undefined'){resolve(null);return;}
    let settled=false;
    const finish=value=>{if(settled){try{value?.close();}catch{}return;}settled=true;resolve(value);};
    try{
      const req=indexedDB.open('parallel-generation-logs-v1',1);
      req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains('logs'))req.result.createObjectStore('logs');};
      req.onsuccess=()=>finish(req.result);req.onerror=()=>finish(null);req.onblocked=()=>finish(null);
      if(typeof setTimeout==='function')setTimeout(()=>{if(!settled)finish(null);},1500);
    }catch{finish(null);}
  });
  const readLogState=()=>new Promise((resolve,reject)=>{
    try{const tx=logDb.transaction('logs','readonly'),req=tx.objectStore('logs').get('state');
      req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error);tx.onabort=()=>reject(tx.error);}
    catch(e){reject(e);}
  });
  const writeLogState=()=>new Promise((resolve,reject)=>{
    if(!logDb){resolve();return;}
    try{const tx=logDb.transaction('logs','readwrite');tx.objectStore('logs').put({enabled:logState.enabled,logs:logState.logs},'state');
      tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);}
    catch(e){reject(e);}
  });
  const disableLogPersistence=()=>{try{logDb?.close();}catch{}logDb=null;logStorage='session';};
  const persistLogState=()=>{
    logWrites=logWrites.then(()=>writeLogState()).catch(()=>{disableLogPersistence();});
    return logWrites;
  };
  const logReady=(async()=>{
    try{
      logDb=await openLogDb();
      if(logDb){
        const prior=await readLogState();
        if(prior){
          logState.enabled=prior.enabled!==false;
          logState.logs=boundedLogs([...logState.logs,...(Array.isArray(prior.logs)?prior.logs:[])].sort((a,b)=>String(b.created_at||'').localeCompare(String(a.created_at||''))));
        }
        logStorage='indexeddb';
      }
    }catch{disableLogPersistence();}
    logSettled=true;
    if(logState.enabled)logState.logs=boundedLogs([...logPending,...logState.logs]);
    logPending=[];
    await persistLogState();
  })();
  // Keep the authoritative in-memory save if the first write fails.
  if(mainStoreReadable){try{save();}catch{}}
  const bodyErr=s=>{throw Error(s)};
  const validatePresetPackage=(pack)=>{
    if(pack&&pack.format==='elsewhere-preset'){
      if(pack.schemaVersion!==1||!Array.isArray(pack.entries)||pack.entries.length<1||pack.entries.length>200)bodyErr('Elsewhere 自有预设结构无效');
      const ids=new Set(),entries=pack.entries.map((x,i)=>{
        if(!x||typeof x.id!=='string'||ids.has(x.id)||typeof x.name!=='string'||!x.name.trim()||typeof x.content!=='string'||x.content.length>60000||!['system','user','assistant'].includes(x.role)||typeof x.enabled!=='boolean')bodyErr('Elsewhere 条目 '+(i+1)+' 格式无效');
        ids.add(x.id);const group=String(x.group||'').trim().slice(0,70);const rawName=x.name.trim();
        return {mode:'meeting',name:((group?group+' / ':'')+rawName).slice(0,100),raw_name:rawName.slice(0,100),group,source_id:x.id,origin:'elsewhere',role:x.role,content:x.content,enabled:x.enabled,sort_order:i};
      });return {modes:['meeting'],entries};
    }
    if(!pack||typeof pack!=='object'||Array.isArray(pack)||pack.format!=='parallel-text-preset'||pack.schemaVersion!==1)
      bodyErr('仅支持 Parallel 自有预设 JSON（v1），不支持第三方预设格式');
    const modes=pack.modes,entries=pack.entries;
    if(!Array.isArray(modes)||modes.length<1||modes.length>2||new Set(modes).size!==modes.length||modes.some(x=>!['chat','meeting'].includes(x)))bodyErr('预设的模式列表无效');
    if(!Array.isArray(entries)||entries.length<1||entries.length>200)bodyErr('预设应包含 1–200 个条目');
    if(new TextEncoder().encode(JSON.stringify(pack)).length>4*1024*1024)bodyErr('预设文件超过 4 MB');
    const reqFields=['mode','name','role','enabled','content','sort_order'];
    const optFields=new Set(['mode','name','role','enabled','content','sort_order','group','source_id','origin','raw_name']);
    return {modes,entries:entries.map((x,i)=>{
      const valid=x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).every(k=>optFields.has(k))&&reqFields.every(k=>Object.prototype.hasOwnProperty.call(x,k))&&modes.includes(x.mode)&&['system','user','assistant'].includes(x.role)&&typeof x.name==='string'&&x.name.trim().length>0&&x.name.length<=100&&typeof x.content==='string'&&x.content.length<=60000&&typeof x.enabled==='boolean'&&Number.isInteger(x.sort_order)&&x.sort_order>=0&&x.sort_order<=10000;
      if(!valid)bodyErr('预设条目 '+(i+1)+' 格式无效');
      const group=String(x.group||inferPresetGroup(x)||'').trim().slice(0,70);
      return {mode:x.mode,name:x.name.trim(),raw_name:String(x.raw_name||x.name).trim().slice(0,100),group,source_id:String(x.source_id||''),origin:String(x.origin||'parallel'),role:x.role,enabled:x.enabled,content:x.content,sort_order:x.sort_order};
    })};
  };
  const diagnosePresets=(mode='meeting')=>{
    const all=(db.presets||[]).filter(x=>x.mode===mode).sort((a,b)=>a.sort_order-b.sort_order);
    const enabled=all.filter(x=>x.enabled);
    const disabled=all.filter(x=>!x.enabled);
    const isDefaultEntry=x=>DEFAULT_PRESET_IDS.has(x.id)||(mode==='meeting'&&(x.name==='面对面 · 小说模式'||x.name==='线下见面 · 小说模式'||x.name==='克制与连贯')&&!x.group);
    const defaultEnabled=enabled.filter(isDefaultEntry);
    const customEnabled=enabled.filter(x=>!isDefaultEntry(x));
    const defaultAndCustomCoexist=defaultEnabled.length>0&&customEnabled.length>0;
    const seenContent=new Map();
    const duplicateEntries=[];
    for(const item of all){
      const key=`${item.role}::${String(item.name||'').trim()}::${String(item.content||'').trim().slice(0,240)}`;
      if(seenContent.has(key)){
        duplicateEntries.push({id:item.id,name:item.name,enabled:!!item.enabled,duplicateOf:seenContent.get(key)});
      }else{
        seenContent.set(key,item.id);
      }
    }
    const styleEntries=all.filter(x=>{
      const g=inferPresetGroup(x);
      return g.includes('文风')||String(x.name||'').startsWith('文风');
    });
    const enabledStyleEntries=styleEntries.filter(x=>x.enabled);
    const cotEntries=enabled.filter(x=>{
      const g=inferPresetGroup(x);
      return g.toUpperCase()==='COT'||String(x.name||'').includes('动笔前')||String(x.name||'').toUpperCase().includes('COT /');
    });
    const pledgeEntries=enabled.filter(x=>x.role==='assistant'||inferPresetGroup(x).includes('誓约')||String(x.name||'').includes('誓约'));
    const warnings=[];
    if(defaultAndCustomCoexist){
      warnings.push(`检测到系统默认保底预设（${defaultEnabled.map(x=>x.name).join('、')}）与导入的自定义预设同时启用。这通常是因为导入时选择了「追加导入」，可能导致简短保底指令稀释自定义预设的文风与篇幅规则。`);
    }
    if(duplicateEntries.length>0){
      warnings.push(`检测到 ${duplicateEntries.length} 个重复的预设条目（可能是多次点击「追加导入」所致），重复注入会浪费上下文预算。`);
    }
    if(styleEntries.length>0&&enabledStyleEntries.length>1){
      warnings.push(`「文风（单选）」分组当前同时启用了 ${enabledStyleEntries.length} 个文风条目（${enabledStyleEntries.map(x=>x.name).join('、')}），建议仅启用 1 个以防文风打架。`);
    }else if(styleEntries.length>0&&enabledStyleEntries.length===0){
      warnings.push(`「文风（单选）」分组当前未启用任何文风条目（共 ${styleEntries.length} 个均已停用）。`);
    }
    const rolesBreakdown={
      system:enabled.filter(x=>x.role==='system').length,
      user:enabled.filter(x=>x.role==='user').length,
      assistant:enabled.filter(x=>x.role==='assistant').length
    };
    return {
      mode,
      totalCount:all.length,
      enabledCount:enabled.length,
      disabledCount:disabled.length,
      totalEnabledChars:enabled.reduce((acc,x)=>acc+String(x.content||'').length,0),
      hasCustomPresets:customEnabled.length>0,
      defaultAndCustomCoexist,
      defaultEnabledIds:defaultEnabled.map(x=>x.id),
      duplicateCount:duplicateEntries.length,
      duplicateEntries,
      styleGroupTotal:styleEntries.length,
      enabledStyleCount:enabledStyleEntries.length,
      enabledStyleNames:enabledStyleEntries.map(x=>x.name),
      disabledStyleNames:styleEntries.filter(x=>!x.enabled).map(x=>x.name),
      hasCotCheck:cotEntries.length>0,
      hasBottomPledge:pledgeEntries.length>0,
      rolesBreakdown,
      warnings
    };
  };

  const getP=id=>db.profiles.find(p=>p.id===id)||bodyErr('请先选择有效的 Profile');
  const getC=id=>byId.get(id)||bodyErr('原作人物目录中不存在此角色');
  const relation=(pid,cid)=>db.relations[pairKey(pid,cid)];
  const pub=()=>{const {api_key,image_api_key,...s}=db.connection;const hasApi=!!(s.base_url&&s.model&&api_key);const hasImg=!!(s.image_base_url&&s.image_model&&image_api_key);const demoEnabled=s.demo_enabled!==false;return {...s,proactive_mode:s.proactive_mode||'daily',has_key:!!api_key,has_api_config:hasApi,demo_enabled:demoEnabled,has_image_key:!!image_api_key,mode:hasApi?'live':(demoEnabled?'demo':'normal'),image_mode:hasImg?'live':'text',portable:true,storageAvailable}};
  const splitChatBubbles=raw=>{
    const rawStr=String(raw||'').trim();
    if(!rawStr)return ['…'];
    let parts=explicitChatParts(rawStr);
    if(!parts.length&&(isBareChatDivider(rawStr.replace(PROTOCOL_LEADING_TAG_RE,''))||isNarrationMarker(cleanChatBubbleText(rawStr))))return [];
    if(parts.length===1&&parts[0].length>=32){
      const sentences=parts[0].match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g)?.map(s=>cleanChatBubbleText(s)).filter(Boolean)||[parts[0]];
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
    const msgs=prompt(p,c,'chat',pending,{entry_point:'chat_flush'});
    if(curMode==='live'){try{txt=await llm(msgs,{profile:p,character:c,mode:'chat',entry_point:'chat_flush'});engine='live'}catch(e){warning=String(e.message||e);engine='error'}}else txt=demo(p,c,'chat');
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
      if(reply){
        recordDialogueEpisode(p,c,userRows,{...reply,text:combinedTxt},'chat');
        syncSurveillanceFromChat(p,c,userRows,combinedTxt);
      }
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
  const char=(c,pid='')=>{
    const rel=pid?relation(pid,c.id):null;
    const nick=String(rel?.nickname||'').trim();
    return {...c,nickname:nick,display_name:nick||c.name,portrait:db.portraits[c.id]||null,bio:db.bios[c.id]||c.bio,tags:(Array.isArray(db.bioTags?.[c.id])&&db.bioTags[c.id].length)?db.bioTags[c.id]:c.tags};
  };
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
        const mDate=String(m.started_at).slice(0,10);
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
  const getCurrentSurveillanceSlot=(p,c)=>{
    const rec=getOrInitSurveillance(p,c,localDateStr());
    const r=relation(p.id,c.id);
    const nowHHMM=fmtHHMM(Date.now())||'12:00';
    const nowMin=hhmmToMin(nowHHMM);
    if(r?.mode==='meeting'){
      const loc=r.meeting_location||'约定的街角咖啡馆';
      return {
        id:'live_meeting',
        start:fmtHHMM(r.meeting_started_at||Date.now())||nowHHMM,
        end:nowHHMM,
        location:loc,
        status:`正与 ${p.name} 当面见面中`,
        activity:`在「${loc}」与 ${p.name} 面对面相处`,
        scene:`${c.name}放下了原本的日常安排，此刻正身处「${loc}」与 ${p.name} 面对面互动。`,
        source:'meeting',
        isCurrent:true,
        isMeetingLive:true
      };
    }
    let active=null;
    for(const s of rec.slots){
      const sMin=hhmmToMin(s.start),eMin=hhmmToMin(s.end);
      if(sMin<=nowMin&&nowMin<=eMin){active=s;break;}
      if(sMin<=nowMin)active=s;
    }
    if(!active)active=rec.slots[0];
    return {...active,isCurrent:true,isMeetingLive:false};
  };
  const syncSurveillanceOnMeetingStart=(p,c,loc,meetingId)=>{
    const rec=getOrInitSurveillance(p,c,localDateStr());
    const nowHHMM=fmtHHMM(Date.now())||'12:00';
    const nowMin=hhmmToMin(nowHHMM);
    const endHHMM=minToHHMM(Math.min(1439,nowMin+60));
    const idx=rec.slots.findIndex(s=>hhmmToMin(s.start)<=nowMin&&nowMin<=hhmmToMin(s.end));
    const meetSlot={
      id:`slot_meet_${meetingId||uid()}`,
      start:nowHHMM,
      end:endHHMM,
      location:loc,
      status:`与 ${p.name} 当面见面中`,
      activity:`在「${loc}」与 ${p.name} 面对面互动`,
      scene:`${c.name}暂时放下了原本手头的安排，来到「${loc}」与 ${p.name} 当面相见。`,
      source:'meeting',
      meeting_id:meetingId||''
    };
    if(idx>=0){
      const cur=rec.slots[idx];
      if(cur.source==='meeting'&&cur.meeting_id===meetingId){
        Object.assign(cur,meetSlot);
      }else{
        if(hhmmToMin(cur.start)<nowMin){
          cur.end=nowHHMM;
          rec.slots.splice(idx+1,0,meetSlot);
        }else{
          rec.slots[idx]=meetSlot;
        }
      }
    }else{
      rec.slots.push(meetSlot);
    }
    rec.updated_at=stamp();
    return rec;
  };
  const syncSurveillanceOnMeetingEnd=(p,c,meetingRecord)=>{
    if(!meetingRecord)return null;
    const rec=getOrInitSurveillance(p,c,localDateStr());
    const startHHMM=fmtHHMM(meetingRecord.started_at)||fmtHHMM(Date.now());
    const endHHMM=fmtHHMM(meetingRecord.ended_at)||fmtHHMM(Date.now());
    const endMin=hhmmToMin(endHHMM);
    const loc=meetingRecord.location||'约定的街角咖啡馆';
    let mIdx=rec.slots.findIndex(s=>s.meeting_id===meetingRecord.id||s.source==='meeting');
    const finalizedSlot={
      id:`slot_meet_${meetingRecord.id}`,
      start:startHHMM,
      end:endHHMM>startHHMM?endHHMM:minToHHMM(Math.min(1439,hhmmToMin(startHHMM)+25)),
      location:loc,
      status:'线下见面足迹',
      activity:`与 ${p.name} 在「${loc}」当面见面`,
      scene:`${meetingRecord.summary||`与 ${p.name} 在「${loc}」度过了面对面相处的时光。`}`,
      source:'meeting',
      meeting_id:meetingRecord.id
    };
    if(mIdx>=0){
      rec.slots[mIdx]=finalizedSlot;
    }else{
      const hitIdx=rec.slots.findIndex(s=>hhmmToMin(s.start)<=endMin&&endMin<=hhmmToMin(s.end));
      if(hitIdx>=0){
        rec.slots.splice(hitIdx,1,finalizedSlot);
        mIdx=hitIdx;
      }else{
        rec.slots.push(finalizedSlot);
        mIdx=rec.slots.length-1;
      }
    }
    const nextSlot=rec.slots[mIdx+1];
    if(nextSlot&&nextSlot.source==='schedule'){
      const fEndMin=hhmmToMin(finalizedSlot.end);
      if(hhmmToMin(nextSlot.start)<fEndMin){
        nextSlot.start=finalizedSlot.end;
      }
      if(hhmmToMin(nextSlot.end)<=hhmmToMin(nextSlot.start)){
        nextSlot.end=minToHHMM(Math.min(1439,hhmmToMin(nextSlot.start)+45));
      }
      if(!nextSlot.scene.includes(loc)){
        nextSlot.activity=`从「${loc}」离开后 · ${nextSlot.activity}`;
        nextSlot.scene=`刚结束在「${loc}」与 ${p.name} 的见面，${c.name}带着见面后的余温回到日常节奏：${nextSlot.scene}`;
        nextSlot.source='meeting_shift';
      }
    }
    rec.updated_at=stamp();
    return rec;
  };
  const syncSurveillanceFromChat=(p,c,userRows,aiText)=>{
    const txt=String(aiText||'').trim();
    if(!txt)return;
    const moveMatch=txt.match(/(?:我现在(?:去|在|到)|刚到|已经到|正坐在|正在|先去|准备去)([\u4e00-\u9fa5A-Za-z0-9]{1,8}(?:咖啡店|咖啡馆|咖啡厅|酒吧|酒馆|餐厅|书店|唱片行|公园|海边|江边|车站|天台|公寓|靶场|电影院|便利店|图书馆|安全屋|超市|健身房))/);
    if(!moveMatch||!moveMatch[1])return;
    const newLoc=moveMatch[1].trim();
    const rec=getOrInitSurveillance(p,c,localDateStr());
    const nowHHMM=fmtHHMM(Date.now())||'12:00';
    const nowMin=hhmmToMin(nowHHMM);
    const idx=rec.slots.findIndex(s=>hhmmToMin(s.start)<=nowMin&&nowMin<=hhmmToMin(s.end));
    if(idx>=0&&rec.slots[idx].source!=='meeting'){
      rec.slots[idx].location=newLoc;
      rec.slots[idx].status='聊天动态同步';
      rec.slots[idx].activity=`在「${newLoc}」活动（与你聊天提及）`;
      rec.slots[idx].scene=`${c.name}刚刚在消息里与 ${p.name} 提到自己身处「${newLoc}」：「${txt.slice(0,55)}」`;
      rec.slots[idx].source='chat_update';
      rec.updated_at=stamp();
    }
  };
  async function ensureLiveSurveillance(p,c,forceRefresh=false,targetDate=''){
    const today=localDateStr();
    const dStr=(targetDate&&/^\d{4}-\d{2}-\d{2}$/.test(targetDate))?targetDate:today;
    const rec=getOrInitSurveillance(p,c,dStr);
    if(pub().mode!=='live')return rec;
    if(rec.engine==='live'&&!forceRefresh)return rec;
    try{
      const relSummary=relationshipBaselineSummary(p.id,c.id,p.name);
      const sys=`你是日程与世界线生成引擎。请为角色 ${c.name}（来源：${c.source} · ${c.version}，背景：${c.canon}）生成 ${dStr} 从 00:00 到 23:59 的完整一日生活足迹监控表（共 8 到 9 个连续时间段，无缝覆盖全天）。
要求：
1. 严密贴合 ${c.name} 的原作职业、性格与独立生活习惯，角色有自己的工作、同伴与日常，不要整天围着 ${p.name} 转（当前关系：${relSummary}）。
2. 每个时间段包含：start ("HH:MM"), end ("HH:MM"), location (具体地点，不超过14字), status (简短状态标签，4-6字), activity (正在做的事，不超过16字), scene (极具画面感的第三人称现场微描写，35-70字，描写环境光影、小动作或神态，严禁使用任何 emoji)。
3. 只输出 JSON 对象，格式严格为：{"slots":[{"start":"00:00","end":"07:00","location":"...","status":"...","activity":"...","scene":"..."}]}`;
      const out=await llm([{role:'system',content:sys},{role:'user',content:`请生成 ${c.name} 在 ${dStr} 的全天足迹 JSON。`}],{json_mode:true,max_tokens:1200});
      const parsed=JSON.parse(out);
      if(Array.isArray(parsed?.slots)&&parsed.slots.length>=5){
        const preserved=rec.slots.filter(s=>s.source==='meeting'||s.source==='chat_update');
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
        for(const pSlot of preserved){
          const pMin=hhmmToMin(pSlot.start);
          const hit=aiSlots.findIndex(x=>hhmmToMin(x.start)<=pMin&&pMin<=hhmmToMin(x.end));
          if(hit>=0)aiSlots.splice(hit,1,pSlot);
          else aiSlots.push(pSlot);
        }
        aiSlots.sort((a,b)=>hhmmToMin(a.start)-hhmmToMin(b.start));
        rec.slots=aiSlots;
        rec.engine='live';
        rec.updated_at=stamp();
        save();
      }
    }catch(e){}
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
    const unlocked=[];
    let lockedCount=0;
    for(const s of rec.slots){
      if(!isToday||hhmmToMin(s.start)<=nowMin){
        unlocked.push({
          ...s,
          isCurrent:Boolean(isToday&&current&&!current.isMeetingLive&&(s.id===current.id||(s.start===current.start&&s.location===current.location)))
        });
      }else{
        lockedCount++;
      }
    }
    if(isToday&&current?.isMeetingLive&&!unlocked.some(u=>u.source==='meeting'&&u.location===current.location)){
      unlocked.push({...current,isCurrent:true});
    }
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
      lockedCount
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
  const buildDefaultDiary=(p,c,dateStr,survRec)=>{
    const slots=survRec?.slots||buildDefaultSurveillanceSlots(p,c,dateStr);
    const intimacy=computeIntimacyInfo(p,c);
    const dayMsgs=messagesOf(p.id,c.id).filter(m=>String(m.created_at||'').slice(0,10)===dateStr&&m.engine!=='recalled');
    const dayMeetings=(db.meetings||[]).filter(m=>m.profile_id===p.id&&m.character_id===c.id&&String(m.started_at||'').slice(0,10)===dateStr);
    const slotMeet=slots.find(s=>s.source==='meeting');
    const sMorning=slots[2]||slots[1]||slots[0];
    const sAfternoon=slots[4]||slots[3]||slots[1];
    const sEvening=slots[6]||slots[5]||slots[slots.length-1];
    let h=0;for(const ch of (c.id+dateStr))h=(Math.imul(31,h)+ch.charCodeAt(0))|0;
    const weathers=['晴朗微风','多云转晴','微凉阴天','夜风清朗','浅雾转晴'];
    const moods=intimacy.stage==='deep_love'?['心绪温柔','满怀牵挂','平静而笃定']:['专注沉稳','平静松弛','略感倦意但踏实','波澜不惊'];
    const weather=weathers[(h>>>0)%weathers.length];
    const mood=moods[((h>>>2)>>>0)%moods.length];

    let title=`《${sMorning?.location?.split('·')[0]?.trim()||'日常勤务'}与${sEvening?.location?.split('·')[0]?.trim()||'夜色'}》`;
    const paras=[];
    // Paragraph 1: Always grounded in the character's morning & daytime surveillance life (their own world!)
    paras.push(`上午在${sMorning?.location||'常去的地方'}处理完「${sMorning?.activity||'例行事务'}」，花了不少精力把积压的细节逐一核对清楚。作为${c.source.split('·')[0].trim()}世界里习惯了随时应对突发状况的人，这种按部就班的节奏反而让我觉得踏实。中午简单解决了午饭，没有多作停留。`);

    // Paragraph 2: Afternoon & evening footprints from surveillance
    paras.push(`下午去了${sAfternoon?.location||'城区'}继续「${sAfternoon?.activity||'手头的安排'}」，一直忙到傍晚才去${sEvening?.location||'河岸附近'}透了口气。晚风吹过来的时候，白天的紧绷感才算真正散去了一些。对我来说，能拥有这样一段不被打扰的独处时间已经足够难得。`);

    // Paragraph 3: Proportional reflection depending on intimacy stage and whether they interacted on dateStr
    if(intimacy.stage==='deep_love'){
      if(dayMeetings.length||slotMeet){
        const mLoc=dayMeetings[0]?.location||slotMeet?.location||'约定的地方';
        title=`《在${mLoc}与${p.name}相见的这一天》`;
        paras.push(`不过今天最让我反复回味的，还是在「${mLoc}」和 ${p.name} 见面的那段时光。以前我总觉得自己的生活只需要冷静与秩序就够了，可现在哪怕只是处理完日常事务走回住处的路上，脑海里也全都是 ${p.name} 说话时的神情。大概是真的栽在这段关系里了——只要想到明天还能听见这个人的声音，连原本枯燥的日常都变得让人期待起来。`);
      }else{
        title=`《忙完日常之后，格外想念${p.name}的夜晚》`;
        paras.push(`回到住处整理好装备后，房间里安静下来，思绪却不受控制地飘向了 ${p.name}。明明白天在${sMorning?.location||'外勤'}和${sAfternoon?.location||'办事'}时还能保持一贯的冷静，可一到空闲下来的时候，满脑子都会想 ${p.name} 今天过得怎么样、有没有按时休息。原来不知不觉间，这个人已经成了我生活里最放不下的重心。`);
      }
    }else if(dayMeetings.length||slotMeet){
      const mLoc=dayMeetings[0]?.location||slotMeet?.location||'街角咖啡馆';
      paras.push(`值得一提的是，今天抽空在「${mLoc}」和 ${p.name} 见了一面。能在各自忙碌的生活间隙里坐下来面对面聊聊天，感觉还不坏。回去之后继续处理完了手头剩下的收尾工作，明天还有早起的正事，先记到这里。`);
    }else if(dayMsgs.length>0){
      const userSnippet=dayMsgs.filter(m=>m.sender==='user').slice(-1)[0]?.text?.slice(0,28)||'日常近况';
      paras.push(`今天办事的间隙里，手机上收到了 ${p.name} 发来的消息，聊了几句关于「${userSnippet}」的话题。我的生活依然沿着原本的轨道运转，不过偶尔有这样一个能聊得来的朋友穿插在日常里，倒也不讨厌。夜深了，早点休息。`);
    }else{
      paras.push(`今天一整天都扑在自己的事情上，没有太多额外的社交。回到住处后把随身装备重新保养了一遍，翻了几页还没读完的旧书。明天上午在${sMorning?.location||'老地方'}还有安排，关灯睡觉。`);
    }

    const footprints=slots.filter(s=>hhmmToMin(s.start)>=420&&hhmmToMin(s.start)<=1300).slice(0,4).map(s=>`${s.start} ${s.location}（${s.activity}）`);
    const sourceLocations=slots.filter(s=>hhmmToMin(s.start)>=420&&hhmmToMin(s.start)<=1300).slice(0,4).map(s=>s.location);
    return {
      id:`diary_${c.id}_${dateStr}`,
      date:dateStr,
      profile_id:p.id,
      character_id:c.id,
      title,
      weather,
      mood,
      intimacy_stage:intimacy.stage,
      intimacyStage:intimacy.stage,
      intimacy_label:intimacy.label,
      intimacy_score:intimacy.score,
      content:paras.join('\n\n'),
      footprints,
      sourceLocations,
      engine:'demo',
      created_at:stamp()
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
    if(pub().mode!=='live')return entry;
    if(entry.engine==='live'&&!forceRefresh)return entry;
    try{
      const intimacy=computeIntimacyInfo(p,c);
      const slotsTxt=(survRec.slots||[]).map(s=>`${s.start}-${s.end} 在【${s.location}】${s.activity}（${s.scene}）`).join('\n');
      const dayMsgs=messagesOf(p.id,c.id).filter(m=>String(m.created_at||'').slice(0,10)===dStr&&m.engine!=='recalled');
      const chatTxt=dayMsgs.length?dayMsgs.slice(-8).map(m=>`${m.sender==='user'?p.name:c.name}：${m.text.slice(0,80)}`).join('\n'):'当日无手机聊天';
      const sys=`你是 ${c.name}（来自《${c.source}》· ${c.version}，设定：${c.canon}）。现在是午夜 00:00 之后，请根据你【${dStr} 全天的监控行踪记录】写一篇你自己的第一人称私密日记。
核心铁律（必须严格遵守）：
1. 日记主要来源于你这一天的监控行踪（必须自然写到你在监控中的具体地点、做的事、工作细节与个人思考）。
2. 记住：你有自己独立完整的生活、事业与世界，并不是以用户（${p.name}）为生活核心！
   - 当前你对 ${p.name} 的感情阶段为：${intimacy.label}（阶段代码：${intimacy.stage}，好感分：${intimacy.score}/100）。
   - 如果阶段不是 deep_love（深陷偏爱）：日记 80%–90% 必须写你自己的工作、日常经历与独处感想；如果当天和 ${p.name} 聊过天或见过面，只在日记中自然、克制地顺带提一两句；如果当天没有互动，就完全不提或仅一笔带过，绝不围着用户转！
   - 只有当阶段为 deep_love（爱到不行了）时，才会在记录日常之余流露出对 ${p.name} 浓烈的爱意与反复回味。
3. 严禁使用任何 emoji 表情符号！文风必须符合 ${c.name} 的性格（第一人称“我”，分 3 个自然段，段与段之间用 \\n\\n 分隔）。
4. 只输出 JSON 对象，格式为：{"title":"《...》","weather":"纯文字天气（如：夜风微凉）","mood":"纯文字心情（如：平静专注）","content":"第一人称日记正文（3段）"}`;
      const out=await llm([{role:'system',content:sys},{role:'user',content:`【${dStr} 你的全天监控行踪】：\n${slotsTxt}\n\n【${dStr} 与 ${p.name} 的互动记录】：\n${chatTxt}\n\n请生成该日日记 JSON。`}],{json_mode:true,max_tokens:900});
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
        entry.updated_at=stamp();
        save();
      }
    }catch(e){}
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
    return {
      characterId:c.id,
      characterName:c.name,
      date:selectedDate,
      latestDate,
      selectedDate,
      availableDates,
      newlyGenerated,
      intimacy,
      diary
    };
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
    const p=db.profiles.find(x=>x.id===pid),c=byId.get(cid);
    if(p&&c){
      const curSlot=getCurrentSurveillanceSlot(p,c);
      if(curSlot?.location)return curSlot.location.slice(0,32);
    }
    return '约定的街角咖啡馆';
  };
  const buildMeetingSummaryText=(p,c,loc,mMsgs,aiSummary='')=>{
    if(aiSummary&&String(aiSummary).trim().length>=6)return stripProtocolTags(String(aiSummary),{preserveParagraphs:false}).slice(0,160);
    const uTurns=mMsgs.filter(m=>m.sender==='user'&&m.engine!=='recalled');
    const aTurns=mMsgs.filter(m=>m.sender==='ai'&&m.engine!=='recalled');
    if(uTurns.length){
      const firstU=String(uTurns[0].text??'').replace(/\s+/g,' ').trim().slice(0,38);
      const lastU=uTurns.length>1?String(uTurns[uTurns.length-1].text??'').replace(/\s+/g,' ').trim().slice(0,34):'';
      return `${p.name}「${firstU}」${lastU?`、再到「${lastU}」`:''}，与 ${c.name} 面对面互动了 ${mMsgs.length} 个回合。`;
    }
    if(aTurns.length){
      const snippet=cleanMeetingNovelText(aTurns[0].text).replace(/\s+/g,' ').slice(0,48);
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
    const entries=mMsgs.map(m=>({id:m.id,sender:m.sender,speaker:m.sender==='user'?p.name:c.name,text:m.sender==='user'?String(m.text??''):cleanMeetingNovelText(m.text),created_at:m.created_at}));
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
        if(rawRows.length)entry.raw_excerpt=rawRows.map(r=>(r.sender==='user'?'对方：':'你：')+(r.sender==='user'?String(r.text??'').trim():cleanChatBubbleText(r.text)).slice(0,70)).join(' | ');
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
    const all=messagesOf(pid,cid).filter(m=>!isChatArtifact(m));
    if(!all.length)return [];
    if(mode==='meeting'){
      const r=relation(pid,cid);
      const activeMid=r?.active_meeting_id||'';
      const winLimit=16;
      if(activeMid){
        const curMeet=all.filter(m=>m.mode==='meeting'&&m.meeting_id===activeMid);
        return curMeet.slice(-winLimit);
      }
      const trailingMeet=[];
      for(let i=all.length-1;i>=0;i--){
        if(all[i].mode==='meeting')trailingMeet.unshift(all[i]);
        else if(trailingMeet.length)break;
      }
      if(trailingMeet.length)return trailingMeet.slice(-winLimit);
      return all.filter(m=>m.mode==='meeting').slice(-winLimit);
    }
    const chron=all.slice(-24);
    const winLimit=10;
    const todayPrefix=String(chron[chron.length-1].created_at).slice(0,10);
    const todayMsgs=chron.filter(m=>String(m.created_at).slice(0,10)===todayPrefix);
    if(todayMsgs.length>=4)return todayMsgs.slice(-winLimit);
    return chron.slice(-Math.min(6,winLimit));
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
  const event=(pid,cid,type,summary)=>{
    const nowStr=stamp();
    const cleanSum=type==='user_message'?String(summary??'').trim():stripProtocolTags(summary,{preserveParagraphs:false});
    db.events.push({id:uid(),profile_id:pid,character_id:cid,type,summary:cleanSum.slice(0,500),created_at:nowStr});
  };
  const write=(pid,cid,sender,mode,text,engine='human')=>{
    const r=relation(pid,cid);
    const cleanTxt=(sender==='ai'&&engine!=='error'&&engine!=='recalled')
      ?(mode==='meeting'?cleanMeetingNovelText(text):(cleanChatBubbleText(text)||'…'))
      :String(text??'');
    const m={id:uid(),profile_id:pid,character_id:cid,sender,mode,text:cleanTxt,engine,meeting_id:mode==='meeting'?(r?.active_meeting_id||''):'',created_at:stamp()};
    db.messages.push(m);
    return m;
  };
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
  const prompt=(p,c,mode,pendingIds=[],options={})=>{
    const macros=t=>expandPresetMacros(t,p,c);
    const workingHistory=selectWorkingHistory(p.id,c.id,mode);
    const workingIds=new Set(workingHistory.map(m=>m.id));
    ensureMeetingRecords(p,c);
    ensureDailySummaries(p,c,workingIds);
    const preChatContext=mode==='meeting'?selectPreMeetingChatContext(p.id,c.id,6):[];
    const querySeed=(options.latestText||'').trim()
      ||workingHistory.slice(-3).filter(m=>m.sender==='user').map(m=>String(m.text??'').trim()).join(' ')
      ||workingHistory.slice(-2).map(m=>m.sender==='user'?String(m.text??'').trim():cleanChatBubbleText(m.text)).join(' ')
      ||preChatContext.slice(-2).map(m=>m.sender==='user'?String(m.text??'').trim():cleanChatBubbleText(m.text)).join(' ');
    const recalled=retrieveRelevantMemories(p.id,c.id,querySeed,workingIds,4,1200);
    const relSummary=relationshipBaselineSummary(p.id,c.id,p.name);
    const interestsStr=(p.interests||[]).join('、')||'未填写';
    const intentStr=p.intent||'未填写';
    const curSurv=getCurrentSurveillanceSlot(p,c);
    const meetingLoc=relation(p.id,c.id)?.meeting_location||curSurv?.location||'约定的街角咖啡馆';
    let sys='你正在扮演一个真实存在于其原作时间线中的虚构角色。不得跳出角色解释自己是语言模型。记忆严格按当前角色 ID 与当前聊天对象隔离，绝不混入其他人物或其他 Profile 的经历。区分“系统已确认事实”与“对方在对话中的主观陈述”，不因对方随口一句话而篡改你的原作设定。\n';
    sys+=`【第一层 · 身份记忆 (Identity Memory)】\n你的身份：${c.name}（角色ID：${c.id}）。来源：${c.source}。时期：${c.version}。已收录背景：${c.canon}。\n当前互动对象 Profile：${p.name}，${p.age}岁，性别${p.gender}，交友目的：${intentStr}，兴趣爱好：${interestsStr}；公开简介：${p.bio}。`;
    if(p.role_character_id&&byId.has(p.role_character_id)){const x=byId.get(p.role_character_id);sys+=`\n对方扮演的原作人物：${x.name}（${x.source} ${x.version}），${x.canon}。`}
    else if(p.role_hint)sys+=`\n对方提供的身份说明（未验证）：${p.role_hint.slice(0,240)}`;
    sys+=`\n\n【第二层 · 关系记忆基线 (Relationship Memory)】\n${relSummary}`;
    if(mode==='meeting'){
      sys+=`\n当前见面地点：「${meetingLoc}」${curSurv?`（实时状态同步：${curSurv.activity}）`:''}。`;
    }
    if(recalled.length){
      sys+=`\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n`+recalled.map(formatEpisodicEntry).join('\n');
    }else{
      sys+=`\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n（当前话题未触发额外远期档案，仅依靠下方今日活跃上下文连贯交流）`;
    }
    if(mode==='meeting'&&preChatContext.length){
      const smsLines=preChatContext.map(m=>{
        const who=m.sender==='ai'?c.name:p.name;
        const body=m.sender==='user'?String(m.text??'').trim():(cleanChatBubbleText(m.text)||'…');
        return `- [${fmtHHMM(m.created_at)||'--:--'} 手机消息] ${who}：${body.slice(0,140)}`;
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
      const tTag=fmtHHMM(m.created_at)||'--:--';
      const mLabel=m.mode==='meeting'?'线下见面':'线上短信';
      const who=m.sender==='ai'?c.name:p.name;
      timelineLines.push(`#${idx+1} ${tTag}（${mLabel}·${who}）`);
      const cleanBody=m.sender==='user'?String(m.text??''):(m.mode==='meeting'?cleanMeetingNovelText(m.text):(cleanChatBubbleText(m.text)||'…'));
      historyTurns.push({role,content:cleanBody});
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
            ?(options.latestText||`【场景开启】${p.name} 与 ${c.name} 现已在「${meetingLoc}」当面相见。请承接上方的角色设定、双方关系记忆、见面前消息脉络，并严格遵循当前已启用预设的文风、叙事与篇幅规则，描写本次见面的开场第一幕，在自然交接点停下，留给 ${p.name} 回应空间。`)
            :(options.latestText||`【继续推进】请紧接上一轮结尾的现场状态、动作与气氛，继续往下描写 ${c.name} 在「${meetingLoc}」中的反应与场景推进，不要重复上一轮已写过的内容，严格遵循当前已启用预设的文风与篇幅规则，在自然交接点收束。`)
        };
      chat.push(...priorHistory);
      const postSystemParts=postPresets.filter(x=>x.role==='system').map(x=>macros(x.content));
      postSystemParts.push(`【第四层 · 当前状态 (Current State)】当前见面地点：「${meetingLoc}」。请严格按照上方已启用的预设模块规则（含文风、视角、去油腻、连续性及正文篇幅要求）输出面对面小说正文；只决定 ${c.name} 自己与环境中合理的事，不要替 ${p.name} 说话、行动或决定心理，不要在正文开头添加任何时间或模式标签。`);
      chat.push({role:'system',content:postSystemParts.join('\n\n')});
      for(const x of postPresets){
        if(x.role!=='system')chat.push({role:x.role,content:macros(x.content)});
      }
      chat.push(finalUserTurn);
      return chat;
    }
    sys+='\n\n'+presets.filter(x=>x.role==='system').map(x=>macros(x.content)).join('\n\n');
    const chat=[{role:'system',content:sys},...presets.filter(x=>x.role!=='system').map(x=>({role:x.role,content:macros(x.content)})),...historyTurns];
    let batchHint='';
    if(mode==='chat'&&Array.isArray(pendingIds)&&pendingIds.length>1){
      const bundledRows=pendingIds.map(id=>db.messages.find(x=>x.id===id)).filter(Boolean);
      if(bundledRows.length>1){
        const timelineStr=bundledRows.map(x=>`${fmtHHMM(x.created_at)}「${(x.sender==='user'?String(x.text??'').trim():cleanChatBubbleText(x.text)).slice(0,60)}」`).join(' -> ');
        batchHint=`\n【打包消息时间线】你在未看手机的这段时间里，对方陆续给你发来了 ${bundledRows.length} 条消息（按发送时间先后：${timelineStr}）。你现在刚拿起手机把这些消息一次性读完，请结合这些消息各自的时间戳跨度与内容，像真人一样自然连贯地统一回复。`;
      }
    }
    const survHint=curSurv?`\n【此刻你的真实位置与状态（实时监控同步）】当前时间 ${fmtHHMM(Date.now())||'12:00'}，你此刻身处「${curSurv.location}」，状态：「${curSurv.activity}」（现场细节：${curSurv.scene}）。若对方问起你在哪、在做什么或提出现在见面，请严格以此真实位置与状态为准，保持世界观与地点一致。`:'';
    chat.push({role:'system',content:'【第四层 · 当前状态 (Current State)】当前必须以真实约会 App 手机聊天气泡发出回复，不写旁白，不要在正文开头添加任何时间或模式标签。像真人聊天一样时长时短：有时只发 1 条简短气泡，有时可分 2–4 条长短交替的气泡连续发出（多条气泡之间用换行符或 ||| 分隔）。'+survHint+batchHint});
    return chat;
  };
  function getApiUrl(suffix){const b=db.connection.base_url.trim().replace(/\/+$/,'');if(!/^https?:\/\//.test(b))bodyErr('API Base URL 需要以 http:// 或 https:// 开头');if(/^http:\/\//.test(b)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(b))bodyErr('远程 API 必须使用 HTTPS');return b+suffix}
  const maskApiKey=k=>{
    const s=String(k||'').trim();
    if(!s)return '';
    if(s.length<=8)return '***REDACTED***';
    return s.slice(0,4)+'***REDACTED***'+s.slice(-3);
  };
  const recordSystemLog=entry=>{
    try{
      if(logSettled&&!logState.enabled)return entry;
      const safe=safeLog(entry);
      if(!logSettled)logPending=boundedLogs([safe,...logPending]);
      else{logState.logs=boundedLogs([safe,...logState.logs]);void persistLogState();}
    }catch{}
    return entry;
  };
  async function llm(messages,options={}){
    const s=db.connection;if(!s.base_url||!s.api_key||!s.model)bodyErr('还没有配置可用的 API 地址、密钥及模型');
    const reqMaxTokens=Number(options.max_tokens||s.max_tokens||4096);
    const payload={model:s.model,messages,temperature:s.temperature,top_p:s.top_p,max_tokens:reqMaxTokens};
    if(options.json_mode)payload.response_format={type:'json_object'};
    const mode=options.mode|| (options.json_mode?'json':'chat');
    const pObj=options.profile||null;
    const cObj=options.character||null;
    const entryPoint=options.entry_point||mode;
    const presetMode=(mode==='meeting'||mode==='chat')?mode:null;
    const modePresets=presetMode?(db.presets||[]).filter(x=>x.mode===presetMode).sort((a,b)=>a.sort_order-b.sort_order):[];
    const enabledPresets=modePresets.filter(x=>x.enabled);
    const disabledPresets=modePresets.filter(x=>!x.enabled);
    const activePresetsSummary=enabledPresets.map((x,idx)=>({
      order:idx+1,
      id:x.id,
      source_id:x.source_id||'',
      name:x.name,
      group:inferPresetGroup(x),
      role:x.role,
      sort_order:x.sort_order,
      chars:String(x.content||'').length,
      char_count:String(x.content||'').length
    }));
    const endpoint=getApiUrl('/chat/completions');
    const startedMs=Date.now();
    const logBase={
      id:'log_'+uid(),
      created_at:stamp(),
      profile_id:pObj?.id||'',
      profile_name:pObj?.name||'',
      character_id:cObj?.id||'',
      character_name:cObj?.name||'',
      mode,
      entry_point:entryPoint,
      model:s.model,
      endpoint,
      headers_masked:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+maskApiKey(s.api_key)
      },
      sampling:{
        temperature:s.temperature,
        top_p:s.top_p,
        max_tokens:reqMaxTokens
      },
      active_preset_count:enabledPresets.length,
      disabled_preset_count:disabledPresets.length,
      active_presets:activePresetsSummary,
      disabled_presets:disabledPresets.map(x=>({id:x.id,name:x.name,group:inferPresetGroup(x),role:x.role})),
      request_payload:JSON.parse(JSON.stringify(payload))
    };
    let res;
    try{
      res=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.api_key},body:JSON.stringify(payload)});
    }catch(e){
      const errMsg='浏览器无法直连模型（可能是 API 不允许跨域 CORS）。可改用随项目提供的 Python 本地服务器版。';
      recordSystemLog({
        ...logBase,
        status:'error',
        http_status:0,
        duration_ms:Date.now()-startedMs,
        error:errMsg+' ('+String(e?.message||e)+')',
        raw_response:null,
        raw_content:'',
        reasoning_content:'',
        parsed_content:'',
        char_count_raw:0,
        char_count_parsed:0,
        finish_reason:'network_error',
        usage:null,
        truncation_warning:''
      });
      bodyErr(errMsg);
    }
    if(!res.ok){
      let errBody='';
      try{errBody=await res.text();}catch(e){}
      const errMsg='模型接口错误 HTTP '+res.status;
      recordSystemLog({
        ...logBase,
        status:'error',
        http_status:res.status,
        duration_ms:Date.now()-startedMs,
        error:errMsg+(errBody?`: ${errBody.slice(0,500)}`:''),
        raw_response:errBody?errBody.slice(0,2000):null,
        raw_content:'',
        reasoning_content:'',
        parsed_content:'',
        char_count_raw:0,
        char_count_parsed:0,
        finish_reason:'http_'+res.status,
        usage:null,
        truncation_warning:''
      });
      bodyErr(errMsg);
    }
    const data=await res.json();
    const choice=(data?.choices||[])[0]||{};
    const msgObj=choice.message||{};
    let result=msgObj.content;
    if(Array.isArray(result))result=result.map(x=>x.text||'').join('');
    const reasoningRaw=[msgObj.reasoning_content,msgObj.reasoning,choice.reasoning].find(x=>typeof x==='string'&&x.length)||'';
    const finishReason=choice.finish_reason||data?.finish_reason||null;
    const usageRaw=data?.usage||null;
    const reasoningTokens=usageRaw?.completion_tokens_details?.reasoning_tokens??usageRaw?.reasoning_tokens??null;
    const usage=usageRaw?{
      prompt_tokens:usageRaw.prompt_tokens??null,
      completion_tokens:usageRaw.completion_tokens??null,
      total_tokens:usageRaw.total_tokens??null,
      reasoning_tokens:reasoningTokens
    }:null;
    if(typeof result!=='string'||!result.trim()){
      const emptyReason=finishReason==='length'
        ?'模型因达到 max_tokens 长度上限而被截断（可能是思维链/推理消耗了全部 max_tokens 预算，建议调大 Max tokens 至 4096–8192）'
        :'模型未返回可用文本';
      recordSystemLog({
        ...logBase,
        status:'error',
        http_status:res.status,
        duration_ms:Date.now()-startedMs,
        error:emptyReason,
        raw_response:data,
        raw_content:typeof result==='string'?result:'',
        reasoning_content:reasoningRaw,
        parsed_content:'',
        char_count_raw:typeof result==='string'?result.length:0,
        char_count_parsed:0,
        finish_reason:finishReason,
        usage,
        truncation_warning:finishReason==='length'?'finish_reason=length：输出因达到 max_tokens 上限被截断':''
      });
      bodyErr(emptyReason);
    }
    const rawTrimmed=result.trim();
    const parsedPreview=mode==='meeting'
      ?cleanMeetingNovelText(rawTrimmed)
      :(mode==='chat'?splitChatBubbles(rawTrimmed).join('\n'):rawTrimmed);
    const truncWarnings=[];
    const invalidChat=mode==='chat'&&!parsedPreview.trim();
    if(invalidChat)truncWarnings.push('模型仅返回了分隔符或旁白占位符，没有可显示的短信正文。');
    if(finishReason==='length'){
      truncWarnings.push('模型返回 finish_reason="length"，说明正文因达到 max_tokens 上限而被中途截断，建议在「终端 -> 连接与模型」调大 Max tokens。');
    }
    if(reasoningTokens&&reqMaxTokens&&(!Number.isFinite(usage?.completion_tokens)||reasoningTokens<=usage.completion_tokens)&&(reasoningTokens/reqMaxTokens)>0.6){
      truncWarnings.push(`推理/思维链消耗了 ${reasoningTokens} tokens（占 max_tokens ${reqMaxTokens} 的 ${Math.round(reasoningTokens*100/reqMaxTokens)}%），可能导致正文字数被压缩。`);
    }
    if(usage&&Number.isFinite(usage.reasoning_tokens)&&Number.isFinite(usage.completion_tokens)&&usage.reasoning_tokens>usage.completion_tokens){
      truncWarnings.push('供应商返回的 reasoning_tokens 大于 completion_tokens，统计口径可能不一致；请查看原始 usage。');
    }
    if(mode==='meeting'&&finishReason!=='length'&&parsedPreview.length<rawTrimmed.length&&parsedPreview.replace(/\s/g,'')!==rawTrimmed.replace(/\s/g,'')){
      truncWarnings.push('原始内容与解析正文存在非空白差异，请对照两者；不代表模型被截断。');
    }
    recordSystemLog({
      ...logBase,
      status:invalidChat?'error':'success',
      http_status:res.status,
      duration_ms:Date.now()-startedMs,
      error:invalidChat?'模型没有返回有效短信正文，请重试。':'',
      raw_response:data,
      raw_content:rawTrimmed,
      reasoning_content:reasoningRaw,
      parsed_content:parsedPreview,
      char_count_raw:rawTrimmed.length,
      char_count_parsed:parsedPreview.length,
      finish_reason:finishReason,
      usage,
      truncation_warning:truncWarnings.join(' ')
    });
    if(invalidChat)bodyErr('模型没有返回有效短信正文，请重试。');
    return rawTrimmed;
  }
  async function generateBios(selected,forceRefresh=false){
    if(pub().mode!=='live')return 'catalog-demo';
    const pending=forceRefresh?selected:selected.filter(c=>!db.bios[c.id]);
    if(!pending.length)return 'cached-ai-bios';
    const compact=pending.map(c=>({id:c.id,name:c.name,source:c.source,version:c.version,canon:c.canon,current_bio:db.bios[c.id]||c.bio,tags:c.tags}));
    const rules='根据给定的、已收录的原作人物身份，为他们各写一条符合当下性格与心境的约会软件公开档案（包含一句自然独特的个人简介 bio，以及 2–3 个个性标签 tags）。不得编造新的角色、错误时间线或伪造重要原作事实；若是刷新，请换一个贴合人设的新角度描写。每条中文 bio 不超过80字，真实自然。只输出 JSON 对象，形如 {"profiles":[{"id":"exact-id","bio":"...","tags":["标签1","标签2"]}]}，只用输入中的ID。';
    try{
      const out=await llm([{role:'system',content:rules},{role:'user',content:JSON.stringify(compact)}],{json_mode:true,max_tokens:950,mode:'bio',entry_point:'discover_bios'});
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
  async function produceReply(p,c,mode,userMsg=null,entryPoint=''){
    const curMode=pub().mode;
    if(curMode==='normal'){
      return {reply:null,replies:[],warning:'当前处于正常模式且尚未连接 API，请先在「终端」配置 API 后再试。'};
    }
    const ep=entryPoint||(mode==='meeting'?(userMsg?'meeting_message':'meeting_continue'):(userMsg?'chat_message':'chat_continue'));
    let engine='demo',warning='',txt;
    if(curMode==='live'){
      try{
        const compiled=prompt(p,c,mode,[],{entry_point:ep,latestText:userMsg?.text||''});
        txt=await llm(compiled,{profile:p,character:c,mode,entry_point:ep});
        engine='live';
      }catch(e){
        warning=String(e.message||e);
        if(mode==='chat')return {reply:null,replies:[],warning};
        txt='（模型连接失败，历史已保存。请检查终端设置，再尝试角色回复。）';
        engine='error';
      }
    }
    else txt=demo(p,c,mode);
    const bubbleTexts=engine==='error'?[txt]:(mode==='chat'?splitChatBubbles(txt):[cleanMeetingNovelText(txt)]);
    const replies=bubbleTexts.map(bTxt=>write(p.id,c.id,'ai',mode,bTxt,engine));
    const reply=replies[replies.length-1]||null;
    if(engine!=='error'&&reply){
      const combinedTxt=bubbleTexts.join(' / ');
      event(p.id,c.id,'ai_message',c.name+' 回应 '+p.name+'：'+combinedTxt.slice(0,180));
      const uList=userMsg?[userMsg]:messagesOf(p.id,c.id).filter(m=>m.sender==='user').slice(-1);
      recordDialogueEpisode(p,c,uList,{...reply,text:combinedTxt},mode);
      if(mode==='chat')syncSurveillanceFromChat(p,c,uList,combinedTxt);
    }
    return {reply,replies,warning};
  }
  async function matchDecision(p,c,attempt){if(pub().mode==='live'){try{const interestsStr=(p.interests||[]).join('、')||'未填写',intentStr=p.intent||'未填写';const text=await llm([{role:'system',content:`你是 ${c.name}（${c.source} ${c.version}）。原作身份：${c.canon}。对方 ${p.name}，${p.age}岁，交友目的：${intentStr}，兴趣爱好：${interestsStr}，简介 ${p.bio}。你有自己的择偶标准，可自由决定是否右滑同意匹配。只输出 JSON 对象 {"match":true/false}。`},{role:'user',content:'你是否想匹配？'}],{json_mode:true,max_tokens:70,profile:p,character:c,mode:'match',entry_point:'match_decision'});return {matched:!!JSON.parse(text).match,engine:'live'}}catch(e){/* fallback */}}
    let h=Math.imul(attempt,2654435761)|0;for(const ch of p.id+c.id+String(attempt))h=(Math.imul(31,h)+ch.charCodeAt(0))|0;return {matched:attempt>=4||((h>>>0)%100<72),engine:pub().mode==='live'?'live':'demo'};
  }
  async function firstMessage(p,c,again){
    const curMode=pub().mode;
    if(curMode==='normal'){
      return {bubbles:[],engine:'normal-pending'};
    }
    if(curMode==='live'){
      try{
        const ms=prompt(p,c,'chat',[],{entry_point:'chat_first_message'});
        ms.push({role:'user',content:again?`【系统事件：重逢匹配】你刚刚和 ${p.name} 重新匹配上了，你记得你们之前的经历。请根据你的性格与过往记忆，主动发 1～2 条有真实重逢感的手机开场消息（多条气泡之间用 ||| 分隔，绝不要用生硬套话）。`:`【系统事件：首次匹配】你刚刚在约会软件上与 ${p.name} 互相右滑匹配成功。请结合你的原作性格、所处境遇以及对方的公开资料（简介：${p.bio||'无'}；兴趣：${(p.interests||[]).join('、')||'无'}），主动给对方发 1～2 条自然、有个人特色的第一条手机消息（多条气泡之间用 ||| 分隔，绝对不要说“看来我们匹配上了”这种千篇一律的套话）。`});
        const raw=await llm(ms,{max_tokens:220,profile:p,character:c,mode:'chat',entry_point:'chat_first_message'});
        return {bubbles:splitChatBubbles(raw),engine:'live'};
      }catch(e){return {bubbles:[],engine:'error',warning:String(e.message||e)}}
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
        const ms=prompt(p,c,'chat',[],{entry_point:'chat_proactive'});
        const memHint=unresolvedMem?`你翻看手机时，想起你们之前未聊完的话题或约定：「${unresolvedMem.summary}」。`:'你在自己的世界里刚忙完手头的事，或者偶然看到某样东西，突然想起了对方。';
        ms.push({role:'user',content:`【系统事件：角色主动发消息（${reason==='promise'?'记得约定与未完话题':'日常主动破冰'}）】距离你们上次联系已经过了一段时间，${p.name} 还没有发来新消息。${memHint}请以完全符合 ${c.name} 原作性格与当前关系状态的方式，主动给 ${p.name} 发 1～2 条自然的手机消息（多条气泡用 ||| 分隔，不要写旁白，不要像客服问候）。`});
        txt=await llm(ms,{max_tokens:220,profile:p,character:c,mode:'chat',entry_point:'chat_proactive'});
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
        if(s.max_tokens)s.max_tokens=Math.max(100,Math.min(32768,Math.round(s.max_tokens)));
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
        let greetingReplies=[],greetingWarning='';
        if(matched){
          event(p.id,c.id,'matched',p.name+(again?' 重新匹配':' 首次匹配'));
          const first=await firstMessage(p,c,again);
          greetingWarning=first.warning||'';
          if(first.bubbles&&first.bubbles.length){
            greetingReplies=first.bubbles.map(bTxt=>write(p.id,c.id,'ai','chat',bTxt,first.engine));
            const lastG=greetingReplies[greetingReplies.length-1];
            if(lastG)recordDialogueEpisode(p,c,[],{...lastG,text:first.bubbles.join(' / ')},'chat');
          }
        }
        save();return {direction:d,matched,engine,character:char(c),again,replies:greetingReplies,warning:greetingWarning};
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
        const p=getP(params.get('profileId'));return {threads:Object.values(db.relations).filter(r=>r.profile_id===p.id&&r.status==='matched'&&byId.has(r.character_id)).sort((a,b)=>b.updated_at.localeCompare(a.updated_at)).map(r=>({character:char(getC(r.character_id),p.id),relation:r,last:messagesOf(p.id,r.character_id).filter(m=>!isChatArtifact(m)).at(-1)||null,last_incoming:messagesOf(p.id,r.character_id).filter(m=>m.sender==='ai'&&m.engine!=='error'&&m.engine!=='recalled'&&!m.recalled&&!isChatArtifact(m)).at(-1)||null,queue:queueInfo(p.id,r.character_id)}))};
      }
      case '/thread':{
        const p=getP(params.get('profileId')),c=getC(params.get('characterId')),r=requireMatch(p.id,c.id);
        ensureMeetingRecords(p,c);
        getOrInitSurveillance(p,c);
        const diaryPayload=buildDiaryPayload(p,c);
        const meetings=(db.meetings||[]).filter(x=>x.profile_id===p.id&&x.character_id===c.id);
        save();
        return {character:char(c,p.id),profile:p,relation:r,messages:messagesOf(p.id,c.id),meetings,queue:queueInfo(p.id,c.id),surveillance:buildSurveillancePayload(p,c),diarySummary:{latestDate:diaryPayload.latestDate,availableDates:diaryPayload.availableDates,latestTitle:diaryPayload.diary?.title||''}};
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
        if(act==='affinity'){
          const r=requireMatch(p.id,c.id);
          r.affection_boost=(Number(r.affection_boost)||0)+(Number(data.delta)||0);
          r.updated_at=stamp();
          save();
          return {ok:true,affection_boost:r.affection_boost,intimacy:computeIntimacyInfo(p,c)};
        }
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
            const inferredLoc=inferMeetingLocation(p.id,c.id,locInput);
            r.mode='meeting';
            r.active_meeting_id='meet_'+uid();
            r.meeting_location=inferredLoc;
            r.meeting_started_at=stamp();
            r.updated_at=stamp();
            syncSurveillanceOnMeetingStart(p,c,r.meeting_location,r.active_meeting_id);
            event(p.id,c.id,'meeting','与 '+p.name+' 开始面对面见面');
            if(data.triggerOpening===true&&pub().mode!=='normal'){
              const res=await produceReply(p,c,'meeting',null,'meeting_opening');
              openingReply=res.reply;
              warning=res.warning||'';
              const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
              meetingRecord=upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location);
            }
          }else{
            const activeMid=r.active_meeting_id||'';
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
              let aiSum='',aiLoc=locInput||r.meeting_location||'';
              if(data.finalizeMeeting===true&&pub().mode==='live'){
                try{
                  const transcript=mMsgs.slice(-10).map(x=>`${x.sender==='user'?p.name:c.name}：${x.text.slice(0,180)}`).join('\n');
                  const sumJson=await llm([
                    {role:'system',content:`请根据以下 ${c.name} 与 ${p.name} 的见面互动记录，提取见面地点与一句温暖简练的见面梗概（如：和${p.name}在街角咖啡馆见面，聊了近况并度过了安静的傍晚）。只输出 JSON 对象：{"location":"地点（不超过12字）","summary":"见面梗概（不超过65字）"}`},
                    {role:'user',content:transcript}
                  ],{json_mode:true,max_tokens:160,profile:p,character:c,mode:'meeting_summary',entry_point:'meeting_finalize'});
                  const parsed=JSON.parse(sumJson);
                  if(parsed.location&&!locInput)aiLoc=String(parsed.location).trim().slice(0,32);
                  if(parsed.summary)aiSum=String(parsed.summary).trim().slice(0,150);
                }catch(e){}
              }
              meetingRecord=upsertMeetingRecord(p,c,mid,mMsgs,aiLoc,aiSum);
              if(meetingRecord)syncSurveillanceOnMeetingEnd(p,c,meetingRecord);
            }
            r.mode='chat';
            r.active_meeting_id='';
            r.updated_at=stamp();
            event(p.id,c.id,'return','与 '+p.name+' 返回手机聊天');
          }
        }else if(m==='meeting'&&r.active_meeting_id){
          if(locInput)syncSurveillanceOnMeetingStart(p,c,r.meeting_location,r.active_meeting_id);
          const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
          if(mMsgs.length)meetingRecord=upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location||'');
        }
        save();
        return {mode:m,meetingId:r.active_meeting_id||'',active_meeting_id:r.active_meeting_id||'',location:r.meeting_location||'',meeting_location:r.meeting_location||'',meetingRecord,openingReply,warning,surveillance:buildSurveillancePayload(p,c)};
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
        const ep=route==='/message'?(mode==='meeting'?'meeting_message':'chat_message'):(mode==='meeting'?'meeting_continue':'chat_continue');
        const response=await produceReply(p,c,mode,user,ep);
        if(mode==='meeting'&&r.active_meeting_id){
          const mMsgs=messagesOf(p.id,c.id).filter(x=>x.mode==='meeting'&&x.meeting_id===r.active_meeting_id);
          if(mMsgs.length)upsertMeetingRecord(p,c,r.active_meeting_id,mMsgs,r.meeting_location||'');
        }
        r.updated_at=stamp();save();return {user,reply:response.reply,replies:response.replies||[],auto_meeting:false,mode,warning:response.warning};
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
          description=(await llm([{role:'system',content:instructions},{role:'user',content:'描述这张照片。'}],{max_tokens:350,character:c,mode:'photo',entry_point:'photo_description'})).slice(0,1200);engine='live-text';
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
    cleanMeetingNovelText,
    splitChatBubbles,
    sanitizeStoredData,
    diagnosePresets,
    getSystemLogs:()=>logState.logs.slice(),
    buildPromptPreview:(pid,cid,mode='chat',opts={})=>prompt(getP(pid),getC(cid),mode,[],opts),
    get storageAvailable(){return storageAvailable},
    exportData:()=>{const copy=JSON.parse(JSON.stringify(db));copy.connection.api_key='';copy.connection.image_api_key='';delete copy.systemLogs;return JSON.stringify({format:'parallel-portable-backup',schemaVersion:1,createdAt:stamp(),data:copy},null,2)},
    importData:(raw)=>{
      if(typeof raw!=='string'||raw.length>20*1024*1024)bodyErr('备份体积过大');
      let pack;try{pack=JSON.parse(raw)}catch{bodyErr('不是有效 JSON 文件')}
      if(pack.format!=='parallel-portable-backup'||pack.schemaVersion!==1||!pack.data)bodyErr('这不是 Parallel 单 HTML 版的备份');
      const loaded=pack.data;
      if(!Array.isArray(loaded.profiles)||!Array.isArray(loaded.messages)||!Array.isArray(loaded.events)||!Array.isArray(loaded.presets)||!loaded.connection||typeof loaded.relations!=='object'||!loaded.swipes||typeof loaded.swipes!=='object')bodyErr('备份数据缺少必要字段');
      loaded.connection.api_key='';
      loaded.connection.image_api_key='';
      delete loaded.systemLogs;
      ensureDbFields(loaded);
      const previous=db;
      db=loaded;try{save();}catch(e){db=previous;throw e;}return {profiles:db.profiles.length,messages:db.messages.length};
    }
  };
})();
