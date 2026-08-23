import { readFile } from "node:fs/promises";

import { AutoRegError, ErrorCodes } from "./errors.ts";
import type { AutoRegConfig } from "./types.js";

/** Environment variables that override values from the config file. */
export const ENV_KEYS = {
    imapUser: "AUTO_REG_IMAP_USER",
    imapPassword: "AUTO_REG_IMAP_PASSWORD",
    tempmailPin: "AUTO_REG_TEMPMAIL_PIN",
    domain: "AUTO_REG_DOMAIN",
    vaultPassword: "AUTO_REG_VAULT_PASSWORD",
} as const;

export const DEFAULT_SIGNUP_URL = "https://authenticator.cursor.sh/sign-up";

/** Baseline configuration. Secrets and the email domain must come from the file or env. */
export function defaultConfig(): AutoRegConfig {
    return {
        count: 1,
        dryRun: false,
        headed: false,
        turnstilePatch: true,
        timeoutMs: 120_000,
        signupUrl: DEFAULT_SIGNUP_URL,
        email: {
            provider: "manual",
            domain: "",
            codeRegex: "\\b(\\d{6})\\b",
            pollMs: 3_000,
            pollTimeoutMs: 120_000,
        },
        identity: {
            emailPrefix: "",
            localPartLength: 12,
            passwordLength: 16,
        },
        output: {
            accountsPath: "accounts.json",
            encrypt: true,
        },
        selectors: {
            firstName: 'input[name="first_name"]',
            lastName: 'input[name="last_name"]',
            email: 'input[name="email"]',
            password: 'input[name="password"]',
            continueButton: 'button[type="submit"]',
            otpInputs: 'input[autocomplete="one-time-code"]',
            challengeHint: '[id*="captcha"], iframe[src*="challenge"]',
        },
    };
}

function configError(message: string): AutoRegError {
    return new AutoRegError("init", ErrorCodes.CONFIG, message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Recursively copies defined keys from `source` onto `target` (plain objects only). */
function mergeInto(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(source)) {
        if (value === undefined) continue;
        const existing = target[key];
        if (isPlainObject(value) && isPlainObject(existing)) {
            mergeInto(existing, value);
        } else {
            target[key] = isPlainObject(value) ? structuredClone(value) : value;
        }
    }
}

/** Applies AUTO_REG_* environment overrides on top of a merged config. */
export function applyEnvOverrides(
    config: AutoRegConfig,
    env: Record<string, string | undefined> = process.env,
): AutoRegConfig {
    const imapUser = env[ENV_KEYS.imapUser];
    const imapPassword = env[ENV_KEYS.imapPassword];
    if (imapUser || imapPassword) {
        config.email.imap = {
            host: "",
            port: 993,
            secure: true,
            mailbox: "INBOX",
            user: "",
            password: "",
            ...config.email.imap,
        };
        if (imapUser) config.email.imap.user = imapUser;
        if (imapPassword) config.email.imap.password = imapPassword;
    }
    const pin = env[ENV_KEYS.tempmailPin];
    if (pin) config.email.receivingPin = pin;
    const domain = env[ENV_KEYS.domain];
    if (domain) config.email.domain = domain;
    return config;
}

/**
 * Resolves the passphrase for the encrypted accounts file. Returns undefined
 * when output.encrypt is off. Throws AutoRegError(init/CONFIG) when
 * encryption is on but no passphrase is available — this applies to dry runs
 * too, since a dry run still persists results; tests can inject a passphrase
 * via the `password` argument (or a custom `env`) instead of process.env.
 */
export function resolveVaultPassword(
    config: AutoRegConfig,
    env: Record<string, string | undefined> = process.env,
    password?: string,
): string | undefined {
    if (!config.output.encrypt) {
        return undefined;
    }
    const resolved = password ?? env[ENV_KEYS.vaultPassword];
    if (!resolved) {
        throw configError(
            `output.encrypt is enabled but no vault password is set (${ENV_KEYS.vaultPassword})`,
        );
    }
    return resolved;
}

/** Throws AutoRegError(init/CONFIG) when a required field is missing or invalid. */
export function validateConfig(config: AutoRegConfig): AutoRegConfig {
    const missing: string[] = [];

    if (!Number.isInteger(config.count) || config.count < 1) missing.push("count (integer >= 1)");
    if (!(config.timeoutMs > 0)) missing.push("timeoutMs (> 0)");
    if (!config.signupUrl) missing.push("signupUrl");
    if (!config.email.domain) missing.push("email.domain (or AUTO_REG_DOMAIN)");
    if (!(config.email.pollMs > 0)) missing.push("email.pollMs (> 0)");
    if (!(config.email.pollTimeoutMs > 0)) missing.push("email.pollTimeoutMs (> 0)");
    if (!(config.identity.localPartLength >= 4)) missing.push("identity.localPartLength (>= 4)");
    if (!(config.identity.passwordLength >= 8)) missing.push("identity.passwordLength (>= 8)");
    if (!config.output.accountsPath) missing.push("output.accountsPath");

    if (!["imap", "tempmail_plus", "manual", "liao_bot"].includes(config.email.provider)) {
        throw configError(`invalid email.provider: ${String(config.email.provider)}`);
    }
    // liao_bot needs neither imap credentials nor a receiving inbox: the
    // mailbox is allocated per run and email.liao falls back to the built-in
    // https://liao.bot/email-api endpoints.
    if (config.email.provider === "imap") {
        const imap = config.email.imap;
        if (!imap?.host) missing.push("email.imap.host");
        if (!imap?.user) missing.push("email.imap.user (or AUTO_REG_IMAP_USER)");
        if (!imap?.password) missing.push("email.imap.password (or AUTO_REG_IMAP_PASSWORD)");
        if (imap && !(imap.port > 0)) missing.push("email.imap.port (> 0)");
    }
    if (config.email.provider === "tempmail_plus") {
        if (!config.email.receivingEmail) missing.push("email.receivingEmail");
        if (!config.email.receivingPin) missing.push("email.receivingPin (or AUTO_REG_TEMPMAIL_PIN)");
    }

    try {
        new RegExp(config.email.codeRegex);
    } catch {
        throw configError(`email.codeRegex is not a valid regular expression: ${config.email.codeRegex}`);
    }

    if (missing.length > 0) {
        throw configError(`missing or invalid config fields: ${missing.join(", ")}`);
    }
    return config;
}

/**
 * Loads a JSON config file, merges it over defaultConfig(), applies
 * AUTO_REG_* environment overrides, and validates the result.
 */
export async function loadConfig(
    path: string,
    env: Record<string, string | undefined> = process.env,
): Promise<AutoRegConfig> {
    let raw: string;
    try {
        raw = await readFile(path, "utf8");
    } catch (error) {
        throw configError(`cannot read config file ${path}: ${(error as Error).message}`);
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    } catch (error) {
        throw configError(`config file ${path} is not valid JSON: ${(error as Error).message}`);
    }
    if (!isPlainObject(parsed)) {
        throw configError(`config file ${path} must contain a JSON object`);
    }

    const config = defaultConfig();
    mergeInto(config as unknown as Record<string, unknown>, parsed);
    applyEnvOverrides(config, env);
    return validateConfig(config);
}
