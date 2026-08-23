import type { AutoRegConfig, RegisterEngine } from "../types.js";
import { createBrowserEngine } from "./browser.ts";
import { createDryRunEngine } from "./dry-run.ts";

export { BrowserEngine, createBrowserEngine } from "./browser.ts";
export { DryRunEngine, createDryRunEngine } from "./dry-run.ts";

/**
 * Selects the registration engine for a run: the offline {@link DryRunEngine}
 * when `config.dryRun` is set, otherwise the Playwright-backed
 * {@link BrowserEngine}. Constructing the browser engine does not load
 * Playwright — that happens lazily when `register()` is first called.
 */
export function createEngine(config: AutoRegConfig): RegisterEngine {
    return config.dryRun ? createDryRunEngine() : createBrowserEngine();
}
