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
        turnstilePatch: true,
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
        output: { accountsPath: "/tmp/auto-reg-should-not-be-written.json", encrypt: false },
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
    // Failures are persisted too (persistFailures defaults on): 1 failure + 2
    // successes.
    assert.equal(appended.length, 3);
    const failedAppend = appended.find((r) => !r.ok);
    assert.ok(failedAppend);
    assert.equal(failedAppend?.identity.email, "user1@example.com");
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
    // The placeholder failure is persisted alongside the later success.
    assert.equal(appended.length, 2);
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

function makeAllocatingStubDeps(allocateAddress: () => Promise<string>) {
    let counter = 0;
    const engineCalls: string[] = [];
    const waitForCodeCalls: string[] = [];

    const mailbox: MailboxProvider = {
        name: "allocating-mailbox",
        allocateAddress,
        async waitForCode(accountEmail: string): Promise<string> {
            waitForCodeCalls.push(accountEmail);
            return "654321";
        },
    };

    const deps: Partial<PipelineDeps> = {
        createIdentity: (config: AutoRegConfig) => {
            counter += 1;
            return {
                firstName: `First${counter}`,
                lastName: `Last${counter}`,
                email: `local${counter}@${config.email.domain}`,
                password: `pw-${counter}`,
                domain: config.email.domain,
            };
        },
        createMailbox: () => mailbox,
        createEngine: () => ({
            name: "stub-engine",
            async register({ identity, waitForCode }) {
                engineCalls.push(identity.email);
                const code = await waitForCode(new Date());
                return { sessionToken: `session-for-${identity.email}`, code };
            },
        }),
        createSink: () => ({
            async append(): Promise<void> {},
        }),
    };

    return { deps, engineCalls, waitForCodeCalls };
}

test("mailbox.allocateAddress replaces the identity email and domain", async () => {
    let allocations = 0;
    const { deps, engineCalls, waitForCodeCalls } = makeAllocatingStubDeps(async () => {
        allocations += 1;
        return `alloc${allocations}@bwen.net`;
    });
    const events: PipelineEvent[] = [];

    const results = await runRegister(makeConfig({ count: 2, dryRun: false }), (e) => events.push(e), deps);

    assert.equal(allocations, 2);
    assert.ok(results.every((r) => r.ok));
    assert.equal(results[0].identity.email, "alloc1@bwen.net");
    assert.equal(results[0].identity.domain, "bwen.net");
    assert.equal(results[1].identity.email, "alloc2@bwen.net");
    // The generated name/password survive; only email/domain are swapped.
    assert.equal(results[0].identity.firstName, "First1");
    assert.equal(results[0].sessionToken, "session-for-alloc1@bwen.net");
    assert.deepEqual(engineCalls, ["alloc1@bwen.net", "alloc2@bwen.net"]);
    assert.deepEqual(waitForCodeCalls, ["alloc1@bwen.net", "alloc2@bwen.net"]);
    // The identity event reports the allocated address, not the local one.
    const identityEvents = events.filter((e) => e.stage === "identity").map((e) => e.message);
    assert.deepEqual(identityEvents, ["alloc1@bwen.net", "alloc2@bwen.net"]);
});

test("a failing allocateAddress records a failed iteration and continues", async () => {
    let allocations = 0;
    const { deps, engineCalls } = makeAllocatingStubDeps(async () => {
        allocations += 1;
        if (allocations === 1) {
            throw new AutoRegError("identity", "MAILBOX_ALLOCATE", "no addresses left");
        }
        return `alloc${allocations}@bwen.net`;
    });

    const results = await runRegister(makeConfig({ count: 2, dryRun: false }), undefined, deps);

    assert.equal(results.length, 2);
    assert.equal(results[0].ok, false);
    assert.equal(results[0].stage, "identity");
    assert.match(results[0].error ?? "", /no addresses left/);
    assert.ok(results[1].ok);
    assert.equal(results[1].identity.email, "alloc2@bwen.net");
    assert.deepEqual(engineCalls, ["alloc2@bwen.net"]);
});

test("dry-run skips allocateAddress so live mailbox quota is not consumed", async () => {
    let allocations = 0;
    const { deps } = makeAllocatingStubDeps(async () => {
        allocations += 1;
        return "should-not-be-used@bwen.net";
    });

    const results = await runRegister(makeConfig({ count: 1, dryRun: true }), undefined, deps);

    assert.equal(allocations, 0);
    assert.ok(results[0].ok);
    assert.equal(results[0].identity.email, "local1@example.com");
});

test("a mailbox without allocateAddress keeps the generated identity email", async () => {
    const { deps } = makeStubDeps();

    const results = await runRegister(makeConfig({ count: 1 }), undefined, deps);

    assert.ok(results[0].ok);
    assert.equal(results[0].identity.email, "user1@example.com");
    assert.equal(results[0].identity.domain, "example.com");
});

test("persisted failure records drop password/sessionToken/code, keep email/error/stage", async () => {
    const { deps, appended } = makeStubDeps({ failEmails: new Set(["user1@example.com"]) });

    const results = await runRegister(makeConfig({ count: 1 }), undefined, deps);

    assert.equal(results.length, 1);
    const failed = results[0];
    assert.equal(failed.ok, false);
    assert.equal(failed.stage, "submit_code");
    assert.equal(failed.identity.email, "user1@example.com");
    assert.match(failed.error ?? "", /boom/);
    // Secrets scrubbed on the returned result.
    assert.equal(failed.identity.password, "");
    assert.equal(failed.sessionToken, undefined);
    assert.equal(failed.code, undefined);

    // ...and on the record handed to the sink.
    assert.equal(appended.length, 1);
    const persisted = appended[0];
    assert.equal(persisted.ok, false);
    assert.equal(persisted.identity.email, "user1@example.com");
    assert.equal(persisted.identity.password, "");
    assert.equal(persisted.sessionToken, undefined);
    assert.equal(persisted.code, undefined);
});

test("persistFailures=false keeps failures out of the sink but still reports them", async () => {
    const { deps, appended } = makeStubDeps({ failEmails: new Set(["user1@example.com"]) });

    const config = makeConfig({ count: 2 });
    config.output = { ...config.output, persistFailures: false };

    const results = await runRegister(config, undefined, deps);

    assert.equal(results.length, 2);
    assert.equal(results[0].ok, false);
    assert.ok(results[1].ok);
    // Only the successful account is persisted.
    assert.equal(appended.length, 1);
    assert.ok(appended.every((r) => r.ok));
});

test("a sink error while persisting a failure does not mask the original failure", async () => {
    const deps: Partial<PipelineDeps> = {
        createIdentity: (config: AutoRegConfig) => ({
            firstName: "F",
            lastName: "L",
            email: `x@${config.email.domain}`,
            password: "pw",
            domain: config.email.domain,
        }),
        createMailbox: () => ({
            name: "m",
            async waitForCode() {
                return "000000";
            },
        }),
        createEngine: () => ({
            name: "e",
            async register() {
                throw new AutoRegError("submit_profile", "ENGINE", "engine exploded");
            },
        }),
        createSink: () => ({
            async append() {
                throw new Error("disk full");
            },
        }),
    };

    const results = await runRegister(makeConfig({ count: 1 }), undefined, deps);

    assert.equal(results.length, 1);
    assert.equal(results[0].ok, false);
    assert.equal(results[0].stage, "submit_profile");
    assert.match(results[0].error ?? "", /engine exploded/);
});
