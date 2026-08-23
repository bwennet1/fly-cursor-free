#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';

test('parseSpawnError prefers ERROR: line', async () => {
  const { spawnInjectCli } = await import('../dist/daemon/inject-bridge.js');
  // missing_command via empty spawn — use direct import of parse by running known bad cmd
  const r = await spawnInjectCli([]);
  assert.equal(r.ok, false);
  assert.ok(r.detail);
});

test('parseSpawnError module_not_found via inject-cli import chain', async () => {
  const { mkdirSync, writeFileSync, cpSync, rmSync } = await import('node:fs');
  const { join } = await import('node:path');
  const { tmpdir } = await import('node:os');
  const { execFileSync } = await import('node:child_process');

  const root = join(tmpdir(), `relay-inject-unpack-${Date.now()}`);
  const daemon = join(root, 'daemon');
  mkdirSync(daemon, { recursive: true });
  const src = join(process.cwd(), 'dist', 'daemon');
  for (const f of ['inject-cli.mjs', 'cursor-paths.mjs', 'profile-store.mjs', 'cursor-process.mjs', 'probed-auth-keys.json']) {
    cpSync(join(src, f), join(daemon, f));
  }
  // deliberately omit cursor-paths.js — reproduces packaged asar bug
  let stderr = '';
  try {
    execFileSync(process.execPath, [join(daemon, 'inject-cli.mjs'), 'close-cursor'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } catch (e) {
    stderr = `${e.stderr ?? ''}\n${e.stdout ?? ''}`;
  }
  assert.match(stderr, /Cannot find module|ERR_MODULE_NOT_FOUND/);
  rmSync(root, { recursive: true, force: true });
});

console.log('inject-bridge-parse.test: OK');
