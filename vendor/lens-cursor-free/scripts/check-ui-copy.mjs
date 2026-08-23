#!/usr/bin/env node
/** L1/L2 forbidden terms scan for consumer-visible Relay copy. */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const forbidden = [
  'Cursor-Free',
  'Cursor Free',
  'Cursor Relay',
  'captured',
  'Captured Bundle',
  'HUB_ADMIN',
  'unlock',
  'Unlock',
  'Bypass',
  '破解',
];

const allowCursorAsTarget = (text) => {
  if (!text.includes('Cursor')) return true;
  return /本机\s*Cursor|Cursor\s*切换|打开\s*Cursor|重启\s*Cursor/.test(text);
};

function scanFile(path) {
  const text = readFileSync(path, 'utf8');
  const hits = [];
  for (const term of forbidden) {
    if (text.includes(term)) hits.push(term);
  }
  if (text.includes('Cursor') && !allowCursorAsTarget(text)) {
    hits.push('Cursor (not as target software)');
  }
  return hits;
}

const uiDir = join(root, 'ui');
const files = ['index.html', join(uiDir, 'messages.zh.mjs')].filter((f) => {
  try {
    readFileSync(f);
    return true;
  } catch {
    return false;
  }
});

let failed = false;
for (const f of files) {
  const hits = scanFile(f);
  if (hits.length) {
    console.error(`FAIL ${f}:`, hits.join(', '));
    failed = true;
  }
}

if (failed) process.exit(1);
console.log('check-ui-copy: OK');
