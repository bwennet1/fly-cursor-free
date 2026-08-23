#!/usr/bin/env node
/** Prod release gate: real Hub URL, icons per platform, enableOpsTools false. */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateProdBuildConfig } from './build-config-placeholders.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
let channel = 'prod';
let platform = process.env.RELAY_DIST_PLATFORM?.trim() || (process.platform === 'darwin' ? 'mac' : 'win');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--channel' && args[i + 1]) channel = args[++i];
  else if (args[i] === '--platform' && args[i + 1]) platform = args[++i];
}

if (channel === 'ops' || channel === 'local') {
  console.log(`check-release-config: skip (${channel} channel)`);
  process.exit(0);
}

const path = join(root, 'build-config.json');
if (!existsSync(path)) {
  console.error(
    'check-release-config: missing build-config.json — create locally or inject BUILD_CONFIG_JSON in CI',
  );
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(path, 'utf8'));
const errors = [...validateProdBuildConfig(cfg, { requirePurchaseUrl: true })];

if (platform === 'mac') {
  const icns = join(root, 'resources', 'icon.icns');
  const png = join(root, 'resources', 'icon.png');
  if (!existsSync(icns) && !existsSync(png)) {
    errors.push('resources/icon.icns or resources/icon.png missing — run npm run icon');
  }
} else {
  const iconPath = join(root, 'resources', 'icon.ico');
  if (!existsSync(iconPath)) {
    errors.push('resources/icon.ico missing — run npm run icon');
  }
}

if (errors.length) {
  for (const e of errors) console.error(`check-release-config: ${e}`);
  process.exit(1);
}

console.log(`check-release-config: ok (hub=${cfg.defaultHubUrl}, platform=${platform})`);
