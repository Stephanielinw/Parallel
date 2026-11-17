import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {
  stripProtocolTags,
  cleanChatBubbleText,
  cleanMeetingNovelText,
  splitChatBubbles,
  serializeWorkingHistory,
  sanitizeStoredDatabase,
} from './protocolCleaner.ts';

test('1. 单个协议头清洗（带时间戳与不带时间戳）', () => {
  assert.equal(
    cleanChatBubbleText('[短信 18:37] 今晚风有点凉，刚从排练室出来。'),
    '今晚风有点凉，刚从排练室出来。'
  );
  assert.equal(
    cleanChatBubbleText('[短信] 到家了吗？'),
    '到家了吗？'
  );
  assert.equal(
    cleanChatBubbleText('【短信 09:05】早安，咖啡给你买好了。'),
    '早安，咖啡给你买好了。'
  );
  assert.equal(
    cleanMeetingNovelText('[见面 19:47] 他推开玻璃门，带进一阵潮湿的夜风。'),
    '他推开玻璃门，带进一阵潮湿的夜风。'
  );
  assert.equal(
    cleanMeetingNovelText('[见面] 她把围巾往鼻尖拉了拉，抬头看向你。'),
    '她把围巾往鼻尖拉了拉，抬头看向你。'
  );
});

test('2. 多个重复协议头清洗', () => {
  assert.equal(
    cleanChatBubbleText('[短信 18:40][短信 18:40] 刚看到消息，久等了。'),
    '刚看到消息，久等了。'
  );
  assert.equal(
    cleanChatBubbleText('[短信 18:58][短信 18:58][短信 18:58] 我已经在楼下便利店门口了。'),
    '我已经在楼下便利店门口了。'
  );
  assert.equal(
    cleanChatBubbleText('[短信][短信 18:40][短信] 先喝点热水。'),
    '先喝点热水。'
  );
  assert.equal(
    cleanMeetingNovelText('[见面 19:47][见面 19:47][见面] 昏黄的路灯把两个人的影子拉得很长。'),
    '昏黄的路灯把两个人的影子拉得很长。'
  );
});

test('3. 不同时间戳与短信/见面混合出现清洗', () => {
  assert.equal(
    cleanChatBubbleText('[短信 18:37][短信 18:40][短信 18:58] 抱歉刚才在开会，手机静音了。'),
    '抱歉刚才在开会，手机静音了。'
  );
  assert.equal(
    cleanChatBubbleText('[短信 18:37][见面 19:47] 我到了，你在哪一桌？'),
    '我到了，你在哪一桌？'
  );
  assert.equal(
    cleanMeetingNovelText('[短信 19:40][见面 19:47] 他把手机揣回风衣口袋，朝你走了过来。'),
    '他把手机揣回风衣口袋，朝你走了过来。'
  );
});

test('4. 多条短信气泡拆分与逐气泡协议清洗', () => {
  const rawMulti = [
    '[短信 18:37] 刚忙完手头的事。',
    '[短信 18:38][短信 18:38] 你晚饭吃了吗？',
    '[短信] 没吃的话一起去巷口那家面馆？',
  ].join('\n');

  const bubbles = splitChatBubbles(rawMulti);
  assert.deepEqual(bubbles, [
    '刚忙完手头的事。',
    '你晚饭吃了吗？',
    '没吃的话一起去巷口那家面馆？',
  ]);

  // 单行内夹带带时间戳协议头的多气泡拆分
  const inlineMulti = '[短信 18:37] 我到地铁站了 [短信 18:38] A出口见';
  assert.deepEqual(splitChatBubbles(inlineMulti), ['我到地铁站了', 'A出口见']);
});

test('5. 面对面长篇多段落小说保留原始段落结构且不按气泡拆分', () => {
  const rawNovel = [
    '[见面 19:47][见面 19:47] 雨停后的石板路还泛着微弱的光，街角咖啡馆的木门被推开时，风铃轻轻晃了一下。',
    '[见面 19:48] 他把收起的黑伞靠在伞桶边，抬眼在暖黄色的灯光里寻找你的身影。看到你朝他挥手，他紧绷了一下午的眉梢终于松开。',
    '“外面的风比预想的大，”他在你对面坐下，指尖还带着一点夜雨的凉意，“等很久了吗？”',
  ].join('\n\n');

  const cleanedNovel = cleanMeetingNovelText(rawNovel);
  const paragraphs = cleanedNovel.split('\n\n');
  assert.equal(paragraphs.length, 3);
  assert.equal(
    paragraphs[0],
    '雨停后的石板路还泛着微弱的光，街角咖啡馆的木门被推开时，风铃轻轻晃了一下。'
  );
  assert.equal(
    paragraphs[1],
    '他把收起的黑伞靠在伞桶边，抬眼在暖黄色的灯光里寻找你的身影。看到你朝他挥手，他紧绷了一下午的眉梢终于松开。'
  );
  assert.equal(
    paragraphs[2],
    '“外面的风比预想的大，”他在你对面坐下，指尖还带着一点夜雨的凉意，“等很久了吗？”'
  );
  assert.ok(!cleanedNovel.includes('[见面'));
});

test('6. 已污染历史的再次回注：不注入协议头到消息正文，且清洗历史残留污染', () => {
  const pollutedHistory = [
    {
      id: 'm1',
      sender: 'user',
      mode: 'chat',
      text: '今晚八点老地方见？',
      created_at: '2026-11-16T10:37:00.000Z',
    },
    {
      id: 'm2',
      sender: 'ai',
      mode: 'chat',
      text: '[短信 18:37][短信 18:40] 好，我忙完这阵就过去。',
      created_at: '2026-11-16T10:40:00.000Z',
    },
    {
      id: 'm3',
      sender: 'ai',
      mode: 'meeting',
      text: '[见面 19:47] 他站在路灯下朝你挥了挥手。',
      created_at: '2026-11-16T11:47:00.000Z',
    },
  ];

  const { systemTimelineNote, chatMessages } = serializeWorkingHistory(
    pollutedHistory,
    (iso) => (iso ? iso.slice(11, 16) : '--:--')
  );

  // 时间与模式信息作为独立系统元数据提供
  assert.ok(systemTimelineNote.includes('近期活跃对话时间与模式索引'));
  assert.ok(systemTimelineNote.includes('10:37 · 手机聊天'));
  assert.ok(systemTimelineNote.includes('10:40 · 手机聊天'));
  assert.ok(systemTimelineNote.includes('11:47 · 面对面见面'));

  // 传给模型的 user / assistant 消息正文彻底不含任何 [短信] / [见面] 协议头
  assert.deepEqual(chatMessages, [
    { role: 'user', content: '今晚八点老地方见？' },
    { role: 'assistant', content: '好，我忙完这阵就过去。' },
    { role: 'assistant', content: '他站在路灯下朝你挥了挥手。' },
  ]);
});

test('7 & 9. 旧存档幂等兼容清理 + 消息 ID / 时间戳 / 记忆引用关系完整性保护', () => {
  const legacyDb = {
    messages: [
      {
        id: 'msg-user-1',
        profile_id: 'prof-1',
        character_id: 'char-1',
        sender: 'user',
        mode: 'chat',
        text: '[短信 18:37] 这是用户自己故意打的字，不该被误删',
        created_at: '2026-11-16T10:37:00.000Z',
      },
      {
        id: 'msg-ai-1',
        profile_id: 'prof-1',
        character_id: 'char-1',
        sender: 'ai',
        mode: 'chat',
        text: '[短信 18:40][短信 18:40] 抱歉久等了！',
        created_at: '2026-11-16T10:41:12.000Z',
      },
      {
        id: 'msg-ai-2',
        profile_id: 'prof-1',
        character_id: 'char-1',
        sender: 'ai',
        mode: 'meeting',
        meeting_id: 'meet_msg-ai-2',
        text: '[见面 19:47] 他把菜单推到你面前。\n\n“看看想吃什么。”',
        created_at: '2026-11-16T11:47:30.000Z',
      },
    ],
    episodicMemories: [
      {
        id: 'mem-1',
        profile_id: 'prof-1',
        character_id: 'char-1',
        source_type: 'daily-summary',
        summary: '2026-11-16 手机聊天：对方说「[短信 18:40] 抱歉久等了！」',
        raw_msg_ids: ['msg-user-1', 'msg-ai-1'],
        day_messages: [
          {
            id: 'msg-ai-1',
            sender: 'ai',
            speaker: '角色A',
            text: '[短信 18:40][短信 18:40] 抱歉久等了！',
            created_at: '2026-11-16T10:41:12.000Z',
          },
        ],
      },
      {
        id: 'mem-2',
        profile_id: 'prof-1',
        character_id: 'char-1',
        source_type: 'meeting_summary',
        meeting_id: 'meet_msg-ai-2',
        summary: '和你在咖啡馆碰面：[见面 19:47] 他把菜单推到你面前。',
        raw_msg_ids: ['msg-ai-2'],
        meeting_data: {
          id: 'meet_msg-ai-2',
          summary: '[见面 19:47] 他把菜单推到你面前。',
          entries: [
            {
              id: 'msg-ai-2',
              sender: 'ai',
              text: '[见面 19:47] 他把菜单推到你面前。\n\n“看看想吃什么。”',
              created_at: '2026-11-16T11:47:30.000Z',
            },
          ],
        },
      },
    ],
    meetings: [
      {
        id: 'meet_msg-ai-2',
        profile_id: 'prof-1',
        character_id: 'char-1',
        message_ids: ['msg-ai-2'],
        summary: '[见面 19:47] 他把菜单推到你面前。',
        ai_summary: '[见面 19:47] 两人一起在咖啡馆看菜单。',
        entries: [
          {
            id: 'msg-ai-2',
            sender: 'ai',
            text: '[见面 19:47] 他把菜单推到你面前。\n\n“看看想吃什么。”',
            created_at: '2026-11-16T11:47:30.000Z',
          },
        ],
      },
    ],
    events: [
      {
        id: 'ev-1',
        summary: '[短信 18:40] 角色发来问候',
      },
    ],
    surveillance: [
      {
        key: 'prof-1::char-1::2026-11-16',
        slots: [
          {
            start: '18:00',
            end: '20:00',
            scene: '[见面 19:47] 在街角咖啡馆等待你的到来。',
          },
        ],
      },
    ],
  };

  const firstRun = sanitizeStoredDatabase(legacyDb);
  assert.equal(firstRun.cleanedMessages, 2);
  assert.equal(firstRun.cleanedMemories, 2);
  assert.equal(firstRun.cleanedMeetings, 1);
  assert.equal(firstRun.cleanedEvents, 1);

  // 用户自己的消息保持原样
  assert.equal(
    legacyDb.messages[0].text,
    '[短信 18:37] 这是用户自己故意打的字，不该被误删'
  );
  // AI 污染消息已清理，且 ID / 时间戳 / 归属关系完全不变
  assert.equal(legacyDb.messages[1].id, 'msg-ai-1');
  assert.equal(legacyDb.messages[1].created_at, '2026-11-16T10:41:12.000Z');
  assert.equal(legacyDb.messages[1].profile_id, 'prof-1');
  assert.equal(legacyDb.messages[1].character_id, 'char-1');
  assert.equal(legacyDb.messages[1].text, '抱歉久等了！');

  // 面对面小说段落换行完整保留，且 meeting_id 未变
  assert.equal(legacyDb.messages[2].id, 'msg-ai-2');
  assert.equal(legacyDb.messages[2].meeting_id, 'meet_msg-ai-2');
  assert.equal(
    legacyDb.messages[2].text,
    '他把菜单推到你面前。\n\n“看看想吃什么。”'
  );

  // 记忆引用 raw_msg_ids 完整保留，内容已净化
  assert.deepEqual(legacyDb.episodicMemories[0].raw_msg_ids, [
    'msg-user-1',
    'msg-ai-1',
  ]);
  assert.equal(
    legacyDb.episodicMemories[0].day_messages?.[0]?.text,
    '抱歉久等了！'
  );
  assert.equal(
    legacyDb.meetings[0].entries[0].text,
    '他把菜单推到你面前。\n\n“看看想吃什么。”'
  );
  assert.equal(
    legacyDb.surveillance[0].slots[0].scene,
    '在街角咖啡馆等待你的到来。'
  );

  // 再次执行保证完全幂等
  const secondRun = sanitizeStoredDatabase(legacyDb);
  assert.equal(secondRun.cleanedMessages, 0);
  assert.equal(secondRun.cleanedMemories, 0);
  assert.equal(secondRun.cleanedMeetings, 0);
  assert.equal(secondRun.cleanedEvents, 0);
});

test('8. 正常正文中含有括号、引号内协议样式文字或句中引用时不被误删、不误拆气泡', () => {
  const normalSamples = [
    '他说：“请打开[短信 18:37]那条记录。”',
    '她指着屏幕说：“对方：[短信 18:37] 那条记录。”',
    '对方：[短信 18:37] 那条记录。',
    '她说：「聊天：[见面 19:47] 是那条记录的标题。」',
    '请查看 [短信 18:37] 那条记录。',
    '[街角咖啡馆] 靠窗第二桌，我穿了深灰大衣。',
    '[18:37] 备忘录：明天上午十点交周报。',
    '刚才在[短信]里没说清楚，当面跟你说比较好。',
    '她说：“无论是[短信]还是[见面]，我都希望能认真回应你。”',
    '【系统提示：电梯维护中】我们走楼梯上去吧。',
    '我们约在 18:37 见面，你路上慢点。',
  ];

  for (const sample of normalSamples) {
    assert.equal(stripProtocolTags(sample), sample);
    assert.equal(cleanChatBubbleText(sample), sample);
    assert.equal(cleanMeetingNovelText(sample), sample);
    assert.deepEqual(splitChatBubbles(sample), [sample]);
  }

  // 当行首确实有内部协议头，但句中同时包含对某条记录的正常引用时：只移除行首协议头，保留句中引用且不误拆气泡
  assert.deepEqual(
    splitChatBubbles('[短信 18:40] 他说：“请打开[短信 18:37]那条记录。”'),
    ['他说：“请打开[短信 18:37]那条记录。”']
  );
  assert.deepEqual(
    splitChatBubbles('[短信 18:40] 请查看 [短信 18:37] 那条记录。'),
    ['请查看 [短信 18:37] 那条记录。']
  );
});

test('10. 集成回归测试：加载实际 offline.js + Mock API 验证全部 7 个入口、时间来源统一、用户内容保护与多轮零累积', async () => {
  const offlineCode = fs.readFileSync(
    'parallel_src/parallel_ai_date/static/offline.js',
    'utf8'
  );

  const charId = 're-game:leon:re2';
  const storageMap = new Map<string, string>();
  // 预置一份带有历史协议污染的旧存档，验证启动时自动兼容清理
  const seededLegacyDb = {
    profiles: [
      {
        id: 'p_test',
        name: '测试玩家',
        age: 22,
        gender: 'female',
        interested_in: ['all'],
        min_age: 18,
        max_age: 99,
        intent: '认识新朋友',
        bio: '喜欢散步和咖啡',
        interests: ['电影'],
        sources: ['生化危机 · 游戏'],
        avatar: '',
        role_character_id: '',
        role_hint: '',
        created_at: '2026-11-16T08:00:00.000Z',
      },
    ],
    swipes: { [`p_test|${charId}`]: { direction: 'right', updated_at: '2026-11-16T08:05:00.000Z' } },
    relations: {
      [`p_test|${charId}`]: {
        profile_id: 'p_test',
        character_id: charId,
        status: 'matched',
        mode: 'chat',
        attempts: 1,
        updated_at: '2026-11-16T08:05:00.000Z',
      },
    },
    messages: [
      {
        id: 'legacy_m1',
        profile_id: 'p_test',
        character_id: charId,
        sender: 'ai',
        mode: 'chat',
        text: '[短信 18:37][短信 18:40] 这是旧存档里被污染的开场白。',
        created_at: '2026-11-16T08:06:00.000Z',
        engine: 'live',
      },
    ],
    events: [],
    episodicMemories: [
      {
        id: 'legacy_mem1',
        owner_id: charId,
        profile_id: 'p_test',
        character_id: charId,
        source_type: 'confirmed_fact',
        source_key: 'fact:latte',
        knowledge_mode: 'stated',
        summary: '[短信 18:37] 记得测试玩家喜欢热拿铁',
        tags: ['热拿铁'],
        importance: 3,
        emotional_weight: 2,
        unresolved: false,
        clarifies_id: '',
        disputed: false,
        raw_msg_ids: ['legacy_m1'],
        event_at: '2026-11-16T08:06:00.000Z',
        created_at: '2026-11-16T08:06:00.000Z',
      },
    ],
    meetings: [],
    surveillance: {},
    diaries: {},
    queue: {},
    portraits: {},
    photoDescriptions: {},
    bios: {},
    bioTags: {},
    proactiveLog: {},
    presets: [
      {
        id: 'chat-main',
        mode: 'chat',
        name: '手机聊天 · 自然气泡',
        enabled: true,
        role: 'system',
        content: '你正在使用一款约会软件。只输出角色实际发出的消息正文。',
        sort_order: 0,
      },
      {
        id: 'meeting-main',
        mode: 'meeting',
        name: '面对面 · 小说模式',
        enabled: true,
        role: 'system',
        content: '你和对方已在同一地点见面。写细腻的小说式现实互动。',
        sort_order: 1,
      },
    ],
    connection: {
      base_url: 'https://mock.parallel.local/v1',
      api_key: 'sk-mock-test-key',
      model: 'mock-gpt-4o',
      image_base_url: '',
      image_api_key: '',
      image_model: '',
      temperature: 0.7,
      top_p: 1,
      max_tokens: 1200,
      auto_portraits: false,
      demo_enabled: false,
      proactive_mode: 'daily',
    },
  };
  storageMap.set('parallel-portable-v2', JSON.stringify(seededLegacyDb));

  const capturedChatPayloads: Array<Array<{ role: string; content: string }>> = [];
  const mockReplyQueue: string[] = [];

  const mockFetch = async (_url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    if (Array.isArray(body.messages)) {
      capturedChatPayloads.push(body.messages);
    }
    const nextContent =
      mockReplyQueue.shift() ||
      '[短信 23:59][短信 23:59] 默认模拟回复正文。';
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: nextContent } }],
      }),
    };
  };

  const sandbox: Record<string, unknown> = {
    window: {},
    globalThis: {},
    localStorage: {
      getItem: (k: string) => (storageMap.has(k) ? storageMap.get(k)! : null),
      setItem: (k: string, v: string) => storageMap.set(k, String(v)),
      removeItem: (k: string) => storageMap.delete(k),
    },
    fetch: mockFetch,
    crypto: { randomUUID: () => 'uuid-' + Math.random().toString(36).slice(2, 10) },
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    Date,
    Math,
    JSON,
    console,
    setTimeout,
    clearTimeout,
  };
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(offlineCode, sandbox);

  const offlineExport = sandbox.ParallelOffline as {
    request: (path: string, data?: unknown) => Promise<Record<string, any>>;
    stripProtocolTags: (raw: string, opts?: { preserveParagraphs?: boolean }) => string;
  };
  const api = offlineExport.request;

  // 验证 offline.js 导出的 stripProtocolTags 对 GPT 审查指出的两个失败案例保持原样
  assert.equal(
    offlineExport.stripProtocolTags('他说：“请打开[短信 18:37]那条记录。”'),
    '他说：“请打开[短信 18:37]那条记录。”'
  );
  assert.equal(
    offlineExport.stripProtocolTags('请查看 [短信 18:37] 那条记录。'),
    '请查看 [短信 18:37] 那条记录。'
  );

  // 验证存量旧存档在初始化时已完成幂等清理，且 ID 与 created_at 未变
  const initThread = await api(`/thread?profileId=p_test&characterId=${encodeURIComponent(charId)}`);
  assert.equal(initThread.messages[0].id, 'legacy_m1');
  assert.equal(initThread.messages[0].created_at, '2026-11-16T08:06:00.000Z');
  assert.equal(initThread.messages[0].text, '这是旧存档里被污染的开场白。');

  const initMemories = await api(`/memories?profileId=p_test&characterId=${encodeURIComponent(charId)}`);
  assert.equal(initMemories.memories[0].id, 'legacy_mem1');
  assert.equal(initMemories.memories[0].summary, '记得测试玩家喜欢热拿铁');
  assert.deepEqual(Array.from(initMemories.memories[0].raw_msg_ids), ['legacy_m1']);

  // 入口 1 & 2：发送多条消息并执行批量回复（/message + /chat-flush），同时验证模型返回句中引用不被误拆或误删
  mockReplyQueue.push(
    '[短信 18:37][短信 18:40] 他说：“请打开[短信 18:37]那条记录。”\n[短信 18:58][短信 18:58][短信 18:58] 请查看 [短信 18:37] 那条记录。'
  );
  await api('/message', {
    profileId: 'p_test',
    characterId: charId,
    text: '[短信 18:37] 这是用户自己发的带标签约定消息，回注时不得被清洗',
  });
  const flushRes = await api('/chat-flush', {
    profileId: 'p_test',
    characterId: charId,
    force: true,
  });
  assert.equal(flushRes.replies.length, 2);
  assert.equal(flushRes.replies[0].text, '他说：“请打开[短信 18:37]那条记录。”');
  assert.equal(flushRes.replies[1].text, '请查看 [短信 18:37] 那条记录。');
  assert.ok(flushRes.replies[0].created_at.includes('T'));

  // 验证用户原始消息在回注给模型时完全保留原样（未被清洗掉 [短信 18:37]）
  const lastPayload = capturedChatPayloads[capturedChatPayloads.length - 1];
  assert.ok(
    lastPayload.some(
      (m) =>
        m.role === 'user' &&
        m.content === '[短信 18:37] 这是用户自己发的带标签约定消息，回注时不得被清洗'
    ),
    '用户原始消息回注时不得执行协议清洗'
  );

  // 入口 3：手动继续回复（/reply 短信模式）
  mockReplyQueue.push('[短信 19:02] 刚泡了一杯热可可，你要不要也喝一点？');
  const contChatRes = await api('/reply', {
    profileId: 'p_test',
    characterId: charId,
  });
  assert.equal(
    contChatRes.reply.text,
    '刚泡了一杯热可可，你要不要也喝一点？'
  );

  // 入口 4：主动消息（/proactive-check）
  mockReplyQueue.push(
    '[短信 20:15][短信 20:15] 路过一家花店，看到向日葵开得很好。\n[短信 20:16] 顺手拍给你看。'
  );
  const proactiveRes = await api('/proactive-check', {
    profileId: 'p_test',
    characterId: charId,
    trigger: 'manual',
  });
  assert.equal(proactiveRes.delivered.length, 1);
  assert.deepEqual(
    Array.from(proactiveRes.delivered[0].replies, (r: { text: string }) => r.text),
    ['路过一家花店，看到向日葵开得很好。', '顺手拍给你看。']
  );

  // 入口 5：面对面见面开场小说（/mode triggerOpening）
  mockReplyQueue.push(
    '[见面 19:47][见面 19:47] 他站在书店廊下收起雨伞，指节轻轻叩了叩玻璃窗。\n\n[见面 19:48] “外面起风了，快进来吧。”他替你拂去肩头细碎的雨珠。'
  );
  const modeOpenRes = await api('/mode', {
    profileId: 'p_test',
    characterId: charId,
    mode: 'meeting',
    triggerOpening: true,
  });
  // 面对面模式必须保持单条多段落小说，不拆分成多条短信气泡，且清除所有 [见面 HH:MM]
  assert.ok(modeOpenRes.openingReply);
  assert.equal(
    modeOpenRes.openingReply.text,
    '他站在书店廊下收起雨伞，指节轻轻叩了叩玻璃窗。\n\n“外面起风了，快进来吧。”他替你拂去肩头细碎的雨珠。'
  );

  // 入口 6：面对面模式下的正常互动回复与手动继续回复（/message & /reply in meeting mode）
  mockReplyQueue.push(
    '[见面 19:52] 他接过你递来的纸巾，眼神在暖光下显得格外柔和。\n\n“刚刚一直在想你什么时候到。”'
  );
  const meetMsgRes = await api('/message', {
    profileId: 'p_test',
    characterId: charId,
    text: '[见面 19:50] 我把热咖啡递给他。',
  });
  assert.equal(
    meetMsgRes.reply.text,
    '他接过你递来的纸巾，眼神在暖光下显得格外柔和。\n\n“刚刚一直在想你什么时候到。”'
  );
  // 验证见面记录中用户原始条目未被清洗
  const afterMeetThread = await api(`/thread?profileId=p_test&characterId=${encodeURIComponent(charId)}`);
  const latestMeeting = afterMeetThread.meetings[afterMeetThread.meetings.length - 1];
  assert.ok(
    latestMeeting.entries.some(
      (e: { sender: string; text: string }) =>
        e.sender === 'user' && e.text === '[见面 19:50] 我把热咖啡递给他。'
    ),
    '用户原始内容进入见面记录时应得到保护'
  );

  mockReplyQueue.push(
    '[见面 19:55][见面 19:55] 窗外的雨声渐渐小了，咖啡机的蒸汽声在安静的店里格外清晰。\n\n他低头抿了一口热咖啡，唇角浮起一点浅淡的笑意。'
  );
  const meetContinueRes = await api('/reply', {
    profileId: 'p_test',
    characterId: charId,
  });
  assert.equal(
    meetContinueRes.reply.text,
    '窗外的雨声渐渐小了，咖啡机的蒸汽声在安静的店里格外清晰。\n\n他低头抿了一口热咖啡，唇角浮起一点浅淡的笑意。'
  );

  // 入口 7：首次匹配与解除后重新匹配问候（/swipe right 初次 & 再次匹配）
  const deckRes = await api('/candidates?profileId=p_test');
  const nextCandidate = deckRes.candidates[0];
  assert.ok(nextCandidate, '应存在可右滑匹配的候选角色');
  mockReplyQueue.push(
    '{"match": true}',
    '[短信 21:05][短信 21:05] 嗨，很高兴在这个平行时空刷到你。'
  );
  const firstMatchRes = await api('/swipe', {
    profileId: 'p_test',
    characterId: nextCandidate.id,
    direction: 'right',
  });
  assert.equal(firstMatchRes.matched, true);
  assert.equal(firstMatchRes.again, false);
  assert.equal(
    firstMatchRes.replies[0].text,
    '嗨，很高兴在这个平行时空刷到你。'
  );

  // 解除匹配后再次右滑匹配（重新匹配消息）
  await api('/unmatch', {
    profileId: 'p_test',
    characterId: nextCandidate.id,
  });
  mockReplyQueue.push(
    '{"match": true}',
    '[短信 21:10][短信 21:12] 没想到这么快又刷到你了，看来很有缘分。'
  );
  const rematchRes = await api('/swipe', {
    profileId: 'p_test',
    characterId: nextCandidate.id,
    direction: 'right',
  });
  assert.equal(rematchRes.matched, true);
  assert.equal(rematchRes.again, true);
  assert.equal(
    rematchRes.replies[0].text,
    '没想到这么快又刷到你了，看来很有缘分。'
  );

  // 检查多轮请求中传给 LLM 的 assistant 消息，确认没有任何头部协议标记泄漏或累积
  assert.ok(capturedChatPayloads.length >= 6);
  for (const payload of capturedChatPayloads) {
    for (const msg of payload) {
      if (msg.role === 'assistant') {
        assert.ok(
          !/^\s*(?:\[|【)\s*(?:短信|见面)/m.test(msg.content),
          `发现模型 assistant 上下文消息体仍含有头部协议标记: ${msg.content}`
        );
      }
    }
  }
});
