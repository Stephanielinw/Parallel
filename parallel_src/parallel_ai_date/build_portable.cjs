const fs = require('fs');
const path = require('path');

const baseDir = __dirname;
const staticDir = path.join(baseDir, 'static');

const indexHtml = fs.readFileSync(path.join(staticDir, 'index.html'), 'utf8');
const styleCss = fs.readFileSync(path.join(staticDir, 'style.css'), 'utf8');
const offlineJs = fs.readFileSync(path.join(staticDir, 'offline.js'), 'utf8');
const appJs = fs.readFileSync(path.join(staticDir, 'app.js'), 'utf8');

let portableHtml = indexHtml
  .replace(
    '<title>Parallel — 跨世界心动</title><link rel="stylesheet" href="/style.css">',
    `<title>Parallel — 跨世界心动 (单文件直开版)</title><style>${styleCss}</style>`
  )
  .replace(
    '<script src="/app.js" defer></script>',
    `<script>${offlineJs}</script><script>${appJs}</script>`
  );

const outPaths = [
  path.resolve(baseDir, '..', 'Parallel_v0.5_直接打开.html'),
  path.resolve(baseDir, '..', '..', 'public', 'Parallel_v0.5_直接打开.html'),
];

for (const outPath of outPaths) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, portableHtml, 'utf8');
  console.log('Built portable HTML:', outPath, `(${fs.statSync(outPath).size} bytes)`);
}
