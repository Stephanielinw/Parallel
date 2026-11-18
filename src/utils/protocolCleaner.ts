/**
 * Unified message protocol sanitizer, bubble/novel parser, history serializer,
 * and idempotent storage migration for Parallel (ROUND-01).
 */

// Matches 1 or more protocol tags at the start of the text or start of any line
const PROTOCOL_LEADING_TAG_RE =
  /^(?:[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)[ \t]*)+/gm;

// Matches inline timestamped protocol tags for candidate bubble boundary inspection
const INLINE_TIMED_TAG_SEQ_RE =
  /(?:(?:\[|【)\s*(?:短信|见面)[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?\s*(?:\]|】)[ \t]*)+/g;

// Reference / noun / closing-quote continuations that indicate an inline `[短信 HH:MM]` is part of normal prose rather than a bubble separator
const PROSE_CONTINUATION_AFTER_TAG_RE =
  /^(?:[”"』」）》】\]，,。！？!?；;、：:]|那条|这条|该条|一条|哪条|每条|那段|这段|那个|这个|那封|这封|的|里|中|上|后|前|内|外|记录|消息|内容|截图|气泡|通知|提醒|历史|存档|文本|字样|标记|标签)/;

// Transitive verbs / prepositions before an inline tag that indicate the tag is a grammatical object in the sentence
const PROSE_PREFIX_BEFORE_TAG_RE =
  /(?:打开|查看|翻看|找到|看到|收到|发来|引用|提到|显示|写着|带有|出现|删除|撤回|转发|复制|截图|翻到|停在|指着|关于|在|把|将|从|向|对|按|照|用|拿|看|读|查|找|发|回)[ \t]*$/;

function hasUnclosedQuoteBefore(prefix: string): boolean {
  const openDouble = (prefix.match(/“/g) || []).length;
  const closeDouble = (prefix.match(/”/g) || []).length;
  if (openDouble > closeDouble) return true;
  const openCorner = (prefix.match(/「/g) || []).length;
  const closeCorner = (prefix.match(/」/g) || []).length;
  if (openCorner > closeCorner) return true;
  const openWhiteCorner = (prefix.match(/『/g) || []).length;
  const closeWhiteCorner = (prefix.match(/』/g) || []).length;
  if (openWhiteCorner > closeWhiteCorner) return true;
  const straightQuotes = (prefix.match(/"/g) || []).length;
  if (straightQuotes % 2 === 1) return true;
  return false;
}

function splitInlineProtocolLine(line: string): string {
  const hasLeadingTag =
    /^[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)/.test(
      line
    );
  const body = line.replace(PROTOCOL_LEADING_TAG_RE, '');
  if (!body) return '';
  return body.replace(
    INLINE_TIMED_TAG_SEQ_RE,
    (match: string, offset: number, fullStr: string) => {
      const before = fullStr.slice(0, offset);
      const after = fullStr.slice(offset + match.length).trim();
      if (!before.trim() || !after) return match;
      if (hasUnclosedQuoteBefore(before)) return match;
      if (PROSE_CONTINUATION_AFTER_TAG_RE.test(after)) return match;
      const endedSentence = /[。！？!?；;…~～][ \t]*$/.test(before);
      const validInlineSplit =
        endedSentence ||
        (hasLeadingTag &&
          /[ \t]$/.test(before) &&
          !PROSE_PREFIX_BEFORE_TAG_RE.test(before));
      return validInlineSplit ? '|||' : match;
    }
  );
}

export interface StripProtocolOptions {
  preserveParagraphs?: boolean;
}

/**
 * Strips internal `[短信 ...]`, `[见面 ...]`, `[短信]`, `[见面]` protocol headers
 * while preserving normal user/character text, quoted references, mid-sentence mentions, and paragraphs.
 */
export function stripProtocolTags(
  raw: string,
  options: StripProtocolOptions = {}
): string {
  const preserveParagraphs = Boolean(options.preserveParagraphs);
  let text = String(raw ?? '').replace(/\r\n?/g, '\n');
  if (!text) return '';

  for (let i = 0; i < 6; i++) {
    const prev = text;
    // Never infer protocol boundaries from prose or mixed-source summaries.
    text = text.replace(PROTOCOL_LEADING_TAG_RE, '');
    if (text === prev) break;
  }

  if (preserveParagraphs) {
    return text
      .split('\n')
      .map((line) => line.replace(/^[ \t]+|[ \t]+$/g, ''))
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  return text.replace(/[ \t]{2,}/g, ' ').trim();
}

/**
 * Cleans a single SMS / chat bubble text.
 */
export function cleanChatBubbleText(raw: string): string {
  return stripProtocolTags(raw, { preserveParagraphs: false });
}

/**
 * Cleans face-to-face (`meeting`) novel text while strictly preserving paragraph structure.
 * Never splits paragraphs into chat bubbles.
 */
export function cleanMeetingNovelText(raw: string): string {
  const rawStr = String(raw ?? '').trim();
  if (!rawStr) return '…';
  const cleaned = stripProtocolTags(rawStr, { preserveParagraphs: true });
  return cleaned || '…';
}

/**
 * Splits raw model chat output into 1–4 clean SMS bubbles.
 */
  const isBareChatDivider=(raw: string)=>/^[\s|｜]*[|｜]{2,}[\s|｜]*$/.test(String(raw??''));
  const pipeChatParts=(line: string)=>{
    if(isBareChatDivider(line))return [];
    const result: string[]=[];let start=0;
    for(const match of line.matchAll(/[|｜]{2,}/g)){
      const i=match.index!,before=line.slice(0,i),after=line.slice(i+match[0].length);
      // Preserve literal separators inside quotes, code spans and escaped text.
      if(hasUnclosedQuoteBefore(before)||((before.match(/\x60/g)||[]).length%2)||/\\$/.test(before))continue;
      // A simple Boolean expression is not a chat separator.
      if(match[0]==='||'&&/^[\s(]*[a-z_$0-9][\w.$]*\s*$/.test(before)&&/^\s*[a-z_$0-9][\w.$]*[\s)]*$/.test(after))continue;
      result.push(line.slice(start,i));start=i+match[0].length;
    }
    result.push(line.slice(start));return result;
  };
  const explicitChatParts=(raw: string)=>String(raw??'').replace(/\r\n?/g,'\n').split('\n')
    .flatMap(line=>pipeChatParts(splitInlineProtocolLine(line))).map(s=>cleanChatBubbleText(s)).filter(s=>s&&!isBareChatDivider(s));
  const storedChatText=(raw: string)=>explicitChatParts(raw).join('\n');

export function splitChatBubbles(raw: string): string[] {
  const rawStr = String(raw ?? '').trim();
  if (!rawStr) return ['…'];

  let parts = explicitChatParts(rawStr);
  if (!parts.length && isBareChatDivider(rawStr.replace(PROTOCOL_LEADING_TAG_RE,''))) return [];

  if (parts.length === 1 && parts[0].length >= 32) {
    const sentences =
      parts[0]
        .match(/[^。！？!?]+[。！？!?]+|[^。！？!?]+$/g)
        ?.map((s) => cleanChatBubbleText(s))
        .filter(Boolean) || [parts[0]];
    if (sentences.length >= 2) {
      parts = [];
      let buf = '';
      for (const s of sentences) {
        if (!buf) buf = s;
        else if ((buf + s).length <= 26 && parts.length > 0) buf += s;
        else {
          parts.push(buf);
          buf = s;
        }
      }
      if (buf) parts.push(buf);
    }
  }

  if (parts.length > 4) {
    parts = [...parts.slice(0, 3), parts.slice(3).join(' ')];
  }

  return parts.length ? parts : ['…'];
}

export interface HistoryMessageRow {
  id: string;
  sender: 'user' | 'ai' | string;
  mode: 'chat' | 'meeting' | string;
  text: string;
  created_at?: string;
  engine?: string;
  recalled?: boolean;
}

/**
 * Serializes working history for LLM prompts:
 * - Separates time & mode context into a dedicated system metadata timeline
 * - Keeps user/assistant message contents 100% free of `[短信 HH:MM]` / `[见面 HH:MM]` prefixes
 * - Strips any legacy protocol pollution from AI historical message texts so pollution never accumulates
 */
export function serializeWorkingHistory(
  workingHistory: HistoryMessageRow[],
  fmtHHMMOrProfileName?: ((ts?: string) => string) | string,
  characterName = '角色',
  maybeFmtHHMM?: (ts?: string) => string
): {
  timelineMeta: string;
  systemTimelineNote: string;
  turns: Array<{ role: 'user' | 'assistant'; content: string }>;
  chatMessages: Array<{ role: 'user' | 'assistant'; content: string }>;
} {
  const fmtHHMM: (ts?: string) => string =
    typeof fmtHHMMOrProfileName === 'function'
      ? fmtHHMMOrProfileName
      : typeof maybeFmtHHMM === 'function'
        ? maybeFmtHHMM
        : (ts?: string) => (ts ? String(ts).slice(11, 16) : '--:--');
  const profileName =
    typeof fmtHHMMOrProfileName === 'string' ? fmtHHMMOrProfileName : '用户';

  const timelineLines: string[] = [];
  const turns: Array<{ role: 'user' | 'assistant'; content: string }> = [];

  workingHistory.forEach((m, idx) => {
    const role = m.sender === 'ai' ? 'assistant' : 'user';
    if (m.engine === 'recalled' || m.recalled) {
      turns.push({
        role,
        content:
          '[系统提示：对方刚刚撤回了一条消息（你看见对方撤回了消息，但不知道具体撤回了什么内容）]',
      });
      return;
    }

    const tTag = fmtHHMM(m.created_at) || '--:--';
    const modeLabel = m.mode === 'meeting' ? '面对面见面' : '手机聊天';
    const speaker = m.sender === 'ai' ? characterName : profileName;
    timelineLines.push(`#${idx + 1} [${tTag} · ${modeLabel} · ${speaker}]`);

    const cleanBody =
      m.sender === 'user'
        ? String(m.text ?? '')
        : m.mode === 'meeting'
          ? cleanMeetingNovelText(m.text)
          : storedChatText(m.text) || m.text;

    turns.push({
      role,
      content: cleanBody,
    });
  });

  const timelineMeta = timelineLines.length
    ? `【近期活跃对话时间与模式索引（系统元数据，仅供把握时间跨度与场景，严禁在回复正文中输出时间或模式前缀）】\n${timelineLines.join(' ｜ ')}`
    : '';

  return {
    timelineMeta,
    systemTimelineNote: timelineMeta,
    turns,
    chatMessages: turns,
  };
}

export interface SanitizeStats {
  changed: boolean;
  cleanedMessages: number;
  cleanedMemories: number;
  cleanedMeetings: number;
  cleanedEvents: number;
}

/**
 * Idempotently cleans protocol pollution across an existing database snapshot (`db`)
 * without deleting any records or altering IDs, timestamps, senders, ownership, or memory links.
 */
export function sanitizeStoredDatabase(db: Record<string, any>): SanitizeStats {
  const stats: SanitizeStats = {
    changed: false,
    cleanedMessages: 0,
    cleanedMemories: 0,
    cleanedMeetings: 0,
    cleanedEvents: 0,
  };
  if (!db || typeof db !== 'object') return stats;

  if (Array.isArray(db.messages)) {
    for (const m of db.messages) {
      if (!m || typeof m.text !== 'string') continue;
      if (m.sender === 'user' || m.engine === 'recalled' || m.recalled) continue;
      const cleaned =
        m.mode === 'meeting'
          ? cleanMeetingNovelText(m.text)
          : cleanChatBubbleText(m.text) || '…';
      if (cleaned !== m.text) {
        m.text = cleaned;
        stats.cleanedMessages++;
        stats.changed = true;
      }
    }
  }

  if (Array.isArray(db.meetings)) {
    for (const rec of db.meetings) {
      if (!rec || typeof rec !== 'object') continue;
      let recChanged = false;
      if (typeof rec.summary === 'string') {
        const cs = stripProtocolTags(rec.summary, { preserveParagraphs: false });
        if (cs && cs !== rec.summary) {
          rec.summary = cs;
          recChanged = true;
        }
      }
      if (typeof rec.ai_summary === 'string' && rec.ai_summary) {
        const cas = stripProtocolTags(rec.ai_summary, {
          preserveParagraphs: false,
        });
        if (cas !== rec.ai_summary) {
          rec.ai_summary = cas;
          recChanged = true;
        }
      }
      if (Array.isArray(rec.entries)) {
        for (const e of rec.entries) {
          if (e && e.sender !== 'user' && typeof e.text === 'string') {
            const ce = cleanMeetingNovelText(e.text);
            if (ce !== e.text) {
              e.text = ce;
              recChanged = true;
            }
          }
        }
      }
      if (recChanged) {
        stats.cleanedMeetings++;
        stats.changed = true;
      }
    }
  }

  if (Array.isArray(db.episodicMemories)) {
    for (const mem of db.episodicMemories) {
      if (!mem || typeof mem !== 'object') continue;
      let memChanged = false;
      if (
        typeof mem.summary === 'string' &&
        mem.source_type !== 'correction' &&
        mem.source_type !== 'manual'
      ) {
        const cs = stripProtocolTags(mem.summary, { preserveParagraphs: false });
        if (cs && cs !== mem.summary) {
          mem.summary = cs;
          memChanged = true;
        }
      }
      if (mem.meeting_data && typeof mem.meeting_data === 'object') {
        const md = mem.meeting_data;
        if (typeof md.summary === 'string') {
          const mds = stripProtocolTags(md.summary, {
            preserveParagraphs: false,
          });
          if (mds && mds !== md.summary) {
            md.summary = mds;
            memChanged = true;
          }
        }
        if (Array.isArray(md.entries)) {
          for (const e of md.entries) {
            if (e && e.sender !== 'user' && typeof e.text === 'string') {
              const ce = cleanMeetingNovelText(e.text);
              if (ce !== e.text) {
                e.text = ce;
                memChanged = true;
              }
            }
          }
        }
      }
      if (Array.isArray(mem.day_messages)) {
        for (const dm of mem.day_messages) {
          if (dm && dm.sender !== 'user' && typeof dm.text === 'string') {
            const cdm = cleanChatBubbleText(dm.text) || '…';
            if (cdm !== dm.text) {
              dm.text = cdm;
              memChanged = true;
            }
          }
        }
      }
      if (memChanged) {
        stats.cleanedMemories++;
        stats.changed = true;
      }
    }
  }

  if (Array.isArray(db.events)) {
    for (const ev of db.events) {
      if (ev && ev.type !== 'user_message' && typeof ev.summary === 'string') {
        const ce = stripProtocolTags(ev.summary, { preserveParagraphs: false });
        if (ce && ce !== ev.summary) {
          ev.summary = ce;
          stats.cleanedEvents++;
          stats.changed = true;
        }
      }
    }
  }

  if (Array.isArray(db.surveillance)) {
    for (const dayRec of db.surveillance) {
      if (!Array.isArray(dayRec?.slots)) continue;
      for (const slot of dayRec.slots) {
        if (slot && typeof slot.scene === 'string') {
          const cs = stripProtocolTags(slot.scene, { preserveParagraphs: false });
          if (cs && cs !== slot.scene) {
            slot.scene = cs;
            stats.changed = true;
          }
        }
      }
    }
  } else if (db.surveillance && typeof db.surveillance === 'object') {
    for (const store of Object.values(db.surveillance) as any[]) {
      const byDate = store?.byDate;
      if (!byDate || typeof byDate !== 'object') continue;
      for (const dayRec of Object.values(byDate) as any[]) {
        if (!Array.isArray(dayRec?.slots)) continue;
        for (const slot of dayRec.slots) {
          if (slot && typeof slot.scene === 'string') {
            const cs = stripProtocolTags(slot.scene, {
              preserveParagraphs: false,
            });
            if (cs && cs !== slot.scene) {
              slot.scene = cs;
              stats.changed = true;
            }
          }
        }
      }
    }
  }

  return stats;
}
