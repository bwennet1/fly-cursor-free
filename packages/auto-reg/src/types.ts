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
    timeoutMs: number;
    signupUrl: string;
    email: EmailConfig;
    identity: IdentityConfig;
    output: OutputConfig;
    selectors: SelectorConfig;
}

export interface EmailConfig {
    provider: "imap" | "tempmail_plus" | "manual";
    domain: string;
    /** Catch-all / receiving inbox for IMAP or tempmail.plus */
    receivingEmail?: string;
    receivingPin?: string;
    imap?: ImapConfig;
    codeRegex: string;
    pollMs: number;
    pollTimeoutMs: number;
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
