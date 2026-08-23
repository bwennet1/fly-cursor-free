#!/usr/bin/env node
/** CI: materialize build-config.json from BUILD_CONFIG_JSON secret. */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateProdBuildConfig } from './build-config-placeholders.mjs';

const raw = process.env.BUILD_CONFIG_JSON;
if (!raw?.trim()) {
  console.error('BUILD_CONFIG_JSON secret is required for release build');
  process.exit(1);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch {
  console.error('BUILD_CONFIG_JSON must be valid JSON');
  process.exit(1);
}

const errors = validateProdBuildConfig(parsed, { requirePurchaseUrl: true });
if (errors.length) {
  for (const e of errors) console.error(`write-build-config-from-secret: ${e}`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
writeFileSync(join(root, 'build-config.json'), `${JSON.stringify(parsed, null, 2)}\n`, 'utf8');
console.log(`write-build-config-from-secret: ok (hub=${parsed.defaultHubUrl})`);
