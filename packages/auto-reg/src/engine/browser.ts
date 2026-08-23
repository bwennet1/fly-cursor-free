import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { BrowserContext, Page } from "playwright";

import { AutoRegError, ErrorCodes } from "../errors.ts";
import { parseSessionCookie } from "../token/session.ts";
import type {
    AutoRegConfig,
    EventSink,
    Identity,
    RegisterEngine,
    RegisterStage,
} from "../types.js";
import { resolveTurnstilePatchDir, resolveTurnstilePatchScript } from "./turnstile-patch.ts";

/**
 * Playwright is a regular dependency of this package (`npm install` brings in
 * the library), but the browser binaries are a separate download:
 * `npx playwright install chromium`.
 */
type PlaywrightModule = typeof import("playwright");

/** Matches Playwright's error text when the browser binaries were never downloaded. */
const MISSING_BROWSER_PATTERN = /executable doesn't exist|playwright install/i;

/** Default text/markers that identify an anti-bot challenge page. */
const DEFAULT_CHALLENGE_PATTERN =
    /turnstile|captcha|hcaptcha|recaptcha|cf-chl|challenge|are you (a )?human|incompatible browser extension|just a moment|performing security verification/i;

/** Markers that identify a phone / "radar" risk verification step. */
const PHONE_PATTERN = /phone|radar/i;

/** How often (ms) to re-check whether a human has cleared a challenge. */
const CHALLENGE_POLL_MS = 1_000;

/**
 * Upper bound for the Continue click. Turnstile often covers/blocks the button;
 * a long Playwright actionability wait is what looked like a hang at
 * `submit_profile` in docs/问题.md. Cap the click at ≤8s and never wait on a
 * post-click navigation (`noWaitAfter`).
 */
export const CLICK_CONTINUE_TIMEOUT_MS = 8_000;

/**
 * Playwright env var that selects `chrome-headless-shell`. Setting it to `0`
 * forces full Chromium, which is the binary the extension policy expects.
 */
export const HEADLESS_SHELL_ENV = "PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL";

/**
 * Forces Playwright to launch full Chromium instead of `chrome-headless-shell`
 * by setting {@link HEADLESS_SHELL_ENV}=0. Mutates and returns `env`.
 */
export function disableHeadlessShell(
    env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
    env[HEADLESS_SHELL_ENV] = "0";
    return env;
}

export const ENV_CHROME_PATH = "AUTO_REG_CHROME_PATH";
export const ENV_PLAYWRIGHT_CHANNEL = "AUTO_REG_PLAYWRIGHT_CHANNEL";

const DEFAULT_CHROME_PATHS = [
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chrome",
];

/** Playwright text when the headed window crashed or the context was closed. */
export const CLOSED_BROWSER_PATTERN =
    /target page, context or browser has been closed|targetclosederror|browser has been closed/i;

export type BrowserBinarySource = "channel-chrome" | "executablePath" | "bundled";

export interface BrowserBinaryPlan {
    channel?: "chrome";
    executablePath?: string;
    source: BrowserBinarySource;
}

/**
 * Prefers installed Google Chrome over Playwright's bundled Chromium.
 * Bundled `chrome-linux64/chrome` has crashed the headed window on some
 * Linux displays (docs/问题.md #4) while `/usr/bin/google-chrome` stayed up.
 *
 * Pure so tests can assert without launching a browser.
 */
export function planBrowserBinary(
    env: NodeJS.ProcessEnv = process.env,
    pathExists: (p: string) => boolean = existsSync,
): BrowserBinaryPlan {
    const channel = (env[ENV_PLAYWRIGHT_CHANNEL] ?? "").trim().toLowerCase();
    if (channel === "bundled" || channel === "chromium") {
        return { source: "bundled" };
    }
    const explicit = env[ENV_CHROME_PATH]?.trim();
    if (explicit) {
        return { executablePath: explicit, source: "executablePath" };
    }
    if (channel === "chrome") {
        return { channel: "chrome", source: "channel-chrome" };
    }
    if (DEFAULT_CHROME_PATHS.some((candidate) => pathExists(candidate))) {
        return { channel: "chrome", source: "channel-chrome" };
    }
    return { source: "bundled" };
}

export function isClosedBrowserError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    return CLOSED_BROWSER_PATTERN.test(message);
}

export function rethrowIfBrowserClosed(error: unknown, stage: RegisterStage): void {
    if (!isClosedBrowserError(error)) return;
    throw new AutoRegError(
        stage,
        ErrorCodes.BROWSER_CLOSED,
        "headed browser window closed or crashed (Playwright bundled Chromium often dies on Linux displays); " +
            "retry with system Chrome via channel=chrome or AUTO_REG_CHROME_PATH=/usr/bin/google-chrome " +
            `(${error instanceof Error ? error.message : String(error)})`,
    );
}

export type PageBlockKind = "ok" | "rate_limit" | "incompatible_extension" | "interstitial";

/** Classifies signup HTML/title/status. Does not attempt to pass the block. */
export function classifyPageBlock(html: string, title = "", status?: number): PageBlockKind {
    const blob = `${title}\n${html}`;
    if (status === 429 || /too many requests/i.test(blob)) return "rate_limit";
    if (/incompatible browser extension/i.test(blob)) return "incompatible_extension";
    if (
        /just a moment|performing security verification|protect against malicious bots|verifies you are not a bot/i.test(
            blob,
        )
    ) {
        return "interstitial";
    }
    return "ok";
}

export function pageBlockError(kind: PageBlockKind, stage: RegisterStage = "open_signup"): AutoRegError {
    if (kind === "rate_limit") {
        return new AutoRegError(
            stage,
            ErrorCodes.RATE_LIMITED,
            "signup URL returned 429 / rate limit; wait before opening the page again — no automated bypass is attempted",
        );
    }
    if (kind === "incompatible_extension") {
        return new AutoRegError(
            stage,
            ErrorCodes.CHALLENGE_REQUIRED,
            "Cloudflare reported Incompatible browser extension — leave turnstileExtension false (do not --load-extension the turnstilePatch MV3)",
        );
    }
    return new AutoRegError(
        stage,
        ErrorCodes.CHALLENGE_REQUIRED,
        "Cloudflare interstitial (Performing security verification / malicious bots) — " +
            "the signup form is not on this page. This is not solved automatically. " +
            "Wait after 429; do not tight-loop register.",
    );
}

/** How Chromium should be launched for a run (see {@link planChromiumLaunch}). */
export interface ChromiumLaunchPlan {
    args: string[];
    ignoreDefaultArgs: string[] | undefined;
    /** True only when opted in, headed, and a patch dir exists. */
    loadExtension: boolean;
}

/**
 * Default: never pass `--load-extension`. Cloudflare reports
 * "Incompatible browser extension" when the packaged MV3 is loaded that way
 * (docs/问题.md #5). Opt in with `loadAsExtension=true` (headed + patch dir).
 */
export function planChromiumLaunch(
    headed: boolean,
    patchDir: string | undefined,
    loadAsExtension = false,
): ChromiumLaunchPlan {
    const loadExtension = Boolean(patchDir && headed && loadAsExtension);
    const args: string[] = [];
    if (loadExtension && patchDir) {
        args.push(`--disable-extensions-except=${patchDir}`);
        args.push(`--load-extension=${patchDir}`);
    }
    return {
        args,
        ignoreDefaultArgs: loadExtension ? ["--disable-extensions"] : undefined,
        loadExtension,
    };
}

async function loadPlaywright(): Promise<PlaywrightModule> {
    try {
        return await import("playwright");
    } catch (error) {
        throw new AutoRegError(
            "open_signup",
            ErrorCodes.ENGINE,
            "the playwright package failed to load; run `npm install` in packages/auto-reg, " +
                `then download the browser with: npx playwright install chromium (${(error as Error).message})`,
        );
    }
}

interface OpenedContext {
    context: BrowserContext;
    userDataDir: string;
}

async function openContext(
    playwright: PlaywrightModule,
    config: AutoRegConfig,
    emit: (stage: RegisterStage, message: string) => void,
): Promise<OpenedContext> {
    const headed = config.headed;
    const patchEnabled = config.turnstilePatch !== false;
    const patchDir = patchEnabled ? resolveTurnstilePatchDir() : undefined;
    const patchScript = patchEnabled ? resolveTurnstilePatchScript() : undefined;

    if (patchEnabled && !patchDir) {
        emit(
            "open_signup",
            "turnstilePatch enabled but resources/turnstilePatch was not found; continuing without the CDP screenXY patch",
        );
    }

    disableHeadlessShell();
    emit("open_signup", `set ${HEADLESS_SHELL_ENV}=0 (launch full Chromium, not chrome-headless-shell)`);

    const binary = planBrowserBinary();
    if (binary.source === "channel-chrome") {
        emit("open_signup", "using Playwright channel=chrome (system Google Chrome) to avoid bundled Chromium window crashes");
    } else if (binary.source === "executablePath" && binary.executablePath) {
        emit("open_signup", `using AUTO_REG_CHROME_PATH=${binary.executablePath}`);
    } else {
        emit(
            "open_signup",
            "using Playwright bundled Chromium — if the headed window vanishes, install Google Chrome or set AUTO_REG_CHROME_PATH",
        );
    }

    const userDataDir = await mkdtemp(path.join(tmpdir(), "auto-reg-chromium-"));
    const plan = planChromiumLaunch(headed, patchDir, config.turnstileExtension === true);
    if (plan.loadExtension && patchDir) {
        emit(
            "open_signup",
            `headed + turnstileExtension: loading MV3 from ${patchDir} via --load-extension ` +
                "(Cloudflare may report Incompatible browser extension)",
        );
    } else if (patchEnabled) {
        emit(
            "open_signup",
            "not passing --load-extension (Cloudflare flags the turnstilePatch MV3); " +
                "script.js is injected via addInitScript only",
        );
    }

    const launchOptions: Parameters<PlaywrightModule["chromium"]["launchPersistentContext"]>[1] = {
        headless: !headed,
        args: plan.args,
        ignoreDefaultArgs: plan.ignoreDefaultArgs,
        viewport: { width: 1280, height: 800 },
    };
    if (binary.channel) launchOptions.channel = binary.channel;
    if (binary.executablePath) launchOptions.executablePath = binary.executablePath;

    try {
        let context: BrowserContext;
        try {
            context = await playwright.chromium.launchPersistentContext(userDataDir, launchOptions);
        } catch (error) {
            if (binary.source === "bundled") throw error;
            const message = error instanceof Error ? error.message : String(error);
            emit("open_signup", `system Chrome launch failed, falling back to bundled Chromium (${message})`);
            const { channel: _c, executablePath: _e, ...bundled } = launchOptions;
            context = await playwright.chromium.launchPersistentContext(userDataDir, bundled);
        }

        if (patchScript) {
            await context.addInitScript({ path: patchScript });
            emit("open_signup", "injected turnstilePatch script.js via addInitScript");
        }

        return { context, userDataDir };
    } catch (error) {
        await rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
        const message = error instanceof Error ? error.message : String(error);
        if (MISSING_BROWSER_PATTERN.test(message)) {
            throw new AutoRegError(
                "open_signup",
                ErrorCodes.ENGINE,
                `Chromium is not downloaded yet; run: npx playwright install chromium (${message})`,
            );
        }
        throw error;
    }
}

async function closeOpened(opened: OpenedContext): Promise<void> {
    try {
        await opened.context.close();
    } finally {
        await rm(opened.userDataDir, { recursive: true, force: true }).catch(() => undefined);
    }
}

async function present(page: Page, selector: string): Promise<boolean> {
    if (!selector) return false;
    try {
        return (await page.locator(selector).count()) > 0;
    } catch (error) {
        rethrowIfBrowserClosed(error, "open_signup");
        return false;
    }
}

export async function looksLikeChallenge(page: Page, hint: string): Promise<boolean> {
    let html = "";
    try {
        html = (await page.content()).toLowerCase();
    } catch (error) {
        rethrowIfBrowserClosed(error, "challenge");
        html = "";
    }
    if (DEFAULT_CHALLENGE_PATTERN.test(html)) return true;

    const trimmed = hint?.trim() ?? "";
    if (trimmed.length > 0) {
        if (await present(page, trimmed)) return true;
        if (html.includes(trimmed.toLowerCase())) return true;
    }
    return false;
}

export async function readPageText(page: Page): Promise<{ html: string; title: string }> {
    let html = "";
    let title = "";
    try {
        html = await page.content();
    } catch (error) {
        rethrowIfBrowserClosed(error, "open_signup");
    }
    try {
        title = await page.title();
    } catch (error) {
        rethrowIfBrowserClosed(error, "open_signup");
    }
    return { html, title };
}

export async function assertSignupReady(
    page: Page,
    firstNameSelector: string,
    status?: number,
    stage: RegisterStage = "open_signup",
): Promise<void> {
    const { html, title } = await readPageText(page);
    const kind = classifyPageBlock(html, title, status);
    if (kind !== "ok") {
        throw pageBlockError(kind, stage);
    }
    let count = 0;
    try {
        count = await page.locator(firstNameSelector).count();
    } catch (error) {
        rethrowIfBrowserClosed(error, stage);
        throw error;
    }
    if (count === 0) {
        throw new AutoRegError(
            stage,
            ErrorCodes.SELECTOR,
            `signup form field ${firstNameSelector} not found (Cloudflare interstitial, 429, or closed window) — not waiting out timeoutMs`,
        );
    }
}

export async function handleChallenge(
    page: Page,
    config: AutoRegConfig,
    emit: (stage: RegisterStage, message: string) => void,
): Promise<void> {
    if (!(await looksLikeChallenge(page, config.selectors.challengeHint))) return;

    const { html, title } = await readPageText(page);
    const kind = classifyPageBlock(html, title);
    if (kind !== "ok") {
        throw pageBlockError(kind, "challenge");
    }

    emit("challenge", "anti-bot challenge detected (turnstile / captcha / challenge)");

    if (!config.headed) {
        throw new AutoRegError(
            "challenge",
            ErrorCodes.CHALLENGE_REQUIRED,
            "a bot challenge was detected under headless Chromium; " +
                "Turnstile rarely passes without a real display — re-run with --headed " +
                "(turnstilePatch is a CDP screenX/Y fix injected via addInitScript, not a solver; " +
                "do not enable turnstileExtension — Cloudflare flags that MV3)",
        );
    }

    const deadline = Date.now() + config.timeoutMs;
    while (Date.now() < deadline) {
        await page.waitForTimeout(CHALLENGE_POLL_MS);
        if (!(await looksLikeChallenge(page, config.selectors.challengeHint))) {
            emit("challenge", "challenge cleared manually");
            return;
        }
        const again = classifyPageBlock((await readPageText(page)).html, (await readPageText(page)).title);
        if (again !== "ok") {
            throw pageBlockError(again, "challenge");
        }
    }

    throw new AutoRegError(
        "challenge",
        ErrorCodes.CHALLENGE_REQUIRED,
        "challenge was not solved before the timeout; no automated bypass is attempted",
    );
}

export async function clickContinue(
    page: Page,
    selector: string,
    timeout: number,
    config: AutoRegConfig,
    emit: (stage: RegisterStage, message: string) => void,
): Promise<void> {
    if (await looksLikeChallenge(page, config.selectors.challengeHint)) {
        emit("challenge", "challenge present before Continue; not clicking the button yet");
        await handleChallenge(page, config, emit);
    }

    const clickTimeout = Math.min(timeout, CLICK_CONTINUE_TIMEOUT_MS);
    try {
        await page.click(selector, { timeout: clickTimeout, noWaitAfter: true });
    } catch (error) {
        rethrowIfBrowserClosed(error, "submit_profile");
        if (await looksLikeChallenge(page, config.selectors.challengeHint)) {
            await handleChallenge(page, config, emit);
            return;
        }
        throw error;
    }
    await handleChallenge(page, config, emit);
}

async function assertNoPhoneVerification(page: Page, stage: RegisterStage): Promise<void> {
    const url = page.url();
    let html = "";
    try {
        html = await page.content();
    } catch (error) {
        rethrowIfBrowserClosed(error, stage);
        html = "";
    }
    if (PHONE_PATTERN.test(url) || PHONE_PATTERN.test(html)) {
        throw new AutoRegError(
            stage,
            ErrorCodes.PHONE_REQUIRED,
            "phone / radar verification was requested; aborting (no automated bypass is attempted)",
        );
    }
}

async function fillOtp(page: Page, selector: string, code: string): Promise<void> {
    const inputs = page.locator(selector);
    const count = await inputs.count();
    if (count <= 1) {
        await inputs.first().fill(code);
        return;
    }
    const digits = [...code];
    for (let i = 0; i < count && i < digits.length; i++) {
        await inputs.nth(i).fill(digits[i] as string);
    }
}

export class BrowserEngine implements RegisterEngine {
    readonly name = "browser";

    async register(input: {
        identity: Identity;
        config: AutoRegConfig;
        waitForCode: (since: Date) => Promise<string>;
        onEvent: EventSink;
    }): Promise<{ sessionToken?: string; code?: string }> {
        const { identity, config, waitForCode, onEvent } = input;
        const { selectors } = config;
        const timeout = config.timeoutMs;
        const emit = (stage: RegisterStage, message: string): void => {
            onEvent({ stage, message, at: new Date().toISOString() });
        };

        const playwright = await loadPlaywright();
        const opened = await openContext(playwright, config, emit);
        try {
            const { context } = opened;
            const page = context.pages()[0] ?? (await context.newPage());

            emit("open_signup", `opening ${config.signupUrl}`);
            let status: number | undefined;
            try {
                const response = await page.goto(config.signupUrl, { waitUntil: "domcontentloaded", timeout });
                status = response?.status();
            } catch (error) {
                rethrowIfBrowserClosed(error, "open_signup");
                throw error;
            }
            if (status === 429) {
                throw pageBlockError("rate_limit", "open_signup");
            }
            await assertSignupReady(page, selectors.firstName, status, "open_signup");

            emit("submit_profile", `filling profile for ${identity.email}`);
            const fillTimeout = Math.min(timeout, CLICK_CONTINUE_TIMEOUT_MS);
            try {
                await page.fill(selectors.firstName, identity.firstName, { timeout: fillTimeout });
                await page.fill(selectors.lastName, identity.lastName, { timeout: fillTimeout });
                await page.fill(selectors.email, identity.email, { timeout: fillTimeout });
            } catch (error) {
                rethrowIfBrowserClosed(error, "submit_profile");
                throw error;
            }
            await clickContinue(page, selectors.continueButton, timeout, config, emit);
            await assertNoPhoneVerification(page, "submit_profile");

            if (await present(page, selectors.password)) {
                emit("submit_password", "filling password");
                try {
                    await page.fill(selectors.password, identity.password, { timeout: fillTimeout });
                } catch (error) {
                    rethrowIfBrowserClosed(error, "submit_password");
                    throw error;
                }
                await clickContinue(page, selectors.continueButton, timeout, config, emit);
            }

            await assertNoPhoneVerification(page, "submit_code");

            let code: string | undefined;
            if (await present(page, selectors.otpInputs)) {
                emit("wait_mailbox", "waiting for the verification code");
                const since = new Date();
                code = await waitForCode(since);
                emit("submit_code", "entering verification code");
                await fillOtp(page, selectors.otpInputs, code);
            }

            await assertNoPhoneVerification(page, "capture_session");

            emit("capture_session", "reading session cookie");
            const cookies = await context.cookies();
            const sessionCookie = cookies.find((cookie) =>
                cookie.name.includes("WorkosCursorSessionToken"),
            );
            const sessionToken = sessionCookie ? parseSessionCookie(sessionCookie.value) : undefined;

            return { sessionToken, code };
        } catch (error) {
            rethrowIfBrowserClosed(error, "failed");
            throw error;
        } finally {
            await closeOpened(opened);
        }
    }
}

export function createBrowserEngine(): RegisterEngine {
    return new BrowserEngine();
}
