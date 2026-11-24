import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {defineConfig} from 'vite';

// M09: every changed shipped JS/CSS file forces a fresh URL, without editing
// hardcoded version strings or touching the user's local browser save.
const require = createRequire(import.meta.url);
const {releaseId} = require('./scripts/m09-release-manifest.cjs') as {releaseId:()=>string};

export default defineConfig(({command}) => {
  const revision=releaseId();
  return {
    plugins: [react(), tailwindcss(), {
      name:'parallel-m09-release-provenance',
      enforce:'pre',
      transformIndexHtml(html) {
        const marker='/parallel/style.css?v=__PARALLEL_RELEASE__';
        if(!html.includes(marker))throw new Error('[M09] Missing versioned Pages stylesheet');
        return html.replace(marker,'/parallel/style.css?v='+revision);
      },
      closeBundle() {
        if(command==='build')execFileSync(process.execPath,['scripts/m09-release-manifest.cjs','--write'],{
          cwd:__dirname,stdio:'inherit'
        });
      }
    }],
    define: {'__PARALLEL_ASSET_REV__':JSON.stringify(revision)},
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
