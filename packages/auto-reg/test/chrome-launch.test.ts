import assert from "node:assert/strict";
import { test } from "node:test";

import {
    CHROME_PATH_ENV,
    DEFAULT_SYSTEM_CHROME,
    browserCrashError,
    chromeChannelCandidates,
    isBrowserClosedError,
    planBrowserBinary,
    type ChromeLaunchPlan,
} from "../src/engine/chrome-launch.ts";
import { AutoRegError, ErrorCodes } from "../src/errors.ts";

/** planBrowserBinary options where only the listed paths "exist" on disk. */
function onDisk(paths: string[], env: NodeJS.ProcessEnv = {}, platform: NodeJS.Platform = "linux") {
    return { env, platform, fileExists: (candidate: string) => paths.includes(candidate) };
}

// --- planBrowserBinary: binary preference order (no browser is launched) ---

test("planBrowserBinary prefers Playwright channel 'chrome' when installed Google Chrome exists", () => {
    const plan = planBrowserBinary(onDisk(["/opt/google/chrome/chrome"]));
    assert.equal(plan.source, "channel-chrome");
    assert.equal(plan.channel, "chrome");
    assert.equal(plan.executablePath, undefined);
    assert.match(plan.description, /channel "chrome"/);
});

test("planBrowserBinary prefers the chrome channel even when AUTO_REG_CHROME_PATH is also set", () => {
    const plan = planBrowserBinary(
        onDisk(
            ["/opt/google/chrome/chrome", "/custom/chrome"],
            { [CHROME_PATH_ENV]: "/custom/chrome" },
        ),
    );
    assert.equal(plan.source, "channel-chrome");
    assert.equal(plan.channel, "chrome");
});

test("planBrowserBinary uses AUTO_REG_CHROME_PATH when the channel binary is missing", () => {
    const plan = planBrowserBinary(
        onDisk(["/custom/chrome"], { [CHROME_PATH_ENV]: "/custom/chrome" }),
    );
    assert.equal(plan.source, "env-path");
    assert.equal(plan.channel, undefined);
    assert.equal(plan.executablePath, "/custom/chrome");
    assert.match(plan.description, /AUTO_REG_CHROME_PATH/);
});

test("planBrowserBinary skips a non-existent AUTO_REG_CHROME_PATH and falls to /usr/bin/google-chrome", () => {
    const plan = planBrowserBinary(
        onDisk([DEFAULT_SYSTEM_CHROME], { [CHROME_PATH_ENV]: "/does/not/exist" }),
    );
    assert.equal(plan.source, "system-chrome");
    assert.equal(plan.executablePath, DEFAULT_SYSTEM_CHROME);
});

test("planBrowserBinary uses /usr/bin/google-chrome when only the symlink install exists", () => {
    const plan = planBrowserBinary(onDisk([DEFAULT_SYSTEM_CHROME]));
    assert.equal(plan.source, "system-chrome");
    assert.equal(plan.channel, undefined);
    assert.equal(plan.executablePath, "/usr/bin/google-chrome");
});

test("planBrowserBinary falls back to bundled Chromium and says how to avoid it", () => {
    const plan = planBrowserBinary(onDisk([]));
    assert.equal(plan.source, "bundled-chromium");
    assert.equal(plan.channel, undefined);
    assert.equal(plan.executablePath, undefined);
    assert.match(plan.description, /bundled Chromium/);
    assert.match(plan.description, /AUTO_REG_CHROME_PATH/);
});

test("planBrowserBinary (bundled fallback) mentions a set-but-missing AUTO_REG_CHROME_PATH", () => {
    const plan = planBrowserBinary(onDisk([], { [CHROME_PATH_ENV]: "/gone/chrome" }));
    assert.equal(plan.source, "bundled-chromium");
    assert.match(plan.description, /\/gone\/chrome does not exist/);
});

// --- chromeChannelCandidates: per-platform channel locations ---

test("chromeChannelCandidates matches Playwright's registry per platform", () => {
    assert.deepEqual(chromeChannelCandidates("linux", {}), ["/opt/google/chrome/chrome"]);
    assert.deepEqual(chromeChannelCandidates("darwin", {}), [
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ]);
    assert.deepEqual(chromeChannelCandidates("freebsd", {}), []);
});

test("chromeChannelCandidates (win32) expands the standard install prefixes from env", () => {
    const candidates = chromeChannelCandidates("win32", {
        LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
        PROGRAMFILES: "C:\\Program Files",
    });
    assert.deepEqual(candidates, [
        "C:\\Users\\me\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe",
        "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    ]);
});

// --- isBrowserClosedError: crash signature detection ---

test("isBrowserClosedError matches Playwright's TargetClosedError message", () => {
    assert.equal(
        isBrowserClosedError(new Error("Target page, context or browser has been closed")),
        true,
    );
});

test("isBrowserClosedError matches 'browser has been closed' and 'Target closed' variants", () => {
    assert.equal(isBrowserClosedError(new Error("Browser has been closed")), true);
    assert.equal(isBrowserClosedError(new Error("Target closed")), true);
    assert.equal(isBrowserClosedError(new Error("Page crashed")), true);
});

test("isBrowserClosedError matches by error name and constructor name", () => {
    const byName = new Error("locator.fill: something went wrong");
    byName.name = "TargetClosedError";
    assert.equal(isBrowserClosedError(byName), true);

    class TargetClosedError extends Error {}
    assert.equal(isBrowserClosedError(new TargetClosedError("boom")), true);
});

test("isBrowserClosedError ignores unrelated errors and non-errors", () => {
    assert.equal(isBrowserClosedError(new Error("Timeout 8000ms exceeded")), false);
    assert.equal(isBrowserClosedError(new Error("net::ERR_CONNECTION_REFUSED")), false);
    assert.equal(isBrowserClosedError(null), false);
    assert.equal(isBrowserClosedError(undefined), false);
    assert.equal(isBrowserClosedError("browser has been closed"), false);
});

// --- browserCrashError: actionable bilingual ENGINE error ---

function bundledPlan(): ChromeLaunchPlan {
    return planBrowserBinary({ env: {}, platform: "linux", fileExists: () => false });
}

test("browserCrashError is an AutoRegError(ENGINE) carrying the failing stage", () => {
    const error = browserCrashError("submit_profile", bundledPlan());
    assert.ok(error instanceof AutoRegError);
    assert.equal(error.code, ErrorCodes.ENGINE);
    assert.equal(error.stage, "submit_profile");
});

test("browserCrashError explains the crash in Chinese and English with the retry advice", () => {
    const error = browserCrashError("submit_profile", bundledPlan());
    // Chinese half: bundled Chromium crashed, retry with system Chrome / env path.
    assert.match(error.message, /Playwright 自带的 Chromium/);
    assert.match(error.message, /崩溃/);
    assert.match(error.message, /Google Chrome/);
    // English half with the same advice.
    assert.match(error.message, /bundled Chromium crashing/i);
    assert.match(error.message, /crashed or was closed/i);
    assert.match(error.message, new RegExp(CHROME_PATH_ENV));
});

test("browserCrashError names the explicit binary that crashed and appends the cause", () => {
    const plan = planBrowserBinary(
        onDisk(["/custom/chrome"], { [CHROME_PATH_ENV]: "/custom/chrome" }),
    );
    const cause = new Error("Target page, context or browser has been closed");
    const error = browserCrashError("submit_code", plan, cause);
    assert.match(error.message, /\/custom\/chrome/);
    assert.match(error.message, /Target page, context or browser has been closed/);
});
