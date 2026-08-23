import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Absolute path to the packaged turnstilePatch Chrome extension directory
 * (manifest.json + script.js). Resolution order:
 *
 * 1. `packages/auto-reg/resources/turnstilePatch` next to this module
 * 2. Same relative to `process.cwd()` (useful when the package is linked)
 *
 * Returns `undefined` when the directory is missing — callers then skip the
 * CDP screenX/screenY patch instead of crashing.
 */
export function resolveTurnstilePatchDir(
    fromDir: string = path.dirname(fileURLToPath(import.meta.url)),
    cwd: string = process.cwd(),
): string | undefined {
    const candidates = [
        path.resolve(fromDir, "../../resources/turnstilePatch"),
        path.resolve(cwd, "packages/auto-reg/resources/turnstilePatch"),
        path.resolve(cwd, "resources/turnstilePatch"),
    ];
    return candidates.find((candidate) => {
        return (
            existsSync(path.join(candidate, "manifest.json")) &&
            existsSync(path.join(candidate, "script.js"))
        );
    });
}

/** Absolute path to `script.js` inside the packaged patch, or undefined. */
export function resolveTurnstilePatchScript(
    fromDir?: string,
    cwd?: string,
): string | undefined {
    const dir = resolveTurnstilePatchDir(fromDir, cwd);
    if (!dir) return undefined;
    const script = path.join(dir, "script.js");
    return existsSync(script) ? script : undefined;
}
