#!/usr/bin/env python3
"""Parallel: local-first AI fandom dating demo. Python stdlib only.
Run: python3 server.py. Binds ONLY to 127.0.0.1.
"""
import base64, hashlib, json, os, random, re, secrets, sqlite3, sys, threading, time, traceback, urllib.error, urllib.parse, urllib.request, uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from catalog import CATALOG, BY_ID, SOURCES

ROOT = Path(__file__).resolve().parent
DATA = ROOT / 'data'; DATA.mkdir(exist_ok=True)
DBFILE = DATA / 'parallel.sqlite3'; SECRETFILE = DATA / 'connection.json'
HOST='127.0.0.1'; PORT=int(os.environ.get('PARALLEL_PORT','8765'))
CHAT_QUIET_MS=60000
CHAT_LOCK=threading.RLock()
MAX_BODY=4*1024*1024
DEFAULT_PRESETS = [
  dict(id='chat-main',mode='chat',name='手机聊天 · 自然气泡',enabled=True,role='system',content='你正在使用一款约会软件。只输出角色实际发出的消息正文。用自然、个性化、符合角色的简短聊天气泡；不写第三人称叙述、动作星号、旁白、章节或小说式环境描写。除非角色有理由，不要轻易暴露其隐秘原作身份。'),
  dict(id='chat-memory',mode='chat',name='记忆与身份边界',enabled=True,role='system',content='你是有持续人生与记忆的人。认真记住与面前这位人物的相处历史；不要因解除匹配和重新匹配而装作初次见面。不同 Profile 可能是完全不同的人，绝不先验认为他们背后是同一个使用者；玩家扮演的人物和同名 AI 人物也并非同一实例。'),
  dict(id='chat-agency',mode='chat',name='人物自主性',enabled=True,role='system',content='根据原作个性、人物边界和现有关系自然推进，不无条件迎合用户，不强制恋爱。角色可以好奇、拒绝、犹豫、打趣或提出见面。尊重对话中自然形成的经历。'),
  dict(id='meeting-main',mode='meeting',name='线下见面 · 小说模式',enabled=True,role='system',content='你和对方已在同一地点见面。写细腻的小说式现实互动，使用第三人称叙述描述环境、肢体动作、微妙情绪与角色台词。只决定你自己及环境中合理的事，不替玩家控制的角色说话、行动或决定内心感受。保持原作人设和已发生的情节。'),
  dict(id='meeting-pacing',mode='meeting',name='克制与连贯',enabled=True,role='system',content='不要一口气推进几个场景。每轮留下玩家回应空间，尊重慢节奏、非语言互动和情感张力。见面时的事件会进入同一个人与人的持续记忆，回到消息时也应该记得。'),
]

PRESET_FORMAT = 'parallel-text-preset'
PRESET_VERSION = 1

def validate_preset_package(pack):
    """Only Parallel-owned JSON format; no third-party preset conversion."""
    if isinstance(pack,dict) and pack.get('format')=='elsewhere-preset':
        if pack.get('schemaVersion')!=1 or not isinstance(pack.get('entries'),list) or not 1<=len(pack['entries'])<=200:
            raise ValueError('Elsewhere 自有预设结构无效')
        entries=[];ids=set()
        for i,x in enumerate(pack['entries']):
            if not isinstance(x,dict) or not isinstance(x.get('id'),str) or x['id'] in ids or not isinstance(x.get('name'),str) or not x['name'].strip() or not isinstance(x.get('content'),str) or len(x['content'])>60000 or x.get('role') not in ('system','user','assistant') or type(x.get('enabled')) is not bool:
                raise ValueError(f'Elsewhere 条目 {i+1} 格式无效')
            ids.add(x['id']);group=str(x.get('group','')).strip()[:70];name=x['name'].strip()
            label=((group+' / ') if group else '')+name
            entries.append({'mode':'meeting','name':label[:100],'role':x['role'],'enabled':x['enabled'],'content':x['content'],'sort_order':i})
        return ['meeting'],entries
    if not isinstance(pack,dict) or pack.get('format')!=PRESET_FORMAT or type(pack.get('schemaVersion')) is not int or pack['schemaVersion']!=PRESET_VERSION:
        raise ValueError('仅支持 Parallel 自有预设 JSON（v1），不支持第三方预设格式')
    modes=pack.get('modes');entries=pack.get('entries')
    if not isinstance(modes,list) or not 1<=len(modes)<=2 or any(x not in ('chat','meeting') for x in modes) or len(set(modes))!=len(modes):
        raise ValueError('预设的模式列表无效')
    if not isinstance(entries,list) or not 1<=len(entries)<=200:
        raise ValueError('预设应包含 1–200 个条目')
    output=[]
    for i,e in enumerate(entries):
        if not isinstance(e,dict) or set(e)!={'mode','name','role','enabled','content','sort_order'}:
            raise ValueError(f'预设条目 {i+1} 格式无效')
        if e['mode'] not in modes or e['role'] not in ('system','user','assistant'):
            raise ValueError(f'预设条目 {i+1} 角色或模式无效')
        if not isinstance(e['name'],str) or not e['name'].strip() or len(e['name'])>100:
            raise ValueError(f'预设条目 {i+1} 名称无效')
        if not isinstance(e['content'],str) or len(e['content'])>60000:
            raise ValueError(f'预设条目 {i+1} 正文过长或无效')
        if type(e['enabled']) is not bool or type(e['sort_order']) is not int or not 0<=e['sort_order']<=10000:
            raise ValueError(f'预设条目 {i+1} 启停或排序值无效')
        output.append({**e,'name':e['name'].strip()})
    if len(json.dumps(pack,ensure_ascii=False).encode('utf8'))>4*1024*1024:
        raise ValueError('预设文件超过 4 MB')
    return modes,output

class ClosingConnection(sqlite3.Connection):
    def __exit__(self, exc_type, exc, tb):
        try: return super().__exit__(exc_type, exc, tb)
        finally: self.close()

def connect():
    c=sqlite3.connect(DBFILE,timeout=8,factory=ClosingConnection); c.row_factory=sqlite3.Row; c.execute('PRAGMA foreign_keys=ON'); c.execute('PRAGMA busy_timeout=8000'); return c

def init_db():
    with connect() as db:
        db.executescript('''
        PRAGMA journal_mode=WAL;
        CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY,name TEXT NOT NULL,age INTEGER NOT NULL,gender TEXT NOT NULL,interested_in TEXT NOT NULL,min_age INTEGER NOT NULL,max_age INTEGER NOT NULL,intent TEXT NOT NULL,bio TEXT NOT NULL,interests TEXT NOT NULL,sources TEXT NOT NULL,avatar TEXT NOT NULL,role_character_id TEXT NOT NULL DEFAULT '',role_hint TEXT NOT NULL DEFAULT '',created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS swipes (profile_id TEXT NOT NULL,character_id TEXT NOT NULL,direction TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(profile_id,character_id));
        CREATE TABLE IF NOT EXISTS relations (profile_id TEXT NOT NULL,character_id TEXT NOT NULL,status TEXT NOT NULL,mode TEXT NOT NULL DEFAULT 'chat',attempts INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL,PRIMARY KEY(profile_id,character_id));
        CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,character_id TEXT NOT NULL,sender TEXT NOT NULL,mode TEXT NOT NULL,text TEXT NOT NULL,engine TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS messages_thread ON messages(profile_id,character_id,created_at);
        CREATE INDEX IF NOT EXISTS messages_character ON messages(character_id,created_at);
        CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY,profile_id TEXT NOT NULL,character_id TEXT NOT NULL,type TEXT NOT NULL,summary TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS events_character ON events(character_id,created_at);
        CREATE TABLE IF NOT EXISTS portraits (character_id TEXT PRIMARY KEY,image_uri TEXT NOT NULL,created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS character_bios (character_id TEXT PRIMARY KEY, bio TEXT NOT NULL, created_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS photo_descriptions (character_id TEXT PRIMARY KEY, description TEXT NOT NULL, engine TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS chat_queue (profile_id TEXT NOT NULL, character_id TEXT NOT NULL, pending TEXT NOT NULL DEFAULT '[]', due_at INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'idle', inflight TEXT NOT NULL DEFAULT '', inflight_sources TEXT NOT NULL DEFAULT '[]', revision INTEGER NOT NULL DEFAULT 0, blocked INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(profile_id,character_id));
        CREATE TABLE IF NOT EXISTS presets (id TEXT PRIMARY KEY, mode TEXT NOT NULL,name TEXT NOT NULL,enabled INTEGER NOT NULL,role TEXT NOT NULL,content TEXT NOT NULL,sort_order INTEGER NOT NULL);
        CREATE TABLE IF NOT EXISTS episodic_memories (id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, profile_id TEXT NOT NULL, source_type TEXT NOT NULL, source_key TEXT NOT NULL, knowledge_mode TEXT NOT NULL DEFAULT 'stated', summary TEXT NOT NULL, tags TEXT NOT NULL DEFAULT '[]', importance INTEGER NOT NULL DEFAULT 2, emotional_weight INTEGER NOT NULL DEFAULT 2, unresolved INTEGER NOT NULL DEFAULT 0, clarifies_id TEXT NOT NULL DEFAULT '', disputed INTEGER NOT NULL DEFAULT 0, raw_msg_ids TEXT NOT NULL DEFAULT '[]', event_at TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(owner_id, profile_id, source_key));
        CREATE INDEX IF NOT EXISTS episodic_owner_profile ON episodic_memories(owner_id, profile_id, event_at);
        ''')
        if db.execute('SELECT COUNT(*) FROM presets').fetchone()[0]==0:
            for i,p in enumerate(DEFAULT_PRESETS):
                db.execute('INSERT INTO presets VALUES (?,?,?,?,?,?,?)',(p['id'],p['mode'],p['name'],int(p['enabled']),p['role'],p['content'],i))
    if not SECRETFILE.exists():
        save_connection({'base_url':'','api_key':'','model':'','image_base_url':'','image_api_key':'','image_model':'','temperature':0.85,'top_p':1,'max_tokens':3000,'auto_portraits':False})

def utc(): return datetime.now(timezone.utc).isoformat(timespec='microseconds')
def uid(): return str(uuid.uuid4())
def now_ms(): return int(time.time()*1000)
def js(v): return json.dumps(v,ensure_ascii=False)
def parse_json(v,default):
    try:return json.loads(v)
    except (ValueError,TypeError):return default

def save_connection(v):
    tmp=SECRETFILE.with_suffix('.tmp'); fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_TRUNC,0o600)
    with os.fdopen(fd,'w',encoding='utf8') as f: json.dump(v,f,ensure_ascii=False)
    os.replace(tmp,SECRETFILE)
    try:os.chmod(SECRETFILE,0o600)
    except OSError:pass

def load_connection():
    try:return json.loads(SECRETFILE.read_text('utf8'))
    except Exception:return {'base_url':'','api_key':'','model':'','image_base_url':'','image_api_key':'','image_model':'','temperature':0.85,'top_p':1,'max_tokens':3000,'auto_portraits':False}

def public_connection():
    d=load_connection()
    has_img=bool(d.get('image_api_key') and d.get('image_base_url') and d.get('image_model'))
    return {k:v for k,v in d.items() if k not in ('api_key','image_api_key')} | {
        'has_key':bool(d.get('api_key')),
        'has_image_key':bool(d.get('image_api_key')),
        'mode':'live' if d.get('api_key') and d.get('base_url') and d.get('model') else 'demo',
        'image_mode':'live' if has_img else 'text'
    }

def validate_base_url(v):
    if not v:return ''
    u=urllib.parse.urlparse(v)
    if u.username or u.password or u.query or u.fragment or u.scheme not in ('http','https') or not u.hostname:raise ValueError('API 地址格式不正确')
    if u.scheme=='http' and u.hostname not in ('localhost','127.0.0.1','::1'):raise ValueError('远程 API 请使用 HTTPS；HTTP 仅允许本机服务')
    return v.rstrip('/')

def safe_id(s): return isinstance(s,str) and bool(re.fullmatch(r'[a-zA-Z0-9_:\-.]+',s))

def rowdict(r):return dict(r) if r else None

def profile_get(db,pid):
    if not isinstance(pid,str):raise ValueError('请先选择 Profile')
    x=db.execute('SELECT * FROM profiles WHERE id=?',(pid,)).fetchone()
    if x is None:raise ValueError('Profile 不存在')
    d=dict(x);d['sources']=parse_json(d['sources'],[]);d['interests']=parse_json(d['interests'],[]);d['interested_in']=parse_json(d['interested_in'],[])
    return d

def profiles_all(db):
    rows=db.execute('SELECT * FROM profiles ORDER BY created_at').fetchall()
    return [profile_get(db,r['id']) for r in rows]

def char_view(db,c):
    a=dict(c);p=db.execute('SELECT image_uri FROM portraits WHERE character_id=?',(c['id'],)).fetchone()
    a['portrait']=p['image_uri'] if p else None
    bio=db.execute('SELECT bio FROM character_bios WHERE character_id=?',(c['id'],)).fetchone()
    if bio:a['bio']=bio['bio']
    return a

def photo_description(c):
    """Stable imagined caption; no image endpoint or model is called."""
    h=int(hashlib.sha256(c['id'].encode()).hexdigest()[:8],16)
    backgrounds=['窗边的浅色日光里','傍晚路边的柔和逆光中','一处安静的街角','午后略微虚焦的室内背景前']
    gestures=['他/她略微侧过身，像是被熟人临时喊住','镜头没有抓到刻意的笑容，只有片刻松弛的神情','衣领和发梢带着一点日常的随意，目光却很清醒','镜头离得不远，能看到这个人不太习惯被拍照的神色']
    pose=gestures[(h//4)%len(gestures)].replace('他/她',c['name'])
    return f"照片里，{c['name']}出现在{backgrounds[h%len(backgrounds)]}。{pose}。画面没有摆拍的精致感，像是某次短暂停留时随手留下的一张生活照。"

def queue_view(db,pid,cid):
    x=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    if not x:return {'count':0,'dueAt':0,'remainingMs':0,'status':'idle','blocked':False}
    pending=parse_json(x['pending'],[])
    return {'count':len(pending),'dueAt':x['due_at'],'remainingMs':max(0,x['due_at']-now_ms()),'status':x['status'],'blocked':bool(x['blocked'])}

def queue_add(db,pid,cid,mid):
    x=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    pending=parse_json(x['pending'],[]) if x else []
    if mid not in pending:pending.append(mid)
    if x:db.execute('UPDATE chat_queue SET pending=?,due_at=?,blocked=0 WHERE profile_id=? AND character_id=?',(js(pending),now_ms()+CHAT_QUIET_MS,pid,cid))
    else:db.execute('INSERT INTO chat_queue(profile_id,character_id,pending,due_at) VALUES (?,?,?,?)',(pid,cid,js(pending),now_ms()+CHAT_QUIET_MS))
    return queue_view(db,pid,cid)

def queue_cancel(db,pid,cid):
    # The texts remain in message history; the next meeting reply can see them.
    db.execute("UPDATE chat_queue SET pending='[]',due_at=0,status='idle',inflight='',inflight_sources='[]',blocked=0,revision=revision+1 WHERE profile_id=? AND character_id=?",(pid,cid))

def queue_flush(db,p,c,force=False):
    pid,cid=p['id'],c['id']
    with CHAT_LOCK:
        q=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        if not q:return {'queued':False,'reply':None,'queue':queue_view(db,pid,cid)}
        if q['status']=='inflight':return {'queued':True,'inflight':True,'reply':None,'queue':queue_view(db,pid,cid)}
        pending_list=parse_json(q['pending'],[])
        if not pending_list:return {'queued':False,'reply':None,'queue':queue_view(db,pid,cid)}
        if q['blocked'] and not force:return {'queued':True,'reply':None,'queue':queue_view(db,pid,cid)}
        if not force and now_ms()<q['due_at']:return {'queued':True,'reply':None,'queue':queue_view(db,pid,cid)}
        sources=pending_list;token=uid();revision=q['revision']
        db.execute("UPDATE chat_queue SET pending='[]',due_at=0,status='inflight',inflight=?,inflight_sources=?,blocked=0 WHERE profile_id=? AND character_id=?",(token,js(sources),pid,cid))
        last=db.execute('SELECT rowid FROM messages WHERE id=?',(sources[-1],)).fetchone()
        prompt=compile_messages(db,p,c,'chat',through_rowid=last['rowid'] if last else None)
        db.commit()
    settings=load_connection();warning='';engine='demo';reply=None
    if all(settings.get(k) for k in ('base_url','api_key','model')):
        try:txt=completion(prompt);engine='live'
        except Exception as e:warning=str(e);engine='error'
    else:txt=demo_text(db,p,c,'chat')
    with CHAT_LOCK:
        current=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        rel=db.execute('SELECT mode,status FROM relations WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        if not current or current['inflight']!=token or current['revision']!=revision or not rel or rel['mode']!='chat' or rel['status']!='matched':
            return {'queued':False,'reply':None,'discarded':True,'queue':queue_view(db,pid,cid)}
        if engine=='error':
            newer=parse_json(current['pending'],[])
            restore=[m for m in sources if m not in newer]+newer
            if newer:
                db.execute("UPDATE chat_queue SET pending=?,status='idle',inflight='',inflight_sources='[]',blocked=0 WHERE profile_id=? AND character_id=?",(js(restore),pid,cid))
            else:
                db.execute("UPDATE chat_queue SET pending=?,due_at=?,status='idle',inflight='',inflight_sources='[]',blocked=1 WHERE profile_id=? AND character_id=?",(js(restore),now_ms(),pid,cid))
        else:
            reply=write_message(db,pid,cid,'ai','chat',txt,engine)
            log_event(db,pid,cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+txt[:180])
            user_rows=[]
            for mid in sources:
                ur=db.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone()
                if ur:user_rows.append(dict(ur))
            record_dialogue_episode(db,p,c,user_rows,reply,'chat')
            db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),pid,cid))
            db.execute("UPDATE chat_queue SET status='idle',inflight='',inflight_sources='[]',blocked=0 WHERE profile_id=? AND character_id=?",(pid,cid))
        db.commit()
    return {'queued':False,'reply':reply,'warning':warning,'queue':queue_view(db,pid,cid)}

def queue_flush_due(db,p):
    pid=p['id'];now=now_ms();flushed=[]
    rows=db.execute("SELECT character_id,pending,due_at,status,blocked FROM chat_queue WHERE profile_id=? AND status<>'inflight' AND blocked=0 AND due_at>0 AND due_at<=?",(pid,now)).fetchall()
    for row in rows:
        cid=row['character_id'];c=BY_ID.get(cid)
        if not c or not parse_json(row['pending'],[]):continue
        rel=db.execute("SELECT status,mode FROM relations WHERE profile_id=? AND character_id=?",(pid,cid)).fetchone()
        if not rel or rel['status']!='matched' or rel['mode']!='chat':continue
        res=queue_flush(db,p,c,force=False)
        if res.get('reply') or res.get('warning'):
            flushed.append({'characterId':cid,'characterName':c['name'],'reply':res.get('reply'),'warning':res.get('warning','')})
    return {'flushed':flushed}

def match_role(db,p,character):
    # Same canonical character *at the same version* is blocked. Never block by display name alone.
    return p.get('role_character_id') == character['id']

def source_matches(tag, character):
    """Match free-form user tags against a curated title/source without inventing canon."""
    q=' '.join(str(tag).casefold().split()).strip(' ·・-—')
    if len(q)<2:return False
    aliases={
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
        '赛博朋克':'赛博朋克 2077',
    }
    q=aliases.get(q,q)
    q=re.sub(r'^resident\s*evil\s*(\d+)$',r'生化危机\1',q)
    q=re.sub(r'^re\s*(\d+)$',r'生化危机\1',q)
    q=re.sub(r'^生化\s*(\d+)$',r'生化危机\1',q)
    q=re.sub(r'^(?:the\s*)?witcher\s*(\d+)$',r'巫师\1',q)
    q=re.sub(r'^猎魔人\s*(\d+)$',r'巫师\1',q)
    clean=lambda x:re.sub(r'[\s·・:：_.\-—]+','',x)
    cq=clean(q)
    raw_target=(character['source']+' '+character['version']).casefold()
    extra=[]
    if '生化危机' in raw_target:
        for num in re.findall(r'\b(\d{1,2})\b',character['version']):
            extra.append(f'生化危机{num} 生化{num} re{num} residentevil{num}')
    if '巫师' in raw_target:
        for num in re.findall(r'\b(\d{1,2})\b',character['version']):
            extra.append(f'巫师{num} 猎魔人{num} witcher{num} thewitcher{num}')
    if '漫威' in raw_target:
        extra.append('漫威电影 漫威电影宇宙 复仇者联盟 marvel mcu')
    if '赛博朋克' in raw_target:
        extra.append('赛博朋克2077 cyberpunk2077 2077')
    return cq in clean(raw_target+' '+' '.join(extra))

def possible_candidates(db,p):
    sources=set(p['sources']); interested=set(p['interested_in']); result=[]
    matched_ids={r['character_id'] for r in db.execute("SELECT character_id FROM relations WHERE profile_id=? AND status='matched'",(p['id'],)).fetchall()}
    for c in CATALOG:
        if c['id'] in matched_ids:continue
        if sources and not any(source_matches(x,c) for x in sources):continue
        if match_role(db,p,c):continue
        if interested and 'all' not in interested and c['gender'] not in interested:continue
        # Unknown canon ages remain eligible rather than inventing them.
        if c['age'] and not (p['min_age']<=c['age']<=p['max_age']):continue
        result.append(c)
    return result

def identify(name,source=''):
    q=re.sub(r'\s+',' ',name.casefold().strip())
    if not q:return []
    norm=lambda s:re.sub(r'[\s·・.·\-_]+','',s.casefold())
    nq=norm(q)
    alias_map={
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
        '钢铁侠':'tony stark',
    }
    mapped=norm(alias_map.get(nq,q))
    res=[]
    for c in CATALOG:
        words=[c['name']]+c['aliases']
        if any(q==a.casefold() or q in a.casefold().split() or nq==norm(a) or mapped==norm(a) or (len(nq)>=2 and nq in norm(a)) for a in words):
            if source and source not in (c['source'],c['version']) and not source_matches(source,c):continue
            res.append({k:c[k] for k in ('id','name','source','version','age','canon')})
    return res[:20]

STOPWORDS={'今天','昨天','明天','我们','你们','他们','什么','怎么','可以','觉得','知道','没有','就是','一个','还是','因为','所以','如果','已经','现在','这样','那样','哈哈','呵呵','嗯嗯','好的','好吧','不是','不要','不会','不能','自己','这里','那里','时候','地方','东西','事情','问题','真的','其实','或者','而且','然后','不过','但是','只是','虽然','一下','一点','一些','一直','一起','起来','出来','过来','进去','回去','看着','听着','说着','想着','请问','谢谢','你好','再见','晚安','早安','手机','消息','短信','见面','回应','陈述','对话','文字','对方','角色'}

def extract_query_terms(text):
    if not text:return []
    s=str(text).casefold()
    terms=[]
    seen=set()
    for w in re.findall(r'[a-z0-9]{2,}',s):
        if w not in STOPWORDS and w not in seen:
            seen.add(w);terms.append(w)
    for chunk in re.findall(r'[\u4e00-\u9fff]{2,}',s):
        if 2<=len(chunk)<=4 and chunk not in STOPWORDS and chunk not in seen:
            seen.add(chunk);terms.append(chunk)
        for i in range(len(chunk)-1):
            bg=chunk[i:i+2]
            if bg not in STOPWORDS and bg not in seen:
                seen.add(bg);terms.append(bg)
    return terms[:32]

def extract_memory_tags(text,limit=6):
    terms=extract_query_terms(text)
    prefer=[t for t in terms if len(t)>=2]
    return prefer[:limit]

def append_episodic_memory(db,*,owner_id,profile_id,source_type,source_key,knowledge_mode='stated',summary='',tags=None,importance=2,emotional_weight=2,unresolved=0,clarifies_id='',disputed=0,raw_msg_ids=None,event_at=None):
    if not owner_id or not profile_id or not summary:return None
    summary_clean=str(summary).strip()[:280]
    tags_clean=[str(t)[:24] for t in (tags if tags is not None else extract_memory_tags(summary_clean)) if t][:8]
    imp=max(1,min(5,int(importance or 2)))
    emo=max(1,min(5,int(emotional_weight or 2)))
    unres=1 if unresolved else 0
    disp=1 if disputed else 0
    raw_ids=[str(x) for x in (raw_msg_ids or []) if x][:16]
    now_str=utc()
    ev_at=event_at or now_str
    existed=db.execute('SELECT id FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_key=?',(owner_id,profile_id,source_key)).fetchone()
    mid=existed['id'] if existed else uid()
    db.execute('''INSERT OR REPLACE INTO episodic_memories
        (id,owner_id,profile_id,source_type,source_key,knowledge_mode,summary,tags,importance,emotional_weight,unresolved,clarifies_id,disputed,raw_msg_ids,event_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)''',
        (mid,owner_id,profile_id,source_type,source_key,knowledge_mode,summary_clean,js(tags_clean),imp,emo,unres,str(clarifies_id or ''),disp,js(raw_ids),ev_at,now_str))
    return mid

def record_dialogue_episode(db,p,c,user_msgs,ai_msg,mode):
    if not ai_msg:return None
    u_texts=[m['text'].strip() for m in (user_msgs or []) if m and m.get('text')]
    u_joined=' / '.join(u_texts)[:110]
    a_text=str(ai_msg.get('text','')).strip()[:110]
    mode_label='见面' if mode=='meeting' else '对话'
    if u_joined:
        summary=f"{p['name']}陈述（{mode_label}文字）：{u_joined}；{c['name']}回应：{a_text}"
    else:
        summary=f"{c['name']}（{mode_label}发言）：{a_text}"
    combined=(u_joined+' '+a_text)
    imp=3 if mode=='meeting' else 2
    if any(w in combined for w in ('喜欢','讨厌','约定','下次','周末','生日','秘密','过去','曾经','记得','答应','咖啡','酒','电影','音乐','摩托','任务','安全','伤口','家')):
        imp=min(5,imp+1)
    unres=1 if any(w in combined for w in ('？','?','下次','改天','明天见','约好','等你','还没')) else 0
    raw_ids=[m['id'] for m in (user_msgs or []) if m and m.get('id')]+[ai_msg['id']]
    return append_episodic_memory(
        db,
        owner_id=c['id'],
        profile_id=p['id'],
        source_type='dialogue',
        source_key='turn:'+ai_msg['id'],
        knowledge_mode='experienced' if mode=='meeting' else 'stated',
        summary=summary,
        tags=extract_memory_tags(u_joined or a_text,6),
        importance=imp,
        emotional_weight=3 if mode=='meeting' else 2,
        unresolved=unres,
        raw_msg_ids=raw_ids,
        event_at=ai_msg.get('created_at') or utc()
    )

CORRECTION_PATTERNS=('不，我们没有','我们没有过','没有过','你记错了','记错了','记岔了','搞错了','不是在','没去过','从来没','并没有','没有这回事','那是别人','你认错人了')

def detect_and_apply_correction(db,p,c,user_msg):
    txt=str(user_msg.get('text','')).strip()
    if not txt or not any(pat in txt for pat in CORRECTION_PATTERNS):
        return None
    pid,cid=p['id'],c['id']
    q_terms=set(extract_query_terms(txt))
    rows=db.execute("SELECT * FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_type!='correction' AND disputed=0 ORDER BY event_at DESC LIMIT 30",(cid,pid)).fetchall()
    target_id=''
    best_score=-1
    for r in rows:
        r_terms=set(extract_query_terms(r['summary']))|set(parse_json(r['tags'],[]))
        overlap=len(q_terms & r_terms)
        score=overlap*4 + (1 if r==rows[0] else 0)
        if score>best_score:
            best_score=score;target_id=r['id']
    if target_id:
        db.execute('UPDATE episodic_memories SET disputed=1,unresolved=0 WHERE id=? AND owner_id=? AND profile_id=?',(target_id,cid,pid))
    return append_episodic_memory(
        db,
        owner_id=cid,
        profile_id=pid,
        source_type='correction',
        source_key='corr:'+user_msg['id'],
        knowledge_mode='clarified',
        summary=f"{p['name']}明确澄清/纠正：{txt[:160]}（相关旧说法已标记存疑，不再作为既定事实）",
        tags=extract_memory_tags(txt,6),
        importance=5,
        emotional_weight=4,
        unresolved=0,
        clarifies_id=target_id,
        raw_msg_ids=[user_msg['id']],
        event_at=user_msg.get('created_at') or utc()
    )

def ensure_daily_summaries(db,p,c,active_msg_ids):
    pid,cid=p['id'],c['id']
    all_msgs=db.execute('SELECT id,sender,mode,text,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at,id',(pid,cid)).fetchall()
    if not all_msgs:return
    today_str=utc()[:10]
    by_day={}
    for m in all_msgs:
        if m['id'] in active_msg_ids:continue
        day=str(m['created_at'])[:10]
        if len(all_msgs)<=8 and day==today_str:continue
        by_day.setdefault(day,[]).append(dict(m))
    for day,day_msgs in by_day.items():
        if len(day_msgs)<2:continue
        chat_n=sum(1 for m in day_msgs if m['mode']=='chat')
        meet_n=sum(1 for m in day_msgs if m['mode']=='meeting')
        combined=' '.join(m['text'][:60] for m in day_msgs if m['sender']=='user') or ' '.join(m['text'][:60] for m in day_msgs)
        tags=extract_memory_tags(combined,6)
        topics='、'.join(tags[:5]) if tags else '日常寒暄'
        summary=f"{day} 日常归纳：与 {p['name']} 共互动 {len(day_msgs)} 条（线上短信 {chat_n} 条，线下见面 {meet_n} 条），主要提及：{topics}。"
        append_episodic_memory(
            db,
            owner_id=cid,
            profile_id=pid,
            source_type='daily-summary',
            source_key='day:'+day,
            knowledge_mode='experienced' if meet_n>0 else 'stated',
            summary=summary,
            tags=tags,
            importance=3 if meet_n>0 else 2,
            emotional_weight=2,
            unresolved=0,
            raw_msg_ids=[m['id'] for m in day_msgs[-8:]],
            event_at=day_msgs[-1]['created_at']
        )

def retrieve_relevant_memories(db,pid,cid,query_text='',exclude_msg_ids=None,limit=4,max_chars=1200):
    exclude=set(exclude_msg_ids or [])
    rows=db.execute('SELECT * FROM episodic_memories WHERE owner_id=? AND profile_id=? ORDER BY event_at DESC',(cid,pid)).fetchall()
    if not rows:return []
    all_items=[dict(r)|{'tags':parse_json(r['tags'],[]),'raw_msg_ids':parse_json(r['raw_msg_ids'],[])} for r in rows]
    by_id={x['id']:x for x in all_items}
    corrections_by_target={}
    for x in all_items:
        if x['source_type']=='correction' and x.get('clarifies_id'):
            corrections_by_target.setdefault(x['clarifies_id'],[]).append(x)
    q_terms=set(extract_query_terms(query_text))
    asks_past=any(w in str(query_text) for w in ('昨天','上次','之前','以前','记得','那天','第一次','上次见','聊过','说过','晒太阳','去过'))
    scored=[]
    for item in all_items:
        raw_ids=set(item['raw_msg_ids'])
        if raw_ids and raw_ids.issubset(exclude) and item['source_type']=='dialogue':
            continue
        if item['disputed'] and item['id'] not in corrections_by_target and not q_terms:
            continue
        item_tags=set(item['tags'])
        item_terms=set(extract_query_terms(item['summary']))|item_tags
        tag_hits=len(q_terms & item_tags)
        term_hits=len(q_terms & item_terms)
        overlap_score=tag_hits*6 + term_hits*3
        if item['source_type']=='correction':
            score=overlap_score + 9.0
        elif item['source_type']=='milestone':
            score=overlap_score + (4.5 if asks_past else 1.5)
        elif item['source_type']=='daily-summary':
            score=overlap_score + (6.0 if asks_past else 1.0)
        else:
            score=overlap_score + item['importance']*1.1 + (2.5 if item['unresolved'] else 0.0)
        if overlap_score==0 and item['source_type'] not in ('correction',) and not item['unresolved'] and not (asks_past and item['source_type'] in ('daily-summary','milestone')):
            continue
        scored.append((score,overlap_score,item))
    scored.sort(key=lambda t:(t[0],t[2]['event_at']),reverse=True)
    selected=[]
    used_ids=set()
    char_Count=0
    for score,overlap_score,item in scored:
        if len(selected)>=limit:break
        if item['id'] in used_ids:continue
        entry=dict(item,score=round(score,2),overlap_score=overlap_score)
        if item['disputed'] and item['id'] in corrections_by_target:
            corr=corrections_by_target[item['id']][0]
            entry['correction_note']=corr['summary']
            used_ids.add(corr['id'])
        elif item['source_type']=='correction' and item.get('clarifies_id') in by_id:
            orig=by_id[item['clarifies_id']]
            entry['disputed_original']=orig['summary']
            used_ids.add(orig['id'])
        if overlap_score>=6 and item['raw_msg_ids']:
            placeholders=','.join('?' for _ in item['raw_msg_ids'][:2])
            raw_rows=db.execute(f"SELECT sender,text FROM messages WHERE id IN ({placeholders}) ORDER BY created_at LIMIT 2",tuple(item['raw_msg_ids'][:2])).fetchall()
            if raw_rows:
                entry['raw_excerpt']=' | '.join(('对方：' if r['sender']=='user' else '你：')+r['text'][:70] for r in raw_rows)
        est_len=len(entry['summary'])+len(entry.get('correction_note',''))+len(entry.get('raw_excerpt',''))+30
        if char_Count+est_len>max_chars and selected:
            continue
        used_ids.add(item['id'])
        char_Count+=est_len
        selected.append(entry)
    selected.sort(key=lambda x:x['event_at'])
    return selected

def format_episodic_entry(entry):
    mode_tag={
        'program-fact':'[系统确认事实]',
        'experienced':'[亲历互动记录]',
        'stated':'[对话陈述·非客观事实证明]',
        'clarified':'[已澄清纠正]'
    }.get(entry.get('knowledge_mode'),'[过往记录]')
    date_part=str(entry.get('event_at',''))[:10]
    if entry.get('disputed'):
        line=f"- {date_part} [旧记录·已被澄清存疑] {entry['summary']}"
        if entry.get('correction_note'):
            line+=f" -> ⚠️ 最新澄清：{entry['correction_note']}"
        return line
    line=f"- {date_part} {mode_tag} {entry['summary']}"
    if entry.get('disputed_original'):
        line+=f"（针对旧说法「{entry['disputed_original'][:80]}」的更正）"
    if entry.get('raw_excerpt'):
        line+=f"（原文片段：{entry['raw_excerpt']}）"
    return line

def relationship_baseline_summary(db,pid,cid,p_name):
    rel=db.execute('SELECT status,mode,attempts,updated_at FROM relations WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    milestones=db.execute("SELECT type,summary,created_at FROM events WHERE character_id=? AND profile_id=? AND type IN ('matched','unmatched','meeting','return') ORDER BY created_at",(cid,pid)).fetchall()
    total_msgs=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()[0]
    meet_msgs=db.execute("SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting'",(pid,cid)).fetchone()[0]
    had_unmatch=any(m['type']=='unmatched' for m in milestones)
    reunited=had_unmatch and rel and rel['status']=='matched'
    parts=[f"与 {p_name} 当前状态：{'已匹配' if rel and rel['status']=='matched' else '未匹配'}（当前模式：{'线下见面' if rel and rel['mode']=='meeting' else '线上短信'}）"]
    if reunited:parts.append('曾解除匹配后再次重逢（保留过往记忆）')
    parts.append(f"累计对话 {total_msgs} 条（其中线下见面互动 {meet_msgs} 条）")
    if milestones:
        recent_ms='；'.join(f"{str(m['created_at'])[:10]} {m['summary']}" for m in milestones[-3:])
        parts.append(f"关键节点：{recent_ms}")
    return '；'.join(parts)+'。'

def select_working_history(db,pid,cid,mode='chat',through_rowid=None):
    if through_rowid is not None:
        rows=db.execute('SELECT id,sender,mode,text,created_at FROM messages WHERE profile_id=? AND character_id=? AND rowid<=? ORDER BY rowid DESC LIMIT 24',(pid,cid,through_rowid)).fetchall()
    else:
        rows=db.execute('SELECT id,sender,mode,text,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 24',(pid,cid)).fetchall()
    chron=list(reversed([dict(r) for r in rows]))
    if not chron:return []
    win_limit=8 if mode=='meeting' else 10
    today_prefix=chron[-1]['created_at'][:10]
    today_msgs=[m for m in chron if str(m['created_at'])[:10]==today_prefix]
    if len(today_msgs)>=4:
        return today_msgs[-win_limit:]
    return chron[-min(6,win_limit):]

def write_message(db,pid,cid,sender,mode,txt,engine='human'):
    item=dict(id=uid(),profile_id=pid,character_id=cid,sender=sender,mode=mode,text=txt,engine=engine,created_at=utc())
    db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)',tuple(item.values()))
    return item

def log_event(db,pid,cid,kind,summary):
    now_str=utc()
    db.execute('INSERT INTO events VALUES (?,?,?,?,?,?)',(uid(),pid,cid,kind,summary[:500],now_str))
    if kind in ('matched','unmatched','meeting','return'):
        append_episodic_memory(
            db,
            owner_id=cid,
            profile_id=pid,
            source_type='milestone',
            source_key=f'milestone:{kind}:{now_str[:19]}',
            knowledge_mode='program-fact',
            summary=summary[:260],
            tags=[kind,'关系节点'],
            importance=4,
            emotional_weight=3,
            unresolved=0,
            event_at=now_str
        )

def latest_memory(db,cid,pid):
    # Preserve relationship milestones (matched, unmatched, meeting, return) so chat volume never erases them.
    milestones=db.execute("SELECT id,type,summary,created_at FROM events WHERE character_id=? AND profile_id=? AND type IN ('matched','unmatched','meeting','return') ORDER BY created_at DESC LIMIT 12",(cid,pid)).fetchall()
    recent=db.execute('SELECT id,type,summary,created_at FROM events WHERE character_id=? AND profile_id=? ORDER BY created_at DESC LIMIT 14',(cid,pid)).fetchall()
    by_id={r['id']:dict(r) for r in milestones}
    for r in recent:by_id[r['id']]=dict(r)
    current_sorted=sorted(by_id.values(),key=lambda x:x['created_at'])[-20:]
    current_clean=[{k:r[k] for k in ('type','summary','created_at')} for r in current_sorted]

    other_m=db.execute("SELECT e.id,p.name AS person,e.type,e.summary,e.created_at FROM events e JOIN profiles p ON e.profile_id=p.id WHERE e.character_id=? AND e.profile_id<>? AND e.type IN ('matched','unmatched','meeting','return') ORDER BY e.created_at DESC LIMIT 8",(cid,pid)).fetchall()
    other_r=db.execute('SELECT e.id,p.name AS person,e.type,e.summary,e.created_at FROM events e JOIN profiles p ON e.profile_id=p.id WHERE e.character_id=? AND e.profile_id<>? ORDER BY e.created_at DESC LIMIT 8',(cid,pid)).fetchall()
    other_by_id={r['id']:dict(r) for r in other_m}
    for r in other_r:other_by_id[r['id']]=dict(r)
    other_sorted=sorted(other_by_id.values(),key=lambda x:x['created_at'])[-12:]
    other_clean=[{k:r[k] for k in ('person','type','summary')} for r in other_sorted]
    return current_clean, other_clean

def completion(messages,*,json_mode=False,max_tokens=None):
    settings=load_connection();base=settings.get('base_url');key=settings.get('api_key');model=settings.get('model')
    if not all((base,key,model)):raise RuntimeError('尚未配置可用的 API 地址、密钥及模型')
    payload={'model':model,'messages':messages,'temperature':settings.get('temperature',0.85),'top_p':settings.get('top_p',1),'max_tokens':max_tokens or settings.get('max_tokens',700)}
    if json_mode:payload['response_format']={'type':'json_object'}
    req=urllib.request.Request(base+'/chat/completions',data=js(payload).encode('utf8'),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=65) as r: data=json.loads(r.read(2*1024*1024))
        content=data['choices'][0]['message']['content']
        if isinstance(content,list):content=''.join(x.get('text','') for x in content if isinstance(x,dict))
        if not isinstance(content,str) or not content.strip():raise RuntimeError('模型没有返回可用文本')
        return content.strip()
    except urllib.error.HTTPError as exc:
        raise RuntimeError(f'模型接口返回 HTTP {exc.code}；请检查地址、模型和额度')
    except urllib.error.URLError as exc:raise RuntimeError('无法连接模型接口：'+str(exc.reason)[:140])

def compile_messages(db,p,c,mode='chat',latest=None,through_rowid=None):
    ordered=db.execute('SELECT * FROM presets WHERE mode=? AND enabled=1 ORDER BY sort_order,id',(mode,)).fetchall()
    def macros(t):return t.replace('{{user}}',p['name']).replace('{{char}}',c['name'])
    sys_parts=[macros(x['content']) for x in ordered if x['role']=='system']
    working_history=select_working_history(db,p['id'],c['id'],mode=mode,through_rowid=through_rowid)
    working_ids={m['id'] for m in working_history}
    ensure_daily_summaries(db,p,c,working_ids)
    query_seed=latest or ' '.join(m['text'] for m in working_history[-3:] if m['sender']=='user') or (' '.join(m['text'] for m in working_history[-2:]))
    recalled=retrieve_relevant_memories(db,p['id'],c['id'],query_text=query_seed,exclude_msg_ids=working_ids,limit=4,max_chars=1200)
    rel_summary=relationship_baseline_summary(db,p['id'],c['id'],p['name'])
    interests_str='、'.join(p.get('interests') or []) or '未填写'
    intent_str=p.get('intent') or '未填写'
    system='''你正在扮演一个真实存在于其原作时间线中的虚构角色。不得跳出角色解释自己是语言模型。记忆严格按当前角色 ID 与当前聊天对象隔离，绝不混入其他人物或其他 Profile 的经历。区分“系统已确认事实”与“对方在对话中的主观陈述”，不因对方随口一句话而篡改你的原作设定。\n'''
    system+=f"【第一层 · 身份记忆 (Identity Memory)】\n你的身份：{c['name']}（角色ID：{c['id']}）。原作/连续性：{c['source']}。时间线：{c['version']}。已确认背景：{c['canon']}。\n"
    system+=f"当前互动对象 Profile：姓名 {p['name']}，年龄 {p['age']}，性别 {p['gender']}，交友目的：{intent_str}，兴趣爱好：{interests_str}；公开自述：{p['bio']}。"
    if p['role_character_id'] in BY_ID:
        role=BY_ID[p['role_character_id']]
        system+=f"\n对方扮演的原作人物：{role['name']}，{role['version']}，{role['canon']}。"
    elif p['role_hint']:system+=f"\n对方提供的扮演身份说明（未经自动验证）：{p['role_hint'][:240]}。"
    system+=f"\n\n【第二层 · 关系记忆基线 (Relationship Memory)】\n{rel_summary}"
    if recalled:
        system+="\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n"+"\n".join(format_episodic_entry(e) for e in recalled)
    else:
        system+="\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n（当前话题未触发额外远期档案，仅依靠下方今日活跃上下文连贯交流）"
    if sys_parts:system+='\n\n'+'\n\n'.join(sys_parts)
    messages=[{'role':'system','content':system}]
    for x in ordered:
        if x['role']!='system':messages.append({'role':x['role'],'content':macros(x['content'])})
    for msg in working_history:
        messages.append({'role':'assistant' if msg['sender']=='ai' else 'user','content':('[见面]' if msg['mode']=='meeting' else '[短信]')+msg['text']})
    messages.append({'role':'system','content':'【第四层 · 当前状态 (Current State)】当前输出模式：'+('线下小说式 RP（不要替玩家行动）' if mode=='meeting' else '约会 App 手机聊天；仅发聊天气泡，不写小说旁白')+'。只输出下一条角色回复。'})
    return messages

def demo_text(db,p,c,mode):
    past=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()[0]
    if mode=='meeting':
        return f"{c['name'].split()[0]}抬起头，视线在你脸上停了一瞬。周围的人声渐渐变成背景。他把手机收起来，轻声说：‘你来了。’"
    if past<=2:return f"嗯，我在。你想先从什么聊起？"
    lines=['这点倒是挺有意思。你为什么这么想？','我可能需要想一想再回答你。','你说的我会记住。那你呢？','你有时候真的会让我意外。']
    return lines[past%len(lines)]

def match_reply(db,p,c,again=False):
    if load_connection().get('api_key') and load_connection().get('model'):
        try:
            prompt=compile_messages(db,p,c,'chat');prompt.append({'role':'user','content':'你刚刚'+('再次' if again else '')+'和此人匹配成功。你可以发送一条简短的第一句话；如果曾经吵架或解除匹配，你记得过去，不要装作初识。'})
            return completion(prompt,max_tokens=180),'live'
        except Exception:pass
    if again:return f"又见面了，{p['name']}。上次的事……我没有忘。",'demo'
    return f"Hey，{p['name']}。看来我们匹配上了。",'demo'

def match_decision(db,p,c,attempt):
    settings=load_connection()
    if all(settings.get(k) for k in ('base_url','api_key','model')):
        try:
            interests_str='、'.join(p.get('interests') or []) or '未填写'
            intent_str=p.get('intent') or '未填写'
            prompt=[{'role':'system','content':f"你是 {c['name']}，来自 {c['source']} {c['version']}。设定：{c['canon']}。使用约会 App 时，对方 {p['name']}，{p['age']} 岁，交友目的：{intent_str}，兴趣爱好：{interests_str}，简介：{p['bio']}。你可以自由决定是否右滑匹配，不要默认喜欢每个人。只返回JSON对象 {{\"match\":true/false}}。"},{'role':'user','content':'你会匹配吗？'}]
            result=completion(prompt,json_mode=True,max_tokens=60)
            try:return bool(json.loads(result).get('match')), 'live'
            except ValueError:return 'true' in result.lower()[:60],'live'
        except Exception:pass
    seed=int(hashlib.sha256((p['id']+c['id']+str(attempt)).encode()).hexdigest()[:8],16)
    return (seed%100)<72,'demo'

def generate_bios(db,characters):
    settings=load_connection()
    if not all(settings.get(k) for k in ('base_url','api_key','model')):return 'catalog-demo'
    pending=[c for c in characters if not db.execute('SELECT 1 FROM character_bios WHERE character_id=?',(c['id'],)).fetchone()]
    if not pending:return 'cached-ai-bios'
    compact=[{'id':c['id'],'name':c['name'],'source':c['source'],'version':c['version'],'canon':c['canon'],'example':c['bio']} for c in pending]
    rules='根据给定的、已收录的原作人物身份，为他们各写一条符合个性的约会软件公开简介。不得编造新的角色、错误时间线或伪造重要原作事实。特工隐秘职业不应随意曝光。每条中文不超过80字，真实自然。只输出 JSON 对象，形如 {"profiles":[{"id":"exact-id","bio":"..."}]}，只用输入中的ID。'
    try:
        out=completion([{'role':'system','content':rules},{'role':'user','content':js(compact)}],json_mode=True,max_tokens=850)
        value=parse_json(out,{})
        valid={c['id'] for c in pending};count=0
        for x in value.get('profiles',[]):
            if not isinstance(x,dict) or x.get('id') not in valid or not isinstance(x.get('bio'),str):continue
            bio=x['bio'].strip()
            if 8<=len(bio)<=160:
                db.execute('INSERT OR IGNORE INTO character_bios VALUES (?,?,?)',(x['id'],bio,utc()));count+=1
        db.commit();return 'live-generated' if count else 'catalog-demo'
    except Exception as err:
        print('Optional bio generation unavailable:',str(err)[:160],file=sys.stderr)
        return 'catalog-demo'

class Handler(BaseHTTPRequestHandler):
    server_version='Parallel/0.5'
    def log_message(self,fmt,*args):
        print('%s - %s' % (self.address_string(),fmt%args),file=sys.stderr)
    def respond(self,data,status=200):
        body=js(data).encode('utf8');self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8')
        self.send_header('Content-Length',str(len(body)))
        self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
        self.end_headers();self.wfile.write(body)
    def static(self,path):
        file=(ROOT/'static'/(path or 'index.html')).resolve(); root=(ROOT/'static').resolve()
        if not file.is_relative_to(root) or not file.is_file():self.send_error(404);return
        type={'html':'text/html','js':'text/javascript','css':'text/css','svg':'image/svg+xml','png':'image/png','ico':'image/x-icon'}.get(file.suffix[1:],'application/octet-stream')
        content=file.read_bytes();self.send_response(200);self.send_header('Content-Type',type+'; charset=utf-8');self.send_header('Content-Length',str(len(content)))
        self.send_header('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        self.end_headers();self.wfile.write(content)
    def do_GET(self):
        try:
            q=urllib.parse.urlparse(self.path);route=q.path;params=urllib.parse.parse_qs(q.query)
            arg=lambda k:params.get(k,[''])[0]
            if not route.startswith('/api/'):
                return self.static(route.lstrip('/'))
            with connect() as db:
                if route=='/api/bootstrap':return self.respond({'profiles':profiles_all(db),'sources':SOURCES,'settings':public_connection(),'catalog_size':len(CATALOG)})
                if route=='/api/identify':return self.respond({'matches':identify(arg('name'),arg('source')),'verified':'curated-catalog'})
                if route=='/api/candidates':
                    p=profile_get(db,arg('profileId'));a=possible_candidates(db,p);random.SystemRandom().shuffle(a)
                    res=[]
                    for c in a[:10]:
                        d=char_view(db,c);swipe=db.execute('SELECT direction FROM swipes WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone();rel=db.execute('SELECT status FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
                        d['previous_swipe']=swipe['direction'] if swipe else None;d['relation_status']=rel['status'] if rel else None;res.append(d)
                    return self.respond({'candidates':res,'total_available':len(a),'requested':10,'demo':public_connection()['mode']=='demo'})
                if route=='/api/threads':
                    p=profile_get(db,arg('profileId'));rows=db.execute("SELECT * FROM relations WHERE profile_id=? AND status='matched' ORDER BY updated_at DESC",(p['id'],)).fetchall();threads=[]
                    for r in rows:
                        c=BY_ID.get(r['character_id']);
                        if not c:continue
                        last=db.execute('SELECT text,sender,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 1',(p['id'],c['id'])).fetchone()
                        threads.append({'character':char_view(db,c),'relation':dict(r),'last':dict(last) if last else None,'queue':queue_view(db,p['id'],c['id'])})
                    return self.respond({'threads':threads})
                if route=='/api/thread':
                    p=profile_get(db,arg('profileId'));cid=arg('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    rel=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if not rel or rel['status']!='matched':raise ValueError('尚未匹配或已解除匹配')
                    msgs=db.execute('SELECT * FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at,id',(p['id'],cid)).fetchall()
                    return self.respond({'character':char_view(db,c),'profile':p,'relation':dict(rel),'messages':[dict(m) for m in msgs],'queue':queue_view(db,p['id'],cid)})
                if route=='/api/memories':
                    p=profile_get(db,arg('profileId'));cid=arg('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    rel=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    mode=rel['mode'] if rel else 'chat'
                    working=select_working_history(db,p['id'],cid,mode=mode)
                    working_ids={m['id'] for m in working}
                    ensure_daily_summaries(db,p,c,working_ids)
                    db.commit()
                    q_str=arg('query').strip() or (' '.join(m['text'] for m in working[-3:] if m['sender']=='user')) or (' '.join(m['text'] for m in working[-2:]))
                    recalled=retrieve_relevant_memories(db,p['id'],cid,query_text=q_str,exclude_msg_ids=set() if arg('query').strip() else working_ids,limit=4,max_chars=1200)
                    all_rows=db.execute('SELECT * FROM episodic_memories WHERE owner_id=? AND profile_id=? ORDER BY event_at DESC,id DESC',(cid,p['id'])).fetchall()
                    memories=[dict(r)|{'tags':parse_json(r['tags'],[]),'raw_msg_ids':parse_json(r['raw_msg_ids'],[]),'disputed':1 if r['disputed'] else 0,'unresolved':1 if r['unresolved'] else 0,'created_at':r['event_at']} for r in all_rows]
                    total_msgs=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()[0]
                    base_sum=relationship_baseline_summary(db,p['id'],cid,p['name'])
                    return self.respond({
                        'ownerId':cid,
                        'characterId':cid,
                        'profileId':p['id'],
                        'baseline':base_sum,
                        'identity':{'id':c['id'],'name':c['name'],'source':c['source'],'version':c['version'],'canon':c['canon']},
                        'relationship':{'summary':base_sum,'mode':mode,'status':rel['status'] if rel else 'none'},
                        'workingWindowCount':len(working),
                        'totalMessagesCount':total_msgs,
                        'queryUsed':q_str,
                        'recalledPreview':[dict(m)|{'formatted':format_episodic_entry(m)} for m in recalled],
                        'memories':memories
                    })
                if route=='/api/photo-description':
                    cid=arg('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    x=db.execute('SELECT description FROM photo_descriptions WHERE character_id=?',(cid,)).fetchone()
                    return self.respond({'description':x['description'] if x else photo_description(c),'engine':'saved' if x else 'curated-demo'})
                if route=='/api/presets':
                    return self.respond({'entries':[dict(x)|{'enabled':bool(x['enabled'])} for x in db.execute('SELECT * FROM presets ORDER BY mode,sort_order,id').fetchall()]})
                if route=='/api/settings':return self.respond(public_connection())
                if route=='/api/models':
                    settings=load_connection()
                    if not settings.get('base_url') or not settings.get('api_key'):raise ValueError('先填写 API 地址和密钥并保存')
                    req=urllib.request.Request(settings['base_url']+'/models',headers={'Authorization':'Bearer '+settings['api_key'],'Accept':'application/json'})
                    try:
                        with urllib.request.urlopen(req,timeout=18) as r:data=json.loads(r.read(2*1024*1024))
                        models=[x['id'] for x in data.get('data',[]) if isinstance(x,dict) and isinstance(x.get('id'),str)]
                        return self.respond({'models':models})
                    except urllib.error.HTTPError as e:raise ValueError('模型列表请求失败：HTTP '+str(e.code))
                if route=='/api/image-models':
                    settings=load_connection()
                    if not settings.get('image_base_url') or not settings.get('image_api_key'):raise ValueError('先填写图片 API 地址和密钥并保存')
                    req=urllib.request.Request(settings['image_base_url']+'/models',headers={'Authorization':'Bearer '+settings['image_api_key'],'Accept':'application/json'})
                    try:
                        with urllib.request.urlopen(req,timeout=18) as r:data=json.loads(r.read(2*1024*1024))
                        models=[x['id'] for x in data.get('data',[]) if isinstance(x,dict) and isinstance(x.get('id'),str)]
                        return self.respond({'models':models})
                    except urllib.error.HTTPError as e:raise ValueError('图片模型列表请求失败：HTTP '+str(e.code))
                if route=='/api/health':return self.respond({'ok':True,'name':'Parallel','version':'0.5.1'})
            self.respond({'error':'未找到接口'},404)
        except ValueError as e:self.respond({'error':str(e)},400)
        except Exception as e:print('GET error',str(e),file=sys.stderr);self.respond({'error':str(e)[:250]},500)
    def do_POST(self):
        origin=self.headers.get('Origin','');allowed={f'http://{HOST}:{PORT}',f'http://localhost:{PORT}'}
        if origin and origin not in allowed:return self.respond({'error':'跨站请求不允许'},403)
        ln=int(self.headers.get('Content-Length','0'))
        if ln>MAX_BODY:return self.respond({'error':'请求体太大'},413)
        try:
            data=json.loads(self.rfile.read(ln) or b'{}');route=self.path.split('?')[0]
            if not isinstance(data,dict):raise ValueError('请求格式错误')
            with connect() as db:
                if route=='/api/discover':
                    p=profile_get(db,data.get('profileId'));choices=possible_candidates(db,p)
                    random.SystemRandom().shuffle(choices)
                    selected=choices[:10]
                    generation=generate_bios(db,selected)
                    out=[]
                    for c in selected:
                        d=char_view(db,c)
                        swipe=db.execute('SELECT direction FROM swipes WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
                        relation=db.execute('SELECT status FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
                        d['previous_swipe']=swipe['direction'] if swipe else None
                        d['relation_status']=relation['status'] if relation else None
                        out.append(d)
                    return self.respond({'candidates':out,'total_available':len(choices),'requested':10,'generation':generation,'demo':public_connection()['mode']=='demo'})
                if route=='/api/profile':
                    name=str(data.get('name','')).strip()[:80]; age=int(data.get('age',18));gender=str(data.get('gender','other'))[:24]
                    if not name:raise ValueError('请填写姓名')
                    if not 18<=age<=120:raise ValueError('当前只支持成年人（18+）的约会 Profile')
                    if gender not in ('male','female','nonbinary','other'):raise ValueError('性别无效')
                    pid=data.get('id') or uid(); existed=db.execute('SELECT id,avatar,created_at FROM profiles WHERE id=?',(pid,)).fetchone()
                    if data.get('id') and not existed:raise ValueError('Profile 不存在')
                    lo=max(18,min(120,int(data.get('min_age',18))));hi=max(lo,min(120,int(data.get('max_age',60))))
                    opts=[s for s in data.get('interested_in',['all']) if s in ('all','male','female','nonbinary','other')]
                    sources=[]
                    for value in data.get('sources',[]):
                        if not isinstance(value,str):continue
                        tag=' '.join(value.strip().split())[:80]
                        if tag and tag.casefold() not in {x.casefold() for x in sources}:sources.append(tag)
                        if len(sources)>=20:break
                    interests=[str(x)[:40] for x in data.get('interests',[]) if isinstance(x,str)][:12]
                    avatar=str(data.get('avatar',existed['avatar'] if existed else ''))
                    if avatar and (not avatar.startswith('data:image/') or len(avatar)>2_000_000):raise ValueError('头像需是小于约 1.5MB 的图片')
                    role_id=str(data.get('role_character_id',''))
                    if role_id and role_id not in BY_ID:raise ValueError('请选择已识别的同人身份，或留空并在身份说明里填写')
                    fields=(pid,name,age,gender,js(opts),lo,hi,str(data.get('intent','认识新朋友'))[:60],str(data.get('bio',''))[:500],js(interests),js(sources),avatar,role_id,str(data.get('role_hint',''))[:300],existed['created_at'] if existed else utc())
                    db.execute('INSERT OR REPLACE INTO profiles VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',fields)
                    db.commit();return self.respond({'profile':profile_get(db,pid)})
                if route=='/api/swipe':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    if match_role(db,p,c):raise ValueError('当前扮演身份不能匹配同一原作角色版本的自己')
                    direction=data.get('direction');
                    if direction not in ('left','right'):raise ValueError('滑动方向错误')
                    db.execute('INSERT OR REPLACE INTO swipes VALUES (?,?,?,?)',(p['id'],cid,direction,utc()))
                    previous=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone();again=bool(previous)
                    if direction=='left':
                        db.commit();return self.respond({'direction':'left','matched':False,'previously_matched':previous and previous['status']=='matched'})
                    if previous and previous['status']=='matched':db.commit();return self.respond({'direction':'right','matched':True,'already_matched':True,'character':char_view(db,c)})
                    attempt=(previous['attempts'] if previous else 0)+1
                    matched,engine=match_decision(db,p,c,attempt)
                    status='matched' if matched else 'pending'
                    db.execute('INSERT OR REPLACE INTO relations VALUES (?,?,?,?,?,?)',(p['id'],cid,status,'chat',attempt,utc()))
                    if matched:
                        log_event(db,p['id'],cid,'matched','与 '+p['name']+(' 重新匹配' if again else ' 首次匹配'))
                        txt,msg_engine=match_reply(db,p,c,again)
                        write_message(db,p['id'],cid,'ai','chat',txt,msg_engine)
                    db.commit();return self.respond({'direction':'right','matched':matched,'engine':engine,'character':char_view(db,c),'again':again})
                if route=='/api/unmatch':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if not r:raise ValueError('关系不存在')
                    db.execute("UPDATE relations SET status='unmatched',mode='chat',updated_at=? WHERE profile_id=? AND character_id=?",(utc(),p['id'],cid))
                    queue_cancel(db,p['id'],cid);log_event(db,p['id'],cid,'unmatched','与 '+p['name']+' 解除匹配；过去的相处没有被抹去');db.commit();return self.respond({'ok':True})
                if route=='/api/mode':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');mode=data.get('mode')
                    if mode not in ('chat','meeting'):raise ValueError('模式无效')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('未匹配')
                    db.execute('UPDATE relations SET mode=?,updated_at=? WHERE profile_id=? AND character_id=?',(mode,utc(),p['id'],cid))
                    if r['mode']!=mode:
                        with CHAT_LOCK:queue_cancel(db,p['id'],cid)
                    if r['mode']!=mode:log_event(db,p['id'],cid,'meeting' if mode=='meeting' else 'return','与 '+p['name']+(' 在线下见面' if mode=='meeting' else ' 返回手机消息'))
                    db.commit();return self.respond({'mode':mode})
                if route=='/api/chat-flush':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId')
                    if not cid:
                        return self.respond(queue_flush_due(db,p))
                    c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT status,mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if not r or r['status']!='matched' or r['mode']!='chat':raise ValueError('当前不是手机聊天模式')
                    return self.respond(queue_flush(db,p,c,force=data.get('force') is True))
                if route=='/api/chat-flush-due':
                    p=profile_get(db,data.get('profileId'))
                    return self.respond(queue_flush_due(db,p))
                if route=='/api/message-delete':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');mid=str(data.get('messageId',''))
                    if not mid:raise ValueError('缺少消息 ID')
                    db.execute('DELETE FROM messages WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],cid))
                    with CHAT_LOCK:
                        q=db.execute('SELECT pending,due_at FROM chat_queue WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                        if q:
                            pending=[x for x in parse_json(q['pending'],[]) if x!=mid]
                            db.execute('UPDATE chat_queue SET pending=?,due_at=? WHERE profile_id=? AND character_id=?',(js(pending),q['due_at'] if pending else 0,p['id'],cid))
                    db.commit();return self.respond({'ok':True,'queue':queue_view(db,p['id'],cid)})
                if route=='/api/memory-action':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    act=data.get('action')
                    if act=='delete':
                        mid=str(data.get('memoryId') or data.get('id') or '')
                        if not mid:raise ValueError('缺少记忆 ID')
                        db.execute('DELETE FROM episodic_memories WHERE id=? AND owner_id=? AND profile_id=?',(mid,cid,p['id']))
                        db.commit();return self.respond({'ok':True})
                    if act=='add':
                        summary=str(data.get('summary','')).strip()
                        if not summary or len(summary)>500:raise ValueError('请填写记忆内容（1–500 字）')
                        imp=max(1,min(5,int(data.get('importance',4))))
                        mid=append_episodic_memory(db,owner_id=cid,profile_id=p['id'],source_type='confirmed_fact',source_key='manual:'+uid(),knowledge_mode='experienced',summary=summary,importance=imp,emotional_weight=3,unresolved=1 if data.get('unresolved') else 0)
                        db.commit();return self.respond({'ok':True,'id':mid})
                    if act=='correct':
                        mid=str(data.get('memoryId') or data.get('id') or '')
                        clar=str(data.get('correction') or data.get('clarification') or '').strip()
                        if not clar:raise ValueError('请填写澄清说明')
                        if mid:db.execute('UPDATE episodic_memories SET disputed=1,unresolved=0 WHERE id=? AND owner_id=? AND profile_id=?',(mid,cid,p['id']))
                        cid_new=append_episodic_memory(db,owner_id=cid,profile_id=p['id'],source_type='correction',source_key='corr:'+uid(),knowledge_mode='clarified',summary=f"{p['name']}明确澄清/纠正：{clar[:160]}",importance=5,emotional_weight=4,clarifies_id=mid)
                        db.commit();return self.respond({'ok':True,'id':cid_new})
                    raise ValueError('未知的记忆操作')
                if route=='/api/reply':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('尚未匹配')
                    mode=r['mode']
                    qv=queue_view(db,p['id'],cid)
                    if mode=='chat' and (qv['count'] or qv['status']=='inflight'):
                        return self.respond(queue_flush(db,p,c,force=True))
                    engine='demo';warning='';settings=load_connection()
                    if all(settings.get(k) for k in ('base_url','api_key','model')):
                        try:reply=completion(compile_messages(db,p,c,mode));engine='live'
                        except Exception as e:warning=str(e);reply='（模型连接失败，请检查终端设置后重试。）';engine='error'
                    else:reply=demo_text(db,p,c,mode)
                    ai_msg=write_message(db,p['id'],cid,'ai',mode,reply,engine)
                    if engine!='error':
                        log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+reply[:180])
                        last_u=db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND sender='user' ORDER BY created_at DESC,id DESC LIMIT 1",(p['id'],cid)).fetchone()
                        record_dialogue_episode(db,p,c,[dict(last_u)] if last_u else [],ai_msg,mode)
                    db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                    db.commit();return self.respond({'reply':ai_msg,'mode':mode,'warning':warning})
                if route=='/api/message':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('尚未匹配')
                    txt=str(data.get('text','')).strip()
                    if not txt or len(txt)>4000:raise ValueError('消息请控制在 1–4000 字')
                    mode=r['mode'];auto=False
                    user_msg=write_message(db,p['id'],cid,'user',mode,txt)
                    detect_and_apply_correction(db,p,c,user_msg)
                    if mode=='chat':
                        log_event(db,p['id'],cid,'user_message','与 '+p['name']+' 的聊天：'+txt[:180])
                        with CHAT_LOCK:queue_add(db,p['id'],cid,user_msg['id'])
                        db.commit()
                        return self.respond({'user':user_msg,'reply':None,'queued':True,'mode':'chat','queue':queue_view(db,p['id'],cid)})
                    log_event(db,p['id'],cid,'user_message','与 '+p['name']+' 的'+('见面' if mode=='meeting' else '聊天')+'：'+txt[:180])
                    engine='demo';warning='';settings=load_connection()
                    if all(settings.get(k) for k in ('base_url','api_key','model')):
                        try:reply=completion(compile_messages(db,p,c,mode));engine='live'
                        except Exception as e:warning=str(e);reply='（模型连接失败，消息已保存。请检查终端设置后重试发送。）';engine='error'
                    else:reply=demo_text(db,p,c,mode)
                    ai_msg=write_message(db,p['id'],cid,'ai',mode,reply,engine)
                    if engine!='error':
                        log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+reply[:180])
                        record_dialogue_episode(db,p,c,[user_msg],ai_msg,mode)
                    db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                    db.commit();return self.respond({'user':user_msg,'reply':ai_msg,'auto_meeting':auto,'mode':mode,'warning':warning})
                if route=='/api/settings':
                    d=load_connection();
                    if 'base_url' in data:d['base_url']=validate_base_url(str(data['base_url']).strip())
                    if 'api_key' in data:
                        v=str(data['api_key']);
                        if len(v)>1000:raise ValueError('API Key 太长')
                        if v:d['api_key']=v
                    if data.get('clear_key'):d['api_key']=''
                    if 'model' in data:d['model']=str(data['model']).strip()[:200]
                    if 'image_base_url' in data:d['image_base_url']=validate_base_url(str(data['image_base_url']).strip())
                    if 'image_api_key' in data:
                        iv=str(data['image_api_key']);
                        if len(iv)>1000:raise ValueError('图片 API Key 太长')
                        if iv:d['image_api_key']=iv
                    if data.get('clear_image_key'):d['image_api_key']=''
                    if 'image_model' in data:d['image_model']=str(data['image_model']).strip()[:200]
                    if 'temperature' in data:d['temperature']=max(0,min(2,float(data['temperature'])))
                    if 'top_p' in data:d['top_p']=max(0.01,min(1,float(data['top_p'])))
                    if 'max_tokens' in data:d['max_tokens']=max(100,min(4096,int(data['max_tokens'])))
                    save_connection(d);return self.respond({'settings':public_connection()})
                if route=='/api/portrait':
                    cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    cached=db.execute('SELECT image_uri FROM portraits WHERE character_id=?',(cid,)).fetchone()
                    if cached and not data.get('regenerate'):return self.respond({'portrait':cached['image_uri'],'engine':'cached'})
                    cfg=load_connection()
                    if not all(cfg.get(k) for k in ('image_base_url','image_api_key','image_model')):
                        raise ValueError('尚未填写完整的图片生成 API 链接、密钥与模型')
                    prompt=f"Candid dating app profile portrait photo of {c['name']} from {c['source']} ({c['version']}). Character context: {c['canon']}. Natural lighting, authentic lifestyle photography, high quality portrait, no text or watermarks."
                    body=js({'model':cfg['image_model'],'prompt':prompt,'n':1,'size':'1024x1024'}).encode('utf8')
                    req=urllib.request.Request(cfg['image_base_url']+'/images/generations',data=body,headers={'Content-Type':'application/json','Authorization':'Bearer '+cfg['image_api_key']},method='POST')
                    try:
                        with urllib.request.urlopen(req,timeout=45) as r:resp=json.loads(r.read(15*1024*1024))
                        item=(resp.get('data') or [{}])[0]
                        uri=('data:image/png;base64,'+item['b64_json']) if item.get('b64_json') else item.get('url','')
                        if not uri:raise ValueError('图片接口未返回可用图像数据')
                        db.execute('INSERT OR REPLACE INTO portraits VALUES (?,?,?)',(cid,uri,utc()));db.commit()
                        return self.respond({'portrait':uri,'engine':'live-image'})
                    except urllib.error.HTTPError as e:raise ValueError('图片生成请求失败：HTTP '+str(e.code))
                    except urllib.error.URLError as e:raise ValueError('无法连接图片生成接口：'+str(e.reason)[:120])
                if route=='/api/preset-import':
                    how=data.get('import_mode')
                    if how not in ('append','replace'):raise ValueError('请选择追加或替换预设')
                    modes,entries=validate_preset_package(data.get('preset'))
                    if how=='replace':
                        for mode in modes:db.execute('DELETE FROM presets WHERE mode=?',(mode,))
                    for mode in modes:
                        offset=db.execute('SELECT COALESCE(MAX(sort_order),-1)+1 FROM presets WHERE mode=?',(mode,)).fetchone()[0]
                        ordered=sorted((e for e in entries if e['mode']==mode), key=lambda e:e['sort_order'])
                        for pos,e in enumerate(ordered):
                            db.execute('INSERT INTO presets VALUES (?,?,?,?,?,?,?)',(uid(),mode,e['name'],int(e['enabled']),e['role'],e['content'],offset+pos))
                    db.commit();return self.respond({'ok':True,'imported':len(entries),'modes':modes})
                if route=='/api/preset':
                    action=data.get('action');id=data.get('id')
                    if action=='delete':
                        db.execute('DELETE FROM presets WHERE id=?',(id,));db.commit();return self.respond({'ok':True})
                    if action=='order':
                        ids=data.get('ids',[])
                        for i,x in enumerate(ids):db.execute('UPDATE presets SET sort_order=? WHERE id=?',(i,x))
                        db.commit();return self.respond({'ok':True})
                    mode=data.get('mode','chat');role=data.get('role','system')
                    if mode not in ('chat','meeting') or role not in ('system','user','assistant'):raise ValueError('模式或角色无效')
                    old=db.execute('SELECT id,sort_order FROM presets WHERE id=?',(id,)).fetchone() if id else None
                    id=id or uid();name=str(data.get('name','新条目')).strip()[:100];content=str(data.get('content',''))[:60000];enabled=int(bool(data.get('enabled',True)))
                    order=old['sort_order'] if old else db.execute('SELECT COALESCE(MAX(sort_order),-1)+1 FROM presets WHERE mode=?',(mode,)).fetchone()[0]
                    db.execute('INSERT OR REPLACE INTO presets VALUES (?,?,?,?,?,?,?)',(id,mode,name,enabled,role,content,order));db.commit();return self.respond({'ok':True,'id':id})
                if route=='/api/photo-description':
                    cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    cached=db.execute('SELECT description FROM photo_descriptions WHERE character_id=?',(cid,)).fetchone()
                    if cached and not data.get('regenerate'):return self.respond({'description':cached['description'],'engine':'saved'})
                    description=photo_description(c);engine='curated-demo'
                    if data.get('regenerate'):
                        cfg=load_connection()
                        if all(cfg.get(k) for k in ('base_url','api_key','model')):
                            try:
                                instruction=f'请用自然简体中文描述一张虚构人物在交友 App 上传的照片，80到150字。仅描述镜头可见的服装、姿态、表情、构图和背景，不透露秘密，不写旁白外的剧情。角色：{c["name"]}，作品：{c["source"]}，阶段：{c["version"]}，原作背景：{c["canon"]}。不能创造新的人物身份。'
                                description=completion([{'role':'system','content':instruction},{'role':'user','content':'请描述这张虚构照片。'}],max_tokens=350)[:1200];engine='live-text'
                            except Exception as e:raise ValueError('文字照片描述请求失败：'+str(e))
                    db.execute('INSERT OR REPLACE INTO photo_descriptions VALUES (?,?,?)',(cid,description,engine));db.commit()
                    return self.respond({'description':description,'engine':engine})
            self.respond({'error':'未知接口'},404)
        except ValueError as e:self.respond({'error':str(e)},400)
        except Exception as e:print('POST error',str(e),file=sys.stderr);self.respond({'error':str(e)[:260]},500)

if __name__=='__main__':
    init_db()
    httpd=ThreadingHTTPServer((HOST,PORT),Handler)
    print(f'Parallel running at http://{HOST}:{PORT} (Ctrl+C to stop)')
    try:httpd.serve_forever()
    except KeyboardInterrupt:pass
    finally:httpd.server_close()
