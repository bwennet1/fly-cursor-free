import assert from "node:assert/strict";
import { test } from "node:test";

import { createMailbox } from "../src/email/index.ts";
import {
    LIAO_BOT_DEFAULTS,
    LiaoBotMailbox,
    MAILBOX_ALLOCATE_ERROR,
} from "../src/email/liao-bot.ts";
import type { FetchLike } from "../src/email/tempmail-plus.ts";
import { AutoRegError } from "../src/errors.ts";
import type { AutoRegConfig, EmailConfig } from "../src/types.ts";

function makeConfig(overrides: Partial<EmailConfig> = {}): EmailConfig {
    return {
        provider: "liao_bot",
        domain: "bwen.net",
        codeRegex: "\\b(\\d{6})\\b",
        pollMs: 10,
        pollTimeoutMs: 1000,
        ...overrides,
    };
}

/** Deterministic fake clock: sleeping advances "now", nothing waits in real time. */
function makeClock() {
    const sleeps: number[] = [];
    let t = 0;
    return {
        now: () => t,
        sleep: async (ms: number) => {
            sleeps.push(ms);
            t += ms;
        },
        sleeps,
    };
}

/** Fake fetch: the handler returns a JSON body, an Error, or an HTTP status. */
function jsonFetch(handler: (url: string, call: number) => unknown): { fn: FetchLike; calls: string[] } {
    const calls: string[] = [];
    const fn: FetchLike = async (url) => {
        calls.push(url);
        const body = handler(url, calls.length);
        if (body instanceof Error) throw body;
        if (typeof body === "number") {
            return { ok: false, status: body, json: async () => ({}) };
        }
        return { ok: true, status: 200, json: async () => body };
    };
    return { fn, calls };
}

function makeMailbox(
    handler: (url: string, call: number) => unknown,
    configOverrides: Partial<EmailConfig> = {},
) {
    const clock = makeClock();
    const { fn, calls } = jsonFetch(handler);
    const mailbox = new LiaoBotMailbox(makeConfig(configOverrides), {
        fetchFn: fn,
        sleep: clock.sleep,
        now: clock.now,
    });
    return { mailbox, calls, clock };
}

test("exposes the documented default endpoints", () => {
    assert.equal(LIAO_BOT_DEFAULTS.baseUrl, "https://liao.bot/email-api");
    assert.equal(LIAO_BOT_DEFAULTS.allocatePath, "/get-email");
    assert.equal(LIAO_BOT_DEFAULTS.firstEmailPath, "/first-email");
});

test("allocateAddress calls get-email with the configured domain and returns the address", async () => {
    const { mailbox, calls } = makeMailbox(() => ({
        action: "random",
        domain: "bwen.net",
        email: "795u8mi5lzyqm@bwen.net",
        remaining: 199,
        tip: "...",
        total: 200,
    }));

    const email = await mailbox.allocateAddress();

    assert.equal(email, "795u8mi5lzyqm@bwen.net");
    assert.deepEqual(calls, ["https://liao.bot/email-api/get-email?domain=bwen.net"]);
});

test("allocateAddress honors custom baseUrl and paths from email.liao", async () => {
    const { mailbox, calls } = makeMailbox(() => ({ email: "x@custom.example" }), {
        domain: "custom.example",
        liao: {
            baseUrl: "https://proxy.example/liao/",
            allocatePath: "alloc",
            firstEmailPath: "/inbox-first",
        },
    });

    assert.equal(await mailbox.allocateAddress(), "x@custom.example");
    assert.deepEqual(calls, ["https://proxy.example/liao/alloc?domain=custom.example"]);
});

test("allocateAddress uses the first entry of a '/'-separated domain pool", async () => {
    const { mailbox, calls } = makeMailbox(() => ({ email: "a@bwen.net" }), {
        domain: " @bwen.net / other.net ",
    });

    await mailbox.allocateAddress();
    assert.deepEqual(calls, ["https://liao.bot/email-api/get-email?domain=bwen.net"]);
});

test("allocateAddress wraps HTTP failures in AutoRegError(identity, MAILBOX_ALLOCATE)", async () => {
    const { mailbox } = makeMailbox(() => 503);

    await assert.rejects(mailbox.allocateAddress(), (err: unknown) => {
        assert.ok(err instanceof AutoRegError);
        assert.equal(err.stage, "identity");
        assert.equal(err.code, MAILBOX_ALLOCATE_ERROR);
        assert.match(err.message, /503/);
        return true;
    });
});

test("allocateAddress rejects a response without a usable email", async () => {
    const { mailbox } = makeMailbox(() => ({ action: "random", remaining: 0 }));

    await assert.rejects(mailbox.allocateAddress(), (err: unknown) => {
        assert.ok(err instanceof AutoRegError);
        assert.equal(err.stage, "identity");
        assert.equal(err.code, MAILBOX_ALLOCATE_ERROR);
        return true;
    });
});

test("waitForCode polls first-email with femail until has_mail flips true", async () => {
    const { mailbox, calls, clock } = makeMailbox((_url, call) => {
        if (call <= 2) {
            return { email: "acct@bwen.net", has_mail: false, message: "暂无邮件" };
        }
        return {
            email: "acct@bwen.net",
            has_mail: true,
            subject: "Verify your email",
            text: "Your verification code is 654321.",
        };
    });

    const code = await mailbox.waitForCode("acct@bwen.net", new Date(0));

    assert.equal(code, "654321");
    assert.equal(calls[0], "https://liao.bot/email-api/first-email?femail=acct%40bwen.net");
    assert.equal(clock.sleeps.length, 2);
});

test("a dedicated code field wins over other digits in the body", async () => {
    const { mailbox } = makeMailbox(() => ({
        has_mail: true,
        code: "112233",
        text: "Sent at 202608, order 999999.",
    }));

    assert.equal(await mailbox.waitForCode("acct@bwen.net", new Date(0)), "112233");
});

test("extracts the code from nested mail.* fields and html", async () => {
    const { mailbox } = makeMailbox(() => ({
        has_mail: true,
        mail: {
            subject: "Sign in",
            html: "<p>Your verification code is <b>905712</b>.</p>",
        },
    }));

    assert.equal(await mailbox.waitForCode("acct@bwen.net", new Date(0)), "905712");
});

test("supports the get-email {exists, has_mail} compat shape", async () => {
    const { mailbox } = makeMailbox(() => ({
        exists: true,
        content: "Verification code: 445566",
    }));

    assert.equal(await mailbox.waitForCode("acct@bwen.net", new Date(0)), "445566");
});

test("never parses a code out of a has_mail:false placeholder message", async () => {
    const { mailbox } = makeMailbox((_url, call) => {
        if (call === 1) {
            // Digits inside the "no mail yet" payload must not be mistaken for a code.
            return { has_mail: false, message: "暂无邮件 (retry 123456)" };
        }
        return { has_mail: true, text: "code 777888" };
    });

    assert.equal(await mailbox.waitForCode("acct@bwen.net", new Date(0)), "777888");
});

test("keeps polling when has_mail is true but no code is present yet", async () => {
    const { mailbox, clock } = makeMailbox((_url, call) => {
        if (call === 1) return { has_mail: true, subject: "Welcome!", text: "no digits here" };
        return { has_mail: true, text: "your code is 314159" };
    });

    assert.equal(await mailbox.waitForCode("acct@bwen.net", new Date(0)), "314159");
    assert.equal(clock.sleeps.length, 1);
});

test("treats fetch failures as transient and retries until the mail shows up", async () => {
    const { mailbox } = makeMailbox((_url, call) => {
        if (call === 1) return new Error("ECONNRESET");
        return { has_mail: true, text: "your code is 424242" };
    });

    assert.equal(await mailbox.waitForCode("acct@bwen.net", new Date(0)), "424242");
});

test("times out with AutoRegError(wait_mailbox, MAILBOX_TIMEOUT) when no mail arrives", async () => {
    const { mailbox } = makeMailbox(() => ({ has_mail: false, message: "暂无邮件" }), {
        pollMs: 10,
        pollTimeoutMs: 35,
    });

    await assert.rejects(
        mailbox.waitForCode("acct@bwen.net", new Date(0)),
        (err: unknown) => {
            assert.ok(err instanceof AutoRegError);
            assert.equal(err.stage, "wait_mailbox");
            assert.equal(err.code, "MAILBOX_TIMEOUT");
            assert.match(err.message, /acct@bwen\.net/);
            return true;
        },
    );
});

test("createMailbox dispatches provider liao_bot to LiaoBotMailbox", () => {
    const config = { email: makeConfig() } as AutoRegConfig;
    const mailbox = createMailbox(config);
    assert.ok(mailbox instanceof LiaoBotMailbox);
    assert.equal(mailbox.name, "liao_bot");
    assert.equal(typeof mailbox.allocateAddress, "function");
});
