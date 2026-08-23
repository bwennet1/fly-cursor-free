import { randomInt } from "node:crypto";

import { AutoRegError, ErrorCodes } from "./errors.ts";
import { FIRST_NAMES, LAST_NAMES } from "./names.ts";
import type { AutoRegConfig, Identity } from "./types.js";

const LOWER = "abcdefghijklmnopqrstuvwxyz";
const UPPER = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const DIGITS = "0123456789";
const LOCAL_PART_ALPHABET = LOWER + DIGITS;
const PASSWORD_ALPHABET = LOWER + UPPER + DIGITS;

function pick<T>(items: readonly T[]): T {
    return items[randomInt(items.length)] as T;
}

function randomChars(alphabet: string, length: number): string {
    let out = "";
    for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
    return out;
}

/**
 * Alphanumeric password guaranteed to contain at least one lowercase letter,
 * one uppercase letter and one digit. Entropy comes from crypto, never the clock.
 */
export function generatePassword(length: number): string {
    if (length < 3) {
        throw new AutoRegError("identity", ErrorCodes.CONFIG, `password length must be >= 3, got ${length}`);
    }
    const chars = [pick([...LOWER]), pick([...UPPER]), pick([...DIGITS])];
    for (let i = chars.length; i < length; i++) chars.push(PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)] as string);
    // Fisher-Yates shuffle so the guaranteed characters are not always at the front.
    for (let i = chars.length - 1; i > 0; i--) {
        const j = randomInt(i + 1);
        [chars[i], chars[j]] = [chars[j] as string, chars[i] as string];
    }
    return chars.join("");
}

/**
 * Picks one domain from a "/"-separated pool, e.g. "a.com/b.com/c.com".
 * Leading "@" and surrounding whitespace are tolerated.
 */
export function pickDomain(domainField: string): string {
    const pool = domainField
        .split("/")
        .map((entry) => entry.trim().replace(/^@/, ""))
        .filter((entry) => entry.length > 0);
    if (pool.length === 0) {
        throw new AutoRegError("identity", ErrorCodes.CONFIG, "email.domain contains no usable domain");
    }
    return pick(pool);
}

/**
 * Builds a random identity: name from the built-in pools, alphanumeric password,
 * and email of the form `<prefix><random>@<domain>` where the random part has
 * `identity.localPartLength` characters.
 */
export function createIdentity(config: AutoRegConfig): Identity {
    const firstName = pick(FIRST_NAMES);
    const lastName = pick(LAST_NAMES);
    const domain = pickDomain(config.email.domain);

    const prefix = config.identity.emailPrefix;
    let random = randomChars(LOCAL_PART_ALPHABET, config.identity.localPartLength);
    if (prefix.length === 0) {
        // A bare local part should not start with a digit.
        random = pick([...LOWER]) + random.slice(1);
    }

    return {
        firstName,
        lastName,
        email: `${prefix}${random}@${domain}`,
        password: generatePassword(config.identity.passwordLength),
        domain,
    };
}
