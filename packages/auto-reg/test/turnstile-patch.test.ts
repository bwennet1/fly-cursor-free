import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import {
    resolveTurnstilePatchDir,
    resolveTurnstilePatchScript,
} from "../src/engine/turnstile-patch.ts";

const PACKAGE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXPECTED_DIR = path.join(PACKAGE_ROOT, "resources", "turnstilePatch");

test("resolveTurnstilePatchDir finds the packaged Cursor-Register extension", () => {
    const dir = resolveTurnstilePatchDir();
    assert.ok(dir, "expected resources/turnstilePatch to resolve");
    assert.equal(path.resolve(dir!), path.resolve(EXPECTED_DIR));
    assert.ok(existsSync(path.join(dir!, "manifest.json")));
    assert.ok(existsSync(path.join(dir!, "script.js")));
});

test("resolveTurnstilePatchScript points at script.js with the CDP screenXY patch", () => {
    const script = resolveTurnstilePatchScript();
    assert.ok(script);
    const source = readFileSync(script!, "utf8");
    assert.match(source, /MouseEvent\.prototype/);
    assert.match(source, /screenX/);
    assert.match(source, /screenY/);
    // Getter form (clientX + offset) — the check Turnstile actually performs.
    assert.match(source, /client/);
    assert.match(source, /PointerEvent/);
});

test("packaged manifest is MV3 MAIN-world all_frames (Cursor-Register shape)", () => {
    const dir = resolveTurnstilePatchDir();
    assert.ok(dir);
    const manifest = JSON.parse(readFileSync(path.join(dir!, "manifest.json"), "utf8")) as {
        manifest_version: number;
        content_scripts: Array<{ world?: string; all_frames?: boolean; run_at?: string }>;
    };
    assert.equal(manifest.manifest_version, 3);
    const cs = manifest.content_scripts[0];
    assert.ok(cs);
    assert.equal(cs.world, "MAIN");
    assert.equal(cs.all_frames, true);
    assert.equal(cs.run_at, "document_start");
});

test("resolveTurnstilePatchDir returns undefined when candidates are missing", () => {
    const missing = resolveTurnstilePatchDir("/tmp/auto-reg-no-such-engine", "/tmp/auto-reg-no-such-cwd");
    assert.equal(missing, undefined);
});
