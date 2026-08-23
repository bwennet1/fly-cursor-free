import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

import { AutoRegError, ErrorCodes } from "../errors.ts";

/**
 * On-disk envelope for the encrypted accounts file ("vault"). All binary
 * fields (salt, iv, tag, ciphertext) are base64. The passphrase itself is
 * never stored anywhere; a fresh AES-256 key is derived on every write with
 * scrypt over a random salt, and every write also uses a fresh random IV.
 */
export interface VaultEnvelope {
    version: 1;
    algo: "aes-256-gcm";
    kdf: "scrypt";
    N: number;
    r: number;
    p: number;
    salt: string;
    iv: string;
    tag: string;
    ciphertext: string;
}

export const VAULT_VERSION = 1 as const;
export const VAULT_ALGO = "aes-256-gcm" as const;
export const VAULT_KDF = "scrypt" as const;

/** Interactive-grade scrypt cost (~16 MiB, tens of ms) — suited to a local CLI vault. */
export const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 } as const;

const KEY_BYTES = 32;
const SALT_BYTES = 16;
/** Standard GCM nonce size. */
const IV_BYTES = 12;
const TAG_BYTES = 16;

// Bounds applied to KDF parameters read back from disk, so a corrupted or
// hostile envelope cannot make scrypt allocate unbounded memory or spin.
const MAX_SCRYPT_MEMORY = 128 * 1024 * 1024;
const MAX_SCRYPT_P = 16;

/** Structural check used to tell an encrypted vault apart from a plaintext accounts array. */
export function isVaultEnvelope(value: unknown): value is VaultEnvelope {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
    }
    const v = value as Record<string, unknown>;
    return (
        v.version === VAULT_VERSION &&
        v.algo === VAULT_ALGO &&
        v.kdf === VAULT_KDF &&
        typeof v.N === "number" &&
        typeof v.r === "number" &&
        typeof v.p === "number" &&
        typeof v.salt === "string" &&
        typeof v.iv === "string" &&
        typeof v.tag === "string" &&
        typeof v.ciphertext === "string"
    );
}

/** Serializes `data` as JSON and encrypts it into a {@link VaultEnvelope}. */
export function encryptVault(data: unknown, password: string): VaultEnvelope {
    const salt = randomBytes(SALT_BYTES);
    const iv = randomBytes(IV_BYTES);
    const key = deriveKey(password, salt, SCRYPT_PARAMS.N, SCRYPT_PARAMS.r, SCRYPT_PARAMS.p);
    try {
        const cipher = createCipheriv(VAULT_ALGO, key, iv);
        const ciphertext = Buffer.concat([
            cipher.update(JSON.stringify(data), "utf8"),
            cipher.final(),
        ]);
        return {
            version: VAULT_VERSION,
            algo: VAULT_ALGO,
            kdf: VAULT_KDF,
            N: SCRYPT_PARAMS.N,
            r: SCRYPT_PARAMS.r,
            p: SCRYPT_PARAMS.p,
            salt: salt.toString("base64"),
            iv: iv.toString("base64"),
            tag: cipher.getAuthTag().toString("base64"),
            ciphertext: ciphertext.toString("base64"),
        };
    } finally {
        key.fill(0);
    }
}

/**
 * Decrypts a {@link VaultEnvelope} and parses the plaintext as JSON. A wrong
 * password and a tampered file are indistinguishable by design (GCM auth
 * failure) and both raise an AutoRegError with code SINK.
 */
export function decryptVault(envelope: VaultEnvelope, password: string): unknown {
    validateKdfParams(envelope);
    const salt = fromBase64(envelope.salt, "salt");
    const iv = fromBase64(envelope.iv, "iv");
    const tag = fromBase64(envelope.tag, "tag");
    const ciphertext = fromBase64(envelope.ciphertext, "ciphertext");
    if (iv.length !== IV_BYTES) {
        throw sinkError(`vault iv must be ${IV_BYTES} bytes`);
    }
    if (tag.length !== TAG_BYTES) {
        throw sinkError(`vault auth tag must be ${TAG_BYTES} bytes`);
    }

    const key = deriveKey(password, salt, envelope.N, envelope.r, envelope.p);
    let plaintext: string;
    try {
        const decipher = createDecipheriv(VAULT_ALGO, key, iv);
        decipher.setAuthTag(tag);
        plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    } catch {
        throw sinkError("failed to decrypt vault: wrong password or corrupted file");
    } finally {
        key.fill(0);
    }

    try {
        return JSON.parse(plaintext);
    } catch {
        throw sinkError("decrypted vault does not contain valid JSON");
    }
}

function validateKdfParams(envelope: VaultEnvelope): void {
    const { N, r, p } = envelope;
    const valid =
        Number.isInteger(N) &&
        N > 1 &&
        (N & (N - 1)) === 0 &&
        Number.isInteger(r) &&
        r >= 1 &&
        Number.isInteger(p) &&
        p >= 1 &&
        p <= MAX_SCRYPT_P &&
        128 * N * r <= MAX_SCRYPT_MEMORY;
    if (!valid) {
        throw sinkError(`vault has unsupported scrypt parameters (N=${N}, r=${r}, p=${p})`);
    }
}

function deriveKey(password: string, salt: Buffer, N: number, r: number, p: number): Buffer {
    try {
        return scryptSync(password, salt, KEY_BYTES, { N, r, p, maxmem: 2 * MAX_SCRYPT_MEMORY });
    } catch (err) {
        throw sinkError(
            `scrypt key derivation failed: ${err instanceof Error ? err.message : String(err)}`,
        );
    }
}

function fromBase64(value: string, field: string): Buffer {
    const buf = Buffer.from(value, "base64");
    if (buf.length === 0 && value.length > 0) {
        throw sinkError(`vault field "${field}" is not valid base64`);
    }
    return buf;
}

function sinkError(message: string): AutoRegError {
    return new AutoRegError("persist", ErrorCodes.SINK, message);
}
