import assert from "node:assert/strict";
import { test } from "node:test";

import { parseSessionCookie } from "../src/token/session.ts";

test("parses the URL-encoded separator form (user_xxx%3A%3Atoken)", () => {
    assert.equal(parseSessionCookie("user_01ABCDEF%3A%3Atoken123"), "token123");
});

test("parses the decoded separator form (user_xxx::token)", () => {
    assert.equal(parseSessionCookie("user_01ABCDEF::token123"), "token123");
});

test("keeps a JWT token intact, including its dots and dashes", () => {
    const jwt = "eyJhbGciOiJI.eyJzdWIiOiI1MTAw.abc-DEF_123";
    assert.equal(parseSessionCookie(`user_01ABCDEF::${jwt}`), jwt);
    assert.equal(parseSessionCookie(`user_01ABCDEF%3A%3A${jwt}`), jwt);
});

test("handles a lowercase encoded separator (%3a%3a)", () => {
    assert.equal(parseSessionCookie("user_01ABCDEF%3a%3atoken123"), "token123");
});

test("returns undefined when there is no separator", () => {
    assert.equal(parseSessionCookie("user_01ABCDEF"), undefined);
    assert.equal(parseSessionCookie("no-separator-here"), undefined);
});

test("returns undefined for an empty value or empty token segment", () => {
    assert.equal(parseSessionCookie(""), undefined);
    assert.equal(parseSessionCookie("user_01ABCDEF::"), undefined);
    assert.equal(parseSessionCookie("user_01ABCDEF%3A%3A"), undefined);
});
