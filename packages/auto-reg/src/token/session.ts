/**
 * Parsing of the Cursor / WorkOS session cookie.
 *
 * The `WorkosCursorSessionToken` cookie stores two parts joined by a `::`
 * separator: `"<userId>::<sessionToken>"`. Depending on where the value is
 * read from it may arrive URL-encoded (`%3A%3A`) or already decoded (`::`).
 * We only care about the token segment that follows the separator.
 */

/**
 * Extracts the session token from a `WorkosCursorSessionToken` cookie value.
 *
 * Supports both `user_xxx%3A%3Atoken` (URL-encoded separator) and the
 * decoded `user_xxx::token` form. Returns the token segment, or `undefined`
 * when the value contains no separator or no token after it.
 */
export function parseSessionCookie(value: string): string | undefined {
    if (typeof value !== "string" || value.length === 0) return undefined;

    // Normalise the encoded separator (case-insensitive) to the decoded form
    // so both shapes go through the same split.
    const normalized = value.replace(/%3A%3A/gi, "::");

    const separator = normalized.indexOf("::");
    if (separator === -1) return undefined;

    const token = normalized.slice(separator + 2).trim();
    return token.length > 0 ? token : undefined;
}
