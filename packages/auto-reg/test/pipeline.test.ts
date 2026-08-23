import test from "node:test";
import assert from "node:assert/strict";

import { runRegister } from "../src/pipeline.ts";
import type { PipelineDeps } from "../src/pipeline.ts";
import { AutoRegError } from "../src/errors.ts";
import type {
    AccountSink,
    AutoRegConfig,
    MailboxProvider,
    PipelineEvent,
    RegisterEngine,
    RegisterResult,
} from "../src/types.js";

function makeConfig(overrides: Partial<AutoRegConfig> = {}): AutoRegConfig {
    const base: AutoRegConfig = {
        count: 1,
        dryRun: true,
        headed: false,
        timeoutMs: 1000,
        signupUrl: "https://authenticator.cursor.sh",
        email: {
            provider: "manual",
            domain: "example.com",
            codeRegex: "\\d{6}",
            pollMs: 10,
            pollTimeoutMs: 100,
        },
        identity: { emailPrefix: "user", localPartLength: 8, passwordLength: 16 },
        output: { accountsPath: "/tmp/auto-reg-should-not-be-written.json" },
        selectors: {
            firstName: "#firstName",
            lastName: "#lastName",
            email: "#email",
            password: "#password",
            continueButton: "button[type=submit]",
            otpInputs: "input[data-otp]",
            challengeHint: ".challenge",
        },
    };
    return { ...base, ...overrides };
}

interface StubHandles {
    deps: Partial<PipelineDeps>;
    appended: RegisterResult[];
    waitForCodeCalls: Array<{ email: string; since: Date }>;
    engineCalls: string[];
}

function makeStubDeps(opts: { failEmails?: Set<string> } = {}): StubHandles {
    let counter = 0;
    const appended: RegisterResult[] = [];
    const waitForCodeCalls: Array<{ email: string; since: Date }> = [];
    const engineCalls: string[] = [];

    const mailbox: MailboxProvider = {
        name: "stub-mailbox",
        async waitForCode(accountEmail: string, since: Date): Promise<string> {
            waitForCodeCalls.push({ email: accountEmail, since });
            return "654321";
        },
    };

    const engine: RegisterEngine = {
        name: "stub-engine",
        async register({ identity, waitForCode, onEvent }) {
            engineCalls.push(identity.email);
            onEvent({ stage: "submit_profile", message: "submitting profile", at: new Date().toISOString() });
            const code = await waitForCode(new Date());
            if (opts.failEmails?.has(identity.email)) {
                throw new AutoRegError("submit_code", "ENGINE", "boom");
            }
            return { sessionToken: `session-for-${identity.email}`, code };
        },
    };

    const sink: AccountSink = {
        async append(result: RegisterResult): Promise<void> {
            appended.push(result);
        },
    };

    const deps: Partial<PipelineDeps> = {
        createIdentity: (config: AutoRegConfig) => {
            counter += 1;
            return {
                firstName: `First${counter}`,
                lastName: `Last${counter}`,
                email: `user${counter}@${config.email.domain}`,
                password: `pw-${counter}-secretpass`,
                domain: config.email.domain,
            };
        },
        createMailbox: () => mailbox,
        createEngine: () => engine,
        createSink: () => sink,
    };

    return { deps, appended, waitForCodeCalls, engineCalls };
}

test("runs count times and appends each successful account", async () => {
    const { deps, appended, waitForCodeCalls, engineCalls } = makeStubDeps();

    const results = await runRegister(makeConfig({ count: 2 }), undefined, deps);

    assert.equal(results.length, 2);
    assert.ok(results.every((r) => r.ok));
    assert.equal(results[0].stage, "done");
    assert.equal(results[0].code, "654321");
    assert.equal(results[0].sessionToken, "session-for-user1@example.com");
    assert.equal(results[1].sessionToken, "session-for-user2@example.com");
    assert.equal(appended.length, 2);
    assert.deepEqual(engineCalls, ["user1@example.com", "user2@example.com"]);
});

test("wires the mailbox code-waiter with the correct account email", async () => {
    const { deps, waitForCodeCalls } = makeStubDeps();

    await runRegister(makeConfig({ count: 2 }), undefined, deps);

    assert.equal(waitForCodeCalls.length, 2);
    assert.equal(waitForCodeCalls[0].email, "user1@example.com");
    assert.equal(waitForCodeCalls[1].email, "user2@example.com");
    assert.ok(waitForCodeCalls[0].since instanceof Date);
});

test("a failing iteration is recorded but does not stop the rest", async () => {
    const { deps, appended } = makeStubDeps({ failEmails: new Set(["user1@example.com"]) });

    const results = await runRegister(makeConfig({ count: 3 }), undefined, deps);

    assert.equal(results.length, 3);
    assert.equal(results[0].ok, false);
    assert.equal(results[0].stage, "submit_code");
    assert.match(results[0].error ?? "", /boom/);
    assert.ok(results[1].ok);
    assert.ok(results[2].ok);
    assert.equal(appended.length, 2);
});

test("failure while creating an identity yields a placeholder result and continues", async () => {
    let n = 0;
    const appended: RegisterResult[] = [];
    const deps: Partial<PipelineDeps> = {
        createIdentity: (config: AutoRegConfig) => {
            n += 1;
            if (n === 1) {
                throw new Error("identity kaboom");
            }
            return {
                firstName: "",
                lastName: "",
                email: `ok${n}@${config.email.domain}`,
                password: "x",
                domain: config.email.domain,
            };
        },
        createMailbox: () => ({
            name: "m",
            async waitForCode() {
                return "000000";
            },
        }),
        createEngine: () => ({
            name: "e",
            async register({ waitForCode }) {
                await waitForCode(new Date());
                return { sessionToken: "t" };
            },
        }),
        createSink: () => ({
            async append(r: RegisterResult) {
                appended.push(r);
            },
        }),
    };

    const results = await runRegister(makeConfig({ count: 2 }), undefined, deps);

    assert.equal(results.length, 2);
    assert.equal(results[0].ok, false);
    assert.equal(results[0].stage, "failed");
    assert.equal(results[0].identity.email, "");
    assert.equal(results[0].identity.domain, "example.com");
    assert.ok(results[1].ok);
    assert.equal(appended.length, 1);
});

test("pipeline events never contain the account password", async () => {
    const { deps } = makeStubDeps();
    const events: PipelineEvent[] = [];

    await runRegister(makeConfig({ count: 2 }), (e) => events.push(e), deps);

    assert.ok(events.length > 0);
    for (const e of events) {
        assert.doesNotMatch(e.message, /secretpass/);
    }
});

test("a count of 0 performs no registrations", async () => {
    const { deps, engineCalls, appended } = makeStubDeps();

    const results = await runRegister(makeConfig({ count: 0 }), undefined, deps);

    assert.equal(results.length, 0);
    assert.equal(engineCalls.length, 0);
    assert.equal(appended.length, 0);
});
