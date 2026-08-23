import assert from "node:assert/strict";
import test from "node:test";

import { MIN_NODE_MAJOR, checkNodeVersion } from "../src/node-version.ts";

test("accepts the minimum major and newer, with or without a v prefix", () => {
    assert.equal(checkNodeVersion("22.0.0").ok, true);
    assert.equal(checkNodeVersion("22.14.0").ok, true);
    assert.equal(checkNodeVersion("v23.1.0").ok, true);
    assert.equal(checkNodeVersion("100.0.0").ok, true);
});

test("rejects older majors with an actionable message", () => {
    const res = checkNodeVersion("20.11.1");
    assert.equal(res.ok, false);
    assert.match(res.message ?? "", new RegExp(`Node ${MIN_NODE_MAJOR}`));
    assert.match(res.message ?? "", /20\.11\.1/);
});

test("rejects unparseable versions instead of passing them", () => {
    assert.equal(checkNodeVersion("banana").ok, false);
    assert.equal(checkNodeVersion("").ok, false);
    assert.equal(checkNodeVersion(".22").ok, false);
});

test("bare major versions parse", () => {
    assert.equal(checkNodeVersion("22").ok, true);
    assert.equal(checkNodeVersion("21").ok, false);
});

test("the current runtime satisfies the package engines field", () => {
    assert.equal(checkNodeVersion().ok, true);
});
