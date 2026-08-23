#!/usr/bin/env node
/** After dist — inject runtime lives in resources/daemon/ (extraResources). */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGED_DAEMON_FILES } from './packaged-daemon-files.mjs';

const root = process.cwd();
const args = process.argv.slice(2);
let platform = process.env.RELAY_DIST_PLATFORM?.trim();
if (!platform) {
  const pi = args.indexOf('--platform');
  if (pi >= 0 && args[pi + 1]) platform = args[pi + 1];
}
if (!platform) {
  platform =
    (args.includes('--mac') && 'mac') ||
    (args.includes('--win') && 'win') ||
    (process.platform === 'darwin' ? 'mac' : 'win');
}

const macArch = process.env.RELAY_MAC_ARCH?.trim();

const outputFlag = join(root, '.dist-output-dir');
let outputDir = 'release';
if (existsSync(outputFlag)) {
  outputDir = readFileSync(outputFlag, 'utf8').trim() || outputDir;
}

let unpackedRoot;
let appBinary;
if (platform === 'mac') {
  const candidates = [
    macArch === 'arm64' ? join(root, outputDir, 'mac-arm64') : join(root, outputDir, 'mac'),
    join(root, outputDir, 'mac-arm64'),
    join(root, outputDir, 'mac'),
  ];
  unpackedRoot = candidates.find((p) => existsSync(join(p, 'Relay.app'))) ?? candidates[0];
  appBinary = join(unpackedRoot, 'Relay.app');
} else {
  unpackedRoot = join(root, outputDir, 'win-unpacked');
  appBinary = join(unpackedRoot, 'Relay.exe');
}

if (!existsSync(appBinary)) {
  console.error(
    `verify-packaged-daemon: missing ${appBinary} — run npm run dist:prod first`,
  );
  process.exit(1);
}

const daemonDir =
  platform === 'mac'
    ? join(appBinary, 'Contents', 'Resources', 'daemon')
    : join(unpackedRoot, 'resources', 'daemon');

const legacyUnpacked =
  platform === 'win' ? join(unpackedRoot, 'resources', 'app.asar.unpacked') : null;
if (legacyUnpacked && existsSync(legacyUnpacked)) {
  console.error(
    'verify-packaged-daemon: app.asar.unpacked should not exist — remove asarUnpack and rebuild',
  );
  process.exit(1);
}

if (!existsSync(daemonDir)) {
  console.error(`verify-packaged-daemon: missing ${daemonDir}`);
  process.exit(1);
}

for (const file of PACKAGED_DAEMON_FILES) {
  const path = join(daemonDir, file);
  if (!existsSync(path)) {
    console.error(`verify-packaged-daemon: missing daemon/${file}`);
    process.exit(1);
  }
  console.log(`verify-packaged-daemon: ok ${file}`);
}
