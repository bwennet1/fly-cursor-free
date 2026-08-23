import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptsDir = join(fileURLToPath(import.meta.url), '..');

function runValidate(dir, extra = []) {
  return spawnSync(process.execPath, [join(scriptsDir, 'validate-build-config.mjs'), ...extra], {
    cwd: dir,
    encoding: 'utf8',
  });
}

test('validate-build-config rejects template purchaseUrl', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-val-'));
  writeFileSync(
    join(dir, 'build-config.json'),
    JSON.stringify({
      defaultHubUrl: 'https://hub.vendor.example',
      purchaseUrl: 'https://shop.example.com/licenses',
      enableOpsTools: false,
    }),
  );
  const r = runValidate(dir, ['--require-purchase']);
  assert.notEqual(r.status, 0);
});

test('validate-build-config accepts real prod urls', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-val-'));
  writeFileSync(
    join(dir, 'build-config.json'),
    JSON.stringify({
      defaultHubUrl: 'https://hub.vendor.example',
      purchaseUrl: 'https://pay.vendor.example/shop',
      enableOpsTools: false,
    }),
  );
  const r = runValidate(dir, ['--require-purchase']);
  assert.equal(r.status, 0);
});
