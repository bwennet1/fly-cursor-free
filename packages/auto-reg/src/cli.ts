#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { applyOverrides, loadConfig, resolveVaultPassword } from "./config.ts";
import { checkNodeVersion } from "./node-version.ts";
import { runRegister } from "./pipeline.ts";
import type { AutoRegConfig, OutputConfig, PipelineEvent, RegisterResult } from "./types.js";

interface CliArgs {
    command?: string;
    configPath?: string;
    count?: number;
    dryRun: boolean;
    headed: boolean;
    headless: boolean;
    help: boolean;
    unknown: string[];
}

const DEFAULT_CONFIG_RELATIVE = path.join("examples", "config.example.json");

async function main(argv: string[]): Promise<void> {
    const nodeIssue = checkNodeVersion();
    if (nodeIssue) {
        console.error(`auto-reg: ${nodeIssue}`);
        process.exitCode = 1;
        return;
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

    config = applyOverrides(config, args);

    // Fail fast when the vault passphrase is missing. Dry runs without a
    // passphrase already had encrypt switched off by applyOverrides, so this
    // only trips for live runs. The passphrase is only checked here — it is
    // never printed and never passed through stdout.
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
 * Progress line printed per pipeline event. Only the stage name is echoed —
 * never the free-form message, which may originate from the engine and could
 * contain a verification code or session token.
 */
function onEvent(e: PipelineEvent): void {
    process.stderr.write(`  · ${e.stage}\n`);
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
}

function resolveDefaultConfigPath(): string | undefined {
    const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
    const candidates = [
        path.join(packageRoot, DEFAULT_CONFIG_RELATIVE),
        path.join(process.cwd(), DEFAULT_CONFIG_RELATIVE),
    ];
    return candidates.find((candidate) => existsSync(candidate));
}

function parseArgs(argv: string[]): CliArgs {
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
            "                    Without a vault passphrase set, output encryption is",
            "                    disabled automatically so dry runs need no secrets.",
            "  --headed          Run the browser engine headed (visible) instead of headless.",
            "  --headless        Force headless. Live registers default to headed because the",
            "                    Turnstile challenge needs a human in a visible window.",
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

main(process.argv.slice(2)).catch((err) => {
    console.error(`auto-reg: ${errMessage(err)}`);
    process.exitCode = 1;
});
