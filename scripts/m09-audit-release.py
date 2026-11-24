#!/usr/bin/env python3
"""M09: fail-closed check of the ACTUAL downloadable release ZIP, no extraction."""
import os, pathlib, re, stat, sys, zipfile

ROOT=pathlib.Path(__file__).resolve().parent.parent
ZIP=ROOT/'public'/'Parallel_v0.5_HTML与源码_修复版.zip'
DENY_NAME=re.compile(r'(?i)(?:^|/)(?:\.env[^/]*|\.git|data|node_modules|__pycache__|(?:api[-_]?keys?|token|secret|credential|connection|password)(?:s)?(?:\.[^/]*)?|[^/]+\.(?:sqlite3?|db|pem|key|p12|pfx|log|bak|tmp))(?=/|$)')
REQUIRED={
    'Parallel_v0.5_直接打开.html',
    'parallel_ai_date/server.py',
    'parallel_ai_date/static/index.html',
    'parallel_ai_date/static/offline.js',
    'parallel_ai_date/static/app.js',
    'parallel_ai_date/static/style.css'
}
FINGERPRINTS=('_____685745cf','HIGH_TENSION_DIRTY_TALK','STYLE_CARD_CINEMATIC_CRISP','造梦犬')

def audit_zip(filepath=ZIP):
    if not zipfile.is_zipfile(filepath):raise ValueError('Release source archive is not a ZIP')
    with zipfile.ZipFile(filepath) as archive:
        entries=archive.infolist()
        names=[entry.filename for entry in entries if not entry.is_dir()]
        if len(names)!=len(set(names)):raise ValueError('Duplicate ZIP paths')
        if len(names)>2000:raise ValueError('Unexpectedly large release listing')
        for entry in entries:
            name=entry.filename
            parts=pathlib.PurePosixPath(name)
            if (not name or name.startswith('/') or '\\' in name or
                any(x in ('.','..') for x in name.split('/')) or
                DENY_NAME.search(name)):
                raise ValueError('Sensitive or unsafe release path: '+name)
            mode=entry.external_attr>>16
            if stat.S_ISLNK(mode):raise ValueError('Symlink in release source: '+name)
            if entry.file_size>120*1024*1024:raise ValueError('Oversize archive member: '+name)
            if not entry.is_dir() and pathlib.PurePosixPath(name).suffix.lower() in ('.js','.html','.json','.py','.md','.txt','.css','.cjs'):
                content=archive.read(entry).decode('utf8')
                for token in FINGERPRINTS:
                    if token in content:raise ValueError('Forbidden private preset fingerprint in '+name)
        missing=REQUIRED-set(names)
        if missing:raise ValueError('Release is missing required files: '+', '.join(sorted(missing)))
    return len(names)

if __name__=='__main__':
    try:
        print('[M09] Audited',audit_zip(),'shipped archive paths; no private data files or unsafe members.')
    except (OSError,ValueError,zipfile.BadZipFile) as error:
        print('[M09]',str(error),file=sys.stderr)
        sys.exit(1)
