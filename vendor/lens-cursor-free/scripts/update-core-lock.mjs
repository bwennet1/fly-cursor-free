#!/usr/bin/env node
/** Write core.lock.json from lens-cursor-free-core HEAD (or RELAY_CORE_PATH). */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const corePath = resolve(
  process.env.RELAY_CORE_PATH || join(root, '..', 'lens-cursor-free-core'),
);

const rev = spawnSync('git', ['rev-parse', 'HEAD'], {
  cwd: corePath,
  encoding: 'utf8',
});
if (rev.status !== 0) {
  console.error('update-core-lock: git rev-parse failed in', corePath);
  process.exit(1);
}

const corePkg = JSON.parse(readFileSync(join(corePath, 'package.json'), 'utf8'));
const shellPkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

const lock = {
  coreRepository: 'lens68/lens-cursor-free-core',
  coreRef: rev.stdout.trim(),
  coreVersion: corePkg.version,
  shellVersion: shellPkg.version,
  lockedAt: new Date().toISOString().slice(0, 10),
};

writeFileSync(join(root, 'core.lock.json'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');
console.log('wrote core.lock.json', lock.coreRef.slice(0, 8));
