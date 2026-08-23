import assert from "node:assert/strict";
import { test } from "node:test";

import type { Page } from "playwright";

import { defaultConfig } from "../src/config.ts";
import {
    CLICK_CONTINUE_TIMEOUT_MS,
    HEADLESS_SHELL_ENV,
    clickContinue,
    detectSignupBlock,
    disableHeadlessShell,
    ensureFirstNameReady,
    isPageClosed,
    looksLikeChallenge,
    planChromiumLaunch,
    throwIfSignupBlocked,
} from "../src/engine/browser.ts";
import { BrowserEngine, DryRunEngine, createEngine } from "../src/engine/index.ts";
import { AutoRegError, ErrorCodes } from "../src/errors.ts";
import type { AutoRegConfig, Identity, PipelineEvent } from "../src/types.js";

function testIdentity(): Identity {
    return {
        firstName: "Ada",
        lastName: "Lovelace",
        email: "ada.lovelace@example.com",
        password: "Sup3rSecret!!",
        domain: "example.com",
    };
}

function testConfig(overrides?: Partial<AutoRegConfig>): AutoRegConfig {
    const config = defaultConfig();
    config.email.domain = "example.com";
    return { ...config, ...overrides };
}

function neverCode(): Promise<string> {
    return Promise.reject(new Error("waitForCode should not be called in these tests"));
}

interface FakePageHandle {
    /** Minimal stand-in for a Playwright Page — no browser is launched. */
    page: Page;
    /** Number of times `page.click` was invoked. */
    clicks: () => number;
    /** Number of times `page.fill` was invoked. */
    fills: () => number;
    /** Options passed to the most recent `page.click`. */
    lastClickOptions: () => { timeout?: number; noWaitAfter?: boolean } | undefined;
}

/**
 * Builds a fake Playwright Page so the challenge/click/guard logic can be
 * exercised without downloading Chromium or opening a browser. `html()` is
 * re-read on every `content()` call, and `onWaitForTimeout` runs whenever the
 * challenge poll ticks (used to simulate a human clearing Turnstile between
 * polls). `title`/`locatorCount`/`closed` drive the Cloudflare-interstitial and
 * fast-fail-fill guards.
 */
function makeFakePage(opts: {
    html: () => string;
    title?: () => string;
    onWaitForTimeout?: () => void;
    locatorCount?: (selector: string) => number;
    closed?: () => boolean;
}): FakePageHandle {
    let clicks = 0;
    let fills = 0;
    let lastClickOptions: { timeout?: number; noWaitAfter?: boolean } | undefined;
    const page = {
        content: async () => opts.html(),
        title: async () => opts.title?.() ?? "",
        locator: (selector: string) => ({ count: async () => opts.locatorCount?.(selector) ?? 0 }),
        click: async (_selector: string, options?: { timeout?: number; noWaitAfter?: boolean }) => {
            clicks += 1;
            lastClickOptions = options;
        },
        fill: async () => {
            fills += 1;
        },
        waitForTimeout: async () => {
            opts.onWaitForTimeout?.();
        },
        isClosed: () => opts.closed?.() ?? false,
        url: () => "https://authenticator.cursor.sh/sign-up",
    };
    return {
        page: page as unknown as Page,
        clicks: () => clicks,
        fills: () => fills,
        lastClickOptions: () => lastClickOptions,
    };
}

test("createEngine returns the dry-run engine when config.dryRun is true", () => {
    const engine = createEngine(testConfig({ dryRun: true }));
    assert.ok(engine instanceof DryRunEngine);
    assert.equal(engine.name, "dry-run");
});

test("createEngine returns the browser engine when config.dryRun is false", () => {
    const engine = createEngine(testConfig({ dryRun: false }));
    assert.ok(engine instanceof BrowserEngine);
    assert.equal(engine.name, "browser");
});

test("dry-run register returns a synthetic token and the canned code", async () => {
    const engine = createEngine(testConfig({ dryRun: true }));
    const events: PipelineEvent[] = [];

    const result = await engine.register({
        identity: testIdentity(),
        config: testConfig({ dryRun: true }),
        waitForCode: neverCode,
        onEvent: (event) => events.push(event),
    });

    assert.equal(result.code, "123456");
    assert.ok(result.sessionToken, "expected a session token");
    assert.match(result.sessionToken!, /^dryrun_[0-9a-f]+$/);

    const stages = events.map((event) => event.stage);
    for (const expected of ["open_signup", "submit_profile", "submit_code", "capture_session"]) {
        assert.ok(stages.includes(expected as PipelineEvent["stage"]), `missing stage ${expected}`);
    }
    for (const event of events) {
        assert.ok(typeof event.message === "string" && event.message.length > 0);
        assert.ok(!Number.isNaN(Date.parse(event.at)), "event.at should be an ISO timestamp");
    }
});

test("playwright is a declared dependency: loading it never hits MODULE_NOT_FOUND (no browser launched)", async () => {
    // Historically playwright was an optional runtime module and register()
    // rejected with an ENGINE error when it was absent. It is now a regular
    // dependency of this package, so both constructing the browser engine and
    // resolving the playwright module must succeed. This only imports the
    // library — no Chromium binary is required and no browser is launched.
    const engine = createEngine(testConfig({ dryRun: false }));
    assert.ok(engine instanceof BrowserEngine);

    const playwright = await import("playwright");
    assert.equal(typeof playwright.chromium.launch, "function");
});

test("planChromiumLaunch never loads the MV3 extension (CF flags it as an incompatible extension)", () => {
    const plan = planChromiumLaunch();
    assert.equal(plan.loadExtension, false);
    assert.deepEqual(plan.args, []);
    assert.ok(!plan.args.some((arg) => arg.startsWith("--load-extension")));
    assert.ok(!plan.args.some((arg) => arg.startsWith("--disable-extensions-except")));
    assert.equal(plan.ignoreDefaultArgs, undefined);
});

test("disableHeadlessShell sets PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL=0 (avoids chrome-headless-shell)", () => {
    assert.equal(HEADLESS_SHELL_ENV, "PLAYWRIGHT_CHROMIUM_USE_HEADLESS_SHELL");
    const env: NodeJS.ProcessEnv = {};
    const returned = disableHeadlessShell(env);
    assert.equal(env[HEADLESS_SHELL_ENV], "0");
    assert.equal(returned, env);
});

test("looksLikeChallenge matches Turnstile markup and ignores benign pages", async () => {
    const hint = defaultConfig().selectors.challengeHint;
    const challenge = makeFakePage({ html: () => "<iframe src='challenge'></iframe> turnstile widget" });
    const benign = makeFakePage({ html: () => "<h1>Create your account</h1>" });
    assert.equal(await looksLikeChallenge(challenge.page, hint), true);
    assert.equal(await looksLikeChallenge(benign.page, hint), false);
});

test("clickContinue does not dead-click when a challenge is already present (headless aborts fast)", async () => {
    const handle = makeFakePage({ html: () => "<div>cf-chl turnstile challenge</div>" });
    const config = testConfig({ headed: false });
    await assert.rejects(
        () =>
            clickContinue(
                handle.page,
                config.selectors.continueButton,
                config.timeoutMs,
                config,
                () => {},
            ),
        (err: unknown) => err instanceof AutoRegError && err.code === ErrorCodes.CHALLENGE_REQUIRED,
    );
    assert.equal(handle.clicks(), 0, "must not click Continue while a challenge is showing");
});

test("clickContinue clicks once with a <=8s timeout and noWaitAfter when no challenge is present", async () => {
    const handle = makeFakePage({ html: () => "<h1>Create your account</h1>" });
    const config = testConfig({ headed: false });
    await clickContinue(handle.page, config.selectors.continueButton, config.timeoutMs, config, () => {});
    assert.equal(handle.clicks(), 1);
    const opts = handle.lastClickOptions();
    assert.ok(opts, "expected click options to be captured");
    assert.equal(opts!.noWaitAfter, true);
    assert.ok(CLICK_CONTINUE_TIMEOUT_MS <= 8_000, "click timeout must be <= 8s");
    assert.ok(
        opts!.timeout !== undefined && opts!.timeout <= CLICK_CONTINUE_TIMEOUT_MS,
        "click timeout must be capped at CLICK_CONTINUE_TIMEOUT_MS",
    );
});

test("clickContinue (headed) waits out an initial challenge, then clicks once", async () => {
    let challenge = true;
    const handle = makeFakePage({
        html: () => (challenge ? "<div>turnstile cf-chl</div>" : "<h1>Almost done</h1>"),
        onWaitForTimeout: () => {
            challenge = false;
        },
    });
    const config = testConfig({ headed: true });
    await clickContinue(handle.page, config.selectors.continueButton, config.timeoutMs, config, () => {});
    assert.equal(handle.clicks(), 1, "clicks Continue only after the challenge clears");
});

test("detectSignupBlock flags the Cloudflare 'Just a moment' interstitial via the page title", async () => {
    const handle = makeFakePage({
        title: () => "Just a moment...",
        html: () => "<body><div>Performing security verification</div></body>",
    });
    const block = await detectSignupBlock(handle.page);
    assert.ok(block, "expected a block classification");
    assert.equal(block!.code, ErrorCodes.CHALLENGE_REQUIRED);
    assert.match(block!.message, /turnstilePatch/);
    assert.match(block!.message, /do not retry in a tight loop/);
});

test("detectSignupBlock flags the 'Incompatible browser extension' interstitial from the body", async () => {
    const handle = makeFakePage({
        html: () => "<h1>Sorry</h1><p>Incompatible browser extension or network configuration.</p>",
    });
    const block = await detectSignupBlock(handle.page);
    assert.ok(block);
    assert.equal(block!.code, ErrorCodes.CHALLENGE_REQUIRED);
});

test("detectSignupBlock returns RATE_LIMITED for an HTTP 429 status", async () => {
    const handle = makeFakePage({ html: () => "<h1>Create your account</h1>" });
    const block = await detectSignupBlock(handle.page, 429);
    assert.ok(block);
    assert.equal(block!.code, ErrorCodes.RATE_LIMITED);
    assert.match(block!.message, /429/);
    assert.match(block!.message, /do not retry in a tight loop/);
});

test("detectSignupBlock returns RATE_LIMITED when the body says 'Too many requests'", async () => {
    const handle = makeFakePage({ html: () => "<h1>Error 1015</h1><p>Too many requests.</p>" });
    const block = await detectSignupBlock(handle.page);
    assert.ok(block);
    assert.equal(block!.code, ErrorCodes.RATE_LIMITED);
});

test("detectSignupBlock returns null for a normal signup page", async () => {
    const handle = makeFakePage({
        title: () => "Sign up",
        html: () => "<h1>Create your account</h1><form><input name='first_name'></form>",
    });
    assert.equal(await detectSignupBlock(handle.page, 200), null);
});

test("throwIfSignupBlocked throws CHALLENGE_REQUIRED on a CF interstitial and is silent otherwise", async () => {
    const cf = makeFakePage({ title: () => "Just a moment...", html: () => "<div>checking your browser</div>" });
    await assert.rejects(
        () => throwIfSignupBlocked(cf.page, null, "open_signup", () => {}),
        (err: unknown) => err instanceof AutoRegError && err.code === ErrorCodes.CHALLENGE_REQUIRED,
    );

    const ok = makeFakePage({ html: () => "<h1>Create your account</h1>" });
    await throwIfSignupBlocked(ok.page, 200, "open_signup", () => {});
});

test("ensureFirstNameReady returns without filling when the field is present", async () => {
    const handle = makeFakePage({
        html: () => "<form><input name='first_name'></form>",
        locatorCount: () => 1,
    });
    await ensureFirstNameReady(handle.page, 'input[name="first_name"]', "submit_profile", () => {});
    assert.equal(handle.fills(), 0, "the guard must never fill — it only checks readiness");
});

test("ensureFirstNameReady fails fast with BROWSER_CLOSED when count is 0 and the page closed", async () => {
    const started = Date.now();
    const handle = makeFakePage({
        html: () => "",
        locatorCount: () => 0,
        closed: () => true,
    });
    await assert.rejects(
        () => ensureFirstNameReady(handle.page, 'input[name="first_name"]', "submit_profile", () => {}),
        (err: unknown) => err instanceof AutoRegError && err.code === ErrorCodes.BROWSER_CLOSED,
    );
    assert.ok(Date.now() - started < 2_000, "must fail fast, not wait the full timeout");
});

test("ensureFirstNameReady maps a CF interstitial (count 0) to CHALLENGE_REQUIRED", async () => {
    const handle = makeFakePage({
        title: () => "Just a moment...",
        html: () => "<div>Performing security verification</div>",
        locatorCount: () => 0,
    });
    await assert.rejects(
        () => ensureFirstNameReady(handle.page, 'input[name="first_name"]', "submit_profile", () => {}),
        (err: unknown) => err instanceof AutoRegError && err.code === ErrorCodes.CHALLENGE_REQUIRED,
    );
});

test("ensureFirstNameReady maps a 429 body (count 0) to RATE_LIMITED", async () => {
    const handle = makeFakePage({
        html: () => "<h1>Too many requests</h1>",
        locatorCount: () => 0,
    });
    await assert.rejects(
        () => ensureFirstNameReady(handle.page, 'input[name="first_name"]', "submit_profile", () => {}),
        (err: unknown) => err instanceof AutoRegError && err.code === ErrorCodes.RATE_LIMITED,
    );
});

test("ensureFirstNameReady throws SELECTOR (not a hang) when the form simply did not render", async () => {
    const started = Date.now();
    const handle = makeFakePage({
        html: () => "<h1>Something else entirely</h1>",
        locatorCount: () => 0,
    });
    await assert.rejects(
        () => ensureFirstNameReady(handle.page, 'input[name="first_name"]', "submit_profile", () => {}),
        (err: unknown) => err instanceof AutoRegError && err.code === ErrorCodes.SELECTOR,
    );
    assert.ok(Date.now() - started < 2_000, "must fail fast instead of waiting the full timeout");
});

test("isPageClosed reflects the page's own isClosed()", () => {
    const open = makeFakePage({ html: () => "" });
    const closed = makeFakePage({ html: () => "", closed: () => true });
    assert.equal(isPageClosed(open.page), false);
    assert.equal(isPageClosed(closed.page), true);
});
