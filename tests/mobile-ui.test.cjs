const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const appJs = fs.readFileSync(path.resolve(__dirname, '../public/parallel/app.js'), 'utf8');
const offlineJs = fs.readFileSync(path.resolve(__dirname, '../public/parallel/offline.js'), 'utf8');
const styleCss = fs.readFileSync(path.resolve(__dirname, '../public/parallel/style.css'), 'utf8');

test('Mobile UI & ROUND-02a regression guards: read cursor, model picker, divider filter, viewport layout, and IndexedDB log isolation', () => {
  // 1. Read cursor persisted separately from thread opening
  assert.ok(appJs.includes("const READ_CURSOR_KEY='parallel-incoming-read-v1'"), 'Uses persistent read cursor key');
  assert.ok(appJs.includes('function threadHasUnread(thread,pid=state.activeId)'), 'Computes unread status per thread');

  // 2. Model list picker modal instead of silent overwrite
  assert.ok(appJs.includes('function openModelPicker(kind)'), 'Provides explicit model picker modal');

  // 3. Bare divider artifacts filtered out of chat history and preview
  assert.ok(appJs.includes('const isIncoming=m=>Boolean('), 'Filters bare divider chat artifacts in UI');
  assert.ok(offlineJs.includes('const isChatArtifact=m=>'), 'Filters bare divider chat artifacts in offline engine');

  // 4. Mobile viewport height adaptation
  assert.ok(styleCss.includes('100dvh'), 'Uses dynamic viewport height 100dvh on mobile');

  // 5. IndexedDB isolated generation log store with dual limits
  assert.ok(offlineJs.includes("indexedDB.open('parallel-generation-logs-v1',1)"), 'Uses dedicated IndexedDB database for generation logs');
  assert.ok(offlineJs.includes('LOG_MAX_COUNT=40'), 'Enforces max log entry count');
  assert.ok(offlineJs.includes('LOG_MAX_BYTES=4*1024*1024'), 'Enforces max log byte capacity');
  assert.ok(offlineJs.includes("case '/system-logs-settings':"), 'Supports toggling generation log recording on/off');
});
