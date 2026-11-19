import ast
import datetime as dt
import pathlib
import re
import unittest
server=pathlib.Path(__file__).resolve().parents[1]/'server.py'
names={'is_sleeping_slot','wake_slot_from_message','chat_clock_label','chat_clock_context','active_slot_index','hhmm_to_min'}
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

if __name__=='__main__':unittest.main()
