import ast
import datetime as dt
import pathlib
import re
import unittest
server=pathlib.Path(__file__).resolve().parents[1]/'server.py'
names={'is_sleeping_slot','wake_slot_from_message','chat_clock_label','chat_clock_context','chat_temporal_topic_hint','active_slot_index','hhmm_to_min'}
nodes=[n for n in ast.parse(server.read_text(encoding='utf-8')).body if isinstance(n,ast.FunctionDef) and n.name in names]
ns={'re':re,'datetime':dt.datetime}
exec(compile(ast.Module(body=nodes,type_ignores=[]),str(server),'exec'),ns)

class PhoneClockSleep(unittest.TestCase):
    def test_actual_reply_splits_sleep(self):
        slots=[{'start':'00:00','end':'07:00','location':'公寓','status':'夜间熟睡','activity':'深度睡眠','source':'schedule'},{'start':'07:00','end':'23:59','location':'公园','status':'晨跑','activity':'跑步','source':'schedule'}]
        self.assertTrue(ns['wake_slot_from_message'](slots,'02:15','Leon'))
        self.assertEqual([(s['start'],s['end'],s['status']) for s in slots],[('00:00','02:15','夜间熟睡'),('02:15','07:00','已醒来发消息'),('07:00','23:59','晨跑')])
        self.assertFalse(ns['wake_slot_from_message'](slots,'02:16','Leon'))
    def test_current_and_previous_day(self):
        now=dt.datetime(2026,11,19,8,0).astimezone()
        last=dt.datetime(2026,11,18,23,0).astimezone().isoformat()
        text=ns['chat_clock_context']([{'sender':'user','created_at':last}],now)
        self.assertIn('2026-11-19 08:00',text)
        self.assertIn('2026-11-18 23:00',text)
        self.assertIn('上午',text)
        self.assertIn('540 分钟',text)

    def test_future_night_topic_not_current_bedtime(self):
        now=dt.datetime(2026,11,21,13,16).astimezone()
        rows=[
            {'sender':'user','text':'晚上在梦里见面？','created_at':(now-dt.timedelta(hours=2)).isoformat()},
            {'sender':'ai','text':'赶紧去钻被窝，晚安。','created_at':(now-dt.timedelta(hours=1)).isoformat()},
            {'sender':'user','text':'啊啊啊色情狂','created_at':(now-dt.timedelta(minutes=21)).isoformat()},
            {'sender':'user','text':'哼','created_at':(now-dt.timedelta(minutes=21)).isoformat()}
        ]
        result=ns['chat_clock_context'](rows,now)
        self.assertIn('2026-11-21 13:16',result)
        self.assertIn('下午',result)
        self.assertIn('白天讨论夜晚·情境校准',result)
        self.assertIn('不要把话题当作睡前告别',result)
        self.assertIn('对方没有明确表示此刻要睡',result)
        nap=ns['chat_clock_context'](rows+[{'sender':'user','text':'我现在要睡午觉了，晚点聊','created_at':now.isoformat()}],now)
        self.assertIn('可以尊重并自然回应',nap)
        evening=ns['chat_clock_context'](rows,now.replace(hour=22))
        self.assertNotIn('白天讨论夜晚·情境校准',evening)
        no_topic=ns['chat_clock_context']([{'sender':'user','text':'你吃过午饭了吗？','created_at':now.isoformat()}],now)
        self.assertNotIn('白天讨论夜晚·情境校准',no_topic)

if __name__=='__main__':unittest.main()
