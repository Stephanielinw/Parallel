"""M05: an agreement or a generated route is never witnessed shared history."""
import inspect
import sqlite3
import sys
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server


class EventAuthorityTests(unittest.TestCase):
    def setUp(self):
        self.db=sqlite3.connect(':memory:')
        self.db.row_factory=sqlite3.Row
        self.db.executescript("""
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,profile_id TEXT,character_id TEXT,
                sender TEXT,mode TEXT,text TEXT,engine TEXT,created_at TEXT
            );
            CREATE TABLE events (
                id TEXT PRIMARY KEY,profile_id TEXT,character_id TEXT,
                type TEXT,created_at TEXT
            );
        """)
        self.pid='m05-lin'
        self.cid='re-game:carlos:re3'
        self.db.execute("INSERT INTO events VALUES ('matched',?,?, 'matched',?)",
            (self.pid,self.cid,'2026-11-22T12:00:00Z'))

    def tearDown(self):
        self.db.close()

    def add(self,ident,sender,text,iso,pid=None):
        self.db.execute(
            'INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)',
            (ident,pid or self.pid,self.cid,sender,'chat',text,
             'human' if sender=='user' else 'live',iso)
        )

    def test_colloquial_character_doorstep_report(self):
        self.assertEqual(server.location_from_report('我就在你家门口等你。'),'你家门口')
        self.assertEqual(server.location_from_report("I'm right outside your door."),'your door')

    def test_no_show_doorstep_is_character_location(self):
        self.add('plan-1','user','我们今天五点半在餐厅吃饭见面吧',
                 '2026-11-22T16:00:00Z')
        self.add('plan-2','ai','好，五点半在餐厅见。',
                 '2026-11-22T16:01:00Z')
        self.add('no-show','user','我没去，直到晚上才回家。',
                 '2026-11-22T20:05:00Z')
        self.add('door','ai','我现在在你家门口等你。',
                 '2026-11-22T21:59:00Z')
        self.assertEqual(
            server.infer_meeting_location(self.db,self.pid,self.cid),
            '你家门口','latest character SMS outranks the proposed venue'
        )

    def test_unattended_appointment_does_not_imply_any_location(self):
        self.add('plan-1','user','我们今天五点半在餐厅见。',
                 '2026-11-22T16:00:00Z')
        self.add('plan-2','ai','好，五点半见。',
                 '2026-11-22T16:01:00Z')
        self.add('no-show','user','我没去，忙了一整晚。',
                 '2026-11-22T20:05:00Z')
        self.assertEqual(
            server.infer_meeting_location(self.db,self.pid,self.cid),
            '见面地点待确认')
        self.assertEqual(
            server.infer_meeting_location(self.db,self.pid,self.cid,
                                          '门外台阶'),
            '门外台阶','explicit user location stays authoritative'
        )

    def test_other_profile_and_old_recalled_are_excluded(self):
        self.add('other','ai','我现在在别人的卧室',
                 '2026-11-22T22:05:00Z','other-profile')
        self.add('real','ai','我现在在街角咖啡店门口。',
                 '2026-11-22T21:59:00Z')
        self.assertEqual(
            server.infer_meeting_location(self.db,self.pid,self.cid),
            '街角咖啡店门口')

    def test_archive_text_is_not_injected_as_firsthand_memory(self):
        formatter=server.format_episodic_entry({
            'source_type':'daily-summary',
            'event_at':'2026-11-22T18:00:00Z',
            'summary':'虚构：我们一起旅游结婚，昨天还在吃饭',
            'raw_excerpt':'对方：今天工作很忙',
            'knowledge_mode':'experienced'
        })
        self.assertIn('原文证据',formatter)
        self.assertNotIn('虚构：我们一起旅游结婚',formatter)
        source=inspect.getsource(server.compile_messages)
        self.assertNotIn('刚刚在「{meet_loc}」线下碰面',source)
        self.assertIn('第一幕 · 候场镜头',source)
        self.assertIn('玩家将在下一条现场行动中决定如何接触',source)
        self.assertIn('现场互动确认的位置',source)

    def test_old_generated_schedule_remains_marked_as_plan(self):
        slot={
            'id':'fake','source':'schedule','start':'17:30','end':'23:59',
            'location':'Lin 的卧室','status':'已共同回家',
            'activity':'已经一起吃饭回家','scene':'AI推测'
        }
        character={'id':'re-game:carlos:re3','name':'Carlos Oliveira'}
        self.assertTrue(server.verified_surveillance_slot(character,slot)['is_planned'])
        self.assertNotIn('is_planned',slot,'legacy item is not silently modified')


if __name__=='__main__':
    unittest.main()
