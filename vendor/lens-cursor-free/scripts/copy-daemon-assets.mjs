#!/usr/bin/env node
/** Copy daemon + preload assets into dist/ for runtime and electron-builder. */
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const daemonFiles = [
  'inject-cli.mjs',
  'cursor-process.mjs',
  'profile-store.mjs',
  'import-captured.mjs',
  'import-captured-cli.mjs',
  'probed-cache-keys.json',
  'probed-auth-keys.json',
];

const distDaemon = join(root, 'dist', 'daemon');
mkdirSync(distDaemon, { recursive: true });
for (const f of daemonFiles) {
  copyFileSync(join(root, 'daemon', f), join(distDaemon, f));
}
copyFileSync(
  join(root, 'daemon', 'cursor-paths.dist.mjs'),
  join(distDaemon, 'cursor-paths.mjs'),
);
mkdirSync(join(root, 'dist', 'electron'), { recursive: true });
copyFileSync(
  join(root, 'electron', 'preload.cjs'),
  join(root, 'dist', 'electron', 'preload.cjs'),
);
/** profile-store.mjs / tests import ./cursor-paths.js from daemon/ source dir */
copyFileSync(join(distDaemon, 'cursor-paths.js'), join(root, 'daemon', 'cursor-paths.js'));
console.log('copy-daemon-assets: ok');
