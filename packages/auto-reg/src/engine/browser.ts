import type { Browser, Page } from "playwright";

import { AutoRegError, ErrorCodes } from "../errors.ts";
import { parseSessionCookie } from "../token/session.ts";
import type {
    AutoRegConfig,
    EventSink,
    Identity,
    RegisterEngine,
    RegisterStage,
} from "../types.js";

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

/** Markers that identify a phone / "radar" risk verification step. */
const PHONE_PATTERN = /phone|radar/i;

/** How often (ms) to re-check whether a human has cleared a challenge. */
const CHALLENGE_POLL_MS = 1_000;

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

/**
 * Launches Chromium, translating Playwright's "executable doesn't exist" error
 * into an actionable hint: the library is installed via npm, but the browser
 * binaries come from `npx playwright install chromium`.
 */
async function launchChromium(playwright: PlaywrightModule, headed: boolean): Promise<Browser> {
    try {
        return await playwright.chromium.launch({ headless: !headed });
    } catch (error) {
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
async function looksLikeChallenge(page: Page, hint: string): Promise<boolean> {
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

/**
 * Handles a detected challenge without ever bypassing it. In headed mode we
 * poll and let a human solve it until the configured timeout; in headless mode
 * (or on timeout) we abort with a CHALLENGE_REQUIRED error.
 */
async function handleChallenge(
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
            "a bot challenge was detected; re-run in headed mode and solve it manually (no automated bypass is attempted)",
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
 * Real registration engine driven by Playwright/Chromium. Fills the signup
 * form, respects (never bypasses) anti-bot challenges and phone verification,
 * enters the emailed code and finally extracts the session token from the
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
        const browser = await launchChromium(playwright, config.headed);
        try {
            const context = await browser.newContext();
            const page = await context.newPage();

            emit("open_signup", `opening ${config.signupUrl}`);
            await page.goto(config.signupUrl, { waitUntil: "domcontentloaded", timeout });

            emit("submit_profile", `filling profile for ${identity.email}`);
            await page.fill(selectors.firstName, identity.firstName, { timeout });
            await page.fill(selectors.lastName, identity.lastName, { timeout });
            await page.fill(selectors.email, identity.email, { timeout });
            await page.click(selectors.continueButton, { timeout });

            await handleChallenge(page, config, emit);
            await assertNoPhoneVerification(page, "submit_profile");

            if (await present(page, selectors.password)) {
                emit("submit_password", "filling password");
                await page.fill(selectors.password, identity.password, { timeout });
                await page.click(selectors.continueButton, { timeout });
                await handleChallenge(page, config, emit);
            }

            await assertNoPhoneVerification(page, "submit_code");

            let code: string | undefined;
            if (await present(page, selectors.otpInputs)) {
                emit("wait_mailbox", "waiting for the verification code");
                const since = new Date();
                code = await waitForCode(since);
                emit("submit_code", `entering verification code ${code}`);
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
            await browser.close();
        }
    }
}

/** Convenience factory returning a fresh {@link BrowserEngine}. */
export function createBrowserEngine(): RegisterEngine {
    return new BrowserEngine();
}
