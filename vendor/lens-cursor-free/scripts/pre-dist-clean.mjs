#!/usr/bin/env node
/** Release build: stop Relay/Electron, free or quarantine release/ (Windows file locks). */
import {
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { basename, join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const OUTPUT_FLAG = join(root, '.dist-output-dir');

function killWindowsProcesses() {
  if (process.platform !== 'win32') return;
  for (const name of ['Relay.exe', 'electron.exe']) {
    const r = spawnSync('taskkill', ['/IM', name, '/F'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (r.status === 0) {
      console.log(`pre-dist-clean: stopped ${name}`);
    }
  }
}

function tryCmdRmdir(dir) {
  if (process.platform !== 'win32') return false;
  const r = spawnSync('cmd', ['/c', 'rmdir', '/s', '/q', dir], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return r.status === 0 && !existsSync(dir);
}

function tryRemoveDir(dir) {
  if (!existsSync(dir)) return true;
  try {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 600 });
    return !existsSync(dir);
  } catch {
    return false;
  }
}

function tryQuarantine(dir) {
  if (!existsSync(dir)) return true;
  const dest = join(root, `${basename(dir)}.locked.${Date.now()}`);
  try {
    renameSync(dir, dest);
    console.log(`pre-dist-clean: moved locked ${basename(dir)} → ${basename(dest)}`);
    return true;
  } catch {
    return false;
  }
}

function prepareOutputDir(name) {
  const dir = join(root, name);
  if (tryRemoveDir(dir)) {
    console.log(`pre-dist-clean: cleared ${name}/`);
    return name;
  }
  if (tryCmdRmdir(dir)) {
    console.log(`pre-dist-clean: cleared ${name}/ (cmd rmdir)`);
    return name;
  }
  if (tryQuarantine(dir)) {
    return name;
  }
  return null;
}

killWindowsProcesses();

let outputDir = prepareOutputDir('release');
if (!outputDir) {
  outputDir = prepareOutputDir('release-out') ?? 'release-out';
  mkdirSync(join(root, outputDir), { recursive: true });
  console.warn(
    `pre-dist-clean: release/ is locked — building into ${outputDir}/ instead.\n` +
      'After build, delete or rename release.locked.* folders when nothing holds them.',
  );
}

writeFileSync(OUTPUT_FLAG, `${outputDir}\n`, 'utf8');
console.log(`pre-dist-clean: electron-builder output → ${outputDir}/`);
