import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import {
    SCRYPT_PARAMS,
    decryptVault,
    encryptVault,
    isVaultEnvelope,
    type VaultEnvelope,
} from "../src/sink/crypto.ts";
import { createJsonSink, readAccounts } from "../src/sink/json.ts";
import { ENV_KEYS, defaultConfig, resolveVaultPassword } from "../src/config.ts";
import { AutoRegError, ErrorCodes } from "../src/errors.ts";
import type { RegisterResult } from "../src/types.js";

const PASSWORD = "correct horse battery staple";

function makeResult(email = "ada@example.com"): RegisterResult {
    const now = new Date().toISOString();
    return {
        ok: true,
        stage: "done",
        identity: {
            firstName: "Ada",
            lastName: "Lovelace",
            email,
            password: "s3cr3t-pw",
            domain: "example.com",
        },
        sessionToken: "tok_abc123",
        code: "123456",
        startedAt: now,
        finishedAt: now,
    };
}

async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "auto-reg-vault-"));
    try {
        await fn(dir);
    } finally {
        await fs.rm(dir, { recursive: true, force: true });
    }
}

/** Runs `fn` with AUTO_REG_VAULT_PASSWORD set to `value` (or removed), then restores it. */
async function withVaultEnv(
    value: string | undefined,
    fn: () => Promise<void> | void,
): Promise<void> {
    const previous = process.env[ENV_KEYS.vaultPassword];
    if (value === undefined) delete process.env[ENV_KEYS.vaultPassword];
    else process.env[ENV_KEYS.vaultPassword] = value;
    try {
        await fn();
    } finally {
        if (previous === undefined) delete process.env[ENV_KEYS.vaultPassword];
        else process.env[ENV_KEYS.vaultPassword] = previous;
    }
}

function assertSinkError(err: unknown): void {
    assert.ok(err instanceof AutoRegError);
    assert.equal(err.code, ErrorCodes.SINK);
    assert.equal(err.stage, "persist");
}

// ---------------------------------------------------------------------------
// crypto.ts — envelope format and round trips
// ---------------------------------------------------------------------------

test("encrypt/decrypt round trip preserves the data", () => {
    const data = [makeResult("a@example.com"), makeResult("b@example.com")];
    const envelope = encryptVault(data, PASSWORD);
    assert.deepEqual(decryptVault(envelope, PASSWORD), data);
});

test("envelope has the documented format with base64 binary fields", () => {
    const envelope = encryptVault([makeResult()], PASSWORD);

    assert.equal(envelope.version, 1);
    assert.equal(envelope.algo, "aes-256-gcm");
    assert.equal(envelope.kdf, "scrypt");
    assert.equal(envelope.N, SCRYPT_PARAMS.N);
    assert.equal(envelope.r, SCRYPT_PARAMS.r);
    assert.equal(envelope.p, SCRYPT_PARAMS.p);

    const base64 = /^[A-Za-z0-9+/]+={0,2}$/;
    for (const field of ["salt", "iv", "tag", "ciphertext"] as const) {
        assert.match(envelope[field], base64, `${field} must be base64`);
    }
    assert.equal(Buffer.from(envelope.salt, "base64").length, 16);
    assert.equal(Buffer.from(envelope.iv, "base64").length, 12);
    assert.equal(Buffer.from(envelope.tag, "base64").length, 16);
});

test("envelope never contains plaintext secrets", () => {
    const serialized = JSON.stringify(encryptVault([makeResult()], PASSWORD));
    assert.doesNotMatch(serialized, /s3cr3t-pw/);
    assert.doesNotMatch(serialized, /tok_abc123/);
    assert.doesNotMatch(serialized, /ada@example\.com/);
    assert.ok(!serialized.includes(PASSWORD));
});

test("salt and iv are random per encryption (no key/nonce reuse)", () => {
    const data = [makeResult()];
    const a = encryptVault(data, PASSWORD);
    const b = encryptVault(data, PASSWORD);
    assert.notEqual(a.salt, b.salt);
    assert.notEqual(a.iv, b.iv);
    assert.notEqual(a.ciphertext, b.ciphertext);
});

test("wrong password is rejected with a SINK error", () => {
    const envelope = encryptVault([makeResult()], PASSWORD);
    assert.throws(
        () => decryptVault(envelope, "not-the-password"),
        (err: unknown) => {
            assertSinkError(err);
            assert.match((err as Error).message, /wrong password or corrupted/);
            return true;
        },
    );
});

test("tampered ciphertext fails GCM authentication", () => {
    const envelope = encryptVault([makeResult()], PASSWORD);
    const bytes = Buffer.from(envelope.ciphertext, "base64");
    bytes[0] ^= 0xff;
    const tampered: VaultEnvelope = { ...envelope, ciphertext: bytes.toString("base64") };
    assert.throws(() => decryptVault(tampered, PASSWORD), AutoRegError);
});

test("absurd scrypt parameters from disk are rejected", () => {
    const envelope = encryptVault([makeResult()], PASSWORD);
    const hostile: VaultEnvelope = { ...envelope, N: 2 ** 30 };
    assert.throws(
        () => decryptVault(hostile, PASSWORD),
        (err: unknown) => {
            assertSinkError(err);
            assert.match((err as Error).message, /scrypt parameters/);
            return true;
        },
    );
});

test("isVaultEnvelope distinguishes envelopes from plaintext account arrays", () => {
    assert.ok(isVaultEnvelope(encryptVault([], PASSWORD)));
    assert.equal(isVaultEnvelope([makeResult()]), false);
    assert.equal(isVaultEnvelope({ not: "an envelope" }), false);
    assert.equal(isVaultEnvelope(null), false);
    assert.equal(isVaultEnvelope("aes-256-gcm"), false);
});

// ---------------------------------------------------------------------------
// json.ts — encrypted sink behaviour
// ---------------------------------------------------------------------------

test("encrypted sink writes an envelope: no secrets on disk, mode 0600 kept", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "vault.json");
        const sink = createJsonSink({ accountsPath, encrypt: true, password: PASSWORD });

        await sink.append(makeResult("a@example.com"));
        await sink.append(makeResult("b@example.com"));

        const raw = await fs.readFile(accountsPath, "utf8");
        assert.ok(isVaultEnvelope(JSON.parse(raw)));
        assert.doesNotMatch(raw, /s3cr3t-pw/);
        assert.doesNotMatch(raw, /tok_abc123/);
        assert.doesNotMatch(raw, /a@example\.com/);

        const stat = await fs.stat(accountsPath);
        assert.equal(stat.mode & 0o777, 0o600);

        const accounts = await readAccounts(accountsPath, PASSWORD);
        assert.deepEqual(
            accounts.map((r) => r.identity.email),
            ["a@example.com", "b@example.com"],
        );
    });
});

test("encrypted sink leaves no temp files behind (atomic rename)", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "vault.json");
        const sink = createJsonSink({ accountsPath, encrypt: true, password: PASSWORD });

        await sink.append(makeResult());
        await sink.append(makeResult());

        assert.deepEqual(await fs.readdir(dir), ["vault.json"]);
    });
});

test("a legacy plaintext array is upgraded to an envelope on the next write", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        await fs.writeFile(accountsPath, JSON.stringify([makeResult("legacy@example.com")]));

        const sink = createJsonSink({ accountsPath, encrypt: true, password: PASSWORD });
        await sink.append(makeResult("new@example.com"));

        const raw = await fs.readFile(accountsPath, "utf8");
        assert.ok(isVaultEnvelope(JSON.parse(raw)), "file must now be an encrypted envelope");
        assert.doesNotMatch(raw, /legacy@example\.com/);

        const accounts = await readAccounts(accountsPath, PASSWORD);
        assert.deepEqual(
            accounts.map((r) => r.identity.email),
            ["legacy@example.com", "new@example.com"],
        );
    });
});

test("a plaintext sink refuses to mix plaintext writes into an encrypted vault", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        const encrypted = createJsonSink({ accountsPath, encrypt: true, password: PASSWORD });
        await encrypted.append(makeResult());

        const plain = createJsonSink({ accountsPath });
        await assert.rejects(
            () => plain.append(makeResult()),
            (err: unknown) => {
                assertSinkError(err);
                assert.match((err as Error).message, /encrypted vault/);
                return true;
            },
        );

        // The vault is untouched by the refused write.
        const accounts = await readAccounts(accountsPath, PASSWORD);
        assert.equal(accounts.length, 1);
    });
});

test("wrong password on append is a SINK error and the vault is untouched", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "vault.json");
        await createJsonSink({ accountsPath, encrypt: true, password: PASSWORD }).append(makeResult());

        const wrong = createJsonSink({ accountsPath, encrypt: true, password: "wrong-pass" });
        await assert.rejects(() => wrong.append(makeResult()), (err: unknown) => {
            assertSinkError(err);
            return true;
        });

        assert.equal((await readAccounts(accountsPath, PASSWORD)).length, 1);
    });
});

test("createJsonSink with encrypt but no password anywhere throws CONFIG", async () => {
    await withVaultEnv(undefined, () => {
        assert.throws(
            () => createJsonSink({ accountsPath: "irrelevant.json", encrypt: true }),
            (err: unknown) => {
                assert.ok(err instanceof AutoRegError);
                assert.equal(err.code, ErrorCodes.CONFIG);
                assert.match(err.message, /AUTO_REG_VAULT_PASSWORD/);
                return true;
            },
        );
    });
});

test("createJsonSink falls back to AUTO_REG_VAULT_PASSWORD from the environment", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "vault.json");
        await withVaultEnv(PASSWORD, async () => {
            const sink = createJsonSink({ accountsPath, encrypt: true });
            await sink.append(makeResult("env@example.com"));
        });

        const accounts = await readAccounts(accountsPath, PASSWORD);
        assert.equal(accounts[0].identity.email, "env@example.com");
    });
});

// ---------------------------------------------------------------------------
// readAccounts — tests / future CLI `list`
// ---------------------------------------------------------------------------

test("readAccounts returns [] for a missing file", async () => {
    await withTmpDir(async (dir) => {
        assert.deepEqual(await readAccounts(path.join(dir, "nope.json"), PASSWORD), []);
    });
});

test("readAccounts reads a plaintext array file without a password", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "accounts.json");
        await fs.writeFile(accountsPath, JSON.stringify([makeResult("plain@example.com")]));

        const accounts = await readAccounts(accountsPath);
        assert.equal(accounts[0].identity.email, "plain@example.com");
    });
});

test("readAccounts on an encrypted vault without any password throws CONFIG", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "vault.json");
        await createJsonSink({ accountsPath, encrypt: true, password: PASSWORD }).append(makeResult());

        await withVaultEnv(undefined, async () => {
            await assert.rejects(() => readAccounts(accountsPath), (err: unknown) => {
                assert.ok(err instanceof AutoRegError);
                assert.equal(err.code, ErrorCodes.CONFIG);
                return true;
            });
        });
    });
});

test("readAccounts falls back to AUTO_REG_VAULT_PASSWORD for encrypted vaults", async () => {
    await withTmpDir(async (dir) => {
        const accountsPath = path.join(dir, "vault.json");
        await createJsonSink({ accountsPath, encrypt: true, password: PASSWORD }).append(
            makeResult("env-read@example.com"),
        );

        await withVaultEnv(PASSWORD, async () => {
            const accounts = await readAccounts(accountsPath);
            assert.equal(accounts[0].identity.email, "env-read@example.com");
        });
    });
});

// ---------------------------------------------------------------------------
// config.ts — encryption defaults and passphrase resolution
// ---------------------------------------------------------------------------

test("defaultConfig enables output.encrypt", () => {
    assert.equal(defaultConfig().output.encrypt, true);
});

test("resolveVaultPassword: off → undefined, missing → CONFIG, injectable for tests", () => {
    const config = defaultConfig();

    config.output.encrypt = false;
    assert.equal(resolveVaultPassword(config, {}), undefined);

    config.output.encrypt = true;
    assert.throws(
        () => resolveVaultPassword(config, {}),
        (err: unknown) => {
            assert.ok(err instanceof AutoRegError);
            assert.equal(err.stage, "init");
            assert.equal(err.code, ErrorCodes.CONFIG);
            assert.match(err.message, /AUTO_REG_VAULT_PASSWORD/);
            return true;
        },
    );

    assert.equal(resolveVaultPassword(config, { AUTO_REG_VAULT_PASSWORD: "from-env" }), "from-env");
    // Direct injection wins over env — lets dry-run tests avoid process.env.
    assert.equal(
        resolveVaultPassword(config, { AUTO_REG_VAULT_PASSWORD: "from-env" }, "injected"),
        "injected",
    );
});
