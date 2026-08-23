export type RegisterStage =
    | "init"
    | "identity"
    | "open_signup"
    | "submit_profile"
    | "challenge"
    | "submit_password"
    | "wait_mailbox"
    | "submit_code"
    | "capture_session"
    | "persist"
    | "done"
    | "failed";

export interface Identity {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    domain: string;
}

export interface AutoRegConfig {
    count: number;
    dryRun: boolean;
    headed: boolean;
    /**
     * Opt-in (default false) CDP MouseEvent.screenX/Y patch from
     * TheFalloutOf76 / Cursor-Register. When true it is injected as a page init
     * script (addInitScript) only — the MV3 extension is never loaded via
     * --load-extension because Cloudflare flags a loaded extension as an
     * "Incompatible browser extension" and blocks the sign-up form
     * (docs/问题.md). This is not a captcha solver: unresolved challenges still
     * fail or wait for a human.
     */
    turnstilePatch: boolean;
    timeoutMs: number;
    signupUrl: string;
    email: EmailConfig;
    identity: IdentityConfig;
    output: OutputConfig;
    selectors: SelectorConfig;
}

export interface EmailConfig {
    provider: "imap" | "tempmail_plus" | "manual" | "liao_bot";
    domain: string;
    /** Catch-all / receiving inbox for IMAP or tempmail.plus */
    receivingEmail?: string;
    receivingPin?: string;
    imap?: ImapConfig;
    liao?: LiaoBotConfig;
    codeRegex: string;
    pollMs: number;
    pollTimeoutMs: number;
}

/** https://liao.bot/email-api/ — allocate via get-email, poll via first-email */
export interface LiaoBotConfig {
    baseUrl: string;
    /** GET {baseUrl}/get-email?domain={domain} */
    allocatePath: string;
    /** GET {baseUrl}/first-email?femail={email} */
    firstEmailPath: string;
}

export interface ImapConfig {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    mailbox: string;
}

export interface IdentityConfig {
    emailPrefix: string;
    localPartLength: number;
    passwordLength: number;
}

export interface OutputConfig {
    accountsPath: string;
    /** When true, accounts file is AES-256-GCM. Passphrase from AUTO_REG_VAULT_PASSWORD. */
    encrypt: boolean;
    /**
     * When true (the default), failed attempts are also appended to the sink so
     * there is a durable record of what went wrong. Failure records are
     * scrubbed first: password/sessionToken/code are dropped, leaving only
     * email/error/stage. Set false to persist successes only.
     */
    persistFailures?: boolean;
}

export interface SelectorConfig {
    firstName: string;
    lastName: string;
    email: string;
    password: string;
    continueButton: string;
    otpInputs: string;
    challengeHint: string;
}

export interface RegisterResult {
    ok: boolean;
    stage: RegisterStage;
    identity: Identity;
    sessionToken?: string;
    code?: string;
    error?: string;
    startedAt: string;
    finishedAt: string;
}

export interface PipelineEvent {
    stage: RegisterStage;
    message: string;
    at: string;
}

export type EventSink = (event: PipelineEvent) => void;

export interface MailboxProvider {
    readonly name: string;
    /** Optional: allocate a real mailbox address (e.g. liao.bot @bwen.net). */
    allocateAddress?(): Promise<string>;
    waitForCode(accountEmail: string, since: Date): Promise<string>;
}

export interface RegisterEngine {
    readonly name: string;
    register(input: {
        identity: Identity;
        config: AutoRegConfig;
        waitForCode: (since: Date) => Promise<string>;
        onEvent: EventSink;
    }): Promise<{ sessionToken?: string; code?: string }>;
}

export interface AccountSink {
    append(result: RegisterResult): Promise<void>;
}
