const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'..',p),'utf8');
const offline=read('public/parallel/offline.js'),ui=read('public/parallel/app.js');
assert.equal(offline,read('parallel_src/parallel_ai_date/static/offline.js'));
assert.equal(ui,read('parallel_src/parallel_ai_date/static/app.js'));
new Function(ui);
const begin=offline.indexOf('  const classifyHttpStatusError='),end=offline.indexOf('  const readResTextAndJson=',begin);
assert(begin>=0&&end>begin,'HTTP classifier exists');
const classify=new Function('detectProxyWrappedError','extractRetryAfter',offline.slice(begin,end)+'return classifyHttpStatusError;')(()=>null,()=>0);
const wrapped="Unexpected error in chat_completions endpoint: 401 UNAUTHENTICATED. {'error': {'code': 401, 'message': 'API keys are not supported by this API. Expected OAuth2 access token or other authentication credentials that assert a principal.'}}";
const nested=JSON.stringify({error:{message:wrapped}});
for(const raw of [wrapped,nested]){
 const result=classify(500,raw);
 assert.equal(result.error_code,'UPSTREAM_OAUTH_REQUIRED');
 assert.equal(result.http_status,500,'retain transport status in metadata');
 assert.equal(result.suggest_terminal,true);
 assert.equal(result.retry_after,0);
 assert(result.message.includes('OAuth 2.0'));
 assert(result.message.includes('不要反复重试'));
}
assert.equal(classify(500,'Server overloaded').error_code,'HTTP_500');
assert.equal(classify(401,'Invalid API Key').error_code,'HTTP_401');
assert.equal(classify(502,'Bad Gateway').error_code,'HTTP_502');
assert(ui.includes("const requiresUpstreamAuthFix=err.error_code==='UPSTREAM_OAUTH_REQUIRED'"));
assert(ui.includes("${requiresUpstreamAuthFix?'':`<button type=\"button\" class=\"btn primary\" data-action=\"api-error-retry\""),'OAuth mismatch must not offer a repeat-retry button');
assert(ui.includes('请先修复代理的 Google 渠道认证'));
assert(read('parallel_src/parallel_ai_date/server.py').includes("'error_code':'UPSTREAM_OAUTH_REQUIRED'"),'Python gateway must classify the same upstream error');
console.log('OAuth-required upstream 401 wrapped by proxy 500 is correctly classified; ordinary 500/401/502 remain unaffected and retry button is suppressed.');
