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
 * Minimal structural typings for the slice of the Playwright API this engine
 * uses. Playwright is an optional peer dependency loaded lazily at runtime, so
 * we deliberately avoid a compile-time dependency on its published types.
 */
interface PwLocator {
    count(): Promise<number>;
    first(): PwLocator;
    nth(index: number): PwLocator;
    fill(value: string, options?: { timeout?: number }): Promise<void>;
}

interface PwPage {
    goto(url: string, options?: { waitUntil?: string; timeout?: number }): Promise<unknown>;
    content(): Promise<string>;
    url(): string;
    locator(selector: string): PwLocator;
    fill(selector: string, value: string, options?: { timeout?: number }): Promise<void>;
    click(selector: string, options?: { timeout?: number }): Promise<void>;
    waitForTimeout(ms: number): Promise<void>;
}

interface PwCookie {
    name: string;
    value: string;
}

interface PwContext {
    newPage(): Promise<PwPage>;
    cookies(): Promise<PwCookie[]>;
}

interface PwBrowser {
    newContext(options?: unknown): Promise<PwContext>;
    close(): Promise<void>;
}

interface PwBrowserType {
    launch(options?: { headless?: boolean; timeout?: number }): Promise<PwBrowser>;
}

interface PlaywrightModule {
    chromium: PwBrowserType;
}

/** Default text/markers that identify an anti-bot challenge page. */
const DEFAULT_CHALLENGE_PATTERN = /turnstile|captcha|hcaptcha|recaptcha|cf-chl|challenge|are you (a )?human/i;

/** Markers that identify a phone / "radar" risk verification step. */
const PHONE_PATTERN = /phone|radar/i;

/** How often (ms) to re-check whether a human has cleared a challenge. */
const CHALLENGE_POLL_MS = 1_000;

/**
 * Loads Playwright on demand. Kept out of the module's static import graph so
 * that constructing the engine (and running tests) never requires the browser
 * driver to be installed.
 */
async function loadPlaywright(): Promise<PlaywrightModule> {
    try {
        return (await import("playwright")) as unknown as PlaywrightModule;
    } catch (error) {
        throw new AutoRegError(
            "open_signup",
            ErrorCodes.ENGINE,
            `Playwright is not installed. Install it with: npx playwright install chromium (${(error as Error).message})`,
        );
    }
}

/** True when the selector matches at least one element on the page. */
async function present(page: PwPage, selector: string): Promise<boolean> {
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
async function looksLikeChallenge(page: PwPage, hint: string): Promise<boolean> {
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
    page: PwPage,
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
async function assertNoPhoneVerification(page: PwPage, stage: RegisterStage): Promise<void> {
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
async function fillOtp(page: PwPage, selector: string, code: string): Promise<void> {
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
        const browser = await playwright.chromium.launch({ headless: !config.headed });
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
