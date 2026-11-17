"""End-to-end state invariants for the local HTTP API, using a temporary database."""
import json, tempfile, threading, unittest, urllib.error, urllib.request
from pathlib import Path
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class ParallelAPITest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tmp=tempfile.TemporaryDirectory()
        server.DATA=Path(cls.tmp.name);server.DBFILE=server.DATA/'test.sqlite3';server.SECRETFILE=server.DATA/'connection.json'
        server.init_db()
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.port=cls.http.server_address[1]
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join(timeout=2);cls.tmp.cleanup()

    def call(self,path,data=None,status=200):
        req=urllib.request.Request(f'http://127.0.0.1:{self.port}/api{path}',data=json.dumps(data,ensure_ascii=False).encode() if data is not None else None,headers={'Content-Type':'application/json'} if data is not None else {})
        try:
            with urllib.request.urlopen(req,timeout=4) as res:
                self.assertEqual(res.status,status)
                return json.load(res)
        except urllib.error.HTTPError as e:
            self.assertEqual(e.code,status)
            return json.load(e)

    def create(self,name,role='',sources=None):
        return self.call('/profile',{'name':name,'age':26,'gender':'male','interested_in':['all'],'min_age':18,'max_age':65,'intent':'认识新朋友','bio':'喜欢咖啡','interests':['咖啡'],'sources':sources or [],'avatar':'','role_character_id':role,'role_hint':''})['profile']

    def test_01_identity_and_parallel_version(self):
        self.assertEqual(self.call('/health')['ok'],True)
        self.assertGreaterEqual(len(self.call('/identify?name=Leon')['matches']),3)
        leon=self.create('Leon',role='re-game:leon:re2')
        self.__class__.leon=leon
        ids={x['id'] for x in self.call('/candidates?profileId='+leon['id'])['candidates']}
        # Random ten drawn from whole catalog may not contain the alternate; test the entire eligibility set directly.
        with server.connect() as db:
            pool={x['id'] for x in server.possible_candidates(db,server.profile_get(db,leon['id']))}
        self.assertNotIn('re-game:leon:re2',pool)
        self.assertIn('re-game:leon:re4',pool)
        self.assertIn('re-game:leon:re6',pool)
        forbidden=self.call('/swipe',{'profileId':leon['id'],'characterId':'re-game:leon:re2','direction':'right'},400)
        self.assertIn('自己',forbidden['error'])
        film=self.create('Film Fan',sources=['生化危机 · 电影'])
        batch=self.call('/discover',{'profileId':film['id']})
        self.assertEqual(batch['generation'],'catalog-demo')
        self.assertEqual(len(batch['candidates']),10)
        self.assertEqual(len({c['id'] for c in batch['candidates']}),10)
        self.assertTrue(all(c['source']=='生化危机 · 电影' for c in batch['candidates']))
        custom=self.create('Custom Tag',sources=['生化危机'])
        self.assertEqual(custom['sources'],['生化危机'])
        with server.connect() as db:
            pool=server.possible_candidates(db,server.profile_get(db,custom['id']))
        self.assertTrue(any(c['source']=='生化危机 · 游戏' for c in pool))
        self.assertTrue(any(c['source']=='生化危机 · 电影' for c in pool))
        unknown=self.create('Unknown Work',sources=['完全未收录的小说'])
        self.assertEqual(unknown['sources'],['完全未收录的小说'])
        self.assertEqual(self.call('/discover',{'profileId':unknown['id']})['candidates'],[])

    def test_02_profiles_match_and_reunite(self):
        steph=self.create('Stephanie')
        self.__class__.steph=steph
        cid='re-game:leon:re2';matched=False
        for _ in range(12):
            r=self.call('/swipe',{'profileId':steph['id'],'characterId':cid,'direction':'right'})
            if r['matched']:matched=True;break
        self.assertTrue(matched)
        first=self.call('/thread?profileId='+steph['id']+'&characterId='+cid)
        self.assertTrue(first['messages'][0]['engine']=='demo')
        r=self.call('/message',{'profileId':steph['id'],'characterId':cid,'text':'我喜欢电影'})
        self.assertEqual(r['mode'],'chat')
        before=len(self.call('/thread?profileId='+steph['id']+'&characterId='+cid)['messages'])
        self.call('/unmatch',{'profileId':steph['id'],'characterId':cid})
        self.assertFalse(self.call('/threads?profileId='+steph['id'])['threads'])
        for _ in range(12):
            r=self.call('/swipe',{'profileId':steph['id'],'characterId':cid,'direction':'right'})
            if r['matched']:break
        self.assertTrue(r['matched'])
        after=self.call('/thread?profileId='+steph['id']+'&characterId='+cid)
        self.assertGreater(len(after['messages']),before)
        self.assertIn('又见面',after['messages'][-1]['text'])
        self.assertTrue(any(m['text']=='我喜欢电影' for m in after['messages']))

    def test_03_meeting_and_cross_profile_persona(self):
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        r=self.call('/message',{'profileId':pid,'characterId':cid,'text':'我到了，在咖啡店门口'})
        self.assertTrue(r['queued']);self.assertIsNone(r['reply']);self.assertEqual(r['mode'],'chat')
        self.call('/mode',{'profileId':pid,'characterId':cid,'mode':'meeting'})
        next_reply=self.call('/reply',{'profileId':pid,'characterId':cid})
        self.assertEqual(next_reply['reply']['mode'],'meeting')
        self.assertEqual(next_reply['mode'],'meeting')
        prior=self.call('/thread?profileId='+pid+'&characterId='+cid)['messages']
        self.assertTrue(any(x['mode']=='chat' for x in prior))
        self.assertTrue(any(x['mode']=='meeting' for x in prior))
        self.call('/mode',{'profileId':pid,'characterId':cid,'mode':'chat'})
        # The user-controlled Leon and the AI Leon are NEVER the same entity.
        with server.connect() as db:
            p=server.profile_get(db,self.__class__.leon['id']);self.assertEqual(p['role_character_id'],cid)
            current,others=server.latest_memory(db,cid,self.__class__.leon['id'])
            self.assertEqual(current,[])
            self.assertTrue(any(x['person']=='Stephanie' for x in others))
            self.assertTrue(any(x['type']=='meeting' for x in others))

    def test_03a_60_second_quiet_batch_and_text_photo(self):
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        one=self.call('/message',{'profileId':pid,'characterId':cid,'text':'第一条'})
        two=self.call('/message',{'profileId':pid,'characterId':cid,'text':'第二条'})
        self.assertTrue(one['queued'])
        self.assertGreaterEqual(two['queue']['count'],2)
        self.assertIsNone(one['reply'])
        still=self.call('/chat-flush',{'profileId':pid,'characterId':cid})
        self.assertIsNone(still['reply'])
        self.assertTrue(still['queued'])
        with server.connect() as db:
            db.execute('UPDATE chat_queue SET due_at=? WHERE profile_id=? AND character_id=?',(server.now_ms()-1,pid,cid))
            db.commit()
        done=self.call('/chat-flush',{'profileId':pid,'characterId':cid})
        self.assertIsNotNone(done['reply'])
        self.assertEqual(done['queue']['count'],0)
        duplicate=self.call('/chat-flush',{'profileId':pid,'characterId':cid,'force':True})
        self.assertIsNone(duplicate['reply'])
        new=self.call('/message',{'profileId':pid,'characterId':cid,'text':'准备见面了'})
        self.assertEqual(new['queue']['count'],1)
        self.call('/mode',{'profileId':pid,'characterId':cid,'mode':'meeting'})
        thread=self.call('/thread?profileId='+pid+'&characterId='+cid)
        self.assertEqual(thread['queue']['count'],0)
        self.assertTrue(any(m['text']=='准备见面了' for m in thread['messages']))
        old_len=len(thread['messages'])
        self.call('/mode',{'profileId':pid,'characterId':cid,'mode':'chat'})
        self.assertIsNone(self.call('/chat-flush',{'profileId':pid,'characterId':cid,'force':True})['reply'])
        self.assertEqual(len(self.call('/thread?profileId='+pid+'&characterId='+cid)['messages']),old_len)
        photo=self.call('/photo-description',{'characterId':cid})
        self.assertIn('Leon',photo['description'])
        self.assertNotIn('portrait',photo)

    def test_04_terminal_and_presets(self):
        x=self.call('/settings',{'base_url':'https://example.org/v1','api_key':'test-secret-abc','model':'test-model','temperature':1.15,'top_p':.7,'image_base_url':'https://img.example.org/v1','image_api_key':'img-secret-xyz','image_model':'image-test'})['settings']
        self.assertTrue(x['has_key']);self.assertNotIn('api_key',x)
        self.assertTrue(x['has_image_key']);self.assertNotIn('image_api_key',x)
        self.assertEqual(x['image_mode'],'live')
        self.assertNotIn('test-secret-abc',json.dumps(self.call('/settings')))
        self.assertNotIn('img-secret-xyz',json.dumps(self.call('/settings')))
        bad=self.call('/settings',{'base_url':'http://example.com/v1'},400)
        self.assertIn('HTTPS',bad['error'])
        bad_img=self.call('/settings',{'image_base_url':'http://img.example.com/v1'},400)
        self.assertIn('HTTPS',bad_img['error'])
        presets=self.call('/presets')['entries']
        self.assertGreaterEqual(len(presets),5)
        created=self.call('/preset',{'mode':'meeting','name':'节奏控制','content':'不要过快推进','role':'system','enabled':True})
        self.assertIn(created['id'],[p['id'] for p in self.call('/presets')['entries']])
        cleared=self.call('/settings',{'clear_key':True,'clear_image_key':True})['settings']
        self.assertFalse(cleared['has_key']);self.assertFalse(cleared['has_image_key']);self.assertEqual(cleared['image_mode'],'text')

    def test_05_own_preset_import_export_roundtrip(self):
        original=self.call('/presets')['entries']
        chat=[x for x in original if x['mode']=='chat']
        meeting=[x for x in original if x['mode']=='meeting']
        pack={'format':'parallel-text-preset','schemaVersion':1,'modes':['chat'],
              'name':'本地试验','entries':[{'mode':'chat','name':'独立预设','role':'system',
                'enabled':False,'content':'随时遵循当前聊天角色的设定','sort_order':0}]}
        fail=self.call('/preset-import',{'import_mode':'append','preset':{'format':'third-party-preset','schemaVersion':1,'modes':['chat'],'entries':pack['entries']}},400)
        self.assertIn('Parallel',fail['error'])
        self.assertEqual(self.call('/presets')['entries'],original)
        r=self.call('/preset-import',{'import_mode':'append','preset':pack})
        self.assertEqual(r['imported'],1)
        after=self.call('/presets')['entries']
        self.assertEqual(len(after),len(original)+1)
        self.assertEqual(len([x for x in after if x['mode']=='meeting']),len(meeting))
        self.assertEqual(next(x for x in after if x['name']=='独立预设')['enabled'],False)
        invalid={**pack,'entries':[{**pack['entries'][0],'content':12}]}
        self.assertIn('条目',self.call('/preset-import',{'import_mode':'replace','preset':invalid},400)['error'])
        self.assertEqual(self.call('/presets')['entries'],after)
        self.call('/preset-import',{'import_mode':'replace','preset':pack})
        final=self.call('/presets')['entries']
        self.assertEqual(len([x for x in final if x['mode']=='chat']),1)
        self.assertEqual(len([x for x in final if x['mode']=='meeting']),len(meeting))
        self.assertFalse(next(x for x in final if x['mode']=='chat')['enabled'])
        self.assertEqual(next(x for x in final if x['mode']=='chat')['content'],pack['entries'][0]['content'])

    def test_06_elsewhere_owned_meeting_preset(self):
        pack={'format':'elsewhere-preset','schemaVersion':1,'id':'test-owned','name':'小狗乐园测试版','entries':[
            {'id':'a','name':'人物规则','role':'system','enabled':True,'group':'入园仪式','content':'你是 {{char}}，对方是 {{user}}。'},
            {'id':'b','name':'文风备选','role':'system','enabled':False,'group':'文风','content':'只在启用后生效'},
            {'id':'c','name':'确认','role':'assistant','enabled':True,'group':'收尾','content':'我记得 {{char}} 与 {{user}}。'}]}
        untouched=json.dumps(pack,ensure_ascii=False)
        before=self.call('/presets')['entries']
        reply=self.call('/preset-import',{'import_mode':'replace','preset':pack})
        self.assertEqual(reply['imported'],3)
        items=self.call('/presets')['entries']
        self.assertEqual([x['role'] for x in items if x['mode']=='meeting'],['system','system','assistant'])
        self.assertEqual([x['enabled'] for x in items if x['mode']=='meeting'],[True,False,True])
        self.assertEqual(len([x for x in items if x['mode']=='chat']),len([x for x in before if x['mode']=='chat']))
        self.assertEqual(json.dumps(pack,ensure_ascii=False),untouched)
        with server.connect() as db:
            p=server.profile_get(db,self.__class__.steph['id'])
            msgs=server.compile_messages(db,p,server.BY_ID['re-game:leon:re2'],'meeting')
        rendered=json.dumps(msgs,ensure_ascii=False)
        self.assertIn('Leon S. Kennedy',rendered)
        self.assertIn('Stephanie',rendered)
        self.assertNotIn('{{char}}',rendered)
        self.assertNotIn('{{user}}',rendered)
        self.assertNotIn('只在启用后生效',rendered)
        self.assertTrue(any(x['role']=='assistant' and '我记得' in x['content'] for x in msgs))
        bad=dict(pack,entries=[dict(pack['entries'][0],id='a'),dict(pack['entries'][0],id='a')])
        self.call('/preset-import',{'import_mode':'replace','preset':bad},400)
        self.assertEqual(len(self.call('/presets')['entries']),len(items))

    def test_07_regression_fixes(self):
        # 1. Source tag alias matching ('巫师3', '猎魔人3', '生化2')
        witcher=self.create('Witcher Fan',sources=['巫师3'])
        with server.connect() as db:
            w_pool=server.possible_candidates(db,server.profile_get(db,witcher['id']))
        self.assertTrue(any(c['source']=='巫师 · 游戏' for c in w_pool))

        re2_fan=self.create('RE2 Fan',sources=['生化2'])
        with server.connect() as db:
            r2_pool=server.possible_candidates(db,server.profile_get(db,re2_fan['id']))
        self.assertTrue(any(c['id']=='re-game:leon:re2' for c in r2_pool))
        self.assertFalse(any(c['id']=='re-game:leon:re4' for c in r2_pool))

        # 2. Identify Chinese full name aliases without separator ('艾达王', '冬日战士')
        ada_matches=self.call('/identify?name='+urllib.parse.quote('艾达王'))['matches']
        self.assertTrue(any('Ada Wong' in m['name'] for m in ada_matches))
        bucky_matches=self.call('/identify?name='+urllib.parse.quote('冬日战士'))['matches']
        self.assertTrue(any('Bucky' in m['name'] for m in bucky_matches))

        # 3. Matched characters excluded from candidate pool, plus already_matched flag
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        with server.connect() as db:
            steph_pool={x['id'] for x in server.possible_candidates(db,server.profile_get(db,pid))}
        self.assertNotIn(cid,steph_pool)
        again=self.call('/swipe',{'profileId':pid,'characterId':cid,'direction':'right'})
        self.assertTrue(again.get('already_matched'))

        # 4. Intent & interests included in compile_messages
        with server.connect() as db:
            compiled=json.dumps(server.compile_messages(db,server.profile_get(db,pid),server.BY_ID[cid],'chat'),ensure_ascii=False)
        self.assertIn('认识新朋友',compiled)
        self.assertIn('咖啡',compiled)

        # 5. Message deletion & background due flush (/chat-flush-due)
        msg_res=self.call('/message',{'profileId':pid,'characterId':cid,'text':'测试撤回消息'})
        self.assertEqual(msg_res['queue']['count'],1)
        thread_msgs=self.call('/thread?profileId='+pid+'&characterId='+cid)['messages']
        last_msg_id=thread_msgs[-1]['id']
        del_res=self.call('/message-delete',{'profileId':pid,'characterId':cid,'messageId':last_msg_id})
        self.assertTrue(del_res['ok'])
        self.assertEqual(del_res['queue']['count'],0)

        # Queue another message, expire its due_at, and flush via /chat-flush-due
        self.call('/message',{'profileId':pid,'characterId':cid,'text':'后台队列自动送达测试'})
        with server.connect() as db:
            db.execute('UPDATE chat_queue SET due_at=? WHERE profile_id=? AND character_id=?',(server.now_ms()-5,pid,cid))
            db.commit()
        due_res=self.call('/chat-flush-due',{'profileId':pid})
        self.assertEqual(len(due_res['flushed']),1)
        self.assertEqual(due_res['flushed'][0]['characterId'],cid)

    def test_08_four_layer_memory_isolation_and_retrieval(self):
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        # 1. Create another profile and match the same character cid, ensure NO cross-profile memory leakage in compile_messages
        alice=self.create('AliceWonder',sources=['生化危机 · 游戏'])
        for _ in range(15):
            if self.call('/swipe',{'profileId':alice['id'],'characterId':cid,'direction':'right'}).get('matched'):break
        self.call('/memory-action',{'profileId':alice['id'],'characterId':cid,'action':'add','summary':'与 AliceWonder 在巴黎铁塔下喝过红酒'})
        with server.connect() as db:
            steph_compiled=json.dumps(server.compile_messages(db,server.profile_get(db,pid),server.BY_ID[cid],'chat'),ensure_ascii=False)
            alice_compiled=json.dumps(server.compile_messages(db,server.profile_get(db,alice['id']),server.BY_ID[cid],'chat'),ensure_ascii=False)
        self.assertNotIn('AliceWonder',steph_compiled)
        self.assertNotIn('巴黎铁塔',steph_compiled)
        self.assertNotIn('Stephanie',alice_compiled)

        # 2. Add episodic memories for Stephanie and verify on-demand keyword retrieval (Top 4)
        self.call('/memory-action',{'profileId':pid,'characterId':cid,'action':'add','summary':'约定下周五一起去北海道看暴风雪与温泉'})
        self.call('/memory-action',{'profileId':pid,'characterId':cid,'action':'add','summary':'Stephanie 对花生过敏，平时只喝热乌龙茶'})
        mem_query=self.call('/memories?profileId='+pid+'&characterId='+urllib.parse.quote(cid)+'&query='+urllib.parse.quote('北海道温泉'))
        self.assertEqual(mem_query['ownerId'],cid)
        self.assertEqual(mem_query['profileId'],pid)
        self.assertTrue(any('北海道' in m['summary'] for m in mem_query['recalledPreview']))

        # 3. Conversational correction: saying "你记错了，我们没有去北海道" marks old memory disputed and adds clarification
        self.call('/message',{'profileId':pid,'characterId':cid,'text':'你记错了，我们没有去过北海道，那是别人'})
        after_corr=self.call('/memories?profileId='+pid+'&characterId='+urllib.parse.quote(cid)+'&query='+urllib.parse.quote('北海道'))
        hokkaido_orig=[m for m in after_corr['memories'] if '暴风雪与温泉' in m['summary']][0]
        self.assertEqual(hokkaido_orig['disputed'],1)
        self.assertTrue(any(m['source_type']=='correction' for m in after_corr['memories']))

    def test_09_protocol_pollution_safety_and_user_protection(self):
        # 1. Leading protocol headers are stripped while preserving normal prose, quoted tags, and mid-sentence references
        self.assertEqual(server.clean_chat_bubble_text('[短信 18:37][短信 18:40] 刚忙完，久等了。'), '刚忙完，久等了。')
        self.assertEqual(server.clean_meeting_novel_text('[见面 19:47] 他推门走了进来。\n\n“久等了。”'), '他推门走了进来。\n\n“久等了。”')
        case1 = '他说：“请打开[短信 18:37]那条记录。”'
        case2 = '请查看 [短信 18:37] 那条记录。'
        self.assertEqual(server.clean_chat_bubble_text(case1), case1)
        self.assertEqual(server.clean_chat_bubble_text(case2), case2)
        self.assertEqual(server.split_chat_bubbles(case1), [case1])
        self.assertEqual(server.split_chat_bubbles(case2), [case2])
        self.assertEqual(server.split_chat_bubbles('[短信 18:37] 我到地铁站了 [短信 18:38] A出口见'), ['我到地铁站了', 'A出口见'])

        for normal in ('她指着屏幕说：“对方：[短信 18:37] 那条记录。”', '对方：[短信 18:37] 那条记录。', '她说：「聊天：[见面 19:47] 是那条记录的标题。」'):
            self.assertEqual(server.clean_meeting_novel_text(normal), normal)
            self.assertEqual(server.clean_chat_bubble_text(normal), normal)
        # 2. User messages are never protocol-cleaned when re-injected into compile_messages
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        self.call('/message',{'profileId':pid,'characterId':cid,'text':'[短信 18:37] 这是用户自己发的原始文字'})
        with server.connect() as db:
            compiled=server.compile_messages(db,server.profile_get(db,pid),server.BY_ID[cid],'chat')
        user_turns=[m['content'] for m in compiled if m['role']=='user']
        self.assertIn('[短信 18:37] 这是用户自己发的原始文字', user_turns)

if __name__=='__main__':unittest.main()


