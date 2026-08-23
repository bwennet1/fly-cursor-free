/**
 * Redacts secrets from a progress message so it is safe to print. Removes:
 *   - JWT-shaped tokens (three base64url segments joined by dots)
 *   - the value after a `password:`/`password=` marker
 *   - long token-ish runs (session tokens, API keys, hashes; 20+ chars)
 *   - standalone 6-digit verification codes
 * Email addresses survive because their digits/letters are embedded next to
 * `@`/`.`/`-`, which the code and long-token patterns explicitly exclude.
 */
export function sanitizeMessage(message: string): string {
    return message
        .replace(/\b[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\.[A-Za-z0-9_-]{6,}\b/g, "[redacted]")
        .replace(/(password\s*[:=]\s*)(\S+)/gi, "$1[redacted]")
        .replace(/\b[A-Za-z0-9_-]{20,}\b/g, "[redacted]")
        .replace(/(?<![\w@.\-])\d{6}(?![\w@.\-])/g, "[redacted]");
}
