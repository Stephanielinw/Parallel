#!/usr/bin/env python3
"""Parallel: local-first AI fandom dating demo. Python stdlib only.
Run: python3 server.py. Binds ONLY to 127.0.0.1.
"""
from concurrent.futures import ThreadPoolExecutor
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
        CREATE TABLE IF NOT EXISTS meeting_checkpoints (profile_id TEXT NOT NULL,character_id TEXT NOT NULL,meeting_id TEXT NOT NULL,block_index INTEGER NOT NULL,source_signature TEXT NOT NULL,started_at TEXT NOT NULL,ended_at TEXT NOT NULL,participants TEXT NOT NULL DEFAULT '[]',summary TEXT NOT NULL,keywords TEXT NOT NULL DEFAULT '[]',key_dialogues TEXT NOT NULL DEFAULT '[]',details TEXT NOT NULL DEFAULT '[]',message_ids TEXT NOT NULL DEFAULT '[]',created_at TEXT NOT NULL,PRIMARY KEY(profile_id,character_id,meeting_id,block_index));
        CREATE TABLE IF NOT EXISTS message_translations (message_id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, character_id TEXT NOT NULL, content_version TEXT NOT NULL, target_lang TEXT NOT NULL DEFAULT 'zh-CN', translated_text TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'ready', error_code TEXT NOT NULL DEFAULT '', error_message TEXT NOT NULL DEFAULT '', provider_model TEXT NOT NULL DEFAULT '', updated_at TEXT NOT NULL);
        CREATE INDEX IF NOT EXISTS msg_translations_thread ON message_translations(profile_id, character_id);
        ''')
        cols={r['name'] for r in db.execute('PRAGMA table_info(chat_queue)')}
        for name,typ in [('scheduled_due_at','INTEGER NOT NULL DEFAULT 0'),('recovery_kind',"TEXT NOT NULL DEFAULT ''"),('simulated_at','INTEGER NOT NULL DEFAULT 0')]:
            if name not in cols:db.execute('ALTER TABLE chat_queue ADD COLUMN '+name+' '+typ)
        message_cols={r['name'] for r in db.execute('PRAGMA table_info(messages)')}
        if 'meeting_id' not in message_cols:db.execute("ALTER TABLE messages ADD COLUMN meeting_id TEXT NOT NULL DEFAULT ''")
        if 'quote_json' not in message_cols:db.execute("ALTER TABLE messages ADD COLUMN quote_json TEXT NOT NULL DEFAULT ''")
        for name in ('scene_location','scene_location_evidence','scene_location_signature'):
            if name not in message_cols:db.execute("ALTER TABLE messages ADD COLUMN "+name+" TEXT NOT NULL DEFAULT ''")
        meeting_cols={r['name'] for r in db.execute('PRAGMA table_info(meetings)')}
        if 'location_history' not in meeting_cols:
            db.execute("ALTER TABLE meetings ADD COLUMN location_history TEXT NOT NULL DEFAULT '[]'")
        # A server restart cannot leave a real request in flight.
        for row in db.execute("SELECT * FROM chat_queue WHERE status='inflight'").fetchall():
            sources=parse_json(row['inflight_sources'],[]);pending=parse_json(row['pending'],[])
            merged=list(dict.fromkeys(sources+pending))
            db.execute("UPDATE chat_queue SET pending=?,status='idle',inflight='',inflight_sources='[]',blocked=1,recovery_kind='interrupted' WHERE profile_id=? AND character_id=?",(js(merged),row['profile_id'],row['character_id']))
        if db.execute('SELECT COUNT(*) FROM presets').fetchone()[0]==0:
            for i,p in enumerate(DEFAULT_PRESETS):
                db.execute('INSERT INTO presets VALUES (?,?,?,?,?,?,?)',(p['id'],p['mode'],p['name'],int(p['enabled']),p['role'],p['content'],i))
        sanitize_stored_db(db)
        db.commit()
    if not SECRETFILE.exists():
        save_connection({'base_url':'','api_key':'','model':'','image_base_url':'','image_api_key':'','image_model':'','temperature':0.85,'top_p':1,'max_tokens':4096,'auto_portraits':False,'auto_translate':True,'character_language_pref':'natural','character_language_custom':''})

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

# Task-specific output budgets; keep the existing chat value as the meeting fallback.
TASK_TOKEN_DEFAULTS = {"surveillance":4096,"diary":4096,"bio":2048,"match":1024,"first_message":1024,"proactive":1024,"meeting_summary":1024,"archive":4000,"photo":1024}
TASK_TOKEN_KEYS = ["meeting","surveillance","diary","bio","match","first_message","proactive","meeting_summary","archive","photo","translation","chat_continue"]

def valid_token_budget(v):
    if isinstance(v,bool) or not isinstance(v,(int,float,str)):return None
    if isinstance(v,str) and not re.fullmatch(r'[0-9]+',v.strip()):return None
    try:
        n=int(v)
        return n if float(v)==n and 100<=n<=32768 else None
    except (ValueError,TypeError,OverflowError):return None

def task_token_overrides(raw,strict=False):
    if not isinstance(raw,dict):
        if strict:raise ValueError('任务 Token 设置格式无效')
        return {}
    result={}
    for k in TASK_TOKEN_KEYS:
        if k not in raw or raw[k] is None or raw[k]=='':continue
        n=valid_token_budget(raw[k])
        if n is None:
            if strict:raise ValueError('任务 '+k+' 的 Token 上限必须为 100–32768 的整数')
            continue
        result[k]=n
    return result

def merge_task_token_overrides(existing,patch):
    task_token_overrides(patch,True)
    result=task_token_overrides(existing)
    for k in TASK_TOKEN_KEYS:
        if k in patch:
            if patch[k] is None or patch[k]=='':result.pop(k,None)
            else:result[k]=valid_token_budget(patch[k])
    return result

def resolve_task_max_tokens(settings,mode,entry_point,explicit=None):
    entry=str(entry_point or '').replace('-','_')
    task={'chat_first_message':'first_message','first_message':'first_message','chat_proactive':'proactive','chat_continue':'chat_continue','chat_regenerate':'chat_continue'}.get(entry,mode)
    main=valid_token_budget(settings.get('max_tokens')) or 4096
    own=task_token_overrides(settings.get('task_max_tokens'))
    if task in own:return own[task]
    if task=='meeting':return main
    if task in TASK_TOKEN_DEFAULTS:return TASK_TOKEN_DEFAULTS[task]
    return valid_token_budget(explicit) or main

def public_connection():
    d=load_connection()
    has_api=bool(d.get('api_key') and d.get('base_url') and d.get('model'))
    has_img=bool(d.get('image_api_key') and d.get('image_base_url') and d.get('image_model'))
    demo_enabled=d.get('demo_enabled',True) is not False
    lang_pref=d.get('character_language_pref','natural')
    if lang_pref not in ('natural','zh','en','custom'):lang_pref='natural'
    return {k:v for k,v in d.items() if k not in ('api_key','image_api_key')} | {
        'task_max_tokens':task_token_overrides(d.get('task_max_tokens')),
        'proactive_mode':d.get('proactive_mode','daily'),
        'auto_translate':d.get('auto_translate',True) is not False,
        'character_language_pref':lang_pref,
        'character_language_custom':str(d.get('character_language_custom','') or ''),
        'has_key':bool(d.get('api_key')),
        'has_api_config':has_api,
        'demo_enabled':demo_enabled,
        'has_image_key':bool(d.get('image_api_key')),
        'mode':'live' if has_api else ('demo' if demo_enabled else 'normal'),
        'image_mode':'live' if has_img else 'text'
    }

MINOR_ZH_CHAT_TOKENS={
    'ok','okay','app','wifi','ai','id','ip','vip','bgm','npc','cp',
    'ui','ux','api','vr','ar','pdf','gps','dna','mv','tv','cd',
    'usb','gif','png','jpg','atm','diy','ktv','ceo','hr','pr','qa',
    'pm','am','km','cm','kg','ml','mg','re','re0','re1','re2','re3',
    're4','re5','re6','re7','re8','mcu','tva','bsaa','stars','ubcs',
    'lol','omg','btw','vs','kfc','bmw','ps5','pc','ios','mac'
}
TR_URL_RE=re.compile(r'https?://\S+|www\.\S+',re.IGNORECASE)
TR_HAN_RE=re.compile(r'[\u4e00-\u9fff\u3400-\u4dbf]')
TR_KANA_RE=re.compile(r'[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff]')
TR_HANGUL_RE=re.compile(r'[\uac00-\ud7af\u1100-\u11ff]')
TR_OTHER_SCRIPT_RE=re.compile(r'[\u0400-\u04ff\u0370-\u03ff\u0600-\u06ff\u0e00-\u0e7f\u0590-\u05ff]')
TR_LATIN_WORD_RE=re.compile(r"[A-Za-z\u00c0-\u024f]+(?:'[A-Za-z\u00c0-\u024f]+)*")

def compute_content_version(text):
    normalized=re.sub(r'\r\n?','\n',str(text if text is not None else '')).strip()
    h1=0x811c9dc5
    h2=0x01000193
    for i,ch_s in enumerate(normalized):
        ch=ord(ch_s)
        h1=((h1 ^ ch) * 0x01000193) & 0xFFFFFFFF
        h2=((h2 ^ (ch + (i & 0xFF))) * 0x85ebca6b) & 0xFFFFFFFF
    return f"v1:{len(normalized)}:{h1:08x}{h2:08x}"

def analyze_translation_need(raw_text,ignore_names=None):
    stripped=TR_URL_RE.sub(' ',str(raw_text if raw_text is not None else '')).strip()
    if not stripped:return {'needsTranslation':False,'reason':'empty','detectedScript':'none'}
    han_count=len(TR_HAN_RE.findall(stripped))
    kana_count=len(TR_KANA_RE.findall(stripped))
    hangul_count=len(TR_HANGUL_RE.findall(stripped))
    other_count=len(TR_OTHER_SCRIPT_RE.findall(stripped))
    all_latin=TR_LATIN_WORD_RE.findall(stripped)
    ignored=set()
    for nm in (ignore_names or []):
        for part in TR_LATIN_WORD_RE.findall(str(nm or '')):
            lo=part.lower()
            if len(lo)>=2:ignored.add(lo)
    if kana_count>0:
        return {'needsTranslation':True,'reason':'japanese_or_other_script','detectedScript':'mixed' if (han_count>0 and all_latin) else 'ja'}
    if hangul_count>0:
        return {'needsTranslation':True,'reason':'japanese_or_other_script','detectedScript':'ko'}
    if other_count>0:
        return {'needsTranslation':True,'reason':'japanese_or_other_script','detectedScript':'other'}
    total_latin=sum(len(w) for w in all_latin)
    if han_count==0 and total_latin==0:
        return {'needsTranslation':False,'reason':'non_lexical','detectedScript':'none'}
    if han_count==0 and total_latin>0:
        substantive=[w for w in all_latin if (w.lower() not in MINOR_ZH_CHAT_TOKENS) or len(all_latin)>1]
        if substantive or total_latin>=2:
            if len(all_latin)==1 and all_latin[0].lower() in MINOR_ZH_CHAT_TOKENS:
                return {'needsTranslation':False,'reason':'zh_with_minor_loanword','detectedScript':'en'}
            return {'needsTranslation':True,'reason':'foreign_only','detectedScript':'en'}
        return {'needsTranslation':False,'reason':'non_lexical','detectedScript':'none'}
    if han_count>0 and total_latin==0:
        return {'needsTranslation':False,'reason':'already_zh_cn','detectedScript':'zh'}
    sub_latin=[w for w in all_latin if len(w)>1 and w.lower() not in MINOR_ZH_CHAT_TOKENS and w.lower() not in ignored]
    sub_chars=sum(len(w) for w in sub_latin)
    if len(sub_latin)>=2 or (len(sub_latin)==1 and sub_chars>=7):
        return {'needsTranslation':True,'reason':'mixed_language','detectedScript':'mixed'}
    return {'needsTranslation':False,'reason':'zh_with_minor_loanword','detectedScript':'zh'}

def needs_chinese_translation(raw_text,ignore_names=None):
    return analyze_translation_need(raw_text,ignore_names)['needsTranslation']

def build_character_language_directive(pref='natural',custom_language=''):
    mode=pref if pref in ('natural','zh','en','custom') else 'natural'
    custom=str(custom_language or '').strip()[:40]
    if mode=='zh':
        return '【角色语言偏好：简体中文】本次手机聊天请优先使用自然、符合你原作性格与语气特色的简体中文回复（保留你原有的称呼习惯、幽默或克制感，不要翻译腔）。'
    if mode=='en':
        return '【角色语言偏好：英语】本次手机聊天请优先使用自然、地道的英语回复，完整保留你的原作性格、俚语、讽刺幽默与称呼习惯。'
    if mode=='custom' and custom:
        return f'【角色语言偏好：{custom}】本次手机聊天请优先使用「{custom}」自然回复，完整保留你的原作性格、情绪与说话方式。'
    return '【角色语言策略：自然选择】请依据你自身的原作背景、母语、文化身份、个人语言能力与当前交流情境自然使用语言（例如欧美角色可用英语，日本角色可用日语，中国角色可用中文，多语言角色可根据情境自然切换），不强制统一语言，也绝不为了翻译功能改变原有性格或说话方式；用户可自由使用中文、英语或其他语言发消息。'

def build_batch_translation_messages(items,character_name,character_cue=''):
    cue=str(character_cue or '').strip()[:120]
    lines=[
        '你是 Parallel 手机聊天界面的系统阅读辅助翻译器。',
        '任务：将输入数组中每条角色消息准确翻译为自然、地道的简体中文。',
        '铁律：',
        '1. 忠实保留原文的情绪、幽默、讽刺、俚语、称呼、停顿与人物说话风格，避免生硬翻译腔。',
        '2. 严禁擅自添加任何解释、注释、旁白、动作描写、括号补充或改变角色原本表达的意思。',
        '3. 若某条消息为中外文混合，请整理为通顺自然的完整简体中文句意，专有名词可自然保留。',
        '4. 严格只输出一个 JSON 对象，格式为 {"translations":[{"id":"原id","zh":"对应简体中文译文"}]}，必须与输入 id 一一对应且数量完全一致。',
    ]
    if character_name:
        lines.append(f"当前发言角色语气参考：{character_name}{f'（{cue}）' if cue else ''}。")
    return [
        {'role':'system','content':'\n'.join(lines)},
        {'role':'user','content':js({'items':items})}
    ]

def parse_translation_batch_response(raw_content,expected_items):
    candidate=str(raw_content if raw_content is not None else '').strip()
    m=re.match(r'^```(?:json)?\s*([\s\S]*?)\s*```$',candidate,re.IGNORECASE)
    if m:candidate=m.group(1).strip()
    parsed=json.loads(candidate)
    if isinstance(parsed,dict) and isinstance(parsed.get('translations'),list):
        rows=parsed['translations']
    elif isinstance(parsed,list):
        rows=parsed
    else:
        raise ValueError('Translation JSON missing translations array')
    expected_ids={x['id'] for x in expected_items}
    out={}
    for row in rows:
        if not isinstance(row,dict):continue
        rid=str(row.get('id') or '').strip()
        zh=str(row.get('zh') if row.get('zh') is not None else (row.get('translation') if row.get('translation') is not None else (row.get('text') or ''))).strip()
        if rid and rid in expected_ids and zh:
            out[rid]=zh
    if not out and len(rows)==len(expected_items):
        for i,item in enumerate(expected_items):
            row=rows[i]
            zh=row.strip() if isinstance(row,str) else str((row or {}).get('zh') or (row or {}).get('translation') or '').strip()
            if zh:out[item['id']]=zh
    missing=[x['id'] for x in expected_items if x['id'] not in out]
    return {'translations':out,'missingIds':missing}

def invalidate_translation(db,mid):
    if mid:
        db.execute('DELETE FROM message_translations WHERE message_id=?',(mid,))

def get_matched_translations_for_thread(db,pid,cid,msgs):
    rows=db.execute('SELECT * FROM message_translations WHERE profile_id=? AND character_id=?',(pid,cid)).fetchall()
    by_mid={r['message_id']:dict(r) for r in rows}
    out={}
    for m in (msgs or []):
        if m.get('sender')!='ai' or m.get('mode')!='chat' or m.get('engine') in ('recalled','error'):continue
        entry=by_mid.get(m['id'])
        if not entry:continue
        ver=compute_content_version(clean_chat_bubble_text(m.get('text','')))
        if entry.get('content_version')==ver:
            out[m['id']]=entry
    return out

def demo_translate_to_zh(raw):
    s=str(raw or '').strip()
    if re.search(r'just wrapped up|off duty',s,re.IGNORECASE):return '刚结束一轮漫长的值班，总算下班了。'
    if re.search(r'coffee',s,re.IGNORECASE):return '先喝杯咖啡喘口气，有事随时说。'
    if 'また後で' in s or '後で連絡' in s:return '晚点再联系你。'
    if 'お疲れ' in s or 'おつかれ' in s:return '辛苦了。'
    return f'（演示译文）{s}'

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

def _is_narration_marker(raw):
    return bool(re.fullmatch(r'(?:旁白|【旁白】|\[旁白\]|（旁白）|\(旁白\)|\*旁白\*|narrator|narration)\s*[:：。.!！]?\s*',str(raw or '').strip(),re.IGNORECASE))

def _is_bare_chat_divider(raw):
    return bool(re.fullmatch(r'[\s|｜]*[|｜]{2,}[\s|｜]*',str(raw or '')))

def _pipe_chat_parts(line):
    if _is_bare_chat_divider(line):return []
    result=[];start=0
    for match in re.finditer(r'[|｜]{2,}',line):
        i=match.start();before=line[:i];after=line[match.end():]
        if _has_unclosed_quote_before(before) or before.count(chr(96)) % 2 or before.endswith(chr(92)):continue
        if match.group()=='||' and re.fullmatch(r'[\s(]*[a-z_$0-9][\w.$]*\s*',before,re.ASCII) and re.fullmatch(r'\s*[a-z_$0-9][\w.$]*[\s)]*',after,re.ASCII):continue
        result.append(line[start:i]);start=match.end()
    result.append(line[start:])
    return result

def _explicit_chat_parts(raw):
    parts=[]
    for line in re.sub(r'\r\n?','\n',str(raw or '')).split('\n'):
        for piece in _pipe_chat_parts(_split_inline_protocol_line(line)):
            cleaned=clean_chat_bubble_text(piece)
            if cleaned and not _is_bare_chat_divider(cleaned) and not _is_narration_marker(cleaned):parts.append(cleaned)
    return parts

KNOWN_PROXY_ERROR_PATTERNS=[
    (re.compile(r'所有\s*API\s*密钥均请求失败|具体错误请查看轮询日志',re.IGNORECASE),'PROXY_ALL_KEYS_FAILED','反代服务所有 API 密钥均请求失败（请检查反代轮询日志或更换可用密钥）'),
    (re.compile(r'^\s*(?:\[\s*(?:API|Upstream|Proxy|Gateway|OpenAI|Gemini|Claude|Anthropic|DeepSeek|OneAPI|NewAPI)\s*(?:Error|Exception|Fault)\s*\]|【\s*(?:API|接口|反代|上游|网关|系统)(?:错误|报错|异常|请求失败)\s*】)\s*[:：\-]?',re.IGNORECASE),'PROXY_WRAPPED_ERROR','反代或上游接口返回了包装在正文中的错误提示'),
    (re.compile(r'^(?:\s*(?:Error|错误|请求失败|调用失败|上游错误|反代错误|网关错误)\s*[:：]\s*(?:HTTP\s*[45]\d{2}|status\s*code\s*[45]\d{2}|all\s*api\s*keys\s*failed|no\s*available\s*channel|channel\s*error|quota\s*exceeded|rate\s*limit\s*exceeded|invalid\s*api\s*key|model\s*not\s*found))',re.IGNORECASE),'PROXY_WRAPPED_ERROR','接口返回了错误状态提示')
]

def detect_proxy_wrapped_error(raw_text):
    s=str(raw_text or '').strip()
    if not s:return None
    for pat,code,title in KNOWN_PROXY_ERROR_PATTERNS:
        if pat.search(s) and len(s)<=600:
            return {'code':code,'error_code':code,'error_type':code,'message':title,'detail':s[:500]}
    if s.startswith('{') and s.endswith('}') and len(s)<=2000:
        try:
            parsed=json.loads(s)
            if isinstance(parsed,dict) and parsed.get('error') and not parsed.get('choices') and not parsed.get('reply') and not parsed.get('slots') and not parsed.get('entry'):
                err_obj=parsed['error']
                err_msg=err_obj if isinstance(err_obj,str) else (err_obj.get('message') or err_obj.get('code') or err_obj.get('type') or js(err_obj))
                return {'code':'HTTP_200_ERROR_OBJECT','error_code':'HTTP_200_ERROR_OBJECT','error_type':'HTTP_200_ERROR_OBJECT','message':f"接口返回错误对象：{str(err_msg)[:180]}",'detail':s[:500]}
        except Exception:
            pass
    return None

def is_legacy_error_artifact(m):
    if not isinstance(m,dict):return False
    if m.get('engine')=='error':return True
    if m.get('sender')=='ai' and isinstance(m.get('text'),str):
        t=m['text'].strip()
        if re.fullmatch(r'（(?:生成失败|模型连接失败)[：:，,][\s\S]*）',t):return True
        if detect_proxy_wrapped_error(t):return True
    return False

def _is_chat_artifact(m):
    if is_legacy_error_artifact(m):return True
    return m.get('sender')=='ai' and m.get('mode')!='meeting' and m.get('engine')!='recalled' and (_is_bare_chat_divider(clean_chat_bubble_text(m.get('text'))) or _is_narration_marker(clean_chat_bubble_text(m.get('text'))))

# Only accept a known, closed leading reasoning block; ambiguous analysis is not a chat response.
def guard_chat_reasoning(raw):
    text=str(raw if raw is not None else '').strip()
    removed=False
    opening=re.compile(r'^<(think|thinking|reasoning|analysis)(?:\s[^<>]*)?>',re.I)
    any_tag=re.compile(r'</?(?:think|thinking|reasoning|analysis)(?:\s[^<>]*)?>',re.I)
    for _ in range(8):
        start=opening.match(text)
        if not start:break
        rest=text[start.end():]
        close=re.search(r'</'+start.group(1)+r'\s*>',rest,re.I)
        if not close or any_tag.search(rest[:close.start()]):return None
        text=rest[close.end():].strip()
        removed=True
    if opening.match(text) or re.match(r'^</(?:think|thinking|reasoning|analysis)\s*>',text,re.I):return None
    if removed and (not text or any_tag.search(text)):return None
    heading=r'^(?:#{1,6}[ \t]*)?(?:\*{1,2}[ \t]*)?(?:思维过程|思考过程|分析过程|推理过程|思维链|chain of thought|thinking process|reasoning process|reasoning|analysis)(?:[ \t]*\*{1,2})?[ \t]*[:：]?(?:[ \t]*\*{1,2})?[ \t]*(?:\r?\n|$)'
    if re.match(heading,text,re.I):return None
    return text

def split_chat_bubbles(raw):
    raw_str=str(raw or '').strip()
    if not raw_str:return ['…']
    parts=_explicit_chat_parts(raw_str)
    if not parts and (_is_bare_chat_divider(PROTOCOL_LEADING_TAG_RE.sub('',raw_str)) or _is_narration_marker(clean_chat_bubble_text(raw_str))):return []
    if len(parts)==1 and len(parts[0])>=120:
        sentences=[clean_chat_bubble_text(s) for s in re.findall(r'[^。！？!?]+[。！？!?]+|[^。！？!?]+$',parts[0]) if clean_chat_bubble_text(s)]
        if len(sentences)>=2:
            parts=[];buf=''
            for s in sentences:
                if not buf:buf=s
                elif len(buf+s)<=48 or len(buf)<24:buf+=s
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

TASK_STATES={}
BG_ERRORS={}

def task_key_of(pid='',cid='',task_type='chat'):
    return f"{pid or 'global'}::{cid or 'global'}::{task_type or 'chat'}"

def get_task_state(pid,cid,task_type='chat'):
    k=task_key_of(pid,cid,task_type)
    if k not in TASK_STATES:
        TASK_STATES[k]={
            'key':k,'profile_id':pid or '','character_id':cid or '','task_type':task_type or 'chat',
            'status':'idle','paused':False,'attempt':0,'last_error':None,'last_task_id':'','updated_at':utc()
        }
    return TASK_STATES[k]

def clear_task_state(pid,cid,task_type='chat'):
    k=task_key_of(pid,cid,task_type)
    if k in TASK_STATES:
        TASK_STATES[k].update(status='idle',paused=False,last_error=None,updated_at=utc())

def clear_task_states_for_pair(pid,cid):
    prefix=f"{pid or ''}::{cid or ''}::"
    for k,st in list(TASK_STATES.items()):
        if k.startswith(prefix):
            st.update(status='idle',paused=False,last_error=None,updated_at=utc())

def queue_view(db,pid,cid):
    m_state=MEETING_STATE.get((pid,cid),{})
    hot_chat=bool(m_state.get('hot_chat',False))
    t_state=get_task_state(pid,cid,'chat')
    is_paused=bool(t_state.get('paused'))
    x=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    if x and x['recovery_kind']:is_paused=True
    if not x:
        return {'count':0,'pendingIds':[],'dueAt':0,'remainingMs':0,'status':'paused' if is_paused else 'idle','blocked':is_paused,'paused':is_paused,'lastError':t_state.get('last_error'),'paceMode':'hot' if hot_chat else 'daily','hotChat':hot_chat,'delayMinutes':1 if hot_chat else 0,'targetTimeLabel':'','scheduleReason':'回复已暂停 · 点击恢复' if is_paused else ''}
    pending=parse_json(x['pending'],[])
    due_at=int(x['due_at'] or 0)
    status_val='paused' if (is_paused and x['status']!='inflight') else x['status']
    return {
        'count':len(pending),
        'pendingIds':list(pending),
        'dueAt':due_at,
        'remainingMs':0 if is_paused else max(0,due_at-now_ms()),
        'status':status_val,
        'blocked':bool(x['blocked']) or is_paused,
        'paused':is_paused,
        'lastError':t_state.get('last_error'),
        'recoveryKind':x['recovery_kind'],
        'paceMode':m_state.get('pace_mode') or ('hot' if hot_chat else 'daily'),
        'hotChat':hot_chat,
        'delayMinutes':m_state.get('delay_minutes') or (1 if hot_chat else 20),
        'targetTimeLabel':fmt_hhmm(due_at) if due_at else m_state.get('target_time_label',''),
        'scheduleReason':'回复已暂停 · 点击恢复' if is_paused else m_state.get('schedule_reason','')
    }

def queue_add(db,pid,cid,mid,msg_text=''):
    m_state=MEETING_STATE.setdefault((pid,cid),{})
    hot_chat=bool(m_state.get('hot_chat',False))
    t_state=get_task_state(pid,cid,'chat')
    is_paused=bool(t_state.get('paused'))
    c=BY_ID.get(cid)
    x=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    if x and x['recovery_kind']:is_paused=True
    pending=parse_json(x['pending'],[]) if x else []
    was_empty=(len(pending)==0)
    if mid not in pending:pending.append(mid)
    now=now_ms()
    cur_due=int(x['due_at'] or 0) if x else 0
    if is_paused:
        due_at=cur_due
    elif hot_chat:
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
    blocked_val=1 if is_paused else 0
    if x:db.execute('UPDATE chat_queue SET pending=?,due_at=?,blocked=? WHERE profile_id=? AND character_id=?',(js(pending),due_at,blocked_val,pid,cid))
    else:db.execute('INSERT INTO chat_queue(profile_id,character_id,pending,due_at,blocked) VALUES (?,?,?,?,?)',(pid,cid,js(pending),due_at,blocked_val))
    return queue_view(db,pid,cid)

def queue_cancel(db,pid,cid):
    # The texts remain in message history; the next meeting reply can see them.
    m_state=MEETING_STATE.get((pid,cid))
    if m_state:
        m_state['target_time_label']=''
        m_state['schedule_reason']=''
    clear_task_states_for_pair(pid,cid)
    db.execute("UPDATE chat_queue SET pending='[]',due_at=0,status='idle',inflight='',inflight_sources='[]',blocked=0,scheduled_due_at=0,recovery_kind='',simulated_at=0,revision=revision+1 WHERE profile_id=? AND character_id=?",(pid,cid))

def queue_flush(db,p,c,force=False,manual_resume=False,recovery=None):
    pid,cid=p['id'],c['id']
    t_state=get_task_state(pid,cid,'chat')
    with CHAT_LOCK:
        q=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        if not q:return {'queued':False,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if q['status']=='inflight':return {'queued':True,'inflight':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        pending_list=parse_json(q['pending'],[])
        if not pending_list:
            if manual_resume and t_state.get('paused'):
                clear_task_state(pid,cid,'chat')
            return {'queued':False,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if (t_state.get('paused') or q['recovery_kind']) and not manual_resume:
            return {'queued':True,'paused':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if q['blocked'] and not force and not manual_resume:
            return {'queued':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if not force and not manual_resume and now_ms()<q['due_at']:
            return {'queued':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if q['recovery_kind']=='user' and recovery is not None:return {'queued':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        cur_mode=public_connection()['mode']
        if cur_mode=='normal':
            db.execute("UPDATE chat_queue SET blocked=1 WHERE profile_id=? AND character_id=?",(pid,cid))
            db.commit()
            return {'queued':True,'reply':None,'replies':[],'warning':'当前处于正常模式且尚未连接 API，请先在「终端」配置 API。','queue':queue_view(db,pid,cid)}
        due=int(q['due_at'] or q['scheduled_due_at'] or 0)
        if recovery and due>recovery['openedAt']:return {'queued':True,'reply':None,'replies':[],'queue':queue_view(db,pid,cid)}
        if manual_resume:
            t_state['paused']=False
            t_state['attempt']=int(t_state.get('attempt') or 0)+1
        else:
            t_state['attempt']=1
        t_state['status']='inflight'
        t_state['updated_at']=utc()
        sources=pending_list;token=uid();revision=q['revision']
        simulated_at=recover_reply_time(db,pid,cid,sources,due,recovery,q['simulated_at']) if recovery and not recovery.get('manual') else 0
        db.execute("UPDATE chat_queue SET pending='[]',due_at=0,status='inflight',inflight=?,inflight_sources=?,blocked=0,scheduled_due_at=?,simulated_at=?,recovery_kind='' WHERE profile_id=? AND character_id=?",(token,js(sources),due,simulated_at,pid,cid))
        last=db.execute('SELECT rowid FROM messages WHERE id=?',(sources[-1],)).fetchone()
        prompt=compile_messages(db,p,c,'chat',through_rowid=last['rowid'] if last else None,pending_ids=sources,simulated_at=simulated_at)
        db.commit()
    settings=load_connection();warning='';engine='demo';reply=None;replies=[];api_error=None
    if all(settings.get(k) for k in ('base_url','api_key','model')):
        try:
            txt=completion(prompt,log_meta={'mode':'chat','task_type':'chat','entryPoint':'chat-flush','profile':p,'character':c,'attempt':t_state['attempt'],'retry_of_task_id':t_state.get('last_task_id',''),'simulated_reply_at':datetime.fromtimestamp(simulated_at/1000,timezone.utc).isoformat() if simulated_at else '','parseFn':lambda raw:' / '.join(split_chat_bubbles(raw))})
            engine='live'
            # Two-stage on-demand retrieval: if the character independently
            # introduces a scene-specific recollection, fetch original evidence
            # before committing any such message as a historical fact.
            if not any('现场原文 #' in str(m.get('content') or '') for m in prompt) and needs_meeting_detail(txt):
                evidence=recent_actual_meeting_context(db,p,c,txt,simulated_at)
                if '现场原文 #' in evidence:
                    try:
                        sourced=compile_messages(db,p,c,'chat',latest=txt,through_rowid=last['rowid'] if last else None,pending_ids=sources,simulated_at=simulated_at)
                        txt=completion(sourced,log_meta={'mode':'chat','task_type':'chat','entryPoint':'chat-meeting-detail-recall','profile':p,'character':c,
                            'parseFn':lambda raw:' / '.join(split_chat_bubbles(raw))})
                    except Exception:
                        txt='那天的事我记得，不过有些细节我不想凭空说错。'
        except Exception as e:
            warning=str(e);engine='error';api_error=getattr(e,'api_error',None)
    else:txt=demo_text(db,p,c,'chat')
    with CHAT_LOCK:
        current=db.execute('SELECT * FROM chat_queue WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        rel=db.execute('SELECT mode,status FROM relations WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
        if not current or current['inflight']!=token or current['revision']!=revision or not rel or rel['mode']!='chat' or rel['status']!='matched':
            return {'queued':False,'reply':None,'replies':[],'discarded':True,'queue':queue_view(db,pid,cid)}
        if engine=='error':
            newer=parse_json(current['pending'],[])
            restore=[m for m in sources if m not in newer]+newer
            t_state['status']='error'
            t_state['last_error']=api_error
            if api_error and api_error.get('task_id'):t_state['last_task_id']=api_error['task_id']
            t_state['updated_at']=utc()
            db.execute("UPDATE chat_queue SET pending=?,due_at=?,status='idle',inflight='',inflight_sources='[]',blocked=1,recovery_kind='error' WHERE profile_id=? AND character_id=?",(js(restore),int(current['due_at'] or 0),pid,cid))
        else:
            clear_task_state(pid,cid,'chat')
            bubble_texts=split_chat_bubbles(txt)
            replies=[write_message(db,pid,cid,'ai','chat',b_txt,engine,at=simulated_at) for b_txt in bubble_texts]
            reply=replies[-1] if replies else None
            combined_txt=' / '.join(bubble_texts)
            log_event(db,pid,cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+combined_txt[:180],at=simulated_at)
            user_rows=[]
            for mid in sources:
                ur=db.execute('SELECT * FROM messages WHERE id=?',(mid,)).fetchone()
                if ur:user_rows.append(dict(ur))
            if reply:
                record_dialogue_episode(db,p,c,user_rows,dict(reply,text=combined_txt),'chat')
                sync_surveillance_from_chat(db,p,c,combined_txt,at=simulated_at)
            db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),pid,cid))
            db.execute("UPDATE chat_queue SET status='idle',inflight='',inflight_sources='[]',blocked=0,scheduled_due_at=0,simulated_at=0,recovery_kind='' WHERE profile_id=? AND character_id=?",(pid,cid))
        db.commit()
    return {'queued':engine=='error','reply':reply,'replies':replies,'warning':warning,'apiError':api_error,'queue':queue_view(db,pid,cid)}

def recover_reply_time(db,pid,cid,sources,due,recovery,prior=0):
    candidate=int(prior or due or 0)
    if not candidate or candidate>recovery['openedAt'] or (not prior and candidate<recovery['offlineSince']):return 0
    rows=db.execute('SELECT id,created_at FROM messages WHERE profile_id=? AND character_id=?',(pid,cid)).fetchall()
    if not set(sources).issubset({r['id'] for r in rows}):return 0
    try:
        if any(datetime.fromisoformat(r['created_at'].replace('Z','+00:00')).timestamp()*1000>candidate for r in rows):return 0
        events=db.execute("SELECT created_at FROM events WHERE profile_id=? AND character_id=? AND type IN ('matched','unmatched','meeting','return')",(pid,cid)).fetchall()
        if any(datetime.fromisoformat(r['created_at'].replace('Z','+00:00')).timestamp()*1000>candidate for r in events):return 0
    except (ValueError,TypeError):return 0
    return candidate

RECOVERY_LOCK=threading.Lock()
RECOVERY_SESSIONS=set()
def recover_due_queues(db,data):
    if public_connection()['mode']=='normal':return {'flushed':[]}
    manual=data.get('manual') is True
    session=str(data.get('session') or '')
    if not RECOVERY_LOCK.acquire(blocking=False):return {'flushed':[]}
    try:
        if not manual and (not session or session in RECOVERY_SESSIONS):return {'flushed':[]}
        if not manual:
            RECOVERY_SESSIONS.add(session)
            if len(RECOVERY_SESSIONS)>64:RECOVERY_SESSIONS.discard(next(iter(RECOVERY_SESSIONS-{session})))
        opened=min(now_ms(),int(data.get('openedAt') or now_ms()))
        since=max(0,min(opened,int(data.get('offlineSince') or 0)))
        recovery={'openedAt':opened,'offlineSince':since,'manual':manual}
        jobs=[]
        for r in db.execute("SELECT q.* FROM chat_queue q JOIN relations r ON r.profile_id=q.profile_id AND r.character_id=q.character_id WHERE r.status='matched' AND r.mode='chat' AND q.status<>'inflight'").fetchall():
            if manual and r['profile_id']!=data.get('profileId'):continue
            if not parse_json(r['pending'],[]) or r['recovery_kind']=='user':continue
            state=get_task_state(r['profile_id'],r['character_id'],'chat')
            failed=bool(r['blocked'] or r['recovery_kind'] or state.get('paused'))
            recoverable=r['recovery_kind'] in ('error','interrupted')
            if failed and not recoverable:continue
            if manual and not failed:continue
            due=int(r['due_at'] or r['scheduled_due_at'] or 0)
            if due>opened or (not failed and not due):continue
            if r['character_id'] in BY_ID:jobs.append((due,r['profile_id'],r['character_id'],failed))
        jobs.sort()
        db.commit()
        def work(job):
            _,pid,cid,failed=job;c=BY_ID[cid]
            background=pid!=data.get('profileId') or cid!=data.get('activeCharacterId')
            try:
                with connect() as conn:
                    p=profile_get(conn,pid)
                    res=queue_flush(conn,p,c,force=failed,manual_resume=failed,recovery=recovery)
                if res.get('reply') or res.get('warning') or res.get('apiError'):
                    return {'profileId':pid,'characterId':cid,'characterName':c['name'],'reply':res.get('reply'),'warning':res.get('warning',''),'apiError':res.get('apiError'),'background':background}
            except Exception as exc:return {'profileId':pid,'characterId':cid,'characterName':c['name'],'warning':str(exc),'background':background}
        with ThreadPoolExecutor(max_workers=2) as pool:return {'flushed':[r for r in pool.map(work,jobs) if r]}
    finally:RECOVERY_LOCK.release()

def queue_flush_due(db,p):
    pid=p['id'];now=now_ms();flushed=[]
    rows=db.execute("SELECT character_id,pending,due_at,status,blocked FROM chat_queue WHERE profile_id=? AND status<>'inflight' AND blocked=0 AND due_at>0 AND due_at<=?",(pid,now)).fetchall()
    for row in rows:
        cid=row['character_id'];c=BY_ID.get(cid)
        if not c or not parse_json(row['pending'],[]):continue
        if get_task_state(pid,cid,'chat').get('paused'):continue
        rel=db.execute("SELECT status,mode FROM relations WHERE profile_id=? AND character_id=?",(pid,cid)).fetchone()
        if not rel or rel['status']!='matched' or rel['mode']!='chat':continue
        res=queue_flush(db,p,c,force=False)
        if res.get('reply') or res.get('warning'):
            flushed.append({'characterId':cid,'characterName':c['name'],'reply':res.get('reply'),'warning':res.get('warning',''),'apiError':res.get('apiError')})
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

def get_current_surveillance_slot(db,p,c,at=0):
    date=datetime.fromtimestamp(at/1000).astimezone().strftime('%Y-%m-%d') if at else local_date_str()
    rec=get_or_init_surveillance(db,p,c,date)
    now_hhmm=fmt_hhmm(at or None)
    now_m=hhmm_to_min(now_hhmm)
    rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
    m_state=MEETING_STATE.get((p['id'],c['id']),{})
    if rel and rel['mode']=='meeting':
        if m_state.get('active_meeting_id'):refresh_meeting_scene_history(db,p,c)
        loc=m_state.get('meeting_location') or '约定的街角咖啡馆'
        return {
            'start':('00:00' if m_state.get('meeting_started_at') and chat_clock_label(m_state['meeting_started_at'])[:10]!=date else fmt_hhmm(m_state.get('meeting_started_at') or None)),
            'end':now_hhmm,
            'location':loc,
            'status':f"与 {p['name']} 见面中（接触待确认）",
            'activity':f"在「{loc}」进行本次见面，首次接触由现场实际行动决定",
            'scene':f"实时画面：{c['name']}位于「{loc}」，当前场景以实际互动为准；不能默认已经见到或接触 {p['name']}。",
            'source':'meeting',
            'isCurrent':True
        }
    slots=rec.get('slots') or []
    idx=active_slot_index(slots,now_m)
    active=slots[idx] if idx>=0 else (slots[-1] if slots else None)
    return dict(verified_surveillance_slot(c,active),isCurrent=True) if active else {
        'start':'00:00','end':'23:59','location':f"{c['name']}的常去街角",'status':'日常活动','activity':'正在处理日常事务','scene':f"{c['name']}正在日常活动中。",'source':'schedule','isCurrent':True
    }

def sync_surveillance_on_meeting_start(db,p,c,loc,meeting_id=''):
    rec=get_or_init_surveillance(db,p,c)
    state=MEETING_STATE.get((p['id'],c['id']),{})
    started=state.get('meeting_started_at') or utc()
    rec['live_override']={'start':fmt_hhmm(started),'started_at':started,
                          'location':loc or state.get('meeting_location') or '约定的见面地点',
                          'meeting_id':meeting_id or state.get('active_meeting_id','')}
    # A real encounter cancels every unobserved future plan immediately.
    # The live interval is rendered from its start timestamp and the scene location.
    cut=hhmm_to_min(fmt_hhmm())
    retained=[]
    for slot in rec.get('slots',[]):
        begin,end=hhmm_to_min(slot['start']),hhmm_to_min(slot['end'])
        if begin>=cut:continue
        retained.append(dict(slot,end=min_to_hhmm(cut)) if end>cut else slot)
    rec['slots']=retained
    for key in ('post_meeting_anchor','post_meeting_location','post_meeting_id'):rec.pop(key,None)
    rec['updated_at']=utc()


def observed_meeting_segments(p,c,meeting_rec,date_str,live=False):
    """Day-scoped observed scene path; never render a speculative schedule as
    an actual move. A cross-midnight encounter creates segments on both days."""
    mid=str(meeting_rec.get('id') or '')
    history=meeting_rec.get('location_history') or []
    if isinstance(history,str):history=parse_json(history,[])
    try:
        begin=datetime.fromisoformat(str(meeting_rec['started_at']).replace('Z','+00:00')).astimezone()
        finish=datetime.fromisoformat(str(meeting_rec['ended_at']).replace('Z','+00:00')).astimezone()
        day=datetime.fromisoformat(date_str).astimezone()
        start_day=day.replace(hour=0,minute=0,second=0,microsecond=0)
        end_day=start_day+timedelta(days=1)
    except (ValueError,TypeError,KeyError):return []
    if finish<begin or finish<start_day or begin>=end_day:return []
    events=[dict(at=meeting_rec['started_at'],location=history[0].get('location') if history else meeting_rec.get('location','约定的见面地点'),source='start')]
    events.extend(dict(x) for x in history if x.get('location') and x.get('at'))
    validated=[]
    for event in events:
        try:at=datetime.fromisoformat(str(event['at']).replace('Z','+00:00')).astimezone()
        except (ValueError,TypeError):continue
        if at<begin:at=begin
        if at>finish:continue
        validated.append((at,str(event['location'])))
    if not validated:return []
    validated.sort(key=lambda x:x[0])
    condensed=[]
    for at,loc in validated:
        if condensed and condensed[-1][1]==loc:continue
        condensed.append((at,loc))
    segments=[]
    for i,(at,loc) in enumerate(condensed):
        until=condensed[i+1][0] if i+1<len(condensed) else finish
        lo=max(begin,at,start_day)
        hi=min(finish,until,end_day-timedelta(seconds=1))
        if hi<lo:continue
        start_s=lo.strftime('%H:%M')
        end_s=hi.strftime('%H:%M')
        if start_s==end_s and i<len(condensed)-1:continue
        segments.append({
            'id':'slot_real_meeting_'+mid+'_'+str(i)+'_'+date_str,
            'start':start_s,'end':end_s,'location':loc,'status':'线下见面足迹',
            'activity':'与 '+p['name']+' 在「'+loc+'」实际见面',
            'scene':str(meeting_rec.get('summary') or c['name']+'在此处的已确认现场行动')[:150],
            'source':'meeting','meeting_id':mid
        })
    if live and segments:segments[-1]['id']='live_meeting_'+mid
    return segments

def sync_surveillance_on_meeting_end(db,p,c,meeting_rec):
    if not meeting_rec:return
    started=str(meeting_rec.get('started_at') or '')
    ended=str(meeting_rec.get('ended_at') or utc())
    try:
        begin_dt=datetime.fromisoformat(started.replace('Z','+00:00')).astimezone()
        finish_dt=datetime.fromisoformat(ended.replace('Z','+00:00')).astimezone()
    except (ValueError,TypeError):return
    if finish_dt<begin_dt:return
    loc=str(meeting_rec.get('location') or '约定的见面地点')
    date=begin_dt.date()
    while date<=finish_dt.date():
        date_str=date.isoformat()
        rec=get_or_init_surveillance(db,p,c,date_str)
        current_day=date==finish_dt.date()
        actual=observed_meeting_segments(p,c,meeting_rec,date_str)
        if actual:
            rec['slots']=overlay_actual_slots([x for x in rec['slots'] if not (x.get('meeting_id')==meeting_rec.get('id') and x.get('source')=='meeting')],actual)
        rec['live_override']=None
        rec['updated_at']=utc()
        date+=timedelta(days=1)
    anchor_remaining_day_after_meeting(db,p,c,meeting_rec,finish_dt)

def anchor_remaining_day_after_meeting(db,p,c,meeting_rec,from_dt=None):
    if not meeting_rec:return None
    try:
        finish=(from_dt or datetime.fromisoformat(str(meeting_rec['ended_at']).replace('Z','+00:00'))).astimezone()
    except (KeyError,ValueError,TypeError):return None
    minute=finish.hour*60+finish.minute
    if minute>=1439:return None
    rec=get_or_init_surveillance(db,p,c,finish.strftime('%Y-%m-%d'))
    loc=str(meeting_rec.get('location') or '约定的见面地点')
    ident=str(meeting_rec.get('id') or '')
    pending={'id':'slot_meeting_shift_'+ident+'_'+str(minute),'start':min_to_hhmm(minute),'end':'23:59',
             'location':loc,'status':'见面后安排待定',
             'activity':'刚结束见面，尚未确认离开当前地点',
             'scene':c['name']+'刚结束与 '+p['name']+' 的见面，最后确认身处「'+loc+'」，后续尚未发生。',
             'source':'meeting_shift','meeting_id':ident}
    rec['slots']=overlay_actual_slots(rec['slots'],[pending])
    rec['post_meeting_anchor']=str(meeting_rec.get('ended_at') or finish.isoformat())
    rec['post_meeting_location']=loc
    rec['post_meeting_id']=ident
    rec['updated_at']=utc()
    return rec

def replan_remaining_day_after_meeting(db,p,c,meeting_rec,from_dt=None):
    if public_connection()['mode']!='live':return None
    try:
        original=datetime.fromisoformat(str(meeting_rec['ended_at']).replace('Z','+00:00')).astimezone()
        anchor=max(original,(from_dt or original).astimezone())
    except (ValueError,TypeError,KeyError):return None
    if anchor.date()!=datetime.now().astimezone().date():return None
    rec=anchor_remaining_day_after_meeting(db,p,c,meeting_rec,anchor)
    if not rec:return None
    minute=anchor.hour*60+anchor.minute
    settle_end=min(1439,minute+15)
    if settle_end>=1424:return rec
    place=rec['post_meeting_location']
    mid=rec['post_meeting_id']
    anchor_stamp=rec['post_meeting_anchor']
    plan_from=min_to_hhmm(settle_end)
    try:
        instruction=(
            '你是个人日程规划器。今天先前的生活日程是可取消的计划，真实见面优先。'
            '只规划今天余下尚未发生的时间；不能修改已经发生的见面与短信。'
            '角色刚在「'+place+'」与 '+p['name']+' 结束见面，尚无证据已离开此处。'
            '安排合理的告别、停留、交通和工作衔接，不能瞬移；角色必须符合其原作设定。'
            '返回 2 至 4 个按时间排序的时段，首段不早于 '+plan_from+'，末段覆盖23:59。'
            '仅输出 JSON：{"slots":[{"start":"HH:MM","end":"HH:MM","location":"地点",'
            '"status":"状态","activity":"行为","scene":"第三人称画面"}]}。'
        )
        response=completion([
            {'role':'system','content':instruction},
            {'role':'user','content':'日期：'+anchor.strftime('%Y-%m-%d')+'；实际结束时间：'+anchor.strftime('%H:%M')+
             '；最后确认地点：'+place+'；见面摘要：'+str(meeting_rec.get('summary') or '')[:260]+'。仅重排此后的时间。'}
        ],json_mode=True,max_tokens=1200,temperature=0.35,log_meta={
            'mode':'surveillance','entryPoint':'surveillance_after_meeting','profile':p,'character':c})
        rows=parse_json(response,{}).get('slots') or []
        if not isinstance(rows,list):return rec
        state=MEETING_STATE.get((p['id'],c['id']),{})
        rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
        if (rel and rel['mode']=='meeting') or state.get('active_meeting_id') or rec.get('post_meeting_id')!=mid or rec.get('post_meeting_anchor')!=anchor_stamp:return rec
        planned=[]
        cursor=settle_end
        for row in rows[:5]:
            if not isinstance(row,dict):continue
            end_str=str(row.get('end') or '')
            if not re.fullmatch(r'\d{2}:\d{2}',end_str):continue
            end=min(1439,hhmm_to_min(end_str))
            if end<=cursor:continue
            if incompatible_character_slot(c,row):continue
            planned.append({
                'id':'slot_replanned_'+mid+'_'+str(cursor),'start':min_to_hhmm(cursor),
                'end':min_to_hhmm(end),'location':str(row.get('location') or place)[:28],
                'status':str(row.get('status') or '调整后行程')[:14],
                'activity':str(row.get('activity') or '重新安排日程')[:85],
                'scene':str(row.get('scene') or '根据实际见面调整余下时间。')[:140],
                'source':'meeting_shift','meeting_id':mid
            })
            cursor=end
            if cursor>=1439:break
        if planned:
            planned[-1]['end']='23:59'
            settle={'id':'slot_post_on_site_'+mid+'_'+str(minute),
                    'start':min_to_hhmm(minute),'end':plan_from,'location':place,
                    'status':'见面后整理','activity':'仍在最后确认的见面地点',
                    'scene':c['name']+'仍在「'+place+'」处理现场事务，后续行程尚未开始。',
                    'source':'meeting_shift','meeting_id':mid}
            rec['slots']=overlay_actual_slots(rec['slots'],[settle]+planned)
            rec['engine']='live'
            rec['updated_at']=utc()
    except Exception:
        # Keep the safe stationary fallback, never reinstate an obsolete route.
        pass
    return rec

def active_slot_index(slots,minute):
    return next((i for i in range(len(slots)-1,-1,-1) if hhmm_to_min(slots[i]['start'])<=minute<=hhmm_to_min(slots[i]['end'])),-1)

def overlay_actual_slots(base,actual):
    result=list(base)
    for observed in actual:
        start,end=hhmm_to_min(observed['start']),hhmm_to_min(observed['end'])
        if end<start:continue
        nxt=[]
        for slot in result:
            a,b=hhmm_to_min(slot['start']),hhmm_to_min(slot['end'])
            if b<=start or a>=end:nxt.append(slot);continue
            if a<start:nxt.append(dict(slot,end=observed['start']))
            if b>end:nxt.append(dict(slot,start=observed['end']))
        nxt.append(observed)
        result=sorted(nxt,key=lambda s:hhmm_to_min(s['start']))
    return result

def is_sleeping_slot(slot):
    if not slot or slot.get('source') in ('meeting','chat_update'):return False
    status=str(slot.get('status') or '');activity=str(slot.get('activity') or '');scene=str(slot.get('scene') or '')
    actual=r'(?:熟睡|深眠|浅眠|睡眠|沉睡|已入睡|正在睡|睡着|已睡|安睡|\basleep\b|\bsleeping\b|\bdeep sleep\b|\bslumber\b)'
    preparing=r'(?:准备(?:入睡|睡觉)|睡前|即将入睡|打算睡|\bprepar(?:e|ing) (?:to sleep|for bed)\b|\bgetting ready for bed\b)'
    if re.search(actual,status,re.I):return True
    if re.search(preparing,status,re.I) or re.search(preparing,activity,re.I):return False
    return bool(re.search(actual,activity,re.I) or re.search(actual,scene,re.I))

def wake_slot_from_message(slots,hhmm,character_name):
    minute=hhmm_to_min(hhmm);idx=active_slot_index(slots,minute)
    if idx<0 or not is_sleeping_slot(slots[idx]):return False
    old=slots[idx]
    observed=dict(old,start=hhmm,status='已醒来发消息',activity='已醒来查看并发送手机消息，尚未确认再次入睡',scene=character_name+'已经发出手机消息，原先的睡眠安排被打断。',source='chat_update')
    if hhmm_to_min(old['start'])<minute:slots[idx:idx+1]=[dict(old,end=hhmm),observed]
    else:slots[idx]=observed
    return True

def reconcile_phone_activity(db,pid,cid,at=0):
    c=BY_ID.get(cid)
    if not c:return
    rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(pid,cid)).fetchone()
    if rel and rel['mode']=='meeting':return
    p=profile_get(db,pid)
    date=datetime.fromtimestamp(at/1000).astimezone().strftime('%Y-%m-%d') if at else local_date_str()
    rec=get_or_init_surveillance(db,p,c,date)
    if wake_slot_from_message(rec['slots'],fmt_hhmm(at or None),c['name']):rec['updated_at']=utc()

def chat_clock_label(ts):
    try:
        d=datetime.fromisoformat(str(ts).replace('Z','+00:00')).astimezone()
        return d.strftime('%Y-%m-%d %H:%M')
    except (TypeError,ValueError,OverflowError):return '时间未知'

def chat_temporal_topic_hint(history,now=None):
    """Distinguish talking about bedtime from actually reaching bedtime."""
    d=(now or datetime.now().astimezone()).astimezone()
    hour=d.hour
    if hour<5 or hour>=18:return ''
    recent=' '.join(str(m.get('text') or '') for m in (history or [])[-12:] if m.get('engine')!='recalled' and not m.get('recalled'))
    if not re.search(r'今晚|今夜|晚上|夜里|晚安|梦里|做梦|梦见|梦到|睡觉|洗漱|钻被窝|上床|休息',recent):return ''
    last_users=' '.join(str(m.get('text') or '') for m in (history or [])[-5:] if m.get('sender')=='user' and m.get('engine')!='recalled')
    resting_now=bool(re.search(r'(?:我现在|现在就|这会儿|我先|我要|我准备|马上|立刻|刚好).{0,10}(?:睡觉|睡了|睡一觉|午睡|睡午觉|睡午觉了|睡午觉啦|休息|眯一会)|(?:我去睡了|我去睡觉|困得不行|要睡了)',last_users))
    suffix=('对方最近可能明确提到当前要休息；可以尊重并自然回应，但不要把下午误写成夜晚。' if resting_now else
            '对方没有明确表示此刻要睡：不要把话题当作睡前告别，不要直接催其现在洗漱、钻被窝或以“晚安”结束当前聊天。可以自然说“今晚再说”“晚上做个好梦”，但必须保持时间指向正确。')
    return '\n【白天讨论夜晚·情境校准】最近的短信涉及晚上、梦境或睡眠话题，但现在仍是'+('上午' if hour<12 else '下午')+'。这些是谈论中的时间，不表示对方已经准备立刻睡觉或当前已经入夜。'+suffix

def chat_clock_context(history,now=None):
    d=(now or datetime.now().astimezone()).astimezone()
    raw=d.strftime('%z');zone='UTC'+raw[:3]+':'+raw[3:]
    h=d.hour;period='凌晨' if h<5 else '上午' if h<12 else '下午' if h<18 else '晚上'
    previous=''
    for m in reversed(history):
        if m.get('sender')!='user':continue
        try:
            t=datetime.fromisoformat(str(m.get('created_at')).replace('Z','+00:00')).astimezone()
            minutes=max(0,int((d-t).total_seconds()//60))
            previous=f"最近一条用户消息实际发送于 {t.strftime('%Y-%m-%d %H:%M')}，距现在约 {minutes} 分钟。"
            break
        except (TypeError,ValueError,OverflowError):continue
    return (f"\n【本次手机回复的当前时间 · 事实优先级最高】{d.strftime('%Y-%m-%d %H:%M')}（{period}，{zone}，应用本地时钟）。{previous}"
            "现实时钟与用户最新的明确行动决定当前状态；历史聊天中的“今晚、晚安、睡觉、做梦”仅表示说话时的内容，不是现在已经入夜或正在睡觉的证据。"
            "绝不因为当前话题在谈将来的晚上，就把现在改写成夜晚、催对方立即入睡或提前结束对话。"
            "只有对方当前明确表示现在要睡/休息、或角色明说是提前祝福时，才在白天自然使用睡前告别。"
            "发送前默默检查时间指向：讨论未来的夜晚与此刻的白天必须区分；不要机械报时，不要输出时间元数据，也不要把现实日期改变为原作年份。"
            +chat_temporal_topic_hint(history,d))

def sync_surveillance_from_chat(db,p,c,ai_text='',at=0):
    txt=str(ai_text or '').strip()
    rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
    if not txt or (rel and rel['mode']=='meeting'):return
    locations=[location_from_report(part) for part in re.split(r'\s+/\s+|\|\|\||\n',txt)]
    new_loc=next((x for x in reversed(locations) if x),'')
    if not new_loc or incompatible_character_slot(c,{'location':new_loc}):return
    date=datetime.fromtimestamp(at/1000).astimezone().strftime('%Y-%m-%d') if at else local_date_str()
    rec=get_or_init_surveillance(db,p,c,date)
    now_hhmm=fmt_hhmm(at or None)
    now_m=hhmm_to_min(now_hhmm)
    slots=rec.get('slots') or []
    idx=active_slot_index(slots,now_m)
    if idx<0:return
    slot=slots[idx]
    if slot.get('location')==new_loc and slot.get('source')=='chat_update':return
    observed=dict(slot,start=now_hhmm,location=new_loc,status='聊天动态同步',activity=f"在「{new_loc}」活动（角色亲自提及）",scene=f"{c['name']}在消息里提到此刻身处「{new_loc}」。",source='chat_update')
    if hhmm_to_min(slot['start'])<now_m:slots[idx:idx+1]=[dict(slot,end=now_hhmm),observed]
    else:slots[idx]=observed
    rec['updated_at']=utc()

def appointment_planning_evidence(db,p,c,date_str):
    """Candidate SMS evidence only. The planner must confirm both parties agreed."""
    rows=db.execute("SELECT sender,text,created_at,engine FROM messages WHERE profile_id=? AND character_id=? AND mode='chat' ORDER BY julianday(created_at),rowid",(p['id'],c['id'])).fetchall()
    relevant=re.compile(r'约|见面|见你|碰面|接你|接我|见面|咖啡|电影|吃饭|晚饭|午饭|烧烤|火锅|约会|见(?:一面|一见)|meet|date|dinner|lunch|movie|coffee|tomorrow|明天|后天|周末|星期|下周',re.I)
    dated=re.compile(r'点半?|[0-2]?\d:\d\d|明天|后天|今天|今晚|周末|星期|下周|月\d{1,2}日|\d{1,2}号|约好|定好|确定|不见不散|meet|tomorrow',re.I)
    dates=[]
    for i,row in enumerate(rows):
        if row['engine']=='recalled':continue
        try:
            dt=datetime.fromisoformat(str(row['created_at']).replace('Z','+00:00')).astimezone().date()
            if not (datetime.strptime(date_str,'%Y-%m-%d').date()-timedelta(days=30)<=dt<=datetime.strptime(date_str,'%Y-%m-%d').date()):continue
        except (TypeError,ValueError):continue
        if relevant.search(row['text']) and dated.search(row['text']):dates.append(i)
    selected=set()
    for i in dates[-12:]:
        for j in range(max(0,i-2),min(len(rows),i+4)):
            if rows[j]['engine']!='recalled':selected.add(j)
    lines=[]
    for i in sorted(selected)[-28:]:
        x=rows[i]
        lines.append(f"[{chat_clock_label(x['created_at'])}] {p['name'] if x['sender']=='user' else c['name']}：{str(x['text'])[:130]}")
    return '\n'.join(lines)[-3500:]


def ensure_live_surveillance(db,p,c,force=False,target_date=''):
    today=local_date_str()
    d_str=target_date if (target_date and re.match(r'^\d{4}-\d{2}-\d{2}$',str(target_date))) else today
    rec=get_or_init_surveillance(db,p,c,d_str)
    if public_connection()['mode']!='live':return rec
    rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
    if d_str==today and rel and rel['mode']=='meeting':return rec
    if d_str==today and rec.get('post_meeting_anchor') and rec.get('post_meeting_id'):
        if force:
            mid=rec['post_meeting_id']
            meeting=db.execute('SELECT * FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],c['id'])).fetchone()
            if meeting:return replan_remaining_day_after_meeting(db,p,c,dict(meeting),datetime.now().astimezone())
        # The day's remaining timeline was rebased at a confirmed meeting ending.
        # Never replace it with a fresh speculative full-day itinerary.
        return rec
    if rec.get('engine')=='live' and not force:return rec
    try:
        appointment_evidence=appointment_planning_evidence(db,p,c,d_str)
        recent_rows=db.execute('SELECT sender,text,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 6',(p['id'],c['id'])).fetchall()
        recent_chat='\n'.join(f"[{'我方' if x['sender']=='user' else c['name']}] {str(x['text'] or '')[:70]}" for x in reversed(recent_rows))
        meet_rows=db.execute('SELECT location,time,summary FROM meetings WHERE profile_id=? AND character_id=? ORDER BY started_at DESC LIMIT 2',(p['id'],c['id'])).fetchall()
        recent_meet='；'.join(f"{m['time']}在{m['location']}：{str(m['summary'] or '')[:50]}" for m in meet_rows)
        sys_prompt=f"你是 {c['name']}（来自《{c['source']}》· {c['version']}，背景：{c['canon']}）。请生成你在 {d_str} 从 00:00 到 23:59 的 7 个连续时间段作息与行踪表（用于角色专属空间的实时生活监控）。现实日历日期仅用于应用调度与记录；原作时期、人物年龄、历史事件与技术水平保持对应版本，不因现实年份改变。必须严格贴合你的原作身份、独立职业习惯以及与 {p['name']} 的近期互动（近期聊天：{recent_chat or '刚建立匹配'}；近期见面：{recent_meet or '暂无'}）。禁止使用任何 emoji 表情符号。只输出 JSON 对象，格式为：{{\"slots\":[{{\"start\":\"00:00\",\"end\":\"06:30\",\"location\":\"具体地点（15字内）\",\"status\":\"四字状态\",\"activity\":\"正在做的事（38字内）\",\"scene\":\"监控镜头下的细腻画面感描写（55字内）\"}}]}}，7个时间段首尾相连覆盖全天。"
        sys_prompt+='\n已确认的约会优先于普通日程；根据带时间戳的手机往来判断双方是否真的达成约定。只有明确互相同意且安排属于目标日期时才预留时间（含合理出发交通），尚未落实的提议不是约定。时间未定时留出弹性，不得自行编造具体时刻。约定不等于已发生，后续可以取消或变更。'
        out=completion([{'role':'system','content':sys_prompt},{'role':'user','content':f'目标日期：{d_str}。下列仅是可能涉及约定的聊天证据（带发送日期，注意“明天”的相对时间；如双方未确定则忽略）：\n{appointment_evidence or "无已知约定证据"}\n请生成全天 7 个时段的作息与实时监控画面 JSON。'}],json_mode=True,log_meta={'mode':'surveillance','entryPoint':'surveillance','profile':p,'character':c})
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
                preserved=[s for s in rec.get('slots',[]) if s.get('source') in ('meeting','chat_update','meeting_shift')]
                rec['slots']=overlay_actual_slots([verified_surveillance_slot(c,slot) for slot in cleaned],preserved)
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
    # Once live, preserve every witnessed location transition as a separate
    # time-scoped monitor entry, while hiding the abandoned daily itinerary.
    if is_today and current and current.get('source')=='meeting':
        m_state=MEETING_STATE.get((p['id'],c['id']),{})
        history=refresh_meeting_scene_history(db,p,c)
        mid=m_state.get('active_meeting_id','')
        observed=observed_meeting_segments(p,c,{
            'id':mid,'started_at':m_state.get('meeting_started_at') or utc(),
            'ended_at':utc(),'location':current['location'],
            'location_history':history
        },sel_date,live=True)
        if not observed:observed=[dict(current,id='live_meeting_'+str(mid),meeting_id=mid)]
        cut=hhmm_to_min(observed[0]['start'])
        prev=[]
        for s in slots:
            if s.get('meeting_id')==mid or hhmm_to_min(s['start'])>=cut:continue
            prev.append(dict(s,end=observed[0]['start']) if hhmm_to_min(s['end'])>cut else s)
        slots=prev+observed
    for stored_slot in slots:
        s=verified_surveillance_slot(c,stored_slot)
        start_m=hhmm_to_min(s['start'])
        end_m=hhmm_to_min(s['end'])
        if (not is_today) or start_m<=now_m:
            is_cur=bool(is_today and (s.get('source')=='meeting' and s.get('id','').startswith('live_meeting_') if current and current.get('source')=='meeting' else start_m<=now_m<=end_m))
            unlocked.append(dict(s,
                isCurrent=is_cur,
                state='current' if is_cur else 'past'
            ))
    if is_today and not unlocked and slots:
        unlocked.append(dict(verified_surveillance_slot(c,slots[0]),isCurrent=True,state='current'))
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
    day_msgs=db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND date(created_at,'localtime')=? AND engine!='recalled'",(p['id'],c['id'],date_str)).fetchall()
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
    if entry.get('stale_after_recovery') and not force:return entry
    if entry.get('engine')=='live' and not force:return entry
    try:
        intimacy=compute_intimacy_info(db,p,c)
        slots_txt='\n'.join(f"{s['start']}-{s['end']} 在【{s['location']}】{s['activity']}（{s['scene']}）" for s in (surv_rec.get('slots') or []))
        sys_p=f"你是 {c['name']}（来自《{c['source']}》· {c['version']}，设定：{c['canon']}）。请根据你 {d_str} 全天的监控行踪写一篇第一人称私密日记。现实日历日期仅用于应用调度与记录；原作时期、人物年龄、历史事件与技术水平保持对应版本，不因现实年份改变。记住：角色有自己独立的生活，并不是以用户（{p['name']}）为生活核心（除非当前感情阶段为 deep_love，当前阶段：{intimacy['stage']} · {intimacy['label']}）。严禁使用任何 emoji。只输出 JSON：{{\"title\":\"《...》\",\"weather\":\"纯文字天气\",\"mood\":\"纯文字心情\",\"content\":\"第一人称日记正文（3段，用\\\\n\\\\n分隔）\"}}"
        out=completion([{'role':'system','content':sys_p},{'role':'user','content':slots_txt}],json_mode=True,log_meta={'mode':'diary','entryPoint':'diary','profile':p,'character':c})
        parsed=parse_json(out,{})
        if parsed.get('content'):
            entry['title']=str(parsed.get('title') or entry['title']).strip()[:40]
            entry['weather']=str(parsed.get('weather') or entry['weather']).strip()[:16]
            entry['mood']=str(parsed.get('mood') or entry['mood']).strip()[:16]
            entry['content']=str(parsed.get('content')).strip()[:2400]
            entry['engine']='live'
            entry.pop('stale_after_recovery',None)
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

# Same local, conservative scene rules as the browser version.
SCENE_RULES={
    'cancel':re.compile("^(?:不去了|取消(?:见面|约会|计划)?|改天(?:吧|再见)?|算了(?:吧)?|我(?:不能|没法|不想)去|(?:let['’]s )?cancel|not coming|can['’]t make it|rain check|another day)",re.I),
    'proposalZh':re.compile("(?:在|去|到|约在)\\s*[「『“\"]?([^，。！？；、\\n「」『』“”\"]{1,40}?)[」』”\"]?\\s*(?:见面|碰面|见吧|见你|等你|汇合)",re.I),
    'proposalEn':re.compile("\\b(?:let['’]s meet|meet me|we (?:can|could|should) meet|shall we meet|how about meeting)\\s+(?:at|in|on|by|outside|inside)\\s+([^.!?;,\\n]{1,100})",re.I),
    'stateZh':re.compile("^(?:我(?:现在|此刻|目前)?(?:正)?在|我(?:刚刚?|已经)?(?:抵达|到了|到达|回到|登上|来到)|(?:刚刚?|已经)(?:到了|抵达|回到|登上|来到)|(?:我)?正(?:坐|站|躺)在)\\s*[「『“\"]?([^，。！？；、\\n「」『』“”\"]{1,48})",re.I),
    'stateEn':re.compile("^(?:i(?:['’]m| am)\\s+(?:(?:currently|right now|already)\\s+)?(?:at|in|on|inside|outside|by)|i\\s+(?:(?:just|already)\\s+)?(?:arrived at|got to|reached|returned to))\\s+([^.!?;,\\n]{1,100})",re.I),
    'reject':re.compile("^(?:想|考虑|思考|打算|准备|计划|担心|等你|等着|忙|工作|吃|喝|睡|看|说|做|跟|和你|给|想象|这里|那里|这儿|那儿|路上|发消息|开玩笑|生气|等一下|trouble\\b|love\\b|a loss\\b|a hurry\\b|the mood\\b|it\\b|my way\\b|your side\\b|the middle of\\b|pain\\b|shock\\b|a good mood\\b|a bad mood\\b|need\\b|doubt\\b|denial\\b|tears\\b|danger\\b|the phone\\b|a call\\b|touch\\b|charge\\b|a position\\b)",re.I),
    'uncertain':re.compile("(?:如果|假如|可能|也许|假设|还没|没有到|没到|不是|不在|打算|准备去|等会儿|待会|(?:\\bif\\b|\\bmaybe\\b|\\bprobably\\b|\\bnot yet\\b|\\bwould\\b|\\bwill be\\b|\\bgoing to\\b))",re.I),
}

def normalize_scene_text(t):
    return str(t or '').strip().replace('’',"'")

def clean_scene_place(raw,is_english=False):
    value=re.sub(r'''^[「『“"'（(]+|[」』”"')）.!。！?？]+$''','',normalize_scene_text(raw)).strip()
    if is_english:value=re.sub(r'\s+(?:at\s+\d|tomorrow\b|tonight\b|today\b|this (?:evening|afternoon|morning)\b|right now\b|now\b|waiting for\b|waiting\b|having\b|with\b).*$','',value,flags=re.I).strip()
    else:value=re.sub(r'(?:等你|等着你|等着|等人|看风景|吹风|喝咖啡|休息|坐着|站着|给你发消息|呢|这里|这儿).*$','',value).strip()
    if not value or len(value)>40 or SCENE_RULES['reject'].search(value) or re.search(r'[\n\r:：?？<>]',value) or SCENE_RULES['uncertain'].search(value):return ''
    if is_english and re.fullmatch(r'here|there|somewhere|anywhere|nowhere',value,re.I):return ''
    return value

def location_from_report(raw):
    text=normalize_scene_text(raw)
    if not text or re.match(r'^[「『“"*>]',text) or re.search(r'[?？]$',text) or SCENE_RULES['uncertain'].search(text):return ''
    en=SCENE_RULES['stateEn'].search(text)
    if en:return clean_scene_place(en.group(1),True)
    zh=SCENE_RULES['stateZh'].search(text)
    return clean_scene_place(zh.group(1)) if zh else ''

def explicit_arrival_place(raw):
    text=normalize_scene_text(raw)
    if not text or re.match(r'^[「『“"*>]',text) or SCENE_RULES['uncertain'].search(text):return ''
    zh=re.match(r'^(?:(?:我)?(?:已经|刚刚?|已)?(?:到了?|抵达(?:了)?|到达(?:了)?))[，,。 ]*(?:在)?[「『“"]?([^，。！？；、\n「」『』“”"]{1,40})',text)
    if zh:
        loc=clean_scene_place(re.sub(r'^了|了$','',zh.group(1)))
        if loc and not re.fullmatch(r'啦|吗|吧|呀|哟|喽|哦',loc):return loc
    en=re.match(r"^(?:i(?:['’]ve| have| just)? arrived(?: at| in)?|i (?:just )?got to|i made it to)\s+([^.!?;,\n]{1,100})",text,re.I)
    return clean_scene_place(en.group(1),True) if en else ''

def proposal_location(raw):
    text=normalize_scene_text(raw)
    if not text or re.match(r'^[「『“"*>]',text) or SCENE_RULES['uncertain'].search(text) or SCENE_RULES['cancel'].search(text):return ''
    en=SCENE_RULES['proposalEn'].search(text)
    if en:return clean_scene_place(en.group(1),True)
    zh=SCENE_RULES['proposalZh'].search(text)
    if zh:return clean_scene_place(zh.group(1))
    pickup=re.search(r'(?:来|到|去|在)\s*([^，。！？；、\n「」『』“”"]{2,30}?)\s*接(?:上)?(?:我|你)',text)
    return clean_scene_place(pickup.group(1)) if pickup else ''

def current_plan_rows(db,pid,cid):
    cutoff=db.execute("SELECT MAX(created_at) FROM events WHERE profile_id=? AND character_id=? AND type IN ('matched','unmatched','return','meeting')",(pid,cid)).fetchone()[0] or ''
    rows=db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND mode='chat' AND created_at>=? ORDER BY rowid DESC LIMIT 41",(pid,cid,cutoff)).fetchall()
    return [m for m in reversed([dict(r) for r in rows]) if m['engine']!='recalled' and not _is_chat_artifact(m) and not is_legacy_error_artifact(m)]

def meeting_place_in_player_turn(raw,profile_name):
    """Only the player's affirmative on-site narrative can override a proposed venue."""
    text=str(raw or '').strip()
    if not text or re.match(r'^(?:假如|如果|要是|万一|明天|下次|以后)',text):return ''
    if re.search(r'(?:赖|躺|睡|窝|待|坐|留|趴|靠|滚|倒).{0,16}我(?:家)?(?:的)?床(?:上|边)?|(?:在|回到|走进|进入)我(?:家)?(?:的)?(?:卧室|房间)',text):
        return profile_name+' 的卧室'
    if re.search(r'(?:正在|现在|已经|此刻|就|还|仍).{0,20}(?:在|到了|回到|走进|进入|来到)我(?:的)?家(?:里)?|(?:带|领|接|跟|陪).{0,20}(?:回|到)(?:了)?我(?:的)?家|(?:带|领|接|跟|陪).{0,20}回家了?',text):
        return profile_name+' 的家'
    if re.search(r'\b(?:on my bed|in my bedroom)\b',text,re.I):return profile_name+' 的卧室'
    if re.search(r'\b(?:at my place|in my home)\b',text,re.I):return profile_name+' 的家'
    # Explicit player-witnessed drop-off, not the earlier plan to travel there.
    if re.search(r'下车|下了车|停车|停下了车|送到了|已经到达|已经抵达',text) and not re.search(r'如果|假如|打算|准备|将要|计划|还没|没有|尚未|梦见|想象',text):
        movement=re.search(r'(?:在|到了?|到达|抵达(?:了)?|送(?:我|你)?到(?:了)?|送到(?:了)?|停车在)\s*([^，。！？；、\n]{2,32}?)(?:下(?:了)?车|停(?:了)?车|，|。|！|$)',text)
        if movement:
            place=clean_scene_place(movement.group(1))
            if place and not re.fullmatch(r'我|你|他|她|这里|那里|这儿|那儿|家|路边|车里',place) and not re.search(r'[我你他她]',place):return place
    return ''


SCENE_INTERIOR_RE=re.compile(r'卧室|房间|屋内|室内|寝室|宿舍|客厅|厨房|浴室|卫生间|洗手间|走廊|门厅|露台|阳台|庭院|花园|楼下|楼上|咖啡馆|咖啡店|餐厅|街道|车里|车内|车上|车厢|停车场|床沿|床边|床上')
SCENE_MOVE_RE=re.compile(r'走进|走入|进入|步入|迈入|踏进|回到|来到|抵达|到达|到了|进了|出了|走出|带进|抱进|抱回|推门进入|推开.{0,36}门.{0,30}(?:走进|进入|走入|床沿|床边|床上)|穿过.{0,35}(?:门|走廊)|在.{0,18}(?:床沿|床边|床上)(?:坐下|坐|躺下|停住|落下)|(?:坐|躺|落|放|陷|坐定|停住).{0,18}(?:床沿|床边|床上)|下了车|下车|停好车|到了家')
SCENE_NOT_ARRIVED_RE=re.compile(r'打算|准备|计划|想要|想去|还没|尚未|没有|如果|假如|也许|或许|可能|梦见|想象|本来要|即将|正要|试图|差点|朝.{0,14}走去|向.{0,14}走去|走向.{0,14}|通往.{0,16}(?:门|房|室|厅)')
SCENE_DESTINATION_RE=re.compile(r'(?:走进|走入|进入|步入|迈入|踏进|回到|来到|抵达|到达|到了|进了|出了|走出|带进|抱进|抱回|推门进入)\s*[了的进到入过]?[\s「『“"]*(?:(?:这间|那间|自己|他们|她|他|我们|我|你|Lin|Carlos)\s*的?)?[\s「『“"]*((?:[\u4e00-\u9fff]{1,12}的)?(?:卧室|寝室|房间|客厅|厨房|浴室|卫生间|洗手间|室内|屋内|露台|阳台|庭院|花园|走廊|楼下|楼上|咖啡馆|咖啡店|餐厅|车里|车内|车上|停车场|街道))')
SCENE_BED_RE=re.compile(r'床沿|床边|床上|床铺|床垫|被褥')

def meeting_room_name(current,room,p_name):
    where=str(current or '').strip()
    base=re.sub(r'(?:外廊露台|屋顶露台|露台|阳台|外廊|走廊|卧室|寝室|房间|客厅|厨房|浴室|卫生间|洗手间|门厅|庭院|花园|楼下|楼上)$','',where).strip()
    kind='卧室' if room in ('床沿','床边','床上','卧室','寝室') else ('室内' if room in ('室内','屋内','房间') else room)
    if '卧室' in where and kind=='卧室':return where
    if where in (p_name+' 的家',p_name+' 的卧室') or where.startswith(p_name+' 的'):return p_name+' 的'+kind
    if base and base!=where and len(base)<=24:return base+kind
    return kind

def scene_location_from_character(text,current,p_name,c_name=''):
    text=str(text or '')
    if not text or not SCENE_INTERIOR_RE.search(text) or not SCENE_MOVE_RE.search(text):return None
    candidates=[]
    for m in SCENE_DESTINATION_RE.finditer(text):
        before=text[:m.start()]
        prev=before[-22:]
        following=text[m.start():m.end()+8]
        quoted=(before.rfind('“')>before.rfind('”') or
                before.rfind('「')>before.rfind('」') or
                before.rfind('『')>before.rfind('』'))
        boundary=max(before.rfind(x) for x in ('。','！','？','；','，'))
        clause=before[boundary+1:]
        character_subject=bool(c_name and c_name in clause) or bool(re.search(r'(?:他|她)[^，。！？]{0,12}(?:抱着|扶着|带着|牵着|领着|背着)',clause))
        other_actor=bool(re.search(r'(?:护士|保安|店员|路人|警卫|朋友|陌生人|门卫)[^，。！？]{0,6}$',clause)) or bool(p_name and p_name in clause[-12:])
        if quoted or (other_actor and not character_subject) or SCENE_NOT_ARRIVED_RE.search(prev) or re.search(r'准备|打算|想要|试图|正要|还没|没有|尚未|不要|别|禁止',prev) or re.search(r'[？?]',following):continue
        candidates.append((m.start(),m.group(1),m.group(0)))
    # Reaching the bed after crossing from the patio is a completed location
    # change, even if no exact name for the interior was said.
    if re.search(r'露台|阳台|屋外|室外|走廊|门外',str(current or '')) and re.search(r'推开|走进|迈进|穿过|关上|抱回|进入|回到|通往室内',text):
        for match in SCENE_BED_RE.finditer(text):
            around=text[max(0,match.start()-85):min(len(text),match.end()+60)]
            if re.search(r'推开|踹开|关上|走进|迈进|穿过|抱着|托抱|抱回|进入|到了|倒在|坐在|停住|陷进|落在|躺到|躺在',around) and not re.search(r'如果|假如|打算|准备|计划|想象|梦里|还没|尚未',around):
                candidates.append((match.start(),'卧室',around))
    if not candidates:return None
    _,room,evidence=max(candidates,key=lambda x:x[0])
    location=room if room.startswith(p_name+' 的') else meeting_room_name(current,room,p_name)
    if not location or len(location)>40 or location==current or SCENE_RULES['uncertain'].search(location):return None
    return dict(location=location,evidence=evidence,kind='scene')

def meeting_scene_signature(text):
    return hashlib.sha256(str(text or '').encode('utf8')).hexdigest()

def classify_meeting_scene_location(p,c,text,current):
    deterministic=scene_location_from_character(text,current,p['name'],c['name'])
    if deterministic:return deterministic
    if not SCENE_INTERIOR_RE.search(str(text or '')) or not SCENE_MOVE_RE.search(str(text or '')):return None
    conn=load_connection()
    if not all(conn.get(k) for k in ('base_url','api_key','model')):return None
    try:
        raw=completion([
            {'role':'system','content':'你是线下小说现场的地点事实核对员，绝不续写故事。只追踪角色本人已经到达的实际位置：提议、计划、假设、回忆、旁人位置、打算或朝某处走去（尚未到达）一律 changed:false。地点必须以正文中的确凿行动为依据，不能补写。若从宿舍露台进入室内床边，可用宿舍卧室。只输出 JSON {"changed":false,"location":"","evidence":"","actor":"none"} 或 {"changed":true,"location":"新地点","evidence":"正文中逐字连续的短句","actor":"character"}。'},
            {'role':'user','content':'原先角色所在地点：'+str(current)+'\n角色：'+c['name']+'\n最新现场正文：\n'+str(text)[-8500:]}
        ],json_mode=True,max_tokens=384,temperature=0.1,
          log_meta={'mode':'surveillance','entryPoint':'meeting_scene_location','profile':p,'character':c})
        parsed=parse_json(raw,{})
        location=clean_scene_place(parsed.get('location') or '')
        evidence=str(parsed.get('evidence') or '').strip()
        if parsed.get('changed') is not True or parsed.get('actor')!='character' or not location or location==current or len(evidence)<5 or evidence not in text or SCENE_NOT_ARRIVED_RE.search(evidence):return None
        return dict(location=location,evidence=evidence,kind='model')
    except Exception:return None

def refresh_meeting_scene_history(db,p,c,exclude_message_id=''):
    state=MEETING_STATE.get((p['id'],c['id']),{})
    mid=state.get('active_meeting_id') or ''
    if not mid:return []
    initial_ts=str(state.get('meeting_started_at') or utc())
    try:
        began=datetime.fromisoformat(initial_ts.replace('Z','+00:00')).timestamp()
    except (ValueError,TypeError):
        began=time.time()
    prior=state.get('meeting_location_history') or []
    first=next((x for x in prior if x.get('source')=='start' and x.get('location')),None)
    original=first.get('location') if first else (state.get('meeting_location') or '约定的见面地点')
    events=[dict(at=initial_ts,location=original,source='start')]
    events.extend(dict(x) for x in prior if x.get('source') in ('manual','resume') and x.get('location'))
    rows=db.execute("SELECT id,sender,text,engine,created_at,scene_location,scene_location_signature FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting' AND meeting_id=? ORDER BY julianday(created_at),rowid",
        (p['id'],c['id'],mid)).fetchall()
    for row in rows:
        m=dict(row)
        if m['engine']=='recalled' or m['id']==exclude_message_id:continue
        try:
            moment=datetime.fromisoformat(m['created_at'].replace('Z','+00:00')).timestamp()
        except (ValueError,TypeError):continue
        if moment<began:continue
        preceding=sorted((x for x in events if datetime.fromisoformat(x['at'].replace('Z','+00:00')).timestamp()<=moment),key=lambda x:x['at'])
        location_before=preceding[-1]['location'] if preceding else original
        if m['sender']=='user':
            location=meeting_place_in_player_turn(m['text'],p['name'])
        else:
            recognized=(dict(location=m['scene_location']) if m['scene_location'] and m['scene_location_signature']==meeting_scene_signature(m['text'])
                else scene_location_from_character(m['text'],location_before,p['name'],c['name']))
            location=recognized['location'] if recognized else ''
        if location and location!=location_before:
            events.append(dict(at=m['created_at'],location=location,source='scene' if m['sender']=='user' else 'ai_scene',message_id=m['id']))
    priority={'start':0,'scene':1,'ai_scene':2,'resume':3,'manual':4}
    events.sort(key=lambda x:(x['at'],priority.get(x.get('source'),2)))
    compact=[]
    for e in events:
        if compact and compact[-1]['location']==e['location']:
            if e.get('source')=='manual':compact[-1]['source']='manual'
        else:compact.append(e)
    state['meeting_location_history']=compact
    state['meeting_location']=compact[-1]['location'] if compact else original
    return compact

def sync_live_meeting_scene_location(db,p,c):
    state=MEETING_STATE.get((p['id'],c['id']),{})
    history=refresh_meeting_scene_history(db,p,c)
    if not history:return
    rec=get_or_init_surveillance(db,p,c)
    old=rec.get('live_override')
    if old and old.get('meeting_id')==state.get('active_meeting_id'):
        old['location']=history[-1]['location']
        rec['updated_at']=utc()


def infer_meeting_location(db,pid,cid,custom_loc=''):
    clean_custom=str(custom_loc or '').strip()
    if clean_custom:return clean_custom[:40]
    for m in reversed(current_plan_rows(db,pid,cid)[-16:]):
        loc=proposal_location(m['text']) or (explicit_arrival_place(m['text']) if m['sender']=='user' else location_from_report(m['text']))
        if loc:return loc
        if SCENE_RULES['cancel'].search(normalize_scene_text(m['text'])):break
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

def meeting_summary_chunks(m_msgs,p,c):
    """Every turn contributes a short chronological excerpt, instead of only the final ten."""
    chunks=[]
    chunk=''
    for m in m_msgs:
        original=re.sub(r'\s+',' ',str(m.get('text') or '')).strip()
        maximum=220 if m.get('sender')=='user' else 200
        if len(original)>maximum:
            left=int(maximum*.55)
            right=int(maximum*.45)
            excerpt=original[:left]+' … '+original[-right:]
        else:
            excerpt=original
        timestamp=str(m.get('created_at') or '')[:19].replace('T',' ')
        name=p['name'] if m.get('sender')=='user' else c['name']
        line=f'[{timestamp}] {name}：{excerpt}\n'
        if chunk and len(chunk)+len(line)>9000:
            chunks.append(chunk)
            chunk=''
        chunk+=line
    if chunk:chunks.append(chunk)
    return chunks

def summarize_complete_meeting(p,c,m_msgs,location,db=None):
    if not m_msgs:return None
    mid=m_msgs[0].get('meeting_id') or ''
    groups=completed_meeting_groups(db,p['id'],c['id'],mid) if db is not None and mid else []
    expected=len(groups)//MEETING_CHECKPOINT_INTERVAL
    checkpoints=valid_meeting_checkpoints(db,p['id'],c['id'],mid,groups) if expected else []
    reuse=bool(expected and len(checkpoints)==expected)
    trailing=[m for g in groups[expected*MEETING_CHECKPOINT_INTERVAL:] for m in g] if reuse else m_msgs
    chunks=meeting_summary_chunks(trailing,p,c)
    instruction=(
        '你是见面记录的事实归档员。只能总结提供的实际对话，不得补写未出现的事件、亲吻、去过的地点、'
        '感情承诺或人物心理。严格按时间顺序，保留开场、中段、结尾的关键事件；优先记录已发生的行动与对话，'
        '忽略描写性赘述。若记录跨越午夜，必须体现前一晚和第二天。'
        '只输出 JSON 对象：{"summary":"120至240字的中文纪实梗概"}。'
    )
    notes=([f"第{(cp['block_index']-1)*50+1}–{cp['block_index']*50}组（{cp['started_at']}至{cp['ended_at']}）：{cp['summary']}；具体事件：{'；'.join(cp['details'])}；关键对话：{'；'.join(q['speaker']+'「'+q['quote']+'」' for q in cp['key_dialogues'])}" for cp in checkpoints] if reuse else [])
    for idx,chunk in enumerate(chunks):
        msg=completion([
            {'role':'system','content':instruction+f'这是第 {idx+1}/{len(chunks)} 段连续记录，仅总结本段确实发生的事件，保留重要转折。'},
            {'role':'user','content':f'记录地点（不一定是初见地点）：{location}；整场消息总数：{len(m_msgs)}。\n'+chunk}
        ],json_mode=True,max_tokens=1024,temperature=0.25,log_meta={'mode':'meeting_summary','entryPoint':'meeting_finalize','profile':p,'character':c})
        part=str(parse_json(msg,{}).get('summary') or '').strip()
        if not part:raise ValueError('见面分段摘要为空；保留原始见面记录')
        notes.append(part)
    if len(notes)==1:return {'summary':checkpoints[0]['summary'] if reuse else notes[0]}
    merged=completion([
        {'role':'system','content':instruction+f'以下是同一场见面按时间顺序整理的 {len(notes)} 段事实小结。合并为整场见面梗概，不得只概括最后一段，也不得增加分段摘要中没有的情节。'},
        {'role':'user','content':f"见面时间：{m_msgs[0].get('created_at','')} 至 {m_msgs[-1].get('created_at','')}；记录地点（不一定是初见地点）：{location}。\n"+'\n'.join(f'第{i+1}/{len(notes)}段：{note}' for i,note in enumerate(notes))}
    ],json_mode=True,max_tokens=1024,temperature=0.25,log_meta={'mode':'meeting_summary','entryPoint':'meeting_finalize','profile':p,'character':c})
    summary=str(parse_json(merged,{}).get('summary') or '').strip()
    if not summary:raise ValueError('整场见面梗概为空；保留原始见面记录')
    return {'summary':summary}

def build_meeting_summary_text(p,c,loc,m_msgs,ai_summary=''):
    if ai_summary and len(str(ai_summary).strip())>=6:
        return strip_protocol_tags(str(ai_summary),preserve_paragraphs=False)[:320]
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
    state=MEETING_STATE.get((p['id'],c['id']),{})
    is_active=state.get('active_meeting_id')==meeting_id
    stored_history=parse_json(existed['location_history'],[]) if existed else []
    history=list(state.get('meeting_location_history') or []) if is_active else stored_history
    loc=(history[-1].get('location') if history else '') or str(custom_loc or (existed['location'] if existed else '')).strip()
    if not loc:loc=infer_meeting_location(db,p['id'],c['id'],'')
    started_at=(existed['started_at'] if existed else '') or m_msgs[0]['created_at'] or utc()
    ended_at=m_msgs[-1]['created_at'] or utc()
    time_str=str(started_at)[:16].replace('T',' ')
    ai_sum=ai_summary or (existed['ai_summary'] if existed and len(parse_json(existed['message_ids'],[]))==len(m_msgs) else '')
    summary=build_meeting_summary_text(p,c,loc,m_msgs,ai_sum)
    entries=[{'id':m['id'],'sender':m['sender'],'speaker':p['name'] if m['sender']=='user' else c['name'],'text':str(m.get('text','')) if m['sender']=='user' else clean_meeting_novel_text(m['text']),'created_at':m['created_at']} for m in m_msgs]
    msg_ids=[m['id'] for m in m_msgs]
    db.execute('''INSERT OR REPLACE INTO meetings (id,profile_id,character_id,location,time,started_at,ended_at,summary,ai_summary,message_ids,entries,location_history)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)''',(meeting_id,p['id'],c['id'],loc,time_str,started_at,ended_at,summary,ai_sum,js(msg_ids),js(entries),js(history)))
    rec={
        'id':meeting_id,
        'profile_id':p['id'],
        'character_id':c['id'],
        'location':loc,
        'location_history':history,
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
    all_rows=db.execute('SELECT rowid,* FROM messages WHERE profile_id=? AND character_id=? ORDER BY julianday(created_at),rowid',(p['id'],c['id'])).fetchall()
    all_msgs=[dict(r) for r in all_rows if not _is_chat_artifact(dict(r))]
    # Migrate legacy messages into their original card IDs, avoiding accidental splits.
    known={}
    for rec in db.execute('SELECT id,message_ids FROM meetings WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchall():
        for msg_id in parse_json(rec['message_ids'],[]):known[msg_id]=rec['id']
    groups={}
    legacy_mid=''
    active=MEETING_STATE.get((p['id'],c['id']),{}).get('active_meeting_id','')
    for m in all_msgs:
        if m['mode']!='meeting':
            legacy_mid=''
            continue
        mid=m.get('meeting_id') or known.get(m['id']) or legacy_mid or ('meet_'+m['id'])
        if not m.get('meeting_id'):
            db.execute('UPDATE messages SET meeting_id=? WHERE id=?',(mid,m['id']))
            m['meeting_id']=mid
        legacy_mid=mid
        groups.setdefault(mid,[]).append(m)
    for mid,group in groups.items():
        location=MEETING_STATE.get((p['id'],c['id']),{}).get('meeting_location','') if active==mid else ''
        upsert_meeting_record(db,p,c,mid,group,location)
    for rec in db.execute('SELECT id FROM meetings WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchall():
        if rec['id'] not in groups:
            db.execute('DELETE FROM meetings WHERE id=?',(rec['id'],))
            db.execute('DELETE FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_key=?',(c['id'],p['id'],'meeting:'+rec['id']))
    db.execute("DELETE FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_type='milestone'",(c['id'],p['id']))
    rows=db.execute('SELECT * FROM meetings WHERE profile_id=? AND character_id=? ORDER BY started_at',(p['id'],c['id'])).fetchall()
    meetings=[dict(r)|{'message_ids':parse_json(r['message_ids'],[]),'entries':parse_json(r['entries'],[])} for r in rows]
    return all_msgs,meetings


def forget_thread_messages(db,p,c,message_ids,whole_meeting_ids=None):
    ids=set(str(x) for x in message_ids)
    whole=set(str(x) for x in (whole_meeting_ids or []))
    if not ids:return {'removedIds':[],'removedMeetingIds':[]}
    all_rows=db.execute('SELECT * FROM messages WHERE profile_id=? AND character_id=? ORDER BY rowid',(p['id'],c['id'])).fetchall()
    removed=[dict(row) for row in all_rows if row['id'] in ids]
    if not removed:return {'removedIds':[],'removedMeetingIds':[]}
    affected=set(whole)|{m['meeting_id'] for m in removed if m['mode']=='meeting' and m['meeting_id']}
    erased_meetings=[db.execute('SELECT started_at,ended_at,location FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],c['id'])).fetchone() for mid in whole]
    erased_meetings=[r for r in erased_meetings if r]
    dates={str(m['created_at'])[:10] for m in removed}
    oldmem=db.execute('SELECT id,source_key,source_type,clarifies_id,raw_msg_ids FROM episodic_memories WHERE owner_id=? AND profile_id=?',(c['id'],p['id'])).fetchall()
    removed_mem=set()
    for row in oldmem:
        evidence=set(parse_json(row['raw_msg_ids'],[]))
        if ids&evidence or any(row['source_key']=='meeting:'+mid for mid in affected) or (row['source_type']=='daily-summary' and row['source_key'].replace('day:','') in dates):
            removed_mem.add(row['id'])
    for mem in oldmem:
        if mem['id'] in removed_mem or mem['clarifies_id'] in removed_mem:
            db.execute('DELETE FROM episodic_memories WHERE id=?',(mem['id'],))
    for mid in ids:
        db.execute('DELETE FROM messages WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],c['id']))
        invalidate_translation(db,mid)
    for ref in db.execute("SELECT id,quote_json FROM messages WHERE profile_id=? AND character_id=? AND quote_json!=''",(p['id'],c['id'])):
        if (parse_json(ref['quote_json'],{}) or {}).get('id') in ids:db.execute("UPDATE messages SET quote_json='' WHERE id=?",(ref['id'],))
    # Event notes are secondary summaries, not authority. Remove directly matching source events.
    for row in db.execute("SELECT id,type,summary,created_at FROM events WHERE profile_id=? AND character_id=?",(p['id'],c['id'])).fetchall():
        if row['type'] in ('meeting','return') and erased_meetings:
            # Legacy events carry no meeting_id. Use an intentionally tight time match.
            if any(abs((datetime.fromisoformat(row['created_at'])-datetime.fromisoformat(rec['started_at'] if row['type']=='meeting' else rec['ended_at'])).total_seconds())<15 for rec in erased_meetings):
                db.execute('DELETE FROM events WHERE id=?',(row['id'],))
                continue
        if row['type'] not in ('user_message','ai_message'):continue
        if any(str(m['text'])[:40] and str(m['text'])[:40] in str(row['summary']) and abs((datetime.fromisoformat(row['created_at'])-datetime.fromisoformat(m['created_at'])).total_seconds())<2 for m in removed):
            db.execute('DELETE FROM events WHERE id=?',(row['id'],))
    for mid in affected:
        # Purge stale checkpoints before updating the remaining transcript.
        valid_meeting_checkpoints(db,p['id'],c['id'],mid)
        remains=[dict(x) for x in db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting' AND meeting_id=? ORDER BY julianday(created_at),rowid",(p['id'],c['id'],mid)).fetchall()]
        if remains:
            before=db.execute('SELECT location FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],c['id'])).fetchone()
            db.execute('UPDATE meetings SET ai_summary=? WHERE id=?',('',mid))
            upsert_meeting_record(db,p,c,mid,remains,before['location'] if before else '')
        else:
            db.execute('DELETE FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],c['id']))
            db.execute('DELETE FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_key=?',(c['id'],p['id'],'meeting:'+mid))
    q=db.execute('SELECT pending FROM chat_queue WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
    if q:
        pending=[x for x in parse_json(q['pending'],[]) if x not in ids]
        db.execute('UPDATE chat_queue SET pending=?,due_at=CASE WHEN ?=0 THEN 0 ELSE due_at END WHERE profile_id=? AND character_id=?',(js(pending),len(pending),p['id'],c['id']))
    diary=DIARY_STATE.get((p['id'],c['id']),{}).get('by_date',{})
    for date in dates:diary.pop(date,None)
    store=SURVEILLANCE_STATE.get((p['id'],c['id']),{}).get('by_date',{})
    for daily in store.values():
        if isinstance(daily.get('slots'),list):daily['slots']=[slot for slot in daily['slots'] if slot.get('meeting_id') not in affected]
    m_state=MEETING_STATE.get((p['id'],c['id']),{})
    if erased_meetings and m_state.get('meeting_location') in [r['location'] for r in erased_meetings]:
        newer=db.execute('SELECT location FROM meetings WHERE profile_id=? AND character_id=? ORDER BY started_at DESC LIMIT 1',(p['id'],c['id'])).fetchone()
        m_state['meeting_location']=newer['location'] if newer else ''
    return {'removedIds':list(ids),'removedMeetingIds':[mid for mid in affected if not db.execute('SELECT 1 FROM meetings WHERE id=?',(mid,)).fetchone()]}

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
        if m['engine']=='recalled' or _is_chat_artifact(dict(m)):continue
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

def retrieve_relevant_memories(db,pid,cid,query_text='',exclude_msg_ids=None,limit=4,max_chars=1200,as_of=0):
    exclude=set(exclude_msg_ids or [])
    rows=db.execute('SELECT * FROM episodic_memories WHERE owner_id=? AND profile_id=? ORDER BY event_at DESC',(cid,pid)).fetchall()
    if not rows:return []
    all_items=[dict(r)|{'tags':parse_json(r['tags'],[]),'raw_msg_ids':parse_json(r['raw_msg_ids'],[])} for r in rows]
    if as_of:
        cutoff=datetime.fromtimestamp(as_of/1000,timezone.utc).isoformat(timespec='microseconds')
        allowed={r['id'] for r in db.execute('SELECT id FROM messages WHERE profile_id=? AND character_id=? AND julianday(created_at)<=julianday(?)',(pid,cid,cutoff))}
        all_items=[x for x in all_items if x['event_at']<=cutoff and set(x['raw_msg_ids']).issubset(allowed)]
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
        if raw_ids and ((item['source_type']=='dialogue' and raw_ids.issubset(exclude)) or (item['source_type']=='daily-summary' and bool(raw_ids & exclude))):
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


MEETING_CHECKPOINT_INTERVAL=50

def completed_meeting_groups(db,pid,cid,mid):
    rows=[dict(x) for x in db.execute(
        "SELECT id,sender,mode,text,engine,created_at,meeting_id FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting' AND meeting_id=? ORDER BY julianday(created_at),rowid",
        (pid,cid,mid)).fetchall() if x['engine']!='recalled']
    groups=[]
    for row in rows:
        last=groups[-1] if groups else None
        if row['sender']=='user':
            if not last or any(m['sender']=='ai' for m in last):groups.append([row])
            else:last.append(row)
        elif row['sender']=='ai':
            if last:last.append(row)
            else:groups.append([row])
    return [g for g in groups if any(m['sender']=='user' for m in g) and any(m['sender']=='ai' for m in g)]

def meeting_block_signature(groups):
    body=''.join(str(m['id'])+'\0'+str(m.get('text') or '')+'\1' for g in groups for m in g)
    return f"{len(body)}:{hashlib.sha256(body.encode('utf8')).hexdigest()}"

def valid_meeting_checkpoints(db,pid,cid,mid,groups=None):
    groups=completed_meeting_groups(db,pid,cid,mid) if groups is None else groups
    rows=db.execute('SELECT * FROM meeting_checkpoints WHERE profile_id=? AND character_id=? AND meeting_id=? ORDER BY block_index',(pid,cid,mid)).fetchall()
    valid=[]
    for row in rows:
        cp=dict(row)
        part=groups[(cp['block_index']-1)*50:cp['block_index']*50]
        if len(part)!=50 or cp['source_signature']!=meeting_block_signature(part):
            db.execute("DELETE FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_key=?",
                (cid,pid,f"meeting-checkpoint:{mid}:{cp['block_index']}"))
            db.execute("DELETE FROM meeting_checkpoints WHERE profile_id=? AND character_id=? AND meeting_id=? AND block_index=?",
                (pid,cid,mid,cp['block_index']))
            continue
        for key in ('participants','keywords','key_dialogues','details','message_ids'):
            cp[key]=parse_json(cp[key],[])
        valid.append(cp)
    return valid

def meeting_checkpoint_source(groups,p,c):
    parts=[]
    for m in (x for g in groups for x in g):
        body=re.sub(r'\s+',' ',str(m.get('text') or '')).strip()
        limit=300 if m['sender']=='user' else 480
        sample=body if len(body)<=limit else body[:int(limit*.65)]+' … '+body[-int(limit*.35):]
        parts.append(f"[{m['id']} @ {str(m['created_at'])[:19]}] {p['name'] if m['sender']=='user' else c['name']}：{sample}")
    return '\n'.join(parts)

def normalize_meeting_checkpoint(data,p,c,mid,index,block,signature):
    messages=[m for g in block for m in g]
    by_id={m['id']:m for m in messages}
    clean=lambda x:strip_protocol_tags(str(x or ''),preserve_paragraphs=False).strip()
    summary=clean(data.get('summary'))[:560]
    if len(summary)<12:raise ValueError('见面阶段小结缺少有效纪实内容')
    keywords=[clean(x)[:22] for x in (data.get('keywords') if isinstance(data.get('keywords'),list) else []) if len(clean(x))>=2][:14]
    details=[clean(x)[:160] for x in (data.get('details') if isinstance(data.get('details'),list) else []) if clean(x)][:18]
    dialogues=[]
    for x in (data.get('key_dialogues') if isinstance(data.get('key_dialogues'),list) else []):
        if not isinstance(x,dict):continue
        m=by_id.get(str(x.get('message_id') or ''))
        quote=clean(x.get('quote'))[:150]
        if m and quote and quote in str(m['text']):
            dialogues.append({'message_id':m['id'],'speaker':p['name'] if m['sender']=='user' else c['name'],'quote':quote})
    participants=[]
    for who in [p['name'],c['name']]+(data.get('participants') if isinstance(data.get('participants'),list) else []):
        name=clean(who)[:40]
        if name and name not in participants:participants.append(name)
    return dict(profile_id=p['id'],character_id=c['id'],meeting_id=mid,block_index=index,
        round_start=(index-1)*50+1,round_end=index*50,
        started_at=messages[0]['created_at'],ended_at=messages[-1]['created_at'],
        participants=participants[:12],summary=summary,keywords=keywords,details=details,key_dialogues=dialogues[:10],
        message_ids=[m['id'] for m in messages],source_signature=signature,created_at=utc())

def ensure_meeting_checkpoints(db,p,c,mid):
    if not mid:return []
    groups=completed_meeting_groups(db,p['id'],c['id'],mid)
    result=[]
    for index in range(1,len(groups)//50+1):
        block=groups[(index-1)*50:index*50]
        signature=meeting_block_signature(block)
        row=db.execute('SELECT source_signature FROM meeting_checkpoints WHERE profile_id=? AND character_id=? AND meeting_id=? AND block_index=?',(p['id'],c['id'],mid,index)).fetchone()
        if row and row['source_signature']==signature:continue
        conn=load_connection()
        if all(conn.get(x) for x in ('base_url','api_key','model')):
            response=completion([
                {'role':'system','content':'你是小说见面记录的事实档案员，只整理已发生的内容。按时间顺序保留人物、地点移动、重要动作与状态、承诺与取消及因果，不得虚构。只输出 JSON：{"summary":"300至500字时序纪实","participants":["真实在场人物"],"keywords":["2至14个可检索的具体事件词组"],"key_dialogues":[{"message_id":"原文消息ID","quote":"原文准确连续片段"}],"details":["5至18条具体事实"]}。关键对话必须逐字摘录、标明ID。'},
                {'role':'user','content':f"见面第{index}段共50组完整往返，人物：{p['name']}、{c['name']}。各行带来源ID和时间。\n"+meeting_checkpoint_source(block,p,c)}
            ],json_mode=True,max_tokens=2400,temperature=0.25,log_meta={'mode':'archive','entryPoint':'meeting_checkpoint','profile':p,'character':c})
            data=parse_json(response,{})
        else:
            first,last=block[0][0],block[-1][-1]
            data={'summary':f"与 {p['name']} 在场持续互动50组。开始于「{str(first['text'])[:80]}」，结束于「{str(last['text'])[:80]}」。离线临时纪要，详细事实须核查原文。",
                  'keywords':extract_memory_tags(' '.join(str(g[0]['text']) for g in block),10),'details':[],'key_dialogues':[]}
        latest=completed_meeting_groups(db,p['id'],c['id'],mid)[(index-1)*50:index*50]
        if len(latest)!=50 or meeting_block_signature(latest)!=signature:raise ValueError('归档期间见面原文已被修改')
        cp=normalize_meeting_checkpoint(data,p,c,mid,index,latest,signature)
        keys=['profile_id','character_id','meeting_id','block_index','source_signature','started_at','ended_at','participants','summary','keywords','key_dialogues','details','message_ids','created_at']
        vals=[js(cp[k]) if k in ('participants','keywords','key_dialogues','details','message_ids') else cp[k] for k in keys]
        db.execute('INSERT OR REPLACE INTO meeting_checkpoints ('+','.join(keys)+') VALUES ('+','.join('?' for _ in keys)+')',vals)
        append_episodic_memory(db,owner_id=c['id'],profile_id=p['id'],source_type='meeting_checkpoint',
            source_key=f"meeting-checkpoint:{mid}:{index}",knowledge_mode='experienced',
            summary=f"和 {p['name']} 的第{cp['round_start']}–{cp['round_end']}组见面：{cp['summary']}",
            tags=['见面']+cp['keywords'],importance=4,emotional_weight=3,
            raw_msg_ids=cp['message_ids'],event_at=cp['ended_at'])
        result.append(cp)
    return result

def meeting_checkpoint_prompt_context(db,p,c,mid,query=''):
    groups=completed_meeting_groups(db,p['id'],c['id'],mid)
    checkpoints=valid_meeting_checkpoints(db,p['id'],c['id'],mid,groups)
    if not checkpoints:return ''
    summaries=[]
    for cp in checkpoints:
        dialogues='；'.join(x['speaker']+'「'+x['quote']+'」' for x in cp['key_dialogues'])
        summaries.append(f"第{(cp['block_index']-1)*50+1}–{cp['block_index']*50}组｜{cp['started_at']} 至 {cp['ended_at']}｜人物：{'、'.join(cp['participants'])}\n小结：{cp['summary']}\n关键词：{'、'.join(cp['keywords'])}\n关键对话：{dialogues}\n具体内容：{'；'.join(cp['details'])}")
    query=str(query or '').lower()
    ignored={'我们','你们','他们','自己','这个','那个','见面','现在','刚才','今天','昨天'}
    excerpts=[]
    matched=[(cp,[kw for kw in cp['keywords'] if len(kw)>=2 and kw not in ignored and kw.lower() in query]) for cp in checkpoints]
    for cp,hits in [(cp,hits) for cp,hits in matched if hits][-3:]:
        offset=(cp['block_index']-1)*50
        segment=groups[offset:offset+50]
        candidates=[]
        for i,g in enumerate(segment):
            score=sum(1 for m in g for kw in hits if kw.lower() in str(m.get('text') or '').lower())
            if score:candidates.append((score,i))
        for _,i in sorted(sorted(candidates,reverse=True)[:2],key=lambda x:x[1]):
            nearby=segment[max(0,i-1):min(50,i+2)]
            excerpts.append(f"第{offset+i+1}组附近原文（{'、'.join(hits)}）：\n"+meeting_checkpoint_source(nearby,p,c)[:2600])
    return ("\n\n【本次见面 · 已归档的全部50组阶段小结】\n"+"\n\n".join(summaries)+
            "\n以上为过去亲历事实，最新5组对话决定当下位置和动作，不得让旧场景覆盖当前现场。"+
            ("\n\n【关键词命中的历史现场原文 · 带来源消息ID】\n"+"\n\n".join(excerpts) if excerpts else ''))

def select_turn_window(rows,mode,protected_ids=None,meeting_max_groups=10):
    if not rows:return []
    groups=[]
    for row in rows:
        if not groups or (row['sender']=='user' and groups[-1][-1]['sender']=='ai'):groups.append([row])
        else:groups[-1].append(row)
    protected=set(protected_ids or [])
    protected_start=next((i for i,g in enumerate(groups) if any(m['id'] in protected for m in g)),-1)
    budget,max_groups=((float('inf'),5) if meeting_max_groups==5 else (36000,10)) if mode=='meeting' else (12000,12)
    cost=0;start=len(groups)-1
    for i in range(len(groups)-1,-1,-1):
        next_cost=sum(len(str(m.get('text') or ''))+40 for m in groups[i])
        must_keep=i==len(groups)-1 or (protected_start>=0 and i>=protected_start)
        if not must_keep and (cost+next_cost>budget or len(groups)-i>max_groups):break
        start=i;cost+=next_cost
    return [m for g in groups[start:] for m in g]

def select_working_history(db,pid,cid,mode='chat',through_rowid=None,exclude_ids=None,protected_ids=None):
    # Retrieve this conversation only, and never cut the oldest pending message off.
    where='profile_id=? AND character_id=?'
    args=[pid,cid]
    if through_rowid is not None:
        cutoff=db.execute('SELECT created_at FROM messages WHERE rowid=? AND profile_id=? AND character_id=?',(through_rowid,pid,cid)).fetchone()
        if cutoff:
            # A recovered reply can have a later insertion rowid but an earlier conversation timestamp.
            where+=' AND (julianday(created_at)<julianday(?) OR (julianday(created_at)=julianday(?) AND rowid<=?))';args.extend([cutoff['created_at'],cutoff['created_at'],through_rowid])
    rows=db.execute('SELECT rowid,id,sender,mode,text,engine,created_at,meeting_id,quote_json FROM messages WHERE '+where+' ORDER BY julianday(created_at) DESC,rowid DESC',args).fetchall()
    excl=set(exclude_ids or [])
    chron=[m for m in reversed([dict(r) for r in rows]) if not _is_chat_artifact(m) and m['id'] not in excl]
    if mode=='meeting':
        m_state=MEETING_STATE.get((pid,cid),{})
        active_mid=m_state.get('active_meeting_id','')
        if active_mid:
            checkpointed=bool(valid_meeting_checkpoints(db,pid,cid,active_mid))
            return select_turn_window([m for m in chron if m['mode']=='meeting' and m.get('meeting_id')==active_mid],mode,protected_ids,5 if checkpointed else 10)
        started_after=m_state.get('started_after_rowid')
        if started_after is not None:
            return select_turn_window([m for m in chron if m['mode']=='meeting' and int(m.get('rowid',0))>int(started_after)],mode,protected_ids)
        active_streak=[]
        for m in reversed(chron):
            if m['mode']=='meeting':active_streak.insert(0,m)
            else:break
        return select_turn_window(active_streak,mode,protected_ids)
    return select_turn_window([m for m in chron if m['mode']=='chat'],mode,protected_ids)

def select_pre_meeting_chat_context(db,pid,cid,limit=6):
    rows=db.execute('SELECT id,sender,mode,text,engine,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY created_at DESC,id DESC LIMIT 48',(pid,cid)).fetchall()
    chron=list(reversed([dict(r) for r in rows if r['engine']!='recalled']))
    if not chron:return []
    end_idx=len(chron)
    while end_idx>0 and chron[end_idx-1]['mode']=='meeting':
        end_idx-=1
    chat_before=[m for m in chron[:end_idx] if m['mode']=='chat']
    return chat_before[-limit:]

def chat_quote_snapshot(db,pid,cid,quote_id):
    if not quote_id:return None
    source=db.execute('SELECT * FROM messages WHERE id=? AND profile_id=? AND character_id=? AND mode=?',(quote_id,pid,cid,'chat')).fetchone()
    if not source or source['engine']=='recalled':raise ValueError('引用的原消息已失效，请重新选择')
    return {'id':source['id'],'sender':source['sender'],'text':str(source['text'] or '').replace('\n',' ').strip()[:220]}

def write_message(db,pid,cid,sender,mode,txt,engine='human',at=0,quote_id=''):
    clean_txt = (clean_meeting_novel_text(txt) if mode=='meeting' else (clean_chat_bubble_text(txt) or '…')) if (sender=='ai' and engine not in ('error','recalled')) else str(txt or '')
    meeting_id=MEETING_STATE.get((pid,cid),{}).get('active_meeting_id','') if mode=='meeting' else ''
    quote=chat_quote_snapshot(db,pid,cid,quote_id) if sender=='user' and mode=='chat' and quote_id else None
    item=dict(id=uid(),profile_id=pid,character_id=cid,sender=sender,mode=mode,text=clean_txt,engine=engine,
              created_at=datetime.fromtimestamp(at/1000,timezone.utc).isoformat(timespec='microseconds') if at else utc(),
              meeting_id=meeting_id,quote_json=js(quote) if quote else '',
              scene_location='',scene_location_evidence='',scene_location_signature='')
    db.execute('''INSERT INTO messages
        (id,profile_id,character_id,sender,mode,text,engine,created_at,meeting_id,quote_json,scene_location,scene_location_evidence,scene_location_signature)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)''',tuple(item.values()))
    item['quote']=quote
    if mode=='meeting' and meeting_id and not at:
        p=profile_get(db,pid);c=BY_ID.get(cid)
        if c and sender=='ai' and engine in ('live','demo'):
            # Exclude the newly generated reply when obtaining the previously
            # confirmed character position; do not let the answer prove itself.
            earlier=refresh_meeting_scene_history(db,p,c,exclude_message_id=item['id'])
            previous=earlier[-1]['location'] if earlier else MEETING_STATE.get((pid,cid),{}).get('meeting_location','')
            found=classify_meeting_scene_location(p,c,clean_txt,previous)
            if found:
                item['scene_location']=found['location']
                item['scene_location_evidence']=found['evidence']
                item['scene_location_signature']=meeting_scene_signature(clean_txt)
                db.execute('UPDATE messages SET scene_location=?,scene_location_evidence=?,scene_location_signature=? WHERE id=?',
                    (item['scene_location'],item['scene_location_evidence'],item['scene_location_signature'],item['id']))
        if c:
            # Both user moves and written AI movement must immediately update
            # the monitor before the next prompt. Neither is a new day plan.
            sync_live_meeting_scene_location(db,p,c)
            if sender=='ai' and engine in ('live','demo'):
                try:
                    ensure_meeting_checkpoints(db,p,c,meeting_id)
                except Exception as error:
                    log_event(db,pid,cid,'meeting_checkpoint_failed','阶段归档待重试：'+str(error)[:140])
                # Persist the full witnessed scene itinerary for resume/restart.
                rows=[dict(x) for x in db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting' AND meeting_id=? ORDER BY julianday(created_at),rowid",
                    (pid,cid,meeting_id)).fetchall()]
                if rows:upsert_meeting_record(db,p,c,meeting_id,rows,MEETING_STATE.get((pid,cid),{}).get('meeting_location',''))
    if sender=='ai' and mode=='chat' and engine in ('live','demo') and not _is_chat_artifact(item):reconcile_phone_activity(db,pid,cid,at)
    if at:
        date=datetime.fromtimestamp(at/1000).astimezone().strftime('%Y-%m-%d')
        diary=DIARY_STATE.get((pid,cid),{}).get('by_date',{}).get(date)
        if diary:diary['stale_after_recovery']=True
    return item

def log_event(db,pid,cid,kind,summary,at=0):
    now_str=datetime.fromtimestamp(at/1000,timezone.utc).isoformat(timespec='microseconds') if at else utc()
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
        'simulated_reply_at':entry.get('simulated_reply_at',''),
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

class ApiGatewayError(RuntimeError):
    def __init__(self,api_error):
        super().__init__(api_error.get('message') or 'API 请求失败')
        self.api_error=api_error

def classify_http_status_error(status,detail_msg='',retry_after=0):
    s=int(status or 0)
    ra=0
    if isinstance(retry_after,dict):
        ra_val=retry_after.get('Retry-After') or retry_after.get('retry-after') or ''
        ra=int(ra_val) if str(ra_val).isdigit() else 0
    elif str(retry_after).isdigit():
        ra=int(retry_after)
    suffix=f"（{detail_msg}）" if detail_msg else ''
    # An OpenAI-compatible proxy may return HTTP 500 for a Google 401.
    # A credential-type mismatch will not recover by simply retrying.
    if re.search(r'API keys? are not supported by this API',str(detail_msg),re.IGNORECASE) and re.search(r'OAuth2? access token|UNAUTHENTICATED|401',str(detail_msg),re.IGNORECASE):
        return {
            'error_code':'UPSTREAM_OAUTH_REQUIRED','error_type':'UPSTREAM_OAUTH_REQUIRED','http_status':s,
            'title':'上游模型认证方式不匹配（真实原因：401）',
            'message':'当前模型渠道用 API Key 访问了要求 OAuth 2.0 凭证的 Google 接口。请检查终端所选模型与供应商的上游认证配置；不要反复重试。',
            'retry_after':0,'suggest_terminal':True,'may_consume_tokens':False
        }
    def _res(code,title,msg,suggest_terminal=False,may_consume_tokens=False):
        return {'error_code':code,'error_type':code,'http_status':s,'title':title,'message':msg,'retry_after':ra,'suggest_terminal':suggest_terminal,'may_consume_tokens':may_consume_tokens}
    if s==400:return _res('HTTP_400','请求参数异常 (HTTP 400)',f"模型接口拒绝了请求参数{suffix}。请检查终端中的模型名称或 Max tokens 设置。",suggest_terminal=True)
    if s==401:return _res('HTTP_401','API 认证失败 (HTTP 401)',f"API 密钥无效或已过期{suffix}。请前往「终端」检查并更新 API Key。",suggest_terminal=True)
    if s==403:return _res('HTTP_403','访问权限不足 (HTTP 403)',f"当前 API 密钥无权访问该模型或接口{suffix}。请前往「终端」检查权限或更换模型。",suggest_terminal=True)
    if s==404:return _res('HTTP_404','模型或接口不存在 (HTTP 404)',f"找不到指定的 API 路径或模型 ID{suffix}。请前往「终端」检查 API Base URL 与模型名称。",suggest_terminal=True)
    if s==408:return _res('HTTP_408','请求超时 (HTTP 408)',f"上游服务器等待请求超时{suffix}。注意：服务端可能已消耗 Token，请谨慎重试。",may_consume_tokens=True)
    if s==429:
        wait_hint=f"建议等待约 {ra} 秒后再试。" if ra>0 else '建议稍作等待后再点击重试，或暂停调用。'
        return _res('HTTP_429','请求频率或额度受限 (HTTP 429)',f"触发了接口速率限制或配额耗尽{suffix}。{wait_hint}")
    if s==500:return _res('HTTP_500','服务器内部错误 (HTTP 500)',f"模型服务商或反代内部异常{suffix}。可稍后重试或暂停调用。")
    if s==502:return _res('HTTP_502','网关错误 (HTTP 502)',f"反代或网关无法从上游获取有效响应{suffix}。可稍后重试。")
    if s==503:return _res('HTTP_503','服务暂不可用 (HTTP 503)',f"上游模型服务繁忙或维护中{suffix}。建议稍后重试或暂停调用。")
    if s==504:return _res('HTTP_504','网关超时 (HTTP 504)',f"反代等待上游模型响应超时{suffix}。注意：上游可能已在计费生成中，重试可能额外消耗 Token。",may_consume_tokens=True)
    if s==529:return _res('HTTP_529','服务商过载 (HTTP 529)',f"上游模型服务商当前负载过高 (Overloaded){suffix}。建议等待片刻后再重试。")
    return _res(f'HTTP_{s}',f'接口请求异常 (HTTP {s})',f"模型接口返回异常状态码 HTTP {s}{suffix}。请检查终端设置或查看系统日志。")

def completion(messages,*,json_mode=False,max_tokens=None,temperature=None,log_meta=None):
    settings=load_connection();base=settings.get('base_url');key=settings.get('api_key');model=settings.get('model')
    if not all((base,key,model)):raise RuntimeError('尚未配置可用的 API 地址、密钥及模型')
    meta=log_meta or {}
    req_mode=meta.get('mode','chat')
    task_type=meta.get('task_type') or req_mode
    task_id=meta.get('task_id') or ('task_'+uid())
    attempt=int(meta.get('attempt') or 1)
    retry_of_task_id=meta.get('retry_of_task_id') or ''
    max_tok=resolve_task_max_tokens(settings,req_mode,meta.get('entryPoint',req_mode),max_tokens)
    temp=float(temperature if temperature is not None else settings.get('temperature',0.85))
    top_p_val=float(settings.get('top_p',1))
    payload={'model':model,'messages':messages,'temperature':temp,'top_p':top_p_val,'max_tokens':max_tok}
    if json_mode:payload['response_format']={'type':'json_object'}
    endpoint=base+'/chat/completions'
    headers_masked={'Content-Type':'application/json','Authorization':'Bearer '+mask_api_key(key)}
    active_presets=[];disabled_presets=[]
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
    def _fail(error_type,title,message,http_status=0,detail='',retry_after=0,suggest_terminal=False,may_consume_tokens=False,raw_resp=None,raw_content='',finish_reason='',usage=None):
        log_entry=record_system_log({
            'profile_id':(meta.get('profile') or {}).get('id',''),
            'profile_name':(meta.get('profile') or {}).get('name',''),
            'character_id':(meta.get('character') or {}).get('id',''),
            'character_name':(meta.get('character') or {}).get('name',''),
            'mode':req_mode,
            'task_id':task_id,
            'retry_of_task_id':retry_of_task_id,
            'attempt':attempt,
            'entry_point':meta.get('entryPoint',req_mode),
        'simulated_reply_at':meta.get('simulated_reply_at',''),
            'model':model,
            'endpoint':endpoint,
            'headers_masked':headers_masked,
            'sampling':{'temperature':temp,'top_p':top_p_val,'max_tokens':max_tok},
            'active_preset_count':len(active_presets),
            'disabled_preset_count':len(disabled_presets),
            'active_presets':active_presets,
            'disabled_presets':disabled_presets,
            'request_payload':payload,
            'raw_response':raw_resp,
            'raw_content':raw_content,
            'parsed_content':'',
            'char_count_raw':len(raw_content or ''),
            'char_count_parsed':0,
            'finish_reason':finish_reason,
            'usage':usage,
            'duration_ms':now_ms()-t0,
            'http_status':http_status,
            'error_type':error_type,
            'error':message
        })
        raise ApiGatewayError({
            'error_type':error_type,
            'http_status':http_status,
            'title':title,
            'message':message,
            'detail':detail or message,
            'task_type':task_type,
            'task_id':task_id,
            'retry_of_task_id':retry_of_task_id,
            'attempt':attempt,
            'character_id':(meta.get('character') or {}).get('id',''),
            'character_name':(meta.get('character') or {}).get('name',''),
            'profile_id':(meta.get('profile') or {}).get('id',''),
            'profile_name':(meta.get('profile') or {}).get('name',''),
            'retry_after':retry_after,
            'suggest_terminal':suggest_terminal,
            'may_consume_tokens':may_consume_tokens,
            'log_id':(log_entry or {}).get('id',''),
            'created_at':utc()
        })
    req=urllib.request.Request(endpoint,data=js(payload).encode('utf8'),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json','Accept':'application/json'},method='POST')
    try:
        with urllib.request.urlopen(req,timeout=65) as r:
            status_code=getattr(r,'status',200)
            raw_bytes=r.read(4*1024*1024)
            raw_text=raw_bytes.decode('utf8',errors='replace')
    except urllib.error.HTTPError as exc:
        err_body=''
        try:err_body=exc.read(256*1024).decode('utf8',errors='replace')
        except Exception:pass
        err_json=parse_json(err_body,None) if err_body else None
        detail_msg=''
        if isinstance(err_json,dict):
            e_obj=err_json.get('error')
            detail_msg=(e_obj if isinstance(e_obj,str) else (e_obj.get('message') or e_obj.get('code') or e_obj.get('type') if isinstance(e_obj,dict) else '')) or err_json.get('message') or ''
        elif err_body:
            detail_msg=err_body.strip()[:180]
        ra_hdr=exc.headers.get('Retry-After','') if exc.headers else ''
        ra=int(ra_hdr) if str(ra_hdr).isdigit() else 0
        classified=classify_http_status_error(exc.code,str(detail_msg)[:180],ra)
        _fail(classified['error_type'],classified['title'],classified['message'],http_status=exc.code,detail=str(detail_msg or classified['message'])[:500],retry_after=ra,suggest_terminal=bool(classified.get('suggest_terminal')),may_consume_tokens=bool(classified.get('may_consume_tokens')),raw_resp=err_json or err_body[:1000])
    except urllib.error.URLError as exc:
        reason_str=str(getattr(exc,'reason','') or exc)
        is_timeout='timed out' in reason_str.lower() or 'timeout' in reason_str.lower()
        _fail('REQUEST_TIMEOUT' if is_timeout else 'NETWORK_ERROR','请求超时' if is_timeout else '网络连接失败',f"请求超时或被中断（{reason_str[:120]}）。注意：上游服务可能已处理该请求，重试可能产生额外 Token 消耗。" if is_timeout else f"无法连接模型接口（{reason_str[:140]}）。请检查网络连接或终端中的 API Base URL。",http_status=0,detail=reason_str[:400],suggest_terminal=not is_timeout,may_consume_tokens=True)
    duration_ms=now_ms()-t0
    if not raw_text or not raw_text.strip():
        _fail('EMPTY_RESPONSE','接口返回空响应',f"接口返回了 HTTP {status_code}，但响应体为空。",http_status=status_code)
    try:
        data=json.loads(raw_text)
    except Exception:
        proxy_check=detect_proxy_wrapped_error(raw_text)
        if proxy_check:
            _fail(proxy_check['error_type'],'反代服务返回错误提示',proxy_check['message'],http_status=status_code,detail=proxy_check['detail'],raw_resp=raw_text[:1000])
        _fail('INVALID_RESPONSE_JSON','接口响应无法解析',f"接口返回了 HTTP {status_code}，但响应不是有效的 JSON 格式。",http_status=status_code,detail=raw_text[:360],raw_resp=raw_text[:1000])
    if not isinstance(data,dict):
        _fail('INVALID_RESPONSE_JSON','接口响应结构异常','接口返回的 JSON 不是有效对象。',http_status=status_code)
    if (data.get('error') or data.get('status')=='error') and (not isinstance(data.get('choices'),list) or len(data.get('choices'))==0):
        e_obj=data.get('error')
        err_msg=e_obj if isinstance(e_obj,str) else ((e_obj.get('message') or e_obj.get('code') or e_obj.get('type') or js(e_obj)) if isinstance(e_obj,dict) else (data.get('message') or '未知错误'))
        proxy_err=detect_proxy_wrapped_error(str(err_msg))
        _fail(proxy_err['error_type'] if proxy_err else 'HTTP_200_ERROR_OBJECT','接口返回错误对象 (HTTP 200)',proxy_err['message'] if proxy_err else f"接口虽返回 HTTP 200，但包含错误字段：{str(err_msg)[:200]}",http_status=status_code,detail=str(err_msg)[:500],raw_resp=data)
    if not isinstance(data.get('choices'),list) or len(data['choices'])==0:
        _fail('EMPTY_CHOICES','接口未返回候选回复 (Choices 为空)','接口响应中缺少 choices 列表或列表为空。',http_status=status_code,raw_resp=data)
    choice=data['choices'][0] or {}
    msg_obj=choice.get('message') or {}
    finish_reason=str(choice.get('finish_reason') or '')
    is_truncated=finish_reason.lower() in ('length','max_tokens')
    usage_raw=data.get('usage') or data.get('usage_metadata') or data.get('usageMetadata') or {}
    comp_details=usage_raw.get('completion_tokens_details') or {}
    def usage_num(*values):
        for value in values:
            if isinstance(value,(int,float)) and not isinstance(value,bool) and value>=0 and float(value).is_integer():
                return int(value)
        return None
    usage={
        'prompt_tokens':usage_num(usage_raw.get('prompt_tokens'),usage_raw.get('input_tokens'),usage_raw.get('promptTokenCount')),
        'completion_tokens':usage_num(usage_raw.get('completion_tokens'),usage_raw.get('output_tokens'),usage_raw.get('candidatesTokenCount')),
        'total_tokens':usage_num(usage_raw.get('total_tokens'),usage_raw.get('totalTokenCount')),
        'reasoning_tokens':usage_num(comp_details.get('reasoning_tokens'),usage_raw.get('reasoning_tokens'),usage_raw.get('thoughtsTokenCount'))
    } if usage_raw else None
    content=msg_obj.get('content')
    reasoning_content=str(msg_obj.get('reasoning_content') or msg_obj.get('reasoning') or '')
    if isinstance(content,list):content=''.join(x.get('text','') for x in content if isinstance(x,dict))
    raw_trimmed=content.strip() if isinstance(content,str) else ''
    if req_mode=='chat' and raw_trimmed and not split_chat_bubbles(raw_trimmed):raw_trimmed=''
    if not raw_trimmed:
        is_len_trunc=is_truncated
        _fail('OUTPUT_TRUNCATED' if is_len_trunc else 'EMPTY_CONTENT','输出被截断且无正文' if is_len_trunc else '模型返回空内容',f"模型因达到 max_tokens ({max_tok}) 上限被截断，未产出有效正文。建议在「终端」调高 Max tokens。" if is_len_trunc else f"模型没有返回可用文本（finish_reason={finish_reason or 'unknown'}）。",http_status=status_code,suggest_terminal=is_len_trunc,raw_resp=data,finish_reason=finish_reason,usage=usage)
    proxy_content_err=detect_proxy_wrapped_error(raw_trimmed)
    if proxy_content_err:
        _fail(proxy_content_err['error_type'],'反代服务将错误写入了回复正文',proxy_content_err['message'],http_status=status_code,detail=proxy_content_err['detail'],raw_resp=data,raw_content=raw_trimmed,finish_reason=finish_reason,usage=usage)
    if json_mode and not meta.get('skip_json_gateway'):
        try:
            json.loads(raw_trimmed)
        except Exception:
            is_trunc=is_truncated
            _fail('OUTPUT_TRUNCATED' if is_trunc else 'INVALID_STRUCTURED_JSON','结构化输出被截断' if is_trunc else '结构化任务返回了无效 JSON',f"结构化任务返回的内容不是合法 JSON（finish_reason={finish_reason or 'unknown'}）。",http_status=status_code,detail=raw_trimmed[:360],raw_resp=data,raw_content=raw_trimmed,finish_reason=finish_reason,usage=usage)
    if is_truncated and (json_mode or meta.get('reject_truncated') or len(raw_trimmed)<80):
        _fail('OUTPUT_TRUNCATED','回复因达到 Token 上限被截断',f"模型输出因达到 max_tokens ({max_tok}) 上限被截断（当前仅 {len(raw_trimmed)} 字）。建议前往「终端」调高 Max tokens 后重试。",http_status=status_code,detail=raw_trimmed[:360],suggest_terminal=True,raw_resp=data,raw_content=raw_trimmed,finish_reason=finish_reason,usage=usage)
    reply_content=guard_chat_reasoning(raw_trimmed) if req_mode=='chat' else raw_trimmed
    if reply_content is None:
        _fail('REASONING_LEAK','模型将分析过程混入了聊天正文','无法可靠分离正式台词，已阻止写入聊天与记忆。可手动重试；原始返回已保存在系统日志中。',http_status=status_code,may_consume_tokens=True,raw_resp=data,raw_content=raw_trimmed,finish_reason=finish_reason,usage=usage)
    if req_mode=='chat' and not split_chat_bubbles(reply_content):
        _fail('EMPTY_PARSED_CONTENT','模型未返回可显示的正文','模型只返回了协议占位符或分隔符，请重试。',http_status=status_code,raw_resp=data,raw_content=raw_trimmed,finish_reason=finish_reason,usage=usage)
    parse_fn=meta.get('parseFn')
    parsed_content=parse_fn(reply_content) if callable(parse_fn) else (clean_meeting_novel_text(reply_content) if req_mode=='meeting' else (' / '.join(split_chat_bubbles(reply_content)) if req_mode=='chat' else reply_content))
    trunc_warn=''
    if is_truncated:
        trunc_warn=f"模型因达到 max_tokens ({max_tok}) 上限被截断（finish_reason={finish_reason}）。建议在「终端 -> 连接与模型」中调高 Max tokens。"
    record_system_log({
        'profile_id':(meta.get('profile') or {}).get('id',''),
        'profile_name':(meta.get('profile') or {}).get('name',''),
        'character_id':(meta.get('character') or {}).get('id',''),
        'character_name':(meta.get('character') or {}).get('name',''),
        'mode':req_mode,
        'task_id':task_id,
        'retry_of_task_id':retry_of_task_id,
        'attempt':attempt,
        'entry_point':meta.get('entryPoint',req_mode),
        'simulated_reply_at':meta.get('simulated_reply_at',''),
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
    return reply_content

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

def needs_meeting_detail(text):
    """Detail recall is opt-in, not a 3k-character transcript on every SMS."""
    body=str(text or '')
    past=re.search(r'上次|上回|那次|那天|那晚|那会儿|当时|见面时|约会时|那下午|那时候|还记得|你记得|我记得|我们之前|昨天我们|那一晚',body)
    specific=re.search(r'具体|细节|说了什么|说过什么|怎么做|怎么回事|为什么|哪里|哪个|什么时候|如何|睡|醒|吻|亲|抱|当时|那会儿|发生|去了|做的时候',body)
    return bool((past and specific) or re.search(r'做的时候|睡着的时候|醒来的时候|我们在床上|在一起的那天下午',body))

def recent_actual_meeting_context(db,p,c,query='',at=0):
    """A recent real encounter is continuity, even when the next SMS changes topic.
    These are attributed archive excerpts, not a guessed summary or another role's data.
    """
    now=datetime.fromtimestamp(at/1000,timezone.utc) if at else datetime.now(timezone.utc)
    rows=db.execute('SELECT * FROM meetings WHERE profile_id=? AND character_id=? ORDER BY ended_at DESC LIMIT 8',(p['id'],c['id'])).fetchall()
    state=MEETING_STATE.get((p['id'],c['id']),{})
    rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()
    active=state.get('active_meeting_id') if rel and rel['mode']=='meeting' else ''
    candidates=[]
    for row in rows:
        if row['id']==active:continue
        try:
            ended=datetime.fromisoformat(str(row['ended_at']).replace('Z','+00:00'))
            if ended.tzinfo is None:ended=ended.replace(tzinfo=timezone.utc)
            if (now-ended).total_seconds()>=0:candidates.append(dict(row))
        except (ValueError,TypeError,OverflowError):continue
    if not candidates:return ''
    detail=needs_meeting_detail(query)
    terms=[t for t in extract_query_terms(query) if len(str(t))>=2]
    if detail and len(candidates)>1:
        candidates.sort(key=lambda m:sum(1 for t in terms if str(t).lower() in (str(m.get('ai_summary') or '')+' '+str(m.get('summary') or '')+' '+str(m.get('entries') or '')).lower()),reverse=True)
    meeting=candidates[0]
    summary=str(meeting.get('ai_summary') or meeting.get('summary') or '').strip()[:500]
    overview=("\n\n【过去真实见面的事实小结 · 默认记忆】\n"
              +str(meeting.get('started_at',''))[:16]+" 至 "+str(meeting.get('ended_at',''))[:16]
              +"，与 "+p['name']+" 的这场见面："+(summary or '见面原文已归档，小结等待重建。')
              +"\n这是已发生的经历，原定计划不等于实际完成；无法从小结确认的具体细节不能编造。"
              +"只有有必要提及具体现场细节时才参考下列可核对的原文。")
    if not detail:return overview
    entries=[e for e in parse_json(meeting.get('entries'),[]) if isinstance(e,dict) and e.get('sender') in ('user','ai')
        and str(e.get('text') or '').strip() and not (e['sender']=='user' and re.search(r'心想|心里|内心独白|默念|梦见|如果|假如',str(e['text'])))]
    if not entries:return overview
    terms=[t for t in extract_query_terms(query) if len(str(t))>=2]
    salient=re.compile(r'本来|原本|没(?:有)?(?:去|看|做)|没有|后来|随后|最终|最后|决定|离开|送.{0,14}(?:到|回|去)|接.{0,12}(?:到|回)|下车|车门|抵达|到达|相拥|拥抱|抱着|睡着|睡了|亲吻|接吻|亲密|亲了|吻痕|衣服|外套|生气|吃醋|告别|再见')
    n=len(entries)
    anchors={0,n//4,n//2,n*3//4,max(0,n-3),max(0,n-2),n-1}
    candidates=[]
    for i,e in enumerate(entries):
        body=str(e['text'])
        hits=sum(1 for t in terms if str(t).lower() in body.lower())
        candidates.append((hits*7+(5 if salient.search(body) else 0)+(1 if e['sender']=='user' else 0),i))
    # Keep real, high-impact encounter events even when repeated flirtation or
    # closing dialogue would otherwise crowd them out of the excerpt budget.
    # These are still attributed original lines, never invented summary facts.
    milestone_patterns=(
        re.compile(r'睡着|睡了|睡醒|醒来|午睡|入睡|相拥而眠|睡过去'),
        re.compile(r'没有(?:去|看|做)|没(?:去|看|做)|取消|改成|改为'),
        re.compile(r'回家|到家|家里|卧室|床上'),
        re.compile(r'下车|送.{0,12}(?:到|回)|告别|再见'),
    )
    focused={}
    for pattern in milestone_patterns:
        matches=[(score,i) for score,i in candidates if pattern.search(str(entries[i]['text']))]
        if matches:
            _,idx=max(matches)
            anchors.add(idx)
            focused[idx]=pattern
    for score,i in sorted(candidates,key=lambda x:(x[0],x[1]),reverse=True):
        if len(anchors)>=13:break
        if score>0:anchors.add(i)
    parts=[];used=0
    for i in sorted(anchors):
        e=entries[i]
        whole=re.sub(r'\s+',' ',str(e['text'])).strip()
        focus=focused[i].search(whole) if i in focused else None
        if len(whole)>205 and focus:
            start=max(0,min(focus.start()-90,len(whole)-205))
            excerpt=('… ' if start else '')+whole[start:start+205]+(' …' if start+205<len(whole) else '')
        else:
            excerpt=whole[:115]+' … '+whole[-85:] if len(whole)>205 else whole
        line=f"[{p['name'] if e['sender']=='user' else c['name']} · 现场原文 #{i+1}] {excerpt}"
        if used+len(line)>3400:continue
        used+=len(line);parts.append(line)
    if not parts:return overview
    return (overview+"\n\n【最近一次真实线下见面 · 有来源的原文节选】\n以下只属于你与 "+p['name']+
        " 的这一场见面，不属于任何其他角色实例；发生时间 "+str(meeting.get('started_at',''))[:16]+" 至 "+str(meeting.get('ended_at',''))[:16]+"。\n"+
        "\n".join(parts)+
        "\n以上是节选而非完整情节；见面前约定看电影、吃饭、接送等不证明最后真的完成。"
        "若原文发生的行动与旧计划或监控草案冲突，以已经发生的现场行为为准；不要虚构电影、餐食、旅程或否定对方共同亲历的事情。"
        "见面发生的这段时间不能被描述成角色一整天都在巡逻、值班、开车或完成其他无记录的事务；未被证实的生活安排保持未知。"
        "私人内心不可当作角色亲眼所见；没有展示的情节保持不确定。")

def incompatible_character_slot(c,slot):
    if not c or not slot:return False
    body=' '.join(str(slot.get(key) or '') for key in ('location','status','activity','scene'))
    return c.get('id')=='re-game:leon:re2' and bool(re.search(r'\bDSO\b|特工|联邦调查|华盛顿特区|安全公寓|防窃听|总统护卫|加密终端|政府机密',body,re.I))

def verified_surveillance_slot(c,slot):
    if not incompatible_character_slot(c,slot):return slot
    return dict(slot,location='地点未确认',status='日程待核实',activity='原日程与本角色时期冲突，不作为已发生事实',
        scene=c['name']+'的此时位置尚无有效证据。',source='unverified')

def compile_messages(db,p,c,mode='chat',latest=None,through_rowid=None,pending_ids=None,trigger_opening=False,is_continue=False,exclude_ids=None,simulated_at=0):
    ordered=[preset_row_dict(r) for r in db.execute('SELECT * FROM presets WHERE mode=? AND enabled=1 ORDER BY sort_order,id',(mode,)).fetchall()]
    macros=lambda t:expand_preset_macros(t,p,c)
    core_presets=[x for x in ordered if x['role']=='system' and not is_post_history_system_preset(x)] if mode=='meeting' else [x for x in ordered if x['role']=='system']
    post_presets=[x for x in ordered if is_post_history_system_preset(x) or x['role']!='system'] if mode=='meeting' else [x for x in ordered if x['role']!='system']
    core_sys_parts=[macros(x['content']) for x in core_presets]
    working_history=[] if (mode=='meeting' and trigger_opening) else select_working_history(db,p['id'],c['id'],mode=mode,through_rowid=through_rowid,exclude_ids=exclude_ids,protected_ids=pending_ids)
    working_ids={m['id'] for m in working_history}
    ensure_daily_summaries(db,p,c,working_ids)
    query_seed=latest or ' '.join(str(m['text'] or '').strip() for m in working_history[-3:] if m['sender']=='user') or (' '.join((str(m['text'] or '').strip() if m['sender']=='user' else clean_chat_bubble_text(m['text'])) for m in working_history[-2:]))
    recalled=retrieve_relevant_memories(db,p['id'],c['id'],query_text=query_seed,exclude_msg_ids=working_ids,limit=4,max_chars=1200,as_of=simulated_at)
    if mode=='meeting':recalled=[x for x in recalled if x['source_type']!='meeting_checkpoint']
    rel_summary=relationship_baseline_summary(db,p['id'],c['id'],p['name'])
    cur_surv=get_current_surveillance_slot(db,p,c,simulated_at)
    interests_str='、'.join(p.get('interests') or []) or '未填写'
    intent_str=p.get('intent') or '未填写'
    system='''你正在扮演一个真实存在于其原作时间线中的虚构角色。不得跳出角色解释自己是语言模型。记忆严格按当前角色 ID 与当前聊天对象隔离，绝不混入其他人物或其他 Profile 的经历。区分“系统已确认事实”与“对方在对话中的主观陈述”，不因对方随口一句话而篡改你的原作设定。\n'''
    system+='现实日历日期仅用于应用调度与记录；原作时期、人物年龄、历史事件与技术水平保持对应版本，不因现实年份改变。\n'
    if mode=='meeting':
        system+=f"【第一层 · 身份记忆 (Identity Memory)】\n你的身份：{c['name']}（角色ID：{c['id']}）。原作/连续性：{c['source']}。时间线：{c['version']}。已确认背景：{c['canon']}。\n"
        system+=f"当前互动对象 Profile：姓名 {p['name']}，年龄 {p['age']}，性别 {p['gender']}，交友目的：{intent_str}，兴趣爱好：{interests_str}；公开自述：{p['bio']}。"
    else:
        profile_meta='，'.join(x for x in [
            p['name'],
            f"{p['age']}岁" if p.get('age') else '',
            f"性别{p['gender']}" if p.get('gender') else '',
            f"交友目的：{p['intent']}" if p.get('intent') else '',
            f"兴趣：{'、'.join(p['interests'])}" if p.get('interests') else '',
            f"简介：{p['bio']}" if p.get('bio') else ''
        ] if x)
        system+=f"【第一层 · 身份记忆 (Identity Memory)】\n你的身份：{c['name']}（原作：{c['source']} · {c['version']}）。背景设定：{c['canon']}\n"
        system+=f"当前聊天对象资料：{profile_meta}。（注：若对方在下方实时聊天中重新做了自我介绍或使用英文/其他语言对话，请优先顺应对方在当前聊天中的自称、话题与语言。）"
    if p['role_character_id'] in BY_ID:
        role=BY_ID[p['role_character_id']]
        system+=f"\n对方扮演的原作人物：{role['name']}，{role['version']}，{role['canon']}。"
    elif p['role_hint']:system+=f"\n对方提供的扮演身份说明（未经自动验证）：{p['role_hint'][:240]}。"
    system+=f"\n\n【第二层 · 关系记忆基线 (Relationship Memory)】\n{rel_summary}"
    if mode=='chat':
        total_msgs=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=?',(p['id'],c['id'])).fetchone()[0]
        if '再次重逢' in rel_summary:
            system+="\n关系阶段提示：你们曾解除匹配后重新匹配，你清楚记得过往相处经历，不必装作初次认识。"
        elif total_msgs<=8:
            system+="\n关系阶段提示：你们刚通过交友软件匹配不久，请保持角色自然的社交边界、幽默感或分寸，不要过度自来熟，也不要像客服一样生硬盘问或长篇解释个人设定。"
    if mode=='meeting' and cur_surv:
        system+=f"\n\n【此刻你的真实位置与状态（实时监控同步）】\n当前时段：{cur_surv['start']}–{cur_surv['end']}｜你所在地点：{cur_surv['location']}｜状态：{cur_surv['status']}｜正在做的事：{cur_surv['activity']}。当对方问你在哪、在干什么或提出见面时，请自然地与你此刻的真实位置和状态保持一致。"
    if mode=='chat':system+=recent_actual_meeting_context(db,p,c,query_seed,simulated_at)
    if recalled:
        system+="\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n"+"\n".join(format_episodic_entry(e) for e in recalled)
    else:
        system+="\n\n【第三层 · 按需检索命中的过往记忆 (Retrieved Episodic Memories)】\n"+("（当前话题未触发额外远期档案，仅依靠下方今日活跃上下文连贯交流）" if mode=='meeting' else "（无额外远期档案命中，请直接聚焦下方当前聊天。）")
    if mode=='meeting':
        active_mid=MEETING_STATE.get((p['id'],c['id']),{}).get('active_meeting_id','')
        if active_mid:system+=meeting_checkpoint_prompt_context(db,p,c,active_mid,query_seed)
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
            t_tag=chat_clock_label(msg.get('created_at')) if mode=='chat' else (fmt_hhmm(msg.get('created_at')) or '--:--')
            m_label='线下见面' if msg['mode']=='meeting' else '线上短信'
            who=c['name'] if msg['sender']=='ai' else p['name']
            timeline_lines.append(f"#{idx+1} {t_tag}（{m_label}·{who}）")
            clean_body=str(msg.get('text','')) if msg['sender']=='user' else (clean_meeting_novel_text(msg['text']) if msg['mode']=='meeting' else (clean_chat_bubble_text(msg['text']) or '…'))
            quote=parse_json(msg.get('quote_json'),None)
            if isinstance(quote,dict) and msg['mode']=='chat':
                who='自己' if quote.get('sender')=='user' else '对方'
                clean_body='[引用'+who+'的消息：「'+str(quote.get('text') or '')[:220]+'」]\n'+clean_body
            history_turns.append({'role':role,'content':clean_body})
    if timeline_lines:
        system+="\n\n【近期活跃对话时间与模式索引（系统元数据，仅供把握时间跨度与场景，严禁在回复正文中输出时间或模式前缀）】\n"+" ｜ ".join(timeline_lines)
    if core_sys_parts:system+='\n\n'+'\n\n'.join(core_sys_parts)
    if mode=='meeting':
        messages=[{'role':'system','content':system}]
        m_state=MEETING_STATE.get((p['id'],c['id']),{})
        meet_loc=(cur_surv and cur_surv.get('location')) or infer_meeting_location(db,p['id'],c['id'],m_state.get('meeting_location',''))
        has_trailing_user=(len(history_turns)>0 and history_turns[-1]['role']=='user' and not trigger_opening and not is_continue)
        prior_turns=history_turns[:-1] if has_trailing_user else history_turns
        final_user_turn=history_turns[-1] if has_trailing_user else None
        messages.extend(prior_turns)
        post_sys_parts=[macros(x['content']) for x in post_presets if x['role']=='system']
        non_sys_post_presets=[x for x in post_presets if x['role']!='system']
        meeting_state_line=f"【第四层 · 当前状态 (Current State)】角色最近经现场实际行动确认的地点为「{meet_loc}」，这是此前的事实锚点而非固定舞台。若本轮实际移至新地点，按物理过程继续，后续监控将以新地点为准；绝不能因为提议、路过提及或计划前往就当作已经到达。任何旧行程或旧地名都不可覆盖更新的现场行动。请严格遵循上方导入的面对面小说预设中的文风、叙事视角、人物边界、篇幅区间与创作铁律，不要替 {p['name']} 说话、行动或决定内心感受，不要在正文开头添加任何时间或模式标签，直接输出小说正文。"
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
    batch_hint=''
    if mode=='chat' and pending_ids and len(pending_ids)>1:
        bundled_rows=[]
        for mid in pending_ids:
            row=db.execute('SELECT id,sender,text,created_at FROM messages WHERE id=?',(mid,)).fetchone()
            if row:bundled_rows.append(dict(row))
        if len(bundled_rows)>1:
            recent=now_ms()-int(datetime.fromisoformat(bundled_rows[0]['created_at'].replace('Z','+00:00')).timestamp()*1000)<3600000
            batch_hint=f"\n【连续消息提示】对方{'刚刚连续发来了' if recent else '此前陆续发来了'}最后 {len(bundled_rows)} 条消息（见下方对话末尾）。你现在拿起手机一并读完，请把握这几条消息之间的递进关系、调侃或话锋转折，像真人聊天一样自然连贯地回应整体意思，不必逐条机械拆解作答。"
    wake_hint='原日程为睡眠，但你正在阅读并准备发送手机消息，应视作已暂时醒来；不要声称自己仍在熟睡。' if is_sleeping_slot(cur_surv) else ''
    surv_hint=f"\n【个人日程草案（不是已发生的事实）】可参考：「{cur_surv['location']}」·「{cur_surv['activity']}」。{wake_hint}如果与真实见面原文或实际行动冲突，必须以亲历现场为准；不得把预定行程当作已经完成的生活经历。" if cur_surv and cur_surv.get('source')!='unverified' else ''
    conn_cfg=load_connection()
    lang_hint='\n'+build_character_language_directive(conn_cfg.get('character_language_pref','natural'),conn_cfg.get('character_language_custom',''))
    system+='\n\n【第四层 · 当前状态 (Current State)】当前必须以真实约会 App 手机聊天气泡发出回复，不写旁白，不要在正文开头添加任何时间或模式标签。紧扣对方刚刚发来的话自然接招（对方用英文则用英文回复，对方开玩笑、吐槽或换话题则以符合角色性格的方式自然互动，不必每轮结尾都强行提问）。像真人聊天一样时长时短：有时只发 1 条简短气泡，有时可分 2–4 条长短交替的气泡连续发出（多条气泡之间用换行符或 ||| 分隔）。'+surv_hint+batch_hint+lang_hint
    # Place temporal truth last among chat system rules; user/assistant messages stay unmodified.
    system+='\n'+chat_clock_context(working_history,datetime.fromtimestamp(simulated_at/1000).astimezone() if simulated_at else None)
    messages=[{'role':'system','content':system}]
    for x in post_presets:
        messages.append({'role':x['role'],'content':macros(x['content'])})
    messages.extend(history_turns)
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
            raw=completion(prompt,log_meta={'mode':'chat','task_type':'match','entryPoint':'first-message','profile':p,'character':c})
            return split_chat_bubbles(raw),'live'
        except Exception:
            return [],'error'
    demo_txt=f"{p['name']}，没想到这么快又刷到你了。|||又见面了……上次的事我没有忘。" if again else f"Hey，{p['name']}。|||看来我们匹配上了。"
    return split_chat_bubbles(demo_txt),'demo'

def match_decision(db,p,c,attempt):
    settings=load_connection()
    if all(settings.get(k) for k in ('base_url','api_key','model')):
        try:
            interests_str='、'.join(p.get('interests') or []) or '未填写'
            intent_str=p.get('intent') or '未填写'
            prompt=[{'role':'system','content':f"你是 {c['name']}，来自 {c['source']} {c['version']}。设定：{c['canon']}。使用约会 App 时，对方 {p['name']}，{p['age']} 岁，交友目的：{intent_str}，兴趣爱好：{interests_str}，简介：{p['bio']}。你可以自由决定是否右滑匹配，不要默认喜欢每个人。只返回JSON对象 {{\"match\":true/false}}。"},{'role':'user','content':'你会匹配吗？'}]
            result=completion(prompt,json_mode=True,log_meta={'mode':'match','entryPoint':'match_decision','profile':p,'character':c})
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
        out=completion([{'role':'system','content':rules},{'role':'user','content':js(compact)}],json_mode=True,log_meta={'mode':'bio','entryPoint':'discover_bios'})
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
                        last_rows=db.execute('SELECT id,text,sender,mode,engine,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY julianday(created_at) DESC,rowid DESC',(p['id'],c['id']))
                        last=next((dict(x) for x in last_rows if not _is_chat_artifact(dict(x))),None)
                        incoming_rows=db.execute("SELECT id,text,sender,mode,engine,created_at FROM messages WHERE profile_id=? AND character_id=? AND sender='ai' AND engine NOT IN ('error','recalled') ORDER BY julianday(created_at) DESC,rowid DESC",(p['id'],c['id']))
                        last_incoming=next((dict(x) for x in incoming_rows if not _is_chat_artifact(dict(x))),None)
                        m_state=MEETING_STATE.get((p['id'],c['id']),{})
                        nick=str(m_state.get('nickname','')).strip()
                        cv=char_view(db,c)|{'nickname':nick,'display_name':nick or c['name']}
                        threads.append({'character':cv,'relation':dict(r)|{'hot_chat':bool(m_state.get('hot_chat',False)),'nickname':nick},'last':last,'last_incoming':last_incoming,'queue':queue_view(db,p['id'],c['id']),'taskState':get_task_state(p['id'],c['id'],r['mode'])})
                    return self.respond({'threads':threads})
                if route=='/api/thread':
                    p=profile_get(db,arg('profileId'));cid=arg('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    rel=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if not rel or rel['status']!='matched':raise ValueError('尚未匹配或已解除匹配')
                    msgs,meetings=ensure_meeting_records(db,p,c)
                    msgs=[dict(m,quote=parse_json(m.get('quote_json'),None)) for m in msgs]
                    db.commit()
                    m_state=MEETING_STATE.get((p['id'],cid),{})
                    nick=str(m_state.get('nickname','')).strip()
                    cv=char_view(db,c)|{'nickname':nick,'display_name':nick or c['name']}
                    diary_p=build_diary_payload(db,p,c)
                    translations=get_matched_translations_for_thread(db,p['id'],cid,msgs)
                    rel_dict=dict(rel)|{'active_meeting_id':m_state.get('active_meeting_id',''),'meeting_started_at':m_state.get('meeting_started_at',''),'meeting_location':m_state.get('meeting_location',''),'hot_chat':bool(m_state.get('hot_chat',False)),'nickname':nick}
                    return self.respond({'character':cv,'profile':p,'relation':rel_dict,'messages':msgs,'translations':translations,'meetings':meetings,'surveillance':build_surveillance_payload(db,p,c),'diarySummary':{'latestDate':diary_p['latestDate'],'availableDates':diary_p['availableDates'],'latestTitle':diary_p['diary'].get('title','')},'queue':queue_view(db,p['id'],cid),'taskState':get_task_state(p['id'],cid,rel['mode'])})
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
                if route=='/api/meeting-summary-refresh':
                    p=profile_get(db,data.get('profileId'))
                    cid=str(data.get('characterId') or '')
                    c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    meeting_id=str(data.get('meetingId') or '')
                    rec=db.execute('SELECT * FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(meeting_id,p['id'],cid)).fetchone()
                    if not rec:raise ValueError('未找到当前角色的见面记录')
                    wanted=set(parse_json(rec['message_ids'],[]))
                    all_rows=db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting' ORDER BY rowid",(p['id'],cid)).fetchall()
                    m_msgs=[dict(row) for row in all_rows if row['id'] in wanted]
                    if not m_msgs:raise ValueError('原始见面记录不可用，无法重新整理')
                    original=[(m['id'],m['text']) for m in m_msgs]
                    summary=summarize_complete_meeting(p,c,m_msgs,rec['location'] or '')
                    after=db.execute('SELECT * FROM messages WHERE profile_id=? AND character_id=? AND mode=? ORDER BY rowid',(p['id'],cid,'meeting')).fetchall()
                    latest=[dict(row) for row in after if row['id'] in wanted]
                    if [(m['id'],m['text']) for m in latest]!=original:
                        raise ValueError('整理期间原始见面记录变化，未覆盖旧梗概')
                    updated=upsert_meeting_record(db,p,c,meeting_id,latest,rec['location'] or '',summary['summary'])
                    db.commit()
                    return self.respond({'ok':True,'meetingRecord':updated})
                if route=='/api/task-state':
                    pid=arg('profileId').strip();cid=arg('characterId').strip();mode=arg('mode').strip() or 'chat'
                    return self.respond({'taskState':get_task_state(pid,cid,mode),'queue':queue_view(db,pid,cid) if (pid and cid) else None})
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
                                txt=completion(ms,log_meta={'mode':'chat','entryPoint':'chat_proactive','profile':p,'character':c});engine='live'
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
                    # Reject automatic transitions from cached legacy clients.
                    if 'autoArrivalId' in data:return self.respond({'mode':r['mode'],'autoRejected':True})
                    loc_input=str(data.get('location') or data.get('meetingLocation') or '').strip()[:40]
                    if mode=='meeting' and loc_input and r['mode']=='meeting' and m_state.get('active_meeting_id'):
                        if m_state.get('meeting_location')!=loc_input:
                            m_state.setdefault('meeting_location_history',[]).append({'at':utc(),'location':loc_input,'source':'manual'})
                        m_state['meeting_location']=loc_input
                    meeting_record=None;opening_reply=None;warning=''
                    if r['mode']!=mode:
                        with CHAT_LOCK:queue_cancel(db,p['id'],cid)
                        if mode=='meeting':
                            inferred_location=infer_meeting_location(db,p['id'],cid,loc_input)
                            db.execute('UPDATE relations SET mode=?,updated_at=? WHERE profile_id=? AND character_id=?',(mode,utc(),p['id'],cid))
                            resume_mid=str(data.get('resumeMeetingId') or '').strip()
                            prior=db.execute('SELECT * FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(resume_mid,p['id'],cid)).fetchone() if resume_mid else None
                            if resume_mid and not prior:raise ValueError('未找到原来的见面记录')
                            if resume_mid:
                                found=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=? AND mode=? AND meeting_id=?',(p['id'],cid,'meeting',resume_mid)).fetchone()[0]
                                if not found:
                                    ensure_meeting_records(db,p,c)
                                    found=db.execute('SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=? AND mode=? AND meeting_id=?',(p['id'],cid,'meeting',resume_mid)).fetchone()[0]
                                if not found:raise ValueError('旧见面原文已不存在')
                            max_row=db.execute('SELECT COALESCE(MAX(rowid),0) FROM messages WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()[0]
                            m_state['started_after_rowid']=int(max_row or 0)
                            m_state['active_meeting_id']=resume_mid or ('meet_'+uid())
                            m_state['meeting_started_at']=(prior['started_at'] if prior else utc())
                            stored_history=parse_json(prior['location_history'],[]) if prior else []
                            latest_scene=''
                            if resume_mid:
                                history=db.execute("SELECT sender,text FROM messages WHERE profile_id=? AND character_id=? AND mode='meeting' AND meeting_id=? ORDER BY rowid DESC LIMIT 50",(p['id'],cid,resume_mid)).fetchall()
                                for msg in history:
                                    if msg['sender']=='user':
                                        latest_scene=meeting_place_in_player_turn(msg['text'],p['name'])
                                        if latest_scene:break
                            saved_last=stored_history[-1].get('location') if stored_history else ''
                            m_state['meeting_location']=loc_input or saved_last or latest_scene or (prior['location'] if prior else inferred_location)
                            # Restore the archived meeting's own state, not the monitor's
                            # current schedule or another meeting's last known location.
                            original=stored_history[0].get('location') if stored_history else (prior['location'] if prior else inferred_location)
                            m_state['meeting_location_history']=stored_history or [{'at':m_state['meeting_started_at'],'location':original,'source':'start'}]
                            if resume_mid:
                                m_state['meeting_location_history'].append({'at':utc(),'location':m_state['meeting_location'],'source':'resume'})
                            if prior:
                                db.execute('UPDATE meetings SET ai_summary=? WHERE id=?',('',resume_mid))
                                db.execute('DELETE FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_key=?',(cid,p['id'],'meeting:'+resume_mid))
                            if resume_mid:
                                rec=get_or_init_surveillance(db,p,c)
                                rec['slots']=[x for x in rec['slots'] if not (x.get('source')=='meeting_shift' and x.get('meeting_id')==resume_mid)]
                                for key in ('post_meeting_anchor','post_meeting_location','post_meeting_id'):rec.pop(key,None)
                            sync_surveillance_on_meeting_start(db,p,c,m_state['meeting_location'],m_state['active_meeting_id'])
                            if not resume_mid:log_event(db,p['id'],cid,'meeting','与 '+p['name']+' 在线下见面')
                            api_error=None
                            if not resume_mid and data.get('triggerOpening') is True and public_connection()['mode']!='normal':
                                engine='demo';settings=load_connection();reply_txt=''
                                if all(settings.get(k) for k in ('base_url','api_key','model')):
                                    try:
                                        reply_txt=clean_meeting_novel_text(completion(compile_messages(db,p,c,'meeting',trigger_opening=True),log_meta={'mode':'meeting','task_type':'meeting','entryPoint':'meeting-opening','profile':p,'character':c,'parseFn':clean_meeting_novel_text}))
                                        engine='live'
                                    except Exception as e:
                                        warning=str(e);engine='error';api_error=getattr(e,'api_error',None)
                                else:reply_txt=clean_meeting_novel_text(demo_text(db,p,c,'meeting'))
                                if engine!='error' and reply_txt:
                                    opening_reply=write_message(db,p['id'],cid,'ai','meeting',reply_txt,engine)
                                    log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+reply_txt[:180])
                                    meeting_record=upsert_meeting_record(db,p,c,m_state['active_meeting_id'],[opening_reply],m_state['meeting_location'])
                        else:
                            started_after=m_state.get('started_after_rowid')
                            all_rows=db.execute('SELECT rowid,* FROM messages WHERE profile_id=? AND character_id=? ORDER BY rowid',(p['id'],cid)).fetchall()
                            m_msgs=[]
                            active_id=m_state.get('active_meeting_id','')
                            if active_id:
                                m_msgs=[dict(row) for row in all_rows if row['mode']=='meeting' and row['meeting_id']==active_id]
                            elif started_after is not None:
                                m_msgs=[dict(row) for row in all_rows if row['mode']=='meeting' and int(row['rowid'])>int(started_after)]
                            else:
                                for row in reversed(all_rows):
                                    if row['mode']=='meeting':m_msgs.insert(0,dict(row))
                                    else:break
                            if m_msgs:
                                mid=m_state.get('active_meeting_id') or ('meet_'+m_msgs[0]['id'])
                                ai_sum='';ai_loc=m_state.get('meeting_location','') # ignore stale location from legacy finale clients
                                if data.get('finalizeMeeting') is True and public_connection()['mode']=='live':
                                    try:
                                        parsed=summarize_complete_meeting(p,c,m_msgs,ai_loc,db=db)
                                        if parsed and parsed.get('summary'):ai_sum=str(parsed['summary']).strip()[:320]
                                    except Exception:pass
                                meeting_record=upsert_meeting_record(db,p,c,mid,m_msgs,ai_loc,ai_sum)
                                if meeting_record:
                                    # The meeting ends at the actual mode switch, not at the last typed message.
                                    ended_actual=utc()
                                    meeting_record['ended_at']=ended_actual
                                    db.execute('UPDATE meetings SET ended_at=? WHERE id=?',(ended_actual,meeting_record['id']))
                                    sync_surveillance_on_meeting_end(db,p,c,meeting_record)
                            db.execute('UPDATE relations SET mode=?,updated_at=? WHERE profile_id=? AND character_id=?',(mode,utc(),p['id'],cid))
                            m_state['active_meeting_id']=''
                            m_state.pop('meeting_started_at',None)
                            m_state.pop('started_after_rowid',None)
                            log_event(db,p['id'],cid,'return','与 '+p['name']+' 返回手机消息')
                            if meeting_record:
                                replan_remaining_day_after_meeting(db,p,c,meeting_record)
                    elif mode=='meeting':
                        if loc_input:
                            sync_surveillance_on_meeting_start(db,p,c,loc_input,m_state.get('active_meeting_id',''))
                        _,meetings=ensure_meeting_records(db,p,c)
                        if meetings:meeting_record=meetings[-1]
                    db.commit()
                    return self.respond({'mode':mode,'meetingId':m_state.get('active_meeting_id',''),'active_meeting_id':m_state.get('active_meeting_id',''),'location':m_state.get('meeting_location',''),'meeting_location':m_state.get('meeting_location',''),'meetingRecord':meeting_record,'openingReply':opening_reply,'surveillance':build_surveillance_payload(db,p,c),'warning':warning,'apiError':locals().get('api_error')})
                if route=='/api/task-state':
                    pid=str(data.get('profileId',''))
                    cid=str(data.get('characterId',''))
                    t_type=str(data.get('taskType','chat'))
                    return self.respond({'taskState':get_task_state(pid,cid,t_type),'queue':queue_view(db,pid,cid) if (pid and cid) else None})
                if route=='/api/task-action':
                    p=profile_get(db,data.get('profileId'));cid=str(data.get('characterId',''));c=BY_ID.get(cid)
                    act=str(data.get('action',''))
                    t_type=str(data.get('mode') or data.get('taskType') or 'chat')
                    if t_type.startswith('meeting'):t_type='meeting'
                    elif t_type.startswith('chat'):t_type='chat'
                    t_state=get_task_state(p['id'],cid,t_type)
                    if act=='pause':
                        t_state['paused']=True
                        t_state['status']='paused'
                        t_state['updated_at']=utc()
                        with CHAT_LOCK:
                            row=db.execute('SELECT pending,inflight_sources FROM chat_queue WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                            pending=list(dict.fromkeys(parse_json(row['inflight_sources'],[])+parse_json(row['pending'],[]))) if row else []
                            db.execute("UPDATE chat_queue SET pending=?,status='idle',inflight='',inflight_sources='[]',blocked=1,recovery_kind='user',revision=revision+1 WHERE profile_id=? AND character_id=?",(js(pending),p['id'],cid))
                            db.commit()
                        return self.respond({'ok':True,'paused':True,'taskState':t_state,'queue':queue_view(db,p['id'],cid) if c else None})
                    if act in ('clear','dismiss-bg'):
                        clear_task_state(p['id'],cid,t_type)
                        with CHAT_LOCK:
                            db.execute("UPDATE chat_queue SET blocked=0,recovery_kind='' WHERE profile_id=? AND character_id=?",(p['id'],cid))
                            db.commit()
                        return self.respond({'ok':True,'taskState':None,'queue':queue_view(db,p['id'],cid) if c else None})
                    if act in ('resume','retry'):
                        t_state['paused']=False
                        t_state['status']='idle'
                        t_state['updated_at']=utc()
                        if t_type=='chat' and c:
                            qv=queue_view(db,p['id'],cid)
                            if qv['count']>0:
                                return self.respond(queue_flush(db,p,c,force=True,manual_resume=True)|{'taskState':get_task_state(p['id'],cid,'chat')})
                        return self.respond({'ok':True,'paused':False,'taskState':t_state,'queue':queue_view(db,p['id'],cid) if c else None})
                    raise ValueError('未知的任务控制动作')
                if route=='/api/chat-flush':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId')
                    if not cid:
                        return self.respond(queue_flush_due(db,p))
                    c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT status,mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if not r or r['status']!='matched' or r['mode']!='chat':raise ValueError('当前不是手机聊天模式')
                    return self.respond(queue_flush(db,p,c,force=data.get('force') is True,manual_resume=data.get('manualResume') is True))
                if route=='/api/chat-recover':return self.respond(recover_due_queues(db,data))
                if route=='/api/chat-flush-due':
                    p=profile_get(db,data.get('profileId'))
                    return self.respond(queue_flush_due(db,p))
                if route=='/api/message-forget':
                    p=profile_get(db,data.get('profileId'));cid=str(data.get('characterId') or '');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    msg_id=str(data.get('messageId') or '')
                    row=db.execute('SELECT * FROM messages WHERE id=? AND profile_id=? AND character_id=?',(msg_id,p['id'],cid)).fetchone()
                    if not row:raise ValueError('消息不存在')
                    if get_task_state(p['id'],cid,'meeting').get('status')=='inflight' or get_task_state(p['id'],cid,'chat').get('status')=='inflight':raise ValueError('请等待当前回复完成后再删除')
                    result=forget_thread_messages(db,p,c,[msg_id])
                    db.commit()
                    return self.respond({'ok':True}|result)
                if route=='/api/meeting-forget':
                    p=profile_get(db,data.get('profileId'));cid=str(data.get('characterId') or '');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    mid=str(data.get('meetingId') or '')
                    record=db.execute('SELECT * FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],cid)).fetchone()
                    if not record:raise ValueError('见面不存在')
                    rel=db.execute('SELECT mode FROM relations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchone()
                    if rel and rel['mode']=='meeting' and MEETING_STATE.get((p['id'],cid),{}).get('active_meeting_id')==mid:raise ValueError('不能删除正在进行的整场见面')
                    ids=parse_json(record['message_ids'],[])
                    result=forget_thread_messages(db,p,c,ids,[mid])
                    db.execute('DELETE FROM meetings WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],cid))
                    db.execute('DELETE FROM episodic_memories WHERE owner_id=? AND profile_id=? AND source_key=?',(cid,p['id'],'meeting:'+mid))
                    db.commit()
                    return self.respond({'ok':True}|result)
                if route=='/api/message-delete':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');mid=str(data.get('messageId',''))
                    if not mid:raise ValueError('缺少消息 ID')
                    target=db.execute('SELECT sender FROM messages WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],cid)).fetchone()
                    if not target:raise ValueError('消息不存在')
                    if target['sender']!='user':raise ValueError('只能撤回自己发送的消息')
                    recalled_text='[系统提示：对方撤回了一条消息（你没有看清具体内容）]'
                    db.execute("UPDATE messages SET text=?,engine='recalled' WHERE id=? AND profile_id=? AND character_id=?",(recalled_text,mid,p['id'],cid))
                    for ref in db.execute("SELECT id,quote_json FROM messages WHERE profile_id=? AND character_id=? AND quote_json!=''",(p['id'],cid)):
                        if (parse_json(ref['quote_json'],{}) or {}).get('id')==mid:db.execute("UPDATE messages SET quote_json='' WHERE id=?",(ref['id'],))
                    invalidate_translation(db,mid)
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
                if route=='/api/message-edit':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');mid=str(data.get('messageId') or '').strip()
                    raw_txt=str(data.get('text') or '').strip()
                    if not mid:raise ValueError('缺少消息 ID')
                    if not raw_txt or len(raw_txt)>4000:raise ValueError('消息请控制在 1–4000 字')
                    row=db.execute('SELECT * FROM messages WHERE id=? AND profile_id=? AND character_id=?',(mid,p['id'],cid)).fetchone()
                    if not row:raise ValueError('消息不存在')
                    if row['engine']=='recalled':raise ValueError('已撤回的消息无法编辑')
                    if row['mode']!='chat':raise ValueError('仅支持编辑手机聊天消息')
                    next_txt=(clean_chat_bubble_text(raw_txt) or raw_txt) if row['sender']=='ai' else raw_txt
                    db.execute('UPDATE messages SET text=? WHERE id=?',(next_txt,mid))
                    invalidate_translation(db,mid)
                    db.commit()
                    updated=dict(row)|{'text':next_txt}
                    return self.respond({'ok':True,'message':updated,'translationInvalidated':True})
                if route=='/api/message-regenerate':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r or r['mode']!='chat':raise ValueError('仅支持在手机聊天模式重新生成')
                    all_rows=[dict(x) for x in db.execute('SELECT rowid,id,sender,mode,text,engine,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY rowid ASC',(p['id'],cid)).fetchall()]
                    thread_msgs=[m for m in all_rows if not _is_chat_artifact(m)]
                    trailing_ai=[]
                    for m in reversed(thread_msgs):
                        if m['mode']!='chat':break
                        if m['engine']=='recalled':continue
                        if m['sender']=='ai':trailing_ai.insert(0,m)
                        else:break
                    if not trailing_ai:raise ValueError('当前没有可重新生成的角色回复')
                    req_mid=str(data.get('messageId') or '').strip()
                    if req_mid and not any(m['id']==req_mid for m in trailing_ai):raise ValueError('仅支持重新生成角色最新一轮回复')
                    cur_mode=public_connection()['mode']
                    if cur_mode=='normal':
                        return self.respond({'ok':False,'replies':[],'reply':None,'removedIds':[],'warning':'当前处于正常模式且尚未连接 API，请先在「终端」配置 API。','apiError':None})
                    removed_ids=[m['id'] for m in trailing_ai]
                    raw_reply='';engine='demo'
                    if cur_mode=='live':
                        try:
                            ms=compile_messages(db,p,c,'chat',exclude_ids=removed_ids)
                            if not any(x.get('role')=='user' for x in ms):
                                ms.append({'role':'user','content':'【系统事件：重新生成开场】请结合你的原作性格与当前关系，重新发 1～2 条自然的手机聊天开场消息（多条气泡之间用 ||| 分隔）。'})
                            raw_reply=completion(ms,max_tokens=min(1024,int(load_connection().get('max_tokens',4096))),log_meta={'mode':'chat','task_type':'chat','entryPoint':'chat-regenerate','profile':p,'character':c})
                            engine='live'
                        except Exception as e:
                            return self.respond({'ok':False,'replies':[],'reply':None,'removedIds':[],'warning':str(e),'apiError':getattr(e,'api_error',None)})
                    else:
                        raw_reply=demo_text(db,p,c,'chat')
                        engine='demo'
                    bubble_texts=split_chat_bubbles(raw_reply)
                    if not bubble_texts:
                        return self.respond({'ok':False,'replies':[],'reply':None,'removedIds':[],'warning':'模型返回内容为空，已保留原有消息。','apiError':None})
                    for rid in removed_ids:
                        db.execute('DELETE FROM messages WHERE id=?',(rid,))
                        invalidate_translation(db,rid)
                    replies=[write_message(db,p['id'],cid,'ai','chat',b_txt,engine) for b_txt in bubble_texts]
                    ai_msg=replies[-1] if replies else None
                    if ai_msg:
                        log_event(db,p['id'],cid,'ai_message',c['name']+' 重新回应 '+p['name']+'：'+(' / '.join(bubble_texts))[:180])
                        db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                    db.commit()
                    return self.respond({'ok':True,'removedIds':removed_ids,'replies':replies,'reply':ai_msg,'warning':'','apiError':None})
                if route=='/api/translate-messages':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('尚未匹配')
                    force=bool(data.get('force'))
                    cfg=load_connection()
                    auto_enabled=cfg.get('auto_translate',True) is not False
                    all_msgs=[dict(x) for x in db.execute('SELECT id,profile_id,character_id,sender,mode,text,engine,created_at FROM messages WHERE profile_id=? AND character_id=? ORDER BY rowid ASC',(p['id'],cid)).fetchall()]
                    req_ids=set(str(x) for x in data.get('messageIds')) if isinstance(data.get('messageIds'),list) and data.get('messageIds') else None
                    target_msgs=[m for m in all_msgs if m['sender']=='ai' and m['mode']=='chat' and m['engine'] not in ('recalled','error') and not _is_chat_artifact(m) and (req_ids is None or m['id'] in req_ids)]
                    if not force and not auto_enabled:
                        return self.respond({'ok':True,'skipped':'disabled','calledApi':False,'translations':get_matched_translations_for_thread(db,p['id'],cid,all_msgs),'translatedIds':[],'cachedIds':[],'skippedIds':[m['id'] for m in target_msgs],'failedIds':[]})
                    ignore_names=[c['name'],p['name']]+list(c.get('aliases') or [])
                    existing_rows={row['message_id']:dict(row) for row in db.execute('SELECT * FROM message_translations WHERE profile_id=? AND character_id=?',(p['id'],cid)).fetchall()}
                    to_translate=[];cached_ids=[];skipped_ids=[]
                    for m in target_msgs:
                        clean=clean_chat_bubble_text(m['text'])
                        ver=compute_content_version(clean)
                        if not needs_chinese_translation(clean,ignore_names):
                            skipped_ids.append(m['id'])
                            continue
                        ex=existing_rows.get(m['id'])
                        if not force and ex and ex.get('status')=='ready' and ex.get('content_version')==ver and ex.get('translated_text'):
                            cached_ids.append(m['id'])
                            continue
                        to_translate.append({'id':m['id'],'text':clean,'content_version':ver})
                    if not to_translate:
                        return self.respond({'ok':True,'calledApi':False,'translations':get_matched_translations_for_thread(db,p['id'],cid,all_msgs),'translatedIds':[],'cachedIds':cached_ids,'skippedIds':skipped_ids,'failedIds':[]})
                    cur_mode=public_connection()['mode']
                    if cur_mode=='normal':
                        return self.respond({'ok':True,'skipped':'no-api','calledApi':False,'translations':get_matched_translations_for_thread(db,p['id'],cid,all_msgs),'translatedIds':[],'cachedIds':cached_ids,'skippedIds':skipped_ids,'failedIds':[]})
                    batch=to_translate[:12]
                    now_ts=utc()
                    if cur_mode=='demo':
                        translated_ids=[]
                        for item in batch:
                            db.execute('INSERT OR REPLACE INTO message_translations VALUES (?,?,?,?,?,?,?,?,?,?,?)',(item['id'],p['id'],cid,item['content_version'],'zh-CN',demo_translate_to_zh(item['text']),'ready','','','demo',now_ts))
                            translated_ids.append(item['id'])
                        db.commit()
                        return self.respond({'ok':True,'calledApi':False,'engine':'demo','translations':get_matched_translations_for_thread(db,p['id'],cid,all_msgs),'translatedIds':translated_ids,'cachedIds':cached_ids,'skippedIds':skipped_ids,'failedIds':[]})
                    char_cue='、'.join((c.get('tags') or [])[:4])
                    prompt_msgs=build_batch_translation_messages([{'id':x['id'],'text':x['text']} for x in batch],c['name'],char_cue)
                    total_chars=sum(len(x['text']) for x in batch)
                    max_tok=min(1600,max(260,total_chars*4+120))
                    try:
                        raw=completion(prompt_msgs,json_mode=True,max_tokens=max_tok,temperature=0.25,log_meta={'mode':'translation','task_type':'translation','entryPoint':'chat_translation','profile':p,'character':c})
                        parsed=parse_translation_batch_response(raw,batch)
                        translated_ids=[];failed_ids=[]
                        for item in batch:
                            zh=parsed['translations'].get(item['id'])
                            if zh:
                                db.execute('INSERT OR REPLACE INTO message_translations VALUES (?,?,?,?,?,?,?,?,?,?,?)',(item['id'],p['id'],cid,item['content_version'],'zh-CN',zh,'ready','','',cfg.get('model',''),now_ts))
                                translated_ids.append(item['id'])
                            else:
                                db.execute('INSERT OR REPLACE INTO message_translations VALUES (?,?,?,?,?,?,?,?,?,?,?)',(item['id'],p['id'],cid,item['content_version'],'zh-CN','','error','INCOMPLETE_TRANSLATION','模型未返回该气泡的对应译文，可点击重试翻译。',cfg.get('model',''),now_ts))
                                failed_ids.append(item['id'])
                        db.commit()
                        return self.respond({'ok':len(failed_ids)==0,'calledApi':True,'engine':'live','translations':get_matched_translations_for_thread(db,p['id'],cid,all_msgs),'translatedIds':translated_ids,'cachedIds':cached_ids,'skippedIds':skipped_ids,'failedIds':failed_ids,'apiError':None})
                    except Exception as e:
                        api_err=getattr(e,'api_error',None) or {'error_type':'TRANSLATION_FAILED','error_code':'TRANSLATION_FAILED','http_status':0,'title':'双语译文翻译失败','message':str(e),'task_type':'translation'}
                        err_code=api_err.get('error_code') or api_err.get('error_type') or 'TRANSLATION_FAILED'
                        err_msg=api_err.get('title') or api_err.get('message') or str(e)
                        failed_ids=[]
                        for item in batch:
                            db.execute('INSERT OR REPLACE INTO message_translations VALUES (?,?,?,?,?,?,?,?,?,?,?)',(item['id'],p['id'],cid,item['content_version'],'zh-CN','','error',err_code,err_msg,cfg.get('model',''),now_ts))
                            failed_ids.append(item['id'])
                        db.commit()
                        return self.respond({'ok':False,'calledApi':True,'engine':'live','translations':get_matched_translations_for_thread(db,p['id'],cid,all_msgs),'translatedIds':[],'cachedIds':cached_ids,'skippedIds':skipped_ids,'failedIds':failed_ids,'apiError':api_err})
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
                    t_state=get_task_state(p['id'],cid,mode)
                    if t_state.get('paused') and not data.get('manualResume'):
                        return self.respond({'reply':None,'replies':[],'mode':mode,'paused':True,'warning':'当前任务已暂停调用，请点击「恢复」或「重试」后再继续。','taskState':t_state,'queue':queue_view(db,p['id'],cid)})
                    if data.get('manualResume'):
                        t_state['paused']=False
                    qv=queue_view(db,p['id'],cid)
                    if mode=='chat' and (qv['count'] or qv['status']=='inflight'):
                        return self.respond(queue_flush(db,p,c,force=True,manual_resume=bool(data.get('manualResume'))))
                    if public_connection()['mode']=='normal':
                        return self.respond({'reply':None,'replies':[],'mode':mode,'warning':'当前处于正常模式且尚未连接 API，请先在「终端」配置 API。'})
                    engine='demo';warning='';settings=load_connection();api_error=None;reply=''
                    if all(settings.get(k) for k in ('base_url','api_key','model')):
                        try:
                            reply=completion(compile_messages(db,p,c,mode,is_continue=(mode=='meeting')),log_meta={'mode':mode,'task_type':mode,'entryPoint':'meeting-continue' if mode=='meeting' else 'chat-reply','profile':p,'character':c,'parseFn':clean_meeting_novel_text if mode=='meeting' else (lambda raw:' / '.join(split_chat_bubbles(raw)))})
                            engine='live'
                        except Exception as e:
                            warning=str(e);engine='error';api_error=getattr(e,'api_error',None)
                    else:reply=demo_text(db,p,c,mode)
                    if engine=='error':
                        t_state['status']='error';t_state['last_error']=api_error;t_state['updated_at']=utc()
                        return self.respond({'reply':None,'replies':[],'mode':mode,'warning':warning,'apiError':api_error,'taskState':t_state})
                    clear_task_state(p['id'],cid,mode)
                    bubble_texts=split_chat_bubbles(reply) if mode=='chat' else [clean_meeting_novel_text(reply)]
                    replies=[write_message(db,p['id'],cid,'ai',mode,b_txt,engine) for b_txt in bubble_texts]
                    ai_msg=replies[-1] if replies else None
                    if ai_msg:
                        combined_txt=' / '.join(bubble_texts)
                        log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+combined_txt[:180])
                        last_u=db.execute("SELECT * FROM messages WHERE profile_id=? AND character_id=? AND sender='user' ORDER BY created_at DESC,id DESC LIMIT 1",(p['id'],cid)).fetchone()
                        record_dialogue_episode(db,p,c,[dict(last_u)] if last_u else [],dict(ai_msg,text=combined_txt),mode)
                        if mode=='chat':
                            sync_surveillance_from_chat(db,p,c,combined_txt)
                    db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                    db.commit();return self.respond({'reply':ai_msg,'replies':replies,'mode':mode,'warning':warning,'taskState':get_task_state(p['id'],cid,mode)})
                if route=='/api/message':
                    p=profile_get(db,data.get('profileId'));cid=data.get('characterId');c=BY_ID.get(cid)
                    if not c:raise ValueError('角色不存在')
                    r=db.execute('SELECT * FROM relations WHERE profile_id=? AND character_id=? AND status=?',(p['id'],cid,'matched')).fetchone()
                    if not r:raise ValueError('尚未匹配')
                    txt=str(data.get('text','')).strip()
                    if not txt or len(txt)>4000:raise ValueError('消息请控制在 1–4000 字')
                    mode=r['mode'];auto=False
                    user_msg=write_message(db,p['id'],cid,'user',mode,txt,quote_id=str(data.get('quoteMessageId') or '') if mode=='chat' else '')
                    detect_and_apply_correction(db,p,c,user_msg)
                    if mode=='chat':
                        log_event(db,p['id'],cid,'user_message','与 '+p['name']+' 的聊天：'+txt[:180])
                        with CHAT_LOCK:
                            qv=queue_add(db,p['id'],cid,user_msg['id'],txt)
                        db.commit()
                        return self.respond({'user':user_msg,'reply':None,'replies':[],'queued':True,'paused':bool(qv.get('paused')),'mode':'chat','queue':qv,'autoMeeting':None,'auto_meeting':False})
                    log_event(db,p['id'],cid,'user_message','与 '+p['name']+' 的'+('见面' if mode=='meeting' else '聊天')+'：'+txt[:180])
                    t_state=get_task_state(p['id'],cid,'meeting')
                    if t_state.get('paused'):
                        db.commit();return self.respond({'user':user_msg,'reply':None,'replies':[],'paused':True,'auto_meeting':auto,'mode':mode,'taskState':t_state,'warning':'当前面对面生成已暂停，你的发言已保存。点击「恢复」后继续推进。'})
                    if public_connection()['mode']=='normal':
                        db.commit();return self.respond({'user':user_msg,'reply':None,'replies':[],'auto_meeting':auto,'mode':mode,'warning':'当前处于正常模式且尚未连接 API，请先在「终端」配置 API。'})
                    engine='demo';warning='';settings=load_connection();api_error=None;reply=''
                    if all(settings.get(k) for k in ('base_url','api_key','model')):
                        try:
                            reply=clean_meeting_novel_text(completion(compile_messages(db,p,c,mode,latest=txt),log_meta={'mode':mode,'task_type':'meeting','entryPoint':'meeting-message','profile':p,'character':c,'parseFn':clean_meeting_novel_text}))
                            engine='live'
                        except Exception as e:
                            warning=str(e);engine='error';api_error=getattr(e,'api_error',None)
                    else:reply=clean_meeting_novel_text(demo_text(db,p,c,mode))
                    if engine=='error':
                        t_state['status']='error';t_state['last_error']=api_error;t_state['updated_at']=utc()
                        db.commit();return self.respond({'user':user_msg,'reply':None,'replies':[],'auto_meeting':auto,'mode':mode,'warning':warning,'apiError':api_error,'taskState':t_state})
                    clear_task_state(p['id'],cid,'meeting')
                    ai_msg=write_message(db,p['id'],cid,'ai',mode,reply,engine)
                    log_event(db,p['id'],cid,'ai_message',c['name']+' 回应 '+p['name']+'：'+reply[:180])
                    record_dialogue_episode(db,p,c,[user_msg],ai_msg,mode)
                    db.execute('UPDATE relations SET updated_at=? WHERE profile_id=? AND character_id=?',(utc(),p['id'],cid))
                    db.commit();return self.respond({'user':user_msg,'reply':ai_msg,'replies':[ai_msg],'auto_meeting':auto,'mode':mode,'warning':warning,'taskState':get_task_state(p['id'],cid,'meeting')})
                if route=='/api/settings':
                    d=load_connection();
                    if 'demo_enabled' in data:d['demo_enabled']=bool(data['demo_enabled'])
                    if 'proactive_mode' in data and data['proactive_mode'] in ('off','daily','active'):d['proactive_mode']=data['proactive_mode']
                    if 'auto_translate' in data:d['auto_translate']=bool(data['auto_translate'])
                    if 'character_language_pref' in data and data['character_language_pref'] in ('natural','zh','en','custom'):d['character_language_pref']=data['character_language_pref']
                    if 'character_language_custom' in data:d['character_language_custom']=str(data['character_language_custom'] or '').strip()[:40]
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
                    if 'max_tokens' in data:
                        n=valid_token_budget(data['max_tokens'])
                        if n is None:raise ValueError('Max tokens 必须为 100–32768 的整数')
                        d['max_tokens']=n
                    if 'task_max_tokens' in data:d['task_max_tokens']=merge_task_token_overrides(d.get('task_max_tokens'),data['task_max_tokens'])
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
                                description=completion([{'role':'system','content':instruction},{'role':'user','content':'请描述这张虚构照片。'}],log_meta={'mode':'photo','entryPoint':'photo_description','character':c})[:1200];engine='live-text'
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
