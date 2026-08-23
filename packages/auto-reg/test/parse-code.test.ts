import assert from "node:assert/strict";
import { test } from "node:test";
import { compileCodeRegex, parseVerificationCode } from "../src/email/parse-code.ts";
import { AutoRegError } from "../src/errors.ts";

test("extracts a plain 6-digit code", () => {
    assert.equal(parseVerificationCode("Your verification code is 483920."), "483920");
});

test("returns null when there is no standalone 6-digit run", () => {
    assert.equal(parseVerificationCode("no digits here"), null);
    assert.equal(parseVerificationCode("12345 is short and 1234567 is long"), null);
    assert.equal(parseVerificationCode(""), null);
});

test("falls back to the first candidate when nothing disambiguates", () => {
    assert.equal(parseVerificationCode("111222 then 333444"), "111222");
});

test("prefers the candidate near a code keyword", () => {
    // Filler keeps the first number outside the keyword window of the second.
    const filler = "x".repeat(80);
    const text = `Order #555444 confirmed. ${filler} Your one-time code: 918273`;
    assert.equal(parseVerificationCode(text), "918273");
});

test("keyword may follow the code", () => {
    const filler = "x".repeat(80);
    const text = `Ticket 445566 update. ${filler} 918273 is your Cursor sign-in code.`;
    assert.equal(parseVerificationCode(text), "918273");
});

test("demotes date-like YYYYMM values when a better candidate exists", () => {
    const text = "Statement 202608 attached. Use 737251 to continue.";
    assert.equal(parseVerificationCode(text), "737251");
});

test("demotes date-like values even when they appear first", () => {
    assert.equal(parseVerificationCode("202612 ref, then 845123"), "845123");
});

test("still returns a date-like value when it is the only candidate", () => {
    assert.equal(parseVerificationCode("Reference 202611"), "202611");
});

test("keyword proximity beats year-likeness", () => {
    const filler = "y".repeat(80);
    const text = `Random 555444 noise ${filler} your verification code is 202603.`;
    assert.equal(parseVerificationCode(text), "202603");
});

test("6-digit values with an invalid month are not treated as dates", () => {
    // 202699 starts with "20" but 99 is not a month, so it stays a normal code.
    assert.equal(parseVerificationCode("202699 then 845123"), "202699");
});

test("supports a custom regex", () => {
    assert.equal(parseVerificationCode("pin: 4832", /\b\d{4}\b/), "4832");
    assert.equal(parseVerificationCode("code 123456", /\b\d{8}\b/), null);
});

test("accepts a regex that already has the global flag", () => {
    assert.equal(parseVerificationCode("code 654321", /\b\d{6}\b/g), "654321");
});

test("recognizes Chinese keyword context", () => {
    const filler = "z".repeat(80);
    const text = `编号 111222 ${filler} 您的验证码:778899`;
    assert.equal(parseVerificationCode(text), "778899");
});

test("compileCodeRegex falls back to the 6-digit default", () => {
    assert.equal(parseVerificationCode("abc 123456", compileCodeRegex(undefined)), "123456");
    assert.equal(parseVerificationCode("pin 1234", compileCodeRegex("\\b\\d{4}\\b")), "1234");
});

test("compileCodeRegex wraps invalid patterns in AutoRegError CONFIG", () => {
    assert.throws(
        () => compileCodeRegex("("),
        (err: unknown) => {
            assert.ok(err instanceof AutoRegError);
            assert.equal(err.code, "CONFIG");
            return true;
        },
    );
});
