import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_HUB_URL } from './build-config.js';

let packagedApp = false;

/** Set from Electron main after app ready (mirrors build-flags). */
export function setPackagedHubUrlMode(isPackaged: boolean): void {
  packagedApp = isPackaged;
}

/** Consumer Hub base URL: env override > user-config > build default. */
export function resolveHubBaseUrl(): string {
  const fromEnv = process.env.CURSOR_FREE_HUB_URL?.trim();
  if (fromEnv && !packagedApp) return fromEnv.replace(/\/$/, '');

  const userPath = join(homedir(), '.cursor-free', 'user-config.json');
  if (existsSync(userPath)) {
    try {
      const raw = readFileSync(userPath, 'utf8');
      const cfg = JSON.parse(raw) as { hubUrl?: string };
      const u = cfg.hubUrl?.trim();
      if (u) return u.replace(/\/$/, '');
    } catch {
      /* ignore invalid user config */
    }
  }

  return DEFAULT_HUB_URL.replace(/\/$/, '');
}
