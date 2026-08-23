import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test('PersistedSession accepts consumePending fields', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-session-'));
  const home = join(dir, 'home');
  mkdirSync(join(home, '.cursor-free'), { recursive: true });
  const prev = process.env.HOME;
  const prevUser = process.env.USERPROFILE;
  process.env.HOME = home;
  process.env.USERPROFILE = home;

  try {
    const { savePersistedSession, loadPersistedSession, sessionFilePath } = await import(
      '../dist/shared/session-store.js'
    );
    const payload = {
      licenseKey: 'RELAY-TEST-1234-5678',
      deviceLeaseId: 'lease-1',
      accountId: 'acc-1',
      consumePendingAccountId: 'acc-1',
      consumePendingAt: '2026-05-19T12:00:00.000Z',
    };
    savePersistedSession(payload);
    assert.ok(sessionFilePath().includes('.cursor-free'));
    const loaded = loadPersistedSession();
    assert.equal(loaded?.consumePendingAccountId, 'acc-1');
    assert.equal(loaded?.consumePendingAt, payload.consumePendingAt);
  } finally {
    if (prev === undefined) delete process.env.HOME;
    else process.env.HOME = prev;
    if (prevUser === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = prevUser;
    rmSync(dir, { recursive: true, force: true });
  }
});
