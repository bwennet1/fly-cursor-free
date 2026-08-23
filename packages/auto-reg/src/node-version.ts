/**
 * The CLI runs `.ts` sources directly via Node's type stripping, which only
 * exists on Node 22+. On older runtimes the failure mode is a confusing
 * ERR_UNKNOWN_FILE_EXTENSION, so the CLI checks up front and prints an
 * actionable message instead.
 */
export const MIN_NODE_MAJOR = 22;

/**
 * Returns an error message when `version` (e.g. "20.11.1" or "v20.11.1") is
 * older than `minMajor` or unparseable, and undefined when the runtime is
 * acceptable. Pure so tests can exercise it without changing the runtime.
 */
export function checkNodeVersion(
    version: string = process.versions.node,
    minMajor: number = MIN_NODE_MAJOR,
): string | undefined {
    const match = /^v?(\d+)(?:\.|$)/.exec(version.trim());
    if (!match) {
        return `auto-reg requires Node ${minMajor}+ but could not parse the runtime version "${version}"`;
    }
    const major = Number(match[1]);
    if (major < minMajor) {
        return (
            `auto-reg requires Node ${minMajor}+ (found ${version}); ` +
            "the CLI runs TypeScript sources via type stripping, which older runtimes lack"
        );
    }
    return undefined;
}
