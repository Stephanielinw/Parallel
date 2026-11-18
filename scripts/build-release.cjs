// Rebuild public downloads exclusively from the maintained project sources.
// The explicit allowlist excludes private imports, local data and debug logs.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const src = 'parallel_src/parallel_ai_date/';
const allowed = [
  'PRODUCT_BLUEPRINT.md','README.md','build_portable.cjs','catalog.py','server.py',
  'static/app.js','static/apple-touch-icon.png','static/index.html','static/manifest.json',
  'static/offline.js','static/parallel-icon.png','static/style.css',
  'tests/test_api.py','tests/test_portable.cjs'
];
const files = [
  ['Parallel_v0.5_直接打开.html','parallel_src/Parallel_v0.5_直接打开.html'],
  ...allowed.map(p=>['parallel_ai_date/'+p,src+p])
];
const table=Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);return c>>>0});
const crc32=b=>{let c=0xffffffff;for(const v of b)c=table[(c^v)&255]^(c>>>8);return (c^0xffffffff)>>>0};
const local=[],central=[];let offset=0;
for(const [name,rel] of files){
  const n=Buffer.from(name,'utf8'),raw=fs.readFileSync(path.join(root,rel)),packed=zlib.deflateRawSync(raw),crc=crc32(raw);
  const h=Buffer.alloc(30),d=Buffer.alloc(46);
  h.writeUInt32LE(0x04034b50,0);h.writeUInt16LE(20,4);h.writeUInt16LE(0x800,6);h.writeUInt16LE(8,8);h.writeUInt16LE(0x21,12);
  h.writeUInt32LE(crc,14);h.writeUInt32LE(packed.length,18);h.writeUInt32LE(raw.length,22);h.writeUInt16LE(n.length,26);
  d.writeUInt32LE(0x02014b50,0);d.writeUInt16LE(20,4);d.writeUInt16LE(20,6);d.writeUInt16LE(0x800,8);d.writeUInt16LE(8,10);d.writeUInt16LE(0x21,14);
  d.writeUInt32LE(crc,16);d.writeUInt32LE(packed.length,20);d.writeUInt32LE(raw.length,24);d.writeUInt16LE(n.length,28);d.writeUInt32LE(offset,42);
  local.push(h,n,packed);central.push(d,n);offset+=h.length+n.length+packed.length;
}
const directory=Buffer.concat(central),end=Buffer.alloc(22);
end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(files.length,8);end.writeUInt16LE(files.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
const zip=Buffer.concat([...local,directory,end]);
const out='public/Parallel_v0.5_HTML与源码_修复版.zip';
fs.writeFileSync(path.join(root,out),zip);
// Never publish arbitrary JSON uploaded to the AI Studio asset folder.
const uploads=path.join(root,'public/assets/aistudio');
if(fs.existsSync(uploads)){
  const unexpected=fs.readdirSync(uploads).filter(p=>/\.json$/i.test(p));
  if(unexpected.length)throw Error('Private preset risk: remove JSON uploads from public/assets/aistudio before build: '+unexpected.join(', '));
}
console.log('Built release archive from '+files.length+' allowlisted files');
