import test from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeTranslationNeed,
  needsChineseTranslation,
  computeContentVersion,
  buildCharacterLanguageDirective,
  buildBatchTranslationMessages,
  parseTranslationBatchResponse,
} from './bilingualTranslation';

test('1. English, Japanese, Korean, and European messages require translation', () => {
  assert.equal(needsChineseTranslation('Just wrapped up a long shift. Finally off duty.'), true);
  assert.equal(needsChineseTranslation("Don't tell me you stayed up waiting for me."), true);
  assert.equal(needsChineseTranslation('おやすみ、また明日連絡するね。'), true);
  assert.equal(needsChineseTranslation('お疲れ様！コーヒー買ってきたよ。'), true);
  assert.equal(needsChineseTranslation('오늘 정말 수고했어.'), true);
  assert.equal(needsChineseTranslation('¿Todo bien por allá?'), true);
});

test('2. Pure Simplified Chinese and symbols-only messages do not require translation', () => {
  assert.equal(needsChineseTranslation('我刚把摩托车停好，马上进去找你。'), false);
  assert.equal(needsChineseTranslation('嗯，我在。'), false);
  assert.equal(needsChineseTranslation('？？？... 12345'), false);
  assert.equal(needsChineseTranslation('   '), false);
  assert.equal(needsChineseTranslation('OK'), false);
  assert.equal(needsChineseTranslation('https://example.com/map'), false);
});

test('3. Mixed-language messages handle everyday loanwords vs substantive foreign phrases', () => {
  // Minor loanwords or character names embedded in Chinese should NOT waste translation calls
  assert.equal(needsChineseTranslation('OK，我马上到。'), false);
  assert.equal(needsChineseTranslation('刚打完 RE4，咖啡都凉了。'), false);
  assert.equal(
    needsChineseTranslation('Leon，你今天状态怎么样？', ['Leon S. Kennedy']),
    false
  );

  // Substantive English or Japanese mixed with Chinese SHOULD be translated
  assert.equal(
    needsChineseTranslation("Wait, 你说真的？That's actually pretty wild."),
    true
  );
  assert.equal(
    needsChineseTranslation('ありがとう，今天真的辛苦你了。'),
    true
  );
  const res = analyzeTranslationNeed("Honestly, 我没料到你会这么说。");
  assert.equal(res.needsTranslation, true);
  assert.equal(res.reason, 'mixed_language');
});

test('4. Content version is deterministic and invalidates on any text change', () => {
  const v1 = computeContentVersion('Coffee is on me tonight.');
  const v1Same = computeContentVersion('Coffee is on me tonight.');
  const v2 = computeContentVersion('Coffee is on me tomorrow.');
  assert.equal(v1, v1Same);
  assert.notEqual(v1, v2);
});

test('5. Character language directives match all 4 preference modes', () => {
  assert.ok(buildCharacterLanguageDirective('natural').includes('自然选择'));
  assert.ok(buildCharacterLanguageDirective('zh').includes('简体中文'));
  assert.ok(buildCharacterLanguageDirective('en').includes('英语'));
  assert.ok(buildCharacterLanguageDirective('custom', '日语').includes('日语'));
  // Empty custom falls back to natural
  assert.ok(buildCharacterLanguageDirective('custom', '').includes('自然选择'));
});

test('6. Batch translation prompt and response parser align multi-bubble IDs accurately', () => {
  const items = [
    { id: 'm1', text: 'Still awake?' },
    { id: 'm2', text: "Don't make me worry." },
  ];
  const msgs = buildBatchTranslationMessages(items, 'Leon S. Kennedy', '特工、讽刺幽默');
  assert.equal(msgs.length, 2);
  assert.equal(msgs[0].role, 'system');
  assert.ok(msgs[0].content.includes('严禁擅自添加任何解释'));

  const parsed = parseTranslationBatchResponse(
    '```json\n{"translations":[{"id":"m1","zh":"还没睡？"},{"id":"m2","zh":"别让我担心。"}]}\n```',
    items
  );
  assert.deepEqual(parsed.missingIds, []);
  assert.equal(parsed.translations.m1, '还没睡？');
  assert.equal(parsed.translations.m2, '别让我担心。');
});
