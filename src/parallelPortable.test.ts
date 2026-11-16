import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';

function createPortableEngine() {
  const src = fs.readFileSync(
    path.resolve(process.cwd(), 'public/parallel/offline.js'),
    'utf8'
  );
  const store = new Map<string, string>();
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
    fetch: async () => {
      throw new Error('network disabled in unit tests');
    },
  };
  vm.createContext(context);
  vm.runInContext(src, context);
  return win.ParallelOffline as {
    request: (p: string, b?: Record<string, unknown>) => Promise<any>;
    buildPromptPreview: (pid: string, cid: string, mode?: string) => Array<{ role: string; content: string }>;
    exportData: () => string;
    importData: (raw: string) => { profiles: number; messages: number };
  };
}

test('Parallel v0.5 four-layer memory isolation, on-demand retrieval, and conversational correction', async () => {
  const engine = createPortableEngine();
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
  const engine = createPortableEngine();
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
  const engine = createPortableEngine();
  const ada = await engine.request('/identify?name=' + encodeURIComponent('艾达王'));
  assert.ok(ada.matches.some((m: any) => m.name === 'Ada Wong'));

  const bucky = await engine.request('/identify?name=' + encodeURIComponent('冬日战士'));
  assert.ok(bucky.matches.some((m: any) => m.name === 'Bucky Barnes'));
});

test('Parallel v0.5 matched candidate exclusion, message deletion, and legacy backup restore', async () => {
  const engine = createPortableEngine();
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
  const engine = createPortableEngine();
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
  const engine = createPortableEngine();
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
  const engine = createPortableEngine();
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

  const dailyMems = memData.episodic.filter((m: any) => m.memory_type === 'daily_summary');
  assert.ok(dailyMems.length >= 1, 'Groups daily chat into 1 daily summary card per day');
  assert.ok(Array.isArray(dailyMems[0].day_messages) && dailyMems[0].day_messages.length >= 1, 'Daily summary includes day_messages for modal inspection');
});

test('Parallel v0.5 Daily Mode message bundling (preserving scheduled dueAt & timestamps), Hot Chat Mode toggle, and staggered proactive messages', async () => {
  const engine = createPortableEngine();
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

  // 3. Prompt preview includes per-message [短信 HH:MM] timestamps
  const preview = JSON.stringify(engine.buildPromptPreview(p.id, cid, 'chat'));
  assert.match(preview, /\[短信 \d{2}:\d{2}\]/, 'Each message in working history carries its own [短信 HH:MM] timestamp');

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

