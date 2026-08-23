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
import { resolveTurnstilePatchScript } from "./turnstile-patch.ts";

/**
 * Playwright is a regular dependency of this package (`npm install` brings in
 * the library), but the browser binaries are a separate download:
 * `npx playwright install chromium`.
 */
type PlaywrightModule = typeof import("playwright");

/** Matches Playwright's error text when the browser binaries were never downloaded. */
const MISSING_BROWSER_PATTERN = /executable doesn't exist|playwright install/i;

/** Default text/markers that identify an anti-bot challenge page. */
const DEFAULT_CHALLENGE_PATTERN = /turnstile|captcha|hcaptcha|recaptcha|cf-chl|challenge|are you (a )?human/i;

/**
 * Cloudflare interstitial markers (page <title> or body). This is the "Just a
 * moment…" managed-challenge page Cloudflare serves *before* the real sign-up
 * form — including the "Incompatible browser extension or network
 * configuration" note it shows when it detects a loaded browser extension.
 * These map to CHALLENGE_REQUIRED and must fail fast, never poll.
 */
const CLOUDFLARE_INTERSTITIAL_PATTERN =
    /just a moment|incompatible browser extension|performing security verification|security verification|checking your browser|attention required|cf-browser-verification/i;

/** HTTP 429 / rate-limit markers in page text (the status code is checked separately). */
const RATE_LIMIT_PATTERN = /too many requests|rate limit|error 1015|\b429\b/i;

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
 * by setting {@link HEADLESS_SHELL_ENV}=0. `chrome-headless-shell` is the
 * headless-only binary that stalled the real run in docs/问题.md and is more
 * obviously automated; full Chromium is the closer match to a real browser.
 * Mutates and returns `env` (defaults to `process.env`) so the behaviour is
 * testable without launching a browser.
 */
export function disableHeadlessShell(
    env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
    env[HEADLESS_SHELL_ENV] = "0";
    return env;
}

/** How Chromium should be launched for a run (see {@link planChromiumLaunch}). */
export interface ChromiumLaunchPlan {
    /** Extra Chromium CLI args. Always empty: we never load the MV3 extension. */
    args: string[];
    /** Default args to strip. Always `undefined` — Playwright keeps its defaults. */
    ignoreDefaultArgs: string[] | undefined;
    /** Always false: the MV3 turnstilePatch extension is never loaded. */
    loadExtension: boolean;
}

/**
 * Chromium launch flags for a sign-up run.
 *
 * We deliberately **never** load the turnstilePatch MV3 extension via
 * `--load-extension` / `--disable-extensions-except`, in headed or headless
 * mode. Cloudflare's interstitial explicitly flags a loaded extension as an
 * "Incompatible browser extension or network configuration" and blocks the
 * sign-up form (docs/问题.md) — the extension is what triggers the very
 * interstitial we are trying to avoid.
 *
 * The screenX/screenY patch is instead injected as a page init script
 * (`addInitScript`), and only when `config.turnstilePatch` is explicitly
 * enabled. That is a plain page script, not a loaded extension, so Cloudflare
 * does not treat it as an incompatible extension.
 *
 * Pure and synchronous so tests can assert we never pass extension flags.
 */
export function planChromiumLaunch(): ChromiumLaunchPlan {
    return { args: [], ignoreDefaultArgs: undefined, loadExtension: false };
}

/**
 * Loads the Playwright library on demand. It is a declared dependency, but we
 * keep it out of the module's static import graph so that dry-run and tests
 * never pay its load cost (only `register()` does).
 */
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
    /** Temp profile dir used by launchPersistentContext; removed in close(). */
    userDataDir: string;
}

/**
 * Opens a Chromium context for signup.
 *
 * The turnstilePatch MV3 extension is **never** loaded via `--load-extension`:
 * Cloudflare's interstitial flags a loaded extension as an "Incompatible
 * browser extension" and blocks the sign-up form (docs/问题.md). When
 * `config.turnstilePatch` is explicitly enabled (opt-in; default false) the CDP
 * screenX/Y fix from Cursor-Register / TheFalloutOf76 / Xewdy444 is injected as
 * a plain page init script (`addInitScript`) instead. That is not a captcha
 * solver — unresolved challenges still fail or wait for a human.
 *
 * {@link disableHeadlessShell} still forces full Chromium (not
 * `chrome-headless-shell`) because the headless-only binary is the one that
 * stalled the real run in docs/问题.md and is more obviously automated.
 */
async function openContext(
    playwright: PlaywrightModule,
    config: AutoRegConfig,
    emit: (stage: RegisterStage, message: string) => void,
): Promise<OpenedContext> {
    const headed = config.headed;
    // Opt-in: only inject the CDP screenX/Y patch when explicitly enabled.
    const patchEnabled = config.turnstilePatch === true;
    const patchScript = patchEnabled ? resolveTurnstilePatchScript() : undefined;

    if (patchEnabled && !patchScript) {
        emit(
            "open_signup",
            "turnstilePatch enabled but resources/turnstilePatch/script.js was not found; continuing without the CDP screenXY patch",
        );
    }

    disableHeadlessShell();
    emit("open_signup", `set ${HEADLESS_SHELL_ENV}=0 (launch full Chromium, not chrome-headless-shell)`);

    const userDataDir = await mkdtemp(path.join(tmpdir(), "auto-reg-chromium-"));
    const plan = planChromiumLaunch();

    try {
        const context = await playwright.chromium.launchPersistentContext(userDataDir, {
            headless: !headed,
            // Always empty: we never --load-extension the MV3 build (Cloudflare
            // rejects it as an incompatible extension, docs/问题.md).
            args: plan.args,
            ignoreDefaultArgs: plan.ignoreDefaultArgs,
            viewport: { width: 1280, height: 800 },
        });

        if (patchScript) {
            await context.addInitScript({ path: patchScript });
            emit(
                "open_signup",
                "injected turnstilePatch script.js via addInitScript (opt-in; extension NOT loaded — CF flags it)",
            );
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

/** True when the selector matches at least one element on the page. */
async function present(page: Page, selector: string): Promise<boolean> {
    if (!selector) return false;
    try {
        return (await page.locator(selector).count()) > 0;
    } catch {
        return false;
    }
}

/**
 * Detects whether the current page looks like an anti-bot challenge. Matches
 * the built-in {@link DEFAULT_CHALLENGE_PATTERN} against the page HTML and, when
 * a `challengeHint` is configured, also treats it as a CSS selector and as a
 * plain substring of the page text.
 */
export async function looksLikeChallenge(page: Page, hint: string): Promise<boolean> {
    let html = "";
    try {
        html = (await page.content()).toLowerCase();
    } catch {
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

/** Reads the page <title> defensively (returns "" when unavailable / on a fake page). */
async function readPageTitle(page: Page): Promise<string> {
    const title = (page as { title?: () => Promise<string> }).title;
    if (typeof title !== "function") return "";
    try {
        return (await title.call(page)) ?? "";
    } catch {
        return "";
    }
}

/** True when the page/context reports itself closed (guards missing isClosed on fakes). */
export function isPageClosed(page: Page): boolean {
    const isClosed = (page as { isClosed?: () => boolean }).isClosed;
    if (typeof isClosed !== "function") return false;
    try {
        return isClosed.call(page) === true;
    } catch {
        return false;
    }
}

/**
 * Classifies a page as a Cloudflare interstitial or an HTTP 429 / rate-limit
 * response so the caller can fail fast instead of retrying in a tight loop or
 * waiting the full timeout on a form that will never render. Reads the page
 * `<title>` and body once and, together with the HTTP status when known,
 * returns the {@link AutoRegError} code + message to throw, or `null` when the
 * page looks like a normal sign-up page.
 *
 * - HTTP 429 (status) or a rate-limit body → {@link ErrorCodes.RATE_LIMITED}.
 * - "Just a moment" / "security verification" / "Incompatible browser
 *   extension" → {@link ErrorCodes.CHALLENGE_REQUIRED}.
 */
export async function detectSignupBlock(
    page: Page,
    status: number | null = null,
): Promise<{ code: string; message: string } | null> {
    const title = (await readPageTitle(page)).toLowerCase();
    let html = "";
    try {
        html = (await page.content()).toLowerCase();
    } catch {
        html = "";
    }
    const text = `${title}\n${html}`;

    if (status === 429 || RATE_LIMIT_PATTERN.test(text)) {
        const statusNote = status ? ` (HTTP ${status})` : " (429 / too many requests)";
        return {
            code: ErrorCodes.RATE_LIMITED,
            message:
                `the sign-up host is rate limiting${statusNote}; ` +
                "wait before trying again and do not retry in a tight loop",
        };
    }

    if (CLOUDFLARE_INTERSTITIAL_PATTERN.test(text)) {
        const statusNote = status ? ` (HTTP ${status})` : "";
        return {
            code: ErrorCodes.CHALLENGE_REQUIRED,
            message:
                `Cloudflare interstitial detected${statusNote} ` +
                '("Just a moment" / security verification / incompatible browser extension): ' +
                "disable the turnstilePatch extension (Cloudflare flags a --load-extension MV3 " +
                "extension as an incompatible browser extension), wait if the response is HTTP 429, " +
                "and do not retry in a tight loop",
        };
    }

    return null;
}

/**
 * Throws immediately when {@link detectSignupBlock} classifies the page as a
 * Cloudflare interstitial or a 429 rate-limit response. No polling — these are
 * hard stops (the operator must intervene / back off).
 */
export async function throwIfSignupBlocked(
    page: Page,
    status: number | null,
    stage: RegisterStage,
    emit: (stage: RegisterStage, message: string) => void,
): Promise<void> {
    const block = await detectSignupBlock(page, status);
    if (!block) return;
    emit("challenge", block.message);
    throw new AutoRegError(stage, block.code, block.message);
}

/**
 * Fast-fail guard run *before* `page.fill(first_name, …)`.
 *
 * Playwright's `page.fill` waits the full `timeoutMs` (120s) when the selector
 * never appears — that is the "hang" seen when Cloudflare serves an interstitial
 * instead of the sign-up form, or when the page/browser has closed. This checks
 * the locator count once and, when it is 0, classifies the cause and throws at
 * once instead of blocking for the full timeout:
 *
 * - page/context closed → {@link ErrorCodes.BROWSER_CLOSED}
 * - CF interstitial / 429 → {@link ErrorCodes.CHALLENGE_REQUIRED} / {@link ErrorCodes.RATE_LIMITED}
 * - otherwise → {@link ErrorCodes.SELECTOR}
 */
export async function ensureFirstNameReady(
    page: Page,
    selector: string,
    stage: RegisterStage,
    emit: (stage: RegisterStage, message: string) => void,
): Promise<void> {
    let count = 0;
    try {
        count = await page.locator(selector).count();
    } catch {
        count = 0;
    }
    if (count > 0) return;

    if (isPageClosed(page)) {
        throw new AutoRegError(
            stage,
            ErrorCodes.BROWSER_CLOSED,
            `the page closed before the ${selector} field rendered; ` +
                "failing fast (Cloudflare may have torn the tab down)",
        );
    }

    await throwIfSignupBlocked(page, null, stage, emit);

    throw new AutoRegError(
        stage,
        ErrorCodes.SELECTOR,
        `the ${selector} field was not found and the page is not a known interstitial; ` +
            "failing fast instead of waiting the full timeout (the sign-up form did not render)",
    );
}

/**
 * Handles a detected challenge. turnstilePatch only fixes CDP screenX/screenY;
 * it does not solve Turnstile. In headed mode we poll for a human; in headless
 * (or on timeout) we abort with CHALLENGE_REQUIRED.
 */
export async function handleChallenge(
    page: Page,
    config: AutoRegConfig,
    emit: (stage: RegisterStage, message: string) => void,
): Promise<void> {
    if (!(await looksLikeChallenge(page, config.selectors.challengeHint))) return;

    emit("challenge", "anti-bot challenge detected (turnstile / captcha / challenge)");

    if (!config.headed) {
        throw new AutoRegError(
            "challenge",
            ErrorCodes.CHALLENGE_REQUIRED,
            "a bot challenge was detected under headless Chromium; " +
                "Playwright's chrome-headless-shell cannot load the turnstilePatch MV3 extension, " +
                "and Turnstile rarely passes without a real display — re-run with --headed " +
                "(turnstilePatch is a CDP screenX/Y fingerprint fix, not a captcha solver)",
        );
    }

    const deadline = Date.now() + config.timeoutMs;
    while (Date.now() < deadline) {
        await page.waitForTimeout(CHALLENGE_POLL_MS);
        if (!(await looksLikeChallenge(page, config.selectors.challengeHint))) {
            emit("challenge", "challenge cleared manually");
            return;
        }
    }

    throw new AutoRegError(
        "challenge",
        ErrorCodes.CHALLENGE_REQUIRED,
        "challenge was not solved before the timeout; no automated bypass is attempted",
    );
}

/**
 * Clicks Continue without waiting on a post-click navigation. Turnstile often
 * covers the button / blocks navigation; a long Playwright actionability wait
 * looks like a hang at `submit_profile` (docs/问题.md #1).
 *
 * 1. **Before clicking**, check {@link looksLikeChallenge}. If a challenge is
 *    already up, hand off to {@link handleChallenge} instead of dead-clicking a
 *    covered/blocked button — headless aborts fast with CHALLENGE_REQUIRED, and
 *    headed waits for the human to clear it before we click.
 * 2. The click itself is capped at {@link CLICK_CONTINUE_TIMEOUT_MS} (≤8s) with
 *    `noWaitAfter`, so an obstructed button fails fast instead of spinning for
 *    `timeoutMs`. On failure we re-check for a challenge before rethrowing.
 * 3. **After clicking**, re-run {@link handleChallenge} in case the challenge
 *    only appears once the form is submitted.
 */
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
        if (await looksLikeChallenge(page, config.selectors.challengeHint)) {
            await handleChallenge(page, config, emit);
            return;
        }
        throw error;
    }
    await handleChallenge(page, config, emit);
}

/** Aborts with PHONE_REQUIRED when the page URL or text asks for phone/radar verification. */
async function assertNoPhoneVerification(page: Page, stage: RegisterStage): Promise<void> {
    const url = page.url();
    let html = "";
    try {
        html = await page.content();
    } catch {
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

/** Fills the verification code across one or several OTP input boxes. */
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

/**
 * Real registration engine driven by Playwright/Chromium. Fails fast on a
 * Cloudflare interstitial / HTTP 429 after navigation, fills the signup form
 * (optionally with the opt-in turnstilePatch CDP screenXY init script), still
 * treats unresolved challenges and phone verification as hard failures, enters
 * the emailed code and finally extracts the session token from the
 * `WorkosCursorSessionToken` cookie.
 */
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
            const response = await page.goto(config.signupUrl, {
                waitUntil: "domcontentloaded",
                timeout,
            });
            // Fail fast on a Cloudflare interstitial or an HTTP 429 before we
            // ever try to fill a form that will not be there (docs/问题.md).
            const status = typeof response?.status === "function" ? response.status() : null;
            await throwIfSignupBlocked(page, status, "open_signup", emit);

            emit("submit_profile", `filling profile for ${identity.email}`);
            // Before filling: if first_name is absent (count 0), classify why and
            // fail fast — do not let page.fill block for the full timeoutMs.
            await ensureFirstNameReady(page, selectors.firstName, "submit_profile", emit);
            await page.fill(selectors.firstName, identity.firstName, { timeout });
            await page.fill(selectors.lastName, identity.lastName, { timeout });
            await page.fill(selectors.email, identity.email, { timeout });
            await clickContinue(page, selectors.continueButton, timeout, config, emit);
            await assertNoPhoneVerification(page, "submit_profile");

            if (await present(page, selectors.password)) {
                emit("submit_password", "filling password");
                await page.fill(selectors.password, identity.password, { timeout });
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
        } finally {
            await closeOpened(opened);
        }
    }
}

/** Convenience factory returning a fresh {@link BrowserEngine}. */
export function createBrowserEngine(): RegisterEngine {
    return new BrowserEngine();
}
