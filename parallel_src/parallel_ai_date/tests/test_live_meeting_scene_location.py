"""Meeting location is a witnessed event, not the original daily monitor slot."""
import json,sqlite3,sys,unittest
from datetime import datetime,timezone,timedelta
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class MeetingLocationTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.row_factory=sqlite3.Row
        self.db.executescript("""
            CREATE TABLE messages (id TEXT PRIMARY KEY,profile_id TEXT,character_id TEXT,sender TEXT,mode TEXT,text TEXT,engine TEXT,created_at TEXT,meeting_id TEXT,quote_json TEXT,scene_location TEXT,scene_location_evidence TEXT,scene_location_signature TEXT);
            CREATE TABLE relations(profile_id TEXT,character_id TEXT,mode TEXT);
        """)
        self.p={'id':'lin','name':'Lin'}
        self.c={'id':'re-game:carlos:re3','name':'Carlos Oliveira'}
        self.mid='m1'
        self.first=datetime(2026,11,22,16,0,tzinfo=timezone.utc)
        self.db.execute('INSERT INTO relations VALUES (?,?,?)',('lin',self.c['id'],'meeting'))
        server.MEETING_STATE[(self.p['id'],self.c['id'])]={
            'active_meeting_id':self.mid,'meeting_started_at':self.first.isoformat(),
            'meeting_location':'宿舍外廊露台',
            'meeting_location_history':[{'at':self.first.isoformat(),'location':'宿舍外廊露台','source':'start'}]
        }
    def tearDown(self):
        server.MEETING_STATE.pop((self.p['id'],self.c['id']),None)
        self.db.close()
    def add(self,at,text,sender='ai',location=''):
        atstr=(self.first+timedelta(minutes=at)).isoformat()
        sig=server.meeting_scene_signature(text) if location else ''
        self.db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)',
            (f'row{at}',self.p['id'],self.c['id'],sender,'meeting',text,'live',atstr,self.mid,'',location,'test',sig))
    def test_movement_and_no_movement(self):
        self.assertEqual(server.scene_location_from_character('Carlos走进卧室，在床沿坐下来。','宿舍外廊露台','Lin')['location'],'宿舍卧室')
        self.assertIsNone(server.scene_location_from_character('Carlos打算去浴室，朝那边走去。','宿舍卧室','Lin'))
        self.assertIsNone(server.scene_location_from_character('浴室里传来响动，但他仍在卧室。','宿舍卧室','Lin'))
        self.add(5,'Carlos走进卧室，在床沿坐下','ai','宿舍卧室')
        self.add(10,'Carlos说下次要去浴室','ai')
        self.add(15,'Carlos穿过门口，在厨房的门边停下','ai','宿舍厨房')
        points=server.refresh_meeting_scene_history(self.db,self.p,self.c)
        self.assertEqual([p['location'] for p in points],['宿舍外廊露台','宿舍卧室','宿舍厨房'])
        self.assertEqual(points[-1]['source'],'ai_scene')
        self.assertEqual(server.refresh_meeting_scene_history(self.db,self.p,self.c)[-1]['location'],'宿舍厨房')
        info={'id':self.mid,'started_at':self.first.isoformat(),'ended_at':(self.first+timedelta(minutes=20)).isoformat(),
              'location':'宿舍厨房','location_history':points,'summary':'见面'}
        slots=server.observed_meeting_segments(self.p,self.c,info,'2026-11-22')
        self.assertEqual([x['location'] for x in slots],['宿舍外廊露台','宿舍卧室','宿舍厨房'])
        self.assertEqual(slots[0]['start'],'08:00')
        self.db.execute("UPDATE messages SET text='这条见面实际上没有移动' WHERE id='row15'")
        points=server.refresh_meeting_scene_history(self.db,self.p,self.c)
        self.assertNotIn('宿舍厨房',[x['location'] for x in points],'edited evidence cannot keep stale AI position')
        self.assertEqual(server.refresh_meeting_scene_history(self.db,{'id':'other','name':'Other'},self.c),[],'different profile is isolated')

if __name__=='__main__':unittest.main()
