"""Synthetic Python meeting place contract: no real user data and no model API."""
import json, sqlite3, sys, tempfile, unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class StructuredSceneTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.saved=(server.DATA,server.DBFILE,server.SECRETFILE)
        server.DATA=Path(self.temp.name)
        server.DBFILE=server.DATA/'scene.sqlite3'
        server.SECRETFILE=server.DATA/'connection.json'
        server.init_db()
        self.db=server.connect()
        self.p={'id':'m11-test-profile','name':'Test'}
        self.c=server.BY_ID['re-game:carlos:re3']
        self.mid='meet-m11-synthetic'
        server.MEETING_STATE[(self.p['id'],self.c['id'])]={
            'active_meeting_id':self.mid,'meeting_location':'宿舍外廊露台',
            'meeting_started_at':'2026-11-24T16:00:00+00:00',
            'meeting_location_history':[{'at':'2026-11-24T16:00:00+00:00','location':'宿舍外廊露台','source':'start'}]}
    def tearDown(self):
        self.db.close()
        server.MEETING_STATE.pop((self.p['id'],self.c['id']),None)
        server.DATA,server.DBFILE,server.SECRETFILE=self.saved
        self.temp.cleanup()
    def add(self,message_id,sender,text,minute,loc=''):
        at=f'2026-11-24T16:{minute:02d}:00+00:00'
        self.db.execute("""INSERT INTO messages (id,profile_id,character_id,sender,mode,text,engine,created_at,meeting_id,
                             scene_location,scene_location_evidence,scene_location_signature)
                           VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
            (message_id,self.p['id'],self.c['id'],sender,'meeting',text,'human' if sender=='user' else 'demo',
             at,self.mid,loc,'',server.meeting_scene_signature(text) if loc else ''))
        self.db.commit()
    def test_separate_location_and_evidence(self):
        turn=server.parse_meeting_scene_turn(json.dumps({'text':'Carlos走进卧室，坐在床边。',
             'location':'宿舍卧室','location_evidence':'走进卧室'},ensure_ascii=False),'宿舍外廊露台')
        self.assertEqual(turn['text'],'Carlos走进卧室，坐在床边。')
        self.assertTrue(turn['structured'])
        location=server.resolve_meeting_scene_turn_location(self.p,self.c,turn,'宿舍外廊露台')
        self.assertEqual(location['location'],'宿舍卧室')
        imagined=server.parse_meeting_scene_turn(json.dumps({'text':'他说下次去厨房。',
             'location':'宿舍厨房','location_evidence':'下次去厨房'},ensure_ascii=False),'宿舍卧室')
        self.assertEqual(server.resolve_meeting_scene_turn_location(self.p,self.c,imagined,'宿舍卧室')['location'],'宿舍卧室')
        with self.assertRaises(ValueError):server.parse_meeting_scene_turn('{"text":', '露台')
        with self.assertRaises(ValueError):server.parse_meeting_scene_turn('{"text":"你好"}','露台')
    def test_one_actual_change_one_source_bound_scene_summary(self):
        self.add('user-1','user','坐在露台聊聊天吧。',1)
        self.add('ai-1','ai','Carlos坐在露台上，认真听她讲课。',2,'宿舍外廊露台')
        self.add('user-2','user','我们进屋吧。',3)
        self.add('ai-2','ai','Carlos推开门，走进卧室。',4,'宿舍卧室')
        stages=server.meeting_scene_stages(self.db,self.p,self.c,self.mid)
        self.assertEqual(len(stages),1)
        self.assertEqual(stages[0]['from_location'],'宿舍外廊露台')
        self.assertEqual(stages[0]['to_location'],'宿舍卧室')
        self.assertEqual(stages[0]['transition_message_id'],'ai-2')
        monitor={'live_override':{'meeting_id':self.mid},'updated_at':''}
        with patch.object(server,'get_or_init_surveillance',return_value=monitor),patch.object(server,'public_connection',return_value={'mode':'demo'}):
            self.assertEqual(len(server.ensure_meeting_scene_summaries(self.db,self.p,self.c,self.mid)),1)
            self.assertEqual(len(server.ensure_meeting_scene_summaries(self.db,self.p,self.c,self.mid)),1)
        stored=self.db.execute('SELECT * FROM meeting_scene_summaries').fetchall()
        self.assertEqual(len(stored),1)
        self.assertEqual(stored[0]['summary_source'],'fallback')
        self.assertEqual(monitor['live_override']['location'],'宿舍卧室')
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM meeting_checkpoints').fetchone()[0],0,
            '50-group counters are never invoked in the new scene flow')
        self.db.execute("UPDATE messages SET text='Carlos还在露台上。' WHERE id='ai-1'")
        self.db.commit()
        self.assertFalse(server.valid_meeting_scene_summaries(self.db,self.p,self.c,self.mid),
            'Editing source invalidates the old derived scene summary')

if __name__=='__main__':unittest.main()
