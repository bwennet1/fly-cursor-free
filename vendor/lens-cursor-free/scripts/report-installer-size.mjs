#!/usr/bin/env node
/** Print installer artifact size after dist (win: exe, mac: dmg). */
import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
let outputName = 'release';
let platform = process.env.RELAY_DIST_PLATFORM?.trim() || (process.platform === 'darwin' ? 'mac' : 'win');

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--platform' && args[i + 1]) {
    platform = args[++i];
  } else if (!args[i].startsWith('--')) {
    outputName = args[i];
  }
}

const releaseDir = join(process.cwd(), outputName);
let files = [];
try {
  const all = readdirSync(releaseDir);
  if (platform === 'mac') {
    files = all.filter((f) => f.endsWith('.dmg') && f.startsWith('Relay-'));
  } else {
    files = all.filter((f) => f.endsWith('.exe') && f.includes('Setup'));
  }
} catch {
  console.error(`report-installer-size: no ${outputName}/ folder — run dist first`);
  process.exit(1);
}

if (!files.length) {
  console.error(
    `report-installer-size: no ${platform === 'mac' ? 'Relay-*.dmg' : 'Relay-Setup-*.exe'} in ${outputName}/`,
  );
  process.exit(1);
}

for (const f of files.sort()) {
  const bytes = statSync(join(releaseDir, f)).size;
  const mb = (bytes / (1024 * 1024)).toFixed(1);
  console.log(`${f}: ${mb} MB (${bytes} bytes)`);
}

if (platform === 'win') {
  const unpacked = join(releaseDir, 'win-unpacked');
  try {
    const walk = (dir) => {
      let total = 0;
      for (const ent of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, ent.name);
        if (ent.isDirectory()) total += walk(p);
        else total += statSync(p).size;
      }
      return total;
    };
    const u = walk(unpacked);
    console.log(`win-unpacked/ (do NOT ship): ${(u / (1024 * 1024)).toFixed(1)} MB`);
  } catch {
    /* optional */
  }
}
