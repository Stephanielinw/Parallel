"""End-to-end state invariants for the local HTTP API, using a temporary database."""
import io, json, tempfile, threading, unittest, urllib.error, urllib.request
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
        pack={'format':'elsewhere-preset','schemaVersion':1,'id':'test-owned','name':'结构等价模拟预设','entries':[
            {'id':'a','name':'人物规则','role':'system','enabled':True,'group':'核心定位','content':'你是 {{char}}，对方是 {{user}}。'},
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

    def test_10_round02_preset_lifecycle_and_system_logs(self):
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        pack={'format':'elsewhere-preset','schemaVersion':1,'id':'r02-test','name':'Elsewhere结构验证预设','entries':[
            {'id':'e1','name':'核心扮演锚点','role':'system','enabled':True,'group':'核心定位','content':'你是 {{char}}，唯一对手是 {{user}}。'},
            {'id':'e2','name':'高饱和度感官电影流','role':'system','enabled':True,'group':'文风（单选）','content':'高饱和感官描写，围绕 {{char}} 与 {{user}}'},
            {'id':'e3','name':'古典散文观察视角','role':'system','enabled':False,'group':'文风（单选）','content':'冷眼旁观禁用内容'},
            {'id':'e4','name':'清淡日常白描视角','role':'system','enabled':False,'group':'文风（单选）','content':'温润白描禁用内容'},
            {'id':'e5','name':'动笔前连续性检查','role':'system','enabled':True,'group':'COT','content':'动笔前检查：先承接 {{user}} 的动作，检查 {{char}} 认知边界'},
            {'id':'e6','name':'底部誓约与状态确认','role':'assistant','enabled':True,'group':'收尾','content':'【已完整读取】我已进入 {{char}} 并锁定 {{user}}'}
        ]}
        imp=self.call('/preset-import',{'import_mode':'replace','preset':pack})
        self.assertEqual(imp['imported'],6)
        diag=imp['diagnostics']['meeting']
        self.assertEqual(diag['totalCount'],6)
        self.assertEqual(diag['enabledCount'],4)
        self.assertEqual(diag['disabledCount'],2)
        self.assertEqual(diag['enabledStyleCount'],1)
        self.assertTrue(diag['hasCotCheck'])
        self.assertTrue(diag['hasBottomPledge'])

        with server.connect() as db:
            p=server.profile_get(db,pid)
            msgs=server.compile_messages(db,p,server.BY_ID[cid],'meeting',trigger_opening=True)
        full_str=json.dumps(msgs,ensure_ascii=False)
        self.assertNotIn('冷眼旁观禁用内容',full_str)
        self.assertNotIn('温润白描禁用内容',full_str)
        self.assertNotIn('{{user}}',full_str)
        self.assertNotIn('{{char}}',full_str)
        self.assertEqual(msgs[0]['role'],'system')
        self.assertEqual(msgs[-3]['role'],'system')
        self.assertIn('动笔前检查：先承接 Stephanie 的动作',msgs[-3]['content'])
        self.assertEqual(msgs[-2]['role'],'assistant')
        self.assertIn('我已进入 Leon S. Kennedy 并锁定 Stephanie',msgs[-2]['content'])
        self.assertEqual(msgs[-1]['role'],'user')
        self.assertIn('【场景开启】',msgs[-1]['content'])
        # Ensure new meeting opening does not pull old meeting turns into active dialogue history
        self.assertEqual(len(msgs),4,'New meeting opening has only [core system, post-history system, assistant pledge, user scene opening]')

        # Test max_tokens up to 32768 and system logs endpoints
        s_res=self.call('/settings',{'max_tokens':8192})['settings']
        self.assertEqual(s_res['max_tokens'],8192)
        server.record_system_log({'mode':'meeting','entry_point':'meeting-opening','model':'test-m','char_count_raw':820,'char_count_parsed':820,'finish_reason':'stop'})
        logs=self.call('/system-logs')['logs']
        self.assertGreaterEqual(len(logs),1)
        self.assertEqual(logs[0]['char_count_parsed'],820)
        self.call('/system-logs-clear',{})
        self.assertEqual(len(self.call('/system-logs')['logs']),0)

    def test_11_api_error_gateway_and_legacy_isolation(self):
        # 1. Proxy wrapped error detection
        p1=server.detect_proxy_wrapped_error('所有API密钥均请求失败，具体错误请查看轮询日志')
        self.assertIsNotNone(p1)
        self.assertEqual(p1['code'],'PROXY_ALL_KEYS_FAILED')
        p2=server.detect_proxy_wrapped_error('[API Error] Upstream channel #3 failed')
        self.assertIsNotNone(p2)
        self.assertEqual(p2['code'],'PROXY_WRAPPED_ERROR')
        # Normal roleplay mentioning API / 404 / 429 / 超时 / 接口报错 must NOT be misclassified
        normal_line='他们的旧终端经常出现 404 或 429 超时，甚至抱怨 API 接口报错。'
        self.assertIsNone(server.detect_proxy_wrapped_error(normal_line))
        self.assertFalse(server.is_legacy_error_artifact({'sender':'ai','engine':'live','text':normal_line}))
        self.assertTrue(server.is_legacy_error_artifact({'sender':'ai','engine':'error','text':'（生成失败：模型接口返回 HTTP 502）'}))
        self.assertTrue(server.is_legacy_error_artifact({'sender':'ai','engine':'live','text':'所有API密钥均请求失败，具体错误请查看轮询日志'}))

        # 2. HTTP status classification
        c401=server.classify_http_status_error(401,'Invalid API key',{})
        self.assertEqual(c401['error_code'],'HTTP_401')
        self.assertTrue(c401['suggest_terminal'])
        c429=server.classify_http_status_error(429,'Rate limit exceeded',{'Retry-After':'24'})
        self.assertEqual(c429['error_code'],'HTTP_429')
        self.assertEqual(c429['retry_after'],24)
        c504=server.classify_http_status_error(504,'Gateway timeout',{})
        self.assertEqual(c504['error_code'],'HTTP_504')
        self.assertTrue(c504['may_consume_tokens'])

        # 3. Legacy error bubble isolation in SQLite DB
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        self.call('/mode',{'profileId':pid,'characterId':cid,'mode':'chat'})
        before_msgs=self.call(f'/thread?profileId={pid}&characterId={urllib.parse.quote(cid)}')['messages']
        with server.connect() as db:
            server.write_message(db,pid,cid,'ai','chat','所有API密钥均请求失败，具体错误请查看轮询日志','live')
            server.write_message(db,pid,cid,'ai','chat','（生成失败：模型接口返回 HTTP 500）','error')
            db.commit()
        after_msgs=self.call(f'/thread?profileId={pid}&characterId={urllib.parse.quote(cid)}')['messages']
        self.assertEqual(len(after_msgs),len(before_msgs),'Legacy/proxy error bubbles are hidden from thread view while normal history is intact')
        with server.connect() as db:
            compiled_str=json.dumps(server.compile_messages(db,server.profile_get(db,pid),server.BY_ID[cid],'chat'),ensure_ascii=False)
        self.assertNotIn('所有API密钥均请求失败',compiled_str)
        self.assertNotIn('生成失败：模型接口返回',compiled_str)

        # 4. Task pause & clear via /task-action
        pause_res=self.call('/task-action',{'profileId':pid,'characterId':cid,'mode':'chat','action':'pause'})
        self.assertTrue(pause_res['ok'])
        self.assertTrue(pause_res['paused'])
        ts_res=self.call(f'/task-state?profileId={pid}&characterId={urllib.parse.quote(cid)}&mode=chat')
        self.assertEqual(ts_res['taskState']['status'],'paused')
        clear_res=self.call('/task-action',{'profileId':pid,'characterId':cid,'mode':'chat','action':'clear'})
        self.assertTrue(clear_res['ok'])
        self.assertIsNone(clear_res['taskState'])

    def test_12_bilingual_chat_translation_and_lifecycle(self):
        pid=self.__class__.steph['id'];cid='re-game:leon:re2'
        self.call('/mode',{'profileId':pid,'characterId':cid,'mode':'chat'})
        # 1. Settings defaults & persistence for bilingual chat
        s0=self.call('/settings')
        self.assertTrue(s0.get('auto_translate',True))
        self.assertEqual(s0.get('character_language_pref','natural'),'natural')
        s_upd=self.call('/settings',{
            'base_url':'https://mock.parallel.local/v1',
            'api_key':'sk-mock-py-bilingual',
            'model':'mock-py-model',
            'demo_mode':False,
            'auto_translate':True,
            'character_language_pref':'custom',
            'character_language_custom':'日语',
        })['settings']
        self.assertTrue(s_upd['auto_translate'])
        self.assertEqual(s_upd['character_language_pref'],'custom')
        self.assertEqual(s_upd['character_language_custom'],'日语')

        # Character language directive enters chat prompt ONLY, never meeting prompt
        with server.connect() as db:
            chat_prompt=server.compile_messages(db,server.profile_get(db,pid),server.BY_ID[cid],'chat')
            meet_prompt=server.compile_messages(db,server.profile_get(db,pid),server.BY_ID[cid],'meeting')
        self.assertIn('日语',chat_prompt[0]['content'])
        self.assertNotIn('日语',json.dumps(meet_prompt,ensure_ascii=False))

        # Insert test AI messages: English, Japanese, Pure Chinese, Mixed, Multi-bubble
        with server.connect() as db:
            m_en=server.write_message(db,pid,cid,'ai','chat',"Rain's still coming down hard.",'live')
            m_ja=server.write_message(db,pid,cid,'ai','chat','お疲れ様、無理しないでね。','live')
            m_zh=server.write_message(db,pid,cid,'ai','chat','外面下大雨了，早点休息。','live')
            m_b1=server.write_message(db,pid,cid,'ai','chat','Hold on a second.','live')
            m_b2=server.write_message(db,pid,cid,'ai','chat','Comms are back up now.','live')
            db.commit()

        api_calls=[]
        fail_next={'value':False}
        UNIQUE_MARKER='PY_UNIQUE_ZH_SUBTITLE_4242'

        class MockResp:
            def __init__(self,payload_dict):
                self._raw=json.dumps(payload_dict,ensure_ascii=False).encode('utf-8')
            def read(self,n=-1):return self._raw
            def __enter__(self):return self
            def __exit__(self,*a):return False

        orig_urlopen=server.urllib.request.urlopen
        def fake_urlopen(req,timeout=60):
            url=req.full_url if hasattr(req,'full_url') else str(req)
            if '127.0.0.1' in url:
                return orig_urlopen(req,timeout=timeout)
            body=json.loads(req.data.decode('utf-8'))
            api_calls.append(body)
            if fail_next['value']:
                raise urllib.error.HTTPError(req.full_url,500,'Server Error',{},io.BytesIO(b'{"error":{"message":"mock 500"}}'))
            sys_c=body['messages'][0]['content']
            if '系统阅读辅助翻译器' in sys_c:
                payload=json.loads(body['messages'][1]['content'])
                items=payload['items']
                tr_list=[]
                for it in items:
                    if it['id']==m_en['id']:tr_list.append({'id':it['id'],'zh':UNIQUE_MARKER})
                    elif it['id']==m_ja['id']:tr_list.append({'id':it['id'],'zh':'辛苦了，别勉强自己。'})
                    elif it['id']==m_b1['id']:tr_list.append({'id':it['id'],'zh':'等一下。'})
                    elif it['id']==m_b2['id']:tr_list.append({'id':it['id'],'zh':'通讯恢复了。'})
                    else:tr_list.append({'id':it['id'],'zh':f"译：{it['text']}"})
                content=json.dumps({'translations':tr_list},ensure_ascii=False)
            else:
                content='Regenerated Python reply.'
            return MockResp({'choices':[{'message':{'content':content},'finish_reason':'stop'}]})

        server.urllib.request.urlopen=fake_urlopen
        try:
            # 2. Batch translate EN + JA + ZH + 2 multi-bubbles in ONE API call (ZH skipped)
            res=self.call('/translate-messages',{
                'profileId':pid,'characterId':cid,
                'messageIds':[m_en['id'],m_ja['id'],m_zh['id'],m_b1['id'],m_b2['id']],
            })
            self.assertTrue(res['ok'])
            self.assertTrue(res['calledApi'])
            self.assertEqual(len(api_calls),1,'Batch of 4 non-Chinese bubbles must consume only 1 API call')
            self.assertIn(m_zh['id'],res['skippedIds'])
            self.assertNotIn(m_zh['id'],res['translations'])
            self.assertEqual(res['translations'][m_en['id']]['translated_text'],UNIQUE_MARKER)
            self.assertEqual(res['translations'][m_ja['id']]['translated_text'],'辛苦了，别勉强自己。')
            self.assertEqual(res['translations'][m_b1['id']]['translated_text'],'等一下。')
            self.assertEqual(res['translations'][m_b2['id']]['translated_text'],'通讯恢复了。')

            # 3. Cache hit -> 0 API calls
            res_cache=self.call('/translate-messages',{'profileId':pid,'characterId':cid,'messageIds':[m_en['id'],m_ja['id']]})
            self.assertFalse(res_cache['calledApi'])
            self.assertEqual(len(api_calls),1)

            # 4. Zero prompt pollution
            with server.connect() as db:
                next_prompt=json.dumps(server.compile_messages(db,server.profile_get(db,pid),server.BY_ID[cid],'chat'),ensure_ascii=False)
            self.assertNotIn(UNIQUE_MARKER,next_prompt)

            # 5. Disabled auto-translate skips API
            self.call('/settings',{'auto_translate':False})
            res_off=self.call('/translate-messages',{'profileId':pid,'characterId':cid,'messageIds':[m_b1['id']]})
            self.assertEqual(res_off.get('skipped'),'disabled')
            self.assertEqual(len(api_calls),1)
            self.call('/settings',{'auto_translate':True})

            # 6. Edit invalidates stale translation
            ed=self.call('/message-edit',{'profileId':pid,'characterId':cid,'messageId':m_en['id'],'text':'Edited line in English.'})
            self.assertTrue(ed['ok'])
            th_after_edit=self.call(f'/thread?profileId={pid}&characterId={urllib.parse.quote(cid)}')
            self.assertNotIn(m_en['id'],th_after_edit['translations'])

            # 7. Translation failure does not break chat + manual retry works
            fail_next['value']=True
            f_res=self.call('/translate-messages',{'profileId':pid,'characterId':cid,'messageIds':[m_en['id']],'force':True})
            self.assertFalse(f_res['ok'])
            self.assertEqual(f_res['translations'][m_en['id']]['status'],'error')
            fail_next['value']=False
            r_res=self.call('/translate-messages',{'profileId':pid,'characterId':cid,'messageIds':[m_en['id']],'force':True})
            self.assertTrue(r_res['ok'])
            self.assertEqual(r_res['translations'][m_en['id']]['status'],'ready')

            # 8. Regenerate trailing AI turn invalidates old translations & Recall cleans up
            regen=self.call('/message-regenerate',{'profileId':pid,'characterId':cid,'messageId':m_b2['id']})
            self.assertTrue(regen['ok'])
            self.assertIn(m_b2['id'],regen['removedIds'])
            new_id=regen['replies'][0]['id']
            self.call('/translate-messages',{'profileId':pid,'characterId':cid,'messageIds':[new_id]})
            self.call('/message-delete',{'profileId':pid,'characterId':cid,'messageId':new_id})
            th_final=self.call(f'/thread?profileId={pid}&characterId={urllib.parse.quote(cid)}')
            self.assertNotIn(new_id,th_final['translations'])
        finally:
            server.urllib.request.urlopen=orig_urlopen
            self.call('/settings',{'demo_mode':True,'auto_translate':True,'character_language_pref':'natural','character_language_custom':''})

    def test_13_manual_only_meeting_transition(self):
        self.call('/settings',{'clear_key':True,'demo_enabled':True})
        p=self.create('Auto arrival test');pid=p['id'];cid='re-game:leon:re4'
        for i in range(15):
            if self.call('/swipe',{'profileId':pid,'characterId':cid,'direction':'right'})['matched']:break
        with server.connect() as db:
            server.write_message(db,pid,cid,'ai','chat','我们在屋顶见面吧','demo');db.commit()
        pair={'profileId':pid,'characterId':cid}
        ack=self.call('/message',dict(pair,text='好的'))
        self.assertIsNone(ack['autoMeeting'])
        arr=self.call('/message',dict(pair,text='我到了'))
        self.assertIsNone(arr['autoMeeting'])
        self.assertEqual(arr['mode'],'chat')
        self.assertIsNone(arr['reply'])
        invalid=self.call('/mode',dict(pair,mode='meeting',autoArrivalId=arr['user']['id'],triggerOpening=True))
        self.assertTrue(invalid['autoRejected'])
        self.assertEqual(invalid['mode'],'chat')
        opened=self.call('/mode',dict(pair,mode='meeting',triggerOpening=True))
        self.assertEqual(opened['mode'],'meeting')
        self.assertEqual(opened['location'],'屋顶')
        self.assertIsNotNone(opened['openingReply'])
        duplicate=self.call('/mode',dict(pair,mode='meeting',autoArrivalId=arr['user']['id'],triggerOpening=True))
        self.assertTrue(duplicate['autoRejected'])
        thread=self.call('/thread?profileId='+pid+'&characterId='+cid)
        self.assertEqual(len([m for m in thread['messages'] if m['text']=='我到了']),1)
        self.call('/mode',dict(pair,mode='chat',finalizeMeeting=True))
        self.assertIsNone(self.call('/message',dict(pair,text='我到了'))['autoMeeting'])
        self.assertEqual(server.location_from_report("I'm on the rooftop."),'the rooftop')
        self.assertEqual(server.location_from_report('我准备去屋顶'),'')
        self.assertEqual(server.explicit_arrival_place('我已经到街角咖啡馆门口了，等等，我好像看见你了。'),'街角咖啡馆门口')


    def test_14_backlog_recovery(self):
        self.call('/settings',{'clear_key':True,'demo_enabled':True})
        a=self.create('Backlog A');b=self.create('Backlog B')
        before=server.now_ms()-7200000;due=before+60000
        stamp=lambda t:server.datetime.fromtimestamp(t/1000,server.timezone.utc).isoformat(timespec='microseconds')
        fixtures=[(a['id'],'re-game:leon:re2','due','',due),(a['id'],'re-game:leon:re4','interrupted','interrupted',due+1000),(a['id'],'re-game:leon:re6','paused','user',due),(b['id'],'re-game:leon:re2','future','',server.now_ms()+600000)]
        with server.connect() as db:
            for pid,cid,label,kind,t in fixtures:
                db.execute("INSERT INTO relations(profile_id,character_id,status,mode,attempts,updated_at) VALUES (?,?,'matched','chat',1,?)",(pid,cid,stamp(before-1000)))
                mid=server.uid()
                db.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?,?)',(mid,pid,cid,'user','chat','Backlog '+label,'human',stamp(before)))
                db.execute('INSERT INTO chat_queue(profile_id,character_id,pending,due_at,blocked,recovery_kind,scheduled_due_at) VALUES (?,?,?,?,?,?,?)',(pid,cid,server.js([mid]),0 if kind else t,1 if kind else 0,kind,t if kind else 0))
            db.commit()
        args={'openedAt':server.now_ms(),'offlineSince':before-1000,'session':'test-backlog','profileId':a['id']}
        result=self.call('/chat-recover',args)
        own=[v for v in result['flushed'] if v['profileId'] in (a['id'],b['id'])]
        self.assertEqual(len(own),2)
        for cid,t in [('re-game:leon:re2',due),('re-game:leon:re4',due+1000)]:
            row=next(v for v in own if v['characterId']==cid)
            self.assertEqual(row['reply']['created_at'],stamp(t))
        self.assertEqual(self.call('/chat-recover',args)['flushed'],[])
        with server.connect() as db:
            for pid,cid in [(a['id'],'re-game:leon:re6'),(b['id'],'re-game:leon:re2')]:
                q=server.queue_view(db,pid,cid)
                self.assertEqual(q['count'],1)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM messages WHERE profile_id=? AND character_id=? AND sender='ai'",(pid,cid)).fetchone()[0],0)

if __name__=='__main__':unittest.main()





