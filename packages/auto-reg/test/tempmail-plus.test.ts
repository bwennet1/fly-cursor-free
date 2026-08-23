import assert from "node:assert/strict";
import { test } from "node:test";
import { TempMailPlusMailbox, type FetchLike } from "../src/email/tempmail-plus.ts";
import { AutoRegError } from "../src/errors.ts";
import type { EmailConfig } from "../src/types.ts";

function makeConfig(overrides: Partial<EmailConfig> = {}): EmailConfig {
    return {
        provider: "tempmail_plus",
        domain: "example.com",
        receivingEmail: "inbox@mailto.plus",
        receivingPin: "pin123",
        codeRegex: "\\b\\d{6}\\b",
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

/** Fake fetch: the handler returns a JSON body, or an Error to simulate a network failure. */
function jsonFetch(handler: (url: string, call: number) => unknown): { fn: FetchLike; calls: string[] } {
    const calls: string[] = [];
    const fn: FetchLike = async (url) => {
        calls.push(url);
        const body = handler(url, calls.length);
        if (body instanceof Error) throw body;
        return { ok: true, status: 200, json: async () => body };
    };
    return { fn, calls };
}

const isDetailUrl = (url: string) => /\/api\/mails\/\d+/.test(url);

test("returns the code from a mail addressed to the account and calls the documented endpoints", async () => {
    const clock = makeClock();
    const { fn, calls } = jsonFetch((url) => {
        if (isDetailUrl(url)) {
            return {
                to: "New User <acct_x@example.com>",
                subject: "Verify your email",
                text: "Your verification code is 654321.",
                html: "",
            };
        }
        return { mail_list: [{ mail_id: 101, subject: "Verify your email" }] };
    });

    const mailbox = new TempMailPlusMailbox(makeConfig(), { fetchFn: fn, sleep: clock.sleep, now: clock.now });
    const code = await mailbox.waitForCode("acct_x@example.com", new Date(0));

    assert.equal(code, "654321");
    assert.equal(calls[0], "https://tempmail.plus/api/mails?email=inbox%40mailto.plus&limit=20&epin=pin123");
    assert.equal(calls[1], "https://tempmail.plus/api/mails/101?email=inbox%40mailto.plus&epin=pin123");
});

test("keeps polling until the mail arrives", async () => {
    const clock = makeClock();
    const { fn } = jsonFetch((url, call) => {
        if (isDetailUrl(url)) {
            return { to: "acct@example.com", subject: "code", text: "code 111222" };
        }
        return call <= 2 ? { mail_list: [] } : { mail_list: [{ mail_id: 7 }] };
    });

    const mailbox = new TempMailPlusMailbox(makeConfig(), { fetchFn: fn, sleep: clock.sleep, now: clock.now });
    const code = await mailbox.waitForCode("acct@example.com", new Date(0));

    assert.equal(code, "111222");
    assert.equal(clock.sleeps.length, 2);
});

test("ignores mail for other recipients, fetches each detail only once, then times out", async () => {
    const clock = makeClock();
    const { fn, calls } = jsonFetch((url) => {
        if (isDetailUrl(url)) {
            return { to: "someone-else@example.com", subject: "hi", text: "code 999888" };
        }
        return { mail_list: [{ mail_id: 55 }] };
    });

    const mailbox = new TempMailPlusMailbox(makeConfig({ pollMs: 10, pollTimeoutMs: 35 }), {
        fetchFn: fn,
        sleep: clock.sleep,
        now: clock.now,
    });

    await assert.rejects(
        mailbox.waitForCode("acct@example.com", new Date(0)),
        (err: unknown) => {
            assert.ok(err instanceof AutoRegError);
            assert.equal(err.code, "MAILBOX_TIMEOUT");
            assert.equal(err.stage, "wait_mailbox");
            assert.match(err.message, /acct@example\.com/);
            return true;
        },
    );
    assert.equal(calls.filter((url) => url.includes("/api/mails/55")).length, 1);
});

test("times out with MAILBOX_TIMEOUT when the inbox stays empty", async () => {
    const clock = makeClock();
    const { fn } = jsonFetch(() => ({ mail_list: [] }));

    const mailbox = new TempMailPlusMailbox(makeConfig({ pollMs: 10, pollTimeoutMs: 25 }), {
        fetchFn: fn,
        sleep: clock.sleep,
        now: clock.now,
    });

    await assert.rejects(
        mailbox.waitForCode("acct@example.com", new Date(0)),
        (err: unknown) => {
            assert.ok(err instanceof AutoRegError);
            assert.equal(err.code, "MAILBOX_TIMEOUT");
            return true;
        },
    );
});

test("treats fetch failures as transient and retries until the mail shows up", async () => {
    const clock = makeClock();
    const { fn } = jsonFetch((url, call) => {
        if (call === 1) return new Error("ECONNRESET");
        if (isDetailUrl(url)) {
            return { to: "acct@example.com", subject: "", text: "your code is 424242" };
        }
        return { mail_list: [{ mail_id: 9 }] };
    });

    const mailbox = new TempMailPlusMailbox(makeConfig(), { fetchFn: fn, sleep: clock.sleep, now: clock.now });
    assert.equal(await mailbox.waitForCode("acct@example.com", new Date(0)), "424242");
});

test("extracts the code from html-only mail", async () => {
    const clock = makeClock();
    const { fn } = jsonFetch((url) => {
        if (isDetailUrl(url)) {
            return {
                to: "acct@example.com",
                subject: "",
                text: "",
                html: "<p>Your code is <b>905712</b>.</p>",
            };
        }
        return { mail_list: [{ mail_id: 3 }] };
    });

    const mailbox = new TempMailPlusMailbox(makeConfig(), { fetchFn: fn, sleep: clock.sleep, now: clock.now });
    assert.equal(await mailbox.waitForCode("acct@example.com", new Date(0)), "905712");
});

test("requires receivingEmail in the config", () => {
    assert.throws(
        () => new TempMailPlusMailbox(makeConfig({ receivingEmail: undefined })),
        (err: unknown) => {
            assert.ok(err instanceof AutoRegError);
            assert.equal(err.code, "CONFIG");
            return true;
        },
    );
});
