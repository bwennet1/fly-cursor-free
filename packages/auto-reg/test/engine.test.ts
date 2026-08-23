import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultConfig } from "../src/config.ts";
import { BrowserEngine, DryRunEngine, createEngine } from "../src/engine/index.ts";
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
