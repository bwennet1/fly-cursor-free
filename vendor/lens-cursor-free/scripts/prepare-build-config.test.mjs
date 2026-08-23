import assert from 'node:assert/strict';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const scriptsDir = join(fileURLToPath(import.meta.url), '..');
const desktopRoot = join(scriptsDir, '..');

test('prepare-build-config prod copies enableOpsTools false', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-cfg-'));
  copyFileSync(
    join(desktopRoot, 'build-config.prod.example.json'),
    join(dir, 'build-config.prod.example.json'),
  );
  copyFileSync(
    join(desktopRoot, 'build-config.ops.example.json'),
    join(dir, 'build-config.ops.example.json'),
  );
  const script = join(scriptsDir, 'prepare-build-config.mjs');
  const r = spawnSync(process.execPath, [script, 'prod'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const cfg = JSON.parse(readFileSync(join(dir, 'build-config.json'), 'utf8'));
  assert.equal(cfg.enableOpsTools, false);
  assert.ok(!cfg.defaultHubUrl.includes('127.0.0.1'));
});

test('prepare-build-config prod keeps local supportUrl over example placeholder', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-cfg-'));
  copyFileSync(
    join(desktopRoot, 'build-config.prod.example.json'),
    join(dir, 'build-config.prod.example.json'),
  );
  copyFileSync(
    join(desktopRoot, 'build-config.ops.example.json'),
    join(dir, 'build-config.ops.example.json'),
  );
  writeFileSync(
    join(dir, 'build-config.json'),
    `${JSON.stringify(
      {
        defaultHubUrl: 'https://hub.prod.example.com',
        supportUrl: 'https://support.example.com/qq',
        purchaseUrl: 'https://pay.example.com/x',
        enableOpsTools: false,
      },
      null,
      2,
    )}\n`,
    'utf8',
  );
  const r = spawnSync(process.execPath, [join(scriptsDir, 'prepare-build-config.mjs'), 'prod'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const cfg = JSON.parse(readFileSync(join(dir, 'build-config.json'), 'utf8'));
  assert.equal(cfg.supportUrl, 'https://support.example.com/qq');
  assert.equal(cfg.purchaseUrl, 'https://pay.example.com/x');
});

test('prepare-build-config ops enables ops tools', () => {
  const dir = mkdtempSync(join(tmpdir(), 'relay-cfg-'));
  copyFileSync(
    join(desktopRoot, 'build-config.prod.example.json'),
    join(dir, 'build-config.prod.example.json'),
  );
  copyFileSync(
    join(desktopRoot, 'build-config.ops.example.json'),
    join(dir, 'build-config.ops.example.json'),
  );
  const r = spawnSync(process.execPath, [join(scriptsDir, 'prepare-build-config.mjs'), 'ops'], {
    cwd: dir,
    encoding: 'utf8',
  });
  assert.equal(r.status, 0);
  const cfg = JSON.parse(readFileSync(join(dir, 'build-config.json'), 'utf8'));
  assert.equal(cfg.enableOpsTools, true);
});
