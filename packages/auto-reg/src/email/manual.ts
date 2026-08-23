import { AutoRegError, ErrorCodes } from "../errors.ts";
import type { MailboxProvider } from "../types.ts";

export const MANUAL_CODE_ENV = "AUTO_REG_MANUAL_CODE";

const CODE_PATTERN = /^\d{6}$/;

/**
 * Human-in-the-loop mailbox: the user reads the verification mail themselves
 * and exposes the code via the AUTO_REG_MANUAL_CODE environment variable.
 */
export class ManualMailbox implements MailboxProvider {
    readonly name = "manual";

    private readonly env: NodeJS.ProcessEnv;

    constructor(env: NodeJS.ProcessEnv = process.env) {
        this.env = env;
    }

    async waitForCode(accountEmail: string, _since: Date): Promise<string> {
        const raw = (this.env[MANUAL_CODE_ENV] ?? "").trim();
        if (CODE_PATTERN.test(raw)) return raw;

        const problem = raw
            ? `${MANUAL_CODE_ENV} is set but ${JSON.stringify(raw)} is not a 6-digit code`
            : `${MANUAL_CODE_ENV} is not set`;
        throw new AutoRegError(
            "wait_mailbox",
            ErrorCodes.CONFIG,
            `Manual mailbox: ${problem}. Read the verification code sent to ${accountEmail}, ` +
                `export ${MANUAL_CODE_ENV}=<6-digit code>, then re-run.`,
        );
    }
}
