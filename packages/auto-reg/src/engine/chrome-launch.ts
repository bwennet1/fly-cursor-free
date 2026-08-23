import { existsSync } from "node:fs";

import { AutoRegError, ErrorCodes } from "../errors.ts";
import type { RegisterStage } from "../types.js";

/**
 * Env var pointing at a Chrome/Chromium executable to launch instead of
 * Playwright's bundled Chromium. Used when Google Chrome is installed
 * somewhere Playwright's "chrome" channel does not look.
 */
export const CHROME_PATH_ENV = "AUTO_REG_CHROME_PATH";

/** Conventional system-Chrome symlink on Linux, tried after {@link CHROME_PATH_ENV}. */
export const DEFAULT_SYSTEM_CHROME = "/usr/bin/google-chrome";

/**
 * Where Playwright's registry resolves the "chrome" channel binary (see
 * `_createChromiumChannel("chrome", ...)` in playwright-core). When one of
 * these paths exists, launching with `channel: "chrome"` will succeed, so the
 * plan can prefer the channel without actually launching a browser.
 */
export function chromeChannelCandidates(
    platform: NodeJS.Platform,
    env: NodeJS.ProcessEnv,
): string[] {
    switch (platform) {
        case "linux":
            return ["/opt/google/chrome/chrome"];
        case "darwin":
            return ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"];
        case "win32": {
            const suffix = "\\Google\\Chrome\\Application\\chrome.exe";
            return [env["LOCALAPPDATA"], env["PROGRAMFILES"], env["PROGRAMFILES(X86)"]]
                .filter((prefix): prefix is string => Boolean(prefix))
                .map((prefix) => prefix + suffix);
        }
        default:
            return [];
    }
}

/** Which binary strategy {@link planBrowserBinary} picked. */
export type ChromeLaunchSource =
    | "channel-chrome"
    | "env-path"
    | "system-chrome"
    | "bundled-chromium";

/**
 * How the browser binary should be selected at launch. At most one of
 * `channel` / `executablePath` is set; for the bundled fallback both are
 * undefined and Playwright uses its own downloaded Chromium.
 */
export interface ChromeLaunchPlan {
    /** `"chrome"` when Playwright should launch the installed Google Chrome channel. */
    channel: "chrome" | undefined;
    /** Absolute path of the binary when launching by explicit path. */
    executablePath: string | undefined;
    source: ChromeLaunchSource;
    /** One-line human-readable summary for event logs. */
    description: string;
}

export interface PlanBrowserBinaryOptions {
    env?: NodeJS.ProcessEnv;
    platform?: NodeJS.Platform;
    /** Injectable for tests; defaults to `fs.existsSync`. */
    fileExists?: (candidate: string) => boolean;
}

/**
 * Decides which browser binary to launch, without launching anything.
 *
 * Background: with `headed=true` the Playwright bundled Chromium (the
 * downloaded `chromium-<build>/chrome-linux64/chrome`) crashed right after the
 * signup form was filled, while system Chrome on the same DISPLAY stayed up.
 * So a real Google Chrome is strongly preferred:
 *
 * 1. Playwright channel `"chrome"` when the installed Google Chrome exists at
 *    a location the channel registry resolves ({@link chromeChannelCandidates});
 * 2. else an explicit `executablePath` from {@link CHROME_PATH_ENV} when the
 *    env var is set and the file exists;
 * 3. else {@link DEFAULT_SYSTEM_CHROME} (`/usr/bin/google-chrome`) when it
 *    exists (covers symlink-only installs the channel registry misses);
 * 4. else Playwright's bundled Chromium (last resort — known to crash headed).
 *
 * Pure apart from the injectable `fileExists` probe, so tests can exercise
 * every branch without a browser or a real Chrome install.
 */
export function planBrowserBinary(options: PlanBrowserBinaryOptions = {}): ChromeLaunchPlan {
    const env = options.env ?? process.env;
    const platform = options.platform ?? process.platform;
    const fileExists = options.fileExists ?? existsSync;

    const channelBinary = chromeChannelCandidates(platform, env).find((candidate) =>
        fileExists(candidate),
    );
    if (channelBinary) {
        return {
            channel: "chrome",
            executablePath: undefined,
            source: "channel-chrome",
            description: `launching installed Google Chrome via Playwright channel "chrome" (${channelBinary})`,
        };
    }

    const envPath = env[CHROME_PATH_ENV]?.trim();
    if (envPath && fileExists(envPath)) {
        return {
            channel: undefined,
            executablePath: envPath,
            source: "env-path",
            description: `launching Chrome from ${CHROME_PATH_ENV}=${envPath}`,
        };
    }

    if (fileExists(DEFAULT_SYSTEM_CHROME)) {
        return {
            channel: undefined,
            executablePath: DEFAULT_SYSTEM_CHROME,
            source: "system-chrome",
            description: `launching system Google Chrome at ${DEFAULT_SYSTEM_CHROME}`,
        };
    }

    const envHint =
        envPath && !fileExists(envPath) ? ` (${CHROME_PATH_ENV}=${envPath} does not exist)` : "";
    return {
        channel: undefined,
        executablePath: undefined,
        source: "bundled-chromium",
        description:
            "no system Google Chrome found; falling back to Playwright bundled Chromium " +
            `— known to crash in headed mode, install Chrome or set ${CHROME_PATH_ENV}${envHint}`,
    };
}

/**
 * Playwright error signatures for a browser/page that died under us:
 * `TargetClosedError` and its message variants ("Target page, context or
 * browser has been closed", "browser has been closed", "Target closed"), plus
 * "page crashed". This is what the bundled-Chromium crash surfaces as on the
 * next fill/click — the action rejects immediately, it does not hang.
 */
const BROWSER_CLOSED_PATTERN =
    /TargetClosedError|browser has been closed|Target page, context or browser has been closed|Target closed|page crashed/i;

/** True when `error` means the browser/page crashed or was closed under us. */
export function isBrowserClosedError(error: unknown): boolean {
    if (error === null || typeof error !== "object") return false;
    const { name, message } = error as { name?: unknown; message?: unknown };
    const constructorName = (error as object).constructor?.name ?? "";
    return (
        (typeof name === "string" && BROWSER_CLOSED_PATTERN.test(name)) ||
        (typeof message === "string" && BROWSER_CLOSED_PATTERN.test(message)) ||
        BROWSER_CLOSED_PATTERN.test(constructorName)
    );
}

/**
 * Builds the AutoRegError(ENGINE) for a mid-run browser crash, in Chinese and
 * English, naming the binary that crashed and how to retry (system Chrome or
 * {@link CHROME_PATH_ENV}).
 */
export function browserCrashError(
    stage: RegisterStage,
    plan: ChromeLaunchPlan,
    cause?: unknown,
): AutoRegError {
    const binaryZh =
        plan.source === "bundled-chromium"
            ? "Playwright 自带的 Chromium"
            : (plan.executablePath ?? "系统 Google Chrome（Playwright channel \"chrome\"）");
    const binaryEn =
        plan.source === "bundled-chromium"
            ? "Playwright's bundled Chromium"
            : (plan.executablePath ?? 'system Google Chrome (Playwright channel "chrome")');
    const zh =
        `浏览器在注册中途崩溃或被关闭（本次使用的浏览器：${binaryZh}）。` +
        "常见原因是 Playwright 自带的 Chromium 在填完表单后崩溃；" +
        `请安装系统版 Google Chrome，或设置 ${CHROME_PATH_ENV} 指向可用的 Chrome 可执行文件后重试。`;
    const en =
        `The browser crashed or was closed mid-registration (binary used: ${binaryEn}). ` +
        "This is typically Playwright's bundled Chromium crashing right after the signup form is filled; " +
        `retry with system Google Chrome installed, or set ${CHROME_PATH_ENV} to a working Chrome executable.`;
    const causeMessage =
        cause instanceof Error ? cause.message : cause !== undefined ? String(cause) : "";
    return new AutoRegError(
        stage,
        ErrorCodes.ENGINE,
        `${zh} | ${en}${causeMessage ? ` [${causeMessage}]` : ""}`,
    );
}
