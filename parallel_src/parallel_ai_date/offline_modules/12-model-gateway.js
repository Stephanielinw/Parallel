  function getApiUrl(suffix,connection=db.connection){const b=connection.base_url.trim().replace(/\/+$/,'');if(!/^https?:\/\//.test(b))bodyErr('API Base URL 需要以 http:// 或 https:// 开头');if(/^http:\/\//.test(b)&&!/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(?:\/|$)/.test(b))bodyErr('远程 API 必须使用 HTTPS');return b+suffix}
  const maskApiKey=k=>{
    const s=String(k||'').trim();
    if(!s)return '';
    if(s.length<=8)return '***REDACTED***';
    return s.slice(0,4)+'***REDACTED***'+s.slice(-3);
  };
  const recordSystemLog=entry=>{
    try{
      if(logSettled&&!logState.enabled)return entry;
      const safe=safeLog(entry);
      if(!logSettled)logPending=boundedLogs([safe,...logPending]);
      else{logState.logs=boundedLogs([safe,...logState.logs]);void persistLogState();}
    }catch{}
    return entry;
  };
  const createApiError=({error_code='API_ERROR',http_status=0,title='模型接口请求失败',message='API 请求失败',detail='',retry_after=0,suggest_terminal=false,may_consume_tokens=false,character_id='',character_name='',profile_id='',task_type='chat',task_label='',task_id='',retry_of_task_id='',attempt=1,log_id='',background=false})=>({
    error_code,
    error_type:error_code,
    http_status:Number(http_status)||0,
    title,
    message,
    detail:String(detail||'').slice(0,600),
    retry_after:Number(retry_after)||0,
    suggest_terminal:Boolean(suggest_terminal),
    may_consume_tokens:Boolean(may_consume_tokens),
    character_id:character_id||'',
    character_name:character_name||'',
    profile_id:profile_id||'',
    task_type:task_type||'chat',
    task_label:task_label||TASK_LABELS[task_type]||'模型生成任务',
    task_id:task_id||'',
    retry_of_task_id:retry_of_task_id||'',
    attempt:Number(attempt)||1,
    log_id:log_id||'',
    background:Boolean(background),
    user_message_saved:true,
    created_at:stamp()
  });
  const throwApiError=(info,logBase,startedMs,extraLog={})=>{
    const apiErr=createApiError({
      ...info,
      character_id:logBase.character_id,
      character_name:logBase.character_name,
      profile_id:logBase.profile_id,
      task_type:info.task_type||logBase.mode||logBase.entry_point,
      task_label:TASK_LABELS[logBase.entry_point]||TASK_LABELS[logBase.mode]||'模型生成任务',
      task_id:logBase.task_id||'',
      retry_of_task_id:logBase.retry_of_task_id||'',
      attempt:logBase.attempt||1,
      log_id:logBase.id
    });
    recordSystemLog({
      ...logBase,
      status:'error',
      http_status:apiErr.http_status,
      error_code:apiErr.error_code,
      error_type:apiErr.error_code,
      duration_ms:Date.now()-startedMs,
      error:`[${apiErr.error_code}${apiErr.http_status?` HTTP ${apiErr.http_status}`:''}] ${apiErr.title}：${apiErr.message}${apiErr.detail?` (${apiErr.detail})`:''}`,
      raw_response:extraLog.raw_response??null,
      raw_content:extraLog.raw_content??'',
      reasoning_content:extraLog.reasoning_content??'',
      parsed_content:'',
      char_count_raw:typeof extraLog.raw_content==='string'?extraLog.raw_content.length:0,
      char_count_parsed:0,
      finish_reason:extraLog.finish_reason||apiErr.error_code.toLowerCase(),
      usage:extraLog.usage||null,
      truncation_warning:extraLog.truncation_warning||''
    });
    const err=new Error(`${apiErr.title}：${apiErr.message}`);
    err.status=400;
    err.apiError=apiErr;
    throw err;
  };
  const extractRetryAfter=(res,errBodyStr='',errJson=null)=>{
    try{
      const hdr=res?.headers?.get?.('retry-after')||res?.headers?.get?.('Retry-After')||res?.headers?.['retry-after']||res?.headers?.['Retry-After'];
      if(hdr){
        const n=Number(hdr);
        if(Number.isFinite(n)&&n>0)return Math.ceil(n);
      }
    }catch{}
    const bodyVal=errJson?.error?.retry_after??errJson?.retry_after??null;
    if(bodyVal!==null&&Number.isFinite(Number(bodyVal))&&Number(bodyVal)>0)return Math.ceil(Number(bodyVal));
    const m=String(errBodyStr||'').match(/retry[\s_-]*after[:\s]+(\d+)/i)||String(errBodyStr||'').match(/请在\s*(\d+)\s*秒后重试/);
    if(m&&Number(m[1])>0)return Number(m[1]);
    return 0;
  };
  const classifyHttpStatusError=(status,errBodyStr='',res=null)=>{
    let errJson=null;
    try{errJson=errBodyStr?JSON.parse(errBodyStr):null;}catch{}
    const upstreamMsg=String(errJson?.error?.message||errJson?.message||errBodyStr||'').trim().slice(0,360);
    const proxyCheck=detectProxyWrappedError(upstreamMsg||errBodyStr);
    const retryAfter=extractRetryAfter(res,errBodyStr,errJson);
    // OpenAI-style proxies sometimes wrap an upstream Google 401 as HTTP 500.
    // This requires fixing the provider's authentication route, not retrying.
    if(/API keys? are not supported by this API/i.test(errBodyStr)&&
       /(?:OAuth2? access token|UNAUTHENTICATED|401)/i.test(errBodyStr)){
      return {
        error_code:'UPSTREAM_OAUTH_REQUIRED',
        http_status:Number(status)||0,
        title:'上游模型认证方式不匹配（真实原因：401）',
        message:'当前模型渠道用 API Key 调用了要求 OAuth 2.0 身份凭证的 Google 接口。请检查终端所选模型和服务商的渠道配置；修正前不要反复重试。',
        detail:upstreamMsg,
        retry_after:0,
        suggest_terminal:true,
        may_consume_tokens:false
      };
    }
    if(proxyCheck&&proxyCheck.code==='PROXY_ALL_KEYS_FAILED'){
      return {
        error_code:'PROXY_ALL_KEYS_FAILED',
        http_status:status,
        title:`反向代理密钥池全部失败 (HTTP ${status})`,
        message:'反代服务提示“所有API密钥均请求失败，具体错误请查看轮询日志”。上游渠道或密钥池当前不可用。',
        detail:upstreamMsg,
        retry_after:retryAfter,
        suggest_terminal:true,
        may_consume_tokens:false
      };
    }
    switch(Number(status)){
      case 400:
        return {error_code:'HTTP_400',http_status:400,title:'请求参数异常 (HTTP 400)',message:'模型接口拒绝了本次请求参数（可能是模型不支持某个参数或上下文长度超限）。',detail:upstreamMsg,retry_after:0,suggest_terminal:true};
      case 401:
        return {error_code:'HTTP_401',http_status:401,title:'API 认证失败 (HTTP 401)',message:'API Key 无效、已过期或未正确填写，请前往「终端」检查 API 密钥配置。',detail:upstreamMsg,retry_after:0,suggest_terminal:true};
      case 403:
        return {error_code:'HTTP_403',http_status:403,title:'访问权限不足 (HTTP 403)',message:'当前 API Key 没有权限访问该模型或接口，或账户余额/权限受限。',detail:upstreamMsg,retry_after:0,suggest_terminal:true};
      case 404:
        return {error_code:'HTTP_404',http_status:404,title:'模型或接口地址不存在 (HTTP 404)',message:'未找到对应的 API 路径或模型名称（请检查 Base URL 是否包含 /v1 以及模型 ID 是否拼写正确）。',detail:upstreamMsg,retry_after:0,suggest_terminal:true};
      case 408:
        return {error_code:'HTTP_408',http_status:408,title:'请求超时 (HTTP 408)',message:'上游模型服务响应超时。注意：服务商可能已开始处理本次请求，重试可能产生额外 Token 消耗。',detail:upstreamMsg,retry_after:retryAfter,suggest_terminal:false,may_consume_tokens:true};
      case 429:
        return {error_code:'HTTP_429',http_status:429,title:'请求频率或额度受限 (HTTP 429)',message:retryAfter?`触发频率或配额限制，建议等待约 ${retryAfter} 秒后再手动重试。`:'触发 API 速率限制（Rate Limit）或账户配额耗尽，请稍候再试或检查额度。',detail:upstreamMsg,retry_after:retryAfter,suggest_terminal:false};
      case 500:
        return {error_code:'HTTP_500',http_status:500,title:'模型服务器内部错误 (HTTP 500)',message:'上游模型服务发生内部故障，请稍后手动重试。',detail:upstreamMsg,retry_after:retryAfter,suggest_terminal:false};
      case 502:
        return {error_code:'HTTP_502',http_status:502,title:'网关错误 (HTTP 502)',message:'API 网关或反代无法从上游模型收到有效响应（Bad Gateway）。',detail:upstreamMsg,retry_after:retryAfter,suggest_terminal:false};
      case 503:
        return {error_code:'HTTP_503',http_status:503,title:'模型服务暂不可用 (HTTP 503)',message:'上游模型节点正在维护或暂时不可用（Service Unavailable）。',detail:upstreamMsg,retry_after:retryAfter,suggest_terminal:false};
      case 504:
        return {error_code:'HTTP_504',http_status:504,title:'网关超时 (HTTP 504)',message:'反代或网关等待上游模型生成超时（Gateway Timeout）。注意：上游可能已处理请求，重试可能产生额外 Token 消耗。',detail:upstreamMsg,retry_after:retryAfter,suggest_terminal:false,may_consume_tokens:true};
      case 529:
        return {error_code:'HTTP_529',http_status:529,title:'模型服务商过载 (HTTP 529)',message:'上游模型集群当前负载过高（Site is overloaded），请稍等片刻后重试。',detail:upstreamMsg,retry_after:retryAfter||15,suggest_terminal:false};
      default:
        return {error_code:`HTTP_${status||0}`,http_status:Number(status)||0,title:`模型接口返回异常状态 (HTTP ${status})`,message:`服务器返回了非 2xx 状态码（HTTP ${status}）。`,detail:upstreamMsg,retry_after:retryAfter,suggest_terminal:status>=400&&status<500};
    }
  };
  const readResTextAndJson=async res=>{
    let rawText='',data=null,parseErr=null;
    if(typeof res.text==='function'){
      try{
        rawText=await res.text();
        if(rawText&&rawText.trim()){
          try{data=JSON.parse(rawText);}catch(pe){parseErr=pe;}
        }
      }catch(te){parseErr=te;}
    }else if(typeof res.json==='function'){
      try{
        data=await res.json();
        rawText=JSON.stringify(data);
      }catch(je){parseErr=je;}
    }
    return {rawText,data,parseErr};
  };
  async function llm(messages,options={}){
    const pid=options.profile?.id,cid=options.character?.id;
    if(!pid||!cid)return llmUnfrozen(messages,options);
    if(characterFrozen(pid,cid))bodyErr('角色休眠中，请先解除冻结');
    const epoch=freezeEpoch(pid,cid),key=pairKey(pid,cid);
    const ctrl=typeof AbortController==='function'?new AbortController():null;
    const group=pairModelControllers.get(key)||new Set(),external=options.signal;
    const forward=()=>ctrl?.abort();
    if(ctrl){group.add(ctrl);pairModelControllers.set(key,group);if(external?.aborted)forward();else external?.addEventListener('abort',forward,{once:true});}
    try{
      const out=await llmUnfrozen(messages,{...options,signal:ctrl?.signal||external});
      if(characterFrozen(pid,cid)||epoch!==freezeEpoch(pid,cid))bodyErr('角色状态已变化，忽略旧请求');
      return out;
    }finally{
      external?.removeEventListener('abort',forward);
      if(ctrl)group.delete(ctrl);
      if(!group.size&&pairModelControllers.get(key)===group)pairModelControllers.delete(key);
    }
  }
  async function llmUnfrozen(messages,options={}){
    const s=options.connection||db.connection;
    const mode=options.mode||(options.json_mode?'json':'chat');
    const pObj=options.profile||null;
    const cObj=options.character||null;
    const entryPoint=options.entry_point||mode;
    const baselineTokens=resolveTaskMaxTokens(db.connection,mode,entryPoint,options.max_tokens);
    const reqMaxTokens=options.min_output_tokens&&mode==='meeting_summary'?Math.min(4096,Math.max(baselineTokens,options.min_output_tokens)):baselineTokens;
    const payload={model:s.model,messages:await resolveChatPhotoInput(messages),temperature:options.temperature??s.temperature,top_p:s.top_p,max_tokens:reqMaxTokens};
    if(options.json_mode&&options.omit_response_format!==true)payload.response_format={type:'json_object'};
    const presetMode=(mode==='meeting'||mode==='chat')?mode:null;
    const modePresets=presetMode?(db.presets||[]).filter(x=>x.mode===presetMode).sort((a,b)=>a.sort_order-b.sort_order):[];
    const enabledPresets=modePresets.filter(x=>x.enabled);
    const disabledPresets=modePresets.filter(x=>!x.enabled);
    const activePresetsSummary=enabledPresets.map((x,idx)=>({
      order:idx+1,
      id:x.id,
      source_id:x.source_id||'',
      name:x.name,
      group:inferPresetGroup(x),
      role:x.role,
      sort_order:x.sort_order,
      chars:String(x.content||'').length,
      char_count:String(x.content||'').length
    }));
    const startedMs=Date.now();
    let endpoint='';
    try{
      if(!s.base_url||!s.api_key||!s.model)bodyErr('还没有配置可用的 API 地址、密钥及模型');
      endpoint=getApiUrl('/chat/completions',s);
    }catch(cfgErr){
      const logBaseCfg={
        id:'log_'+uid(),
        created_at:stamp(),
        task_id:options.task_id||'',
        retry_of_task_id:options.retry_of_task_id||'',
        attempt:options.attempt||1,
        background:Boolean(options.background),
        profile_id:pObj?.id||'',
        profile_name:pObj?.name||'',
        character_id:cObj?.id||'',
        character_name:cObj?.name||'',
        mode,
        entry_point:entryPoint,
        model:s.model||'',
        endpoint:s.base_url||''
      };
      throwApiError({
        error_code:'CONFIG_MISSING',
        http_status:0,
        title:'API 配置不完整',
        message:String(cfgErr?.message||cfgErr||'请先在「终端」填写有效的 API 地址、密钥及模型'),
        suggest_terminal:true,
        background:Boolean(options.background)
      },logBaseCfg,startedMs);
    }
    const logBase={
      id:'log_'+uid(),
      created_at:stamp(),
      task_id:options.task_id||'',
      retry_of_task_id:options.retry_of_task_id||'',
      attempt:options.attempt||1,
      background:Boolean(options.background),
      profile_id:pObj?.id||'',
      profile_name:pObj?.name||'',
      character_id:cObj?.id||'',
      character_name:cObj?.name||'',
      mode,
      entry_point:entryPoint,
      model:s.model,
      endpoint,
      headers_masked:{
        'Content-Type':'application/json',
        'Authorization':'Bearer '+maskApiKey(s.api_key)
      },
      sampling:{
        temperature:payload.temperature,
        top_p:payload.top_p,
        max_tokens:reqMaxTokens
      },
      active_preset_count:enabledPresets.length,
      disabled_preset_count:disabledPresets.length,
      active_presets:activePresetsSummary,
      disabled_presets:disabledPresets.map(x=>({id:x.id,name:x.name,group:inferPresetGroup(x),role:x.role})),
      simulated_reply_at:options.simulatedAt?new Date(options.simulatedAt).toISOString():'',
      request_payload:JSON.parse(JSON.stringify(maskPhotoInput(payload)))
    };
    let res;
    try{
      const fetchOpts={method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+s.api_key},body:JSON.stringify(payload)};
      if(options.signal)fetchOpts.signal=options.signal;
      res=await fetch(endpoint,fetchOpts);
    }catch(e){
      const rawErr=String(e?.message||e||'Failed to fetch');
      const isTimeout=/timeout|timed\s*out|超时|etimedout/i.test(rawErr);
      const isAbort=(e?.name==='AbortError'||/abort|cancelled|canceled/i.test(rawErr))&&!isTimeout;
      throwApiError({
        error_code:isAbort?'REQUEST_ABORTED':(isTimeout?'REQUEST_TIMEOUT':'NETWORK_ERROR'),
        http_status:0,
        title:isAbort?'请求已中止':(isTimeout?'网络连接或响应超时':'网络连接失败 / 无法连接模型接口'),
        message:isAbort
          ?'当前请求已被手动暂停或由于场景切换而中止。'
          :(isTimeout
            ?'等待模型服务响应超时。注意：上游服务商可能已收到请求，重试可能产生额外 Token 消耗。'
            :'浏览器无法连接至模型接口（可能是网络断开、域名不可达或 API 不允许跨域 CORS）。'),
        detail:rawErr,
        suggest_terminal:!isAbort&&!isTimeout,
        may_consume_tokens:!isAbort,
        background:Boolean(options.background)
      },logBase,startedMs,{finish_reason:isAbort?'aborted':(isTimeout?'timeout':'network_error')});
    }
    if(!res||typeof res.ok!=='boolean'){
      throwApiError({
        error_code:'EMPTY_RESPONSE',
        http_status:0,
        title:'接口返回了无效响应对象',
        message:'未收到有效的 HTTP 响应。',
        background:Boolean(options.background)
      },logBase,startedMs,{finish_reason:'invalid_response'});
    }
    if(!res.ok){
      const {rawText}=await readResTextAndJson(res);
      const classified=classifyHttpStatusError(res.status,rawText,res);
      throwApiError({
        ...classified,
        background:Boolean(options.background)
      },logBase,startedMs,{
        raw_response:rawText?rawText.slice(0,2000):null,
        finish_reason:'http_'+res.status
      });
    }
    const {rawText,data,parseErr}=await readResTextAndJson(res);
    if(parseErr||!data||typeof data!=='object'){
      if(!rawText||!String(rawText).trim()){
        throwApiError({
          error_code:'EMPTY_RESPONSE',
          http_status:res.status||200,
          title:'模型接口返回空响应',
          message:'HTTP 状态码为 200，但响应体为空。',
          background:Boolean(options.background)
        },logBase,startedMs,{raw_response:rawText||null,finish_reason:'empty_body'});
      }
      const proxyWrap=detectProxyWrappedError(rawText);
      if(proxyWrap){
        throwApiError({
          error_code:proxyWrap.code,
          http_status:res.status||200,
          title:'反向代理返回了错误文本',
          message:proxyWrap.reason,
          detail:String(rawText).slice(0,360),
          suggest_terminal:true,
          background:Boolean(options.background)
        },logBase,startedMs,{raw_response:String(rawText).slice(0,2000),finish_reason:'proxy_error'});
      }
      throwApiError({
        error_code:'INVALID_RESPONSE_JSON',
        http_status:res.status||200,
        title:'无法解析模型接口响应',
        message:'接口返回了非 JSON 格式的数据（可能是反代报错网页或网关拦截页）。',
        detail:String(rawText||'').slice(0,360),
        suggest_terminal:true,
        background:Boolean(options.background)
      },logBase,startedMs,{raw_response:String(rawText||'').slice(0,2000),finish_reason:'invalid_json_response'});
    }
    // Check HTTP 200 but with top-level error object or status === 'error'
    if(data.error||(data.status==='error'&&!Array.isArray(data.choices))){
      const errObj=data.error;
      const errMsgStr=typeof errObj==='string'?errObj:(errObj?.message||data.message||JSON.stringify(errObj));
      const errCodeStr=String(errObj?.code||errObj?.type||'HTTP_200_ERROR').toUpperCase();
      const proxyCheck=detectProxyWrappedError(errMsgStr);
      const retryAfter=extractRetryAfter(res,errMsgStr,data);
      throwApiError({
        error_code:proxyCheck?.code||'HTTP_200_ERROR_OBJECT',
        http_status:res.status||200,
        title:proxyCheck?.code==='PROXY_ALL_KEYS_FAILED'?'反向代理密钥池全部失败':'接口返回包含 Error 字段的异常响应',
        message:proxyCheck?.reason||`HTTP 状态为 200，但响应体包含 error 错误信息：${String(errMsgStr).slice(0,180)}`,
        detail:String(errMsgStr).slice(0,400),
        retry_after:retryAfter,
        suggest_terminal:Boolean(proxyCheck||/key|auth|model|permission|quota/i.test(errMsgStr)),
        background:Boolean(options.background)
      },logBase,startedMs,{raw_response:data,finish_reason:'http_200_error_field'});
    }
    if(!Array.isArray(data?.choices)||data.choices.length===0){
      throwApiError({
        error_code:'EMPTY_CHOICES',
        http_status:res.status||200,
        title:'接口未返回候选回复 (Choices 为空)',
        message:'接口响应中缺少 choices 列表或列表为空。',
        background:Boolean(options.background)
      },logBase,startedMs,{raw_response:data,finish_reason:'empty_choices'});
    }
    const choice=data.choices[0]||{};
    if(choice.error){
      const cErrMsg=typeof choice.error==='string'?choice.error:(choice.error?.message||JSON.stringify(choice.error));
      throwApiError({
        error_code:'CHOICE_ERROR',
        http_status:res.status||200,
        title:'模型生成节点中断报错',
        message:`响应 choices[0] 包含错误字段：${String(cErrMsg).slice(0,180)}`,
        detail:String(cErrMsg).slice(0,400),
        background:Boolean(options.background)
      },logBase,startedMs,{raw_response:data,finish_reason:'choice_error'});
    }
    const msgObj=choice.message||{};
    let result=msgObj.content;
    if(Array.isArray(result))result=result.map(x=>x.text||'').join('');
    const reasoningRaw=[msgObj.reasoning_content,msgObj.reasoning,choice.reasoning].find(x=>typeof x==='string'&&x.length)||'';
    const finishReason=choice.finish_reason||data?.finish_reason||null;
    const isTruncated=['length','max_tokens'].includes(String(finishReason||'').toLowerCase());
    const usageRaw=data?.usage||data?.usage_metadata||data?.usageMetadata||null;
    const usageNumber=(...values)=>{for(const v of values){if(typeof v==='number'&&Number.isFinite(v)&&v>=0)return v;}return null;};
    const reasoningTokens=usageNumber(usageRaw?.completion_tokens_details?.reasoning_tokens,usageRaw?.reasoning_tokens,usageRaw?.thoughtsTokenCount);
    const usage=usageRaw?{
      prompt_tokens:usageNumber(usageRaw.prompt_tokens,usageRaw.input_tokens,usageRaw.promptTokenCount),
      completion_tokens:usageNumber(usageRaw.completion_tokens,usageRaw.output_tokens,usageRaw.candidatesTokenCount),
      total_tokens:usageNumber(usageRaw.total_tokens,usageRaw.totalTokenCount),
      reasoning_tokens:reasoningTokens
    }:null;
    if(typeof result!=='string'||!result.trim()){
      const isLen=isTruncated;
      throwApiError({
        error_code:isLen?'OUTPUT_TRUNCATED':'EMPTY_CONTENT',
        http_status:res.status||200,
        title:isLen?'输出因达到 max_tokens 上限被截断为空':'模型未返回可用文本内容',
        message:isLen
          ?'模型因达到 max_tokens 长度上限而被截断（可能是思维链/推理消耗了全部 max_tokens 预算，建议调大 Max tokens 至 4096–8192）。'
          :'接口返回了空内容（choices[0].message.content 为空），未生成任何角色回复。',
        suggest_terminal:isLen,
        background:Boolean(options.background)
      },logBase,startedMs,{
        raw_response:data,
        raw_content:typeof result==='string'?result:'',
        reasoning_content:reasoningRaw,
        finish_reason:finishReason||'empty_content',
        usage,
        truncation_warning:isLen?'finish_reason=length：输出因达到 max_tokens 上限被截断':''
      });
    }
    const rawTrimmed=result.trim();
    // Check if HTTP 200 assistant content is actually a reverse-proxy wrapped error string
    const proxyWrapped=detectProxyWrappedError(rawTrimmed);
    if(proxyWrapped){
      throwApiError({
        error_code:proxyWrapped.code,
        http_status:res.status||200,
        title:proxyWrapped.code==='PROXY_ALL_KEYS_FAILED'?'反向代理密钥池请求失败 (HTTP 200 包装错误)':'反向代理将错误提示包装为了模型回复',
        message:`已拦截反代伪装成角色回复的错误文本（${proxyWrapped.reason}），未写入聊天记录与记忆。`,
        detail:rawTrimmed.slice(0,360),
        suggest_terminal:true,
        background:Boolean(options.background)
      },logBase,startedMs,{
        raw_response:data,
        raw_content:rawTrimmed,
        reasoning_content:reasoningRaw,
        finish_reason:'proxy_wrapped_error',
        usage
      });
    }
    // Check structured JSON task validity when json_mode is true
    if(options.json_mode&&!options.skip_json_gateway){
      let jsonCandidate=rawTrimmed;
      const fenced=jsonCandidate.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      if(fenced&&fenced[1])jsonCandidate=fenced[1].trim();
      try{
        const parsedJson=JSON.parse(jsonCandidate);
        if(!parsedJson||typeof parsedJson!=='object'){
          throw new Error('JSON root is not an object');
        }
      }catch(je){
        throwApiError({
          error_code:isTruncated?'OUTPUT_TRUNCATED':'INVALID_STRUCTURED_JSON',
          http_status:res.status||200,
          title:isTruncated?'结构化输出因长度截断导致 JSON 损坏':'结构化任务返回了无效的 JSON',
          message:isTruncated
            ?'模型在输出结构化 JSON 时达到 max_tokens 上限被截断，导致 JSON 不完整。'
            :'模型返回的内容不是有效的 JSON 结构，已拦截以防污染存档。',
          detail:rawTrimmed.slice(0,300),
          suggest_terminal:isTruncated,
          background:Boolean(options.background)
        },logBase,startedMs,{
          raw_response:data,
          raw_content:rawTrimmed,
          reasoning_content:reasoningRaw,
          finish_reason:finishReason||'invalid_json',
          usage,
          truncation_warning:isTruncated?'finish_reason=length：JSON 因达到 max_tokens 上限被截断':''
        });
      }
    }
    const replyContent=(mode==='chat'||mode==='meeting')?guardChatReasoning(rawTrimmed):rawTrimmed;
    if(replyContent===null){
      throwApiError({
        error_code:'REASONING_LEAK',
        http_status:res.status||200,
        title:'模型将分析过程混入了聊天正文',
        message:'无法可靠分离正式台词，已阻止写入聊天与记忆。可手动重试；原始返回已保存在系统日志中。',
        may_consume_tokens:true,
        background:Boolean(options.background)
      },logBase,startedMs,{
        raw_response:data,raw_content:rawTrimmed,reasoning_content:reasoningRaw,
        finish_reason:finishReason||'stop',usage
      });
    }
    const parsedPreview=mode==='meeting'
      ?cleanMeetingNovelText(replyContent)
      :(mode==='chat'?splitChatBubbles(replyContent).join('\n'):replyContent);
    if((mode==='chat'||mode==='meeting')&&(!parsedPreview.trim()||(mode==='meeting'&&/^[\s.…。]+$/.test(parsedPreview)))){
      throwApiError({
        error_code:'EMPTY_PARSED_CONTENT',
        http_status:res.status||200,
        title:'模型未返回可显示的正文',
        message:'清洗空白或分隔符后没有可显示的角色正文内容，请重试。',
        detail:rawTrimmed.slice(0,200),
        background:Boolean(options.background)
      },logBase,startedMs,{
        raw_response:data,
        raw_content:rawTrimmed,
        reasoning_content:reasoningRaw,
        finish_reason:finishReason||'empty_parsed',
        usage
      });
    }
    if((mode==='chat'||mode==='meeting')&&isModelRefusalText(parsedPreview)){
      throwApiError({
        error_code:'MODEL_REFUSAL',
        http_status:res.status||200,
        title:'模型拒绝了本轮剧情生成',
        message:'模型返回了出戏的内容拒绝，而非角色正文。用户原文和已有剧情已保留；拒绝文本不会写入聊天、见面归档或记忆。',
        detail:parsedPreview.slice(0,300),
        may_consume_tokens:true,
        background:Boolean(options.background)
      },logBase,startedMs,{
        raw_response:data,raw_content:rawTrimmed,parsed_content:parsedPreview,
        reasoning_content:reasoningRaw,finish_reason:finishReason||'stop',usage
      });
    }
    // Check severe truncation on chat/meeting when finish_reason === 'length' and content is severely cut off (< 80 chars or explicit reject_truncated)
    if(isTruncated&&(options.json_mode||options.reject_truncated||parsedPreview.trim().length<80)){
      throwApiError({
        error_code:'OUTPUT_TRUNCATED',
        http_status:res.status||200,
        title:'回复内容被严重截断 (finish_reason=length)',
        message:'模型因达到 max_tokens 上限导致回复未完成即被截断，已拦截残缺文本。建议在「终端」调大 Max tokens 后重试。',
        detail:parsedPreview.slice(0,240),
        suggest_terminal:true,
        background:Boolean(options.background)
      },logBase,startedMs,{
        raw_response:data,
        raw_content:rawTrimmed,
        reasoning_content:reasoningRaw,
        finish_reason:finishReason,
        usage,
        truncation_warning:'finish_reason=length：输出被严重截断并已拦截'
      });
    }
    const truncWarnings=[];
    if(isTruncated){
      truncWarnings.push('模型返回 finish_reason="length"，说明正文因达到 max_tokens 上限而被中途截断，建议在「终端 -> 连接与模型」调大 Max tokens。');
    }
    if(reasoningTokens&&reqMaxTokens&&(!Number.isFinite(usage?.completion_tokens)||reasoningTokens<=usage.completion_tokens)&&(reasoningTokens/reqMaxTokens)>0.6){
      truncWarnings.push(`推理/思维链消耗了 ${reasoningTokens} tokens（占 max_tokens ${reqMaxTokens} 的 ${Math.round(reasoningTokens*100/reqMaxTokens)}%），可能导致正文字数被压缩。`);
    }
    if(usage&&Number.isFinite(usage.reasoning_tokens)&&Number.isFinite(usage.completion_tokens)&&usage.reasoning_tokens>usage.completion_tokens){
      truncWarnings.push('供应商返回的 reasoning_tokens 大于 completion_tokens，统计口径可能不一致；请查看原始 usage。');
    }
    if(mode==='meeting'&&!isTruncated&&parsedPreview.length<rawTrimmed.length&&parsedPreview.replace(/\s/g,'')!==rawTrimmed.replace(/\s/g,'')){
      truncWarnings.push('原始内容与解析正文存在非空白差异，请对照两者；不代表模型被截断。');
    }
    recordSystemLog({
      ...logBase,
      status:'success',
      http_status:res.status,
      duration_ms:Date.now()-startedMs,
      error:'',
      raw_response:data,
      raw_content:rawTrimmed,
      reasoning_content:reasoningRaw,
      parsed_content:parsedPreview,
      char_count_raw:rawTrimmed.length,
      char_count_parsed:parsedPreview.length,
      finish_reason:finishReason,
      usage,
      truncation_warning:truncWarnings.join(' ')
    });
    return options.json_mode?rawTrimmed.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i,'$1').trim():replyContent;
  }
  // Discovery uses stable identities, not random IDs for each new card.
