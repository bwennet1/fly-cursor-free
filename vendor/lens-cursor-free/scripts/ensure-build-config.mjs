#!/usr/bin/env node
/** Ensure build-config.json exists (from *.example.json); never commit the result. */
import { copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const dest = join(root, 'build-config.json');

if (!existsSync(dest)) {
  if (process.env.RELAY_REQUIRE_BUILD_CONFIG === '1') {
    console.error(
      'ensure-build-config: missing build-config.json — add your production config (gitignored) or set BUILD_CONFIG_JSON in CI',
    );
    process.exit(1);
  }
  const channel = process.env.RELAY_BUILD_CHANNEL?.trim() || 'local';
  const sources = {
    prod: 'build-config.prod.example.json',
    ops: 'build-config.ops.example.json',
    local: 'build-config.local.example.json',
  };
  const srcName = sources[channel] ?? sources.local;
  const src = join(root, srcName);
  if (!existsSync(src)) {
    console.error(`ensure-build-config: missing ${srcName}`);
    process.exit(1);
  }
  copyFileSync(src, dest);
  console.log(`ensure-build-config: ${srcName} → build-config.json`);
}
