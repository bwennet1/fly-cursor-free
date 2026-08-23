#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { loadConfig, resolveVaultPassword } from "./config.ts";
import { runRegister } from "./pipeline.ts";
import type { AutoRegConfig, PipelineEvent, RegisterResult } from "./types.js";

interface CliArgs {
    command?: string;
    configPath?: string;
    count?: number;
    dryRun: boolean;
    headed: boolean;
    help: boolean;
    unknown: string[];
}

const DEFAULT_CONFIG_RELATIVE = path.join("examples", "config.example.json");

async function main(argv: string[]): Promise<void> {
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

    // Fail fast when the vault passphrase is missing (applies to --dry-run
    // too, since dry runs persist results). The passphrase is only checked
    // here — it is never printed and never passed through stdout.
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

    if (!config.dryRun && !config.headed) {
        console.error(
            [
                "auto-reg: 警告：真实注册（dry-run=false）正以 headless（headed=false）模式运行。",
                "  注册页几乎必然出现 Turnstile 人机验证，无头模式下没有窗口可供人工点选，",
                "  流程会在 challenge 阶段直接失败（CHALLENGE_REQUIRED）。",
                "  请改用 --headed（或在配置里把 headed 设为 true），并在弹出的浏览器窗口里手动完成验证。",
            ].join("\n"),
        );
    }

    const results = await runRegister(config, makeEventPrinter(config));
    printSummary(results, config);

    const succeeded = results.filter((r) => r.ok).length;
    if (results.length > 0 && succeeded === 0) {
        process.exitCode = 1;
    }
}

/**
 * Progress printer for pipeline events. Only the stage name is echoed — never
 * the engine's free-form message, which could contain a verification code or
 * session token. The single exception is a fixed, CLI-owned hint printed when
 * a run first enters the challenge stage, so a human knows to solve the
 * Turnstile in the visible browser window (headed) or why the run is about to
 * fail (headless).
 */
function makeEventPrinter(config: AutoRegConfig): (e: PipelineEvent) => void {
    let lastStage: PipelineEvent["stage"] | undefined;
    return (e: PipelineEvent): void => {
        process.stderr.write(`  · ${e.stage}\n`);
        if (e.stage === "challenge" && lastStage !== "challenge") {
            process.stderr.write(
                config.headed
                    ? "    检测到人机验证（Turnstile）：请在弹出的浏览器窗口中手动点选完成验证，完成后流程会自动继续。\n"
                    : "    检测到人机验证（Turnstile）：headless 模式下无法人工完成，本次注册将失败；请改用 --headed 并在弹出的窗口里手动点选。\n",
            );
        }
        lastStage = e.stage;
    };
}

/**
 * Per-account lines only ever echo the email, status and stage — never the
 * password, session token or vault passphrase, regardless of encryption mode.
 */
function printSummary(results: RegisterResult[], config: AutoRegConfig): void {
    const { output } = config;
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

    if (results.some((r) => !r.ok && r.stage === "challenge")) {
        console.error(
            config.headed
                ? "auto-reg: 有注册停在人机验证（challenge）阶段：请在弹出的浏览器窗口里及时手动点选完成验证（如时间不够可调大 timeoutMs 后重试）。"
                : "auto-reg: 有注册在人机验证（challenge）阶段失败：请改用 --headed 并在弹出的窗口里手动点选完成验证。",
        );
    }
}

function applyOverrides(config: AutoRegConfig, args: CliArgs): AutoRegConfig {
    return {
        ...config,
        count: args.count ?? config.count,
        dryRun: args.dryRun ? true : config.dryRun,
        headed: args.headed ? true : config.headed,
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

function parseArgs(argv: string[]): CliArgs {
    const args: CliArgs = { dryRun: false, headed: false, help: false, unknown: [] };
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
            "  --headed          Run the browser engine headed (visible) instead of headless.",
            "                    真实注册（非 dry-run）必须使用：Turnstile 人机验证只能由人在",
            "                    弹出的浏览器窗口里手动点选完成，headless 会在 challenge 阶段失败。",
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
