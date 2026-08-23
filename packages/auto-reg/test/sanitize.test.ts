import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeMessage } from "../src/sanitize.ts";

test("redacts JWTs", () => {
    const message =
        "auth failed: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ was rejected";
    const out = sanitizeMessage(message);
    assert.doesNotMatch(out, /eyJ/);
    assert.equal(out, "auth failed: bearer [REDACTED_JWT] was rejected");
});

test("redacts password key-value fragments (password=, password:, pwd, passwd)", () => {
    assert.equal(
        sanitizeMessage("form dump: password=Sup3r-Secret! rest ok"),
        "form dump: password=[REDACTED] rest ok",
    );
    assert.equal(sanitizeMessage("pwd: hunter2"), "pwd=[REDACTED]");
    assert.equal(sanitizeMessage("PASSWD=abc123"), "PASSWD=[REDACTED]");
});

test("redacts standalone 6-digit verification codes", () => {
    assert.equal(
        sanitizeMessage("your Cursor code is 654321."),
        "your Cursor code is [REDACTED_CODE].",
    );
    // 5- and 7-digit runs are not verification codes and survive.
    assert.equal(sanitizeMessage("port 12345 pid 1234567"), "port 12345 pid 1234567");
});

test("redacts long opaque tokens", () => {
    const out = sanitizeMessage(
        "WorkosCursorSessionToken=0123456789abcdef0123456789abcdefdeadbeef expired",
    );
    assert.doesNotMatch(out, /0123456789abcdef/);
    assert.match(out, /\[REDACTED_TOKEN\]/);
});

test("email addresses survive, even with long or dotted local parts", () => {
    const short = "delivery to user123@example.com failed";
    assert.equal(sanitizeMessage(short), short);

    const longLocal = "mailbox dev.abcdefghijklmnopqrstuvwxyz0123456789@bwen.net is full";
    assert.equal(sanitizeMessage(longLocal), longLocal);

    const longDomain = "mx for user@abcdefghijklmnopqrstuvwxyz0123456789.com unreachable";
    assert.equal(sanitizeMessage(longDomain), longDomain);
});

test("redacts every secret in a mixed message while keeping the email", () => {
    const out = sanitizeMessage(
        "register victim@example.com failed: code 654321, password=hunter2, " +
            "jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl, " +
            "session 0123456789abcdef0123456789abcdef",
    );
    assert.match(out, /victim@example\.com/);
    assert.doesNotMatch(out, /654321/);
    assert.doesNotMatch(out, /hunter2/);
    assert.doesNotMatch(out, /eyJ/);
    assert.doesNotMatch(out, /0123456789abcdef/);
});

test("leaves ordinary prose untouched", () => {
    const message = "starting 2/3 for user7@example.com (attempt took 1234 ms)";
    assert.equal(sanitizeMessage(message), message);
});
