import test from "node:test";
import assert from "node:assert/strict";

import {
    applyOverrides,
    checkNodeVersion,
    parseArgs,
    sanitizeMessage,
    type CliArgs,
} from "../src/cli.ts";
import { defaultConfig } from "../src/config.ts";
import type { AutoRegConfig } from "../src/types.js";

function baseArgs(overrides: Partial<CliArgs> = {}): CliArgs {
    return {
        dryRun: false,
        headed: false,
        headless: false,
        help: false,
        unknown: [],
        ...overrides,
    };
}

function baseConfig(overrides: Partial<AutoRegConfig> = {}): AutoRegConfig {
    const config = defaultConfig();
    config.email.domain = "example.com";
    return { ...config, ...overrides };
}

// --- sanitizeMessage -------------------------------------------------------

test("sanitizeMessage strips a standalone 6-digit verification code", () => {
    const out = sanitizeMessage("entering verification code 654321");
    assert.doesNotMatch(out, /654321/);
    assert.match(out, /\[redacted\]/);
});

test("sanitizeMessage keeps digits that are part of an email address", () => {
    const out = sanitizeMessage("identity user123456@example.com");
    assert.match(out, /user123456@example\.com/);
});

test("sanitizeMessage redacts JWT-shaped tokens", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w";
    const out = sanitizeMessage(`captured session ${jwt}`);
    assert.doesNotMatch(out, /eyJhbGci/);
    assert.match(out, /\[redacted\]/);
});

test("sanitizeMessage redacts long session-token-like runs", () => {
    const out = sanitizeMessage("session dryrun_0123456789abcdef0123456789abcdef");
    assert.doesNotMatch(out, /0123456789abcdef/);
    assert.match(out, /\[redacted\]/);
});

test("sanitizeMessage redacts a password value after a marker", () => {
    const out = sanitizeMessage("password=Sup3rSecret!");
    assert.doesNotMatch(out, /Sup3rSecret/);
    assert.match(out, /password\s*=\s*\[redacted\]/);
});

test("sanitizeMessage leaves an ordinary progress message untouched", () => {
    const msg = "opening https://authenticator.cursor.sh/sign-up";
    assert.equal(sanitizeMessage(msg), msg);
});

// --- checkNodeVersion ------------------------------------------------------

test("checkNodeVersion rejects Node 20 with a clear message", () => {
    const res = checkNodeVersion("v20.11.1");
    assert.equal(res.ok, false);
    assert.match(res.message ?? "", /Node 22/);
    assert.match(res.message ?? "", /v20\.11\.1/);
});

test("checkNodeVersion accepts Node 22 and newer", () => {
    assert.equal(checkNodeVersion("v22.0.0").ok, true);
    assert.equal(checkNodeVersion("v24.3.0").ok, true);
});

test("checkNodeVersion accepts the running interpreter", () => {
    assert.equal(checkNodeVersion(process.version).ok, true);
});

// --- applyOverrides: headed / headless -------------------------------------

test("a real run without --headed/--headless is auto-promoted to headed", () => {
    const { config, warnings } = applyOverrides(
        baseConfig({ headed: false, dryRun: false }),
        baseArgs(),
        {},
    );
    assert.equal(config.dryRun, false);
    assert.equal(config.headed, true);
    assert.ok(warnings.some((w) => w.includes("真实注册已自动改为 headed")));
});

test("--headless forces headless on a real run and suppresses the auto-headed notice", () => {
    const { config, warnings } = applyOverrides(
        baseConfig({ headed: true, dryRun: false }),
        baseArgs({ headless: true }),
        {},
    );
    assert.equal(config.headed, false);
    assert.ok(!warnings.some((w) => w.includes("真实注册已自动改为 headed")));
});

test("--headed on a real run stays headed without the auto notice", () => {
    const { config, warnings } = applyOverrides(
        baseConfig({ headed: false, dryRun: false }),
        baseArgs({ headed: true }),
        {},
    );
    assert.equal(config.headed, true);
    assert.ok(!warnings.some((w) => w.includes("真实注册已自动改为 headed")));
});

test("a dry run does not get auto-promoted to headed", () => {
    const { config, warnings } = applyOverrides(
        baseConfig({ headed: false }),
        baseArgs({ dryRun: true }),
        { AUTO_REG_VAULT_PASSWORD: "pw" },
    );
    assert.equal(config.dryRun, true);
    assert.equal(config.headed, false);
    assert.ok(!warnings.some((w) => w.includes("真实注册已自动改为 headed")));
});

// --- applyOverrides: dry-run without a vault passphrase ---------------------

test("dry-run without AUTO_REG_VAULT_PASSWORD disables encryption with a warning", () => {
    const cfg = baseConfig();
    cfg.output = { ...cfg.output, encrypt: true };
    const { config, warnings } = applyOverrides(cfg, baseArgs({ dryRun: true }), {});
    assert.equal(config.output.encrypt, false);
    assert.ok(
        warnings.some((w) =>
            w.includes("dry-run 未设口令，本次明文不落敏感库；正式跑请设 AUTO_REG_VAULT_PASSWORD"),
        ),
    );
});

test("dry-run with a vault passphrase keeps encryption on and warns nothing about it", () => {
    const cfg = baseConfig();
    cfg.output = { ...cfg.output, encrypt: true };
    const { config, warnings } = applyOverrides(cfg, baseArgs({ dryRun: true }), {
        AUTO_REG_VAULT_PASSWORD: "hunter2",
    });
    assert.equal(config.output.encrypt, true);
    assert.ok(!warnings.some((w) => w.includes("dry-run 未设口令")));
});

test("a real run without a passphrase does NOT silently disable encryption", () => {
    const cfg = baseConfig();
    cfg.output = { ...cfg.output, encrypt: true };
    const { config, warnings } = applyOverrides(cfg, baseArgs(), {});
    assert.equal(config.output.encrypt, true);
    assert.ok(!warnings.some((w) => w.includes("dry-run 未设口令")));
});

// --- parseArgs -------------------------------------------------------------

test("parseArgs recognises --headless", () => {
    const args = parseArgs(["register", "--headless"]);
    assert.equal(args.command, "register");
    assert.equal(args.headless, true);
    assert.equal(args.headed, false);
});

test("parseArgs recognises --headed and --dry-run together", () => {
    const args = parseArgs(["register", "--headed", "--dry-run"]);
    assert.equal(args.headed, true);
    assert.equal(args.dryRun, true);
    assert.equal(args.headless, false);
});
