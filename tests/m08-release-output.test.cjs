const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
const base='parallel_src/parallel_ai_date/static/';
const index=read(base+'index.html');
const css=read(base+'style.css');
const offline=read(base+'offline.js');
const app=read(base+'app.js');
const expected=index
  .replace('<title>Parallel — 跨世界心动</title><link rel="stylesheet" href="/style.css">',
    '<title>Parallel — 跨世界心动 (单文件直开版)</title><style>'+css+'</style>')
  .replace('<script src="/app.js" defer></script>',
    '<script>'+offline+'</script><script>'+app+'</script>');
assert.notEqual(expected,index,'portable substitutions must match the canonical index');
for(const file of ['parallel_src/Parallel_v0.5_直接打开.html','public/Parallel_v0.5_直接打开.html']){
  assert.equal(read(file),expected,'downloadable standalone HTML must embed this build\'s complete engine and frontend: '+file);
}
for(const file of ['app.js','offline.js','style.css','index.html']){
  assert.equal(read('dist/parallel/'+file),read(base+file),'Pages dist must use exactly the same shipped asset: '+file);
}
assert.equal(read('dist/Parallel_v0.5_直接打开.html'),expected,'Pages downloadable HTML must not lag behind current app logic');
assert(fs.existsSync(path.join(root,'public/Parallel_v0.5_HTML与源码_修复版.zip')),'Source archive must be emitted by the same build');
console.log('M08: release Pages, standalone HTML and canonical frontend/engine binaries are identical.');
