"""No-network regression: a real 119-turn meeting beats stale movie plans and RE6-era schedules."""
import json
import sqlite3
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server


class RecentMeetingContinuityTest(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.row_factory=sqlite3.Row
        self.db.executescript('''
            CREATE TABLE meetings(id TEXT,profile_id TEXT,character_id TEXT,started_at TEXT,ended_at TEXT,entries TEXT);
            CREATE TABLE relations(profile_id TEXT,character_id TEXT,mode TEXT);
        ''')
        self.p={'id':'p1','name':'Lin'}
        self.c={'id':'re-game:leon:re2','name':'Leon S. Kennedy'}
        self.end=datetime(2026,11,22,3,59,tzinfo=timezone.utc)
        self.at=int(datetime(2026,11,22,4,24,tzinfo=timezone.utc).timestamp()*1000)
        entries=[]
        for i in range(119):
            text=('我们最初约好一起看电影。' if i==0 else
                  '结果电影并没有看，我们在家里亲密相处，后来相拥睡了两个小时。' if i==59 else
                  '我在日落大道下车了，Leon送我去见朋友。' if i==117 else
                  '第%d回合的现场对话。'%i)
            entries.append({'sender':'user' if i==117 else 'ai','text':text})
        self.db.execute('INSERT INTO meetings VALUES (?,?,?,?,?,?)',
            ('m1','p1',self.c['id'],(self.end-timedelta(hours=3)).isoformat(),self.end.isoformat(),json.dumps(entries,ensure_ascii=False)))
        self.db.execute('INSERT INTO relations VALUES (?,?,?)',('p1',self.c['id'],'chat'))
        self.db.commit()

    def tearDown(self):
        self.db.close()

    def test_recent_actual_scene_is_recalled_without_keyword_match(self):
        text=server.recent_actual_meeting_context(self.db,self.p,self.c,'今天舒服吗，做的时候',self.at)
        self.assertIn('最近一次真实线下见面',text)
        self.assertIn('电影并没有看',text)
        self.assertIn('亲密相处',text)
        self.assertIn('日落大道下车',text)
        self.assertNotIn('DSO',text)
        self.assertEqual(server.recent_actual_meeting_context(self.db,self.p,
            {'id':'re-game:leon:re6','name':'Leon'},'今天怎么样',self.at),'')
        self.assertEqual(server.recent_actual_meeting_context(self.db,self.p,self.c,'吃烧烤',self.at+4*86400000),'')

    def test_expected_pickup_and_real_dropoff_are_not_future_plans(self):
        self.assertEqual(server.proposal_location('我来日落大道接你。'),'日落大道')
        self.assertEqual(server.meeting_place_in_player_turn('我在日落大道下车了。','Lin'),'日落大道')
        self.assertEqual(server.meeting_place_in_player_turn('Leon把我送到了日落大道，我下车了。','Lin'),'日落大道')
        self.assertEqual(server.meeting_place_in_player_turn('我准备在日落大道下车','Lin'),'')
        self.assertEqual(server.meeting_place_in_player_turn('如果我在日落大道下车呢','Lin'),'')

    def test_re2_surveillance_does_not_inherit_later_era(self):
        slot={'location':'特工安全公寓','status':'特工工作','activity':'保养DSO加密终端','scene':'华盛顿特区'}
        self.assertTrue(server.incompatible_character_slot(self.c,slot))
        result=server.verified_surveillance_slot(self.c,slot)
        self.assertEqual(result['location'],'地点未确认')
        self.assertNotIn('特工安全公寓',str(result))
        self.assertFalse(server.incompatible_character_slot({'id':'re-game:leon:re6'},slot))


if __name__=='__main__':
    unittest.main()
