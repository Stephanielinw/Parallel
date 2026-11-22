"""No-network tests for durable 50-exchange meeting checkpoints."""
import json,sqlite3,sys,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class CheckpointTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.row_factory=sqlite3.Row
        self.db.executescript('''
          CREATE TABLE messages (id TEXT PRIMARY KEY,profile_id TEXT,character_id TEXT,sender TEXT,mode TEXT,text TEXT,engine TEXT,created_at TEXT,meeting_id TEXT,quote_json TEXT DEFAULT '');
          CREATE TABLE meeting_checkpoints (profile_id TEXT,character_id TEXT,meeting_id TEXT,block_index INTEGER,source_signature TEXT,started_at TEXT,ended_at TEXT,participants TEXT,summary TEXT,keywords TEXT,key_dialogues TEXT,details TEXT,message_ids TEXT,created_at TEXT,PRIMARY KEY(profile_id,character_id,meeting_id,block_index));
          CREATE TABLE episodic_memories (id TEXT PRIMARY KEY,owner_id TEXT,profile_id TEXT,source_type TEXT,source_key TEXT,knowledge_mode TEXT,summary TEXT,tags TEXT,importance INTEGER,emotional_weight INTEGER,unresolved INTEGER,clarifies_id TEXT,disputed INTEGER,raw_msg_ids TEXT,event_at TEXT,created_at TEXT,UNIQUE(owner_id,profile_id,source_key));
        ''')
        self.p={'id':'lin','name':'Lin'}
        self.c={'id':'re-game:carlos:re3','name':'Carlos'}
        self.mid='meet-50'
        self.original=server.load_connection
        server.load_connection=lambda:{'base_url':'','api_key':'','model':''}
    def tearDown(self):
        server.load_connection=self.original
        self.db.close()
    def append_pairs(self,first,last):
        for i in range(first,last+1):
            for sender in ('user','ai'):
                body='Lin把铜钥匙放在书桌抽屉了' if i==1 and sender=='user' else f'第{i}轮聊天，对话继续'
                mid=f'{sender}-{i}'
                when=f"2026-11-22T10:{(i-1)//60:02d}:{(i-1)%60:02d}.000000+00:00"
                self.db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?)',(mid,self.p['id'],self.c['id'],sender,'meeting',body,'human' if sender=='user' else 'demo',when,self.mid,''))
        self.db.commit()
    def test_stage_generation_persistence_and_keyword_source(self):
        self.append_pairs(1,49)
        self.assertEqual(server.ensure_meeting_checkpoints(self.db,self.p,self.c,self.mid),[])
        self.append_pairs(50,50)
        records=server.ensure_meeting_checkpoints(self.db,self.p,self.c,self.mid)
        self.assertEqual(len(records),1)
        cp=records[0]
        self.assertEqual(len(cp['message_ids']),100)
        self.assertEqual(len(server.ensure_meeting_checkpoints(self.db,self.p,self.c,self.mid)),0,'repeat is idempotent')
        self.db.execute('UPDATE meeting_checkpoints SET keywords=? WHERE meeting_id=?',(json.dumps(['铜钥匙'],ensure_ascii=False),self.mid))
        overview=server.meeting_checkpoint_prompt_context(self.db,self.p,self.c,self.mid,'平时随便聊聊')
        self.assertIn('已归档的全部50组阶段小结',overview)
        self.assertNotIn('关键词命中的历史现场原文',overview)
        detail=server.meeting_checkpoint_prompt_context(self.db,self.p,self.c,self.mid,'那把铜钥匙呢？')
        self.assertIn('关键词命中的历史现场原文',detail)
        self.assertIn('Lin把铜钥匙放在书桌抽屉了',detail)
        for i in range(51,101):
            self.append_pairs(i,i)
        records=server.ensure_meeting_checkpoints(self.db,self.p,self.c,self.mid)
        self.assertEqual(len(records),1,'100 pairs add only the second block')
        self.assertEqual(len(server.valid_meeting_checkpoints(self.db,self.p['id'],self.c['id'],self.mid)),2)
        self.db.execute("UPDATE messages SET text='修订过的第一轮' WHERE id='user-1'")
        valid=server.valid_meeting_checkpoints(self.db,self.p['id'],self.c['id'],self.mid)
        self.assertEqual(len(valid),1,'editing older source invalidates only its own block')
        self.assertEqual(valid[0]['block_index'],2)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM episodic_memories WHERE source_key=?",(f'meeting-checkpoint:{self.mid}:1',)).fetchone()[0],0)
    def test_profile_character_isolation_and_exact_five_groups(self):
        self.append_pairs(1,50)
        server.ensure_meeting_checkpoints(self.db,self.p,self.c,self.mid)
        self.assertEqual(server.valid_meeting_checkpoints(self.db,'other',self.c['id'],self.mid),[])
        self.assertEqual(server.valid_meeting_checkpoints(self.db,self.p['id'],'other-character',self.mid),[])
        rows=[dict(x) for x in self.db.execute('SELECT * FROM messages ORDER BY rowid').fetchall()]
        win=server.select_turn_window(rows,'meeting',meeting_max_groups=5)
        self.assertEqual(len(win),10,'the compressed live meeting prompt includes exactly 5 user/AI pairs')
        self.assertEqual(win[0]['id'],'user-46')

if __name__=='__main__':unittest.main()
