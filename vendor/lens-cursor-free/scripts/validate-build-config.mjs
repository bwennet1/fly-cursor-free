#!/usr/bin/env node
/** Fail if build-config.json is missing or still uses template placeholders (prod). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProdBuildConfig } from './build-config-placeholders.mjs';

const root = process.cwd();
const path = join(root, 'build-config.json');
const requirePurchase = process.argv.includes('--require-purchase');

if (!existsSync(path)) {
  console.error(
    'validate-build-config: missing build-config.json — create it locally (gitignored) or inject BUILD_CONFIG_JSON in CI',
  );
  process.exit(1);
}

let cfg;
try {
  cfg = JSON.parse(readFileSync(path, 'utf8'));
} catch {
  console.error('validate-build-config: build-config.json is not valid JSON');
  process.exit(1);
}

const errors = validateProdBuildConfig(cfg, { requirePurchaseUrl: requirePurchase });
if (errors.length) {
  for (const e of errors) console.error(`validate-build-config: ${e}`);
  process.exit(1);
}

console.log(`validate-build-config: ok (hub=${cfg.defaultHubUrl})`);
