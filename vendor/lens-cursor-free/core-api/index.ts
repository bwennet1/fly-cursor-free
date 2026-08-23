/** Public IPC-facing types only — no Hub client implementation. */

export type SwitchPhaseMessage = string;

export interface RelayCoreExports {
  runRelayStartup(): Promise<void>;
  onRelayBeforeQuit(): void;
  runRelayQuitRelease(): Promise<void>;
  getRelaySwitchInFlight(): boolean;
  setRelayMainWindow(win: unknown): void;
  getRelayMainWindow(): unknown;
  setRelayIsQuitting(v: boolean): void;
  getRelayIsQuitting(): boolean;
}
