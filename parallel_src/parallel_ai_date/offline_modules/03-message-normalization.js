  const LEGACY_ERROR_BUBBLE_RE=/^(?:（模型连接失败，历史已保存。请检查终端设置，再尝试角色回复。）|（模型连接失败，请检查终端设置后重试。）)$/;
  const PROXY_ERROR_SIGNATURE_RE=/(?:所有\s*API\s*密钥均请求失败|具体错误请查看轮询日志|所有(?:渠道|密钥|节点|令牌|账号)(?:均|都)?(?:请求|调用|连接)?失败[\s\S]{0,80}(?:轮询日志|配额|额度|重试|失败))/i;
  const PROXY_HEADER_ERROR_RE=/^\s*(?:\[\s*(?:API|Upstream|Proxy|Gateway|OpenAI|Gemini|Claude|Anthropic|DeepSeek|OneAPI|NewAPI)\s*(?:Error|Exception|Fault)\s*\]|【\s*(?:API|接口|反代|上游|网关|系统)(?:错误|报错|异常|请求失败)\s*】)\s*[:：\-]?/i;
  const PROXY_PREFIX_CODE_RE=/^\s*(?:Error|接口错误|调用失败|请求失败|上游错误|反代错误)\s*[:：]\s*(?:HTTP\s*[45]\d{2}|status\s*code\s*[45]\d{2}|All\s+API\s+keys|insufficient_quota|model_not_found|invalid_api_key|rate_limit_exceeded|upstream_error|bad_gateway|service_unavailable|quota_exceeded)/i;
  const detectProxyWrappedError=raw=>{
    const s=String(raw??'').trim();
    if(!s)return null;
    if(PROXY_ERROR_SIGNATURE_RE.test(s)){
      return {
        code:'PROXY_ALL_KEYS_FAILED',
        error_type:'proxy_wrapped_error',
        title:'反代服务所有 API 密钥均请求失败',
        summary:'上游反代返回了 HTTP 200，但正文中包装了报错文本（「所有API密钥均请求失败 / 具体错误请查看轮询日志」），已被统一错误网关拦截，未写入聊天记录。'
      };
    }
    if(PROXY_HEADER_ERROR_RE.test(s)||PROXY_PREFIX_CODE_RE.test(s)){
      return {
        code:'PROXY_WRAPPED_ERROR',
        error_type:'proxy_wrapped_error',
        title:'反代服务将报错信息包装为回复正文',
        summary:`上游接口返回 HTTP 200，但正文内容为服务商错误提示（${s.slice(0,90)}），已被统一错误网关拦截。`
      };
    }
    if(/^\s*\{\s*"error"\s*:\s*[\s\S]+\}\s*$/.test(s)){
      try{
        const parsed=JSON.parse(s);
        if(parsed&&parsed.error){
          const msg=typeof parsed.error==='string'?parsed.error:(parsed.error.message||parsed.error.code||JSON.stringify(parsed.error));
          return {
            code:'PROXY_JSON_ERROR',
            error_type:'proxy_wrapped_error',
            title:'反代服务在回复正文中返回了错误 JSON',
            summary:`上游接口在正文中返回了 error 结构（${String(msg).slice(0,90)}），已被统一错误网关拦截。`
          };
        }
      }catch{}
    }
    return null;
  };
  const isLegacyErrorArtifact=m=>{
    if(!m||m.sender!=='ai')return false;
    if(m.engine==='error'||m.isolated_error)return true;
    const txt=String(m.text??'').trim();
    if(!txt)return false;
    if(LEGACY_ERROR_BUBBLE_RE.test(txt))return true;
    if(detectProxyWrappedError(txt))return true;
    return false;
  };
  const PROTOCOL_LEADING_TAG_RE=/^(?:[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)[ \t]*)+/gm;
  const INLINE_TIMED_TAG_SEQ_RE=/(?:(?:\[|【)\s*(?:短信|见面)[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?\s*(?:\]|】)[ \t]*)+/g;
  const PROSE_CONTINUATION_AFTER_TAG_RE=/^(?:[”"』」）》】\]，,。！？!?；;、：:]|那条|这条|该条|一条|哪条|每条|那段|这段|那个|这个|那封|这封|的|里|中|上|后|前|内|外|记录|消息|内容|截图|气泡|通知|提醒|历史|存档|文本|字样|标记|标签)/;
  const PROSE_PREFIX_BEFORE_TAG_RE=/(?:打开|查看|翻看|找到|看到|收到|发来|引用|提到|显示|写着|带有|出现|删除|撤回|转发|复制|截图|翻到|停在|指着|关于|在|把|将|从|向|对|按|照|用|拿|看|读|查|找|发|回)[ \t]*$/;
  const hasUnclosedQuoteBefore=prefix=>{
    if(((prefix.match(/“/g)||[]).length)>((prefix.match(/”/g)||[]).length))return true;
    if(((prefix.match(/「/g)||[]).length)>((prefix.match(/」/g)||[]).length))return true;
    if(((prefix.match(/『/g)||[]).length)>((prefix.match(/』/g)||[]).length))return true;
    if(((prefix.match(/"/g)||[]).length)%2===1)return true;
    return false;
  };
  const splitInlineProtocolLine=line=>{
    const hasLeadingTag=/^[ \t]*(?:\[|【)\s*(?:短信|见面)(?:[\s:：·・\-]*(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[\sT]*)?\d{1,2}\s*[:：]\s*\d{2}(?:\s*[:：]\s*\d{2})?)?\s*(?:\]|】)/.test(line);
    const body=line.replace(PROTOCOL_LEADING_TAG_RE,'');
    if(!body)return '';
    return body.replace(INLINE_TIMED_TAG_SEQ_RE,(match,offset,fullStr)=>{
      const before=fullStr.slice(0,offset);
      const after=fullStr.slice(offset+match.length).trim();
      if(!before.trim()||!after)return match;
      if(hasUnclosedQuoteBefore(before))return match;
      if(PROSE_CONTINUATION_AFTER_TAG_RE.test(after))return match;
      const endedSentence=/[。！？!?；;…~～][ \t]*$/.test(before);
      const validInlineSplit=endedSentence||(hasLeadingTag&&/[ \t]$/.test(before)&&!PROSE_PREFIX_BEFORE_TAG_RE.test(before));
      return validInlineSplit?'|||':match;
    });
  };
  const stripProtocolTags=(raw,opts={})=>{
    const preserveParagraphs=Boolean(opts&&opts.preserveParagraphs);
    let text=String(raw??'').replace(/\r\n?/g,'\n');
    if(!text)return '';
    for(let i=0;i<6;i++){
      const prev=text;
      // Derived summaries can contain quoted user or AI prose: never guess at inline tags.
      text=text.replace(PROTOCOL_LEADING_TAG_RE,'');
      if(text===prev)break;
    }
    if(preserveParagraphs){
      return text.split('\n').map(line=>line.replace(/^[ \t]+|[ \t]+$/g,'')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
    }
    return text.replace(/[ \t]{2,}/g,' ').trim();
  };
  const cleanChatBubbleText=raw=>stripProtocolTags(raw,{preserveParagraphs:false});
  const cleanMeetingNovelText=raw=>{
    const s=String(raw??'').trim();
    if(!s)return '…';
    return stripProtocolTags(s,{preserveParagraphs:true})||'…';
  };
  // Only intercept model/policy-style refusals, never an in-character refusal or dialogue.
  // Keep the original response in diagnostic logs; do not persist it as a scene.
  const isModelRefusalText=raw=>{
    const s=String(raw??'').trim();
    if(!s||s.length>1500)return false;
    const prefix=s.slice(0,210);
    const refusal=/^(?:(?:很|非常)?抱歉[，,。\s]*|对不起[，,。\s]*|不好意思[，,。\s]*)?(?:我(?:无法|不能|没法|不可以|不会)|作为(?:一个)?(?:AI|人工智能|语言模型)|抱歉[，,。\s]*(?:我|无法))/i.test(prefix);
    const outOfStory=/(?:角色扮演|虚构情境|虚构创作|性爱描写|性行为描写|成人内容|色情内容|露骨内容|内容政策|安全准则|内容限制|作为(?:AI|人工智能|语言模型)|不能继续(?:进行|创作)|无法参与(?:浪漫|亲密))/i.test(s);
    return refusal&&outOfStory;
  };
  const isNarrationMarker=raw=>/^(?:旁白|【旁白】|\[旁白\]|（旁白）|\(旁白\)|\*旁白\*|narrator|narration)\s*[:：。.!！]?\s*$/i.test(String(raw??'').trim());
  const isBareChatDivider=raw=>/^[\s|｜]*[|｜]{2,}[\s|｜]*$/.test(String(raw??''));
  const pipeChatParts=line=>{
    if(isBareChatDivider(line))return [];
    const result=[];let start=0;
    for(const match of line.matchAll(/[|｜]{2,}/g)){
      const i=match.index,before=line.slice(0,i),after=line.slice(i+match[0].length);
      // Preserve literal separators inside quotes, code spans and escaped text.
      if(hasUnclosedQuoteBefore(before)||((before.match(/\x60/g)||[]).length%2)||/\\$/.test(before))continue;
      // A simple Boolean expression is not a chat separator.
      if(match[0]==='||'&&/^[\s(]*[a-z_$0-9][\w.$]*\s*$/.test(before)&&/^\s*[a-z_$0-9][\w.$]*[\s)]*$/.test(after))continue;
      result.push(line.slice(start,i));start=i+match[0].length;
    }
    result.push(line.slice(start));return result;
  };
  const explicitChatParts=raw=>String(raw??'').replace(/\r\n?/g,'\n').split('\n')
    .flatMap(line=>pipeChatParts(splitInlineProtocolLine(line))).map(s=>cleanChatBubbleText(s)).filter(s=>s&&!isBareChatDivider(s)&&!isNarrationMarker(s));
  const storedChatText=raw=>explicitChatParts(raw).join('\n');
  const isChatArtifact=m=>isLegacyErrorArtifact(m)||(m?.sender==='ai'&&m.mode!=='meeting'&&m.engine!=='recalled'&&!m.recalled&&(isBareChatDivider(cleanChatBubbleText(m.text))||isNarrationMarker(cleanChatBubbleText(m.text))));
  const sanitizeStoredData=target=>{
    if(!target||typeof target!=='object')return false;
    let changed=false;
    if(Array.isArray(target.messages)){
      for(const m of target.messages){
        if(!m||typeof m.text!=='string'||m.sender==='user'||m.engine==='recalled'||m.recalled)continue;
        if(isLegacyErrorArtifact(m)){
          if(m.engine!=='error'||!m.isolated_error){
            m.engine='error';
            m.isolated_error=true;
            changed=true;
          }
          continue;
        }
        const cleaned=m.mode==='meeting'?cleanMeetingNovelText(m.text):(storedChatText(m.text)||m.text);
        if(cleaned!==m.text){m.text=cleaned;changed=true;}
      }
    }
    if(Array.isArray(target.meetings)){
      for(const rec of target.meetings){
        if(!rec||typeof rec!=='object')continue;
        if(typeof rec.summary==='string'){
          const cs=stripProtocolTags(rec.summary,{preserveParagraphs:false});
          if(cs&&cs!==rec.summary){rec.summary=cs;changed=true;}
        }
        if(typeof rec.ai_summary==='string'&&rec.ai_summary){
          const cas=stripProtocolTags(rec.ai_summary,{preserveParagraphs:false});
          if(cas!==rec.ai_summary){rec.ai_summary=cas;changed=true;}
        }
        if(Array.isArray(rec.entries)){
          for(const e of rec.entries){
            if(e&&e.sender!=='user'&&typeof e.text==='string'){
              const ce=cleanMeetingNovelText(e.text);
              if(ce!==e.text){e.text=ce;changed=true;}
            }
          }
        }
      }
    }
    if(Array.isArray(target.episodicMemories)){
      for(const mem of target.episodicMemories){
        if(!mem||typeof mem!=='object')continue;
        if(typeof mem.summary==='string'&&(LEGACY_ERROR_BUBBLE_RE.test(mem.summary.trim())||PROXY_ERROR_SIGNATURE_RE.test(mem.summary))){
          if(!mem.isolated_error){mem.isolated_error=true;changed=true;}
        }
        if(typeof mem.summary==='string'&&mem.source_type!=='correction'&&mem.source_type!=='manual'){
          const cs=stripProtocolTags(mem.summary,{preserveParagraphs:false});
          if(cs&&cs!==mem.summary){mem.summary=cs;changed=true;}
        }
        if(mem.meeting_data&&typeof mem.meeting_data==='object'){
          const md=mem.meeting_data;
          if(typeof md.summary==='string'){
            const mds=stripProtocolTags(md.summary,{preserveParagraphs:false});
            if(mds&&mds!==md.summary){md.summary=mds;changed=true;}
          }
          if(Array.isArray(md.entries)){
            for(const e of md.entries){
              if(e&&e.sender!=='user'&&typeof e.text==='string'){
                const ce=cleanMeetingNovelText(e.text);
                if(ce!==e.text){e.text=ce;changed=true;}
              }
            }
          }
        }
        if(Array.isArray(mem.day_messages)){
          for(const dm of mem.day_messages){
            if(dm&&dm.sender!=='user'&&typeof dm.text==='string'){
              const cdm=cleanChatBubbleText(dm.text)||'…';
              if(cdm!==dm.text){dm.text=cdm;changed=true;}
            }
          }
        }
      }
    }
    if(Array.isArray(target.events)){
      for(const ev of target.events){
        if(ev&&ev.type!=='user_message'&&typeof ev.summary==='string'){
          const ce=stripProtocolTags(ev.summary,{preserveParagraphs:false});
          if(ce&&ce!==ev.summary){ev.summary=ce;changed=true;}
        }
      }
    }
    if(target.surveillance&&typeof target.surveillance==='object'){
      for(const store of Object.values(target.surveillance)){
        const byDate=store?.byDate;
        if(!byDate||typeof byDate!=='object')continue;
        for(const dayRec of Object.values(byDate)){
          if(!Array.isArray(dayRec?.slots))continue;
          for(const slot of dayRec.slots){
            if(slot&&typeof slot.scene==='string'){
              const cs=stripProtocolTags(slot.scene,{preserveParagraphs:false});
              if(cs&&cs!==slot.scene){slot.scene=cs;changed=true;}
            }
          }
        }
      }
    }
    return changed;
  };
