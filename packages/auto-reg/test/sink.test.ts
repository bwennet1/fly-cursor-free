import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { createJsonSink } from "../src/sink/json.ts";
import { AutoRegError } from "../src/errors.ts";
import type { RegisterResult } from "../src/types.js";

function makeResult(overrides: Partial<RegisterResult> = {}): RegisterResult {
    const now = new Date().toISOString();
    const base: RegisterResult = {
        ok: true,
        stage: "done",
        identity: {
            firstName: "Ada",
            lastName: "Lovelace",
            email: "ada@example.com",
            password: "s3cr3t-pw",
            domain: "example.com",
        },
        sessionToken: "tok_abc123",
        code: "123456",
        startedAt: now,
        finishedAt: now,
    };
    return { ...base, ...overrides };
}

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-reg-sink-"));
    try {
        await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

test("append creates a JSON array file and its parent directory", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "nested", "accounts.json");
        const sink = createJsonSink({ accountsPath });

        await sink.append(makeResult());

        const parsed = JSON.parse(await fs.readFile(accountsPath, "utf8"));
        assert.ok(Array.isArray(parsed));
        assert.equal(parsed.length, 1);
        assert.equal(parsed[0].identity.email, "ada@example.com");
    });
});

test("append accumulates results in order", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        const sink = createJsonSink({ accountsPath });

        for (const email of ["a@example.com", "b@example.com", "c@example.com"]) {
            await sink.append(
                makeResult({
                    identity: {
                        firstName: "N",
                        lastName: "N",
                        email,
                        password: "pw",
                        domain: "example.com",
                    },
                }),
            );
        }

        const parsed = JSON.parse(await fs.readFile(accountsPath, "utf8"));
        assert.equal(parsed.length, 3);
        assert.deepEqual(
            parsed.map((r: RegisterResult) => r.identity.email),
            ["a@example.com", "b@example.com", "c@example.com"],
        );
    });
});

test("append leaves no temp files behind (atomic rename)", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        const sink = createJsonSink({ accountsPath });

        await sink.append(makeResult());
        await sink.append(makeResult());

        const entries = await fs.readdir(dir);
        assert.deepEqual(entries, ["accounts.json"]);
    });
});

test("append treats an empty existing file as an empty array", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        await fs.writeFile(accountsPath, "   \n");

        const sink = createJsonSink({ accountsPath });
        await sink.append(makeResult());

        const parsed = JSON.parse(await fs.readFile(accountsPath, "utf8"));
        assert.equal(parsed.length, 1);
    });
});

test("append rejects a non-array accounts file with a SINK error", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        await fs.writeFile(accountsPath, JSON.stringify({ not: "an array" }));

        const sink = createJsonSink({ accountsPath });
        await assert.rejects(
            () => sink.append(makeResult()),
            (err: unknown) => {
                assert.ok(err instanceof AutoRegError);
                assert.equal(err.code, "SINK");
                assert.equal(err.stage, "persist");
                return true;
            },
        );
    });
});

test("append rejects invalid JSON rather than clobbering it", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        await fs.writeFile(accountsPath, "{ this is not json");

        const sink = createJsonSink({ accountsPath });
        await assert.rejects(() => sink.append(makeResult()), AutoRegError);
    });
});

test("persists credentials to disk (the accounts file is the local vault)", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        const sink = createJsonSink({ accountsPath });

        await sink.append(makeResult());

        const raw = await fs.readFile(accountsPath, "utf8");
        assert.match(raw, /s3cr3t-pw/);
        assert.match(raw, /tok_abc123/);
    });
});
