import process from "node:process";

/**
 * Minimum supported Node major version (matches package.json "engines"). The
 * CLI runs `.ts` sources via Node's type stripping, which only exists on
 * Node 22+; on older runtimes the failure mode is a confusing
 * ERR_UNKNOWN_FILE_EXTENSION, so the CLI checks up front instead.
 */
export const MIN_NODE_MAJOR = 22;

/**
 * Verifies the running Node major version meets {@link MIN_NODE_MAJOR}. Kept
 * pure (takes the version string) so it is testable; the CLI's main() passes
 * process.version and exits 1 on failure. Unparseable versions are rejected
 * rather than waved through.
 */
export function checkNodeVersion(version: string = process.version): { ok: boolean; message?: string } {
    const major = Number.parseInt(version.replace(/^v/, ""), 10);
    if (!Number.isFinite(major) || major < MIN_NODE_MAJOR) {
        return {
            ok: false,
            message:
                `auto-reg: 需要 Node ${MIN_NODE_MAJOR} 或更高版本，当前为 ${version}。` +
                `请升级 Node 后重试（例如 nvm install ${MIN_NODE_MAJOR}）。`,
        };
    }
    return { ok: true };
}
