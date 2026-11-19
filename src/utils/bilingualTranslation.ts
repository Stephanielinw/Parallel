/**
 * Pure bilingual chat translation helpers shared conceptually across
 * Parallel web/portable JS (offline.js) and Python backend (server.py).
 */

export type CharacterLanguagePref = 'natural' | 'zh' | 'en' | 'custom';

export interface TranslationLanguageDecision {
  needsTranslation: boolean;
  reason:
    | 'empty'
    | 'non_lexical'
    | 'already_zh_cn'
    | 'zh_with_minor_loanword'
    | 'foreign_only'
    | 'japanese_or_other_script'
    | 'mixed_language';
  detectedScript: 'zh' | 'en' | 'ja' | 'ko' | 'other' | 'mixed' | 'none';
}

export interface TranslationBatchItem {
  id: string;
  text: string;
}

export interface ParsedTranslationResult {
  translations: Record<string, string>;
  missingIds: string[];
}

const MINOR_ZH_CHAT_TOKENS = new Set([
  'ok', 'okay', 'app', 'wifi', 'ai', 'id', 'ip', 'vip', 'bgm', 'npc', 'cp',
  'ui', 'ux', 'api', 'vr', 'ar', 'pdf', 'gps', 'dna', 'mv', 'tv', 'cd',
  'usb', 'gif', 'png', 'jpg', 'atm', 'diy', 'ktv', 'ceo', 'hr', 'pr', 'qa',
  'pm', 'am', 'km', 'cm', 'kg', 'ml', 'mg', 're', 're0', 're1', 're2', 're3',
  're4', 're5', 're6', 're7', 're8', 'mcu', 'tva', 'bsaa', 'stars', 'ubcs',
  'lol', 'omg', 'btw', 'vs', 'kfc', 'bmw', 'ps5', 'pc', 'ios', 'mac',
]);

const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const HAN_RE = /[\u4e00-\u9fff\u3400-\u4dbf]/g;
const KANA_RE = /[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff]/g;
const HANGUL_RE = /[\uac00-\ud7af\u1100-\u11ff]/g;
const CYRILLIC_OTHER_RE = /[\u0400-\u04ff\u0370-\u03ff\u0600-\u06ff\u0e00-\u0e7f\u0590-\u05ff]/g;
const LATIN_WORD_RE = /[A-Za-z\u00c0-\u024f]+(?:'[A-Za-z\u00c0-\u024f]+)*/g;

/**
 * Deterministic content version hash (FNV-1a 32-bit x2) bound to message text.
 * Any edit or regeneration of the original message text produces a different version,
 * guaranteeing stale translations can never be displayed.
 */
export function computeContentVersion(text: string): string {
  const normalized = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 ^= ch + (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return `v1:${normalized.length}:${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

/**
 * Determines whether an AI chat message needs a Simplified Chinese reading-aid translation.
 * Pure Simplified Chinese messages, symbols/emoji/numbers only, and Chinese messages
 * containing only minor everyday loanwords or known character names return false (0 API cost).
 */
export function analyzeTranslationNeed(
  rawText: string,
  ignoreNames: string[] = []
): TranslationLanguageDecision {
  const stripped = String(rawText ?? '').replace(URL_RE, ' ').trim();
  if (!stripped) {
    return { needsTranslation: false, reason: 'empty', detectedScript: 'none' };
  }

  const hanCount = (stripped.match(HAN_RE) || []).length;
  const kanaCount = (stripped.match(KANA_RE) || []).length;
  const hangulCount = (stripped.match(HANGUL_RE) || []).length;
  const otherForeignCount = (stripped.match(CYRILLIC_OTHER_RE) || []).length;
  const allLatinWords = stripped.match(LATIN_WORD_RE) || [];

  const ignoredTokens = new Set<string>();
  for (const name of ignoreNames) {
    for (const part of String(name || '').match(LATIN_WORD_RE) || []) {
      const lower = part.toLowerCase();
      if (lower.length >= 2) ignoredTokens.add(lower);
    }
  }

  // Japanese kana / Korean hangul / Cyrillic / Arabic / Greek / Thai always need translation
  if (kanaCount > 0) {
    return {
      needsTranslation: true,
      reason: 'japanese_or_other_script',
      detectedScript: hanCount > 0 && allLatinWords.length > 0 ? 'mixed' : 'ja',
    };
  }
  if (hangulCount > 0) {
    return {
      needsTranslation: true,
      reason: 'japanese_or_other_script',
      detectedScript: 'ko',
    };
  }
  if (otherForeignCount > 0) {
    return {
      needsTranslation: true,
      reason: 'japanese_or_other_script',
      detectedScript: 'other',
    };
  }

  const totalLatinChars = allLatinWords.reduce((sum, w) => sum + w.length, 0);

  if (hanCount === 0 && totalLatinChars === 0) {
    return { needsTranslation: false, reason: 'non_lexical', detectedScript: 'none' };
  }

  if (hanCount === 0 && totalLatinChars > 0) {
    // Pure Latin/English/European message
    const substantive = allLatinWords.filter((w) => {
      const lower = w.toLowerCase();
      return !MINOR_ZH_CHAT_TOKENS.has(lower) || allLatinWords.length > 1;
    });
    // Even single English word like "Hey." or "Nope." when alone with no Chinese is foreign
    if (substantive.length > 0 || totalLatinChars >= 2) {
      // Skip lone "OK" / "OK." / "LOL"
      if (allLatinWords.length === 1 && MINOR_ZH_CHAT_TOKENS.has(allLatinWords[0].toLowerCase())) {
        return { needsTranslation: false, reason: 'zh_with_minor_loanword', detectedScript: 'en' };
      }
      return { needsTranslation: true, reason: 'foreign_only', detectedScript: 'en' };
    }
    return { needsTranslation: false, reason: 'non_lexical', detectedScript: 'none' };
  }

  if (hanCount > 0 && totalLatinChars === 0) {
    return { needsTranslation: false, reason: 'already_zh_cn', detectedScript: 'zh' };
  }

  // Mixed Han + Latin: check whether Latin content is substantive beyond everyday loanwords/names
  const substantiveLatinWords = allLatinWords.filter((w) => {
    const lower = w.toLowerCase();
    if (lower.length <= 1) return false;
    if (MINOR_ZH_CHAT_TOKENS.has(lower)) return false;
    if (ignoredTokens.has(lower)) return false;
    return true;
  });

  const substantiveChars = substantiveLatinWords.reduce((sum, w) => sum + w.length, 0);
  if (
    substantiveLatinWords.length >= 2 ||
    (substantiveLatinWords.length === 1 && substantiveChars >= 7)
  ) {
    return { needsTranslation: true, reason: 'mixed_language', detectedScript: 'mixed' };
  }

  return { needsTranslation: false, reason: 'zh_with_minor_loanword', detectedScript: 'zh' };
}

export function needsChineseTranslation(rawText: string, ignoreNames: string[] = []): boolean {
  return analyzeTranslationNeed(rawText, ignoreNames).needsTranslation;
}

/**
 * Builds the non-intrusive character language preference directive appended to mobile chat prompt.
 * Never alters face-to-face meeting mode prompts.
 */
export function buildCharacterLanguageDirective(
  pref: CharacterLanguagePref | string = 'natural',
  customLanguage = ''
): string {
  const mode = ['natural', 'zh', 'en', 'custom'].includes(pref) ? pref : 'natural';
  const custom = String(customLanguage || '').trim().slice(0, 40);
  if (mode === 'zh') {
    return '【角色语言偏好：简体中文】本次手机聊天请优先使用自然、符合你原作性格与语气特色的简体中文回复（保留你原有的称呼习惯、幽默或克制感，不要翻译腔）。';
  }
  if (mode === 'en') {
    return '【角色语言偏好：英语】本次手机聊天请优先使用自然、地道的英语回复，完整保留你的原作性格、俚语、讽刺幽默与称呼习惯。';
  }
  if (mode === 'custom' && custom) {
    return `【角色语言偏好：${custom}】本次手机聊天请优先使用「${custom}」自然回复，完整保留你的原作性格、情绪与说话方式。`;
  }
  return '【角色语言策略：自然选择】请依据你自身的原作背景、母语、文化身份、个人语言能力与当前交流情境自然使用语言（例如欧美角色可用英语，日本角色可用日语，中国角色可用中文，多语言角色可根据情境自然切换），不强制统一语言，也绝不为了翻译功能改变原有性格或说话方式；用户可自由使用中文、英语或其他语言发消息。';
}

/**
 * Builds the compact, low-token batch translation prompt for the independent translation task.
 */
export function buildBatchTranslationMessages(
  items: TranslationBatchItem[],
  characterName: string,
  characterCue = ''
): Array<{ role: 'system' | 'user'; content: string }> {
  const cue = String(characterCue || '').trim().slice(0, 120);
  const sys = [
    '你是 Parallel 手机聊天界面的系统阅读辅助翻译器。',
    '任务：将输入数组中每条角色消息准确翻译为自然、地道的简体中文。',
    '铁律：',
    '1. 忠实保留原文的情绪、幽默、讽刺、俚语、称呼、停顿与人物说话风格，避免生硬翻译腔。',
    '2. 严禁擅自添加任何解释、注释、旁白、动作描写、括号补充或改变角色原本表达的意思。',
    '3. 若某条消息为中外文混合，请整理为通顺自然的完整简体中文句意，专有名词可自然保留。',
    '4. 严格只输出一个 JSON 对象，格式为 {"translations":[{"id":"原id","zh":"对应简体中文译文"}]}，必须与输入 id 一一对应且数量完全一致。',
    characterName ? `当前发言角色语气参考：${characterName}${cue ? `（${cue}）` : ''}。` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: sys },
    { role: 'user', content: JSON.stringify({ items }) },
  ];
}

/**
 * Parses and aligns batch translation JSON response strictly to the requested message IDs.
 */
export function parseTranslationBatchResponse(
  rawContent: string,
  expectedItems: TranslationBatchItem[]
): ParsedTranslationResult {
  let candidate = String(rawContent ?? '').trim();
  const fenced = candidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced && fenced[1]) candidate = fenced[1].trim();

  const parsed = JSON.parse(candidate);
  const list = Array.isArray(parsed?.translations)
    ? parsed.translations
    : Array.isArray(parsed)
      ? parsed
      : null;
  if (!list) {
    throw new Error('Translation JSON missing translations array');
  }

  const expectedIds = new Set(expectedItems.map((x) => x.id));
  const translations: Record<string, string> = {};

  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const id = String(row.id || '').trim();
    const zh = String(row.zh ?? row.translation ?? row.text ?? '').trim();
    if (id && expectedIds.has(id) && zh) {
      translations[id] = zh;
    }
  }

  // Positional fallback ONLY when exact count matches and an item omitted id
  if (Object.keys(translations).length === 0 && list.length === expectedItems.length) {
    for (let i = 0; i < expectedItems.length; i++) {
      const row = list[i];
      const zh = typeof row === 'string' ? row.trim() : String(row?.zh ?? row?.translation ?? '').trim();
      if (zh) translations[expectedItems[i].id] = zh;
    }
  }

  const missingIds = expectedItems.map((x) => x.id).filter((id) => !translations[id]);
  return { translations, missingIds };
}
