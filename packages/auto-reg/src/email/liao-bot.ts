import { AutoRegError, ErrorCodes } from "../errors.ts";
import type { EmailConfig, LiaoBotConfig, MailboxProvider } from "../types.ts";
import { compileCodeRegex, parseVerificationCode } from "./parse-code.ts";
import type { FetchLike } from "./tempmail-plus.ts";

/** Built-in endpoints documented at https://liao.bot/email-api/ */
export const LIAO_BOT_DEFAULTS: LiaoBotConfig = {
    baseUrl: "https://liao.bot/email-api",
    allocatePath: "/get-email",
    firstEmailPath: "/first-email",
};

/** Error code raised when the allocate endpoint cannot hand out an address. */
export const MAILBOX_ALLOCATE_ERROR = "MAILBOX_ALLOCATE";

export interface LiaoBotOptions {
    /** Injectable fetch; defaults to the global fetch. Tests never hit the network. */
    fetchFn?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
}

/**
 * Fields a liao.bot mail payload may carry the verification text in. The API
 * is loosely specified, so all of them are scanned (`code` first, then the
 * prose fields, then stripped `html`), both at the top level and under `mail`.
 */
const TEXT_FIELDS = ["subject", "text", "body", "content", "message"] as const;

interface LiaoMailFields {
    code?: unknown;
    subject?: unknown;
    text?: unknown;
    body?: unknown;
    html?: unknown;
    content?: unknown;
    message?: unknown;
}

interface FirstEmailBody extends LiaoMailFields {
    email?: unknown;
    /** first-email shape: {"email":"...","has_mail":false,"message":"暂无邮件"} */
    has_mail?: unknown;
    /** get-email?email=... compat shape: {exists, has_mail} */
    exists?: unknown;
    mail?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function textOf(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number") return String(value);
    return "";
}

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]*>/g, " ");
}

function normalizePath(path: string): string {
    const trimmed = path.trim();
    return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** First usable entry of a "/"-separated domain pool ("@" prefixes tolerated). */
function firstDomain(domainField: string): string {
    return (
        domainField
            .split("/")
            .map((entry) => entry.trim().replace(/^@/, ""))
            .find((entry) => entry.length > 0) ?? ""
    );
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}

/**
 * Mailbox backed by the public liao.bot email API:
 *   GET {base}/get-email?domain=<domain>   → {"email":"<addr>@<domain>", ...}
 *   GET {base}/first-email?femail=<addr>   → {"has_mail":false,...} until mail lands
 *
 * `allocateAddress` reserves a fresh temp address; `waitForCode` then polls
 * the first-email endpoint for that address and extracts the verification
 * code once `has_mail` flips to true.
 */
export class LiaoBotMailbox implements MailboxProvider {
    readonly name = "liao_bot";

    private readonly domain: string;
    private readonly baseUrl: string;
    private readonly allocatePath: string;
    private readonly firstEmailPath: string;
    private readonly pollMs: number;
    private readonly pollTimeoutMs: number;
    private readonly codeRegex: RegExp;
    private readonly fetchFn: FetchLike;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly now: () => number;

    constructor(config: EmailConfig, options: LiaoBotOptions = {}) {
        // Config files merge partially, so every liao field may be absent.
        const liao: Partial<LiaoBotConfig> = config.liao ?? {};
        this.baseUrl = (liao.baseUrl || LIAO_BOT_DEFAULTS.baseUrl).replace(/\/+$/, "");
        this.allocatePath = normalizePath(liao.allocatePath || LIAO_BOT_DEFAULTS.allocatePath);
        this.firstEmailPath = normalizePath(liao.firstEmailPath || LIAO_BOT_DEFAULTS.firstEmailPath);
        this.domain = firstDomain(config.domain ?? "");
        this.pollMs = Math.max(1, config.pollMs);
        this.pollTimeoutMs = config.pollTimeoutMs;
        this.codeRegex = compileCodeRegex(config.codeRegex);
        this.fetchFn = options.fetchFn ?? ((url) => fetch(url));
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.now = options.now ?? Date.now;
    }

    /** Reserve a fresh temp address, e.g. "795u8mi5lzyqm@bwen.net". */
    async allocateAddress(): Promise<string> {
        const query = this.domain ? `?domain=${encodeURIComponent(this.domain)}` : "";
        const url = `${this.baseUrl}${this.allocatePath}${query}`;

        let body: unknown;
        try {
            body = await this.getJson(url);
        } catch (err) {
            throw new AutoRegError(
                "identity",
                MAILBOX_ALLOCATE_ERROR,
                `liao.bot: mailbox allocation failed: ${errMessage(err)}`,
            );
        }

        const email = isRecord(body) && typeof body.email === "string" ? body.email.trim() : "";
        if (!email.includes("@")) {
            throw new AutoRegError(
                "identity",
                MAILBOX_ALLOCATE_ERROR,
                "liao.bot: allocate response did not contain a mailbox address",
            );
        }
        return email;
    }

    async waitForCode(accountEmail: string, _since: Date): Promise<string> {
        // The API only ever exposes the latest ("first") mail per address and
        // each address is freshly allocated per run, so `since` is not needed.
        const deadline = this.now() + this.pollTimeoutMs;
        let lastError: unknown = null;

        for (;;) {
            try {
                const body = (await this.getJson(this.firstEmailUrl(accountEmail))) as FirstEmailBody;
                if (this.hasMail(body)) {
                    const code = this.extractCode(body);
                    if (code) return code;
                }
            } catch (err) {
                // Transient HTTP/network failures should not abort the wait;
                // the deadline below bounds how long we keep retrying.
                lastError = err;
            }
            if (this.now() + this.pollMs > deadline) {
                const suffix = lastError ? ` (last error: ${errMessage(lastError)})` : "";
                throw new AutoRegError(
                    "wait_mailbox",
                    ErrorCodes.MAILBOX_TIMEOUT,
                    `liao.bot: no verification code for ${accountEmail} within ${this.pollTimeoutMs}ms${suffix}`,
                );
            }
            await this.sleep(this.pollMs);
        }
    }

    private firstEmailUrl(accountEmail: string): string {
        return `${this.baseUrl}${this.firstEmailPath}?femail=${encodeURIComponent(accountEmail)}`;
    }

    private async getJson(url: string): Promise<unknown> {
        const res = await this.fetchFn(url);
        if (!res.ok) {
            // Strip the query string so addresses never show up in errors/logs.
            throw new Error(`liao.bot request failed with HTTP ${res.status}: ${url.split("?")[0]}`);
        }
        return res.json();
    }

    /**
     * `has_mail:false` means "暂无邮件" — never parse those payloads. An
     * explicit true (or the compat `exists:true`, or an actual mail payload
     * with no flag at all) means the mail landed.
     */
    private hasMail(body: FirstEmailBody): boolean {
        if (body.has_mail === true) return true;
        if (body.has_mail === false) return false;
        if (body.exists === true) return true;
        return body.mail !== undefined || body.code !== undefined;
    }

    private extractCode(body: FirstEmailBody): string | null {
        const sources: LiaoMailFields[] = [body];
        if (isRecord(body.mail)) sources.push(body.mail as LiaoMailFields);

        // A dedicated `code` field is authoritative when it parses on its own.
        for (const source of sources) {
            const direct = textOf(source.code).trim();
            if (!direct) continue;
            const code = parseVerificationCode(direct, this.codeRegex);
            if (code) return code;
        }

        const parts: string[] = [];
        for (const source of sources) {
            for (const field of TEXT_FIELDS) parts.push(textOf(source[field]));
            const html = textOf(source.html);
            if (html) parts.push(stripHtml(html));
        }
        return parseVerificationCode(parts.filter(Boolean).join("\n"), this.codeRegex);
    }
}
