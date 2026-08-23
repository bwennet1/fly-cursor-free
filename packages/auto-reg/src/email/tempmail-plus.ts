import { AutoRegError, ErrorCodes } from "../errors.ts";
import type { EmailConfig, MailboxProvider } from "../types.ts";
import { compileCodeRegex, parseVerificationCode } from "./parse-code.ts";

/** Structural subset of the WHATWG Response so tests can inject a fake fetch. */
export interface FetchResponseLike {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
}

export type FetchLike = (url: string) => Promise<FetchResponseLike>;

export interface TempMailPlusOptions {
    /** Injectable fetch; defaults to the global fetch. Tests never hit the network. */
    fetchFn?: FetchLike;
    sleep?: (ms: number) => Promise<void>;
    now?: () => number;
    baseUrl?: string;
}

interface MailSummary {
    mail_id?: number | string;
    id?: number | string;
}

interface MailListBody {
    mail_list?: MailSummary[];
}

interface MailDetailBody {
    to?: string;
    subject?: string;
    text?: string;
    html?: string;
}

const DEFAULT_BASE_URL = "https://tempmail.plus";

function stripHtml(html: string): string {
    return html
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]*>/g, " ");
}

/**
 * Mailbox backed by the public tempmail.plus HTTP API:
 *   GET {base}/api/mails?email=<inbox>&limit=20&epin=<pin>
 *   GET {base}/api/mails/{id}?email=<inbox>&epin=<pin>
 *
 * The receiving inbox (`email.receivingEmail`) is a catch-all; each listed
 * mail's detail is fetched once and accepted only when its `to` field matches
 * the account being registered.
 */
export class TempMailPlusMailbox implements MailboxProvider {
    readonly name = "tempmail_plus";

    private readonly receivingEmail: string;
    private readonly epin: string;
    private readonly pollMs: number;
    private readonly pollTimeoutMs: number;
    private readonly codeRegex: RegExp;
    private readonly fetchFn: FetchLike;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly now: () => number;
    private readonly baseUrl: string;

    constructor(config: EmailConfig, options: TempMailPlusOptions = {}) {
        if (!config.receivingEmail) {
            throw new AutoRegError(
                "init",
                ErrorCodes.CONFIG,
                "tempmail.plus provider requires email.receivingEmail (the tempmail.plus inbox address)",
            );
        }
        this.receivingEmail = config.receivingEmail;
        this.epin = config.receivingPin ?? "";
        this.pollMs = Math.max(1, config.pollMs);
        this.pollTimeoutMs = config.pollTimeoutMs;
        this.codeRegex = compileCodeRegex(config.codeRegex);
        this.fetchFn = options.fetchFn ?? ((url) => fetch(url));
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.now = options.now ?? Date.now;
        this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
    }

    async waitForCode(accountEmail: string, _since: Date): Promise<string> {
        // Note: tempmail.plus mail timestamps carry no timezone, so `since` is
        // not used for filtering; recipient matching plus the per-run checked
        // set make stale mail harmless (each account email is unique).
        const deadline = this.now() + this.pollTimeoutMs;
        const checked = new Set<string>();
        let lastError: unknown = null;

        for (;;) {
            try {
                const code = await this.pollOnce(accountEmail, checked);
                if (code) return code;
            } catch (err) {
                // Transient HTTP/network failures should not abort the wait;
                // the deadline below bounds how long we keep retrying.
                lastError = err;
            }
            if (this.now() + this.pollMs > deadline) {
                const suffix = lastError ? ` (last error: ${(lastError as Error).message ?? String(lastError)})` : "";
                throw new AutoRegError(
                    "wait_mailbox",
                    ErrorCodes.MAILBOX_TIMEOUT,
                    `tempmail.plus: no verification mail for ${accountEmail} within ${this.pollTimeoutMs}ms${suffix}`,
                );
            }
            await this.sleep(this.pollMs);
        }
    }

    private async pollOnce(accountEmail: string, checked: Set<string>): Promise<string | null> {
        const list = (await this.getJson(this.listUrl())) as MailListBody;
        for (const summary of list.mail_list ?? []) {
            const id = summary.mail_id ?? summary.id;
            if (id === undefined || id === null) continue;
            const key = String(id);
            if (checked.has(key)) continue;
            checked.add(key);

            const detail = (await this.getJson(this.detailUrl(key))) as MailDetailBody;
            if (!this.isAddressedTo(detail, accountEmail)) continue;
            const code = this.extractCode(detail);
            if (code) return code;
        }
        return null;
    }

    private listUrl(): string {
        return `${this.baseUrl}/api/mails?email=${encodeURIComponent(this.receivingEmail)}&limit=20&epin=${encodeURIComponent(this.epin)}`;
    }

    private detailUrl(id: string): string {
        return `${this.baseUrl}/api/mails/${encodeURIComponent(id)}?email=${encodeURIComponent(this.receivingEmail)}&epin=${encodeURIComponent(this.epin)}`;
    }

    private async getJson(url: string): Promise<unknown> {
        const res = await this.fetchFn(url);
        if (!res.ok) {
            // Strip the query string so the epin never shows up in errors/logs.
            throw new Error(`tempmail.plus request failed with HTTP ${res.status}: ${url.split("?")[0]}`);
        }
        return res.json();
    }

    private isAddressedTo(detail: MailDetailBody, accountEmail: string): boolean {
        return (detail.to ?? "").toLowerCase().includes(accountEmail.toLowerCase());
    }

    private extractCode(detail: MailDetailBody): string | null {
        const text = [detail.subject, detail.text, detail.html ? stripHtml(detail.html) : ""]
            .filter(Boolean)
            .join("\n");
        return parseVerificationCode(text, this.codeRegex);
    }
}
