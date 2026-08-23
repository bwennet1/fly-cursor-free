#!/usr/bin/env node
/**
 * Production dist: requires real build-config.json (or CI BUILD_CONFIG_JSON already written).
 * Usage: node scripts/run-dist-prod.mjs [--win|--mac] [--dir]
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const argv = process.argv.slice(2);
const dirOnly = argv.includes('--dir');
const platform =
  (argv.includes('--mac') && 'mac') ||
  (argv.includes('--win') && 'win') ||
  process.env.RELAY_DIST_PLATFORM?.trim() ||
  (process.platform === 'darwin' ? 'mac' : 'win');

function run(cmd, args, env = process.env) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    env,
    encoding: 'utf8',
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

function readOutputDir() {
  const flag = join(root, '.dist-output-dir');
  if (existsSync(flag)) {
    const line = readFileSync(flag, 'utf8').trim();
    if (line) return line;
  }
  return 'release';
}

process.env.RELAY_REQUIRE_BUILD_CONFIG = '1';

run('node', ['scripts/validate-build-config.mjs', '--require-purchase']);
run('node', ['scripts/pre-dist-clean.mjs']);
const outputDir = readOutputDir();
run('node', ['scripts/check-release-config.mjs', '--platform', platform]);
run('node', ['scripts/require-local-core.mjs']);
run('npm', ['run', 'build']);

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const ebArgs = ['--publish', 'never', `-c.directories.output=${outputDir}`];
if (dirOnly) ebArgs.unshift('--dir');
if (platform === 'win') {
  ebArgs.unshift('--win', '--x64');
} else {
  const macArch = process.env.RELAY_MAC_ARCH?.trim() || 'arm64';
  const archFlag = macArch === 'x64' ? '--x64' : '--arm64';
  console.log(`run-dist-prod: mac electron-builder ${archFlag} (dmg only)`);
  ebArgs.unshift('--mac', archFlag);
}

run(
  npx,
  ['electron-builder', ...ebArgs],
  { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' },
);

run('node', ['scripts/verify-packaged-daemon.mjs', '--platform', platform]);
if (!dirOnly) {
  run('node', ['scripts/report-installer-size.mjs', outputDir, '--platform', platform]);
}
