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
    PHONE_REQUIRED: "PHONE_REQUIRED",
    SELECTOR: "SELECTOR",
    ENGINE: "ENGINE",
    TOKEN: "TOKEN",
    SINK: "SINK",
} as const;
