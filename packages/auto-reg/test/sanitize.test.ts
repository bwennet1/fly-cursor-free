import test from "node:test";
import assert from "node:assert/strict";

import { sanitizeMessage } from "../src/sanitize.ts";

// Adapted from the fly-cursor-free auto-reg sanitize tests. That variant uses
// per-class placeholders ([REDACTED_JWT], [REDACTED_TOKEN], ...); this
// implementation collapses every secret class to "[redacted]", so the
// expectations below assert against that single marker.

test("redacts a JWT while keeping the surrounding message intact", () => {
    const message =
        "auth failed: bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0In0.TJVA95OrM7E2cBab30RMHrHDcEfxjoYZgeFONFh7HgQ was rejected";
    const out = sanitizeMessage(message);
    assert.doesNotMatch(out, /eyJ/);
    assert.equal(out, "auth failed: bearer [redacted] was rejected");
});

test("redacts only the value of a password fragment, any casing", () => {
    assert.equal(
        sanitizeMessage("form dump: password=Sup3r-Secret! rest ok"),
        "form dump: password=[redacted] rest ok",
    );
    assert.equal(sanitizeMessage("PASSWORD: hunter2"), "PASSWORD: [redacted]");
});

test("5- and 7-digit runs are not verification codes and survive", () => {
    assert.equal(sanitizeMessage("port 12345 pid 1234567"), "port 12345 pid 1234567");
});

test("redacts a cookie-style session token assignment", () => {
    const out = sanitizeMessage(
        "WorkosCursorSessionToken=0123456789abcdef0123456789abcdefdeadbeef expired",
    );
    assert.doesNotMatch(out, /0123456789abcdef/);
    assert.match(out, /\[redacted\]/);
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
