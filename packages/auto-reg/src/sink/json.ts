import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";

import type { AccountSink, RegisterResult } from "../types.js";
import { AutoRegError, ErrorCodes } from "../errors.ts";
import { ENV_KEYS } from "../config.ts";
import { decryptVault, encryptVault, isVaultEnvelope, type VaultEnvelope } from "./crypto.ts";

export interface JsonSinkOptions {
    /** Path to the JSON file that holds the registered accounts. */
    accountsPath: string;
    /**
     * When true the accounts file is persisted as an AES-256-GCM vault
     * envelope (see sink/crypto.ts) instead of a plaintext JSON array.
     * Defaults to false so existing callers keep the plaintext behaviour.
     */
    encrypt?: boolean;
    /**
     * Vault passphrase; falls back to AUTO_REG_VAULT_PASSWORD. Only consulted
     * when `encrypt` is true. Never hardcode this — inject it in tests or set
     * the environment variable.
     */
    password?: string;
}

/**
 * Creates a sink that appends {@link RegisterResult} entries to the accounts
 * file. Each append does a read/modify/write cycle and commits atomically by
 * writing a sibling temp file (mode 0600) and renaming it over the target, so
 * a crash mid write can never leave a half-written accounts file.
 *
 * In plaintext mode the full result (including password and session token) is
 * stored on disk as a JSON array — keeping secrets out of stdout is the
 * caller's job. In encrypted mode the same array is sealed in a vault
 * envelope; a legacy plaintext file is accepted on read and upgraded to an
 * envelope on the next write. A plaintext sink pointed at an encrypted vault
 * refuses to write rather than mixing formats.
 */
export function createJsonSink(options: JsonSinkOptions): AccountSink {
    const accountsPath = path.resolve(options.accountsPath);
    const encrypt = options.encrypt === true;
    // Resolved eagerly so a missing passphrase fails at wiring time instead of
    // mid-run during the first persist.
    const password = encrypt ? requireVaultPassword(options.password) : undefined;

    return {
        async append(result: RegisterResult): Promise<void> {
            const existing = await readForAppend(accountsPath, password);
            existing.push(scrubFailedRecord(result));
            await writeAtomic(accountsPath, existing, password);
        },
    };
}

/**
 * Reads the accounts file, decrypting it when it is a vault envelope. The
 * passphrase comes from `password` or AUTO_REG_VAULT_PASSWORD. A plaintext
 * array is returned as-is and a missing file yields an empty array. Intended
 * for tests and a future CLI `list` command.
 */
export async function readAccounts(
    accountsPath: string,
    password?: string,
): Promise<RegisterResult[]> {
    const resolved = path.resolve(accountsPath);
    const file = await readVaultFile(resolved);
    if (file.kind === "missing") {
        return [];
    }
    if (file.kind === "plain") {
        return file.accounts;
    }
    const pass = password ?? process.env[ENV_KEYS.vaultPassword];
    if (!pass) {
        throw new AutoRegError(
            "init",
            ErrorCodes.CONFIG,
            `accounts file ${resolved} is encrypted but no vault password was given ` +
                `(pass one or set ${ENV_KEYS.vaultPassword})`,
        );
    }
    return decryptAccounts(file.envelope, pass, resolved);
}

type VaultFile =
    | { kind: "missing" }
    | { kind: "plain"; accounts: RegisterResult[] }
    | { kind: "encrypted"; envelope: VaultEnvelope };

async function readForAppend(
    accountsPath: string,
    password: string | undefined,
): Promise<RegisterResult[]> {
    const file = await readVaultFile(accountsPath);
    if (file.kind === "missing") {
        return [];
    }
    if (file.kind === "plain") {
        // With encryption on, a legacy plaintext array is still readable; the
        // write that follows re-persists everything as an encrypted envelope.
        return file.accounts;
    }
    if (password === undefined) {
        throw new AutoRegError(
            "persist",
            ErrorCodes.SINK,
            `accounts file ${accountsPath} is an encrypted vault; refusing to mix plaintext ` +
                `writes into it — set output.encrypt=true and provide ${ENV_KEYS.vaultPassword}`,
        );
    }
    return decryptAccounts(file.envelope, password, accountsPath);
}

async function readVaultFile(accountsPath: string): Promise<VaultFile> {
    let raw: string;
    try {
        raw = await fs.readFile(accountsPath, "utf8");
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return { kind: "missing" };
        }
        throw sinkError(`failed to read accounts file ${accountsPath}: ${errMessage(err)}`);
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return { kind: "missing" };
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (err) {
        throw sinkError(`accounts file ${accountsPath} is not valid JSON: ${errMessage(err)}`);
    }

    if (isVaultEnvelope(parsed)) {
        return { kind: "encrypted", envelope: parsed };
    }
    if (Array.isArray(parsed)) {
        return { kind: "plain", accounts: parsed as RegisterResult[] };
    }
    throw sinkError(
        `accounts file ${accountsPath} must contain a JSON array or an encrypted vault envelope`,
    );
}

function decryptAccounts(
    envelope: VaultEnvelope,
    password: string,
    accountsPath: string,
): RegisterResult[] {
    const decrypted = decryptVault(envelope, password);
    if (!Array.isArray(decrypted)) {
        throw sinkError(`decrypted vault ${accountsPath} does not contain a JSON array`);
    }
    return decrypted as RegisterResult[];
}

async function writeAtomic(
    accountsPath: string,
    data: RegisterResult[],
    password: string | undefined,
): Promise<void> {
    const dir = path.dirname(accountsPath);
    await fs.mkdir(dir, { recursive: true });

    const payload: unknown = password === undefined ? data : encryptVault(data, password);
    const serialized = `${JSON.stringify(payload, null, 2)}\n`;
    const tmpPath = path.join(
        dir,
        `.${path.basename(accountsPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );

    try {
        await fs.writeFile(tmpPath, serialized, { encoding: "utf8", mode: 0o600 });
        await fs.rename(tmpPath, accountsPath);
    } catch (err) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw sinkError(`failed to persist accounts file ${accountsPath}: ${errMessage(err)}`);
    }
}

/**
 * Defense in depth: even if a caller forgets to scrub a failed attempt,
 * the sink never writes password / sessionToken / verification code for
 * `ok: false` records. Success records are stored unchanged.
 */
export function scrubFailedRecord(result: RegisterResult): RegisterResult {
    if (result.ok) {
        return result;
    }
    return {
        ...result,
        identity: { ...result.identity, password: "" },
        sessionToken: undefined,
        code: undefined,
    };
}

function requireVaultPassword(explicit?: string): string {
    const password = explicit ?? process.env[ENV_KEYS.vaultPassword];
    if (!password) {
        throw new AutoRegError(
            "init",
            ErrorCodes.CONFIG,
            `output.encrypt is enabled but no vault password was provided — set ` +
                `${ENV_KEYS.vaultPassword} or pass options.password`,
        );
    }
    return password;
}

function sinkError(message: string): AutoRegError {
    return new AutoRegError("persist", ErrorCodes.SINK, message);
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
