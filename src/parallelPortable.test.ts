import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function createPortableEngine(options?: {
  store?: Map<string, string>;
  fetchImpl?: (url: string, init?: any) => Promise<any>;
}) {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'public/parallel/offline.js'),
    'utf8'
  );
  const store = options?.store ?? new Map<string, string>();
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, v);
    },
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
    fetch:
      options?.fetchImpl ??
      (async () => {
        throw new Error('network disabled in unit tests');
      }),
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
        options?: Record<string, unknown>
      ) => Array<{ role: string; content: string }>;
      diagnosePresets: (mode?: string) => any;
      splitChatBubbles: (raw: string) => string[];
      getSystemLogs: () => any[];
      clearSystemLogs: () => any[];
      exportData: () => string;
      importData: (raw: string) => { profiles: number; messages: number };
    },
    store,
  };
}

test('Parallel v0.5 four-layer memory isolation, on-demand retrieval, and conversational correction', async () => {
  const { engine } = createPortableEngine();
  const steph = (
    await engine.request('/profile', {
      name: 'Stephanie',
      age: 26,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认识新朋友',
      sources: ['生化危机 · 游戏'],
      bio: '喜欢悬疑电影与黑咖啡',
      interests: ['电影', '黑咖啡'],
    })
  ).profile;

  const alice = (
    await engine.request('/profile', {
      name: 'Alice',
      age: 24,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认真寻找恋人',
      sources: ['生化危机 · 游戏'],
      bio: '喜欢滑雪',
      interests: ['滑雪'],
    })
  ).profile;

  const cid = 're-game:leon:re2';
  for (let i = 0; i < 15; i++) {
    if ((await engine.request('/swipe', { profileId: steph.id, characterId: cid, direction: 'right' })).matched) break;
  }
  for (let i = 0; i < 15; i++) {
    if ((await engine.request('/swipe', { profileId: alice.id, characterId: cid, direction: 'right' })).matched) break;
  }

  await engine.request('/memory-action', {
    profileId: alice.id,
    characterId: cid,
    action: 'add',
    summary: '与 Alice 约定去阿尔卑斯山滑雪',
  });

  // 1. Strict isolation: Stephanie's prompt must never include Alice's name or memories
  const stephPrompt = JSON.stringify(engine.buildPromptPreview(steph.id, cid, 'chat'));
  assert.ok(!stephPrompt.includes('Alice'), 'Other profile name never leaks into prompt');
  assert.ok(!stephPrompt.includes('阿尔卑斯山'), 'Other profile memory never leaks into prompt');
  assert.ok(stephPrompt.includes('【第一层 · 身份记忆'), 'Layer 1 Identity Memory present');
  assert.ok(stephPrompt.includes('【第二层 · 关系记忆基线'), 'Layer 2 Relationship Baseline present');
  assert.ok(stephPrompt.includes('【第三层 · 按需检索命中的过往记忆'), 'Layer 3 Retrieved Episodic Memory header present');
  assert.ok(stephPrompt.includes('【第四层 · 当前状态'), 'Layer 4 Current State header present');

  // 2. On-demand retrieval recalls relevant memories under (cid, steph.id)
  await engine.request('/memory-action', {
    profileId: steph.id,
    characterId: cid,
    action: 'add',
    summary: 'Stephanie 提到周六想去老城区唱片行买爵士黑胶',
  });
  const memSearch = await engine.request(
    `/memories?profileId=${steph.id}&characterId=${encodeURIComponent(cid)}&query=${encodeURIComponent('老城区爵士黑胶')}`
  );
  assert.ok(
    memSearch.recalledPreview.some((m: any) => m.summary.includes('爵士黑胶')),
    'Keyword & bigram search retrieves relevant episodic memory'
  );

  // 3. Conversational correction marks old memory disputed and inserts a clarification record
  await engine.request('/message', {
    profileId: steph.id,
    characterId: cid,
    text: '你记错了，我们没有去老城区唱片行买爵士黑胶',
  });
  const afterCorr = await engine.request(
    `/memories?profileId=${steph.id}&characterId=${encodeURIComponent(cid)}&query=${encodeURIComponent('唱片行')}`
  );
  const orig = afterCorr.memories.find(
    (m: any) => m.source_type !== 'correction' && m.summary.includes('老城区唱片行买爵士黑胶')
  );
  assert.equal(orig?.disputed, 1, 'Original memory marked disputed after conversational correction');
  assert.ok(
    afterCorr.memories.some((m: any) => m.source_type === 'correction' && m.clarifies_id === orig?.id),
    'Correction memory entry added and linked via clarifies_id'
  );
});

test('Parallel v0.5 source tag aliases and installment filtering (巫师3, 生化2)', async () => {
  const { engine } = createPortableEngine();
  const witcher = (
    await engine.request('/profile', {
      name: 'WitcherPlayer',
      age: 24,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 99,
      sources: ['巫师3'],
      intent: '认真寻找恋人',
      interests: ['昆特牌', '剑术'],
      bio: '寻找同路人',
    })
  ).profile;

  const wDiscover = await engine.request('/discover', { profileId: witcher.id });
  assert.ok(wDiscover.candidates.length > 0, '巫师3 should match Witcher 3 characters');
  assert.ok(
    wDiscover.candidates.every((c: any) => c.source === '巫师 · 游戏'),
    'All candidates for 巫师3 belong to 巫师 · 游戏'
  );

  const re2 = (
    await engine.request('/profile', {
      name: 'RaccoonFan',
      age: 22,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 99,
      sources: ['生化2'],
      intent: '认识新朋友',
      interests: ['摩托车'],
      bio: '浣熊市新人',
    })
  ).profile;

  const r2Discover = await engine.request('/discover', { profileId: re2.id });
  assert.ok(
    r2Discover.candidates.some((c: any) => c.id === 're-game:leon:re2'),
    '生化2 includes RE2 Leon'
  );
  assert.ok(
    !r2Discover.candidates.some((c: any) => c.id === 're-game:leon:re4'),
    '生化2 does not false-match RE4 Leon (2004)'
  );
});

test('Parallel v0.5 Chinese character full-name identify (艾达王, 冬日战士)', async () => {
  const { engine } = createPortableEngine();
  const ada = await engine.request('/identify?name=' + encodeURIComponent('艾达王'));
  assert.ok(ada.matches.some((m: any) => m.name === 'Ada Wong'));

  const bucky = await engine.request('/identify?name=' + encodeURIComponent('冬日战士'));
  assert.ok(bucky.matches.some((m: any) => m.name === 'Bucky Barnes'));
});

test('Parallel v0.5 matched candidate exclusion, message deletion, and legacy backup restore', async () => {
  const { engine } = createPortableEngine();
  const p = (
    await engine.request('/profile', {
      name: 'Stephanie',
      age: 26,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认识新朋友',
      sources: ['生化危机 · 游戏'],
      bio: '喜欢咖啡',
      interests: ['咖啡'],
    })
  ).profile;

  const cid = 're-game:leon:re2';
  let matched = false;
  for (let i = 0; i < 15; i++) {
    const res = await engine.request('/swipe', {
      profileId: p.id,
      characterId: cid,
      direction: 'right',
    });
    if (res.matched) {
      matched = true;
      break;
    }
  }
  assert.equal(matched, true);

  // Already matched character is excluded from discover pool
  const afterMatchPool = (await engine.request('/discover', { profileId: p.id })).candidates;
  assert.ok(!afterMatchPool.some((c: any) => c.id === cid));

  // Duplicate right swipe returns already_matched: true
  const dupSwipe = await engine.request('/swipe', {
    profileId: p.id,
    characterId: cid,
    direction: 'right',
  });
  assert.equal(dupSwipe.already_matched, true);

  // Queue message and delete it
  const sent = await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '不小心发错的消息',
  });
  assert.equal(sent.queue.count, 1);

  const thread = await engine.request(`/thread?profileId=${p.id}&characterId=${cid}`);
  const lastMsg = thread.messages[thread.messages.length - 1];
  const delRes = await engine.request('/message-delete', {
    profileId: p.id,
    characterId: cid,
    messageId: lastMsg.id,
  });
  assert.equal(delRes.ok, true);
  assert.equal(delRes.queue.count, 0);

  // Legacy backup restore without photoDescriptions or bios
  const rawBackup = JSON.parse(engine.exportData());
  delete rawBackup.data.photoDescriptions;
  delete rawBackup.data.bios;
  delete rawBackup.data.queue;
  engine.importData(JSON.stringify(rawBackup));

  const photo = await engine.request('/photo-description', { characterId: cid });
  assert.ok(photo.description.includes('Leon'));
});

test('Parallel v0.5 Image AI connection settings and text/live mode toggle', async () => {
  const { engine } = createPortableEngine();
  const initial = await engine.request('/settings');
  assert.equal(initial.image_mode, 'text');
  assert.equal(initial.has_image_key, false);

  const updated = (
    await engine.request('/settings', {
      image_base_url: 'https://api.example.com/v1',
      image_api_key: 'sk-img-test-123',
      image_model: 'dall-e-3',
    })
  ).settings;
  assert.equal(updated.has_image_key, true);
  assert.equal(updated.image_mode, 'live');
  assert.equal('image_api_key' in updated, false);

  const exported = JSON.parse(engine.exportData());
  assert.equal(exported.data.connection.image_api_key, '');

  const cleared = (
    await engine.request('/settings', {
      clear_image_key: true,
    })
  ).settings;
  assert.equal(cleared.has_image_key, false);
  assert.equal(cleared.image_mode, 'text');
});

test('Parallel v0.5 API detection, normal mode vs demo mode, message recall prompt notice, and multi-bubble replies', async () => {
  const { engine } = createPortableEngine();
  const initial = await engine.request('/settings');
  assert.equal(initial.has_api_config, false, 'Fresh store has no API config filled');

  // Switch to normal mode (demo_enabled: false) when no API is configured
  const normalCfg = (await engine.request('/settings', { demo_enabled: false })).settings;
  assert.equal(normalCfg.demo_enabled, false);
  assert.equal(normalCfg.mode, 'normal');

  const p = (
    await engine.request('/profile', {
      name: 'NaiEn',
      age: 23,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认真寻找恋人',
      sources: ['生化危机 · 游戏'],
      bio: '测试撤回与多气泡',
      interests: ['音乐'],
    })
  ).profile;
  const cid = 're-game:leon:re2';
  for (let i = 0; i < 15; i++) {
    if ((await engine.request('/swipe', { profileId: p.id, characterId: cid, direction: 'right' })).matched) break;
  }

  // In normal mode without API config, flushing chat returns warning and null reply instead of generating demo replies
  const sent = await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '这条秘密消息一会儿要撤回12345',
  });
  assert.equal(sent.queue.count, 1);
  assert.equal(sent.queue.pendingIds.length, 1);

  const blockedFlush = await engine.request('/chat-flush', {
    profileId: p.id,
    characterId: cid,
    force: true,
  });
  assert.equal(blockedFlush.reply, null, 'Normal mode without API does not generate demo reply');
  assert.ok(blockedFlush.warning.includes('尚未连接 API'), 'Normal mode without API returns clear warning');

  // Recall the user message: AI sees recall notice in prompt, NOT the secret content
  const threadBefore = await engine.request(`/thread?profileId=${p.id}&characterId=${cid}`);
  const targetMsg = threadBefore.messages[threadBefore.messages.length - 1];
  const recallRes = await engine.request('/message-delete', {
    profileId: p.id,
    characterId: cid,
    messageId: targetMsg.id,
  });
  assert.equal(recallRes.ok, true);
  assert.equal(recallRes.recalled, true);
  assert.equal(recallRes.queue.count, 0);

  const promptAfterRecall = JSON.stringify(engine.buildPromptPreview(p.id, cid, 'chat'));
  assert.ok(
    !promptAfterRecall.includes('这条秘密消息一会儿要撤回12345'),
    'Recalled message content must never leak to AI prompt'
  );
  assert.ok(
    promptAfterRecall.includes('对方刚刚撤回了一条消息'),
    'AI prompt includes notice that user recalled a message'
  );

  // Enable demo mode and verify multi-bubble replies array is returned
  await engine.request('/settings', { demo_enabled: true });
  await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '你在干嘛呀？',
  });
  const flushed = await engine.request('/chat-flush', {
    profileId: p.id,
    characterId: cid,
    force: true,
  });
  assert.ok(Array.isArray(flushed.replies) && flushed.replies.length >= 1, 'Returns replies array for multi-bubble display');
  assert.ok(flushed.reply && flushed.reply.text, 'Returns last reply item for backwards compatibility');

  // Proactive check (/proactive-check) with an unresolved promise memory
  await engine.request('/memory-action', {
    profileId: p.id,
    characterId: cid,
    action: 'add',
    summary: '约定明天一起去靶场练习射击',
  });
  const proactiveRes = await engine.request('/proactive-check', {
    profileId: p.id,
    trigger: 'manual',
    characterId: cid,
  });
  assert.ok(
    Array.isArray(proactiveRes.delivered) && proactiveRes.delivered.length === 1,
    'Proactive check delivers proactive message for matched character'
  );
  assert.equal(proactiveRes.delivered[0].characterId, cid);
  assert.ok(proactiveRes.delivered[0].replies.length >= 1);
});

test('Parallel v0.5 dedicated meeting novel flow, meeting summary card, and clean grouped memory archive', async () => {
  const { engine } = createPortableEngine();
  const p = (
    await engine.request('/profile', {
      name: '奈恩',
      age: 22,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认真寻找恋人',
      sources: ['生化危机 · 游戏'],
      bio: '测试见面小说模式与见面卡片归档',
      interests: ['散步'],
    })
  ).profile;
  const cid = 're-game:chris:re5';
  for (let i = 0; i < 15; i++) {
    if ((await engine.request('/swipe', { profileId: p.id, characterId: cid, direction: 'right' })).matched) break;
  }

  // 1. User sends casual chat message (no promise keyword) -> should NOT spam episodicMemories with per-sentence dialogue
  await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '我已经到街角咖啡馆门口了，等等，我好像看见你了。',
  });
  await engine.request('/chat-flush', {
    profileId: p.id,
    characterId: cid,
    force: true,
  });

  // 2. User clicks Meet button -> /mode with triggerOpening: true
  const enterMeeting = await engine.request('/mode', {
    profileId: p.id,
    characterId: cid,
    mode: 'meeting',
    triggerOpening: true,
  });
  assert.equal(enterMeeting.mode, 'meeting');
  assert.ok(enterMeeting.active_meeting_id, 'Assigns active_meeting_id');
  assert.ok(enterMeeting.meeting_location.includes('街角咖啡馆'), 'Infers meeting location from recent chat message');
  assert.ok(enterMeeting.openingReply && enterMeeting.openingReply.mode === 'meeting', 'Generates opening novel scene on entering meeting mode');

  // 3. User sends a turn inside the dedicated meeting novel page
  const novelReply = await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '我朝他挥了挥手，笑着走过去坐下，把菜单递给他。',
    meetingLocation: enterMeeting.meeting_location,
  });
  assert.ok(novelReply.reply && novelReply.reply.mode === 'meeting');

  // 4. User clicks End Meeting -> /mode with finalizeMeeting: true
  const endMeeting = await engine.request('/mode', {
    profileId: p.id,
    characterId: cid,
    mode: 'chat',
    finalizeMeeting: true,
    meetingLocation: enterMeeting.meeting_location,
  });
  assert.equal(endMeeting.mode, 'chat');
  assert.ok(endMeeting.meetingRecord, 'Returns finalized meetingRecord for chat timeline card');
  assert.ok(endMeeting.meetingRecord.location.includes('街角咖啡馆'), 'Meeting card records location');
  assert.ok(endMeeting.meetingRecord.summary.length > 0, 'Meeting card records summary');
  assert.ok(Array.isArray(endMeeting.meetingRecord.entries) && endMeeting.meetingRecord.entries.length >= 3, 'Meeting card holds full novel transcript entries');

  // 5. Verify memory archive: no '开始面对面见面' or '返回手机聊天' milestone spam, and includes consolidated meeting_summary card + daily_summary with day_messages
  const memData = await engine.request(`/memories?profileId=${p.id}&characterId=${encodeURIComponent(cid)}`);
  const milestones = memData.episodic.filter((m: any) =>
    String(m.summary).includes('开始面对面见面') || String(m.summary).includes('返回手机聊天')
  );
  assert.equal(milestones.length, 0, 'Must never pollute memory archive with mode-switch milestone entries');

  const meetingMems = memData.episodic.filter((m: any) => m.memory_type === 'meeting_summary');
  assert.equal(meetingMems.length, 1, 'Creates exactly one consolidated meeting summary memory card');
  assert.ok(meetingMems[0].summary.includes('和 奈恩 在「'), 'Meeting memory card uses "和 奈恩 在「xx」见面" format');
  assert.equal(meetingMems[0].meeting_id, endMeeting.meetingRecord.id);

  // The current archive policy groups completed episodes after 3 hours of inactivity,
  // not arbitrary calendar-day summaries. Keep the source IDs and transcript discoverable.
  assert.equal(memData.episodic.filter((m: any) => m.source_type === 'episode-pending').length, 0, 'Active episode is not prematurely archived');
  const backup = JSON.parse(engine.exportData());
  const pairRows = backup.data.messages.filter((m: any) => m.profile_id === p.id && m.character_id === cid);
  const shift = 4 * 60 * 60 * 1000;
  for (const m of pairRows) m.created_at = new Date(Date.parse(m.created_at) - shift).toISOString();
  engine.importData(JSON.stringify(backup));
  const archived = await engine.request(`/memories?profileId=${p.id}&characterId=${encodeURIComponent(cid)}`);
  const pending = archived.episodic.filter((m: any) => m.source_type === 'episode-pending');
  assert.equal(pending.length, 1, 'A completed episode gets one pending archive card instead of daily summary');
  assert.deepEqual([...pending[0].raw_msg_ids].sort(), pairRows.map((m: any) => m.id).sort(), 'Archive references all original message IDs');
  assert.deepEqual([...pending[0].day_messages].map((m: any) => m.id).sort(), pairRows.map((m: any) => m.id).sort(), 'Archive detail includes the original chat and meeting messages');
});

test('Parallel v0.5 Daily Mode message bundling (preserving scheduled dueAt & timestamps), Hot Chat Mode toggle, and staggered proactive messages', async () => {
  const { engine } = createPortableEngine();
  const p = (
    await engine.request('/profile', {
      name: '奈恩',
      age: 30,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认真寻找恋人',
      sources: ['生化危机 · 游戏'],
      bio: '测试热聊模式与日常打包模式',
      interests: ['电影'],
    })
  ).profile;
  const cid = 're-game:leon:re2';
  for (let i = 0; i < 15; i++) {
    if ((await engine.request('/swipe', { profileId: p.id, characterId: cid, direction: 'right' })).matched) break;
  }

  // 1. Default is Daily Mode (hotChat: false)
  const msg1 = await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '今天下午天气真好，你在忙什么？',
  });
  assert.equal(msg1.queue.paceMode, 'daily');
  assert.equal(msg1.queue.hotChat, false);
  assert.equal(msg1.queue.count, 1);
  const firstDueAt = msg1.queue.dueAt;
  assert.ok(firstDueAt > Date.now() + 5 * 60 * 1000, 'Daily Mode schedules reply several minutes in the future');

  // 2. Sending a second message in Daily Mode bundles into the same batch WITHOUT postponing dueAt
  const msg2 = await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '对了，我刚买了一杯冰拿铁。',
  });
  assert.equal(msg2.queue.count, 2);
  assert.equal(msg2.queue.dueAt, firstDueAt, 'Subsequent messages in Daily Mode bundle without resetting dueAt');

  // 3. Prompt preview puts real time & mode into independent system metadata, does NOT prefix user/assistant turns with protocol headers, and preserves legitimate user-quoted protocol-style text
  const msgQuoted = await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '他说：“请打开[短信 18:37]那条记录。”',
  });
  assert.equal(msgQuoted.queue.count, 3);
  const promptMessages = engine.buildPromptPreview(p.id, cid, 'chat') as Array<{
    role: string;
    content: string;
  }>;
  const sysPrompt = promptMessages[0]?.content || '';
  assert.match(
    sysPrompt,
    /【近期活跃对话时间与模式索引（系统元数据，仅供把握时间跨度与场景，严禁在回复正文中输出时间或模式前缀）】/,
    'System metadata section carries per-message time and mode index'
  );
  assert.match(
    sysPrompt,
    /#1 \d{4}-\d{2}-\d{2} \d{2}:\d{2}（线上短信·Leon S\. Kennedy）/,
    'Each message in working history has its real timestamp and mode recorded in system metadata'
  );
  const nonSystemTurns = promptMessages.filter(
    (m) => m.role === 'user' || m.role === 'assistant'
  );
  assert.ok(nonSystemTurns.length >= 3);
  for (const turn of nonSystemTurns) {
    assert.ok(
      !/^\s*(?:\[|【)\s*(?:短信|见面)/.test(turn.content),
      `Normal user/assistant turn must not be prefixed with protocol header: ${turn.content}`
    );
  }
  assert.ok(
    nonSystemTurns.some(
      (t) => t.role === 'user' && t.content === '他说：“请打开[短信 18:37]那条记录。”'
    ),
    'Legitimate user-quoted protocol-style text must not be deleted during prompt serialization'
  );

  // 4. Toggle Hot Chat Mode on -> updates queue to paceMode: 'hot' with 60s dueAt
  const hotOn = await engine.request('/hot-chat', {
    profileId: p.id,
    characterId: cid,
    hotChat: true,
  });
  assert.equal(hotOn.hotChat, true);
  assert.equal(hotOn.queue.paceMode, 'hot');
  assert.ok(hotOn.queue.dueAt <= Date.now() + 61000, 'Hot Chat Mode sets 60s quiet window');

  const flushed = await engine.request('/chat-flush', {
    profileId: p.id,
    characterId: cid,
    force: true,
  });
  assert.ok(flushed.reply && flushed.replies.length >= 1, 'Flushes bundled messages and replies');
});

test('9. Surveillance (实时监控) silently generates full-day schedule, unlocks slots up to current time, syncs into prompt & meeting location, and rewrites timeline after meeting', async () => {
  const { engine } = createPortableEngine();
  const p = (
    await engine.request('/profile', {
      name: '奈恩',
      age: 22,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认真寻找恋人',
      sources: ['生化危机 · 游戏'],
      bio: '测试实时监控与见面同步',
      interests: ['电影'],
    })
  ).profile;
  const cid = 're-game:leon:re2';
  for (let i = 0; i < 15; i++) {
    if ((await engine.request('/swipe', { profileId: p.id, characterId: cid, direction: 'right' })).matched) break;
  }

  // 1. Thread response already includes silent surveillance payload with current slot & unlocked slots
  const thread = await engine.request(`/thread?profileId=${p.id}&characterId=${encodeURIComponent(cid)}`);
  assert.ok(thread.surveillance, 'Thread includes initial surveillance payload');
  assert.ok(thread.surveillance.current && thread.surveillance.current.location, 'Has active current surveillance slot');
  assert.ok(Array.isArray(thread.surveillance.unlockedSlots) && thread.surveillance.unlockedSlots.length >= 1, 'Unlocked slots up to current time exist');

  const initialLocation = thread.surveillance.current.location;

  // 2. Prompt preview includes live surveillance location & status synchronization
  const promptPreview = JSON.stringify(engine.buildPromptPreview(p.id, cid, 'chat'));
  assert.match(promptPreview, /【个人日程草案（不是已发生的事实）】/, 'Generated surveillance must be labeled as provisional rather than observed reality');
  assert.match(promptPreview, /以亲历现场为准/, 'Confirmed scene actions outrank generated surveillance');
  assert.ok(promptPreview.includes(initialLocation), 'Prompt includes current surveillance slot location');

  // 3. Entering meeting mode without an explicit location in chat defaults to current surveillance location
  const enterMeeting = await engine.request('/mode', {
    profileId: p.id,
    characterId: cid,
    mode: 'meeting',
    triggerOpening: true,
  });
  assert.equal(enterMeeting.mode, 'meeting');
  assert.equal(enterMeeting.meeting_location, initialLocation, 'Meeting location defaults to current surveillance slot location');
  assert.ok(
    enterMeeting.surveillance.current.status.includes('见面中'),
    'Live surveillance status immediately reflects active meeting with user'
  );

  // 4. Ending meeting mode rewrites today's surveillance footprint and shifts the next slot
  const endMeeting = await engine.request('/mode', {
    profileId: p.id,
    characterId: cid,
    mode: 'chat',
    finalizeMeeting: true,
  });
  assert.equal(endMeeting.mode, 'chat');
  assert.ok(endMeeting.meetingRecord, 'Meeting card archived');
  const slotsAfter = endMeeting.surveillance.unlockedSlots;
  assert.ok(
    slotsAfter.some((s: any) => s.source === 'meeting' && s.location === initialLocation),
    'Completed meeting is written into today surveillance footprint'
  );
});

test('10. Character Diary (角色日记) auto-generates past-day diaries from surveillance, supports date selection & intimacy stages, Surveillance supports past dates, and Character Hub supports custom nickname remarks', async () => {
  const { engine } = createPortableEngine();
  const p = (
    await engine.request('/profile', {
      name: '奈恩',
      age: 22,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认真寻找恋人',
      sources: ['生化危机 · 游戏'],
      bio: '测试角色日记、监控历史日期与专属空间备注修改',
      interests: ['电影'],
    })
  ).profile;
  const cid = 're-game:leon:re2';
  for (let i = 0; i < 15; i++) {
    if ((await engine.request('/swipe', { profileId: p.id, characterId: cid, direction: 'right' })).matched) break;
  }

  // 1. Surveillance supports selecting past dates (yesterday & two days ago) with full-day unlocked slots
  const survToday = await engine.request(`/surveillance?profileId=${p.id}&characterId=${encodeURIComponent(cid)}`);
  assert.equal(survToday.isToday, true, 'Default surveillance view is today');
  assert.ok(Array.isArray(survToday.availableDates) && survToday.availableDates.length >= 3, 'Seeds today + past dates in availableDates');

  const yesterdayDate = survToday.availableDates[1];
  const survYesterday = await engine.request(
    `/surveillance?profileId=${p.id}&characterId=${encodeURIComponent(cid)}&date=${encodeURIComponent(yesterdayDate)}`
  );
  assert.equal(survYesterday.date, yesterdayDate);
  assert.equal(survYesterday.isToday, false, 'Past date surveillance has isToday: false');
  assert.equal(survYesterday.lockedCount, 0, 'Past date surveillance unlocks all full-day slots');
  assert.equal(survYesterday.unlockedSlots.length, survYesterday.totalSlots, 'All slots unlocked on past date');

  // 2. Diary endpoint automatically generates past-day diaries from surveillance (without revolving around user in initial intimacy stage)
  const diaryLatest = await engine.request(`/diary?profileId=${p.id}&characterId=${encodeURIComponent(cid)}`);
  assert.ok(diaryLatest.diary, 'Returns latest diary entry');
  assert.equal(diaryLatest.date, yesterdayDate, 'Latest completed diary defaults to yesterday');
  assert.ok(Array.isArray(diaryLatest.availableDates) && diaryLatest.availableDates.length >= 2, 'Provides selectable past diary dates');
  assert.notEqual(diaryLatest.intimacy.stage, 'deep_love', 'Initial stage is independent life focus');
  assert.ok(
    Array.isArray(diaryLatest.diary.sourceLocations) && diaryLatest.diary.sourceLocations.length === 0,
    'C-11: schedule-only locations are NOT confirmed diary footprints'
  );
  assert.match(diaryLatest.diary.content,/计划|推演|不能断定/,
    'C-11: default diary must mark a synthetic itinerary as unverified');
  assert.ok(diaryLatest.diary.content.length >= 40, 'Diary contains multi-paragraph prose');

  // Selecting an earlier diary date or any calendar past date (e.g., 2026-11-01) returns that specific day's surveillance & diary
  const twoDaysAgoDate = diaryLatest.availableDates[1];
  const diaryOlder = await engine.request(
    `/diary?profileId=${p.id}&characterId=${encodeURIComponent(cid)}&date=${encodeURIComponent(twoDaysAgoDate)}`
  );
  assert.equal(diaryOlder.date, twoDaysAgoDate, 'Can switch to an earlier date diary');
  assert.equal(diaryOlder.diary.date, twoDaysAgoDate);

  const arbitraryCalendarDate = '2026-11-01';
  const survCalendarPick = await engine.request(
    `/surveillance?profileId=${p.id}&characterId=${encodeURIComponent(cid)}&date=${arbitraryCalendarDate}`
  );
  assert.equal(survCalendarPick.date, arbitraryCalendarDate, 'Calendar input can pick any past date for surveillance');
  assert.equal(survCalendarPick.isToday, false);
  assert.equal(survCalendarPick.unlockedSlots.length, survCalendarPick.totalSlots);

  const diaryCalendarPick = await engine.request(
    `/diary?profileId=${p.id}&characterId=${encodeURIComponent(cid)}&date=${arbitraryCalendarDate}`
  );
  assert.equal(diaryCalendarPick.diary.date, arbitraryCalendarDate, 'Calendar input can pick any past date for diary');

  // 3. When intimacy reaches deep_love (affectionBoost >= 75), refreshing diary reflects deep affection for user
  await engine.request('/memory-action', {
    profileId: p.id,
    characterId: cid,
    action: 'affinity',
    delta: 80,
  });
  const deepLoveDiary = await engine.request('/diary', {
    profileId: p.id,
    characterId: cid,
    date: yesterdayDate,
    forceRefresh: true,
  });
  assert.equal(deepLoveDiary.intimacy.stage, 'deep_love');
  assert.equal(deepLoveDiary.diary.intimacyStage, 'deep_love');
  assert.ok(
    deepLoveDiary.diary.content.includes('奈恩'),
    'In deep_love stage, character diary openly pours out thoughts about user'
  );

  // 4. Custom nickname remark in Character Hub preserves true canon name while updating display_name
  const nickRes = await engine.request('/nickname', {
    profileId: p.id,
    characterId: cid,
    nickname: '里昂小队长',
  });
  assert.equal(nickRes.ok, true);
  assert.equal(nickRes.nickname, '里昂小队长');
  assert.equal(nickRes.character.display_name, '里昂小队长', 'display_name reflects custom remark');
  assert.equal(nickRes.character.name, 'Leon S. Kennedy', 'character.name preserves true canon name');

  // Clearing nickname reverts display_name back to canon name
  const clearNick = await engine.request('/nickname', {
    profileId: p.id,
    characterId: cid,
    nickname: '',
  });
  assert.equal(clearNick.nickname, '');
  assert.equal(clearNick.character.display_name, 'Leon S. Kennedy');
});

function load26EntryPresetFixture() {
  const localPath = process.env.PARALLEL_PRIVATE_PRESET;
  if (localPath && fs.existsSync(localPath)) {
    return JSON.parse(fs.readFileSync(localPath, 'utf8'));
  }
  const entries = [];
  for (let i = 0; i < 26; i++) {
    const isDisabledStyle = i === 22 || i === 23;
    const isEnabledStyle = i === 21;
    const isCot = i === 24;
    const isBottom = i === 25;
    entries.push({
      id: `entry-${i + 1}`,
      name: isDisabledStyle
        ? i === 22
          ? '古典散文观察视角'
          : '清淡日常白描视角'
        : isEnabledStyle
          ? '高饱和度感官电影流'
          : isCot
            ? '动笔前连续性检查'
            : isBottom
              ? '底部誓约与状态确认'
              : `专项模块-${i + 1}`,
      role: isBottom ? 'assistant' : 'system',
      enabled: !isDisabledStyle,
      group:
        isDisabledStyle || isEnabledStyle
          ? '文风（单选）'
          : isCot
            ? 'COT'
            : isBottom
              ? '收尾'
              : '专项（多选）',
      content: isBottom
        ? '【已完整读取并锁定所有前置档案与创作法则】\n我已完全进入 **{{char}}** 的灵魂与躯壳，并将 **{{user}}** 视为真实可触的唯一交互对手。'
        : isCot
          ? '动笔前快速过一遍：1. 先接住{{user}}刚落下的动作或话头；2. 检查{{char}}当前的认知边界。'
          : `规则条目 #${i + 1}：要求围绕 {{char}} 与 {{user}} 展开 600～1000 字细腻现实互动。`,
    });
  }
  return {
    id: 'preset-elsewhere-26',
    name: '26条目测试预设',
    description: '24启用、2禁用测试预设',
    schemaVersion: 1,
    format: 'elsewhere-preset',
    entries,
  };
}

test('ROUND-02: Complete 26-entry Elsewhere preset lifecycle, compilation order, 6 meeting entry points, diagnostics, long novel preservation, and System Logs', async () => {
  const capturedCalls: Array<{ url: string; body: any; headers: Record<string, string> }> = [];
  let mockResponseMode: 'long_novel' | 'truncated_length' | 'http_error' | 'chat_bubbles' = 'long_novel';

  const longNovelParagraphs = [
    '雨水顺着街角咖啡馆的玻璃窗蜿蜒滑落，将室外的霓虹灯影揉碎成一片温暖而模糊的琥珀色光斑。店内的烘焙香气混合着潮湿的夜气，在两人之间静静流淌。他没有急着开口，只是先把搭在椅背上的深色风衣往里收了收，免得沾湿的水汽碰到她手边的桌面，随后才抬起眼，目光沉静而专注地落在她身上。',
    '刚才她递过来的那页菜单还停留在指尖，纸页边缘带着一点室内的微温。他垂眸扫过上面用铅笔勾选的那行热可可，唇角极其自然地浮起一点克制而温和的弧度，既没有刻意凑近的轻佻，也没有刚见面时的生疏客套，完全是久经生死与风浪后难得卸下防备的松弛感。',
    '“外面的雨比气象台报的还要大一点，你过来的时候袖口是不是淋湿了？”他一边说着，一边用指节轻轻敲了敲桌面右侧的空位，顺手把侍应生刚放下的温水往她手边推近了半寸，掌心在玻璃杯壁外侧短暂停留了一秒确认温度，才自然地收回手搭在自己膝上。',
    '“既然今天好不容易把备勤的空档腾出来，我们就不用赶时间。你刚才在路上说的那家老唱片店，等这阵雨稍微小一点，我陪你过去看看还开没开门。现在先喝口热水暖一暖——你想先点单，还是先跟我说说今天下午到底遇到了什么好玩的事？”',
  ].join('\n\n');
  assert.ok(longNovelParagraphs.length >= 420, 'Mock novel response has substantial multi-paragraph length');

  const sharedStore = new Map<string, string>();
  const makeFetch = () => async (url: string, init?: any) => {
    const reqBody = init?.body ? JSON.parse(String(init.body)) : {};
    const reqHeaders = init?.headers || {};
    capturedCalls.push({ url: String(url), body: reqBody, headers: reqHeaders });
    if (mockResponseMode === 'http_error') {
      return {
        ok: false,
        status: 502,
        json: async () => ({ error: { message: 'Upstream gateway timeout' } }),
      };
    }
    if (mockResponseMode === 'truncated_length') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'chatcmpl-trunc-1',
          choices: [
            {
              index: 0,
              finish_reason: 'length',
              message: {
                role: 'assistant',
                reasoning_content: '先构思场景连续性与动作承接……',
                content: longNovelParagraphs.slice(0, 180),
              },
            },
          ],
          usage: {
            prompt_tokens: 2800,
            completion_tokens: 1024,
            total_tokens: 3824,
            completion_tokens_details: { reasoning_tokens: 820 },
          },
        }),
      };
    }
    if (mockResponseMode === 'chat_bubbles') {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'chatcmpl-chat-1',
          choices: [
            {
              index: 0,
              finish_reason: 'stop',
              message: {
                role: 'assistant',
                content: '我刚把摩托车停好。|||你在店里等我两分钟，马上进来。',
              },
            },
          ],
          usage: { prompt_tokens: 950, completion_tokens: 36, total_tokens: 986 },
        }),
      };
    }
    const repeatedLong = longNovelParagraphs + '\n\n' + longNovelParagraphs;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: 'chatcmpl-novel-1',
        choices: [
          {
            index: 0,
            finish_reason: 'stop',
            message: {
              role: 'assistant',
              content: repeatedLong,
            },
          },
        ],
        usage: {
          prompt_tokens: 3120,
          completion_tokens: 890,
          total_tokens: 4010,
          completion_tokens_details: { reasoning_tokens: 180 },
        },
      }),
    };
  };

  let { engine } = createPortableEngine({ store: sharedStore, fetchImpl: makeFetch() });

  // Scenario 1 & 2: Import 26-entry Elsewhere preset (24 enabled, 2 disabled)
  const presetPack = load26EntryPresetFixture();
  assert.equal(presetPack.entries.length, 26, 'Fixture has 26 entries');
  assert.equal(presetPack.entries.filter((x: any) => x.enabled).length, 24, '24 entries enabled');
  assert.equal(presetPack.entries.filter((x: any) => !x.enabled).length, 2, '2 entries disabled');

  const importRes = await engine.request('/preset-import', {
    import_mode: 'replace',
    preset: presetPack,
  });
  assert.equal(importRes.ok, true);
  assert.equal(importRes.imported, 26);

  const presetsResp = await engine.request('/presets');
  const meetingEntries = presetsResp.entries.filter((x: any) => x.mode === 'meeting');
  const chatEntries = presetsResp.entries.filter((x: any) => x.mode === 'chat');
  assert.equal(meetingEntries.length, 26, 'All 26 entries imported into meeting mode');
  assert.equal(meetingEntries.filter((x: any) => x.enabled).length, 24, '24 meeting entries enabled');
  assert.equal(meetingEntries.filter((x: any) => !x.enabled).length, 2, '2 meeting entries disabled');
  assert.equal(chatEntries.length, 3, 'Chat presets remain untouched (3 default chat entries)');

  // Check diagnostics on clean replace import
  const meetDiag = presetsResp.diagnostics.meeting;
  assert.equal(meetDiag.totalCount, 26);
  assert.equal(meetDiag.enabledCount, 24);
  assert.equal(meetDiag.disabledCount, 2);
  assert.equal(meetDiag.defaultAndCustomCoexist, false);
  assert.equal(meetDiag.duplicateCount, 0);
  assert.equal(meetDiag.styleGroupTotal, 3);
  assert.equal(meetDiag.enabledStyleCount, 1);
  assert.equal(meetDiag.hasCotCheck, true);
  assert.equal(meetDiag.hasBottomPledge, true);
  assert.equal(meetDiag.rolesBreakdown.system, 23);
  assert.equal(meetDiag.rolesBreakdown.assistant, 1);

  // Scenario 3: Page reload (recreating engine over same localStorage) and mode switch preserve all 26 entries & states
  ({ engine } = createPortableEngine({ store: sharedStore, fetchImpl: makeFetch() }));
  const afterReloadPresets = await engine.request('/presets');
  const reloadedMeeting = afterReloadPresets.entries.filter((x: any) => x.mode === 'meeting');
  assert.equal(reloadedMeeting.length, 26, '26 meeting entries survive page reload');
  assert.equal(reloadedMeeting.filter((x: any) => x.enabled).length, 24, '24 enabled states survive reload');
  assert.equal(reloadedMeeting.filter((x: any) => !x.enabled).length, 2, '2 disabled states survive reload');

  // Configure live API settings with high max_tokens (e.g. 8192)
  const savedSettings = (
    await engine.request('/settings', {
      base_url: 'https://api.example.org/v1',
      api_key: 'sk-live-secret-key-987654321',
      model: 'claude-3-7-sonnet',
      temperature: 0.85,
      top_p: 0.95,
      max_tokens: 8192,
    })
  ).settings;
  assert.equal(savedSettings.mode, 'live');
  assert.equal(savedSettings.max_tokens, 8192, 'Supports max_tokens > 4096 up to 32768');

  // Create two Profiles and match two Characters to test dynamic macro rebinding & all 6 entry points
  const profileA = (
    await engine.request('/profile', {
      name: '奈恩',
      age: 23,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认真寻找恋人',
      sources: ['生化危机 · 游戏', '巫师 · 游戏'],
      bio: '喜欢雨天和热可可',
      interests: ['摄影', '黑胶'],
    })
  ).profile;

  const profileB = (
    await engine.request('/profile', {
      name: '陆离',
      age: 25,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 65,
      intent: '认识新朋友',
      sources: ['生化危机 · 游戏', '巫师 · 游戏'],
      bio: '喜欢安静的酒馆',
      interests: ['剑术'],
    })
  ).profile;

  const charLeon = 're-game:leon:re2';
  const charChris = 're-game:chris:re5';

  mockResponseMode = 'chat_bubbles';
  for (const [pid, cid] of [
    [profileA.id, charLeon],
    [profileA.id, charChris],
    [profileB.id, charLeon],
  ]) {
    for (let i = 0; i < 15; i++) {
      const sw = await engine.request('/swipe', { profileId: pid, characterId: cid, direction: 'right' });
      if (sw.matched) break;
    }
  }

  // Send a short SMS in chat mode first to verify Scenario 4, 5, and SMS length isolation
  await engine.request('/message', {
    profileId: profileA.id,
    characterId: charLeon,
    text: '我在街角咖啡馆靠窗的位置等你。',
  });
  const chatFlush = await engine.request('/chat-flush', {
    profileId: profileA.id,
    characterId: charLeon,
    force: true,
  });
  assert.equal(chatFlush.reply.mode, 'chat');

  // Scenario 5: Verify chat mode request ONLY used chat presets and NEVER leaked meeting presets
  const lastChatCall = capturedCalls[capturedCalls.length - 1];
  const chatPayloadStr = JSON.stringify(lastChatCall.body.messages);
  assert.ok(chatPayloadStr.includes('只输出角色实际发出的消息正文'), 'Chat mode uses chat-main preset');
  assert.ok(!chatPayloadStr.includes('底部誓约'), 'Chat mode never includes meeting assistant pledge');
  assert.ok(!chatPayloadStr.includes('高饱和度感官电影流'), 'Chat mode never includes meeting style cards');

  // Now switch mock to long_novel for face-to-face meeting tests
  mockResponseMode = 'long_novel';

  // Helper to verify Scenarios 2, 4, 6, 7 on any captured meeting payload
  const assertValidMeetingPayload = (
    messages: Array<{ role: string; content: string }>,
    expectedUserName: string,
    expectedCharName: string
  ) => {
    const fullStr = JSON.stringify(messages);
    // Scenario 4: No chat presets leaked into meeting mode
    assert.ok(
      !fullStr.includes('只输出角色实际发出的消息正文'),
      'Meeting payload must never include chat-main SMS bubble preset'
    );
    // Scenario 2: Disabled entries (古典散文观察视角, 清淡日常白描视角) must NEVER enter payload
    assert.ok(!fullStr.includes('古典散文观察视角'), 'Disabled style 1 must not enter payload');
    assert.ok(!fullStr.includes('清淡日常白描视角'), 'Disabled style 2 must not enter payload');
    // Enabled style card IS present
    const enabledStyle = meetingEntries.find((x: any) => x.enabled && String(x.group || x.name).includes('文风（单选）'));
    if (enabledStyle) {
      const snippet = enabledStyle.content
        .replace(/\{\{user\}\}/g, expectedUserName)
        .replace(/\{\{char\}\}/g, expectedCharName)
        .slice(0, 18);
      assert.ok(fullStr.includes(snippet), 'Enabled style card content is present in meeting payload');
    }
    // Scenario 6: Macro replacement ({{user}} and {{char}} completely replaced)
    assert.ok(!fullStr.includes('{{user}}'), '{{user}} macro must be replaced everywhere');
    assert.ok(!fullStr.includes('{{char}}'), '{{char}} macro must be replaced everywhere');
    assert.ok(fullStr.includes(expectedUserName), `Expected user name ${expectedUserName} present`);
    assert.ok(fullStr.includes(expectedCharName), `Expected char name ${expectedCharName} present`);

    // Scenario 7: Structural order check
    // First message is foundational system prompt + core system presets (with expanded {{char}} and {{user}})
    assert.equal(messages[0].role, 'system', 'First message is foundational system message');
    assert.ok(
      messages[0].content.includes(expectedCharName) && messages[0].content.includes(expectedUserName),
      'Core system prompt has expanded {{char}} and {{user}} macros'
    );
    // Last message is ALWAYS role: 'user'
    const lastMsg = messages[messages.length - 1];
    assert.equal(lastMsg.role, 'user', 'Final message in meeting mode must always be role: user');
    // Second-to-last message is the assistant bottom pledge (底部誓约与状态确认)
    const secondLastMsg = messages[messages.length - 2];
    assert.equal(secondLastMsg.role, 'assistant', 'Second-to-last message is assistant bottom pledge');
    assert.ok(
      secondLastMsg.content.includes(expectedUserName) && !secondLastMsg.content.includes('{{user}}'),
      'Assistant bottom pledge has expanded {{user}} macro'
    );
    // Third-to-last message is the post-history system block (COT + Layer 4 Current State)
    const thirdLastMsg = messages[messages.length - 3];
    assert.equal(thirdLastMsg.role, 'system', 'Third-to-last message is post-history COT + Current State system block');
    assert.ok(thirdLastMsg.content.includes('【第四层 · 当前状态'), 'Contains Layer 4 Current State');
  };

  // Scenario 8.1: Entry Point 1 — First time entering meeting mode (/mode with triggerOpening: true)
  const enter1 = await engine.request('/mode', {
    profileId: profileA.id,
    characterId: charLeon,
    mode: 'meeting',
    triggerOpening: true,
    location: '街角咖啡馆',
  });
  assert.equal(enter1.mode, 'meeting');
  assert.ok(enter1.openingReply, 'Generates opening reply');
  assert.ok(enter1.openingReply.text.length >= 800, 'Scenario 10: Long novel reply (800+ chars) is preserved without truncation');
  assertValidMeetingPayload(capturedCalls[capturedCalls.length - 1].body.messages, '奈恩', 'Leon S. Kennedy');
  // Also verify pre-meeting SMS is in system prompt as reference, NOT in dialogue turns
  const openMsgs = capturedCalls[capturedCalls.length - 1].body.messages;
  assert.ok(
    openMsgs[0].content.includes('【见面前的近期手机联系脉络'),
    'Pre-meeting SMS is summarized in system context'
  );
  assert.equal(
    openMsgs.filter((m: any) => m.content === '我在街角咖啡馆靠窗的位置等你。').length,
    0,
    'Short SMS message is not injected as a dialogue turn in meeting mode'
  );

  // Scenario 8.2: Entry Point 2 — User sends a meeting message (/message in meeting mode)
  const meetTurn1 = await engine.request('/message', {
    profileId: profileA.id,
    characterId: charLeon,
    text: '我笑着接过那杯温水，问他最近是不是都没怎么睡好。',
  });
  assert.equal(meetTurn1.mode, 'meeting');
  assert.ok(meetTurn1.reply.text.length >= 800, 'Long novel reply preserved on /message');
  const turn1Msgs = capturedCalls[capturedCalls.length - 1].body.messages;
  assertValidMeetingPayload(turn1Msgs, '奈恩', 'Leon S. Kennedy');
  assert.equal(
    turn1Msgs[turn1Msgs.length - 1].content,
    '我笑着接过那杯温水，问他最近是不是都没怎么睡好。',
    'User latest meeting message sits at the very end after assistant bottom pledge'
  );

  // Scenario 8.3: Entry Point 3 — User clicks Continue (/reply in meeting mode)
  const meetContinue = await engine.request('/reply', {
    profileId: profileA.id,
    characterId: charLeon,
  });
  assert.equal(meetContinue.mode, 'meeting');
  assert.ok(meetContinue.reply.text.length >= 800, 'Long novel reply preserved on /reply continue');
  const contMsgs = capturedCalls[capturedCalls.length - 1].body.messages;
  assertValidMeetingPayload(contMsgs, '奈恩', 'Leon S. Kennedy');
  assert.ok(
    contMsgs[contMsgs.length - 1].content.includes('【继续推进】'),
    'Continue generation ends with explicit user-role continuation trigger'
  );

  // Scenario 8.4: Entry Point 4 — Multi-round meeting generation maintains prior meeting turns in order
  const meetTurn2 = await engine.request('/message', {
    profileId: profileA.id,
    characterId: charLeon,
    text: '我伸手替他理了理微湿的风衣领口。',
  });
  assert.ok(meetTurn2.reply.text.length >= 800);
  const turn2Msgs = capturedCalls[capturedCalls.length - 1].body.messages;
  assertValidMeetingPayload(turn2Msgs, '奈恩', 'Leon S. Kennedy');
  // Prior meeting turns sit between messages[0] and messages[messages.length - 3]
  const middleHistory = turn2Msgs.slice(1, turn2Msgs.length - 3);
  assert.ok(middleHistory.length >= 3, 'Multi-round meeting history is preserved before COT and bottom pledge');

  // Scenario 8.5: Entry Point 5 — End meeting -> return to chat -> start a 2nd meeting later
  await engine.request('/mode', {
    profileId: profileA.id,
    characterId: charLeon,
    mode: 'chat',
    finalizeMeeting: false,
  });
  const enter2 = await engine.request('/mode', {
    profileId: profileA.id,
    characterId: charLeon,
    mode: 'meeting',
    triggerOpening: true,
    location: '老城区唱片行',
  });
  assert.equal(enter2.mode, 'meeting');
  assert.ok(enter2.openingReply.text.length >= 800);
  assertValidMeetingPayload(capturedCalls[capturedCalls.length - 1].body.messages, '奈恩', 'Leon S. Kennedy');

  // Scenario 8.6: Entry Point 6 — Switch to another Character (Chris Redfield) and another Profile (陆离)
  const enterChris = await engine.request('/mode', {
    profileId: profileA.id,
    characterId: charChris,
    mode: 'meeting',
    triggerOpening: true,
    location: '暖炉酒馆',
  });
  assert.equal(enterChris.mode, 'meeting');
  assertValidMeetingPayload(capturedCalls[capturedCalls.length - 1].body.messages, '奈恩', 'Chris Redfield');
  assert.ok(
    !JSON.stringify(capturedCalls[capturedCalls.length - 1].body.messages).includes('Leon S. Kennedy'),
    'Switching character dynamically rebinds {{char}} to Chris Redfield without Leon residue'
  );

  const enterProfileB = await engine.request('/mode', {
    profileId: profileB.id,
    characterId: charLeon,
    mode: 'meeting',
    triggerOpening: true,
    location: '中心靶场',
  });
  assert.equal(enterProfileB.mode, 'meeting');
  assertValidMeetingPayload(capturedCalls[capturedCalls.length - 1].body.messages, '陆离', 'Leon S. Kennedy');
  assert.ok(
    !JSON.stringify(capturedCalls[capturedCalls.length - 1].body.messages).includes('奈恩'),
    'Switching Profile dynamically rebinds {{user}} to 陆离 without 奈恩 residue'
  );

  // Scenario 9: System Log verification (records payload, active presets, sampling, usage, finish_reason, masks API key)
  const logsResp = await engine.request('/system-logs');
  assert.ok(Array.isArray(logsResp.logs) && logsResp.logs.length >= 6, 'System logs recorded for all LLM calls');
  const latestLog = logsResp.logs[0];
  assert.equal(latestLog.mode, 'meeting');
  assert.match(latestLog.entry_point, /^meeting[_-]opening$/);
  assert.equal(latestLog.profile_name, '陆离');
  assert.equal(latestLog.character_name, 'Leon S. Kennedy');
  assert.equal(latestLog.model, 'claude-3-7-sonnet');
  assert.equal(latestLog.sampling.max_tokens, 8192);
  assert.equal(latestLog.active_preset_count, 24);
  assert.equal(latestLog.disabled_preset_count, 2);
  assert.equal(latestLog.active_presets.length, 24);
  assert.equal(latestLog.disabled_presets.length, 2);
  assert.equal(latestLog.finish_reason, 'stop');
  assert.equal(latestLog.usage.prompt_tokens, 3120);
  assert.equal(latestLog.usage.completion_tokens, 890);
  assert.equal(latestLog.usage.reasoning_tokens, 180);
  assert.ok(latestLog.char_count_raw >= 800 && latestLog.char_count_parsed >= 800);
  assert.ok(
    !JSON.stringify(latestLog).includes('sk-live-secret-key-987654321'),
    'Full API key is strictly masked in system logs'
  );
  assert.match(latestLog.headers_masked.Authorization, /^Bearer sk-l.*21$/);

  // Backup export must never include systemLogs or api_key
  const backupJson = JSON.parse(engine.exportData());
  assert.equal(backupJson.data.connection.api_key, '');
  assert.equal('systemLogs' in backupJson.data, false, 'System logs are excluded from backup exports');

  // Scenario 11: Truncation (finish_reason="length") and HTTP Error handling in System Logs
  mockResponseMode = 'truncated_length';
  const truncReply = await engine.request('/message', {
    profileId: profileB.id,
    characterId: charLeon,
    text: '我看着他继续往下说。',
  });
  assert.ok(truncReply.reply.text.length > 0);
  const truncLog = (await engine.request('/system-logs')).logs[0];
  assert.equal(truncLog.finish_reason, 'length');
  assert.ok(truncLog.truncation_warning.includes('max_tokens'), 'Records clear truncation warning on finish_reason=length');
  assert.ok(truncLog.reasoning_content.includes('构思场景连续性'), 'Captures reasoning_content when returned by model');

  mockResponseMode = 'http_error';
  const beforeErrCount = (await engine.request(`/thread?profileId=${profileB.id}&characterId=${charLeon}`)).messages.length;
  const errReply = await engine.request('/message', {
    profileId: profileB.id,
    characterId: charLeon,
    text: '测试接口异常时的降级保护。',
  });
  assert.ok(errReply.warning.includes('HTTP 502'), 'Returns HTTP error warning cleanly');
  const afterErrCount = (await engine.request(`/thread?profileId=${profileB.id}&characterId=${charLeon}`)).messages.length;
  assert.ok(afterErrCount > beforeErrCount, 'Preserves user message and history when API errors');
  const errLog = (await engine.request('/system-logs')).logs[0];
  assert.equal(errLog.http_status, 502);
  assert.ok(errLog.error.includes('HTTP 502'), 'System log records HTTP failure details');

  // Test append conflict diagnostics and user-triggered cleanup actions (disable_defaults & deduplicate)
  await engine.request('/preset', {
    id: 'meeting-main',
    mode: 'meeting',
    name: '线下见面 · 小说模式',
    role: 'system',
    enabled: true,
    content: '默认保底说明',
  });
  await engine.request('/preset-import', {
    import_mode: 'append',
    preset: presetPack,
  });
  const conflictDiag = (await engine.request('/presets')).diagnostics.meeting;
  assert.equal(conflictDiag.defaultAndCustomCoexist, true, 'Detects default + custom preset coexistence after append');
  assert.ok(conflictDiag.duplicateCount >= 26, 'Detects duplicate entries after repeated append');

  // Scenario 8.5b: Verify 2nd meeting opening did NOT pull 1st meeting's dialogue turns into its active history
  const enter2Call = capturedCalls.find(
    (c) => JSON.stringify(c.body.messages).includes('老城区唱片行')
  );
  assert.ok(enter2Call, 'Found 2nd meeting opening API call');
  assert.equal(
    enter2Call.body.messages.length,
    4,
    '2nd meeting opening contains only [core system, post-history system, assistant pledge, user opening] and zero turns from 1st meeting'
  );

  await engine.request('/preset', { action: 'disable_defaults', mode: 'meeting' });
  const afterDisableDef = await engine.request('/preset', { action: 'deduplicate', mode: 'meeting' });
  const finalMeetDiag = afterDisableDef.diagnostics.meeting || afterDisableDef.diagnostics;
  assert.equal(finalMeetDiag.defaultAndCustomCoexist, false);
  assert.equal(finalMeetDiag.duplicateCount, 0);
  assert.equal(finalMeetDiag.enabledCount, 24);
});

test('ROUND-02a: System Log isolation from localStorage, legacy migration, log toggle/delete/clear, dual capacity limits, and localStorage quota exhaustion resilience', async () => {
  const store = new Map<string, string>();
  let quotaExhausted = false;

  // Seed legacy database in localStorage containing old db.systemLogs to test automatic migration & cleanup
  const STORE_KEY = 'parallel-portable-v2';
  const baseEngine = createPortableEngine();
  const baseBackup = JSON.parse(baseEngine.engine.exportData()).data;
  store.set(
    STORE_KEY,
    JSON.stringify({
      ...baseBackup,
      systemLogs: [
        {
          id: 'legacy-log-1',
          created_at: '2026-11-18T10:00:00Z',
          mode: 'meeting',
          entry_point: 'meeting-opening',
          model: 'legacy-model',
          char_count_raw: 680,
          char_count_parsed: 680,
          finish_reason: 'stop',
        },
      ],
    })
  );

  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'public/parallel/offline.js'),
    'utf8'
  );
  const localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (quotaExhausted && k === STORE_KEY) {
        const err = new Error('QuotaExceededError: The quota has been exceeded.');
        err.name = 'QuotaExceededError';
        throw err;
      }
      store.set(k, v);
    },
  };
  const win: Record<string, unknown> = {};
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      id: 'chatcmpl-r02a',
      choices: [
        {
          index: 0,
          finish_reason: 'stop',
          message: {
            role: 'assistant',
            content: '这是一段正常生成的测试回复，用于验证日志与正式存档彻底隔离。'.repeat(12),
          },
        },
      ],
      usage: { prompt_tokens: 500, completion_tokens: 240, total_tokens: 740 },
    }),
  });

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
  const engine = win.ParallelOffline as any;

  // 1. Legacy systemLogs migrated out of parallel-portable-v2 in localStorage
  const logsInit = await engine.request('/system-logs');
  assert.ok(
    logsInit.logs.some((l: any) => l.id === 'legacy-log-1'),
    'Legacy systemLogs from localStorage are migrated into isolated log store'
  );
  const rawSavedAfterMigration = JSON.parse(store.get(STORE_KEY) || '{}');
  assert.equal(
    'systemLogs' in rawSavedAfterMigration,
    false,
    'Formal localStorage save (parallel-portable-v2) no longer contains systemLogs'
  );
  assert.equal(logsInit.enabled, true, 'Generation logging is enabled by default');
  assert.ok(['indexeddb', 'session'].includes(logsInit.storage), 'Reports isolated log storage backend');

  // 2. Configure live API and generate logs; verify formal localStorage never stores systemLogs
  await engine.request('/settings', {
    base_url: 'https://api.example.org/v1',
    api_key: 'sk-r02a-secret-key-123456',
    model: 'gpt-4.1',
  });
  const p = (
    await engine.request('/profile', {
      name: '林雾',
      age: 24,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 60,
      intent: '认真恋爱',
      sources: ['生化危机 · 游戏'],
      bio: '测试存档与日志隔离',
      interests: ['阅读'],
    })
  ).profile;
  const cid = 're-game:leon:re2';
  for (let i = 0; i < 15; i++) {
    const sw = await engine.request('/swipe', { profileId: p.id, characterId: cid, direction: 'right' });
    if (sw.matched) break;
  }

  await engine.request('/mode', {
    profileId: p.id,
    characterId: cid,
    mode: 'meeting',
    triggerOpening: true,
    location: '钟楼露台',
  });

  const rawFormalSave = store.get(STORE_KEY) || '';
  assert.ok(!rawFormalSave.includes('chatcmpl-r02a'), 'Raw API response never enters formal localStorage save');
  assert.equal('systemLogs' in JSON.parse(rawFormalSave), false, 'systemLogs key is completely absent from formal localStorage save');

  // 3. Test deleting single log, toggling log recording off, and clearing logs
  const logsBeforeDel = (await engine.request('/system-logs')).logs;
  assert.ok(logsBeforeDel.length >= 2);
  const targetDelId = logsBeforeDel[0].id;
  await engine.request('/system-logs-clear', { id: targetDelId });
  const afterSingleDel = await engine.request('/system-logs');
  assert.ok(!afterSingleDel.logs.some((l: any) => l.id === targetDelId), 'Single log deleted cleanly');

  // Disable log recording
  const toggleOff = await engine.request('/system-logs-settings', { enabled: false });
  assert.equal(toggleOff.enabled, false);
  const countWhileOff = (await engine.request('/system-logs')).logs.length;
  await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '关闭日志期间发送的见面消息。',
  });
  const countAfterOffMsg = (await engine.request('/system-logs')).logs.length;
  assert.equal(countAfterOffMsg, countWhileOff, 'No generation logs recorded while logging is disabled');

  // Re-enable log recording and test eviction over 40 entries
  await engine.request('/system-logs-settings', { enabled: true });
  for (let i = 0; i < 45; i++) {
    await engine.request('/message', {
      profileId: p.id,
      characterId: cid,
      text: `第 ${i + 1} 轮压力测试消息`,
    });
  }
  const cappedLogs = await engine.request('/system-logs');
  assert.ok(cappedLogs.logs.length <= 40, 'Log count strictly capped at 40 entries with automatic FIFO eviction');
  const approxTotalBytes = new TextEncoder().encode(JSON.stringify(cappedLogs.logs)).length;
  assert.ok(approxTotalBytes <= 4 * 1024 * 1024, 'Log total bytes strictly capped within 4 MiB');

  // 4. Simulate browser localStorage quota exhaustion, then verify formal chat and memory saves still work when quota frees up
  quotaExhausted = true;
  await assert.rejects(
    () =>
      engine.request('/message', {
        profileId: p.id,
        characterId: cid,
        text: '配额暂时耗尽时的消息（保存在内存中）',
      }),
    /浏览器本地空间不足/
  );
  // Now restore quota (or user clears space) and save a new memory + message
  quotaExhausted = false;
  await engine.request('/memory-action', {
    profileId: p.id,
    characterId: cid,
    action: 'add',
    summary: '配额恢复后写入的重要记忆：在钟楼露台看夜景',
  });
  await engine.request('/message', {
    profileId: p.id,
    characterId: cid,
    text: '配额恢复后的正式消息持久化验证',
  });

  const persistedDb = JSON.parse(store.get(STORE_KEY) || '{}');
  assert.ok(
    persistedDb.messages.some((m: any) => m.text === '配额恢复后的正式消息持久化验证'),
    'Formal chat messages persist to localStorage even after prior QuotaExceededError'
  );
  assert.ok(
    persistedDb.episodicMemories.some((m: any) => m.summary.includes('在钟楼露台看夜景')),
    'Formal episodic memories persist to localStorage even after prior QuotaExceededError'
  );
});

test('13. ROUND-03A: Mobile chat quality optimization — Leon RE6 baseline vs optimized payload comparison & 10-scenario verification', async () => {
  const capturedRequests: Array<{ url: string; body: any }> = [];
  const mockReplies: string[] = [];

  const { engine } = createPortableEngine({
    fetchImpl: async (url: string, init?: any) => {
      const body = init?.body ? JSON.parse(init.body) : {};
      capturedRequests.push({ url, body });
      const content =
        mockReplies.shift() ||
        'Pretty much a glorified night-shift security guard, minus the mall cameras and with a lot more international travel.\n\nNice to meet you too, Lin.';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          choices: [{ message: { content }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 420, completion_tokens: 34, total_tokens: 454 },
        }),
      };
    },
  });

  // Configure live API settings to verify sampling parameter fidelity
  await engine.request('/settings', {
    base_url: 'https://api.example.com/v1',
    api_key: 'sk-round03a-test-key',
    model: 'gemini-2.5-pro',
    temperature: 0.88,
    top_p: 0.95,
    max_tokens: 4096,
    demo_enabled: false,
  });

  // Profile for base scenario (newly matched stranger; profile display name differs from in-chat English self-intro "Lin")
  const pBase = (
    await engine.request('/profile', {
      name: 'User01',
      age: 24,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 99,
      intent: '',
      sources: [],
      bio: 'New in town.',
      interests: [],
    })
  ).profile;

  const leonCid = 're-game:leon:re6';
  mockReplies.push('{"match":true}', 'Just wrapped up a long shift. Finally off duty.');
  const matchRes = await engine.request('/swipe', {
    profileId: pBase.id,
    characterId: leonCid,
    direction: 'right',
  });
  assert.equal(matchRes.matched, true, 'Leon RE6 matched');

  // User sends the 4 consecutive English messages from the ROUND-03A specification
  const leonInputs = [
    'Nice to hear that',
    'wait, off duty?',
    'Sounds like agent LOL',
    "by the way I'm Lin, nice to meet you.",
  ];
  for (const text of leonInputs) {
    const qRes = await engine.request('/message', {
      profileId: pBase.id,
      characterId: leonCid,
      text,
    });
    assert.equal(qRes.queued, true);
  }

  // Preview the compiled mobile chat payload before flushing
  const afterMessages = engine.buildPromptPreview(pBase.id, leonCid, 'chat') as Array<{
    role: string;
    content: string;
  }>;

  // Verify structure and ordering of the optimized mobile chat payload
  assert.equal(afterMessages.length, 6, '1 system + 1 initial AI greeting + 4 consecutive user turns (no trailing system message)');
  assert.equal(afterMessages[0].role, 'system');
  assert.equal(afterMessages[1].role, 'assistant');
  assert.equal(afterMessages[1].content, 'Just wrapped up a long shift. Finally off duty.');
  for (let i = 0; i < leonInputs.length; i++) {
    assert.equal(afterMessages[2 + i].role, 'user');
    assert.equal(afterMessages[2 + i].content, leonInputs[i], `User message #${i + 1} preserved verbatim in order`);
  }
  assert.equal(
    afterMessages[afterMessages.length - 1].role,
    'user',
    'Final message in chat payload must be the user turn, never a trailing system message'
  );

  // Verify zero duplicate injection of user messages inside system prompt
  const sysContent = afterMessages[0].content;
  for (const text of leonInputs) {
    assert.equal(
      sysContent.includes(text),
      false,
      `System prompt must not duplicate user message text "${text}" via batchHint or today's daily-summary self-recall`
    );
  }
  assert.ok(
    !sysContent.includes('聊天归档：'),
    'Today active chat messages must not be self-recalled into Layer 3 as a past daily-summary archive'
  );
  assert.ok(
    !sysContent.includes('现场细节：'),
    'Mobile chat mode must not inject third-person novelistic surveillance scene prose'
  );
  assert.ok(
    !sysContent.includes('交友目的：未填写'),
    'Empty profile fields must not clutter Layer 1'
  );
  assert.ok(
    sysContent.includes('【连续消息提示】对方刚刚连续发来了最后 4 条消息'),
    'Includes concise non-duplicative multi-message continuity hint'
  );

  // Flush the queued messages and verify API payload & bubble parsing
  mockReplies.push(
    'Pretty much a glorified night-shift security guard, minus the mall cameras and with a lot more international travel.\n\nNice to meet you too, Lin.'
  );
  const flushLeon = await engine.request('/chat-flush', {
    profileId: pBase.id,
    characterId: leonCid,
    force: true,
  });
  const lastApiCall = capturedRequests[capturedRequests.length - 1].body;
  assert.equal(lastApiCall.model, 'gemini-2.5-pro');
  assert.equal(lastApiCall.temperature, 0.88);
  assert.equal(lastApiCall.top_p, 0.95);
  assert.equal(lastApiCall.max_tokens, 4096);
  assert.equal(lastApiCall.messages.length, 6);
  assert.equal(lastApiCall.messages[lastApiCall.messages.length - 1].role, 'user');
  assert.equal(
    lastApiCall.messages[lastApiCall.messages.length - 1].content,
    "by the way I'm Lin, nice to meet you."
  );

  assert.equal(flushLeon.replies.length, 2, 'Reference two-paragraph reply splits cleanly into 2 chat bubbles');
  assert.equal(
    flushLeon.replies[0].text,
    'Pretty much a glorified night-shift security guard, minus the mall cameras and with a lot more international travel.'
  );
  assert.equal(flushLeon.replies[1].text, 'Nice to meet you too, Lin.');

  // Verify single-bubble English reply containing a question mark is NOT prematurely chopped at 32 chars
  assert.deepEqual(
    Array.from(engine.splitChatBubbles('Off duty? Pretty much just catching up on sleep after a long week.')),
    ['Off duty? Pretty much just catching up on sleep after a long week.']
  );

  // 9 additional scenarios across diverse works, personalities, languages, relationship stages, corrections, jokes, awkwardness, disagreement, and topic switches
  const additionalScenarios: Array<{
    label: string;
    cid: string;
    reunited?: boolean;
    hotChat?: boolean;
    seedMemory?: string;
    userMessages: string[];
    mockAiReply: string;
    expectedBubbles: string[];
  }> = [
    {
      label: 'Scenario 2: Ada Wong (RE4) — English teasing & probing secretive identity',
      cid: 're-game:ada:re4',
      userMessages: [
        "Let me guess, your 'business trip' isn't exactly a corporate conference?",
        'Do I need security clearance just to ask what you drink?',
      ],
      mockAiReply: 'Curiosity can be a dangerous habit.\n\nRed wine, if you are paying.',
      expectedBubbles: ['Curiosity can be a dangerous habit.', 'Red wine, if you are paying.'],
    },
    {
      label: 'Scenario 3: Geralt of Rivia (Witcher 3) — Chinese banter + sudden topic switch',
      cid: 'witcher:game:geralt-3',
      userMessages: [
        '今天城里那帮吟游诗人吵得我头疼。',
        '算了不说这个，你今晚去酒馆喝麦酒还是继续在郊外喂萝卜？',
      ],
      mockAiReply: '吟游诗人确实很少知道什么时候该闭嘴。|||先喂完萝卜，再去喝一杯。',
      expectedBubbles: ['吟游诗人确实很少知道什么时候该闭嘴。', '先喂完萝卜，再去喝一杯。'],
    },
    {
      label: 'Scenario 4: Yennefer (Witcher 3) — Disagreement & pushback on boundaries',
      cid: 'witcher:game:yennefer-3',
      userMessages: ['我可不觉得凡事都要按你的规矩来，偶尔失控一下也没什么不好。'],
      mockAiReply: '失控和鲁莽是两回事。不过如果你能承担后果，我倒不介意在旁边看着。',
      expectedBubbles: ['失控和鲁莽是两回事。不过如果你能承担后果，我倒不介意在旁边看着。'],
    },
    {
      label: 'Scenario 5: Tony Stark (MCU Iron Man 3) — Bilingual teasing & wit',
      cid: 'marvel:mcu:tony-im3',
      userMessages: [
        'Heard your workshop coffee tastes like motor oil.',
        'Bet my corner cafe espresso beats Stark tech any day.',
      ],
      mockAiReply: 'That was one time, and technically it was hydraulic fluid adjacent.|||Send me the address. If it is mediocre, you owe me a lab tour.',
      expectedBubbles: [
        'That was one time, and technically it was hydraulic fluid adjacent.',
        'Send me the address. If it is mediocre, you owe me a lab tour.',
      ],
    },
    {
      label: 'Scenario 6: Natasha Romanoff (MCU Winter Soldier) — Awkward moment & graceful pivot',
      cid: 'marvel:mcu:natasha-ws',
      userMessages: [
        '刚才那句我是不是问得太冒昧了……',
        '如果不想提以前的事，我们完全可以换个轻松点的话题。',
      ],
      mockAiReply: '别紧张，能让我觉得冒昧的问题可不多。\n你想聊什么轻松的？最近看过的烂片？',
      expectedBubbles: ['别紧张，能让我觉得冒昧的问题可不多。', '你想聊什么轻松的？最近看过的烂片？'],
    },
    {
      label: 'Scenario 7: Loki (MCU TVA) — Reunited after unmatch retains memory & reunion hint',
      cid: 'marvel:mcu:loki-tva',
      reunited: true,
      userMessages: ['没想到又在这儿刷到你了，这次可别再突然消失。'],
      mockAiReply: '消失通常是为了更戏剧性的登场。|||况且我可没忘记上次是谁先按了解除匹配。',
      expectedBubbles: ['消失通常是为了更戏剧性的登场。', '况且我可没忘记上次是谁先按了解除匹配。'],
    },
    {
      label: 'Scenario 8: Judy Alvarez (Cyberpunk 2077) — User memory correction ("你记错了...")',
      cid: 'cyberpunk:game:judy',
      seedMemory: '约定周末去荒坂塔附近拍夜景',
      userMessages: ['你记错了，我上次说的是想去水下教堂拍超梦，不是去荒坂塔附近。'],
      mockAiReply: '啊，我的脑子昨晚剪超梦剪糊涂了。|||水下教堂确实比荒坂塔那破地方有味道多了。',
      expectedBubbles: ['啊，我的脑子昨晚剪超梦剪糊涂了。', '水下教堂确实比荒坂塔那破地方有味道多了。'],
    },
    {
      label: 'Scenario 9: Panam Palmer (Cyberpunk 2077) — Hot Chat mode consecutive messages',
      cid: 'cyberpunk:game:panam',
      hotChat: true,
      userMessages: ['恶土今晚风沙大不大？', '我带了两瓶冰啤酒，要不要出来坐坐？'],
      mockAiReply: '风刚停，星空清楚得很。\n算你识相，我在营地外那辆车顶等你。',
      expectedBubbles: ['风刚停，星空清楚得很。', '算你识相，我在营地外那辆车顶等你。'],
    },
    {
      label: 'Scenario 10: Steve Rogers (MCU Winter Soldier) — Separate profile & cross-character memory isolation',
      cid: 'marvel:mcu:steve-ws',
      userMessages: ['Do you still keep a notebook of things to catch up on?'],
      mockAiReply: 'Still adding to it every week. That list gets longer faster than I can cross things off.',
      expectedBubbles: ['Still adding to it every week. That list gets longer faster than I can cross things off.'],
    },
  ];

  // Create a second independent Profile for Scenario 10 to verify cross-Profile isolation
  const pSecond = (
    await engine.request('/profile', {
      name: 'Clara',
      age: 26,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 99,
      intent: '认识新朋友',
      sources: [],
      bio: 'Museum archivist.',
      interests: ['历史', '爵士乐'],
    })
  ).profile;

  for (const sc of additionalScenarios) {
    const activeProfile = sc.cid === 'marvel:mcu:steve-ws' ? pSecond : pBase;
    mockReplies.push('{"match":true}', 'Hey.');
    const mRes = await engine.request('/swipe', {
      profileId: activeProfile.id,
      characterId: sc.cid,
      direction: 'right',
    });
    assert.equal(mRes.matched, true, `${sc.label}: matched`);

    if (sc.reunited) {
      await engine.request('/unmatch', {
        profileId: activeProfile.id,
        characterId: sc.cid,
      });
      mockReplies.push('{"match":true}', 'Well, look who is back.');
      const remRes = await engine.request('/swipe', {
        profileId: activeProfile.id,
        characterId: sc.cid,
        direction: 'right',
      });
      assert.equal(remRes.matched, true);
      assert.equal(remRes.again, true);
    }

    if (sc.hotChat) {
      await engine.request('/hot-chat', {
        profileId: activeProfile.id,
        characterId: sc.cid,
        hotChat: true,
      });
    }

    if (sc.seedMemory) {
      await engine.request('/memory-action', {
        profileId: activeProfile.id,
        characterId: sc.cid,
        action: 'add',
        summary: sc.seedMemory,
      });
    }

    for (const uTxt of sc.userMessages) {
      await engine.request('/message', {
        profileId: activeProfile.id,
        characterId: sc.cid,
        text: uTxt,
      });
    }

    const preview = engine.buildPromptPreview(activeProfile.id, sc.cid, 'chat') as Array<{
      role: string;
      content: string;
    }>;
    assert.equal(
      preview[preview.length - 1].role,
      'user',
      `${sc.label}: payload ends with user message`
    );
    assert.equal(
      preview[preview.length - 1].content,
      sc.userMessages[sc.userMessages.length - 1],
      `${sc.label}: final message is verbatim latest user input`
    );

    if (sc.reunited) {
      assert.ok(
        preview[0].content.includes('曾解除匹配后再次重逢'),
        `${sc.label}: includes reunion relationship state`
      );
    }
    if (sc.seedMemory) {
      assert.ok(
        preview[0].content.includes('[已澄清纠正]'),
        `${sc.label}: user correction recalled in Layer 3`
      );
    }
    if (sc.cid === 'marvel:mcu:steve-ws') {
      const fullStr = JSON.stringify(preview);
      assert.ok(!fullStr.includes('User01') && !fullStr.includes('Lin'), 'Strict Profile isolation');
      assert.ok(!fullStr.includes('Leon S. Kennedy'), 'Strict Character isolation');
    }

    mockReplies.push(sc.mockAiReply);
    const fl = await engine.request('/chat-flush', {
      profileId: activeProfile.id,
      characterId: sc.cid,
      force: true,
    });
    assert.deepEqual(
      Array.from(fl.replies, (r: any) => r.text),
      sc.expectedBubbles,
      `${sc.label}: bubbles parsed cleanly`
    );
  }
});

test('14. ROUND-03B: API Error Gateway — 13 Mock-based error interception, retry, pause/resume, legacy isolation & zero false-positive tests', async () => {
  type MockResponder = (url: string, init?: any) => Promise<any>;
  const responderQueue: MockResponder[] = [];
  let apiCallCount = 0;

  const { engine, store } = createPortableEngine({
    fetchImpl: async (url: string, init?: any) => {
      apiCallCount++;
      const next = responderQueue.shift();
      if (next) {
        return next(url, init);
      }
      return {
        ok: true,
        status: 200,
        text: async () =>
          JSON.stringify({
            choices: [{ message: { content: '默认成功回复。' }, finish_reason: 'stop' }],
          }),
        json: async () => ({
          choices: [{ message: { content: '默认成功回复。' }, finish_reason: 'stop' }],
        }),
      };
    },
  });

  // Configure live API mode
  await engine.request('/settings', {
    base_url: 'https://api.example.com/v1',
    api_key: 'sk-gateway-test-key-9999',
    model: 'gemini-2.5-pro',
    temperature: 0.85,
    top_p: 0.95,
    max_tokens: 4096,
    demo_enabled: false,
  });

  const profile = (
    await engine.request('/profile', {
      name: '苏梨',
      age: 24,
      gender: 'female',
      interested_in: ['all'],
      min_age: 18,
      max_age: 99,
      intent: '认识新朋友',
      sources: [],
      bio: '测试 API Error Gateway',
      interests: ['摄影'],
    })
  ).profile;

  const cid = 're-game:leon:re6';
  const cidOther = 're-game:ada:re4';

  // Match both characters cleanly
  for (const targetCid of [cid, cidOther]) {
    responderQueue.push(
      async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: '{"match":true}' }, finish_reason: 'stop' }] }),
      }),
      async () => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ choices: [{ message: { content: 'Hey, matched.' }, finish_reason: 'stop' }] }),
      })
    );
    const sw = await engine.request('/swipe', {
      profileId: profile.id,
      characterId: targetCid,
      direction: 'right',
    });
    assert.equal(sw.matched, true);
  }

  // Helper to get current non-legacy messages and memories count
  const getThreadSnapshot = async (characterId = cid) => {
    const th = await engine.request(`/thread?profileId=${profile.id}&characterId=${encodeURIComponent(characterId)}`);
    const mem = await engine.request(`/memories?profileId=${profile.id}&characterId=${encodeURIComponent(characterId)}`);
    return { th, mem };
  };

  // =========================================================================
  // Case 1: HTTP 200 反代错误文本 (“所有API密钥均请求失败，具体错误请查看轮询日志”)
  // =========================================================================
  await engine.request('/message', {
    profileId: profile.id,
    characterId: cid,
    text: '第一条测试：反代密钥全部失败时发出的消息',
  });
  const snapBefore1 = await getThreadSnapshot(cid);

  responderQueue.push(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: { content: '所有API密钥均请求失败，具体错误请查看轮询日志' },
            finish_reason: 'stop',
          },
        ],
      }),
  }));

  const flush1 = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });
  assert.equal(flush1.reply, null, 'Case 1: Must not produce a character bubble');
  assert.equal(flush1.replies.length, 0);
  assert.ok(flush1.apiError, 'Case 1: Must return structured apiError for modal display');
  assert.equal(flush1.apiError.error_type, 'PROXY_ALL_KEYS_FAILED');
  assert.equal(flush1.apiError.character_id, cid);
  assert.equal(flush1.apiError.task_type, 'chat');

  const snapAfter1 = await getThreadSnapshot(cid);
  assert.equal(
    snapAfter1.th.messages.length,
    snapBefore1.th.messages.length,
    'Case 1: Zero error bubbles added to chat thread'
  );
  assert.equal(
    snapAfter1.th.messages.some((m: any) => m.text.includes('所有API密钥均请求失败')),
    false,
    'Case 1: Proxy error text never enters chat history'
  );
  assert.equal(
    snapAfter1.mem.memories.some((m: any) => m.summary.includes('所有API密钥均请求失败')),
    false,
    'Case 1: Proxy error text never enters episodic memories'
  );
  const logs1 = (await engine.request('/system-logs')).logs;
  assert.equal(logs1[0].error_type, 'PROXY_ALL_KEYS_FAILED', 'Case 1: Recorded in System Log');

  // =========================================================================
  // Case 2: HTTP 200 但带 error 字段
  // =========================================================================
  responderQueue.push(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        error: { message: 'Upstream quota exhausted on channel #4', type: 'upstream_error' },
      }),
  }));
  const flush2 = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });
  assert.equal(flush2.reply, null, 'Case 2: No bubble created');
  assert.ok(flush2.apiError);
  assert.equal(flush2.apiError.error_type, 'HTTP_200_ERROR_OBJECT');
  assert.ok(flush2.apiError.message.includes('Upstream quota exhausted'));

  // =========================================================================
  // Case 3: HTTP 401 / 403 / 404 / 429 (with Retry-After) / 500 / 502 / 503 / 504 / 529
  // =========================================================================
  const statusCases: Array<{
    code: number;
    retryAfter?: string;
    expectTerminal?: boolean;
    expectTokenWarn?: boolean;
  }> = [
    { code: 401, expectTerminal: true },
    { code: 403, expectTerminal: true },
    { code: 404, expectTerminal: true },
    { code: 429, retryAfter: '18' },
    { code: 500 },
    { code: 502 },
    { code: 503 },
    { code: 504, expectTokenWarn: true },
    { code: 529 },
  ];

  for (const sc of statusCases) {
    responderQueue.push(async () => ({
      ok: false,
      status: sc.code,
      headers: {
        get: (h: string) => (h.toLowerCase() === 'retry-after' ? sc.retryAfter || null : null),
      },
      text: async () => JSON.stringify({ error: { message: `Simulated HTTP ${sc.code} failure` } }),
    }));
    const res = await engine.request('/chat-flush', {
      profileId: profile.id,
      characterId: cid,
      force: true,
    });
    assert.equal(res.reply, null, `Case 3 (HTTP ${sc.code}): No character bubble or demo fallback`);
    assert.ok(res.apiError, `Case 3 (HTTP ${sc.code}): Structured apiError returned`);
    assert.equal(res.apiError.http_status, sc.code);
    assert.equal(res.apiError.error_type, `HTTP_${sc.code}`);
    if (sc.expectTerminal) {
      assert.equal(res.apiError.suggest_terminal, true, `HTTP ${sc.code} guides user to Terminal settings`);
    }
    if (sc.retryAfter) {
      assert.equal(res.apiError.retry_after, 18, 'HTTP 429 parses Retry-After seconds');
      assert.ok(res.apiError.message.includes('18 秒'));
    }
    if (sc.expectTokenWarn) {
      assert.equal(res.apiError.may_consume_tokens, true, `HTTP ${sc.code} warns about potential upstream token consumption`);
    }
  }

  // =========================================================================
  // Case 4: 网络失败与超时
  // =========================================================================
  responderQueue.push(async () => {
    throw new TypeError('Failed to fetch: net::ERR_INTERNET_DISCONNECTED');
  });
  const netFail = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });
  assert.equal(netFail.reply, null);
  assert.equal(netFail.apiError.error_type, 'NETWORK_ERROR');
  assert.equal(netFail.apiError.may_consume_tokens, true);

  responderQueue.push(async () => {
    const err: any = new Error('The operation was aborted due to timeout');
    err.name = 'AbortError';
    throw err;
  });
  const timeoutFail = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });
  assert.equal(timeoutFail.reply, null);
  assert.equal(timeoutFail.apiError.error_type, 'REQUEST_TIMEOUT');
  assert.equal(timeoutFail.apiError.may_consume_tokens, true);
  assert.equal(timeoutFail.queue.count, 1, 'Case 4: User pending message remains safely queued');

  // =========================================================================
  // Case 5: 空响应（空字符串、{}、content: ""）
  // =========================================================================
  for (const emptyBody of ['', '{}', JSON.stringify({ choices: [{ message: { content: '   ' }, finish_reason: 'stop' }] })]) {
    responderQueue.push(async () => ({
      ok: true,
      status: 200,
      text: async () => emptyBody,
    }));
    const emptyRes = await engine.request('/chat-flush', {
      profileId: profile.id,
      characterId: cid,
      force: true,
    });
    assert.equal(emptyRes.reply, null, 'Case 5: Empty response never creates blank or placeholder bubble');
    assert.ok(emptyRes.apiError);
    assert.ok(
      ['EMPTY_RESPONSE', 'EMPTY_CHOICES', 'EMPTY_CONTENT'].includes(emptyRes.apiError.error_type),
      `Case 5: Classified as ${emptyRes.apiError.error_type}`
    );
  }

  // =========================================================================
  // Case 6: 输出截断与结构化 JSON 损坏
  // =========================================================================
  responderQueue.push(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: '半句话就被截断' }, finish_reason: 'length' }],
      }),
  }));
  const truncRes = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });
  assert.equal(truncRes.reply, null, 'Case 6: Severely truncated output intercepted');
  assert.equal(truncRes.apiError.error_type, 'OUTPUT_TRUNCATED');

  // Gemini-compatible proxies may use uppercase MAX_TOKENS; a bare narration marker is not a reply.
  for (const [content, finish_reason, expected] of [
    ['半句话', 'MAX_TOKENS', 'OUTPUT_TRUNCATED'],
    ['半句话', 'max_tokens', 'OUTPUT_TRUNCATED'],
    ['旁白', 'STOP', 'EMPTY_PARSED_CONTENT'],
  ]) {
    responderQueue.push(async () => ({ok: true, status: 200, text: async () => JSON.stringify({choices: [{message: {content}, finish_reason}]})}));
    const before = await getThreadSnapshot(cid);
    const result = await engine.request('/chat-flush', {profileId: profile.id, characterId: cid, force: true});
    assert.equal(result.reply, null);
    assert.equal(result.apiError.error_type, expected);
    const after = await getThreadSnapshot(cid);
    assert.equal(after.th.messages.length, before.th.messages.length);
  }

  // Also test structured JSON corruption on manual surveillance refresh
  const survBefore = await engine.request(`/surveillance?profileId=${profile.id}&characterId=${encodeURIComponent(cid)}`);
  assert.equal(survBefore.unlockedSlots.length > 0, true);
  responderQueue.push(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: '{"slots": [{"start": "00:00", broken_json' }, finish_reason: 'length' }],
      }),
  }));
  const survRefreshFail = await engine.request('/surveillance', {
    profileId: profile.id,
    characterId: cid,
    refresh: true,
  });
  assert.ok(survRefreshFail.apiError, 'Case 6: Invalid JSON in structured task intercepted');
  assert.equal(survRefreshFail.apiError.error_type, 'OUTPUT_TRUNCATED');
  assert.equal(
    survRefreshFail.unlockedSlots.length,
    survBefore.unlockedSlots.length,
    'Case 6: Corrupted structured JSON never overwrites existing valid surveillance slots'
  );

  // =========================================================================
  // Case 7: 手动重试成功（不重复插入用户消息、队列按顺序恢复、不产生重复记忆）
  // =========================================================================
  responderQueue.push(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [
          {
            message: { content: '抱歉刚信号不好，现在收到你那条消息了。|||我们周末约定的事我一直记着。' },
            finish_reason: 'stop',
          },
        ],
      }),
  }));
  const retrySuccess = await engine.request('/task-action', {
    profileId: profile.id,
    characterId: cid,
    taskType: 'chat',
    action: 'retry',
  });
  assert.ok(retrySuccess.reply, 'Case 7: Manual retry succeeded');
  assert.equal(retrySuccess.replies.length, 2);
  assert.equal(retrySuccess.queue.count, 0, 'Case 7: Pending queue cleared after retry success');

  const snapAfter7 = await getThreadSnapshot(cid);
  const userMsgsCase7 = snapAfter7.th.messages.filter(
    (m: any) => m.sender === 'user' && m.text === '第一条测试：反代密钥全部失败时发出的消息'
  );
  assert.equal(userMsgsCase7.length, 1, 'Case 7: User message was never duplicated across retries');

  // =========================================================================
  // Case 8: 手动重试失败与快速连点去重
  // =========================================================================
  await engine.request('/message', {
    profileId: profile.id,
    characterId: cid,
    text: '测试重试失败与连点去重',
  });

  responderQueue.push(async () => ({
    ok: false,
    status: 502,
    text: async () => JSON.stringify({ error: { message: 'Bad Gateway attempt 1' } }),
  }));
  const firstFail8 = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });
  assert.equal(firstFail8.apiError.error_type, 'HTTP_502');
  const firstTaskId = firstFail8.apiError.task_id;

  // Second retry also fails, and test rapid concurrent double-click deduplication
  let slowResolve: (() => void) | null = null;
  const callsBeforeDoubleClick = apiCallCount;
  responderQueue.push(
    async () => {
      await new Promise<void>((r) => {
        slowResolve = r;
      });
      return {
        ok: false,
        status: 503,
        text: async () => JSON.stringify({ error: { message: 'Service Unavailable attempt 2' } }),
      };
    }
  );

  const click1Promise = engine.request('/task-action', {
    profileId: profile.id,
    characterId: cid,
    taskType: 'chat',
    action: 'retry',
  });
  const click2Result = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
    manualResume: true,
  });
  assert.equal(click2Result.inflight, true, 'Case 8: Rapid second click deduplicated while first retry is in-flight');
  assert.equal(apiCallCount - callsBeforeDoubleClick, 1, 'Case 8: Only 1 network call issued on rapid double-click');

  if (slowResolve) (slowResolve as () => void)();
  const retryFail8 = await click1Promise;
  assert.equal(retryFail8.apiError.error_type, 'HTTP_503');
  assert.equal(retryFail8.apiError.retry_of_task_id, firstTaskId, 'Case 8: Retry log links to previous failed task_id');
  assert.ok(retryFail8.apiError.attempt >= 2, 'Case 8: Attempt counter incremented');
  assert.equal(retryFail8.queue.count, 1, 'Case 8: Queue still preserves pending message after second failure');

  // =========================================================================
  // Case 9: 手动暂停与关闭弹窗（仅针对当前失败任务生效，不影响其他角色）
  // =========================================================================
  const pauseRes = await engine.request('/task-action', {
    profileId: profile.id,
    characterId: cid,
    taskType: 'chat',
    action: 'pause',
  });
  assert.equal(pauseRes.paused, true);
  assert.equal(pauseRes.queue.paused, true);
  assert.equal(pauseRes.queue.status, 'paused');
  assert.ok(pauseRes.queue.scheduleReason.includes('回复已暂停 · 点击恢复'));

  // Verify auto-flush / background due flush does NOT fire API calls for paused character
  const callsBeforePausedFlush = apiCallCount;
  const autoFlushPaused = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true, // even force without manualResume must respect paused state
  });
  assert.equal(autoFlushPaused.paused, true);
  assert.equal(apiCallCount, callsBeforePausedFlush, 'Case 9: Paused task never fires API call without manualResume');

  // Verify another character (Ada Wong) can still chat normally while Leon is paused!
  await engine.request('/message', {
    profileId: profile.id,
    characterId: cidOther,
    text: 'Ada，Leon 那边暂停了，你这边正常吗？',
  });
  responderQueue.push(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: '我这边当然一切正常。' }, finish_reason: 'stop' }],
      }),
  }));
  const otherFlush = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cidOther,
    force: true,
  });
  assert.equal(otherFlush.reply.text, '我这边当然一切正常。', 'Case 9: Pausing Leon never blocks Ada');

  // =========================================================================
  // Case 10: 暂停期间继续发消息（保存为待回复、按时间顺序排队、不自动恢复；手动恢复后一并处理）
  // =========================================================================
  const callsBeforePausedSend = apiCallCount;
  const sendWhilePaused1 = await engine.request('/message', {
    profileId: profile.id,
    characterId: cid,
    text: '暂停期间补充的第二条消息',
  });
  const sendWhilePaused2 = await engine.request('/message', {
    profileId: profile.id,
    characterId: cid,
    text: '暂停期间补充的第三条消息',
  });
  assert.equal(sendWhilePaused1.paused, true);
  assert.equal(sendWhilePaused2.paused, true);
  assert.equal(sendWhilePaused2.queue.count, 3, 'Case 10: All 3 messages queued in order while paused');
  assert.equal(apiCallCount, callsBeforePausedSend, 'Case 10: Sending messages while paused does not trigger API');

  // Now manually resume and verify all 3 queued messages are sent in chronological order in a single request
  let capturedResumePayload: any = null;
  responderQueue.push(async (_url, init) => {
    capturedResumePayload = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: '这三条消息我全都按顺序看到了。' }, finish_reason: 'stop' }],
        }),
    };
  });
  const manualResumeRes = await engine.request('/task-action', {
    profileId: profile.id,
    characterId: cid,
    taskType: 'chat',
    action: 'resume',
  });
  assert.equal(manualResumeRes.reply.text, '这三条消息我全都按顺序看到了。');
  assert.equal(manualResumeRes.queue.paused, false);
  assert.equal(manualResumeRes.queue.count, 0);
  const tailUserContents = capturedResumePayload.messages.slice(-3).map((m: any) => m.content);
  assert.deepEqual(
    tailUserContents,
    ['测试重试失败与连点去重', '暂停期间补充的第二条消息', '暂停期间补充的第三条消息'],
    'Case 10: Manual resume processes all queued messages in exact chronological order'
  );

  // =========================================================================
  // Case 11: 暂停或请求途中切换模式 / 解除匹配（旧响应被丢弃、状态清理、不跨场景写入）
  // =========================================================================
  await engine.request('/message', {
    profileId: profile.id,
    characterId: cid,
    text: '切去见面模式前在手机上发的最后一条消息',
  });
  let releaseInflight11: (() => void) | null = null;
  responderQueue.push(async () => {
    await new Promise<void>((r) => {
      releaseInflight11 = r;
    });
    return {
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          choices: [{ message: { content: '这条迟到的手机回复应当被丢弃，绝不能混进见面模式。' }, finish_reason: 'stop' }],
        }),
    };
  });

  const inflightFlush11 = engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });

  // While chat-flush is in-flight, user switches to meeting mode
  await engine.request('/mode', {
    profileId: profile.id,
    characterId: cid,
    mode: 'meeting',
    triggerOpening: false,
  });
  if (releaseInflight11) (releaseInflight11 as () => void)();
  const finishedInflight11 = await inflightFlush11;
  assert.equal(finishedInflight11.discarded, true, 'Case 11: Stale in-flight response discarded after mode switch');
  assert.equal(finishedInflight11.reply, null);

  const snapAfter11 = await getThreadSnapshot(cid);
  assert.equal(
    snapAfter11.th.messages.some((m: any) => m.text.includes('这条迟到的手机回复应当被丢弃')),
    false,
    'Case 11: Discarded response never written to thread'
  );

  // Switch back to chat mode
  await engine.request('/mode', {
    profileId: profile.id,
    characterId: cid,
    mode: 'chat',
  });

  // =========================================================================
  // Case 12: 正常角色台词不误判（包含 “API”、“404”、“429”、“接口报错”、“超时” 等词语）
  // =========================================================================
  await engine.request('/message', {
    profileId: profile.id,
    characterId: cid,
    text: '你刚才看那份技术报告写的是什么？',
  });
  const roleplayLineWithKeywords =
    '报告里写着他们的旧终端出现 404 和 429 超时，甚至有人抱怨 API 接口报错。|||不过在战场上，我更相信手里的装备。';
  responderQueue.push(async () => ({
    ok: true,
    status: 200,
    text: async () =>
      JSON.stringify({
        choices: [{ message: { content: roleplayLineWithKeywords }, finish_reason: 'stop' }],
      }),
  }));
  const normalRoleplayRes = await engine.request('/chat-flush', {
    profileId: profile.id,
    characterId: cid,
    force: true,
  });
  assert.equal(normalRoleplayRes.apiError, null, 'Case 12: Normal roleplay mentioning API/404/429/接口报错/超时 is NEVER misclassified');
  assert.equal(normalRoleplayRes.replies.length, 2, 'Case 12: Normal roleplay bubbles created properly');
  assert.ok(normalRoleplayRes.replies[0].text.includes('404 和 429 超时'));

  // =========================================================================
  // Case 13: 旧存档已存在错误气泡的兼容隔离
  // =========================================================================
  const STORE_KEY = 'parallel-portable-v2';
  const rawDb = JSON.parse(store.get(STORE_KEY) || '{}');
  const normalCountBefore13 = (await getThreadSnapshot(cid)).th.messages.length;

  // Inject legacy polluted error bubbles directly into saved db
  rawDb.messages.push(
    {
      id: 'legacy_err_1',
      profile_id: profile.id,
      character_id: cid,
      sender: 'ai',
      mode: 'chat',
      text: '（生成失败：模型接口返回 HTTP 502；请检查终端中的 API 地址、密钥、模型名称与额度。）',
      engine: 'error',
      created_at: new Date().toISOString(),
    },
    {
      id: 'legacy_proxy_err_2',
      profile_id: profile.id,
      character_id: cid,
      sender: 'ai',
      mode: 'chat',
      text: '所有API密钥均请求失败，具体错误请查看轮询日志',
      engine: 'live',
      created_at: new Date().toISOString(),
    }
  );
  rawDb.episodicMemories.push({
    id: 'legacy_mem_err_1',
    owner_id: cid,
    profile_id: profile.id,
    source_type: 'dialogue',
    source_key: 'turn:legacy_proxy_err_2',
    knowledge_mode: 'stated',
    summary: 'Leon 提到：「所有API密钥均请求失败，具体错误请查看轮询日志」',
    tags: ['API', '密钥'],
    importance: 4,
    emotional_weight: 3,
    unresolved: 0,
    disputed: 0,
    raw_msg_ids: ['legacy_proxy_err_2'],
    event_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
  });
  store.set(STORE_KEY, JSON.stringify(rawDb));

  // Reload engine from the legacy-polluted store
  const { engine: reloadedEngine } = createPortableEngine({
    store,
  });

  const reloadedThread = await reloadedEngine.request(
    `/thread?profileId=${profile.id}&characterId=${encodeURIComponent(cid)}`
  );
  assert.equal(
    reloadedThread.messages.length,
    normalCountBefore13,
    'Case 13: All normal user/AI messages are preserved while legacy error bubbles are hidden'
  );
  assert.equal(
    reloadedThread.messages.some(
      (m: any) => m.id === 'legacy_err_1' || m.id === 'legacy_proxy_err_2'
    ),
    false,
    'Case 13: Legacy error bubbles are excluded from chat display'
  );

  const reloadedPreview = JSON.stringify(reloadedEngine.buildPromptPreview(profile.id, cid, 'chat'));
  assert.equal(
    reloadedPreview.includes('所有API密钥均请求失败') || reloadedPreview.includes('生成失败：模型接口返回'),
    false,
    'Case 13: Legacy error bubbles & polluted memories never enter next-turn messages payload'
  );

  const reloadedThreadsList = (
    await reloadedEngine.request(`/threads?profileId=${profile.id}`)
  ).threads;
  const leonThreadSummary = reloadedThreadsList.find((t: any) => t.character.id === cid);
  assert.ok(leonThreadSummary);
  assert.notEqual(
    leonThreadSummary.last?.id,
    'legacy_proxy_err_2',
    'Case 13: Thread preview and unread tracker ignore legacy error bubbles'
  );
});




