import assert from "node:assert/strict";
import { test } from "node:test";

import { defaultConfig } from "../src/config.ts";
import { createIdentity, generatePassword, pickDomain } from "../src/identity.ts";
import { FIRST_NAMES, LAST_NAMES } from "../src/names.ts";
import type { AutoRegConfig } from "../src/types.js";

function testConfig(overrides?: { domain?: string; emailPrefix?: string }): AutoRegConfig {
    const config = defaultConfig();
    config.email.domain = overrides?.domain ?? "example.com";
    if (overrides?.emailPrefix !== undefined) config.identity.emailPrefix = overrides.emailPrefix;
    return config;
}

test("built-in name pools have at least 20 entries each", () => {
    assert.ok(FIRST_NAMES.length >= 20, `FIRST_NAMES has ${FIRST_NAMES.length}`);
    assert.ok(LAST_NAMES.length >= 20, `LAST_NAMES has ${LAST_NAMES.length}`);
});

test("createIdentity uses the name pools and the configured domain", () => {
    const identity = createIdentity(testConfig());
    assert.ok(FIRST_NAMES.includes(identity.firstName));
    assert.ok(LAST_NAMES.includes(identity.lastName));
    assert.equal(identity.domain, "example.com");
    assert.ok(identity.email.endsWith("@example.com"));
});

test("email is prefix + random local part of the configured length", () => {
    const config = testConfig({ emailPrefix: "dev." });
    const identity = createIdentity(config);
    const [localPart, domain] = identity.email.split("@");
    assert.equal(domain, "example.com");
    assert.ok(localPart!.startsWith("dev."));
    const random = localPart!.slice("dev.".length);
    assert.equal(random.length, config.identity.localPartLength);
    assert.match(random, /^[a-z0-9]+$/);
});

test("bare local part starts with a letter", () => {
    for (let i = 0; i < 50; i++) {
        const identity = createIdentity(testConfig({ emailPrefix: "" }));
        assert.match(identity.email, /^[a-z][a-z0-9]*@example\.com$/);
    }
});

test("password has configured length with lower/upper/digit and nothing else", () => {
    for (let i = 0; i < 50; i++) {
        const password = generatePassword(16);
        assert.equal(password.length, 16);
        assert.match(password, /[a-z]/);
        assert.match(password, /[A-Z]/);
        assert.match(password, /[0-9]/);
        assert.match(password, /^[a-zA-Z0-9]+$/);
    }
});

test("identities are unique without relying on the clock", () => {
    const realDateNow = Date.now;
    // If generation secretly depended on Date.now for uniqueness, freezing the
    // clock would produce collisions.
    Date.now = () => 1_700_000_000_000;
    try {
        const emails = new Set<string>();
        const passwords = new Set<string>();
        for (let i = 0; i < 200; i++) {
            const identity = createIdentity(testConfig());
            emails.add(identity.email);
            passwords.add(identity.password);
        }
        assert.equal(emails.size, 200);
        assert.equal(passwords.size, 200);
    } finally {
        Date.now = realDateNow;
    }
});

test("slash-separated domain pool picks a random member", () => {
    const pool = ["a.com", "b.org", "c.net"];
    const seen = new Set<string>();
    for (let i = 0; i < 100; i++) {
        const domain = pickDomain("a.com/ b.org /@c.net");
        assert.ok(pool.includes(domain), `unexpected domain ${domain}`);
        seen.add(domain);
    }
    assert.equal(seen.size, pool.length, "each pool member should appear over 100 draws");

    const identity = createIdentity(testConfig({ domain: "a.com/b.org/c.net" }));
    assert.ok(pool.includes(identity.domain));
    assert.ok(identity.email.endsWith(`@${identity.domain}`));
});
