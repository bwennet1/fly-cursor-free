#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureCursorClosed, isCursorRunning, waitUntilCursorGone } from '../daemon/cursor-process.mjs';

test('waitUntilCursorGone returns quickly when Cursor is not running', () => {
  if (isCursorRunning()) {
    console.log('cursor-process.test: skip — Cursor.exe is running');
    return;
  }
  const t0 = Date.now();
  assert.equal(waitUntilCursorGone(5, 50), true);
  assert.ok(Date.now() - t0 < 300, `expected fast return, took ${Date.now() - t0}ms`);
});

test('ensureCursorClosed is instant when Cursor is not running', () => {
  if (isCursorRunning()) {
    console.log('cursor-process.test: skip — Cursor.exe is running');
    return;
  }
  const t0 = Date.now();
  assert.equal(ensureCursorClosed(), true);
  assert.ok(Date.now() - t0 < 300, `expected instant, took ${Date.now() - t0}ms`);
});

console.log('cursor-process.test: OK');
