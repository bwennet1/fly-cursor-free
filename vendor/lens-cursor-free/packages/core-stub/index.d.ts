/** Minimal types for open-repo CI / UI-only builds (real types ship in @relay/core dist). */
import type { BrowserWindow } from 'electron';

export function runRelayStartup(): Promise<void>;
export function onRelayBeforeQuit(): void;
export function runRelayQuitRelease(): Promise<void>;
export function getRelaySwitchInFlight(): boolean;
export function setRelayMainWindow(win: BrowserWindow | null): void;
export function getRelayMainWindow(): BrowserWindow | null;
export function setRelayIsQuitting(value: boolean): void;
export function getRelayIsQuitting(): boolean;
