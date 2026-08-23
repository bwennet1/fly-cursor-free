import { AutoRegError, ErrorCodes } from "../errors.ts";
import type { AutoRegConfig, MailboxProvider } from "../types.ts";
import { ImapMailbox } from "./imap.ts";
import { ManualMailbox } from "./manual.ts";
import { TempMailPlusMailbox } from "./tempmail-plus.ts";

/** Pick the mailbox implementation configured under `config.email.provider`. */
export function createMailbox(config: AutoRegConfig): MailboxProvider {
    const email = config.email;
    switch (email.provider) {
        case "tempmail_plus":
            return new TempMailPlusMailbox(email);
        case "imap":
            return new ImapMailbox(email);
        case "manual":
            return new ManualMailbox();
        default:
            // Config files are parsed at runtime, so guard against unknown values.
            throw new AutoRegError(
                "init",
                ErrorCodes.CONFIG,
                `Unknown email provider: ${String((email as { provider?: string }).provider)}`,
            );
    }
}

export { compileCodeRegex, parseVerificationCode } from "./parse-code.ts";
export { TempMailPlusMailbox } from "./tempmail-plus.ts";
export type { FetchLike, FetchResponseLike, TempMailPlusOptions } from "./tempmail-plus.ts";
export { ImapMailbox, IMAP_PASSWORD_ENVS } from "./imap.ts";
export type { ImapConnectFn, ImapMailboxOptions, ImapSocket } from "./imap.ts";
export { ManualMailbox, MANUAL_CODE_ENV } from "./manual.ts";
