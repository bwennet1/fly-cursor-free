/**
 * Redaction for free-form text (error messages, pipeline events) before it is
 * persisted or surfaced. Engines and mailbox providers can embed secrets in
 * thrown errors — a JWT in a failed fetch body, a `password=` fragment from a
 * form dump, the 6-digit verification code, or a long opaque token. None of
 * those may ever reach accounts.json or a log line.
 *
 * Email addresses intentionally survive: they are the primary key operators
 * use to correlate a failed attempt with a mailbox.
 */

/** Three dot-separated base64url segments starting with the JOSE header prefix. */
const JWT_RE = /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;

/** `password=...` / `password: ...` style key-value fragments (also passwd/pwd). */
const PASSWORD_KV_RE = /\b(password|passwd|pwd)\s*[=:]\s*[^\s,;"']+/gi;

/**
 * Long opaque token runs (32+ chars of base64url alphabet). The lookarounds
 * keep email addresses intact: a run that is preceded by or leads up to an
 * `@` (or sits inside a dotted local part) is part of an address, not a token.
 */
const LONG_TOKEN_RE = /(?<![A-Za-z0-9._%+@-])[A-Za-z0-9_-]{32,}(?![A-Za-z0-9_-]*@)/g;

/** Standalone 6-digit runs — the shape of every mailbox verification code. */
const SIX_DIGIT_CODE_RE = /\b\d{6}\b/g;

/**
 * Returns `message` with JWTs, password key-values, long opaque tokens and
 * 6-digit verification codes replaced by fixed placeholders. Order matters:
 * JWTs and password fragments are matched before the generic long-token rule
 * so their placeholders are specific, and codes are matched last so digits
 * inside longer redacted runs are already gone.
 */
export function sanitizeMessage(message: string): string {
    return message
        .replace(JWT_RE, "[REDACTED_JWT]")
        .replace(PASSWORD_KV_RE, "$1=[REDACTED]")
        .replace(LONG_TOKEN_RE, "[REDACTED_TOKEN]")
        .replace(SIX_DIGIT_CODE_RE, "[REDACTED_CODE]");
}
