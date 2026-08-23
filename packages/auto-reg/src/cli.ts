#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, pathToFileURL } from "node:url";

import { ENV_KEYS, loadConfig, resolveVaultPassword } from "./config.ts";
import { runRegister } from "./pipeline.ts";
import type { AutoRegConfig, OutputConfig, PipelineEvent, RegisterResult } from "./types.js";

export interface CliArgs {
    command?: string;
    configPath?: string;
    count?: number;
    dryRun: boolean;
    headed: boolean;
    headless: boolean;
    help: boolean;
    unknown: string[];
}

/** Minimum supported Node major version (matches package.json "engines"). */
const MIN_NODE_MAJOR = 22;

const DEFAULT_CONFIG_RELATIVE = path.join("examples", "config.example.json");

async function main(argv: string[]): Promise<void> {
    const node = checkNodeVersion(process.version);
    if (!node.ok) {
        console.error(node.message);
        process.exit(1);
    }

    const args = parseArgs(argv);

    if (args.help) {
        printUsage();
        return;
    }

    if (args.command === undefined) {
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (args.command !== "register") {
        console.error(`auto-reg: unknown command "${args.command}"`);
        printUsage();
        process.exitCode = 1;
        return;
    }

    if (args.unknown.length > 0) {
        console.error(`auto-reg: unknown option(s): ${args.unknown.join(", ")}`);
        printUsage();
        process.exitCode = 1;
        return;
    }

    const configPath = args.configPath ?? resolveDefaultConfigPath();
    if (!configPath) {
        console.error(
            `auto-reg: no --config given and ${DEFAULT_CONFIG_RELATIVE} was not found ` +
                "(looked relative to the package root and the current directory).",
        );
        process.exitCode = 1;
        return;
    }
    if (!existsSync(configPath)) {
        console.error(`auto-reg: config file not found: ${configPath}`);
        process.exitCode = 1;
        return;
    }

    let config: AutoRegConfig;
    try {
        config = await loadConfig(configPath);
    } catch (err) {
        console.error(`auto-reg: failed to load config: ${errMessage(err)}`);
        process.exitCode = 1;
        return;
    }

    const overridden = applyOverrides(config, args);
    config = overridden.config;
    for (const warning of overridden.warnings) {
        console.error(`auto-reg: ${warning}`);
    }

    // A real run with encryption still requires a passphrase and fails fast
    // when it is missing. Dry runs no longer reach here with encryption on:
    // applyOverrides drops output.encrypt for a passphrase-less dry run (with a
    // warning) so it can proceed writing plaintext. The passphrase is only
    // checked here — it is never printed and never passed through stdout.
    try {
        resolveVaultPassword(config);
    } catch (err) {
        console.error(`auto-reg: ${errMessage(err)}`);
        process.exitCode = 1;
        return;
    }

    console.log(
        `auto-reg register  count=${config.count}  dry-run=${config.dryRun}  headed=${config.headed}`,
    );

    const results = await runRegister(config, onEvent);
    printSummary(results, config.output);

    const succeeded = results.filter((r) => r.ok).length;
    if (results.length > 0 && succeeded === 0) {
        process.exitCode = 1;
    }
}

/**
 * Progress line printed per pipeline event: `· <stage>  <safe message>`. The
 * free-form message may originate from the engine and could carry a
 * verification code or session token, so it is scrubbed by sanitizeMessage
 * before it ever reaches the terminal.
 */
function onEvent(e: PipelineEvent): void {
    const safe = sanitizeMessage(e.message);
    process.stderr.write(safe ? `  · ${e.stage}  ${safe}\n` : `  · ${e.stage}\n`);
}

/**
 * Redacts secrets from a progress message so it is safe to print. Removes:
 *   - JWT-shaped tokens (three base64url segments joined by dots)
 *   - the value after a `password:`/`password=` marker
 *   - long token-ish runs (session tokens, API keys, hashes; 20+ chars)
 *   - standalone 6-digit verification codes
 * Email addresses survive because their digits/letters are embedded next to
 * `@`/`.`/`-`, which the code and long-token patterns explicitly exclude.
 */
export function sanitizeMessage(message: string): string {
    return message
        .replace(/\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, "[redacted]")
        .replace(/(password\s*[:=]\s*)(\S+)/gi, "$1[redacted]")
        .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "[redacted]")
        .replace(/(?<![\w@.\-])\d{6}(?![\w@.\-])/g, "[redacted]");
}

/**
 * Verifies the running Node major version meets {@link MIN_NODE_MAJOR}. Kept
 * pure (takes the version string) so it is testable; main() passes
 * process.version and exits 1 on failure.
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

/**
 * Per-account lines only ever echo the email, status and stage — never the
 * password, session token or vault passphrase, regardless of encryption mode.
 */
function printSummary(results: RegisterResult[], output: OutputConfig): void {
    const succeeded = results.filter((r) => r.ok).length;
    console.log("");
    for (const r of results) {
        const status = r.ok ? "ok" : "FAILED";
        const email = r.identity.email || "(no email)";
        console.log(`  ${email}  ${status}  stage=${r.stage}`);
    }
    console.log("");
    console.log(`${succeeded}/${results.length} succeeded`);
    if (succeeded > 0) {
        console.log(
            output.encrypt
                ? `已写入加密账号库: ${output.accountsPath}`
                : `accounts written to ${output.accountsPath}`,
        );
    }
    const failed = results.length - succeeded;
    if (failed > 0 && output.persistFailures !== false) {
        console.log(`失败记录已写入 ${output.accountsPath}（不含密码 / token）`);
    }
}

export interface ResolvedOverrides {
    config: AutoRegConfig;
    /** User-facing notices to print to stderr (headed/encryption adjustments). */
    warnings: string[];
}

/**
 * Applies CLI overrides on top of the loaded config and resolves two runtime
 * safeguards:
 *   - A real registration (not --dry-run) defaults to headed so the browser
 *     can load the turnstilePatch extension and a human can clear challenges.
 *     Pass --headless to force headless anyway.
 *   - A --dry-run without AUTO_REG_VAULT_PASSWORD does not hard-fail: encryption
 *     is turned off for this run (plaintext, no secrets written to the vault)
 *     with a warning to set the passphrase before a real run.
 */
export function applyOverrides(
    config: AutoRegConfig,
    args: CliArgs,
    env: Record<string, string | undefined> = process.env,
): ResolvedOverrides {
    const warnings: string[] = [];
    const dryRun = args.dryRun ? true : config.dryRun;

    let headed = config.headed;
    if (!dryRun && !args.headed && !args.headless) {
        headed = true;
        warnings.push("真实注册已自动改为 headed，以便加载扩展并人工过人机");
    } else if (args.headless) {
        headed = false;
    } else if (args.headed) {
        headed = true;
    }

    let output = config.output;
    if (dryRun && output.encrypt && !env[ENV_KEYS.vaultPassword]) {
        output = { ...output, encrypt: false };
        warnings.push(
            "dry-run 未设口令，本次明文不落敏感库；正式跑请设 AUTO_REG_VAULT_PASSWORD",
        );
    }

    return {
        config: {
            ...config,
            count: args.count ?? config.count,
            dryRun,
            headed,
            output,
        },
        warnings,
    };
}

function resolveDefaultConfigPath(): string | undefined {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const candidates = [
        path.join(packageRoot, DEFAULT_CONFIG_RELATIVE),
        path.join(process.cwd(), DEFAULT_CONFIG_RELATIVE),
    ];
    return candidates.find((candidate) => existsSync(candidate));
}

export function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = { dryRun: false, headed: false, headless: false, help: false, unknown: [] };
    const tokens = normalizeArgv(argv);

    while (tokens.length > 0) {
        const token = tokens.shift() as string;
        switch (token) {
            case "-h":
            case "--help":
                args.help = true;
                break;
            case "--config":
                args.configPath = tokens.shift();
                break;
            case "--count": {
                const raw = tokens.shift();
                const value = Number(raw);
                if (raw === undefined || !Number.isFinite(value)) {
                    args.unknown.push(`--count ${raw ?? ""}`.trim());
                } else {
                    args.count = Math.max(0, Math.floor(value));
                }
                break;
            }
            case "--dry-run":
                args.dryRun = true;
                break;
            case "--headed":
                args.headed = true;
                break;
            case "--headless":
                args.headless = true;
                break;
            default:
                if (token.startsWith("-")) {
                    args.unknown.push(token);
                } else if (args.command === undefined) {
                    args.command = token;
                } else {
                    args.unknown.push(token);
                }
        }
    }

    return args;
}

/** Expands `--key=value` into `--key value` so the parser can stay simple. */
function normalizeArgv(argv: string[]): string[] {
    const out: string[] = [];
    for (const token of argv) {
        if (token.startsWith("--") && token.includes("=")) {
            const eq = token.indexOf("=");
            out.push(token.slice(0, eq), token.slice(eq + 1));
        } else {
            out.push(token);
        }
    }
    return out;
}

function printUsage(): void {
    console.log(
        [
            "auto-reg — clean-room Cursor signup orchestrator",
            "",
            "Usage:",
            "  auto-reg register [options]",
            "",
            "Options:",
            "  --config <path>   Path to a JSON config file.",
            `                    Defaults to ${DEFAULT_CONFIG_RELATIVE} (package root or cwd).`,
            "  --count <n>       Number of accounts to register (overrides config).",
            "  --dry-run         Run without launching a real browser / mutating state.",
            "                    Without AUTO_REG_VAULT_PASSWORD a dry run writes plaintext.",
            "  --headed          Run the browser engine headed (visible) instead of headless.",
            "  --headless        Force headless. Real runs default to headed so the",
            "                    turnstilePatch extension loads and a human can pass the challenge.",
            "  -h, --help        Show this help.",
            "",
            "Registering accounts in bulk usually violates Cursor's Terms of Service.",
            "Use only against your own domains and accounts. See README.md.",
        ].join("\n"),
    );
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/** True when this module is the process entry point (not imported by a test). */
function invokedAsScript(): boolean {
    const entry = process.argv[1];
    return typeof entry === "string" && import.meta.url === pathToFileURL(entry).href;
}

if (invokedAsScript()) {
    main(process.argv.slice(2)).catch((err) => {
        console.error(`auto-reg: ${errMessage(err)}`);
        process.exitCode = 1;
    });
}
