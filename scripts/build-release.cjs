#!/usr/bin/env node
/**
 * Rebuilds the downloadable source & portable HTML release archive:
 *   public/Parallel_v0.5_HTML与源码_修复版.zip
 *
 * Also enforces ROUND-02a privacy guardrails:
 *   - Verifies no private preset JSON exists in public/ or parallel_src/
 *   - Verifies neither the portable HTML nor the generated ZIP contains private preset fingerprints
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const zipOut = path.join(root, 'public', 'Parallel_v0.5_HTML与源码_修复版.zip');
const legacyAssetZip = path.join(
  root,
  'public',
  'assets',
  'aistudio',
  'Parallel_v0.5_HTML_E4_B8_8E_E6_BA_90_E7_A0_81_7af0ab2c.zip'
);

const FORBIDDEN_PATTERNS = [
  '_____685745cf',
  'HIGH_TENSION_DIRTY_TALK',
  'STYLE_CARD_CINEMATIC_CRISP',
  '造梦犬',
];

function assertNoPrivatePresetLeak(filePath, label) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const pat of FORBIDDEN_PATTERNS) {
    if (content.includes(pat)) {
      throw new Error(`[Privacy Guard] Forbidden private preset fingerprint "${pat}" found in ${label} (${filePath})`);
    }
  }
}

// 1. Remove any accidentally uploaded private preset JSON or stale duplicate zip in public/assets/aistudio
const leakedJson = path.join(root, 'public', 'assets', 'aistudio', '_____685745cf.json');
if (fs.existsSync(leakedJson)) {
  fs.unlinkSync(leakedJson);
}
if (fs.existsSync(legacyAssetZip)) {
  fs.unlinkSync(legacyAssetZip);
}

// 2. Scan portable HTML and offline.js for private preset fingerprints
assertNoPrivatePresetLeak(path.join(root, 'public', 'Parallel_v0.5_直接打开.html'), 'public portable HTML');
assertNoPrivatePresetLeak(path.join(root, 'public', 'parallel', 'offline.js'), 'public offline.js');
assertNoPrivatePresetLeak(path.join(root, 'parallel_src', 'Parallel_v0.5_直接打开.html'), 'parallel_src portable HTML');

// 3. Rebuild public/Parallel_v0.5_HTML与源码_修复版.zip from parallel_src/ using python3 zipfile
const pyScript = `
import os, zipfile

root = ${JSON.stringify(root)}
src_dir = os.path.join(root, 'parallel_src')
zip_out = ${JSON.stringify(zipOut)}

skip_dirs = {'__pycache__', '.git', '.pytest_cache', 'data', 'node_modules'}
skip_exts = {'.pyc', '.pyo', '.sqlite3', '.db'}

with zipfile.ZipFile(zip_out, 'w', zipfile.ZIP_DEFLATED) as zf:
    for dirpath, dirnames, filenames in os.walk(src_dir):
        dirnames[:] = [d for d in sorted(dirnames) if d not in skip_dirs]
        for fname in sorted(filenames):
            _, ext = os.path.splitext(fname)
            if ext in skip_exts or fname == '.DS_Store':
                continue
            full_path = os.path.join(dirpath, fname)
            arcname = os.path.relpath(full_path, src_dir)
            zf.write(full_path, arcname)
`;

execFileSync('python3', ['-c', pyScript], { stdio: 'inherit' });
console.log('Rebuilt release archive:', path.relative(root, zipOut));
