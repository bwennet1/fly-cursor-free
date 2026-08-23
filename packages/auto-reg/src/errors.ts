import type { RegisterStage } from "./types.js";

export class AutoRegError extends Error {
    readonly stage: RegisterStage;
    readonly code: string;

    constructor(stage: RegisterStage, code: string, message: string) {
        super(message);
        this.name = "AutoRegError";
        this.stage = stage;
        this.code = code;
    }
}

export const ErrorCodes = {
    CONFIG: "CONFIG",
    MAILBOX_TIMEOUT: "MAILBOX_TIMEOUT",
    CHALLENGE_REQUIRED: "CHALLENGE_REQUIRED",
    /**
     * The sign-up host answered with HTTP 429 / a rate-limit page. Distinct from
     * CHALLENGE_REQUIRED so callers can back off instead of retrying in a tight
     * loop.
     */
    RATE_LIMITED: "RATE_LIMITED",
    /**
     * The page or browser context went away before a required step completed
     * (e.g. Cloudflare closed the tab mid-flow). Distinct from a generic ENGINE
     * failure so it is obvious the browser closed rather than a selector or
     * network error.
     */
    BROWSER_CLOSED: "BROWSER_CLOSED",
    PHONE_REQUIRED: "PHONE_REQUIRED",
    SELECTOR: "SELECTOR",
    ENGINE: "ENGINE",
    TOKEN: "TOKEN",
    SINK: "SINK",
} as const;
