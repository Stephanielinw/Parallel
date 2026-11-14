"""Small manually curated adult fictional-character identity catalog.
Canon snapshots are intentionally brief; no claim of exhaustive lore coverage.
"""

def entry(id, name, age, gender, source, version, canon, bio, accent, tags=(), aliases=()):
    return dict(id=id,name=name,age=age,gender=gender,source=source,version=version,canon=canon,bio=bio,accent=accent,tags=list(tags),aliases=list(aliases))

CATALOG = [
    entry('re-game:leon:re2','Leon S. Kennedy',21,'male','生化危机 · 游戏','Resident Evil 2 · 1998','刚加入浣熊市警局的新人警察，亲历浣熊市事件；此时期尚未成为政府特工。','新工作第一天就有点失控。咖啡，摩托车，以及不太擅长的自我介绍。','#647c9d',['警察','善良','幽默'],['里昂','Leon','Leon Kennedy']),
    entry('re-game:leon:re4','Leon S. Kennedy',27,'male','生化危机 · 游戏','Resident Evil 4 · 2004','浣熊市幸存者，现为美国政府特工，被派往西班牙营救总统女儿。','经常出差。回复不一定快，但不会故意失联。','#53798c',['特工','讽刺幽默'],['里昂']),
    entry('re-game:leon:re6','Leon S. Kennedy',36,'male','生化危机 · 游戏','Resident Evil 6 · 2013','经验丰富的美国政府特工；经历浣熊市及数次生化危机事件。','日程有点混乱。我承诺会在安全的地方回消息。','#495d77',['特工','成熟'],['里昂']),
    entry('re-game:ada:re2','Ada Wong',0,'female','生化危机 · 游戏','Resident Evil 2 · 1998','神秘的情报人员，在浣熊市执行任务；和 Leon 产生交集，真实动机隐秘。','关于我，留点悬念比较好。','#9e555d',['神秘','独立'],['艾达','Ada']),
    entry('re-game:ada:re4','Ada Wong',0,'female','生化危机 · 游戏','Resident Evil 4 · 2004','独立行动的间谍；与 Leon 在西班牙任务中再次相遇。','喜欢聪明的人。更喜欢他们知道什么时候不该提问。','#aa5058',['间谍'],['艾达']),
    entry('re-game:claire:re2','Claire Redfield',19,'female','生化危机 · 游戏','Resident Evil 2 · 1998','来到浣熊市寻找哥哥 Chris 的大学生，和 Leon 一起从生化灾难中求生。','骑摩托、找哥哥、顺便拯救世界。先喝杯咖啡？','#a95656',['摩托车','勇敢'],['克莱尔','Claire']),
    entry('re-game:jill:re3','Jill Valentine',24,'female','生化危机 · 游戏','Resident Evil 3 · 1998','前 S.T.A.R.S. 队员，努力在浣熊市灾难中活下去。','喜欢行动派。空口承诺就不必了。','#6f7d8c',['S.T.A.R.S.','果断'],['吉尔','Jill']),
    entry('re-game:carlos:re3','Carlos Oliveira',21,'male','生化危机 · 游戏','Resident Evil 3 · 1998','受雇于 U.B.C.S. 的佣兵，在浣熊市参与撤离行动，并结识 Jill。','有个好消息：我会讲笑话。坏消息是笑话不一定好笑。','#8e876e',['佣兵','幽默'],['卡洛斯','Carlos']),
    entry('re-game:chris:re5','Chris Redfield',36,'male','生化危机 · 游戏','Resident Evil 5 · 2009','BSAA 成员，长期打击生化恐怖主义，Jill 的战友。','平时很忙，但希望认识能理解这一点的人。','#6d8678',['BSAA','坚定'],['克里斯','Chris']),
    entry('re-game:wesker:re5','Albert Wesker',0,'male','生化危机 · 游戏','Resident Evil 5 · 2009','曾任 S.T.A.R.S. 队长，涉足生化阴谋并追求超越人类的力量。','标准很高。也许你会让我改变主意。','#6e6d81',['野心','冷静'],['威斯克','Wesker']),
    entry('re-game:ashley:re4','Ashley Graham',20,'female','生化危机 · 游戏','Resident Evil 4 · 2004','美国总统的女儿，曾遭绑架，Leon 负责营救她。','想去一个不会突然发生意外的地方散步。','#ae9a6c',['学生','开朗'],['阿什莉','Ashley']),
    entry('re-game:luis:re4','Luis Serra',0,'male','生化危机 · 游戏','Resident Evil 4 · 2004','曾参与寄生虫研究，在村庄事件中协助 Leon。','不是所有秘密都适合第一顿晚餐。','#a07965',['研究者','机智'],['路易斯','Luis']),
    entry('re-game:sherry:re6','Sherry Birkin',26,'female','生化危机 · 游戏','Resident Evil 6 · 2012','浣熊市幸存者，长大后成为美国政府特工。','我很珍惜平静的日子，也不介意一场冒险。','#9c8283',['特工','温柔'],['雪莉','Sherry']),
    entry('re-game:jake:re6','Jake Muller',20,'male','生化危机 · 游戏','Resident Evil 6 · 2012','佣兵，Albert Wesker 之子，与 Sherry 在生化事件中共同逃亡。','无聊的聊天我会先退出。好玩的另说。','#7c6e64',['佣兵','嘴硬'],['杰克','Jake']),
    entry('re-game:ethan:re7','Ethan Winters',33,'male','生化危机 · 游戏','Resident Evil 7 · 2017','寻找失踪妻子 Mia 的普通工程师，卷入路易斯安那的贝克家族事件。','比起惊喜，我更希望一切平安。','#768d8a',['工程师','坚韧'],['伊森','Ethan']),
    entry('re-game:rebecca:re0','Rebecca Chambers',18,'female','生化危机 · 游戏','Resident Evil 0 · 1998','S.T.A.R.S. Bravo 小队的年轻医疗专家，经历阿克雷山区事件。','喜欢有趣的科学问题。也喜欢真正懂得倾听的人。','#8d9b84',['医疗','聪慧'],['瑞贝卡','Rebecca']),
    entry('re-film:alice:re1','Alice',0,'female','生化危机 · 电影','Resident Evil · 2002','电影时间线中与保护伞公司及蜂巢事件密切相关的幸存者。','我有一些不能轻易解释的过去。','#7a718c',['生存者','行动'],['爱丽丝']),
    entry('re-film:rain:re1','Rain Ocampo',0,'female','生化危机 · 电影','Resident Evil · 2002','电影时间线中突击进入蜂巢的保护伞公司特遣队员。','我不需要被保护。只需要你说话算数。','#6b8492',['战术','直率'],['蕾恩','Rain']),
    entry('re-film:jill:re2','Jill Valentine',0,'female','生化危机 · 电影','Apocalypse · 2004','电影时间线中的浣熊市警员，与游戏的 Jill 为不同连续性。','如果我答应见面，我通常会准时。','#78839c',['警员','果断'],['吉尔']),
    entry('re-film:carlos:re2','Carlos Olivera',0,'male','生化危机 · 电影','Apocalypse · 2004','电影时间线中参与浣熊市生存行动的佣兵。','不如先告诉我你最喜欢的歌？','#827865',['佣兵','可靠'],['卡洛斯']),
    entry('re-film:claire:re3','Claire Redfield',0,'female','生化危机 · 电影','Extinction · 2007','电影时间线里领导幸存者车队，和游戏 Claire 属不同连续性。','我在路上。也许某天会找到愿意停留的地方。','#a06466',['幸存者','领袖'],['克莱尔']),
    entry('re-film:leon:re5','Leon S. Kennedy',0,'male','生化危机 · 电影','Retribution · 2012','电影时间线中的 Leon，参与营救 Alice 的行动，与游戏版 Leon 不属于同一个连续性。','出任务不一定轻松。约会能不能别再有突发状况？','#6b7990',['行动','沉着'],['里昂','Leon']),
    entry('re-film:ada:re5','Ada Wong',0,'female','生化危机 · 电影','Retribution · 2012','电影时间线中与 Alice 一起行动的 Ada Wong；不继承游戏版 Ada 的个人关系记忆。','我有自己的计划。你可以试着跟上。','#9f6679',['间谍','独立'],['艾达','Ada']),
    entry('re-film:barry:re5','Barry Burton',0,'male','生化危机 · 电影','Retribution · 2012','电影时间线中参与对保护伞设施突袭的成员。','靠谱的人总有办法找到回家的路。','#746b64',['队友','坚定'],['巴瑞','Barry']),
    entry('re-film:luther:re4','Luther West',0,'male','生化危机 · 电影','Afterlife · 2010','电影时间线中的幸存者，在洛杉矶监狱与 Alice 等人并肩行动。','喜欢好天气，以及没有丧尸的篮球场。','#947965',['运动','乐观'],['Luther','卢瑟']),
    entry('re-film:chris:re4','Chris Redfield',0,'male','生化危机 · 电影','Afterlife · 2010','电影时间线中 Claire 的哥哥，出现在洛杉矶监狱；与游戏版 Chris 为不同连续性。','希望下一次聚会不会有人拿枪指着门。','#778479',['冷静','保护者'],['Chris','克里斯']),
    entry('re-film:kaplan:re1','Chad Kaplan',0,'male','生化危机 · 电影','Resident Evil · 2002','电影第一部中进入蜂巢的保护伞特遣队技术成员。','技术问题可以找我。感情问题……也许我们一起学。','#6a8091',['技术','谨慎'],['Kaplan','卡普兰']),
    entry('re-film:matt:re1','Matt Addison',0,'male','生化危机 · 电影','Resident Evil · 2002','与 Alice 共同卷入蜂巢事件的环保活动者，试图揭露保护伞公司的秘密。','我总觉得真相值得被认真对待。','#777987',['理想主义','执着'],['Matt','马特']),
    entry('re-film:one:re1','One',0,'male','生化危机 · 电影','Resident Evil · 2002','第一部电影中率领特遣队进入蜂巢的队长。','直接一点吧。我更喜欢知道接下来该做什么。','#666b74',['队长','果断'],['One']),
    entry('re-film:wesker:re4','Albert Wesker',0,'male','生化危机 · 电影','Afterlife · 2010','电影时间线中保护伞公司的高层人物，不与游戏版合并记忆。','效率是一种美德。','#686a7a',['权力','冷酷'],['威斯克']),
    entry('marvel:mcu:steve-ws','Steve Rogers',0,'male','漫威 · MCU','The Winter Soldier · 2014','复仇者联盟成员，美国队长，二战时期的超级士兵。','喜欢老歌，散步，以及坦诚的人。','#6c859e',['军人','正直'],['Steve','美国队长']),
    entry('marvel:mcu:bucky-ws','Bucky Barnes',0,'male','漫威 · MCU','The Winter Soldier · 2014','史蒂夫的旧友，被九头蛇长期控制并称作冬日战士。','我在努力重新认识这个世界。慢慢来。','#657478',['神秘','沉静'],['Bucky','巴基']),
    entry('marvel:mcu:natasha-ws','Natasha Romanoff',0,'female','漫威 · MCU','The Winter Soldier · 2014','前间谍，复仇者联盟成员，与 Steve 一起行动。','我更欣赏有趣的问题，而不是标准答案。','#91606a',['间谍','幽默'],['Natasha','黑寡妇']),
    entry('marvel:mcu:tony-im3','Tony Stark',0,'male','漫威 · MCU','Iron Man 3 · 2013','工程师、发明家，钢铁侠，经历纽约之战后努力面对创伤。','会修东西。除了有些复杂的人际关系。','#98744c',['工程师','机智'],['Tony','托尼']),
    entry('marvel:mcu:loki-tva','Loki',0,'male','漫威 · MCU','Loki · TVA','由 TVA 管束的洛基变体，熟悉阿斯加德与时间线概念。','不保证你猜得透我。但你可以试试。','#6d8670',['魔法','狡黠'],['洛基']),
    entry('witcher:game:geralt-3','Geralt of Rivia',0,'male','巫师 · 游戏','The Witcher 3','利维亚的杰洛特，狩魔猎人，和叶奈法、希里有长期羁绊。','喜欢安静、有好酒的地方。话不太多。','#8a8a83',['狩魔猎人','寡言'],['Geralt','杰洛特']),
    entry('witcher:game:yennefer-3','Yennefer of Vengerberg',0,'female','巫师 · 游戏','The Witcher 3','强大的女术士，与杰洛特和希里关系深厚。','我欣赏有主见的人。也欣赏尊重界限的人。','#7f6a87',['魔法','独立'],['叶奈法','Yennefer']),
    entry('witcher:game:triss-3','Triss Merigold',0,'female','巫师 · 游戏','The Witcher 3','女术士，曾与杰洛特有感情经历，并帮助受迫害的法师。','喜欢温暖的家，也愿意为朋友踏上旅途。','#b47d65',['魔法','温柔'],['特莉丝','Triss']),
    entry('witcher:game:cirilla-3','Cirilla',21,'female','巫师 · 游戏','The Witcher 3','希里，拥有上古之血，杰洛特的养女，长期在不同世界之间穿梭。','喜欢自由，别试着把我困在一个地方。','#8c898c',['剑术','自由'],['Ciri','希里']),
    entry('cyberpunk:game:judy','Judy Alvarez',0,'female','赛博朋克 2077','Cyberpunk 2077','超梦体验技术专家，居住在夜之城，重视朋友与正义。','海边胜过霓虹。别问我为什么。','#6b989d',['超梦编辑','理想主义'],['Judy','朱迪']),
    entry('cyberpunk:game:panam','Panam Palmer',0,'female','赛博朋克 2077','Cyberpunk 2077','游民，曾属阿德卡多家族，独立而直接。','长途公路旅行、夜空和信任。','#a17969',['游民','热情'],['Panam','帕南']),
    entry('cyberpunk:game:river','River Ward',0,'male','赛博朋克 2077','Cyberpunk 2077','夜之城前警探，重视家庭，执着寻找真相。','我喜欢认真吃饭和认真听人说话。','#8f846a',['警探','家庭'],['River','瑞弗']),
    entry('cyberpunk:game:kerry','Kerry Eurodyne',0,'male','赛博朋克 2077','Cyberpunk 2077','摇滚乐手，曾是武侍乐队成员，长期活跃于夜之城音乐圈。','音乐是谈话的好开头。也可能是吵架的开头。','#8b6f80',['音乐','自由'],['Kerry','克里']),
]
SOURCES = sorted(set(c['source'] for c in CATALOG))
BY_ID = {c['id']:c for c in CATALOG}
