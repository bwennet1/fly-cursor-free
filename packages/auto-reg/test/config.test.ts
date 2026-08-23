import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, before, test } from "node:test";

import {
    DEFAULT_SIGNUP_URL,
    applyEnvOverrides,
    applyOverrides,
    defaultConfig,
    loadConfig,
    resolveVaultPassword,
} from "../src/config.ts";
import { AutoRegError, ErrorCodes } from "../src/errors.ts";

let dir: string;
let fileCount = 0;

before(async () => {
    dir = await mkdtemp(join(tmpdir(), "auto-reg-config-"));
});

after(async () => {
    await rm(dir, { recursive: true, force: true });
});

async function writeConfigFile(contents: unknown): Promise<string> {
    const path = join(dir, `config-${fileCount++}.json`);
    const raw = typeof contents === "string" ? contents : JSON.stringify(contents);
    await writeFile(path, raw, "utf8");
    return path;
}

const NO_ENV: Record<string, string | undefined> = {};

test("defaultConfig has the documented signup URL and a manual provider", () => {
    const config = defaultConfig();
    assert.equal(config.signupUrl, DEFAULT_SIGNUP_URL);
    assert.equal(config.signupUrl, "https://authenticator.cursor.sh/sign-up");
    assert.equal(config.email.provider, "manual");
    assert.equal(config.count, 1);
});

test("loadConfig merges the file over defaults", async () => {
    const path = await writeConfigFile({
        count: 3,
        email: { domain: "example.com", pollMs: 500 },
    });
    const config = await loadConfig(path, NO_ENV);
    assert.equal(config.count, 3);
    assert.equal(config.email.domain, "example.com");
    assert.equal(config.email.pollMs, 500);
    // Untouched fields keep their defaults.
    assert.equal(config.signupUrl, DEFAULT_SIGNUP_URL);
    assert.equal(config.identity.passwordLength, 16);
    assert.equal(config.output.accountsPath, "accounts.json");
});

test("missing required fields throw AutoRegError(init, CONFIG)", async () => {
    const path = await writeConfigFile({}); // no email.domain anywhere
    await assert.rejects(loadConfig(path, NO_ENV), (error: unknown) => {
        assert.ok(error instanceof AutoRegError);
        assert.equal(error.stage, "init");
        assert.equal(error.code, ErrorCodes.CONFIG);
        assert.match(error.message, /email\.domain/);
        return true;
    });
});

test("unreadable file and invalid JSON throw AutoRegError(init, CONFIG)", async () => {
    await assert.rejects(loadConfig(join(dir, "does-not-exist.json"), NO_ENV), (error: unknown) => {
        assert.ok(error instanceof AutoRegError);
        assert.equal(error.stage, "init");
        assert.equal(error.code, ErrorCodes.CONFIG);
        return true;
    });

    const broken = await writeConfigFile("{ not json");
    await assert.rejects(loadConfig(broken, NO_ENV), (error: unknown) => {
        assert.ok(error instanceof AutoRegError);
        assert.equal(error.code, ErrorCodes.CONFIG);
        return true;
    });
});

test("imap provider requires credentials", async () => {
    const path = await writeConfigFile({
        email: {
            provider: "imap",
            domain: "example.com",
            imap: { host: "imap.example.com", port: 993, secure: true, user: "", password: "", mailbox: "INBOX" },
        },
    });
    await assert.rejects(loadConfig(path, NO_ENV), (error: unknown) => {
        assert.ok(error instanceof AutoRegError);
        assert.equal(error.code, ErrorCodes.CONFIG);
        assert.match(error.message, /imap\.user/);
        assert.match(error.message, /imap\.password/);
        return true;
    });
});

test("env overrides fill imap credentials, tempmail pin and domain", async () => {
    const path = await writeConfigFile({
        email: {
            provider: "imap",
            domain: "from-file.com",
            imap: { host: "imap.example.com", port: 993, secure: true, user: "", password: "", mailbox: "INBOX" },
        },
    });
    const config = await loadConfig(path, {
        AUTO_REG_IMAP_USER: "env-user@example.com",
        AUTO_REG_IMAP_PASSWORD: "env-secret",
        AUTO_REG_TEMPMAIL_PIN: "1234",
        AUTO_REG_DOMAIN: "from-env.com",
    });
    assert.equal(config.email.imap?.user, "env-user@example.com");
    assert.equal(config.email.imap?.password, "env-secret");
    assert.equal(config.email.receivingPin, "1234");
    assert.equal(config.email.domain, "from-env.com");
});

test("loadConfig reads overrides from process.env by default", async () => {
    const path = await writeConfigFile({ email: { domain: "from-file.com" } });
    const previous = process.env.AUTO_REG_DOMAIN;
    process.env.AUTO_REG_DOMAIN = "from-process-env.com";
    try {
        const config = await loadConfig(path);
        assert.equal(config.email.domain, "from-process-env.com");
    } finally {
        if (previous === undefined) delete process.env.AUTO_REG_DOMAIN;
        else process.env.AUTO_REG_DOMAIN = previous;
    }
});

test("applyEnvOverrides creates the imap block when only env credentials exist", () => {
    const config = defaultConfig();
    applyEnvOverrides(config, { AUTO_REG_IMAP_USER: "u", AUTO_REG_IMAP_PASSWORD: "p" });
    assert.equal(config.email.imap?.user, "u");
    assert.equal(config.email.imap?.password, "p");
    assert.equal(config.email.imap?.port, 993);
    assert.equal(config.email.imap?.mailbox, "INBOX");
});

test("applyOverrides: a live register defaults to a headed browser", () => {
    const config = defaultConfig(); // dryRun=false, headed=false
    const result = applyOverrides(config, {}, NO_ENV);
    assert.equal(result.dryRun, false);
    assert.equal(result.headed, true);
});

test("applyOverrides: --headless forces headless even for a live register", () => {
    const result = applyOverrides(defaultConfig(), { headless: true }, NO_ENV);
    assert.equal(result.dryRun, false);
    assert.equal(result.headed, false);
});

test("applyOverrides: dry runs keep the configured headed value; --headed forces a window", () => {
    const config = defaultConfig();
    assert.equal(applyOverrides(config, { dryRun: true }, NO_ENV).headed, false);
    assert.equal(applyOverrides(config, { dryRun: true, headed: true }, NO_ENV).headed, true);
});

test("applyOverrides: dry-run without a vault password disables output encryption", () => {
    const config = defaultConfig(); // output.encrypt=true
    const result = applyOverrides(config, { dryRun: true }, NO_ENV);
    assert.equal(result.output.encrypt, false);
    // The now-plaintext dry-run config no longer requires a passphrase.
    assert.equal(resolveVaultPassword(result, NO_ENV), undefined);
    // The input config was copied, not mutated.
    assert.equal(config.output.encrypt, true);
});

test("applyOverrides: dry-run keeps encryption when the vault password is set", () => {
    const result = applyOverrides(
        defaultConfig(),
        { dryRun: true },
        { AUTO_REG_VAULT_PASSWORD: "test-passphrase" },
    );
    assert.equal(result.output.encrypt, true);
});

test("applyOverrides: live runs keep encryption so a missing passphrase fails fast", () => {
    const result = applyOverrides(defaultConfig(), {}, NO_ENV);
    assert.equal(result.output.encrypt, true);
    assert.throws(() => resolveVaultPassword(result, NO_ENV));
});

test("applyOverrides: --count and --dry-run override the config file", () => {
    const result = applyOverrides(defaultConfig(), { count: 5, dryRun: true }, NO_ENV);
    assert.equal(result.count, 5);
    assert.equal(result.dryRun, true);
});

test("defaultConfig persists failures by default", () => {
    assert.equal(defaultConfig().output.persistFailures, true);
});

test("invalid codeRegex is rejected", async () => {
    const path = await writeConfigFile({
        email: { domain: "example.com", codeRegex: "([unclosed" },
    });
    await assert.rejects(loadConfig(path, NO_ENV), (error: unknown) => {
        assert.ok(error instanceof AutoRegError);
        assert.equal(error.code, ErrorCodes.CONFIG);
        assert.match(error.message, /codeRegex/);
        return true;
    });
});
