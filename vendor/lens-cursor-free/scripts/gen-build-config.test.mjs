#!/usr/bin/env node
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'shared', 'build-config.ts'), 'utf8');

assert.match(src, /export const ENABLE_OPS_TOOLS = false/);
assert.match(src, /export const PRODUCT_DISPLAY_NAME = "Relay"/);
console.log('gen-build-config.test: OK');
