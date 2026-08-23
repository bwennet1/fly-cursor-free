import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

test('getInjectCliPath uses resources/daemon when RELAY_RESOURCES_PATH is set', async () => {
  const { getInjectCliPath } = await import('../dist/daemon/cursor-paths.js');
  const resources = join(tmpdir(), `relay-resources-${Date.now()}`);
  const daemonDir = join(resources, 'daemon');
  mkdirSync(daemonDir, { recursive: true });
  const injectPath = join(daemonDir, 'inject-cli.mjs');
  writeFileSync(injectPath, '// stub\n', 'utf8');

  const prev = process.env.RELAY_RESOURCES_PATH;
  process.env.RELAY_RESOURCES_PATH = resources;
  try {
    assert.equal(getInjectCliPath(), injectPath);
  } finally {
    if (prev === undefined) delete process.env.RELAY_RESOURCES_PATH;
    else process.env.RELAY_RESOURCES_PATH = prev;
  }
});

test('resolveAppAssetPath maps legacy app.asar.unpacked when present', async () => {
  const { resolveAppAssetPath } = await import('../dist/daemon/cursor-paths.js');
  const base = join(
    tmpdir(),
    `relay-asar-test-${Date.now()}`,
    'resources',
    'app.asar.unpacked',
    'dist',
    'daemon',
  );
  mkdirSync(base, { recursive: true });
  const injectPath = join(base, 'inject-cli.mjs');
  writeFileSync(injectPath, '// stub\n', 'utf8');

  const asarPath = injectPath.replace('app.asar.unpacked', 'app.asar');
  assert.ok(!existsSync(asarPath));
  assert.equal(resolveAppAssetPath(asarPath), injectPath);
});
