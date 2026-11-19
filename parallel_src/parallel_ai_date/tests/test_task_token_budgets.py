import ast
import pathlib
import re
import unittest

SERVER=pathlib.Path(__file__).resolve().parents[1]/'server.py'
tree=ast.parse(SERVER.read_text(encoding='utf-8'))
names={'TASK_TOKEN_DEFAULTS','TASK_TOKEN_KEYS','valid_token_budget','task_token_overrides','merge_task_token_overrides','resolve_task_max_tokens'}
nodes=[n for n in tree.body if (isinstance(n,ast.FunctionDef) and n.name in names) or (isinstance(n,ast.Assign) and any(isinstance(t,ast.Name) and t.id in names for t in n.targets))]
ns={'re':re}
exec(compile(ast.Module(body=nodes,type_ignores=[]),str(SERVER),'exec'),ns)

class TaskTokenBudgets(unittest.TestCase):
    def test_defaults_and_legacy(self):
        for mode,entry,explicit,expected in [["chat","chat_flush",None,8192],["meeting","meeting_continue",None,8192],["surveillance","surveillance",1200,4096],["diary","diary",900,4096],["bio","discover_bios",950,2048],["match","match_decision",70,1024],["chat","chat_first_message",220,1024],["chat","first-message",220,1024],["chat","chat_proactive",220,1024],["meeting_summary","meeting_finalize",160,1024],["archive","episode_archive",None,4000],["photo","photo_description",350,1024],["translation","chat_translation",560,560],["chat","chat_continue",1024,1024]]:
            self.assertEqual(ns['resolve_task_max_tokens']({'max_tokens':8192},mode,entry,explicit),expected,entry)
        self.assertEqual(ns['resolve_task_max_tokens']({'max_tokens':700},'meeting','meeting_opening'),700)
    def test_overrides_and_validation(self):
        m=ns['merge_task_token_overrides'];r=ns['resolve_task_max_tokens']
        values=m({'diary':6000,'meeting':30000},{'diary':None,'surveillance':8000})
        self.assertEqual(values,{'meeting':30000,'surveillance':8000})
        self.assertEqual(r({'max_tokens':700,'task_max_tokens':values},'meeting','meeting_opening'),30000)
        self.assertEqual(r({'max_tokens':700,'task_max_tokens':values},'diary','diary'),4096)
        for bad in (99,32769,1.5,True,'foo',float('nan')):
            with self.assertRaises(ValueError):m({}, {'diary':bad})

if __name__=='__main__':unittest.main()
