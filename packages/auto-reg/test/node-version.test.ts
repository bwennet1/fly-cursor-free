import test from "node:test";
import assert from "node:assert/strict";

import { MIN_NODE_MAJOR, checkNodeVersion } from "../src/node-version.ts";

test("accepts the minimum major and newer, with or without a v prefix", () => {
    assert.equal(checkNodeVersion("22.0.0"), undefined);
    assert.equal(checkNodeVersion("22.14.0"), undefined);
    assert.equal(checkNodeVersion("v23.1.0"), undefined);
    assert.equal(checkNodeVersion("100.0.0"), undefined);
});

test("rejects older majors with an actionable message", () => {
    const message = checkNodeVersion("20.11.1");
    assert.ok(message);
    assert.match(message, new RegExp(`Node ${MIN_NODE_MAJOR}\\+`));
    assert.match(message, /20\.11\.1/);
});

test("rejects unparseable versions instead of passing them", () => {
    assert.ok(checkNodeVersion("banana"));
    assert.ok(checkNodeVersion(""));
    assert.ok(checkNodeVersion(".22"));
});

test("honours a custom minimum major", () => {
    assert.ok(checkNodeVersion("24.0.0", 25));
    assert.equal(checkNodeVersion("25.0.0", 25), undefined);
});

test("bare major versions parse", () => {
    assert.equal(checkNodeVersion("22"), undefined);
    assert.ok(checkNodeVersion("21"));
});

test("the current runtime satisfies the package engines field", () => {
    assert.equal(checkNodeVersion(), undefined);
});
