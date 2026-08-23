#!/usr/bin/env node
import { copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const distElectron = join(root, 'dist', 'electron');
mkdirSync(distElectron, { recursive: true });
copyFileSync(join(root, 'electron', 'preload.cjs'), join(distElectron, 'preload.cjs'));
console.log('copy-shell-assets: ok');
