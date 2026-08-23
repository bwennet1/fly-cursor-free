#!/usr/bin/env node
/** @deprecated Use `npm run dist:win` → scripts/run-dist-prod.mjs */
import { spawnSync } from 'node:child_process';

const r = spawnSync(process.execPath, ['scripts/run-dist-prod.mjs', '--win'], {
  cwd: process.cwd(),
  stdio: 'inherit',
});
process.exit(r.status ?? 1);
