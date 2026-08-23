#!/usr/bin/env node
/** link:core + build. Runs `npm ci` only if deps missing — never re-ci after link (stub would win). */
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(args, opts = {}) {
  const r = spawnSync(npm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

if (!existsSync(join(root, 'node_modules', 'typescript', 'package.json'))) {
  run(['ci']);
}
run(['run', 'link:core']);
run(['run', 'build']);
