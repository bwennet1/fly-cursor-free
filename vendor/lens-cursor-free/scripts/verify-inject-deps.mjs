#!/usr/bin/env node
/** After build — ensure inject-cli ESM dependency chain loads (no Cursor kill). */
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const daemon = join(root, 'dist', 'daemon');

const required = [
  'inject-cli.mjs',
  'cursor-paths.js',
  'profile-store.mjs',
  'cursor-process.mjs',
  'probed-auth-keys.json',
];

for (const f of required) {
  const p = join(daemon, f);
  if (!existsSync(p)) {
    console.error(`verify-inject-deps: missing ${p}`);
    process.exit(1);
  }
}

await import(new URL('../dist/daemon/cursor-paths.js', import.meta.url).href);
await import(new URL('../dist/daemon/profile-store.mjs', import.meta.url).href);
await import(new URL('../dist/daemon/cursor-process.mjs', import.meta.url).href);

console.log('verify-inject-deps: ok');
