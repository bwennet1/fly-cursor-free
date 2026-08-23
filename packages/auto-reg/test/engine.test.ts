import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultConfig } from "../src/config.ts";
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

test("browser register fails with an ENGINE error when Playwright is missing (no browser launched)", async () => {
    const engine = new BrowserEngine();

    await assert.rejects(
        engine.register({
            identity: testIdentity(),
            config: testConfig({ dryRun: false }),
            waitForCode: neverCode,
            onEvent: () => {},
        }),
        (error: unknown) => {
            assert.ok(error instanceof AutoRegError);
            assert.equal(error.code, ErrorCodes.ENGINE);
            assert.match(error.message, /npx playwright install chromium/);
            return true;
        },
    );
});
