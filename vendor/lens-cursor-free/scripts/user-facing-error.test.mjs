#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  unwrapIpcErrorMessage,
  userFacingError,
} from '../ui/messages.zh.mjs';

test('unwrapIpcErrorMessage extracts nested Electron IPC message', () => {
  const raw =
    "Error invoking remote method 'hub:switch-account': Error: 会话配置失败，请关闭 Cursor 后重试";
  assert.equal(unwrapIpcErrorMessage(raw), '会话配置失败，请关闭 Cursor 后重试');
});

test('userFacingError passes through inject pipeline Chinese', () => {
  const err = new Error('会话配置失败，请关闭 Cursor 后重试');
  assert.equal(userFacingError(err), '会话配置失败，请关闭 Cursor 后重试。');
});

test('userFacingError passes through IPC-wrapped inject message', () => {
  const err = new Error(
    "Error invoking remote method 'hub:switch-account': Error: 自动关闭 Cursor 失败，请在任务管理器中结束 Cursor 后重试",
  );
  assert.equal(
    userFacingError(err),
    '自动关闭 Cursor 失败，请在任务管理器中结束 Cursor 后重试。',
  );
});

test('userFacingError still maps unknown to generic', () => {
  assert.equal(userFacingError(new Error('ECONNRESET')), '操作未成功，请稍后再试或联系客服。');
});

console.log('user-facing-error.test: OK');
