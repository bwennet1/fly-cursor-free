#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const coreMain = join(root, 'node_modules', '@relay', 'core', 'dist', 'src', 'register-relay-core.js');
const stub = join(root, 'packages', 'core-stub', 'index.js');

if (!existsSync(coreMain)) {
  console.error('require-local-core: missing built @relay/core — run npm run link:core');
  process.exit(1);
}

const pkgPath = join(root, 'node_modules', '@relay', 'core', 'package.json');
if (existsSync(pkgPath)) {
  const p = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (p.description?.includes('Stub')) {
    console.error('require-local-core: @relay/core is still stub — run npm run link:core');
    process.exit(1);
  }
}

console.log('require-local-core: ok');
