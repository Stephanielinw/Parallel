import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

interface CapturedCall {
  url: string;
  body: any;
  isTranslation: boolean;
}

function createBilingualSandbox(options?: {
  store?: Map<string, string>;
  onFetch?: (
    url: string,
    body: any,
    callIndex: number
  ) => Promise<{ status: number; json?: any; text?: string; headers?: Record<string, string> }>;
}) {
  const src = fs.readFileSync(path.resolve(process.cwd(), 'public/parallel/offline.js'), 'utf8');
  const store = options?.store ?? new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
  };
  const calls: CapturedCall[] = [];
  const fetchImpl = async (url: string, init?: any) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    const sysText = String(body?.messages?.[0]?.content || '');
    const isTranslation = sysText.includes('系统阅读辅助翻译器');
    const idx = calls.length;
    calls.push({ url, body, isTranslation });
    if (!options?.onFetch) {
      throw new Error('Unexpected fetch without mock handler');
    }
    const res = await options.onFetch(url, body, idx);
    const hdrMap = new Map<string, string>(
      Object.entries(res.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
    );
    return {
      ok: res.status >= 200 && res.status < 300,
      status: res.status,
      headers: {
        get: (k: string) => hdrMap.get(k.toLowerCase()) ?? null,
      },
      json: async () => res.json,
      text: async () => (res.text !== undefined ? res.text : JSON.stringify(res.json ?? {})),
    };
  };

  const win: Record<string, unknown> = {};
  const context = {
    window: win,
    localStorage,
    crypto: webcrypto,
    URLSearchParams,
    Date,
    JSON,
    Math,
    TextEncoder,
    console,
    fetch: fetchImpl,
  };
  vm.createContext(context);
  vm.runInContext(src, context);

  return {
    engine: win.ParallelOffline as {
      request: (p: string, b?: Record<string, unknown>) => Promise<any>;
      buildPromptPreview: (
        pid: string,
        cid: string,
        mode?: string,
        opts?: Record<string, unknown>
      ) => Array<{ role: string; content: string }>;
      getSystemLogs: () => any[];
      clearSystemLogs: () => any[];
      computeContentVersion: (text: string) => string;
      needsChineseTranslation: (text: string, ignoreNames?: string[]) => boolean;
      buildCharacterLanguageDirective: (pref?: string, custom?: string) => string;
    },
    store,
    calls,
  };
}

function mockOpenAiOk(content: string) {
  return {
    status: 200,
    json: {
      choices: [{ message: { content }, finish_reason: 'stop' }],
      usage: { prompt_tokens: 120, completion_tokens: 60 },
    },
  };
}

async function setupMatchedLeon(engine: ReturnType<typeof createBilingualSandbox>['engine']) {
  await engine.request('/settings', {
    base_url: 'https://mock.parallel.local/v1',
    api_key: 'sk-mock-bilingual-test',
    model: 'mock-gpt-chat',
    demo_mode: false,
    auto_translate: true,
    character_language_pref: 'natural',
    character_language_custom: '',
  });
  const profRes = await engine.request('/profile', {
    name: 'Stephanie',
    age: 26,
    gender: 'female',
    interested_in: ['all'],
    min_age: 18,
    max_age: 65,
    intent: '认识新朋友',
    sources: ['生化危机 · 游戏'],
    bio: '喜欢黑咖啡和雨夜',
    interests: ['咖啡', '电影'],
  });
  const pid = profRes.profile.id as string;
  const cid = 're-game:leon:re2';
  for (let i = 0; i < 20; i++) {
    const sw = await engine.request('/swipe', { profileId: pid, characterId: cid, direction: 'right' });
    if (sw.matched) break;
  }
  return { pid, cid };
}

async function sendAndReply(
  engine: ReturnType<typeof createBilingualSandbox>['engine'],
  pid: string,
  cid: string,
  text: string
) {
  await engine.request('/message', { profileId: pid, characterId: cid, text });
  return await engine.request('/reply', { profileId: pid, characterId: cid });
}

test('1-5. Bilingual chat: English, Japanese, Pure Chinese skip, Mixed language, and Multi-bubble 1-to-1 batch translation', async () => {
  let replyStage = -1;
  const mockReplies = [
    // 1. English reply
    "Rain's still pouring out here. You still awake?",
    // 2. Japanese reply
    'お疲れ様。もう遅いから、無理しないでね。',
    // 3. Pure Simplified Chinese reply
    '刚到安全屋，外面雨太大了，你早点休息。',
    // 4. Mixed-language replies: (a) substantive foreign phrase + (b) Chinese with character name only
    '刚路过那家咖啡馆，Honestly it still tastes like battery acid. ||| Leon今天也在值夜班，放心吧。',
    // 5. Multi-bubble 3-message English reply
    'Hold on, let me grab my jacket. ||| The comms went dead for a second. ||| All good now—where were we?',
  ];

  const { engine, calls } = createBilingualSandbox({
    onFetch: async (_url, body) => {
      const sys = String(body.messages?.[0]?.content || '');
      if (sys.includes('系统阅读辅助翻译器')) {
        const userPayload = JSON.parse(String(body.messages?.[1]?.content || '{}'));
        const items = userPayload.items as Array<{ id: string; text: string }>;
        const dict: Record<string, string> = {
          'Hey, just clocked off.': '嘿，刚下班。',
          "Rain's still pouring out here. You still awake?": '外面雨还在下个不停。你还没睡？',
          'お疲れ様。もう遅いから、無理しないでね。': '辛苦了。已经很晚了，别勉强自己。',
          '刚路过那家咖啡馆，Honestly it still tastes like battery acid.':
            '刚路过那家咖啡馆，说实话那味道还是跟电池酸液一样。',
          'Hold on, let me grab my jacket.': '等一下，我拿件外套。',
          'The comms went dead for a second.': '通讯刚刚断了一秒。',
          'All good now—where were we?': '现在好了——我们刚才说到哪儿了？',
        };
        return mockOpenAiOk(
          JSON.stringify({
            translations: items.map((it) => ({ id: it.id, zh: dict[it.text] || `译：${it.text}` })),
          })
        );
      }
      if (replyStage < 0) return mockOpenAiOk('Hey, just clocked off.');
      const next = mockReplies[replyStage++] || 'Copy that.';
      return mockOpenAiOk(next);
    },
  });

  const { pid, cid } = await setupMatchedLeon(engine);
  replyStage = 0;

  // Send 1: English
  const r1 = await sendAndReply(engine, pid, cid, '你那边下雨了吗？');
  const enMsg = r1.replies[0];
  const tr1 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [enMsg.id],
  });
  assert.equal(tr1.ok, true);
  assert.equal(tr1.calledApi, true);
  assert.equal(tr1.translations[enMsg.id].translated_text, '外面雨还在下个不停。你还没睡？');
  assert.equal(tr1.translations[enMsg.id].status, 'ready');

  // Send 2: Japanese
  const r2 = await sendAndReply(engine, pid, cid, '刚加完班好累');
  const jaMsg = r2.replies[0];
  const tr2 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [jaMsg.id],
  });
  assert.equal(tr2.calledApi, true);
  assert.equal(tr2.translations[jaMsg.id].translated_text, '辛苦了。已经很晚了，别勉强自己。');

  // Send 3: Pure Simplified Chinese — must NOT trigger translation API call
  const r3 = await sendAndReply(engine, pid, cid, '你到安全屋了吗？');
  const zhMsg = r3.replies[0];
  const trCallsBeforeZh = calls.filter((c) => c.isTranslation).length;
  const tr3 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [zhMsg.id],
  });
  assert.equal(tr3.calledApi, false);
  assert.ok(tr3.skippedIds.includes(zhMsg.id));
  assert.equal(tr3.translations[zhMsg.id], undefined);
  assert.equal(calls.filter((c) => c.isTranslation).length, trCallsBeforeZh);

  // Send 4: Mixed-language (1 substantive English clause translated, 1 Chinese+character name skipped)
  const r4 = await sendAndReply(engine, pid, cid, '那家咖啡馆还开着吗');
  assert.equal(r4.replies.length, 2);
  const [mixedNeedMsg, mixedSkipMsg] = r4.replies;
  const tr4 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [mixedNeedMsg.id, mixedSkipMsg.id],
  });
  assert.equal(tr4.calledApi, true);
  assert.equal(
    tr4.translations[mixedNeedMsg.id].translated_text,
    '刚路过那家咖啡馆，说实话那味道还是跟电池酸液一样。'
  );
  assert.ok(tr4.skippedIds.includes(mixedSkipMsg.id));
  assert.equal(tr4.translations[mixedSkipMsg.id], undefined);

  // Send 5: Multi-bubble (3 bubbles) -> translated in ONE single batched API call, 1-to-1 aligned
  const r5 = await sendAndReply(engine, pid, cid, '信号好像不太好');
  assert.equal(r5.replies.length, 3);
  const trCallsBeforeBatch = calls.filter((c) => c.isTranslation).length;
  const tr5 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: r5.replies.map((m: any) => m.id),
  });
  const trCallsAfterBatch = calls.filter((c) => c.isTranslation).length;
  assert.equal(trCallsAfterBatch - trCallsBeforeBatch, 1, 'All 3 bubbles must be translated in 1 single API call');
  assert.equal(tr5.translations[r5.replies[0].id].translated_text, '等一下，我拿件外套。');
  assert.equal(tr5.translations[r5.replies[1].id].translated_text, '通讯刚刚断了一秒。');
  assert.equal(tr5.translations[r5.replies[2].id].translated_text, '现在好了——我们刚才说到哪儿了？');

  // Verify translation task metadata logged in System Logs
  const logs = engine.getSystemLogs();
  const trLogs = logs.filter((l: any) => l.mode === 'translation' || l.task_type === 'translation');
  assert.ok(trLogs.length >= 4);
  assert.equal(trLogs[0].entry_point, 'chat_translation');
});

test('6 & 9. Translation toggle, zero-token cache restoration, language preferences, and reload persistence', async () => {
  const sharedStore = new Map<string, string>();
  let translationCalls = 0;

  const makeMock = () =>
    createBilingualSandbox({
      store: sharedStore,
      onFetch: async (_url, body) => {
        const sys = String(body.messages?.[0]?.content || '');
        if (sys.includes('系统阅读辅助翻译器')) {
          translationCalls += 1;
          const payload = JSON.parse(String(body.messages?.[1]?.content || '{}'));
          return mockOpenAiOk(
            JSON.stringify({
              translations: payload.items.map((it: any) => ({ id: it.id, zh: `中文译文(${it.text})` })),
            })
          );
        }
        return mockOpenAiOk('Stay sharp out there.');
      },
    });

  const sb1 = makeMock();
  const { pid, cid } = await setupMatchedLeon(sb1.engine);

  // First message translated & cached
  const m1 = (await sendAndReply(sb1.engine, pid, cid, '早安')).replies[0];
  const tr1 = await sb1.engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [m1.id],
  });
  assert.equal(tr1.calledApi, true);
  assert.equal(translationCalls, 1);

  // Disable auto-translate -> new message causes ZERO translation API calls
  const sOff = (await sb1.engine.request('/settings', { auto_translate: false })).settings;
  assert.equal(sOff.auto_translate, false);
  const m2 = (await sendAndReply(sb1.engine, pid, cid, '晚上见')).replies[0];
  const trDisabled = await sb1.engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [m2.id],
  });
  assert.equal(trDisabled.skipped, 'disabled');
  assert.equal(trDisabled.calledApi, false);
  assert.equal(translationCalls, 1);

  // Re-enable auto-translate -> cached m1 restores directly with 0 API calls
  const sOn = (await sb1.engine.request('/settings', { auto_translate: true })).settings;
  assert.equal(sOn.auto_translate, true);
  const trCacheHit = await sb1.engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [m1.id],
  });
  assert.equal(trCacheHit.calledApi, false);
  assert.ok(trCacheHit.cachedIds.includes(m1.id));
  assert.equal(trCacheHit.translations[m1.id].translated_text, '中文译文(Stay sharp out there.)');
  assert.equal(translationCalls, 1, 'Cached translation must NOT re-consume tokens');

  // Character language preferences only affect chat prompt, never meeting prompt
  await sb1.engine.request('/settings', { character_language_pref: 'custom', character_language_custom: '法语' });
  const chatPrompt = sb1.engine.buildPromptPreview(pid, cid, 'chat');
  const meetingPrompt = sb1.engine.buildPromptPreview(pid, cid, 'meeting');
  assert.ok(
    chatPrompt[0].content.includes('法语'),
    'Custom character language preference injected into mobile chat system prompt'
  );
  assert.equal(
    meetingPrompt.some((m) => m.content.includes('法语')),
    false,
    'Face-to-face meeting prompt must NOT be modified'
  );

  // 9. Reload persistence: recreate engine from same localStorage snapshot
  const sb2 = makeMock();
  const threadAfterReload = await sb2.engine.request(
    `/thread?profileId=${pid}&characterId=${encodeURIComponent(cid)}`
  );
  assert.equal(threadAfterReload.translations[m1.id].translated_text, '中文译文(Stay sharp out there.)');
  assert.equal(threadAfterReload.translations[m1.id].status, 'ready');
  const trReload = await sb2.engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [m1.id],
  });
  assert.equal(trReload.calledApi, false);
  assert.equal(translationCalls, 1);
  const persistedSettings = await sb2.engine.request('/settings');
  assert.equal(persistedSettings.auto_translate, true);
  assert.equal(persistedSettings.character_language_pref, 'custom');
  assert.equal(persistedSettings.character_language_custom, '法语');
});

test('7. Translation failures (HTTP 500, proxy-wrapped error, malformed JSON) never break chat and support manual retry', async () => {
  let failMode: 'http500' | 'proxy200' | 'badjson' | 'ok' = 'http500';
  const { engine } = createBilingualSandbox({
    onFetch: async (_url, body) => {
      const sys = String(body.messages?.[0]?.content || '');
      if (sys.includes('系统阅读辅助翻译器')) {
        if (failMode === 'http500') {
          return { status: 500, json: { error: { message: 'Upstream translator overloaded' } } };
        }
        if (failMode === 'proxy200') {
          return mockOpenAiOk('所有API密钥均请求失败，具体错误请查看轮询日志');
        }
        if (failMode === 'badjson') {
          return mockOpenAiOk('not valid json at all');
        }
        const payload = JSON.parse(String(body.messages?.[1]?.content || '{}'));
        return mockOpenAiOk(
          JSON.stringify({
            translations: payload.items.map((it: any) => ({ id: it.id, zh: '别担心，我来处理。' })),
          })
        );
      }
      return mockOpenAiOk("Don't worry, I've got this handled.");
    },
  });

  const { pid, cid } = await setupMatchedLeon(engine);
  const sent = await sendAndReply(engine, pid, cid, '没关系吧？');
  const aiMsg = sent.replies[0];

  // Case A: HTTP 500
  const f1 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [aiMsg.id],
  });
  assert.equal(f1.ok, false);
  assert.ok(f1.failedIds.includes(aiMsg.id));
  assert.equal(f1.translations[aiMsg.id].status, 'error');
  assert.ok(f1.apiError && f1.apiError.error_code === 'HTTP_500');

  // Verify original message is intact & chat task state is NOT paused
  const thread1 = await engine.request(`/thread?profileId=${pid}&characterId=${encodeURIComponent(cid)}`);
  const kept = thread1.messages.find((m: any) => m.id === aiMsg.id);
  assert.equal(kept.text, "Don't worry, I've got this handled.");
  const ts = await engine.request(
    `/task-state?profileId=${pid}&characterId=${encodeURIComponent(cid)}&mode=chat`
  );
  assert.notEqual(ts.taskState?.status, 'paused', 'Translation error must NOT pause formal chat task state');

  // Verify System Log captured translation failure with translation task_type
  const errLogs = engine.getSystemLogs().filter((l: any) => l.mode === 'translation' && l.status === 'error');
  assert.ok(errLogs.length >= 1);

  // Case B: Proxy-wrapped HTTP 200 error
  failMode = 'proxy200';
  const f2 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [aiMsg.id],
    force: true,
  });
  assert.equal(f2.ok, false);
  assert.equal(f2.translations[aiMsg.id].status, 'error');

  // Case C: Malformed JSON
  failMode = 'badjson';
  const f3 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [aiMsg.id],
    force: true,
  });
  assert.equal(f3.ok, false);
  assert.equal(f3.translations[aiMsg.id].status, 'error');

  // Case D: Manual retry succeeds cleanly
  failMode = 'ok';
  const okRetry = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [aiMsg.id],
    force: true,
  });
  assert.equal(okRetry.ok, true);
  assert.equal(okRetry.translations[aiMsg.id].status, 'ready');
  assert.equal(okRetry.translations[aiMsg.id].translated_text, '别担心，我来处理。');
});

test('8. Message edit, regenerate, and recall invalidate stale translations cleanly', async () => {
  let genCount = -1;
  const { engine } = createBilingualSandbox({
    onFetch: async (_url, body) => {
      const sys = String(body.messages?.[0]?.content || '');
      if (sys.includes('系统阅读辅助翻译器')) {
        const payload = JSON.parse(String(body.messages?.[1]?.content || '{}'));
        return mockOpenAiOk(
          JSON.stringify({
            translations: payload.items.map((it: any) => ({ id: it.id, zh: `译文:${it.text}` })),
          })
        );
      }
      if (genCount < 0) return mockOpenAiOk('Opening hello.');
      genCount += 1;
      if (genCount === 1) return mockOpenAiOk('First version line.');
      return mockOpenAiOk('Regenerated fresh reply.');
    },
  });

  const { pid, cid } = await setupMatchedLeon(engine);
  genCount = 0;
  const sent = await sendAndReply(engine, pid, cid, '你在哪');
  const msg1 = sent.replies[0];

  // Translate initial message
  const tr1 = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [msg1.id],
  });
  assert.equal(tr1.translations[msg1.id].translated_text, '译文:First version line.');

  // 8a. Edit message -> stale translation must immediately disappear
  const edited = await engine.request('/message-edit', {
    profileId: pid,
    characterId: cid,
    messageId: msg1.id,
    text: 'Edited English message.',
  });
  assert.equal(edited.ok, true);
  assert.equal(edited.translationInvalidated, true);
  const threadAfterEdit = await engine.request(
    `/thread?profileId=${pid}&characterId=${encodeURIComponent(cid)}`
  );
  assert.equal(threadAfterEdit.translations[msg1.id], undefined, 'Stale translation must not appear after edit');

  // Re-translate edited message -> new translation matches edited content_version
  const trEdited = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [msg1.id],
  });
  assert.equal(trEdited.translations[msg1.id].translated_text, '译文:Edited English message.');

  // 8b. Regenerate trailing AI turn -> old message & translation removed, new message has no stale translation
  const regen = await engine.request('/message-regenerate', {
    profileId: pid,
    characterId: cid,
    messageId: msg1.id,
  });
  assert.equal(regen.ok, true);
  assert.ok(regen.removedIds.includes(msg1.id));
  assert.equal(regen.replies.length, 1);
  const newMsg = regen.replies[0];
  assert.equal(newMsg.text, 'Regenerated fresh reply.');
  const threadAfterRegen = await engine.request(
    `/thread?profileId=${pid}&characterId=${encodeURIComponent(cid)}`
  );
  assert.equal(threadAfterRegen.translations[msg1.id], undefined);
  assert.equal(threadAfterRegen.translations[newMsg.id], undefined);

  // Translate regenerated message, then 8c. Recall -> translation removed
  const trRegen = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [newMsg.id],
  });
  assert.equal(trRegen.translations[newMsg.id].translated_text, '译文:Regenerated fresh reply.');
  const recalled = await engine.request('/message-delete', {
    profileId: pid,
    characterId: cid,
    messageId: newMsg.id,
  });
  assert.equal(recalled.ok, true);
  const threadAfterRecall = await engine.request(
    `/thread?profileId=${pid}&characterId=${encodeURIComponent(cid)}`
  );
  assert.equal(
    threadAfterRecall.translations[newMsg.id],
    undefined,
    'Recalled message must not keep stale translation'
  );
});

test('10. Legacy save compatibility: preserves all existing data and initializes bilingual defaults safely', async () => {
  const legacyStore = new Map<string, string>();
  const legacyDb = {
    profiles: [
      {
        id: 'legacy-p1',
        name: 'OldUser',
        age: 27,
        gender: 'female',
        interested_in: ['all'],
        min_age: 18,
        max_age: 65,
        intent: '认识新朋友',
        sources: ['生化危机 · 游戏'],
        bio: '旧存档用户',
        interests: ['咖啡'],
        created_at: '2026-01-01 10:00:00',
      },
    ],
    swipes: [
      {
        profile_id: 'legacy-p1',
        character_id: 're-game:leon:re2',
        direction: 'right',
        created_at: '2026-01-01 10:01:00',
      },
    ],
    relations: {
      'legacy-p1|re-game:leon:re2': {
        profile_id: 'legacy-p1',
        character_id: 're-game:leon:re2',
        status: 'matched',
        stage: '心动',
        affection: 55,
        mode: 'chat',
        meeting_place: '',
        summary: '老存档关系摘要',
        created_at: '2026-01-01 10:01:00',
        updated_at: '2026-01-01 10:05:00',
      },
    },
    messages: [
      {
        id: 'legacy-msg-1',
        profile_id: 'legacy-p1',
        character_id: 're-game:leon:re2',
        sender: 'ai',
        mode: 'chat',
        text: 'Long time no see.',
        engine: 'live',
        created_at: '2026-01-01 10:02:00',
      },
    ],
    memories: [
      {
        id: 'legacy-mem-1',
        profile_id: 'legacy-p1',
        character_id: 're-game:leon:re2',
        kind: 'fact',
        content: '喜欢黑咖啡',
        created_at: '2026-01-01 10:03:00',
      },
    ],
    events: [],
    connection: {
      base_url: 'https://mock.parallel.local/v1',
      api_key: 'sk-legacy',
      model: 'mock-gpt',
      demo_mode: false,
      temperature: 0.9,
      max_tokens: 4096,
    },
    // Intentionally missing translations, auto_translate, character_language_pref, character_language_custom
  };
  legacyStore.set('parallel-portable-v2', JSON.stringify(legacyDb));

  const { engine } = createBilingualSandbox({ store: legacyStore });
  const settings = await engine.request('/settings');
  assert.equal(settings.auto_translate, true);
  assert.equal(settings.character_language_pref, 'natural');
  assert.equal(settings.character_language_custom, '');

  const thread = await engine.request('/thread?profileId=legacy-p1&characterId=re-game%3Aleon%3Are2');
  assert.equal(thread.messages.length, 1);
  assert.equal(thread.messages[0].text, 'Long time no see.');
  assert.equal(Object.keys(thread.translations || {}).length, 0);
  assert.equal(thread.relation.affection, 55);
  assert.equal(thread.relation.summary, '老存档关系摘要');
});

test('11. Zero pollution: translations never enter prompts, memories, relationship state, or unread counts', async () => {
  const UNIQUE_TRANSLATION_MARKER = 'UNIQUE_ZH_SUBTITLE_TOKEN_98765';
  const { engine, store } = createBilingualSandbox({
    onFetch: async (_url, body) => {
      const sys = String(body.messages?.[0]?.content || '');
      if (sys.includes('系统阅读辅助翻译器')) {
        const payload = JSON.parse(String(body.messages?.[1]?.content || '{}'));
        return mockOpenAiOk(
          JSON.stringify({
            translations: payload.items.map((it: any) => ({ id: it.id, zh: UNIQUE_TRANSLATION_MARKER })),
          })
        );
      }
      return mockOpenAiOk('See you at the rooftop tonight.');
    },
  });

  const { pid, cid } = await setupMatchedLeon(engine);
  const sent = await sendAndReply(engine, pid, cid, '今晚见');
  const aiMsg = sent.replies[0];

  const threadBefore = await engine.request(
    `/thread?profileId=${pid}&characterId=${encodeURIComponent(cid)}`
  );
  const msgCountBefore = threadBefore.messages.length;
  const affectionBefore = threadBefore.relation.affection;
  const threadsBefore = await engine.request(`/threads?profileId=${pid}`);
  const lastIncomingBefore = threadsBefore.threads[0].last_incoming?.id;
  const lastPreviewBefore = threadsBefore.threads[0].last_message?.text;

  // Run translation
  const tr = await engine.request('/translate-messages', {
    profileId: pid,
    characterId: cid,
    messageIds: [aiMsg.id],
  });
  assert.equal(tr.translations[aiMsg.id].translated_text, UNIQUE_TRANSLATION_MARKER);

  // Check thread message count, relationship affection, unread pointer, and preview text did NOT change
  const threadAfter = await engine.request(
    `/thread?profileId=${pid}&characterId=${encodeURIComponent(cid)}`
  );
  assert.equal(threadAfter.messages.length, msgCountBefore, 'Translation must not add a second message');
  assert.equal(
    threadAfter.relation.affection,
    affectionBefore,
    'Translation must not affect relationship affection'
  );
  const threadsAfter = await engine.request(`/threads?profileId=${pid}`);
  assert.equal(
    threadsAfter.threads[0].last_incoming?.id,
    lastIncomingBefore,
    'Translation must not change unread pointer'
  );
  assert.equal(
    threadsAfter.threads[0].last_message?.text,
    lastPreviewBefore,
    'Last formal message stays original text'
  );

  // Check subsequent chat Prompt does NOT contain translation text
  const nextPrompt = engine.buildPromptPreview(pid, cid, 'chat');
  const promptDump = JSON.stringify(nextPrompt);
  assert.equal(
    promptDump.includes(UNIQUE_TRANSLATION_MARKER),
    false,
    'Translation must NEVER enter subsequent chat Prompt'
  );
  assert.equal(
    promptDump.includes('See you at the rooftop tonight.'),
    true,
    'Original text remains in Prompt'
  );

  // Check stored memories, events, episodicMemories, diaries do NOT contain translation marker
  const rawDb = JSON.parse(store.get('parallel-portable-v2') || '{}');
  const nonTranslationDump = JSON.stringify({
    messages: rawDb.messages,
    memories: rawDb.memories,
    episodicMemories: rawDb.episodicMemories,
    dailySummaries: rawDb.dailySummaries,
    events: rawDb.events,
    relationships: rawDb.relationships,
  });
  assert.equal(
    nonTranslationDump.includes(UNIQUE_TRANSLATION_MARKER),
    false,
    'Translation must stay isolated inside db.translations only'
  );
  assert.equal(rawDb.translations[aiMsg.id].translated_text, UNIQUE_TRANSLATION_MARKER);
});

test('12. UI & Mobile layout guards: bilingual bubble classes, cream palette styling, and terminal settings present across synced assets', () => {
  const staticStyle = fs.readFileSync(
    path.resolve(process.cwd(), 'parallel_src/parallel_ai_date/static/style.css'),
    'utf8'
  );
  const publicStyle = fs.readFileSync(path.resolve(process.cwd(), 'public/parallel/style.css'), 'utf8');
  const staticApp = fs.readFileSync(
    path.resolve(process.cwd(), 'parallel_src/parallel_ai_date/static/app.js'),
    'utf8'
  );
  const publicApp = fs.readFileSync(path.resolve(process.cwd(), 'public/parallel/app.js'), 'utf8');
  const portableHtml = fs.readFileSync(
    path.resolve(process.cwd(), 'public/Parallel_v0.5_直接打开.html'),
    'utf8'
  );

  assert.equal(staticStyle, publicStyle, 'public/parallel/style.css must stay synced');
  assert.equal(staticApp, publicApp, 'public/parallel/app.js must stay synced');

  // Bilingual bubble CSS rules + mobile media query support
  for (const token of [
    '.bubble-orig',
    '.bubble-tr-divider',
    '.bubble-tr-text',
    '.bubble-tr-status',
    '.bubble-tr-error',
    '.bubble-tr-retry-btn',
  ]) {
    assert.ok(staticStyle.includes(token), `Missing CSS rule ${token}`);
    assert.ok(portableHtml.includes(token), `Portable HTML missing CSS rule ${token}`);
  }
  // Terminal settings & per-message controls in app.js and portable HTML
  for (const token of [
    'api-auto-translate',
    'api-char-lang-pref',
    'api-char-lang-custom',
    'toggle-translation',
    'retry-translation',
    'edit-message',
    'regenerate-message',
  ]) {
    assert.ok(staticApp.includes(token), `Missing UI hook ${token} in app.js`);
    assert.ok(portableHtml.includes(token), `Missing UI hook ${token} in portable HTML`);
  }
});
