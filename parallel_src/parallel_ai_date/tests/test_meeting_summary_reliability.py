import unittest,sys
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class BrokenJson(RuntimeError):
    api_error={'error_code':'INVALID_STRUCTURED_JSON'}

class SummaryReliability(unittest.TestCase):
    def test_retry_and_preservation(self):
        messages=[{'role':'system','content':'事实归档'},{'role':'user','content':'Lin对Leon表达了自己的决定'}]
        raw='{"summary":"Lin决定与Leon继续'
        fixed='{"summary":"Lin说出自己的决定，Leon与她商量了后续的安排。"}'
        with patch.object(server,'completion',side_effect=[BrokenJson(raw),fixed]) as mock:
            result=server.reliable_meeting_summary_json(messages,{'id':'p','name':'Lin'},{'id':'c','name':'Leon'})
            self.assertIn('决定',result)
            self.assertEqual(mock.call_count,2)
            self.assertEqual(mock.call_args_list[0].kwargs['min_output_tokens'],2048)
            self.assertEqual(mock.call_args_list[1].kwargs['min_output_tokens'],3072)
        with patch.object(server,'completion',side_effect=[BrokenJson(raw),BrokenJson(raw)]):
            with self.assertRaises(BrokenJson):server.reliable_meeting_summary_json(messages,{'id':'p'},{'id':'c'})
        backup=server.build_meeting_summary_text({'name':'Lin'},{'name':'Leon'},'街角',[{'sender':'user','text':'开场'},{'sender':'user','text':'结尾'}])
        self.assertIn('小结尚未生成成功',backup)
        self.assertNotIn('再到',backup)
    def test_full_length_and_chronology(self):
        summary='Lin与Leon在安全屋沟通了彼此的想法，整理行装，吃完早餐后驾车前往大学，在校门口分别。'*9
        self.assertGreater(len(server.build_meeting_summary_text({'name':'Lin'},{'name':'Leon'},'安全屋',[],summary)),320)
        turns=[{'id':str(i),'sender':'user' if i%2==0 else 'ai','created_at':'2026-11-22T05:00:00','text':('当事人说清楚重要约定，然后收拾物品并离开。'*6)} for i in range(151)]
        pieces=server.meeting_summary_chunks(turns,{'name':'Lin'},{'name':'Leon'})
        self.assertGreaterEqual(len(pieces),3)
        def completion_fn(messages,**kwargs):
            return ('{"summary":"'+summary+'"}' if '合并为整场见面梗概' in messages[0]['content'] else '{"summary":"本段记录了双方确认安排并采取行动。"}')
        with patch.object(server,'completion',side_effect=completion_fn) as mock:
            result=server.summarize_complete_meeting({'name':'Lin'},{'name':'Leon'},turns,'安全屋')
            self.assertEqual(result['summary'],summary)
            self.assertEqual(mock.call_count,len(pieces)+1)

if __name__=='__main__':unittest.main()
