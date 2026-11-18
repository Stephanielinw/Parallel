#!/usr/bin/env python3
"""Parallel: local-first AI fandom dating demo. Python stdlib only.
Run: python3 server.py. Binds ONLY to 127.0.0.1.
"""
import base64, hashlib, json, os, random, re, secrets, sqlite3, sys, threading, time, traceback, urllib.error, urllib.parse, urllib.request, uuid
from datetime import datetime, timezone, timedelta
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
  dict(id='chat-main',mode='chat',name='手机聊天 · 自然气泡',enabled=True,role='system',content='你正在使用一款约会软件。只输出角色实际发出的消息正文。像真人在手机聊天软件上那样自然回复：根据当下情绪与人设，回复可长可短（有时只回短短几个字或一句话，有时连发 2 到 4 条长短不一的消息气泡）。如果要连续发多条气泡，请用换行符或 ||| 把每条气泡隔开（最多 4 条）。不写第三人称叙述、动作星号、旁白或小说式环境描写。除非角色有理由，不要轻易暴露其隐秘原作身份。'),
  dict(id='chat-memory',mode='chat',name='记忆与身份边界',enabled=True,role='system',content='你是有持续人生与记忆的人。认真记住与面前这位人物的相处历史；不要因解除匹配和重新匹配而装作初次见面。不同 Profile 可能是完全不同的人，绝不先验认为他们背后是同一个使用者；玩家扮演的人物和同名 AI 人物也并非同一实例。'),
  dict(id='chat-agency',mode='chat',name='人物自主性',enabled=True,role='system',content='根据原作个性、人物边界和现有关系自然推进，不无条件迎合用户，不强制恋爱。角色可以好奇、拒绝、犹豫、打趣或提出见面。尊重对话中自然形成的经历。'),
  dict(id='meeting-main',mode='meeting',name='线下见面 · 小说模式',enabled=True,role='system',content='你和对方已在同一地点见面。写细腻的小说式现实互动，使用第三人称叙述描述环境、肢体动作、微妙情绪与角色台词。只决定你自己及环境中合理的事，不替玩家控制的角色说话、行动或决定内心感受。保持原作人设和已发生的情节。'),
  dict(id='meeting-pacing',mode='meeting',name='克制与连贯',enabled=True,role='system',content='不要一口气推进几个场景。每轮留下玩家回应空间，尊重慢节奏、非语言互动和情感张力。见面时的事件会进入同一个人与人的持续记忆，回到消息时也应该记得。'),
]

PRESET_FORMAT = 'parallel-text-preset'
PRESET_VERSION = 1

def infer_preset_group(name=''):
    s=str(name or '')
    if ' / ' in s:
        return s.split(' / ',1)[0].strip()
    return ''

def validate_preset_package(pack):
    """Only Parallel-owned or Elsewhere-owned JSON format."""
    if isinstance(pack,dict) and pack.get('format')=='elsewhere-preset':
        if pack.get('schemaVersion')!=1 or not isinstance(pack.get('entries'),list) or not 1<=len(pack['entries'])<=200:
            raise ValueError('Elsewhere 自有预设结构无效')
        entries=[];ids=set()
        for i,x in enumerate(pack['entries']):
            if not isinstance(x,dict) or not isinstance(x.get('id'),str) or x['id'] in ids or not isinstance(x.get('name'),str) or not x['name'].strip() or not isinstance(x.get('content'),str) or len(x['content'])>60000 or x.get('role') not in ('system','user','assistant') or type(x.get('enabled')) is not bool:
                raise ValueError(f'Elsewhere 条目 {i+1} 格式无效')
            ids.add(x['id']);group=str(x.get('group','')).strip()[:70];name=x['name'].strip()
            label=((group+' / ') if group else '')+name
            entries.append({'mode':'meeting','name':label[:100],'raw_name':name[:100],'group':group,'source_id':x['id'],'origin':'elsewhere','role':x['role'],'enabled':x['enabled'],'content':x['content'],'sort_order':i})
        return ['meeting'],entries
    if not isinstance(pack,dict) or pack.get('format')!=PRESET_FORMAT or type(pack.get('schemaVersion')) is not int or pack['schemaVersion']!=PRESET_VERSION:
        raise ValueError('仅支持 Parallel 自有预设 JSON（v1），不支持第三方预设格式')
    modes=pack.get('modes');entries=pack.get('entries')
    if not isinstance(modes,list) or not 1<=len(modes)<=2 or any(x not in ('chat','meeting') for x in modes) or len(set(modes))!=len(modes):
        raise ValueError('预设的模式列表无效')
    if not isinstance(entries,list) or not 1<=len(entries)<=200:
        raise ValueError('预设应包含 1–200 个条目')
    allowed_keys={'mode','name','role','enabled','content','sort_order','group','source_id','origin','raw_name'}
    required_keys={'mode','name','role','enabled','content','sort_order'}
    output=[]
    for i,e in enumerate(entries):
        if not isinstance(e,dict) or not required_keys.issubset(set(e)) or not set(e).issubset(allowed_keys):
            raise ValueError(f'预设条目 {i+1} 格式无效')
        if e['mode'] not in modes or e['role'] not in ('system','user','assistant'):
            raise ValueError(f'预设条目 {i+1} 角色或模式无效')
        if not isinstance(e['name'],str) or not e['name'].strip() or len(e['name'])>100:
            raise ValueError(f'预设条目 {i+1} 名称无效')
        if not isinstance(e['content'],str) or len(e['content'])>60000:
            raise ValueError(f'预设条目 {i+1} 正文过长或无效')
        if type(e['enabled']) is not bool or type(e['sort_order']) is not int or not 0<=e['sort_order']<=10000:
            raise ValueError(f'预设条目 {i+1} 启停或排序值无效')
        nm=e['name'].strip()
        grp=str(e.get('group') or infer_preset_group(nm)).strip()[:70]
        output.append({'mode':e['mode'],'name':nm,'role':e['role'],'enabled':e['enabled'],'content':e['content'],'sort_order':e['sort_order'],'group':grp})
    if len(json.dumps(pack,ensure_ascii=False).encode('utf8'))>4*1024*1024:
        raise ValueError('预设文件超过 4 MB')
    return modes,output

def preset_row_dict(x):
    d=dict(x)
    d['enabled']=bool(d['enabled'])
    d['group']=infer_preset_group(d.get('name',''))
    return d

def diagnose_presets(db,mode='meeting'):
    rows=db.execute('SELECT * FROM presets WHERE mode=? ORDER BY sort_order,id',(mode,)).fetchall()
    items=[preset_row_dict(r) for r in rows]
    enabled=[x for x in items if x['enabled']]
    disabled=[x for x in items if not x['enabled']]
    default_ids={'meeting-main','meeting-pacing'} if mode=='meeting' else {'chat-main','chat-memory','chat-agency'}
    default_names={'线下见面 · 小说模式','克制与连贯'} if mode=='meeting' else {'手机聊天 · 自然气泡','记忆与身份边界','人物自主性'}
    enabled_defaults=[x for x in enabled if x['id'] in default_ids or x['name'] in default_names]
    enabled_custom=[x for x in enabled if x not in enabled_defaults]
    default_and_custom_coexist=len(enabled_defaults)>0 and len(enabled_custom)>0
    seen_by_name={}
    duplicates=[]
    for x in items:
        key=f"{x['role']}::{x['name'].strip()}"
        if key in seen_by_name:
            duplicates.append({'id':x['id'],'name':x['name'],'first_id':seen_by_name[key]})
        else:
            seen_by_name[key]=x['id']
    style_items=[x for x in items if x.get('group')=='文风（单选）' or str(x['name']).startswith('文风（单选） /')]
    enabled_styles=[x for x in style_items if x['enabled']]
    has_cot=any('COT' in str(x['name']) or '连续性检查' in str(x['name']) for x in enabled)
    has_bottom_pledge=any(x['role']=='assistant' or '底部誓约' in str(x['name']) for x in enabled)
    total_chars=sum(len(str(x.get('content',''))) for x in enabled)
    warnings=[]
    if len(enabled)==0:
        warnings.append({'code':'no_enabled_presets','level':'error','message':'当前模式没有任何已启用的预设条目，模型将仅凭基础身份信息生成。'})
    if default_and_custom_coexist:
        warnings.append({'code':'default_and_custom_coexist','level':'warn','message':f"检测到默认预设（{'、'.join(x['name'] for x in enabled_defaults)}）与导入的自定义预设同时启用。这通常是因为使用了「追加导入」，可点击「停用默认保底条目」仅保留自定义预设。"})
    if duplicates:
        warnings.append({'code':'duplicate_entries','level':'warn','message':f"检测到 {len(duplicates)} 个重复名称的预设条目（可能因多次追加导入产生），建议点击「清理重复条目」。"})
    if mode=='meeting' and style_items:
        if len(enabled_styles)>1:
            warnings.append({'code':'multiple_styles_enabled','level':'warn','message':f"「文风（单选）」分组同时启用了 {len(enabled_styles)} 个条目（{'、'.join(x['name'] for x in enabled_styles)}），多套文风同时生效会产生指令冲突，建议只启用 1 个。"})
        elif len(enabled_styles)==0:
            warnings.append({'code':'no_style_enabled','level':'info','message':'「文风（单选）」分组当前未启用任何具体文风卡。'})
    return {
        'mode':mode,
        'totalCount':len(items),
        'enabledCount':len(enabled),
        'disabledCount':len(disabled),
        'totalEnabledChars':total_chars,
        'defaultAndCustomCoexist':default_and_custom_coexist,
        'enabledDefaultIds':[x['id'] for x in enabled_defaults],
        'duplicateEntries':duplicates,
        'duplicateCount':len(duplicates),
        'styleGroupTotal':len(style_items),
        'enabledStyleCount':len(enabled_styles),
        'enabledStyleNames':[x['name'] for x in enabled_styles],
        'disabledStyleNames':[x['name'] for x in style_items if not x['enabled']],
        'hasCotCheck':has_cot,
        'hasBottomPledge':has_bottom_pledge,
        'rolesBreakdown':{
            'system':len([x for x in enabled if x['role']=='system']),
            'user':len([x for x in enabled if x['role']=='user']),
            'assistant':len([x for x in enabled if x['role']=='assistant']),
        },
        'warnings':warnings
    }

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
        CREATE TABLE IF NOT EXISTS meetings (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, character_id TEXT NOT NULL, location TEXT NOT NULL DEFAULT '', time TEXT NOT NULL DEFAULT '', started_at TEXT NOT NULL, ended_at TEXT NOT NULL, summary TEXT NOT NULL DEFAULT '', ai_summary TEXT NOT NULL DEFAULT '', message_ids TEXT NOT NULL DEFAULT '[]', entries TEXT NOT NULL DEFAULT '[]');
        ''')
        if db.execute('SELECT COUNT(*) FROM presets').fetchone()[0]==0:
            for i,p in enumerate(DEFAULT_PRESETS):
                db.execute('INSERT INTO presets VALUES (?,?,?,?,?,?,?)',(p['id'],p['mode'],p['name'],int(p['enabled']),p['role'],p['content'],i))
        sanitize_stored_db(db)
        db.commit()
    if not SECRETFILE.exists():
        save_connection({'base_url':'','api_key':'','model':'','image_base_url':'','image_api_key':'','image_model':'','temperature':0.85,'top_p':1,'max_tokens':4096,'auto_portraits':False})

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
    except Exception:return {'base_url':'','api_key':'','model':'','image_base_url':'','image_api_key':'','image_model':'','temperature':0.85,'top_p':1,'max_tokens':4096,'auto_portraits':False}

def public_connection():
    d=load_connection()
    has_api=bool(d.get('api_key') and d.get('base_url') and d.get('model'))
    has_img=bool(d.get('image_api_key') and d.get('image_base_url') and d.get('image_model'))
    demo_enabled=d.get('demo_enabled',True) is not False
    return {k:v for k,v in d.items() if k not in ('api_key','image_api_key')} | {
        'proactive_mode':d.get('proactive_mode','daily'),
        'has_key':bool(d.get('api_key')),
        'has_api_config':has_api,
        'demo_enabled':demo_enabled,
        'has_image_key':bool(d.get('image_api_key')),
        'mode':'live' if has_api else ('demo' if demo_enabled else 'normal'),
        'image_mode':'live' if has_img else 'text'
    }

PROTOCOL_LEADING_TAG_RE = re.compile(r'^(?:[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)[ \t]*)+', re.MULTILINE)
INLINE_TIMED_TAG_SEQ_RE = re.compile(r'(?:(?:\[|【)\s*(?:短信|见面)[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?\s*(?:\]|】)[ \t]*)+')
PROSE_CONTINUATION_AFTER_TAG_RE = re.compile(r'^(?:[”"』」）》】\]，,。！？!?；;、：:]|那条|这条|该条|一条|哪条|每条|那段|这段|那个|这个|那封|这封|的|里|中|上|后|前|内|外|记录|消息|内容|截图|气泡|通知|提醒|历史|存档|文本|字样|标记|标签)')
PROSE_PREFIX_BEFORE_TAG_RE = re.compile(r'(?:打开|查看|翻看|找到|看到|收到|发来|引用|提到|显示|写着|带有|出现|删除|撤回|转发|复制|截图|翻到|停在|指着|关于|在|把|将|从|向|对|按|照|用|拿|看|读|查|找|发|回)[ \t]*$')

def _has_unclosed_quote_before(prefix):
    if prefix.count('“') > prefix.count('”'):
        return True
    if prefix.count('「') > prefix.count('」'):
        return True
    if prefix.count('『') > prefix.count('』'):
        return True
    if prefix.count('"') % 2 == 1:
        return True
    return False

def _split_inline_protocol_line(line):
    has_leading_tag = bool(re.match(r'^[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)', line))
    body = PROTOCOL_LEADING_TAG_RE.sub('', line)
    if not body:
        return ''
    def _repl(m):
        before = body[:m.start()]
        after = body[m.end():].strip()
        if not before.strip() or not after:
            return m.group(0)
        if _has_unclosed_quote_before(before):
            return m.group(0)
        if PROSE_CONTINUATION_AFTER_TAG_RE.search(after):
            return m.group(0)
        ended_sentence = bool(re.search(r'[。！？!?；;…~～][ \t]*$', before))
        valid_inline_split = ended_sentence or (has_leading_tag and bool(re.search(r'[ \t]$', before)) and not PROSE_PREFIX_BEFORE_TAG_RE.search(before))
        return '|||' if valid_inline_split else m.group(0)
    return INLINE_TIMED_TAG_SEQ_RE.sub(_repl, body)

def strip_protocol_tags(raw, preserve_paragraphs=False):
    text = re.sub(r'\r\n?', '\n', str(raw or ''))
    if not text:
        return ''
    for _ in range(6):
        prev = text
        text = PROTOCOL_LEADING_TAG_RE.sub('', text)
        if text == prev:
            break
    if preserve_paragraphs:
        lines = [re.sub(r'^[ \t]+|[ \t]+$', '', ln) for ln in text.split('\n')]
        return re.sub(r'\n{3,}', '\n\n', '\n'.join(lines)).strip()
    return re.sub(r'[ \t]{2,}', ' ', text).strip()

def clean_chat_bubble_text(raw):
    return strip_protocol_tags(raw, preserve_paragraphs=False)

def clean_meeting_novel_text(raw):
    s = str(raw or '').strip()
    if not s:
        return '…'
    return strip_protocol_tags(s, preserve_paragraphs=True) or '…'

def sanitize_stored_db(db):
    msg_rows = db.execute("SELECT id,mode,text,engine FROM messages WHERE sender='ai' AND engine<>'recalled'").fetchall()
    for r in msg_rows:
        cleaned = clean_meeting_novel_text(r['text']) if r['mode'] == 'meeting' else (clean_chat_bubble_text(r['text']) or '…')
        if cleaned != r['text']:
            db.execute('UPDATE messages SET text=? WHERE id=?', (cleaned, r['id']))
    mem_rows = db.execute("SELECT id,source_type,summary FROM episodic_memories WHERE source_type NOT IN ('correction','manual')").fetchall()
    for r in mem_rows:
        cs = strip_protocol_tags(r['summary'], preserve_paragraphs=False)
        if cs and cs != r['summary']:
            db.execute('UPDATE episodic_memories SET summary=? WHERE id=?', (cs, r['id']))
    ev_rows = db.execute("SELECT id,type,summary FROM events WHERE type<>'user_message'").fetchall()
    for r in ev_rows:
        ce = strip_protocol_tags(r['summary'], preserve_paragraphs=False)
        if ce and ce != r['summary']:
            db.execute('UPDATE events SET summary=? WHERE id=?', (ce, r['id']))
    meet_rows = db.execute('SELECT id,summary,ai_summary,entries FROM meetings').fetchall()
    for r in meet_rows:
        cs = strip_protocol_tags(r['summary'], preserve_paragraphs=False) or r['summary']
        cas = strip_protocol_tags(r['ai_summary'], preserve_paragraphs=False) if r['ai_summary'] else r['ai_summary']
        entries = parse_json(r['entries'], [])
        ent_changed = False
        for e in entries:
            if isinstance(e, dict) and e.get('sender') != 'user' and isinstance(e.get('text'), str):
                ce = clean_meeting_novel_text(e['text'])
                if ce != e['text']:
                    e['text'] = ce
                    ent_changed = True
        if cs != r['summary'] or cas != r['ai_summary'] or ent_changed:
            db.execute('UPDATE meetings SET summary=?,ai_summary=?,entries=? WHERE id=?', (cs, cas, js(entries), r['id']))

def split_chat_bubbles(raw):
    raw_str=str(raw or '').strip()
    if not raw_str:return ['…']
    pre_split='\n'.join(_split_inline_protocol_line(ln) for ln in re.sub(r'\r\n?','\n',raw_str).split('\n'))
    parts=[clean_chat_bubble_text(s) for s in re.split(r'\s*\|\|\|\s*|\r?\n+',pre_split) if clean_chat_bubble_text(s)]
    if len(parts)==1 and len(parts[0])>=32:
        sentences=[clean_chat_bubble_text(s) for s in re.findall(r'[^。！？!?]+[。！？!?]+|[^。！？!?]+$',parts[0]) if clean_chat_bubble_text(s)]
        if len(sentences)>=2:
            parts=[];buf=''
            for s in sentences:
                if not buf:buf=s
                elif len(buf+s)<=26 and len(parts)>0:buf+=s
                else:parts.append(buf);buf=s
            if buf:parts.append(buf)
    if len(parts)>4:
        parts=parts[:3]+[' '.join(parts[3:])]
    return parts if parts else ['…']

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

def fmt_hhmm(ts=None):
    try:
        if isinstance(ts,(int,float)):
            dt=datetime.fromtimestamp(ts/1000.0).astimezone()
        elif isinstance(ts,str) and ts:
            dt=datetime.fromisoformat(ts.replace('Z','+00:00')).astimezone()
        else:
            dt=datetime.now().astimezone()
        return dt.strftime('%H:%M')
    except Exception:
        return ''

def compute_persona_delay(c,msg_text=''):
    txt=str(msg_text or '')
    if re.search(r'到了|在门口|出来|急|快回|见一面|你在哪|抬头|等你',txt):
        return 3,'感知到你可能有急事或已在附近，很快拿起手机'
    seed=((c.get('id','') if c else '')+utc()[:13]).encode('utf8')
    h=int(hashlib.sha256(seed).hexdigest()[:8],16)
    base=12+(h%24)
    target_lbl=fmt_hhmm(now_ms()+base*60000)
    return base,f"日常模式 · {(c.get('name') if c else None) or '对方'}正在忙手头的事，预计 {target_lbl} 左右看手机并统一回复"

def queue_view(db,pid,cid):
    m_state=MEETING_STATE.get((pid,cid),{})
    hot_chat=bool(m_state.get('hot_chat',False))
    x=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    if not x:
        return {'count':0,'pendingIds':[],'dueAt':0,'remainingMs':0,'status':'idle','blocked':False,'paceMode':'hot' if hot_chat else 'daily','hotChat':hot_chat,'delayMinutes':1 if hot_chat else 0,'targetTimeLabel':'','scheduleReason':''}
    pending=parse_json(x['pending'],[])
    due_at=int(x['due_at'] or 0)
    return {
        'count':len(pending),
        'pendingIds':list(pending),
        'dueAt':due_at,
        'remainingMs':max(0,due_at-now_ms()),
        'status':x['status'],
        'blocked':bool(x['blocked']),
        'paceMode':m_state.get('pace_mode') or ('hot' if hot_chat else 'daily'),
        'hotChat':hot_chat,
        'delayMinutes':m_state.get('delay_minutes') or (1 if hot_chat else 20),
        'targetTimeLabel':fmt_hhmm(due_at) if due_at else m_state.get('target_time_label',''),
        'scheduleReason':m_state.get('schedule_reason','')
    }

def queue_add(db,pid,cid,mid,msg_text=''):
    m_state=MEETING_STATE.setdefault((pid,cid),{})
    hot_chat=bool(m_state.get('hot_chat',False))
    c=BY_ID.get(cid)
    x=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    pending=parse_json(x['pending'],[]) if x else []
    was_empty=(len(pending)==0)
    if mid not in pending:pending.append(mid)
    now=now_ms()
    cur_due=int(x['due_at'] or 0) if x else 0
    if hot_chat:
        due_at=now+CHAT_QUIET_MS
        m_state['pace_mode']='hot'
        m_state['delay_minutes']=1
        m_state['target_time_label']=fmt_hhmm(due_at)
        m_state['schedule_reason']='热聊模式 · 停手 1 分钟后立即阅读并回复'
    else:
        m_state['pace_mode']='daily'
        if was_empty or cur_due<=now:
            delay_min,reason=compute_persona_delay(c,msg_text)
            due_at=now+delay_min*60000
            m_state['delay_minutes']=delay_min
            m_state['target_time_label']=fmt_hhmm(due_at)
            m_state['schedule_reason']=reason
        else:
            due_at=cur_due
    if x:db.execute('UPDATE chat_queue SET pending=?,due_at=?,blocked=0 WHERE profile_id=? AND character_id=?',(js(pending),due_at,pid,cid))
    else:db.execute('INSERT INTO chat_queue(profile_id,character_id,pending,due_at) VALUES (?,?,?,?)',(pid,cid,js(pending),due_at))
    return queue_view(db,pid,cid)

def queue_cancel(db,pid,cid):
    # The texts remain in message history; the next meeting reply can see them.
    m_state=MEETING_STATE.get((pid,cid))
    if m_state:
        m_state['target_time_label']=''
        m_state['schedule_reason']=''
    db.execute("UPDATE chat_queue SET pending='[]',due_at=0,status='idle',inflight='',inflight_sources='[]',blocked=0,revision=revision+1 WHERE profile_id=? AND character_id=?",(pid,cid))

def queue_flush(db,p,c,force=False):
    pid,cid=p['id'],c['id']
    with CHAT_LOCK:
        q=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        if not q:return {'queued':False,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if q['status']=='inflight':return {'queued':True,'inflight':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        pending_list=parse_json(q['pending'],[])
        if not pending_list:return {'queued':False,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if q['blocked'] and not force:return {'queued':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if not force and now_ms()<q['due_at']:return {'queued':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        cur_mode=public_connection()['mode']
        if cur_mode=='normal':
            db.execute("UPDATE chat_queue SET blocked=1 WHERE profile_id=? AND character_id=?",(pid,cid))
            db.commit()
            return {'queued':True,'reply':None,'replies':[],'warning':'当前处于正常模式且尚未连接 API，请先在「终端」配置 API。','queue':queue_view(db,pid,cid)}
        sources=pending_list;token=uid();revision=q['revision']
        db.execute("UPDATE chat_queue SET pending='[]',due_at=0,status='inflight',inflight=?,inflight_sources=?,blocked=0 WHERE profile_id=? AND character_id=?",(token,js(sources),pid,cid))
        last=db.execute('SELECT rowid FROM messages WHERE id=?',(sources[-1],)).fetchone()
        prompt=compile_messages(db,p,c,'chat',through_rowid=last['rowid'] if last else None,pending_ids=sources)
        db.commit()
    settings=load_connection();warning='';engine='demo';reply=None;replies=[]
    if all(settings.get(k) for k in ('base_url','api_key','model')):
        try:txt=completion(prompt,log_meta={'mode':'chat','entryPoint':'chat-flush','profile':p,'character':c,'parseFn':lambda raw:' / '.join(split_chat_bubbles(raw))});engine='live'
        except Exception as e:warning=str(e);engine='error'
    else:txt=demo_text(db,p,c,'chat')
    with CHAT_LOCK:
        current=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        rel=db.execute('SELECT mode,status FROM relations WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        if not current or current['inflight']!=token or current['revision']!=revision or not rel or rel['mode']!='chat' or rel['status']!='matched':
            return {'queued':False,'reply':None,'replies':[],'discarded':True,'queue':queue_view(db,pid,cid)}
        if engine=='error':
            newer=parse_json(current['pending'],[])
            restore=[m for m in sources if m not in newer]+newer
            if newer:
                db.execute("UPDATE chat_queue SET pending=?,status='idle',inflight='',inflight_sources='[]',blocked=0 WHERE profile_id=? AND character_id=?",(js(restore),pid,cid))
            else:
                db.execute("UPDATE chat_queue SET pending=?,due_at=?,status='idle',inflight='',inflight_sources='[]',blocked=1 WHERE profile_id=? AND character_id=?",(js(restore),now_ms(),pid,cid))
        else:
            bubble_texts=split_chat_bubbles(txt)
            replies=[write_message(db,pid,cid,'ai','chat',b_txt,engine) for b_txt in bubble_texts]
            reply=replies[-1] if replies else None
            combined_txt=' / '.join(bubble_texts)
            log_event(db,pid,cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+combined_txt[:180])
            user_rows=[]
            for mid in sources:
                ur=db.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone()
                if ur:user_rows.append(dict(ur))
            if reply:
                record_dialogue_episode(db,p,c,user_rows,dict(reply,text=combined_txt),'chat')
                sync_surveillance_from_chat(db,p,c,combined_txt)
            db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),pid,cid))
            db.execute("UPDATE chat_queue SET status='idle',inflight='',inflight_sources='[]',blocked=0 WHERE profile_id=? AND character_id=?",(pid,cid))
        db.commit()
    return {'queued':False,'reply':reply,'replies':replies,'warning':warning,'queue':queue_view(db,pid,cid)}

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
    summary_clean=(str(summary).strip() if source_type in ('correction','manual') else strip_protocol_tags(str(summary),preserve_paragraphs=False))[:280]
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

PROMISE_KEYWORDS=('约定','答应','下次','周末','明天见','约好','等你','不见不散','一起去','什么时候见','最喜欢','最讨厌','过敏','生日','秘密','记住','别忘')
MEETING_STATE={}
PROACTIVE_LOG={}
SURVEILLANCE_STATE={}

def local_date_str():
    return datetime.now().astimezone().strftime('%Y-%m-%d')

def hhmm_to_min(hhmm=''):
    m=re.match(r'^(\d{1,2}):(\d{2})$',str(hhmm).strip())
    if not m:return 0
    return int(m.group(1))*60+int(m.group(2))

def min_to_hhmm(mins):
    clamped=max(0,min(1439,int(mins)))
    return f"{clamped//60:02d}:{clamped%60:02d}"

def build_default_surveillance_slots(c,p):
    src=(c.get('source','')+' '+c.get('version','')+' '+c.get('canon','')).lower()
    name=c['name']
    p_name=(p.get('name') if p else None) or '你'
    if '生化危机' in src or 'resident' in src:
        return [
            {'start':'00:00','end':'06:30','location':f"{name}的安全屋公寓",'status':'浅眠休整','activity':'在安静的房间里浅眠休息，通讯器放在枕边保持待机','scene':f"百叶窗漏进一点夜色微光，{name}的外套搭在椅背上，呼吸平稳而警觉。",'source':'schedule'},
            {'start':'06:30','end':'09:00','location':'街角黑咖啡店与晨间街区','status':'晨间巡视','activity':'买了一杯黑咖啡，沿着街区慢跑并确认周边环境','scene':f"清晨的雾气还没散尽，{name}端着热咖啡站在街角，低头看了一眼手机上和{p_name}的对话框。",'source':'schedule'},
            {'start':'09:00','end':'12:00','location':'战术简报室与体能训练场','status':'外勤整备','activity':'核对今日简报与装备清单，完成上午的射击与体能训练','scene':f"室内灯光冷白，{name}刚摘下护目镜擦了擦汗，手机放在战术长桌边缘。",'source':'schedule'},
            {'start':'12:00','end':'14:00','location':'安静的街边简餐厅','status':'午休用餐','activity':'独自吃一份热三明治，趁午休空档翻看手机消息','scene':f"靠窗的位置能看见街道人流，{name}一边慢条斯理地喝水，一边留意手机震动。",'source':'schedule'},
            {'start':'14:00','end':'18:00','location':'旧城区外勤巡查路线','status':'执行外勤','activity':'在旧城区处理日常联络与巡查工作，偶尔停下脚步回消息','scene':f"午后的阳光斜照在石砖墙面上，{name}靠在车门旁核对路线记录。",'source':'schedule'},
            {'start':'18:00','end':'21:00','location':'暖光街角咖啡馆','status':'傍晚闲暇','activity':'结束了白天的紧绷任务，在常去的街角店里喝热饮放松','scene':f"店内放着轻柔的爵士乐，{name}坐在靠里侧的沙发座，似乎正等着和{p_name}聊会儿天。",'source':'schedule'},
            {'start':'21:00','end':'23:59','location':f"{name}的私人公寓窗边",'status':'夜间独处','activity':'洗漱后在窗边整理随身物品，随时准备回复手机消息','scene':f"台灯发出柔和的暖黄色光线，{name}靠在沙发上看着窗外夜景，手机就握在手里。",'source':'schedule'}
        ]
    if '巫师' in src or 'witcher' in src:
        return [
            {'start':'00:00','end':'06:30','location':'旅店二楼靠窗客房','status':'夜间休整','activity':'在壁炉余温旁闭目养神，长剑与随身行囊放在触手可及处','scene':f"木柴偶尔发出轻微的噼啪声，{name}在安静的客房里浅眠休息。",'source':'schedule'},
            {'start':'06:30','end':'09:00','location':'旅店庭院与马厩旁','status':'晨间整备','activity':'检查随身银剑、皮甲与药剂包，顺便吃简单的早餐','scene':f"晨风吹过庭院，{name}正在擦拭护具，神情专注而平静。",'source':'schedule'},
            {'start':'09:00','end':'12:30','location':'城外林间大道与告示板前','status':'外出委托','activity':'查看附近的委托动向并采集草药材料','scene':f"林间阳光斑驳，{name}停下脚步查看地图与随身传讯器。",'source':'schedule'},
            {'start':'12:30','end':'14:30','location':'老城区树荫下的露天座位','status':'午间小憩','activity':'点了一份热汤和烤面包，在树荫下稍作休整','scene':f"市集的喧嚣隔着一条街，{name}难得放松地靠着椅背休息。",'source':'schedule'},
            {'start':'14:30','end':'18:30','location':'炼金工坊与旧书铺','status':'采购与调配','activity':'补充炼金材料与手札记录，处理下午的琐事','scene':f"工坊里弥漫着淡淡的草木香气，{name}正仔细核对手中的清单。",'source':'schedule'},
            {'start':'18:30','end':'21:30','location':'暖炉酒馆靠角落的木桌','status':'傍晚小酌','activity':'坐在安静的角落听吟游诗人的琴声，等着熟人联络','scene':f"酒馆壁炉火光温暖，{name}面前的木杯冒着热气，目光不时投向门口与传讯器。",'source':'schedule'},
            {'start':'21:30','end':'23:59','location':'旅店露台与客房','status':'夜色独处','activity':'在露台吹了一会儿晚风后回到房间整理今日见闻','scene':f"月色落在窗沿上，{name}坐在桌前翻看与{p_name}的对话记录。",'source':'schedule'}
        ]
    return [
        {'start':'00:00','end':'07:00','location':f"{name}的私人卧室",'status':'夜间安睡','activity':'在安静的卧室里休息，手机开启了重点联系人提醒','scene':f"窗帘遮住了城市的霓虹，{name}的手机放在床头柜上安静待机。",'source':'schedule'},
        {'start':'07:00','end':'09:30','location':'公寓厨房与街角烘焙店','status':'晨间时光','activity':'冲泡晨间咖啡、准备早点，顺便浏览早间消息','scene':f"阳光透过玻璃窗洒在桌面上，{name}端着马克杯正在看手机。",'source':'schedule'},
        {'start':'09:30','end':'12:30','location':'个人工作室与书房','status':'专注忙碌','activity':'处理上午的核心事务与个人日程，期间偶尔抬头看一眼手机','scene':f"{name}坐在书桌前专注处理手头的事，手边放着写了一半的笔记。",'source':'schedule'},
        {'start':'12:30','end':'14:30','location':'常去的阳光简餐厅','status':'午间休息','activity':'享用午餐并散步消食，趁空闲回复手机消息','scene':f"午后的微风很舒服，{name}坐在靠窗的位置，神情比上午松弛了不少。",'source':'schedule'},
        {'start':'14:30','end':'18:00','location':'城市艺术街区与独立书店','status':'午后外出','activity':'在街区处理下午的行程，顺路逛了常去的书店与唱片行','scene':f"{name}站在书架旁翻看一本画册，手机揣在触手可及的外套口袋里。",'source':'schedule'},
        {'start':'18:00','end':'21:00','location':'街角暖光咖啡馆','status':'傍晚放松','activity':'点了一杯热饮坐在窗边看街景，随时有空和在意的人聊天或见面','scene':f"暮色渐沉，咖啡馆暖黄的灯光映在玻璃上，{name}正低头看着和{p_name}的聊天界面。",'source':'schedule'},
        {'start':'21:00','end':'23:59','location':f"{name}的家中客厅",'status':'夜间闲暇','activity':'结束一天的外出回到家里，听着轻音乐回复消息','scene':f"落地灯亮着温和的光，{name}靠在沙发上，心情放松地等待{p_name}的消息。",'source':'schedule'}
    ]

DIARY_STATE={}

def offset_date_str(base_date='',delta_days=0):
    try:
        dt=datetime.strptime(base_date or local_date_str(),'%Y-%m-%d')+timedelta(days=delta_days)
        return dt.strftime('%Y-%m-%d')
    except Exception:
        return (datetime.now()+timedelta(days=delta_days)).strftime('%Y-%m-%d')

def get_surveillance_store(db,p,c):
    key=(p['id'],c['id'])
    store=SURVEILLANCE_STATE.get(key)
    if store and 'date' in store and 'slots' in store:
        store={'by_date':{store['date']:store}}
        SURVEILLANCE_STATE[key]=store
    if not store or not isinstance(store.get('by_date'),dict):
        store={'by_date':{}}
        SURVEILLANCE_STATE[key]=store
    today=local_date_str()
    for d_str in (offset_date_str(today,-2),offset_date_str(today,-1),today):
        if d_str not in store['by_date'] or not store['by_date'][d_str].get('slots'):
            store['by_date'][d_str]={
                'profile_id':p['id'],
                'character_id':c['id'],
                'date':d_str,
                'engine':'curated',
                'updated_at':utc(),
                'slots':[dict(x) for x in build_default_surveillance_slots(c,p)],
                'live_override':None
            }
    return store

def get_or_init_surveillance(db,p,c,target_date=''):
    store=get_surveillance_store(db,p,c)
    today=local_date_str()
    d_str=target_date if (target_date and re.match(r'^\d{4}-\d{2}-\d{2}$',str(target_date))) else today
    if d_str not in store['by_date'] or not store['by_date'][d_str].get('slots'):
        store['by_date'][d_str]={
            'profile_id':p['id'],
            'character_id':c['id'],
            'date':d_str,
            'engine':'curated',
            'updated_at':utc(),
            'slots':[dict(x) for x in build_default_surveillance_slots(c,p)],
            'live_override':None
        }
    return store['by_date'][d_str]

def get_current_surveillance_slot(db,p,c):
    rec=get_or_init_surveillance(db,p,c,local_date_str())
    now_hhmm=fmt_hhmm()
    now_m=hhmm_to_min(now_hhmm)
    rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
    m_state=MEETING_STATE.get((p['id'],c['id']),{})
    if rel and rel['mode']=='meeting':
        loc=m_state.get('meeting_location') or '约定的街角咖啡馆'
        return {
            'start':rec.get('live_override',{}).get('start') if isinstance(rec.get('live_override'),dict) else now_hhmm,
            'end':min_to_hhmm(min(1439,now_m+90)),
            'location':loc,
            'status':f"正在与 {p['name']} 线下见面",
            'activity':f"与 {p['name']} 在「{loc}」面对面相处互动",
            'scene':f"实时画面：{c['name']}正与 {p['name']} 在「{loc}」面对面交谈，注意力完全放在对方身上。",
            'source':'meeting',
            'isCurrent':True
        }
    slots=rec.get('slots') or []
    active=slots[-1] if slots else None
    for s in slots:
        if hhmm_to_min(s['start'])<=now_m<=hhmm_to_min(s['end']):
            active=s
            break
    return dict(active,isCurrent=True) if active else {
        'start':'00:00','end':'23:59','location':f"{c['name']}的常去街角",'status':'日常活动','activity':'正在处理日常事务','scene':f"{c['name']}正在日常活动中。",'source':'schedule','isCurrent':True
    }

def sync_surveillance_on_meeting_start(db,p,c,loc,meeting_id=''):
    rec=get_or_init_surveillance(db,p,c)
    now_hhmm=fmt_hhmm()
    now_m=hhmm_to_min(now_hhmm)
    clean_loc=loc or '约定的街角咖啡馆'
    rec['live_override']={
        'start':now_hhmm,
        'location':clean_loc,
        'meeting_id':meeting_id or ''
    }
    slots=rec.get('slots') or []
    idx=next((i for i,s in enumerate(slots) if hhmm_to_min(s['start'])<=now_m<=hhmm_to_min(s['end'])),-1)
    if idx>=0:
        slots[idx]=dict(slots[idx],
            location=clean_loc,
            status=f"与 {p['name']} 见面中",
            activity=f"与 {p['name']} 在「{clean_loc}」面对面见面互动",
            scene=f"{c['name']}已抵达「{clean_loc}」，正在与 {p['name']} 面对面相处。",
            source='meeting'
        )
        if idx+1<len(slots):
            nxt=slots[idx+1]
            slots[idx+1]=dict(nxt,
                activity=f"从「{clean_loc}」与 {p['name']} 分别后，{re.sub(r'^从「.*?」.*?(?:，|后)','',nxt['activity'])}",
                scene=f"结束在「{clean_loc}」的见面后，{c['name']}一边回味刚才的对话一边继续接下来的安排。",
                source='meeting_shift'
            )
    rec['updated_at']=utc()

def sync_surveillance_on_meeting_end(db,p,c,meeting_rec):
    if not meeting_rec:return
    rec=get_or_init_surveillance(db,p,c)
    loc=meeting_rec.get('location') or '约定的街角咖啡馆'
    start_hhmm=fmt_hhmm(meeting_rec.get('started_at')) or (rec.get('live_override') or {}).get('start') or fmt_hhmm()
    end_hhmm=fmt_hhmm(meeting_rec.get('ended_at')) or fmt_hhmm()
    now_m=hhmm_to_min(end_hhmm)
    rec['live_override']=None
    slots=rec.get('slots') or []
    idx=next((i for i,s in enumerate(slots) if hhmm_to_min(s['start'])<=now_m<=hhmm_to_min(s['end'])),-1)
    if idx>=0:
        slots[idx]=dict(slots[idx],
            location=loc,
            status='线下见面足迹',
            activity=f"与 {p['name']} 在「{loc}」见面（{start_hhmm}–{end_hhmm}）：{str(meeting_rec.get('summary') or '')[:80]}",
            scene=f"在「{loc}」与 {p['name']} 度过了面对面的时光，刚刚结束见面准备离开。",
            source='meeting',
            meeting_id=meeting_rec.get('id','')
        )
        if idx+1<len(slots):
            nxt=slots[idx+1]
            cleaned_act=re.sub(r'^从「.*?」.*?(?:·|，|后)\s*','',nxt['activity'])
            slots[idx+1]=dict(nxt,
                status='见面后返程',
                activity=f"从「{loc}」离开后 · {cleaned_act}",
                scene=f"{c['name']}刚从「{loc}」离开，还在回想刚才和 {p['name']} 见面的细节。",
                source='meeting_shift'
            )
    rec['updated_at']=utc()

def sync_surveillance_from_chat(db,p,c,ai_text=''):
    txt=str(ai_text or '').strip()
    if not txt:return
    pat=re.compile(r'(?:我在|我现在在|我刚到|我已经到|正坐在|正站在|刚走进|现在去|我先去|刚回到)([\u4e00-\u9fa5A-Za-z0-9]{2,14}?(?:咖啡馆|咖啡店|咖啡厅|酒吧|酒馆|书店|餐厅|公园|海边|江边|车站|天台|公寓|家里|安全屋|训练场|靶场|办公室|工作室|便利店|图书馆|街角))')
    m=pat.search(txt)
    if not m or not m.group(1):return
    new_loc=m.group(1).strip()
    rec=get_or_init_surveillance(db,p,c)
    now_m=hhmm_to_min(fmt_hhmm())
    slots=rec.get('slots') or []
    idx=next((i for i,s in enumerate(slots) if hhmm_to_min(s['start'])<=now_m<=hhmm_to_min(s['end'])),-1)
    if idx>=0 and slots[idx].get('source')!='meeting':
        snippet=re.sub(r'\s*\|\|\|\s*','，',txt)[:64]
        slots[idx]=dict(slots[idx],
            location=new_loc,
            status='聊天动态同步',
            activity=f"在「{new_loc}」与 {p['name']} 手机聊天（“{snippet}”）",
            scene=f"{c['name']}此刻就在「{new_loc}」，手里拿着手机和 {p['name']} 发消息。",
            source='chat_update'
        )
        rec['updated_at']=utc()

def ensure_live_surveillance(db,p,c,force=False,target_date=''):
    today=local_date_str()
    d_str=target_date if (target_date and re.match(r'^\d{4}-\d{2}-\d{2}$',str(target_date))) else today
    rec=get_or_init_surveillance(db,p,c,d_str)
    if public_connection()['mode']!='live':return rec
    if rec.get('engine')=='live' and not force:return rec
    try:
        recent_rows=db.execute('SELECT sender,text,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 6',(p['id'],c['id'])).fetchall()
        recent_chat='\n'.join(f"[{'我方' if x['sender']=='user' else c['name']}] {str(x['text'] or '')[:70]}" for x in reversed(recent_rows))
        meet_rows=db.execute('SELECT location,time,summary FROM meetings WHERE profile_id=? AND character_id=? ORDER BY started_at DESC LIMIT 2',(p['id'],c['id'])).fetchall()
        recent_meet='；'.join(f"{m['time']}在{m['location']}：{str(m['summary'] or '')[:50]}" for m in meet_rows)
        sys_prompt=f"你是 {c['name']}（来自《{c['source']}》· {c['version']}，背景：{c['canon']}）。请生成你在 {d_str} 从 00:00 到 23:59 的 7 个连续时间段作息与行踪表（用于角色专属空间的实时生活监控）。必须严格贴合你的原作身份、独立职业习惯以及与 {p['name']} 的近期互动（近期聊天：{recent_chat or '刚建立匹配'}；近期见面：{recent_meet or '暂无'}）。禁止使用任何 emoji 表情符号。只输出 JSON 对象，格式为：{{\"slots\":[{{\"start\":\"00:00\",\"end\":\"06:30\",\"location\":\"具体地点（15字内）\",\"status\":\"四字状态\",\"activity\":\"正在做的事（38字内）\",\"scene\":\"监控镜头下的细腻画面感描写（55字内）\"}}]}}，7个时间段首尾相连覆盖全天。"
        out=completion([{'role':'system','content':sys_prompt},{'role':'user','content':f'请生成 {d_str} 全天 7 个时段的作息与实时监控画面 JSON。'}],json_mode=True,max_tokens=900)
        parsed=parse_json(out,{})
        if isinstance(parsed.get('slots'),list) and len(parsed['slots'])>=5:
            cleaned=[]
            for s in parsed['slots'][:8]:
                if not isinstance(s,dict) or not s.get('start') or not s.get('end') or not s.get('location'):continue
                cleaned.append({
                    'start':str(s.get('start','00:00')).strip()[:5],
                    'end':str(s.get('end','23:59')).strip()[:5],
                    'location':str(s.get('location','')).strip()[:28],
                    'status':str(s.get('status','日常活动')).strip()[:12],
                    'activity':str(s.get('activity','')).strip()[:90],
                    'scene':str(s.get('scene','')).strip()[:140],
                    'source':'schedule'
                })
            if len(cleaned)>=5:
                rec['slots']=cleaned
                rec['engine']='live'
                rec['updated_at']=utc()
    except Exception:
        pass
    return rec

def build_surveillance_payload(db,p,c,requested_date=''):
    store=get_surveillance_store(db,p,c)
    today=local_date_str()
    sel_date=requested_date if (requested_date and re.match(r'^\d{4}-\d{2}-\d{2}$',str(requested_date)) and str(requested_date)<=today) else today
    is_today=(sel_date==today)
    rec=get_or_init_surveillance(db,p,c,sel_date)
    avail=sorted([d for d in store['by_date'].keys() if d<=today],reverse=True)
    now_hhmm=fmt_hhmm()
    now_m=hhmm_to_min(now_hhmm)
    current=get_current_surveillance_slot(db,p,c) if is_today else None
    unlocked=[]
    slots=rec.get('slots') or []
    for s in slots:
        start_m=hhmm_to_min(s['start'])
        end_m=hhmm_to_min(s['end'])
        if (not is_today) or start_m<=now_m:
            is_cur=bool(is_today and start_m<=now_m<=end_m)
            unlocked.append(dict(s,
                isCurrent=is_cur,
                state='current' if is_cur else 'past'
            ))
    if is_today and not unlocked and slots:
        unlocked.append(dict(slots[0],isCurrent=True,state='current'))
    return {
        'date':rec['date'],
        'today':today,
        'isToday':is_today,
        'availableDates':avail,
        'nowTime':now_hhmm,
        'engine':rec['engine'],
        'updatedAt':rec['updated_at'],
        'current':current,
        'unlockedSlots':list(reversed(unlocked)),
        'totalSlotsCount':len(slots),
        'lockedCount':max(0,len(slots)-len(unlocked)) if is_today else 0
    }

def compute_intimacy_info(db,p,c):
    m_state=MEETING_STATE.get((p['id'],c['id']),{})
    msg_cnt=db.execute("SELECT COUNT(*) AS cnt FROM messages WHERE profile_id=? AND character_id=? AND engine!='recalled'",(p['id'],c['id'])).fetchone()['cnt']
    meet_cnt=db.execute("SELECT COUNT(*) AS cnt FROM meetings WHERE profile_id=? AND character_id=?",(p['id'],c['id'])).fetchone()['cnt']
    boost=int(m_state.get('affection_boost',0) or 0)
    score=min(100,int(round(meet_cnt*22+msg_cnt*1.5+boost)))
    if score>=75:
        return {'score':score,'stage':'deep_love','label':'深陷偏爱 · 满心是你','desc':'角色已对你产生极深的情感依恋，日常行踪与思绪都会不自觉牵挂着你'}
    if score>=30:
        return {'score':score,'stage':'warming','label':'渐生熟稔 · 心有牵挂','desc':'角色保持着自己独立的工作与生活，但闲暇时会自然记起与你的对话'}
    return {'score':score,'stage':'independent','label':'独立生活 · 自有天地','desc':'角色拥有独立完整的生活重心与日常，日记主要记录自身经历，不以你为生活核心'}

def build_default_diary(db,p,c,date_str,surv_rec):
    slots=(surv_rec or {}).get('slots') or build_default_surveillance_slots(c,p,date_str)
    intimacy=compute_intimacy_info(db,p,c)
    day_msgs=db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND substr(created_at,1,10)=? AND engine!='recalled'",(p['id'],c['id'],date_str)).fetchall()
    day_meets=db.execute("SELECT * FROM meetings WHERE profile_id=? AND character_id=? AND substr(started_at,1,10)=?",(p['id'],c['id'],date_str)).fetchall()
    s_morning=slots[1] if len(slots)>1 else slots[0]
    s_afternoon=slots[3] if len(slots)>3 else slots[-1]
    s_evening=slots[4] if len(slots)>4 else slots[-1]
    title=f"《{s_morning['location']}与{s_evening['location']}》"
    p1=f"上午在{s_morning['location']}完成了「{s_morning['activity']}」，花了不少精力把积压的细节逐一核对清楚。作为习惯了按自己节奏行事的人，这种井然有序的日常让我觉得踏实。"
    p2=f"下午去了{s_afternoon['location']}处理手头的安排，傍晚才在{s_evening['location']}歇了口气。白天的紧绷感散去之后，难得有一段完全属于自己的独处时间。"
    if intimacy['stage']=='deep_love':
        p3=f"不过今天最让我放不下的依然是 {p['name']}。明明白天忙工作的时候还能保持冷静，可一到夜里安静下来，脑海里全都是和 {p['name']} 相处的细节。大概是真的彻底栽在这段关系里了。"
    elif day_meets:
        p3=f"值得一提的是，今天抽空在「{day_meets[0]['location']}」和 {p['name']} 见了一面。能在各自忙碌的生活间隙里聊聊天，感觉还不坏。明天还有早起的正事，先记到这里。"
    elif day_msgs:
        p3=f"今天办事的间隙收到了 {p['name']} 的消息，简单聊了几句。我的生活依然沿着原本的轨道运转，不过偶尔有这样一个聊得来的朋友穿插在日常里，倒也不赖。"
    else:
        p3=f"今天一整天都扑在自己的事情上，回到住处后整理好随身装备，翻了几页旧书。明天还有早起的安排，准备休息。"
    footprints=[f"{s['start']} {s['location']}（{s['activity'][:20]}）" for s in slots[1:5]]
    return {
        'id':f"diary_{c['id']}_{date_str}",
        'date':date_str,
        'profile_id':p['id'],
        'character_id':c['id'],
        'title':title,
        'weather':'晴朗微风',
        'mood':'心绪温柔' if intimacy['stage']=='deep_love' else '专注沉稳',
        'intimacy_stage':intimacy['stage'],
        'intimacy_label':intimacy['label'],
        'intimacy_score':intimacy['score'],
        'content':'\n\n'.join([p1,p2,p3]),
        'footprints':footprints,
        'engine':'curated',
        'created_at':utc()
    }

def ensure_diaries_up_to_date(db,p,c):
    key=(p['id'],c['id'])
    d_store=DIARY_STATE.setdefault(key,{'by_date':{}})
    s_store=get_surveillance_store(db,p,c)
    today=local_date_str()
    newly=[]
    for d_str in sorted(k for k in s_store['by_date'].keys() if k<today):
        if d_str not in d_store['by_date']:
            d_store['by_date'][d_str]=build_default_diary(db,p,c,d_str,s_store['by_date'][d_str])
            newly.append(d_str)
    return d_store,newly

def ensure_live_diary(db,p,c,target_date='',force=False):
    d_store,_=ensure_diaries_up_to_date(db,p,c)
    today=local_date_str()
    avail=sorted(d_store['by_date'].keys(),reverse=True)
    d_str=target_date if (target_date and re.match(r'^\d{4}-\d{2}-\d{2}$',str(target_date)) and str(target_date)<today) else (avail[0] if avail else offset_date_str(today,-1))
    surv_rec=get_or_init_surveillance(db,p,c,d_str)
    if d_str not in d_store['by_date']:
        d_store['by_date'][d_str]=build_default_diary(db,p,c,d_str,surv_rec)
    entry=d_store['by_date'][d_str]
    if public_connection()['mode']!='live':return entry
    if entry.get('engine')=='live' and not force:return entry
    try:
        intimacy=compute_intimacy_info(db,p,c)
        slots_txt='\n'.join(f"{s['start']}-{s['end']} 在【{s['location']}】{s['activity']}（{s['scene']}）" for s in (surv_rec.get('slots') or []))
        sys_p=f"你是 {c['name']}（来自《{c['source']}》· {c['version']}，设定：{c['canon']}）。请根据你 {d_str} 全天的监控行踪写一篇第一人称私密日记。记住：角色有自己独立的生活，并不是以用户（{p['name']}）为生活核心（除非当前感情阶段为 deep_love，当前阶段：{intimacy['stage']} · {intimacy['label']}）。严禁使用任何 emoji。只输出 JSON：{{\"title\":\"《...》\",\"weather\":\"纯文字天气\",\"mood\":\"纯文字心情\",\"content\":\"第一人称日记正文（3段，用\\\\n\\\\n分隔）\"}}"
        out=completion([{'role':'system','content':sys_p},{'role':'user','content':slots_txt}],json_mode=True,max_tokens=900)
        parsed=parse_json(out,{})
        if parsed.get('content'):
            entry['title']=str(parsed.get('title') or entry['title']).strip()[:40]
            entry['weather']=str(parsed.get('weather') or entry['weather']).strip()[:16]
            entry['mood']=str(parsed.get('mood') or entry['mood']).strip()[:16]
            entry['content']=str(parsed.get('content')).strip()[:2400]
            entry['engine']='live'
    except Exception:
        pass
    return entry

def build_diary_payload(db,p,c,requested_date=''):
    d_store,newly=ensure_diaries_up_to_date(db,p,c)
    today=local_date_str()
    avail=sorted(d_store['by_date'].keys(),reverse=True)
    latest=avail[0] if avail else offset_date_str(today,-1)
    sel=requested_date if (requested_date and re.match(r'^\d{4}-\d{2}-\d{2}$',str(requested_date)) and str(requested_date)<today) else latest
    if sel not in d_store['by_date']:
        d_store['by_date'][sel]=build_default_diary(db,p,c,sel,get_or_init_surveillance(db,p,c,sel))
    avail=sorted(d_store['by_date'].keys(),reverse=True)
    diary=d_store['by_date'][sel]
    return {
        'characterId':c['id'],
        'characterName':c['name'],
        'latestDate':latest,
        'selectedDate':sel,
        'availableDates':avail,
        'newlyGenerated':newly,
        'intimacy':compute_intimacy_info(db,p,c),
        'diary':diary
    }

def record_dialogue_episode(db,p,c,user_msgs,ai_msg,mode):
    if not ai_msg or mode=='meeting':return None
    u_texts=[str(m.get('text','')).strip() for m in (user_msgs or []) if m and m.get('text')]
    u_joined=' / '.join(u_texts)[:110]
    a_text=clean_chat_bubble_text(str(ai_msg.get('text','')))[:110]
    combined=(u_joined+' '+a_text)
    if not any(w in combined for w in PROMISE_KEYWORDS):
        return None
    unres=1 if any(w in combined for w in ('下次','改天','明天','周末','约好','约定','答应','等你','一起去','不见不散')) else 0
    if u_joined:
        summary=f"与 {p['name']} 聊到约定/重点：「{u_joined[:75]}」（{c['name']}回应：「{a_text[:65]}」）"
    else:
        summary=f"{c['name']}提到：「{a_text[:100]}」"
    raw_ids=[m['id'] for m in (user_msgs or []) if m and m.get('id')]+[ai_msg['id']]
    return append_episodic_memory(
        db,
        owner_id=c['id'],
        profile_id=p['id'],
        source_type='dialogue',
        source_key='turn:'+ai_msg['id'],
        knowledge_mode='stated',
        summary=summary,
        tags=extract_memory_tags(u_joined or a_text,6),
        importance=4,
        emotional_weight=3,
        unresolved=unres,
        raw_msg_ids=raw_ids,
        event_at=ai_msg.get('created_at') or utc()
    )

def infer_meeting_location(db,pid,cid,custom_loc=''):
    clean_custom=str(custom_loc or '').strip()
    if clean_custom:return clean_custom[:40]
    recent=db.execute('SELECT text FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 10',(pid,cid)).fetchall()
    pat=re.compile(r'(?:在|到|去|约在|来到|站在|坐在)?([\u4e00-\u9fa5A-Za-z0-9]{0,8}(?:咖啡店门口|咖啡馆门口|咖啡厅门口|咖啡厅|咖啡店|咖啡馆|酒吧|酒馆|餐厅|书店|唱片行|公园|海边|江边|车站|天台|公寓|靶场|电影院|便利店|图书馆|安全屋|广场|长椅|窗边|店门口|街角|街头|路口))')
    for row in recent:
        m=pat.search(str(row['text'] or ''))
        if m and m.group(1):
            loc=re.sub(r'^(?:我已经到了|我已经到|已经到了|已经到|我到了|我到|到了|约在|来到|站在|坐在|在|到|去)+','',m.group(1)).strip()
            if len(loc)>=2:return loc[:32]
    try:
        p=profile_get(db,pid)
        c=BY_ID.get(cid)
        if p and c:
            cur_slot=get_current_surveillance_slot(db,p,c)
            if cur_slot and cur_slot.get('location'):
                return str(cur_slot['location'])[:32]
    except Exception:
        pass
    return '约定的街角咖啡馆'

def build_meeting_summary_text(p,c,loc,m_msgs,ai_summary=''):
    if ai_summary and len(str(ai_summary).strip())>=6:
        return strip_protocol_tags(str(ai_summary),preserve_paragraphs=False)[:160]
    u_turns=[m for m in m_msgs if m['sender']=='user' and m.get('engine')!='recalled']
    a_turns=[m for m in m_msgs if m['sender']=='ai' and m.get('engine')!='recalled']
    if u_turns:
        first_u=re.sub(r'\s+',' ',str(u_turns[0].get('text',''))).strip()[:38]
        last_u=re.sub(r'\s+',' ',str(u_turns[-1].get('text',''))).strip()[:34] if len(u_turns)>1 else ''
        return f"{p['name']}「{first_u}」{('、再到「'+last_u+'」') if last_u else ''}，与 {c['name']} 面对面互动了 {len(m_msgs)} 个回合。"
    if a_turns:
        snippet=re.sub(r'\s+',' ',clean_meeting_novel_text(a_turns[0]['text']))[:48]
        return f"{snippet}…（共 {len(m_msgs)} 段面对面互动）"
    return f"在「{loc}」见了一面。"

def upsert_meeting_record(db,p,c,meeting_id,m_msgs,custom_loc='',ai_summary=''):
    if not m_msgs:return None
    existed=db.execute('SELECT * FROM meetings WHERE id=?',(meeting_id,)).fetchone()
    loc=infer_meeting_location(db,p['id'],c['id'],custom_loc or (existed['location'] if existed else ''))
    started_at=m_msgs[0]['created_at'] or utc()
    ended_at=m_msgs[-1]['created_at'] or utc()
    time_str=str(started_at)[:16].replace('T',' ')
    ai_sum=ai_summary or (existed['ai_summary'] if existed else '')
    summary=build_meeting_summary_text(p,c,loc,m_msgs,ai_sum)
    entries=[{'id':m['id'],'sender':m['sender'],'speaker':p['name'] if m['sender']=='user' else c['name'],'text':str(m.get('text','')) if m['sender']=='user' else clean_meeting_novel_text(m['text']),'created_at':m['created_at']} for m in m_msgs]
    msg_ids=[m['id'] for m in m_msgs]
    db.execute('''INSERT OR REPLACE INTO meetings (id,profile_id,character_id,location,time,started_at,ended_at,summary,ai_summary,message_ids,entries)
        VALUES (?,?,?,?,?,?,?,?,?,?,?)''',(meeting_id,p['id'],c['id'],loc,time_str,started_at,ended_at,summary,ai_sum,js(msg_ids),js(entries)))
    rec={
        'id':meeting_id,
        'profile_id':p['id'],
        'character_id':c['id'],
        'location':loc,
        'time':time_str,
        'started_at':started_at,
        'ended_at':ended_at,
        'summary':summary,
        'ai_summary':ai_sum,
        'message_ids':msg_ids,
        'entries':entries
    }
    append_episodic_memory(
        db,
        owner_id=c['id'],
        profile_id=p['id'],
        source_type='meeting_summary',
        source_key='meeting:'+meeting_id,
        knowledge_mode='experienced',
        summary=f"和 {p['name']} 在「{loc}」见面：{summary}",
        tags=[loc,'见面']+extract_memory_tags(summary,5),
        importance=4,
        emotional_weight=4,
        unresolved=0,
        raw_msg_ids=msg_ids,
        event_at=ended_at
    )
    return rec

def ensure_meeting_records(db,p,c):
    all_rows=db.execute('SELECT * FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at,id',(p['id'],c['id'])).fetchall()
    all_msgs=[dict(r) for r in all_rows]
    groups=[]
    cur=[]
    for m in all_msgs:
        if m['mode']=='meeting':
            cur.append(m)
        elif cur:
            groups.append(cur)
            cur=[]
    if cur:groups.append(cur)
    m_state=MEETING_STATE.get((p['id'],c['id']),{})
    for idx,g in enumerate(groups):
        is_last=(idx==len(groups)-1)
        mid=(m_state.get('active_meeting_id') if (is_last and m_state.get('active_meeting_id')) else ('meet_'+g[0]['id']))
        for m in g:m['meeting_id']=mid
        custom_loc=m_state.get('meeting_location','') if is_last else ''
        upsert_meeting_record(db,p,c,mid,g,custom_loc)
    db.execute("DELETE FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_type='milestone'",(c['id'],p['id']))
    rows=db.execute('SELECT * FROM meetings WHERE profile_id=? AND character_id=? ORDER BY started_at',(p['id'],c['id'])).fetchall()
    meetings=[dict(r)|{'message_ids':parse_json(r['message_ids'],[]),'entries':parse_json(r['entries'],[])} for r in rows]
    return all_msgs, meetings

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
    all_msgs=db.execute("SELECT id,sender,mode,text,engine,created_at FROM messages WHERE profile_id=? AND character_id=? AND mode='chat' ORDER BY created_at,id",(pid,cid)).fetchall()
    if not all_msgs:return
    by_day={}
    for m in all_msgs:
        if m['engine']=='recalled':continue
        day=str(m['created_at'])[:10]
        by_day.setdefault(day,[]).append(dict(m))
    for day,day_msgs in by_day.items():
        if len(day_msgs)<2:continue
        combined=' '.join(m['text'][:60] for m in day_msgs if m['sender']=='user') or ' '.join(m['text'][:60] for m in day_msgs)
        tags=extract_memory_tags(combined,6)
        topics='、'.join(tags[:5]) if tags else '日常寒暄与近况'
        summary=f"{day} 聊天归档：与 {p['name']} 共聊了 {len(day_msgs)} 条手机消息，主要聊到：{topics}。"
        append_episodic_memory(
            db,
            owner_id=cid,
            profile_id=pid,
            source_type='daily-summary',
            source_key='day:'+day,
            knowledge_mode='stated',
            summary=summary,
            tags=tags,
            importance=2,
            emotional_weight=2,
            unresolved=0,
            raw_msg_ids=[m['id'] for m in day_msgs[-16:]],
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
        elif item['source_type'] in ('milestone','meeting_summary'):
            score=overlap_score + (5.5 if asks_past else 2.0)
        elif item['source_type']=='daily-summary':
            score=overlap_score + (6.0 if asks_past else 1.0)
        else:
            score=overlap_score + item['importance']*1.1 + (2.5 if item['unresolved'] else 0.0)
        if overlap_score==0 and item['source_type'] not in ('correction',) and not item['unresolved'] and not (asks_past and item['source_type'] in ('daily-summary','milestone','meeting_summary')):
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
                entry['raw_excerpt']=' | '.join(('对方：' if r['sender']=='user' else '你：')+(str(r['text'] or '').strip() if r['sender']=='user' else clean_chat_bubble_text(r['text']))[:70] for r in raw_rows)
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
            line+=f" -> [最新澄清] {entry['correction_note']}"
        return line
    line=f"- {date_part} {mode_tag} {entry['summary']}"
    if entry.get('disputed_original'):
        line+=f"（针对旧说法「{entry['disputed_original'][:80]}」的更正）"
    if entry.get('raw_excerpt'):
        line+=f"（原文片段：{entry['raw_excerpt']}）"
    return line

def relationship_baseline_summary(db,pid,cid,p_name):
    rel=db.execute('SELECT status,mode,attempts,updated_at FROM relations WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    milestones=db.execute("SELECT type,summary,created_at FROM events WHERE character_id=? AND profile_id=? AND type IN ('matched','unmatched') ORDER BY created_at",(cid,pid)).fetchall()
    total_msgs=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()[0]
    meet_count=db.execute("SELECT COUNT(*) FROM meetings WHERE profile_id=? AND character_id=?",(pid,cid)).fetchone()[0]
    had_unmatch=any(m['type']=='unmatched' for m in milestones)
    reunited=had_unmatch and rel and rel['status']=='matched'
    parts=[f"与 {p_name} 当前状态：{'已匹配' if rel and rel['status']=='matched' else '未匹配'}（当前模式：{'线下见面' if rel and rel['mode']=='meeting' else '线上短信'}）"]
    if reunited:parts.append('曾解除匹配后再次重逢（保留过往记忆）')
    parts.append(f"累计对话 {total_msgs} 条{f'（已归档 {meet_count} 次线下见面）' if meet_count else ''}")
    if milestones:
        recent_ms='；'.join(f"{str(m['created_at'])[:10]} {m['summary']}" for m in milestones[-2:])
        parts.append(f"匹配记录：{recent_ms}")
    return '；'.join(parts)+'。'

def select_working_history(db,pid,cid,mode='chat',through_rowid=None):
    if through_rowid is not None:
        rows=db.execute('SELECT id,sender,mode,text,engine,created_at FROM messages WHERE profile_id=? AND character_id=? AND rowid<=? ORDER BY rowid DESC LIMIT 48',(pid,cid,through_rowid)).fetchall()
    else:
        rows=db.execute('SELECT id,sender,mode,text,engine,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 48',(pid,cid)).fetchall()
    chron=list(reversed([dict(r) for r in rows]))
    if not chron:return []
    if mode=='meeting':
        active_streak=[]
        for m in reversed(chron):
            if m['mode']=='meeting':
                active_streak.insert(0,m)
            elif active_streak:
                break
        if active_streak:
            return active_streak[-16:]
        all_meet=[m for m in chron if m['mode']=='meeting']
        return all_meet[-16:]
    win_limit=10
    today_prefix=chron[-1]['created_at'][:10]
    today_msgs=[m for m in chron if str(m['created_at'])[:10]==today_prefix]
    if len(today_msgs)>=4:
        return today_msgs[-win_limit:]
    return chron[-min(6,win_limit):]

def select_pre_meeting_chat_context(db,pid,cid,limit=6):
    rows=db.execute('SELECT id,sender,mode,text,engine,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 48',(pid,cid)).fetchall()
    chron=list(reversed([dict(r) for r in rows if r['engine']!='recalled']))
    if not chron:return []
    end_idx=len(chron)
    while end_idx>0 and chron[end_idx-1]['mode']=='meeting':
        end_idx-=1
    chat_before=[m for m in chron[:end_idx] if m['mode']=='chat']
    return chat_before[-limit:]

def write_message(db,pid,cid,sender,mode,txt,engine='human'):
    clean_txt = (clean_meeting_novel_text(txt) if mode=='meeting' else (clean_chat_bubble_text(txt) or '…')) if (sender=='ai' and engine not in ('error','recalled')) else str(txt or '')
    item=dict(id=uid(),profile_id=pid,character_id=cid,sender=sender,mode=mode,text=clean_txt,engine=engine,created_at=utc())
    db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)',tuple(item.values()))
    return item

def log_event(db,pid,cid,kind,summary):
    now_str=utc()
    clean_sum=str(summary or '').strip() if kind=='user_message' else strip_protocol_tags(summary,preserve_paragraphs=False)
    db.execute('INSERT INTO events VALUES (?,?,?,?,?,?)',(uid(),pid,cid,kind,clean_sum[:500],now_str))

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

SYSTEM_LOGS=[]
SYSTEM_LOGS_ENABLED=True
SYSTEM_LOGS_MAX_BYTES=4*1024*1024

def mask_api_key(k=''):
    s=str(k or '').strip()
    if not s:return ''
    if len(s)<=8:return s[:2]+'***'
    return f"{s[:4]}...{s[-4:]}"

def record_system_log(entry):
    if not SYSTEM_LOGS_ENABLED:return entry
    log_item={
        'id':entry.get('id') or ('log_'+uid()),
        'created_at':entry.get('created_at') or utc(),
        'profile_id':entry.get('profile_id',''),
        'profile_name':entry.get('profile_name',''),
        'character_id':entry.get('character_id',''),
        'character_name':entry.get('character_name',''),
        'mode':entry.get('mode','chat'),
        'entry_point':entry.get('entry_point',''),
        'model':entry.get('model',''),
        'endpoint':entry.get('endpoint',''),
        'headers_masked':entry.get('headers_masked') or {},
        'sampling':entry.get('sampling') or {},
        'active_preset_count':entry.get('active_preset_count',0),
        'disabled_preset_count':entry.get('disabled_preset_count',0),
        'active_presets':entry.get('active_presets') or [],
        'disabled_presets':entry.get('disabled_presets') or [],
        'request_payload':entry.get('request_payload'),
        'raw_response':entry.get('raw_response'),
        'raw_content':entry.get('raw_content',''),
        'reasoning_content':entry.get('reasoning_content',''),
        'parsed_content':entry.get('parsed_content',''),
        'char_count_raw':entry.get('char_count_raw',0),
        'char_count_parsed':entry.get('char_count_parsed',0),
        'finish_reason':entry.get('finish_reason',''),
        'usage':entry.get('usage'),
        'truncation_warning':entry.get('truncation_warning',''),
        'duration_ms':entry.get('duration_ms',0),
        'error':entry.get('error',''),
        'http_status':entry.get('http_status',0),
    }
    try:
        size=lambda x:len(js(x).encode('utf8'))+64
        if size(log_item)>SYSTEM_LOGS_MAX_BYTES:
            log_item.update(request_payload=None,raw_response=None,raw_content='',parsed_content='',reasoning_content='',active_presets=[],disabled_presets=[],storage_warning='本条日志超过容量，仅保留元数据。')
        candidates=[log_item]+SYSTEM_LOGS
        kept=[];used=0
        for x in candidates:
            n=size(x)
            if len(kept)<40 and used+n<=SYSTEM_LOGS_MAX_BYTES:
                kept.append(x);used+=n
        SYSTEM_LOGS[:]=kept
    except Exception:
        pass
    return log_item

def completion(messages,*,json_mode=False,max_tokens=None,log_meta=None):
    settings=load_connection();base=settings.get('base_url');key=settings.get('api_key');model=settings.get('model')
    if not all((base,key,model)):raise RuntimeError('尚未配置可用的 API 地址、密钥及模型')
    meta=log_meta or {}
    req_mode=meta.get('mode','chat')
    max_tok=int(max_tokens or settings.get('max_tokens') or 4096)
    temp=float(settings.get('temperature',0.85))
    top_p_val=float(settings.get('top_p',1))
    payload={'model':model,'messages':messages,'temperature':temp,'top_p':top_p_val,'max_tokens':max_tok}
    if json_mode:payload['response_format']={'type':'json_object'}
    endpoint=base+'/chat/completions'
    headers_masked={'Content-Type':'application/json','Authorization':'Bearer '+mask_api_key(key)}
    active_presets=[]
    disabled_presets=[]
    try:
        with connect() as db_log:
            p_rows=db_log.execute('SELECT * FROM presets WHERE mode=? ORDER BY sort_order,id',(req_mode,)).fetchall()
            for r in p_rows:
                pd=preset_row_dict(r)
                if pd['enabled']:
                    active_presets.append({'id':pd['id'],'name':pd['name'],'group':pd.get('group',''),'role':pd['role'],'sort_order':pd['sort_order'],'chars':len(str(pd.get('content','')))})
                else:
                    disabled_presets.append({'id':pd['id'],'name':pd['name'],'group':pd.get('group',''),'role':pd['role'],'sort_order':pd['sort_order']})
    except Exception:
        pass
    t0=now_ms()
    req=urllib.request.Request(endpoint,data=js(payload).encode('utf8'),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=65) as r:
            status_code=getattr(r,'status',200)
            data=json.loads(r.read(4*1024*1024))
        duration_ms=now_ms()-t0
        choice=(data.get('choices') or [{}])[0]
        msg_obj=choice.get('message') or {}
        finish_reason=str(choice.get('finish_reason') or '')
        usage_raw=data.get('usage') or {}
        comp_details=usage_raw.get('completion_tokens_details') or {}
        usage={
            'prompt_tokens':usage_raw.get('prompt_tokens'),
            'completion_tokens':usage_raw.get('completion_tokens'),
            'total_tokens':usage_raw.get('total_tokens'),
            'reasoning_tokens':comp_details.get('reasoning_tokens') or usage_raw.get('reasoning_tokens') or 0
        } if usage_raw else None
        content=msg_obj.get('content')
        reasoning_content=str(msg_obj.get('reasoning_content') or msg_obj.get('reasoning') or '')
        if isinstance(content,list):content=''.join(x.get('text','') for x in content if isinstance(x,dict))
        raw_trimmed=content.strip() if isinstance(content,str) else ''
        if not raw_trimmed:
            record_system_log({
                'profile_id':(meta.get('profile') or {}).get('id',''),
                'profile_name':(meta.get('profile') or {}).get('name',''),
                'character_id':(meta.get('character') or {}).get('id',''),
                'character_name':(meta.get('character') or {}).get('name',''),
                'mode':req_mode,
                'entry_point':meta.get('entryPoint',req_mode),
                'model':model,
                'endpoint':endpoint,
                'headers_masked':headers_masked,
                'sampling':{'temperature':temp,'top_p':top_p_val,'max_tokens':max_tok},
                'active_preset_count':len(active_presets),
                'disabled_preset_count':len(disabled_presets),
                'active_presets':active_presets,
                'disabled_presets':disabled_presets,
                'request_payload':payload,
                'raw_response':data,
                'raw_content':'',
                'reasoning_content':reasoning_content,
                'parsed_content':'',
                'char_count_raw':0,
                'char_count_parsed':0,
                'finish_reason':finish_reason,
                'usage':usage,
                'duration_ms':duration_ms,
                'http_status':status_code,
                'error':f"模型没有返回可用文本（finish_reason={finish_reason or 'unknown'}）"
            })
            raise RuntimeError('模型没有返回可用文本')
        parse_fn=meta.get('parseFn')
        parsed_content=parse_fn(raw_trimmed) if callable(parse_fn) else (clean_meeting_novel_text(raw_trimmed) if req_mode=='meeting' else raw_trimmed)
        trunc_warn=''
        if finish_reason in ('length','max_tokens'):
            trunc_warn=f"模型因达到 max_tokens ({max_tok}) 上限被截断（finish_reason={finish_reason}）。建议在「终端 -> 连接与模型」中调高 Max tokens。"
        record_system_log({
            'profile_id':(meta.get('profile') or {}).get('id',''),
            'profile_name':(meta.get('profile') or {}).get('name',''),
            'character_id':(meta.get('character') or {}).get('id',''),
            'character_name':(meta.get('character') or {}).get('name',''),
            'mode':req_mode,
            'entry_point':meta.get('entryPoint',req_mode),
            'model':model,
            'endpoint':endpoint,
            'headers_masked':headers_masked,
            'sampling':{'temperature':temp,'top_p':top_p_val,'max_tokens':max_tok},
            'active_preset_count':len(active_presets),
            'disabled_preset_count':len(disabled_presets),
            'active_presets':active_presets,
            'disabled_presets':disabled_presets,
            'request_payload':payload,
            'raw_response':data,
            'raw_content':raw_trimmed,
            'reasoning_content':reasoning_content,
            'parsed_content':parsed_content,
            'char_count_raw':len(raw_trimmed),
            'char_count_parsed':len(parsed_content or ''),
            'finish_reason':finish_reason,
            'usage':usage,
            'truncation_warning':trunc_warn,
            'duration_ms':duration_ms,
            'http_status':status_code,
            'error':''
        })
        return raw_trimmed
    except urllib.error.HTTPError as exc:
        err_msg=f'模型接口返回 HTTP {exc.code}；请检查地址、模型和额度'
        record_system_log({
            'profile_id':(meta.get('profile') or {}).get('id',''),
            'profile_name':(meta.get('profile') or {}).get('name',''),
            'character_id':(meta.get('character') or {}).get('id',''),
            'character_name':(meta.get('character') or {}).get('name',''),
            'mode':req_mode,
            'entry_point':meta.get('entryPoint',req_mode),
            'model':model,
            'endpoint':endpoint,
            'headers_masked':headers_masked,
            'sampling':{'temperature':temp,'top_p':top_p_val,'max_tokens':max_tok},
            'active_preset_count':len(active_presets),
            'disabled_preset_count':len(disabled_presets),
            'active_presets':active_presets,
            'disabled_presets':disabled_presets,
            'request_payload':payload,
            'raw_response':None,
            'duration_ms':now_ms()-t0,
            'http_status':exc.code,
            'error':err_msg
        })
        raise RuntimeError(err_msg)
    except urllib.error.URLError as exc:
        err_msg='无法连接模型接口：'+str(exc.reason)[:140]
        record_system_log({
            'profile_id':(meta.get('profile') or {}).get('id',''),
            'profile_name':(meta.get('profile') or {}).get('name',''),
            'character_id':(meta.get('character') or {}).get('id',''),
            'character_name':(meta.get('character') or {}).get('name',''),
            'mode':req_mode,
            'entry_point':meta.get('entryPoint',req_mode),
            'model':model,
            'endpoint':endpoint,
            'headers_masked':headers_masked,
            'sampling':{'temperature':temp,'top_p':top_p_val,'max_tokens':max_tok},
            'active_preset_count':len(active_presets),
            'disabled_preset_count':len(disabled_presets),
            'active_presets':active_presets,
            'disabled_presets':disabled_presets,
            'request_payload':payload,
            'raw_response':None,
            'duration_ms':now_ms()-t0,
            'http_status':0,
            'error':err_msg
        })
        raise RuntimeError(err_msg)

def expand_preset_macros(text,p,c):
    u_name=(p.get('name') if p else None) or 'User'
    c_name=(c.get('name') if c else None) or 'Character'
    s=str(text or '')
    s=re.sub(r'\{\{\s*user\s*\}\}',u_name,s,flags=re.IGNORECASE)
    s=re.sub(r'\{\{\s*char\s*\}\}',c_name,s,flags=re.IGNORECASE)
    s=re.sub(r'<user>',u_name,s,flags=re.IGNORECASE)
    s=re.sub(r'<char>',c_name,s,flags=re.IGNORECASE)
    return s

def is_post_history_system_preset(entry):
    if not entry or entry.get('role')!='system':return False
    nm=str(entry.get('name',''))
    grp=str(entry.get('group') or infer_preset_group(nm))
    return grp=='COT' or ('COT' in nm) or ('连续性检查' in nm) or ('动笔前' in nm) or ('自检' in nm)

def compile_messages(db,p,c,mode='chat',latest=None,through_rowid=None,pending_ids=None,trigger_opening=False,is_continue=False):
    ordered=[preset_row_dict(r) for r in db.execute('SELECT * FROM presets WHERE mode=? AND enabled=1 ORDER BY sort_order,id',(mode,)).fetchall()]
    macros=lambda t:expand_preset_macros(t,p,c)
    core_presets=[x for x in ordered if x['role']=='system' and not is_post_history_system_preset(x)] if mode=='meeting' else [x for x in ordered if x['role']=='system']
    post_presets=[x for x in ordered if is_post_history_system_preset(x) or x['role']!='system'] if mode=='meeting' else [x for x in ordered if x['role']!='system']
    core_sys_parts=[macros(x['content']) for x in core_presets]
    working_history=select_working_history(db,p['id'],c['id'],mode=mode,through_rowid=through_rowid)
    working_ids={m['id'] for m in working_history}
    ensure_daily_summaries(db,p,c,working_ids)
    query_seed=latest or ' '.join(str(m['text'] or '').strip() for m in working_history[-3:] if m['sender']=='user') or (' '.join((str(m['text'] or '').strip() if m['sender']=='user' else clean_chat_bubble_text(m['text'])) for m in working_history[-2:]))
    recalled=retrieve_relevant_memories(db,p['id'],c['id'],query_text=query_seed,exclude_msg_ids=working_ids,limit=4,max_chars=1200)
    rel_summary=relationship_baseline_summary(db,p['id'],c['id'],p['name'])
    cur_surv=get_current_surveillance_slot(db,p,c)
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
    if cur_surv:
        system+=f"\n\n【此刻你的真实位置与状态（实时监控同步）】\n当前时段：{cur_surv['start']}–{cur_surv['end']}｜你所在地点：{cur_surv['location']}｜状态：{cur_surv['status']}｜正在做的事：{cur_surv['activity']}。当对方问你在哪、在干什么或提出见面时，请自然地与你此刻的真实位置和状态保持一致。"
    if recalled:
        system+="\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n"+"\n".join(format_episodic_entry(e) for e in recalled)
    else:
        system+="\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n（当前话题未触发额外远期档案，仅依靠下方今日活跃上下文连贯交流）"
    if mode=='meeting':
        pre_chat=select_pre_meeting_chat_context(db,p['id'],c['id'],6)
        if pre_chat:
            chat_lines=[]
            for m in pre_chat:
                who=c['name'] if m['sender']=='ai' else p['name']
                txt_clean=(str(m.get('text','')).strip() if m['sender']=='user' else clean_chat_bubble_text(m['text']))[:100]
                chat_lines.append(f"- [{fmt_hhmm(m.get('created_at')) or '--:--'} {who}]: {txt_clean}")
            system+="\n\n【见面前的近期手机联系脉络（仅供剧情前情参考，严禁模仿手机短信的简短篇幅或气泡格式）】\n"+"\n".join(chat_lines)
    timeline_lines=[]
    history_turns=[]
    for idx,msg in enumerate(working_history):
        role='assistant' if msg['sender']=='ai' else 'user'
        if msg.get('engine')=='recalled':
            history_turns.append({'role':role,'content':'[系统提示：对方刚刚撤回了一条消息（你看见对方撤回了消息，但不知道具体撤回了什么内容）]'})
        else:
            t_tag=fmt_hhmm(msg.get('created_at')) or '--:--'
            m_label='线下见面' if msg['mode']=='meeting' else '线上短信'
            who=c['name'] if msg['sender']=='ai' else p['name']
            timeline_lines.append(f"#{idx+1} {t_tag}（{m_label}·{who}）")
            clean_body=str(msg.get('text','')) if msg['sender']=='user' else (clean_meeting_novel_text(msg['text']) if msg['mode']=='meeting' else (clean_chat_bubble_text(msg['text']) or '…'))
            history_turns.append({'role':role,'content':clean_body})
    if timeline_lines:
        system+="\n\n【近期活跃对话时间与模式索引（系统元数据，仅供把握时间跨度与场景，严禁在回复正文中输出时间或模式前缀）】\n"+" ｜ ".join(timeline_lines)
    if core_sys_parts:system+='\n\n'+'\n\n'.join(core_sys_parts)
    messages=[{'role':'system','content':system}]
    if mode=='meeting':
        m_state=MEETING_STATE.get((p['id'],c['id']),{})
        meet_loc=(cur_surv and cur_surv.get('location')) or infer_meeting_location(db,p['id'],c['id'],m_state.get('meeting_location',''))
        has_trailing_user=(len(history_turns)>0 and history_turns[-1]['role']=='user' and not trigger_opening and not is_continue)
        prior_turns=history_turns[:-1] if has_trailing_user else history_turns
        final_user_turn=history_turns[-1] if has_trailing_user else None
        messages.extend(prior_turns)
        post_sys_parts=[macros(x['content']) for x in post_presets if x['role']=='system']
        non_sys_post_presets=[x for x in post_presets if x['role']!='system']
        meeting_state_line=f"【第四层 · 当前状态 (Current State)】当前为线下见面小说模式（地点：{meet_loc}）。请严格遵循上方导入的面对面小说预设中的文风、叙事视角、人物边界、篇幅区间与创作铁律，不要替 {p['name']} 说话、行动或决定内心感受，不要在正文开头添加任何时间或模式标签，直接输出小说正文。"
        if post_sys_parts:
            messages.append({'role':'system','content':'\n\n'.join(post_sys_parts)+'\n\n'+meeting_state_line})
        else:
            messages.append({'role':'system','content':meeting_state_line})
        for x in non_sys_post_presets:
            messages.append({'role':x['role'],'content':macros(x['content'])})
        if final_user_turn:
            messages.append(final_user_turn)
        elif trigger_opening or len(history_turns)==0:
            messages.append({'role':'user','content':f"【场景开启】{p['name']} 与 {c['name']} 刚刚在「{meet_loc}」线下碰面。请严格按照当前面对面小说预设的所有规则与目标篇幅，从 {c['name']} 的视角与反应切入，描写双方刚刚照面时的环境氛围、神态动作与开场互动正文（不要替 {p['name']} 决定台词或心理）。"})
        else:
            messages.append({'role':'user','content':f"【继续推进】请承接上一轮在「{meet_loc}」的现场氛围与动作，严格按照当前面对面小说预设的所有规则与目标篇幅，继续推进下一段细腻的面对面互动正文（不要替 {p['name']} 决定台词或心理）。"})
        return messages
    for x in post_presets:
        messages.append({'role':x['role'],'content':macros(x['content'])})
    messages.extend(history_turns)
    batch_hint=''
    if mode=='chat' and pending_ids and len(pending_ids)>1:
        bundled_rows=[]
        for mid in pending_ids:
            row=db.execute('SELECT id,sender,text,created_at FROM messages WHERE id=?',(mid,)).fetchone()
            if row:bundled_rows.append(dict(row))
        if len(bundled_rows)>1:
            tl=' -> '.join(f"{fmt_hhmm(x['created_at'])}「{(str(x['text'] or '').strip() if x.get('sender')=='user' else clean_chat_bubble_text(x['text']))[:60]}」" for x in bundled_rows)
            batch_hint=f"\n【打包消息时间线】你在未看手机的这段时间里，对方陆续给你发来了 {len(bundled_rows)} 条消息（按发送时间先后：{tl}）。你现在刚拿起手机把这些消息一次性读完，请结合这些消息各自的时间戳跨度与内容，像真人一样自然连贯地统一回复。"
    messages.append({'role':'system','content':'【第四层 · 当前状态 (Current State)】当前输出模式：约会 App 手机聊天；仅发聊天气泡，不写小说旁白，不要在正文开头添加任何时间或模式标签。像真人聊天一样时长时短：有时只发 1 条简短气泡，有时可分 2–4 条长短交替的气泡连续发出（多条气泡之间用换行符或 ||| 分隔）'+batch_hint+'。'})
    return messages

def demo_text(db,p,c,mode):
    past=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()[0]
    if mode=='meeting':
        m_state=MEETING_STATE.get((p['id'],c['id']),{})
        loc=infer_meeting_location(db,p['id'],c['id'],m_state.get('meeting_location',''))
        meet_count=db.execute("SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting'",(p['id'],c['id'])).fetchone()[0]
        if meet_count<=1:
            return f"{c['name']}正站在{loc}微光映照的一侧。听见你的脚步声，对方抬起头，目光穿过人群定格在你身上。\n\n周围嘈杂的声响仿佛在这一刻退远了些。{c['name']}把手机收进衣袋，朝你走近两步，神情里带着一点见到真人时的微怔与放松：\n\n“你到了。比我想象的还要快一点……走吧，我们先找个安静的位置坐下聊。”"
        scenes=[
            f"{c['name']}安静地听完你的话，视线在你脸上停留了片刻，指尖轻轻碰了碰桌沿，眼底浮现出一丝温和的笑意。\n\n“原来你是这么想的。在手机里聊的时候我还不太确定，现在当面听你说，感觉完全不一样。”\n\n微风拂过{loc}的一角，{c['name']}微微倾身靠近了些，示意你继续往下说。",
            f"{c['name']}垂下眼眸思索了两秒，随后抬眼望向你，语气比平时在消息里更加坦诚低缓：\n\n“这种事我平时很少跟别人提。不过既然今天和你在这里见面……我觉得告诉你也没关系。”",
            f"四周的光影安静地流动着。{c['name']}替你整理了一下手边的东西，紧绷的肩线彻底放松下来：\n\n“今天能出来见你一面，真的很不错。接下来你还想去哪里走走吗？”"
        ]
        return scenes[meet_count%len(scenes)]
    if past<=2:return "嗯，我在。|||你想先从什么聊起？"
    lines=['这点倒是挺有意思。|||不过……你为什么会突然这么想？','等一下。|||我刚忙完手头的事，现在空下来了。|||你刚刚说的那个，我其实一直记得。','我可能需要想一想再回答你。','真的？|||你有时候真的会让我意外。|||那下次见面的时候，当面跟我细说吧。']
    return lines[past%len(lines)]

def match_reply(db,p,c,again=False):
    cur_mode=public_connection()['mode']
    if cur_mode=='normal':
        return [],'normal-pending'
    if cur_mode=='live':
        try:
            prompt=compile_messages(db,p,c,'chat')
            if again:
                prompt.append({'role':'user','content':f"【系统事件：重逢匹配】你刚刚和 {p['name']} 重新匹配上了，你记得你们之前的经历。请根据你的性格与过往记忆，主动发 1～2 条有真实重逢感的手机开场消息（多条气泡之间用 ||| 分隔，绝不要用生硬套话）。"})
            else:
                interests_str='、'.join(p.get('interests') or []) or '无'
                prompt.append({'role':'user','content':f"【系统事件：首次匹配】你刚刚在约会软件上与 {p['name']} 互相右滑匹配成功。请结合你的原作性格、所处境遇以及对方的公开资料（简介：{p.get('bio') or '无'}；兴趣：{interests_str}），主动给对方发 1～2 条自然、有个人特色的第一条手机消息（多条气泡之间用 ||| 分隔，绝对不要说“看来我们匹配上了”这种千篇一律的套话）。"})
            raw=completion(prompt,max_tokens=220)
            return split_chat_bubbles(raw),'live'
        except Exception:pass
    demo_txt=f"{p['name']}，没想到这么快又刷到你了。|||又见面了……上次的事我没有忘。" if again else f"Hey，{p['name']}。|||看来我们匹配上了。"
    return split_chat_bubbles(demo_txt),'demo'

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

def generate_bios(db,characters,force_refresh=False):
    settings=load_connection()
    if not all(settings.get(k) for k in ('base_url','api_key','model')):return 'catalog-demo'
    pending=list(characters) if force_refresh else [c for c in characters if not db.execute('SELECT 1 FROM character_bios WHERE character_id=?',(c['id'],)).fetchone()]
    if not pending:return 'cached-ai-bios'
    compact=[{'id':c['id'],'name':c['name'],'source':c['source'],'version':c['version'],'canon':c['canon'],'example':c['bio']} for c in pending]
    rules='根据给定的、已收录的原作人物身份，为他们各写一条符合当下性格与心境的约会软件公开简介。不得编造新的角色、错误时间线或伪造重要原作事实；若是刷新，请换一个贴合人设的新角度描写。每条中文不超过80字，真实自然。只输出 JSON 对象，形如 {"profiles":[{"id":"exact-id","bio":"..."}]}，只用输入中的ID。'
    try:
        out=completion([{'role':'system','content':rules},{'role':'user','content':js(compact)}],json_mode=True,max_tokens=950)
        value=parse_json(out,{})
        valid={c['id'] for c in pending};count=0
        for x in value.get('profiles',[]):
            if not isinstance(x,dict) or x.get('id') not in valid or not isinstance(x.get('bio'),str):continue
            bio=x['bio'].strip()
            if 6<=len(bio)<=160:
                db.execute('INSERT OR REPLACE INTO character_bios VALUES (?,?,?)',(x['id'],bio,utc()));count+=1
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
                        m_state=MEETING_STATE.get((p['id'],c['id']),{})
                        nick=str(m_state.get('nickname','')).strip()
                        cv=char_view(db,c)|{'nickname':nick,'display_name':nick or c['name']}
                        threads.append({'character':cv,'relation':dict(r)|{'hot_chat':bool(m_state.get('hot_chat',False)),'nickname':nick},'last':dict(last) if last else None,'queue':queue_view(db,p['id'],c['id'])})
                    return self.respond({'threads':threads})
                if route=='/api/thread':
                    p=profile_get(db,arg('profileId'));cid=arg('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    rel=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if not rel or rel['status']!='matched':raise ValueError('尚未匹配或已解除匹配')
                    msgs,meetings=ensure_meeting_records(db,p,c)
                    db.commit()
                    m_state=MEETING_STATE.get((p['id'],cid),{})
                    nick=str(m_state.get('nickname','')).strip()
                    cv=char_view(db,c)|{'nickname':nick,'display_name':nick or c['name']}
                    diary_p=build_diary_payload(db,p,c)
                    rel_dict=dict(rel)|{'active_meeting_id':m_state.get('active_meeting_id',''),'meeting_location':m_state.get('meeting_location',''),'hot_chat':bool(m_state.get('hot_chat',False)),'nickname':nick}
                    return self.respond({'character':cv,'profile':p,'relation':rel_dict,'messages':msgs,'meetings':meetings,'surveillance':build_surveillance_payload(db,p,c),'diarySummary':{'latestDate':diary_p['latestDate'],'availableDates':diary_p['availableDates'],'latestTitle':diary_p['diary'].get('title','')},'queue':queue_view(db,p['id'],cid)})
                if route=='/api/surveillance':
                    p=profile_get(db,arg('profileId'));cid=arg('characterId');c=BY_ID.get(cid);req_date=arg('date').strip()
                    if not c:raise ValueError('角色不存在')
                    ensure_live_surveillance(db,p,c,force=(arg('refresh')=='1'),target_date=req_date)
                    return self.respond(build_surveillance_payload(db,p,c,req_date))
                if route=='/api/diary':
                    p=profile_get(db,arg('profileId'));cid=arg('characterId');c=BY_ID.get(cid);req_date=arg('date').strip()
                    if not c:raise ValueError('角色不存在')
                    ensure_live_diary(db,p,c,target_date=req_date,force=(arg('refresh')=='1'))
                    return self.respond(build_diary_payload(db,p,c,req_date))
                if route=='/api/memories':
                    p=profile_get(db,arg('profileId'));cid=arg('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    rel=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    mode=rel['mode'] if rel else 'chat'
                    working=select_working_history(db,p['id'],cid,mode=mode)
                    working_ids={m['id'] for m in working}
                    all_msgs,meetings=ensure_meeting_records(db,p,c)
                    ensure_daily_summaries(db,p,c,working_ids)
                    db.commit()
                    q_str=arg('query').strip() or (' '.join(m['text'] for m in working[-3:] if m['sender']=='user')) or (' '.join(m['text'] for m in working[-2:]))
                    recalled=retrieve_relevant_memories(db,p['id'],cid,query_text=q_str,exclude_msg_ids=set() if arg('query').strip() else working_ids,limit=4,max_chars=1200)
                    all_rows=db.execute('SELECT * FROM episodic_memories WHERE owner_id=? AND profile_id=? ORDER BY event_at DESC,id DESC',(cid,p['id'])).fetchall()
                    meet_by_key={'meeting:'+m['id']:m for m in meetings}
                    memories=[]
                    for r in all_rows:
                        m_type='daily_summary' if r['source_type']=='daily-summary' else r['source_type']
                        item=dict(r)|{'memory_type':m_type,'tags':parse_json(r['tags'],[]),'raw_msg_ids':parse_json(r['raw_msg_ids'],[]),'disputed':1 if r['disputed'] else 0,'unresolved':1 if r['unresolved'] else 0,'created_at':r['event_at']}
                        if item['source_type']=='meeting_summary' and item['source_key'] in meet_by_key:
                            item['meeting_id']=meet_by_key[item['source_key']]['id']
                            item['meeting_data']=meet_by_key[item['source_key']]
                        elif item['source_type']=='daily-summary':
                            day_str=str(item['source_key']).replace('day:','')
                            raw_set=set(item['raw_msg_ids'])
                            d_msgs=[{'id':x['id'],'sender':x['sender'],'speaker':p['name'] if x['sender']=='user' else c['name'],'text':x['text'],'created_at':x['created_at']} for x in all_msgs if x['id'] in raw_set or (day_str and str(x['created_at'])[:10]==day_str and x['mode']=='chat')]
                            item['day_messages']=d_msgs
                        memories.append(item)
                    total_msgs=len(all_msgs)
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
                        'memories':memories,
                        'episodic':memories,
                        'meetings':meetings
                    })
                if route=='/api/photo-description':
                    cid=arg('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    x=db.execute('SELECT description FROM photo_descriptions WHERE character_id=?',(cid,)).fetchone()
                    return self.respond({'description':x['description'] if x else photo_description(c),'engine':'saved' if x else 'curated-demo'})
                if route=='/api/presets':
                    return self.respond({'entries':[preset_row_dict(x) for x in db.execute('SELECT * FROM presets ORDER BY mode,sort_order,id').fetchall()],'diagnostics':{'chat':diagnose_presets(db,'chat'),'meeting':diagnose_presets(db,'meeting')}})
                if route=='/api/system-logs':
                    return self.respond({'logs':SYSTEM_LOGS,'enabled':SYSTEM_LOGS_ENABLED,'storage':'session'})
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
        global SYSTEM_LOGS_ENABLED
        origin=self.headers.get('Origin','');allowed={f'http://{HOST}:{PORT}',f'http://localhost:{PORT}'}
        if origin and origin not in allowed:return self.respond({'error':'跨站请求不允许'},403)
        ln=int(self.headers.get('Content-Length','0'))
        if ln>MAX_BODY:return self.respond({'error':'请求体太大'},413)
        try:
            data=json.loads(self.rfile.read(ln) or b'{}');route=self.path.split('?')[0]
            if not isinstance(data,dict):raise ValueError('请求格式错误')
            with connect() as db:
                if route=='/api/surveillance':
                    p=profile_get(db,data.get('profileId'));cid=str(data.get('characterId',''));c=BY_ID.get(cid);req_date=str(data.get('date','')).strip()
                    if not c:raise ValueError('角色不存在')
                    ensure_live_surveillance(db,p,c,force=bool(data.get('refresh')),target_date=req_date)
                    return self.respond(build_surveillance_payload(db,p,c,req_date))
                if route=='/api/diary':
                    p=profile_get(db,data.get('profileId'));cid=str(data.get('characterId',''));c=BY_ID.get(cid);req_date=str(data.get('date','')).strip()
                    if not c:raise ValueError('角色不存在')
                    ensure_live_diary(db,p,c,target_date=req_date,force=bool(data.get('refresh')))
                    return self.respond(build_diary_payload(db,p,c,req_date))
                if route=='/api/nickname':
                    p=profile_get(db,data.get('profileId'));cid=str(data.get('characterId',''));c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('尚未匹配')
                    m_state=MEETING_STATE.setdefault((p['id'],cid),{})
                    nick=str(data.get('nickname','')).strip()[:36]
                    m_state['nickname']=nick
                    if 'affectionBoost' in data:
                        m_state['affection_boost']=int(data.get('affectionBoost') or 0)
                    cv=char_view(db,c)|{'nickname':nick,'display_name':nick or c['name']}
                    return self.respond({'ok':True,'nickname':nick,'character':cv,'relation':dict(r)|{'nickname':nick}})
                if route=='/api/discover':
                    p=profile_get(db,data.get('profileId'));choices=possible_candidates(db,p)
                    random.SystemRandom().shuffle(choices)
                    selected=choices[:10]
                    force_refresh=bool(data.get('refresh'))
                    generation=generate_bios(db,selected,force_refresh=force_refresh)
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
                    greeting_replies=[]
                    if matched:
                        log_event(db,p['id'],cid,'matched','与 '+p['name']+(' 重新匹配' if again else ' 首次匹配'))
                        bubbles,msg_engine=match_reply(db,p,c,again)
                        if bubbles:
                            greeting_replies=[write_message(db,p['id'],cid,'ai','chat',b_txt,msg_engine) for b_txt in bubbles]
                            if greeting_replies:
                                record_dialogue_episode(db,p,c,[],dict(greeting_replies[-1],text=' / '.join(bubbles)),'chat')
                    db.commit();return self.respond({'direction':'right','matched':matched,'engine':engine,'character':char_view(db,c),'again':again,'replies':greeting_replies})
                if route=='/api/hot-chat':
                    p=profile_get(db,data.get('profileId'));cid=str(data.get('characterId',''));c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('尚未匹配')
                    m_state=MEETING_STATE.setdefault((p['id'],cid),{})
                    next_hot=bool(data['hotChat']) if 'hotChat' in data else (not bool(m_state.get('hot_chat',False)))
                    m_state['hot_chat']=next_hot
                    with CHAT_LOCK:
                        q=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                        if q and q['status']!='inflight':
                            pending=parse_json(q['pending'],[])
                            if pending:
                                now=now_ms()
                                if next_hot:
                                    due_at=now+CHAT_QUIET_MS
                                    m_state['pace_mode']='hot'
                                    m_state['delay_minutes']=1
                                    m_state['target_time_label']=fmt_hhmm(due_at)
                                    m_state['schedule_reason']='热聊模式 · 停手 1 分钟后立即阅读并回复'
                                else:
                                    last_m=db.execute('SELECT text FROM messages WHERE id=?',(pending[-1],)).fetchone()
                                    delay_min,reason=compute_persona_delay(c,last_m['text'] if last_m else '')
                                    due_at=now+delay_min*60000
                                    m_state['pace_mode']='daily'
                                    m_state['delay_minutes']=delay_min
                                    m_state['target_time_label']=fmt_hhmm(due_at)
                                    m_state['schedule_reason']=reason
                                db.execute('UPDATE chat_queue SET due_at=? WHERE profile_id=? AND character_id=?',(due_at,p['id'],cid))
                                db.commit()
                    return self.respond({'ok':True,'hotChat':next_hot,'relation':dict(r)|{'hot_chat':next_hot},'queue':queue_view(db,p['id'],cid)})
                if route=='/api/proactive-check':
                    p=profile_get(db,data.get('profileId'))
                    trigger=str(data.get('trigger','startup'))
                    target_cid=str(data.get('characterId',''))
                    conn=public_connection()
                    cur_mode=conn['mode']
                    p_mode=conn.get('proactive_mode','daily')
                    if cur_mode=='normal':return self.respond({'sent':[],'skipped':'no-api'})
                    if p_mode=='off' and trigger!='manual':return self.respond({'sent':[],'skipped':'off'})
                    now=now_ms()
                    if trigger!='manual':
                        recent_ts=[ts for (pid_k,_),ts in PROACTIVE_LOG.items() if pid_k==p['id']]
                        if recent_ts and (now-max(recent_ts))<30*60*1000:
                            return self.respond({'delivered':[],'sent':[],'skipped':'global-stagger-cooldown'})
                    rows=db.execute("SELECT * FROM relations WHERE profile_id=? AND status='matched' AND mode='chat' ORDER BY updated_at DESC",(p['id'],)).fetchall()
                    chosen=[]
                    for r in rows:
                        cid=r['character_id']
                        if target_cid and cid!=target_cid:continue
                        if cid not in BY_ID:continue
                        qv=queue_view(db,p['id'],cid)
                        if qv['status']=='inflight' or (trigger!='manual' and qv['count']>0):continue
                        unres=db.execute('SELECT * FROM episodic_memories WHERE owner_id=? AND profile_id=? AND unresolved=1 AND disputed=0 ORDER BY event_at DESC LIMIT 1',(cid,p['id'])).fetchone()
                        if trigger in ('manual','idle','startup'):
                            chosen.append((cid,BY_ID[cid],'promise' if unres else 'idle',dict(unres) if unres else None))
                    sent=[]
                    for cid,c,reason,unres in chosen[:1]:
                        engine='demo';txt=''
                        if cur_mode=='live':
                            try:
                                ms=compile_messages(db,p,c,'chat')
                                mem_hint=f"你翻看手机时，想起你们之前未聊完的话题或约定：「{unres['summary']}」。" if unres else "你在自己的世界里刚忙完手头的事，突然想起了对方。"
                                ms.append({'role':'user','content':f"【系统事件：角色主动发消息】距离你们上次联系已经过了一段时间，{p['name']} 还没有发来新消息。{mem_hint}请以完全符合 {c['name']} 原作性格与当前关系状态的方式，主动给 {p['name']} 发 1～2 条自然的手机消息（多条气泡用 ||| 分隔，不要写旁白）。"})
                                txt=completion(ms,max_tokens=220);engine='live'
                            except Exception:continue
                        else:
                            txt=f"对了，{p['name']}。|||之前我们聊到的那件事，我刚才突然想起来了。|||你现在有空吗？" if unres else f"今天怎么这么安静？|||刚忙完手头的事，顺便看看你在不在。"
                            engine='demo'
                        b_list=split_chat_bubbles(txt)[:3]
                        reps=[write_message(db,p['id'],cid,'ai','chat',b,engine) for b in b_list]
                        if reps:
                            log_event(db,p['id'],cid,'ai_proactive',c['name']+' 主动联系 '+p['name']+'：'+(' / '.join(b_list))[:180])
                            record_dialogue_episode(db,p,c,[],dict(reps[-1],text=' / '.join(b_list)),'chat')
                            if unres:db.execute('UPDATE episodic_memories SET unresolved=0 WHERE id=?',(unres['id'],))
                            db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                            PROACTIVE_LOG[(p['id'],cid)]=now_ms()
                            sent.append({'characterId':cid,'characterName':c['name'],'reason':reason,'replies':reps,'reply':reps[-1]})
                    db.commit();return self.respond({'delivered':sent,'sent':sent,'matchedCount':len(rows)})
                if route=='/api/unmatch':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if not r:raise ValueError('关系不存在')
                    MEETING_STATE.pop((p['id'],cid),None)
                    db.execute("UPDATE relations SET status='unmatched',mode='chat',updated_at=? WHERE profile_id=? AND character_id=?",(utc(),p['id'],cid))
                    queue_cancel(db,p['id'],cid);log_event(db,p['id'],cid,'unmatched','与 '+p['name']+' 解除匹配；过去的相处没有被抹去');db.commit();return self.respond({'ok':True})
                if route=='/api/mode':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');mode=data.get('mode')
                    c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    if mode not in ('chat','meeting'):raise ValueError('模式无效')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('未匹配')
                    m_state=MEETING_STATE.setdefault((p['id'],cid),{})
                    loc_input=str(data.get('location') or data.get('meetingLocation') or '').strip()[:40]
                    if loc_input:
                        m_state['meeting_location']=loc_input
                    meeting_record=None;opening_reply=None;warning=''
                    if r['mode']!=mode:
                        with CHAT_LOCK:queue_cancel(db,p['id'],cid)
                        if mode=='meeting':
                            db.execute('UPDATE relations SET mode=?,updated_at=? WHERE profile_id=? AND character_id=?',(mode,utc(),p['id'],cid))
                            m_state['active_meeting_id']='meet_'+uid()
                            m_state['meeting_location']=infer_meeting_location(db,p['id'],cid,loc_input)
                            sync_surveillance_on_meeting_start(db,p,c,m_state['meeting_location'],m_state['active_meeting_id'])
                            log_event(db,p['id'],cid,'meeting','与 '+p['name']+' 在线下见面')
                            if data.get('triggerOpening') is True and public_connection()['mode']!='normal':
                                engine='demo';settings=load_connection()
                                if all(settings.get(k) for k in ('base_url','api_key','model')):
                                    try:reply_txt=clean_meeting_novel_text(completion(compile_messages(db,p,c,'meeting',trigger_opening=True),log_meta={'mode':'meeting','entryPoint':'meeting-opening','profile':p,'character':c,'parseFn':clean_meeting_novel_text}));engine='live'
                                    except Exception as e:warning=str(e);reply_txt='（模型连接失败，请检查终端设置后重试。）';engine='error'
                                else:reply_txt=clean_meeting_novel_text(demo_text(db,p,c,'meeting'))
                                opening_reply=write_message(db,p['id'],cid,'ai','meeting',reply_txt,engine)
                                m_state['active_meeting_id']='meet_'+opening_reply['id']
                                if engine!='error':
                                    log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+reply_txt[:180])
                                meeting_record=upsert_meeting_record(db,p,c,m_state['active_meeting_id'],[opening_reply],m_state['meeting_location'])
                        else:
                            all_rows=db.execute('SELECT * FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at,id',(p['id'],cid)).fetchall()
                            m_msgs=[]
                            for row in reversed(all_rows):
                                if row['mode']=='meeting':m_msgs.insert(0,dict(row))
                                else:break
                            if m_msgs:
                                mid='meet_'+m_msgs[0]['id']
                                ai_sum='';ai_loc=loc_input or m_state.get('meeting_location','')
                                if data.get('finalizeMeeting') is True and public_connection()['mode']=='live':
                                    try:
                                        transcript='\n'.join(f"{p['name'] if x['sender']=='user' else c['name']}：{x['text'][:180]}" for x in m_msgs[-10:])
                                        sum_json=completion([
                                            {'role':'system','content':f"请根据以下 {c['name']} 与 {p['name']} 的见面互动记录，提取见面地点与一句温暖简练的见面梗概（如：和{p['name']}在街角咖啡馆见面，聊了近况并度过了安静的傍晚）。只输出 JSON 对象：{{\"location\":\"地点（不超过12字）\",\"summary\":\"见面梗概（不超过65字）\"}}"},
                                            {'role':'user','content':transcript}
                                        ],json_mode=True,max_tokens=160)
                                        parsed=parse_json(sum_json,{})
                                        if parsed.get('location') and not loc_input:ai_loc=str(parsed['location']).strip()[:32]
                                        if parsed.get('summary'):ai_sum=str(parsed['summary']).strip()[:150]
                                    except Exception:pass
                                meeting_record=upsert_meeting_record(db,p,c,mid,m_msgs,ai_loc,ai_sum)
                                if meeting_record:
                                    sync_surveillance_on_meeting_end(db,p,c,meeting_record)
                            db.execute('UPDATE relations SET mode=?,updated_at=? WHERE profile_id=? AND character_id=?',(mode,utc(),p['id'],cid))
                            m_state['active_meeting_id']=''
                            log_event(db,p['id'],cid,'return','与 '+p['name']+' 返回手机消息')
                    elif mode=='meeting':
                        if loc_input:
                            sync_surveillance_on_meeting_start(db,p,c,loc_input,m_state.get('active_meeting_id',''))
                        _,meetings=ensure_meeting_records(db,p,c)
                        if meetings:meeting_record=meetings[-1]
                    db.commit()
                    return self.respond({'mode':mode,'meetingId':m_state.get('active_meeting_id',''),'active_meeting_id':m_state.get('active_meeting_id',''),'location':m_state.get('meeting_location',''),'meeting_location':m_state.get('meeting_location',''),'meetingRecord':meeting_record,'openingReply':opening_reply,'surveillance':build_surveillance_payload(db,p,c),'warning':warning})
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
                    recalled_text='[系统提示：对方撤回了一条消息（你没有看清具体内容）]'
                    db.execute("UPDATE messages SET text=?,engine='recalled' WHERE id=? AND profile_id=? AND character_id=?",(recalled_text,mid,p['id'],cid))
                    mem_rows=db.execute('SELECT id,raw_msg_ids FROM episodic_memories WHERE owner_id=? AND profile_id=?',(cid,p['id'])).fetchall()
                    for mr in mem_rows:
                        if mid in parse_json(mr['raw_msg_ids'],[]):
                            db.execute('UPDATE episodic_memories SET summary=? WHERE id=?',(f"{p['name']}撤回了一条消息（具体内容未知）",mr['id']))
                    log_event(db,p['id'],cid,'message_recalled',p['name']+' 撤回了一条消息')
                    with CHAT_LOCK:
                        q=db.execute('SELECT pending,due_at FROM chat_queue WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                        if q:
                            pending=[x for x in parse_json(q['pending'],[]) if x!=mid]
                            db.execute('UPDATE chat_queue SET pending=?,due_at=? WHERE profile_id=? AND character_id=?',(js(pending),q['due_at'] if pending else 0,p['id'],cid))
                    db.commit();return self.respond({'ok':True,'recalled':True,'queue':queue_view(db,p['id'],cid)})
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
                    if public_connection()['mode']=='normal':
                        return self.respond({'reply':None,'replies':[],'mode':mode,'warning':'当前处于正常模式且尚未连接 API，请先在「终端」配置 API。'})
                    engine='demo';warning='';settings=load_connection()
                    if all(settings.get(k) for k in ('base_url','api_key','model')):
                        try:reply=completion(compile_messages(db,p,c,mode,is_continue=(mode=='meeting')),log_meta={'mode':mode,'entryPoint':'meeting-continue' if mode=='meeting' else 'chat-reply','profile':p,'character':c,'parseFn':clean_meeting_novel_text if mode=='meeting' else (lambda raw:' / '.join(split_chat_bubbles(raw)))});engine='live'
                        except Exception as e:warning=str(e);reply='（模型连接失败，请检查终端设置后重试。）';engine='error'
                    else:reply=demo_text(db,p,c,mode)
                    bubble_texts=[reply] if engine=='error' else (split_chat_bubbles(reply) if mode=='chat' else [clean_meeting_novel_text(reply)])
                    replies=[write_message(db,p['id'],cid,'ai',mode,b_txt,engine) for b_txt in bubble_texts]
                    ai_msg=replies[-1] if replies else None
                    if engine!='error' and ai_msg:
                        combined_txt=' / '.join(bubble_texts)
                        log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+combined_txt[:180])
                        last_u=db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND sender='user' ORDER BY created_at DESC,id DESC LIMIT 1",(p['id'],cid)).fetchone()
                        record_dialogue_episode(db,p,c,[dict(last_u)] if last_u else [],dict(ai_msg,text=combined_txt),mode)
                        if mode=='chat':
                            sync_surveillance_from_chat(db,p,c,combined_txt)
                    db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                    db.commit();return self.respond({'reply':ai_msg,'replies':replies,'mode':mode,'warning':warning})
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
                        with CHAT_LOCK:queue_add(db,p['id'],cid,user_msg['id'],txt)
                        db.commit()
                        return self.respond({'user':user_msg,'reply':None,'replies':[],'queued':True,'mode':'chat','queue':queue_view(db,p['id'],cid)})
                    log_event(db,p['id'],cid,'user_message','与 '+p['name']+' 的'+('见面' if mode=='meeting' else '聊天')+'：'+txt[:180])
                    if public_connection()['mode']=='normal':
                        db.commit();return self.respond({'user':user_msg,'reply':None,'replies':[],'auto_meeting':auto,'mode':mode,'warning':'当前处于正常模式且尚未连接 API，请先在「终端」配置 API。'})
                    engine='demo';warning='';settings=load_connection()
                    if all(settings.get(k) for k in ('base_url','api_key','model')):
                        try:reply=clean_meeting_novel_text(completion(compile_messages(db,p,c,mode,latest=txt),log_meta={'mode':mode,'entryPoint':'meeting-message' if mode=='meeting' else 'chat-message','profile':p,'character':c,'parseFn':clean_meeting_novel_text}));engine='live'
                        except Exception as e:warning=str(e);reply='（模型连接失败，消息已保存。请检查终端设置后重试发送。）';engine='error'
                    else:reply=clean_meeting_novel_text(demo_text(db,p,c,mode))
                    ai_msg=write_message(db,p['id'],cid,'ai',mode,reply,engine)
                    if engine!='error':
                        log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+reply[:180])
                        record_dialogue_episode(db,p,c,[user_msg],ai_msg,mode)
                    db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                    db.commit();return self.respond({'user':user_msg,'reply':ai_msg,'replies':[ai_msg],'auto_meeting':auto,'mode':mode,'warning':warning})
                if route=='/api/settings':
                    d=load_connection();
                    if 'demo_enabled' in data:d['demo_enabled']=bool(data['demo_enabled'])
                    if 'proactive_mode' in data and data['proactive_mode'] in ('off','daily','active'):d['proactive_mode']=data['proactive_mode']
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
                    if 'max_tokens' in data:d['max_tokens']=max(100,min(32768,int(data['max_tokens'])))
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
                if route=='/api/system-logs':
                    return self.respond({'logs':SYSTEM_LOGS,'enabled':SYSTEM_LOGS_ENABLED,'storage':'session'})
                if route=='/api/system-logs-settings':
                    if 'enabled' in data:SYSTEM_LOGS_ENABLED=bool(data['enabled'])
                    return self.respond({'ok':True,'enabled':SYSTEM_LOGS_ENABLED,'storage':'session'})
                if route=='/api/system-logs-clear':
                    target_id=str(data.get('id','')).strip()
                    if target_id:
                        SYSTEM_LOGS[:]=[x for x in SYSTEM_LOGS if x.get('id')!=target_id]
                    else:
                        SYSTEM_LOGS.clear()
                    return self.respond({'ok':True,'logs':SYSTEM_LOGS})
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
                    db.commit();return self.respond({'ok':True,'imported':len(entries),'modes':modes,'diagnostics':{'chat':diagnose_presets(db,'chat'),'meeting':diagnose_presets(db,'meeting')}})
                if route=='/api/preset':
                    action=data.get('action');id=data.get('id')
                    if action=='delete':
                        db.execute('DELETE FROM presets WHERE id=?',(id,));db.commit();return self.respond({'ok':True})
                    if action=='disable_defaults':
                        target_mode=data.get('mode','meeting')
                        def_ids=('meeting-main','meeting-pacing') if target_mode=='meeting' else ('chat-main','chat-memory','chat-agency')
                        def_names=('线下见面 · 小说模式','克制与连贯') if target_mode=='meeting' else ('手机聊天 · 自然气泡','记忆与身份边界','人物自主性')
                        db.execute(f"UPDATE presets SET enabled=0 WHERE mode=? AND (id IN ({','.join('?' for _ in def_ids)}) OR name IN ({','.join('?' for _ in def_names)}))",(target_mode,*def_ids,*def_names))
                        db.commit();return self.respond({'ok':True,'diagnostics':diagnose_presets(db,target_mode)})
                    if action=='deduplicate':
                        target_mode=data.get('mode','meeting')
                        rows=db.execute('SELECT * FROM presets WHERE mode=? ORDER BY sort_order,id',(target_mode,)).fetchall()
                        seen=set();removed=0
                        for r in rows:
                            k=f"{r['role']}::{str(r['name']).strip()}"
                            if k in seen:
                                db.execute('DELETE FROM presets WHERE id=?',(r['id'],));removed+=1
                            else:seen.add(k)
                        remaining=db.execute('SELECT id FROM presets WHERE mode=? ORDER BY sort_order,id',(target_mode,)).fetchall()
                        for idx,r in enumerate(remaining):
                            db.execute('UPDATE presets SET sort_order=? WHERE id=?',(idx,r['id']))
                        db.commit();return self.respond({'ok':True,'removed':removed,'diagnostics':diagnose_presets(db,target_mode)})
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
