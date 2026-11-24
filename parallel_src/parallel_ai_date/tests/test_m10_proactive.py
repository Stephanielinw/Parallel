"""M10: local Python server shares the browser's deterministic time safety gates."""
import sys, unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

def ms(hour, minute=0):
    return int(datetime(2026,11,24,hour,minute).timestamp()*1000)

def msg(text, timestamp):
    return {'sender':'user','mode':'chat','text':text,
            'created_at':datetime.fromtimestamp(timestamp/1000,timezone.utc).isoformat()}

class ProactiveQuietTest(unittest.TestCase):
    def test_night_window_and_manual_override(self):
        for hour,minute in [(23,40),(0,0),(0,11),(7,59)]:
            self.assertEqual(server.proactive_quiet_reason([],ms(hour,minute)),
                             'overnight-quiet-hours')
        self.assertEqual(server.proactive_quiet_reason([],ms(8)),'')
        self.assertEqual(server.proactive_quiet_reason([],ms(0,11),manual=True),'')

    def test_explicit_sleep_not_overridden_by_following_emoji_or_hello(self):
        t=ms(14)
        sleepy=[msg('今天事情忙完了',ms(12,20)),
                msg('我准备大睡特睡了',ms(12,30)),
                msg('嘿嘿',ms(12,31))]
        self.assertEqual(server.proactive_quiet_reason(sleepy,t),'recent-explicit-sleep')
        self.assertEqual(server.proactive_quiet_reason(sleepy+[msg('我醒了',ms(13,55))],t),'')
        self.assertEqual(server.proactive_quiet_reason(sleepy,ms(18)),'')
        self.assertEqual(server.proactive_quiet_reason([msg('晚上再聊电影吧',ms(13))],t),'')
        self.assertEqual(server.proactive_quiet_reason([msg('我先睡觉了',ms(13))],t),'recent-explicit-sleep')

    def test_midnight_daylight_hallucination_rejected(self):
        self.assertTrue(server.proactive_time_contradiction('太阳都快升到头顶了！',ms(0,11)))
        self.assertTrue(server.proactive_time_contradiction('这都中午了，醒醒',ms(1)))
        self.assertFalse(server.proactive_time_contradiction('明天中午吃饭吗？',ms(0,11)))
        self.assertFalse(server.proactive_time_contradiction('太阳都快升到头顶了',ms(12)))

if __name__=='__main__':unittest.main()
