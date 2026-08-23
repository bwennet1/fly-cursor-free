import { ENABLE_OPS_TOOLS } from './build-config.js';

let packagedApp = false;

/** Set from Electron main after app is ready (shared must not import electron). */
export function setPackagedApp(isPackaged: boolean): void {
  packagedApp = isPackaged;
}

/** Consumer ops UI + import IPC; env overrides build-config.json (not when packaged). */
export function resolveEnableOpsTools(): boolean {
  if (packagedApp && process.env.ENABLE_OPS_TOOLS?.trim() === '1') {
    return false;
  }
  const raw = process.env.ENABLE_OPS_TOOLS?.trim();
  if (raw === '1') return true;
  if (raw === '0') return false;
  return ENABLE_OPS_TOOLS;
}
