import { AutoRegError, ErrorCodes } from "../errors.ts";

/** Default pattern: a standalone 6-digit run. */
const DEFAULT_CODE_REGEX = /\b\d{6}\b/;

/** Words that usually sit right next to a verification code. */
const KEYWORD_RE =
    /(?:verification|verify|one[\s-]?time|otp|2fa|two[\s-]?factor|security|sign[\s-]?in|log[\s-]?in|auth|passcode|pin|code|验证码|校验码|驗證碼|动态码|安全码)/i;

/** How many characters around a match are scanned for a keyword. */
const KEYWORD_WINDOW = 64;

/**
 * Date-like YYYYMM values (e.g. "202608" in invoice ids or footers). These are
 * the most common 6-digit false positives in real mail bodies.
 */
const YEAR_MONTH_RE = /^(?:19|20)\d{2}(?:0[1-9]|1[0-2])$/;

interface Candidate {
    value: string;
    index: number;
    hasKeyword: boolean;
    yearLike: boolean;
}

function withGlobalFlag(regex: RegExp): RegExp {
    const flags = regex.flags.includes("g") ? regex.flags : `${regex.flags}g`;
    return new RegExp(regex.source, flags);
}

/**
 * Extract a verification code from an email subject/body.
 *
 * All matches of `regex` are collected and ranked:
 *   1. matches with a code-ish keyword nearby win,
 *   2. then non-date-like values beat year-like ones (20xxMM),
 *   3. then earliest match wins.
 *
 * A year-like value is still returned when it is the only candidate, since a
 * genuine code can happen to start with "20".
 */
export function parseVerificationCode(text: string, regex: RegExp = DEFAULT_CODE_REGEX): string | null {
    if (!text) return null;

    const candidates: Candidate[] = [];
    for (const match of text.matchAll(withGlobalFlag(regex))) {
        const value = match[0];
        if (!value) continue;
        const index = match.index ?? 0;
        const before = text.slice(Math.max(0, index - KEYWORD_WINDOW), index);
        const after = text.slice(index + value.length, index + value.length + KEYWORD_WINDOW);
        candidates.push({
            value,
            index,
            hasKeyword: KEYWORD_RE.test(before) || KEYWORD_RE.test(after),
            yearLike: YEAR_MONTH_RE.test(value),
        });
    }
    if (candidates.length === 0) return null;

    candidates.sort((a, b) => {
        if (a.hasKeyword !== b.hasKeyword) return a.hasKeyword ? -1 : 1;
        if (a.yearLike !== b.yearLike) return a.yearLike ? 1 : -1;
        return a.index - b.index;
    });
    return candidates[0].value;
}

/** Compile the configured code pattern, falling back to the 6-digit default. */
export function compileCodeRegex(pattern: string | undefined): RegExp {
    if (!pattern) return DEFAULT_CODE_REGEX;
    try {
        return new RegExp(pattern);
    } catch (err) {
        throw new AutoRegError(
            "init",
            ErrorCodes.CONFIG,
            `Invalid email.codeRegex ${JSON.stringify(pattern)}: ${(err as Error).message}`,
        );
    }
}
