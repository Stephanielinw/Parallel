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

