import type { AutoRegConfig, RegisterEngine } from "../types.js";
import { createBrowserEngine } from "./browser.ts";
import { createDryRunEngine } from "./dry-run.ts";

export { BrowserEngine, createBrowserEngine } from "./browser.ts";
export { DryRunEngine, createDryRunEngine } from "./dry-run.ts";

/**
 * Selects the registration engine for a run: the offline {@link DryRunEngine}
 * when `config.dryRun` is set, otherwise the Playwright-backed
 * {@link BrowserEngine}. Playwright is a regular dependency of this package,
 * but constructing the browser engine does not load it — that happens lazily
 * when `register()` is first called. The Chromium binaries are a separate,
 * one-time download: `npx playwright install chromium`.
 */
export function createEngine(config: AutoRegConfig): RegisterEngine {
    return config.dryRun ? createDryRunEngine() : createBrowserEngine();
}
