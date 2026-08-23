#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { mapInjectOrEnvError } from '../dist/shared/inject-errors.zh.js';
import { shouldAutoKillCursor } from '../dist/shared/switch-kill-policy.js';

test('mapInjectOrEnvError exposes unknown inject code', () => {
  assert.equal(
    mapInjectOrEnvError('inject_failed: profile_env_skipped:token_only'),
    '当前账号环境配置不完整，请联系客服',
  );
  assert.equal(
    mapInjectOrEnvError('inject_failed: inject_cli_failed'),
    '会话配置失败，请联系客服',
  );
  assert.equal(
    mapInjectOrEnvError('inject_failed: cursor_still_running'),
    '无法关闭 Cursor，请在任务管理器中结束所有 Cursor 进程后重试',
  );
  assert.equal(
    mapInjectOrEnvError('inject_failed: db_error:SQLITE_BUSY'),
    'Cursor 数据库写入失败，请完全关闭 Cursor 后重试',
  );
  assert.equal(
    mapInjectOrEnvError('inject_failed: ENOENT'),
    '会话配置失败（ENOENT），请联系客服',
  );
});

test('shouldAutoKillCursor dev default off', () => {
  const prev = process.env.CURSOR_FREE_SKIP_CURSOR_KILL;
  delete process.env.CURSOR_FREE_SKIP_CURSOR_KILL;
  assert.equal(shouldAutoKillCursor(false), false);
  assert.equal(shouldAutoKillCursor(true), true);
  process.env.CURSOR_FREE_SKIP_CURSOR_KILL = '1';
  assert.equal(shouldAutoKillCursor(true), false);
  process.env.CURSOR_FREE_SKIP_CURSOR_KILL = '0';
  assert.equal(shouldAutoKillCursor(false), true);
  if (prev === undefined) delete process.env.CURSOR_FREE_SKIP_CURSOR_KILL;
  else process.env.CURSOR_FREE_SKIP_CURSOR_KILL = prev;
});

console.log('inject-switch-policy.test: OK');
