import * as net from "node:net";
import * as tls from "node:tls";
import { AutoRegError, ErrorCodes } from "../errors.ts";
import type { EmailConfig, ImapConfig, MailboxProvider } from "../types.ts";
import { compileCodeRegex, parseVerificationCode } from "./parse-code.ts";

/**
 * Minimal IMAP client — just enough to receive a verification code:
 * LOGIN, SELECT, (NOOP+)SEARCH SINCE, FETCH BODY.PEEK[], LOGOUT.
 *
 * Known limitations (deliberate, this is not a general IMAP library):
 * - TODO: no STARTTLS upgrade; use `secure: true` (implicit TLS, port 993).
 *   Plain connections are supported but send credentials unencrypted.
 * - TODO: no UID commands; sequence numbers are used within one session.
 * - TODO: no real MIME parsing. Raw bodies are searched as-is, plus naive
 *   quoted-printable and base64 part decoding, which covers typical
 *   verification emails.
 * - Commands are strictly sequential; no pipelining, no IDLE.
 */

/** Minimal duplex surface so tests / callers can inject a fake socket. */
export interface ImapSocket {
    write(data: string): void;
    on(event: "data", listener: (chunk: Buffer) => void): void;
    on(event: "error", listener: (err: Error) => void): void;
    on(event: "close", listener: () => void): void;
    end(): void;
}

export type ImapConnectFn = (opts: { host: string; port: number; secure: boolean }) => ImapSocket;

export interface ImapMailboxOptions {
    /** Injectable socket factory; defaults to node:tls / node:net. */
    connectFn?: ImapConnectFn;
    sleep?: (ms: number) => Promise<void>;
    /** Injectable env for password lookup; defaults to process.env. */
    env?: NodeJS.ProcessEnv;
}

export const IMAP_PASSWORD_ENVS = ["AUTO_REG_IMAP_PASSWORD", "IMAP_PASSWORD"] as const;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function defaultConnect(opts: { host: string; port: number; secure: boolean }): ImapSocket {
    if (opts.secure) {
        return tls.connect({ host: opts.host, port: opts.port, servername: opts.host });
    }
    return net.connect({ host: opts.host, port: opts.port });
}

/** RFC 3501 date-only format for SEARCH SINCE, e.g. "3-Aug-2026". */
function imapDate(date: Date): string {
    return `${date.getUTCDate()}-${MONTHS[date.getUTCMonth()]}-${date.getUTCFullYear()}`;
}

/** Quote a string per IMAP rules (CR/LF are illegal in quoted strings). */
function quoteImapString(value: string): string {
    return `"${value.replace(/[\r\n]/g, "").replace(/([\\"])/g, "\\$1")}"`;
}

/**
 * Scan `buffer` for the tagged completion line of `tag`, skipping over
 * literal payloads ({n} byte counts) so message bodies can never be mistaken
 * for a tagged response. Returns null while the response is incomplete.
 */
function findTaggedResponse(
    buffer: string,
    tag: string,
): { text: string; status: string; consumed: number } | null {
    const prefix = `${tag} `;
    let pos = 0;
    for (;;) {
        const nl = buffer.indexOf("\r\n", pos);
        if (nl === -1) return null;
        const line = buffer.slice(pos, nl);
        const literal = /\{(\d+)\}$/.exec(line);
        if (literal) {
            const size = Number(literal[1]);
            if (buffer.length < nl + 2 + size) return null;
            pos = nl + 2 + size;
            continue;
        }
        if (line.startsWith(prefix)) {
            return {
                text: buffer.slice(0, nl + 2),
                status: line.slice(prefix.length),
                consumed: nl + 2,
            };
        }
        pos = nl + 2;
    }
}

/** Collect message ids from all `* SEARCH n n n` lines in a response. */
function parseSearchIds(response: string): string[] {
    const ids: string[] = [];
    for (const line of response.split("\r\n")) {
        const match = /^\* SEARCH((?:\s+\d+)*)\s*$/i.exec(line);
        if (match && match[1]) {
            ids.push(...match[1].trim().split(/\s+/).filter(Boolean));
        }
    }
    return ids;
}

/** Extract the first literal payload ({n}\r\n<bytes>) from a FETCH response. */
function extractFirstLiteral(response: string): string | null {
    const marker = /\{(\d+)\}\r\n/.exec(response);
    if (!marker) return null;
    const start = (marker.index ?? 0) + marker[0].length;
    const size = Number(marker[1]);
    const raw = response.slice(start, start + size);
    // The session buffers bytes as latin1; re-decode the body as UTF-8.
    return Buffer.from(raw, "latin1").toString("utf8");
}

function decodeQuotedPrintable(text: string): string {
    // Byte-by-byte =XX decoding; multi-byte UTF-8 text may come out mangled,
    // but the digits we search for are ASCII and always survive.
    return text
        .replace(/=\r?\n/g, "")
        .replace(/=([0-9A-Fa-f]{2})/g, (_m, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

/** Decode the payload of every `Content-Transfer-Encoding: base64` part. */
function decodeBase64Sections(raw: string): string {
    const decoded: string[] = [];
    const lines = raw.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
        if (!/^content-transfer-encoding:\s*base64/i.test(lines[i].trim())) {
            i++;
            continue;
        }
        while (i < lines.length && lines[i].trim() !== "") i++; // rest of part headers
        i++;
        const chunk: string[] = [];
        while (i < lines.length) {
            const line = lines[i].trim();
            if (line === "" || line.startsWith("--") || !/^[A-Za-z0-9+/=]+$/.test(line)) break;
            chunk.push(line);
            i++;
        }
        if (chunk.length > 0) {
            decoded.push(Buffer.from(chunk.join(""), "base64").toString("utf8"));
        }
    }
    return decoded.join("\n");
}

/** Raw message plus best-effort decodings, for recipient + code matching. */
function searchableText(raw: string): string {
    return [raw, decodeQuotedPrintable(raw), decodeBase64Sections(raw)].join("\n");
}

/** Buffers socket data and lets sequential commands await their responses. */
class ImapSession {
    private readonly socket: ImapSocket;
    private buffer = "";
    private closed = false;
    private fatal: Error | null = null;
    private wake: (() => void) | null = null;

    constructor(socket: ImapSocket) {
        this.socket = socket;
        socket.on("data", (chunk) => {
            this.buffer += chunk.toString("latin1");
            this.wake?.();
        });
        socket.on("error", (err) => {
            this.fatal = err;
            this.wake?.();
        });
        socket.on("close", () => {
            this.closed = true;
            this.wake?.();
        });
    }

    send(line: string): void {
        this.socket.write(`${line}\r\n`);
    }

    async waitFor<T>(
        what: string,
        deadline: number,
        parse: (buffer: string) => { value: T; consumed: number } | null,
    ): Promise<T> {
        for (;;) {
            const parsed = parse(this.buffer);
            if (parsed) {
                this.buffer = this.buffer.slice(parsed.consumed);
                return parsed.value;
            }
            if (this.fatal) {
                throw new AutoRegError(
                    "wait_mailbox",
                    ErrorCodes.ENGINE,
                    `IMAP socket error during ${what}: ${this.fatal.message}`,
                );
            }
            if (this.closed) {
                throw new AutoRegError("wait_mailbox", ErrorCodes.ENGINE, `IMAP connection closed during ${what}`);
            }
            const remaining = deadline - Date.now();
            if (remaining <= 0) {
                throw new AutoRegError(
                    "wait_mailbox",
                    ErrorCodes.MAILBOX_TIMEOUT,
                    `IMAP timed out waiting for ${what}`,
                );
            }
            await new Promise<void>((resolve) => {
                const timer = setTimeout(() => {
                    this.wake = null;
                    resolve();
                }, Math.min(remaining, 500));
                this.wake = () => {
                    clearTimeout(timer);
                    this.wake = null;
                    resolve();
                };
            });
        }
    }

    readLine(what: string, deadline: number): Promise<string> {
        return this.waitFor(what, deadline, (buf) => {
            const nl = buf.indexOf("\r\n");
            if (nl === -1) return null;
            return { value: buf.slice(0, nl), consumed: nl + 2 };
        });
    }

    destroy(): void {
        try {
            this.socket.end();
        } catch {
            // Socket already gone; nothing to clean up.
        }
    }
}

export class ImapMailbox implements MailboxProvider {
    readonly name = "imap";

    private readonly config: EmailConfig;
    private readonly codeRegex: RegExp;
    private readonly connectFn: ImapConnectFn;
    private readonly sleep: (ms: number) => Promise<void>;
    private readonly env: NodeJS.ProcessEnv;
    private tagSeq = 0;

    constructor(config: EmailConfig, options: ImapMailboxOptions = {}) {
        if (!config.imap) {
            throw new AutoRegError("init", ErrorCodes.CONFIG, "imap provider requires the email.imap config block");
        }
        this.config = config;
        this.codeRegex = compileCodeRegex(config.codeRegex);
        this.connectFn = options.connectFn ?? defaultConnect;
        this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
        this.env = options.env ?? process.env;
    }

    async waitForCode(accountEmail: string, since: Date): Promise<string> {
        const imap = this.config.imap as ImapConfig;
        const password = this.resolvePassword(imap);
        const deadline = Date.now() + this.config.pollTimeoutMs;

        const session = new ImapSession(this.connectFn({ host: imap.host, port: imap.port, secure: imap.secure }));
        try {
            const greeting = await session.readLine("greeting", deadline);
            if (!greeting.startsWith("* OK") && !greeting.startsWith("* PREAUTH")) {
                throw new AutoRegError("wait_mailbox", ErrorCodes.ENGINE, `IMAP greeting was not OK: ${greeting}`);
            }
            await this.command(session, "LOGIN", `LOGIN ${quoteImapString(imap.user)} ${quoteImapString(password)}`, deadline);
            await this.command(session, "SELECT", `SELECT ${quoteImapString(imap.mailbox || "INBOX")}`, deadline);

            const sinceArg = imapDate(since);
            const seen = new Set<string>();
            let firstPoll = true;
            for (;;) {
                if (!firstPoll) {
                    // NOOP prompts the server to announce newly arrived mail.
                    await this.command(session, "NOOP", "NOOP", deadline);
                }
                firstPoll = false;

                const searchRes = await this.command(session, "SEARCH", `SEARCH SINCE ${sinceArg}`, deadline);
                for (const id of parseSearchIds(searchRes)) {
                    if (seen.has(id)) continue;
                    seen.add(id);
                    const fetchRes = await this.command(session, "FETCH", `FETCH ${id} (BODY.PEEK[])`, deadline);
                    const raw = extractFirstLiteral(fetchRes);
                    if (!raw) continue;
                    const haystack = searchableText(raw);
                    if (!haystack.toLowerCase().includes(accountEmail.toLowerCase())) continue;
                    const code = parseVerificationCode(haystack, this.codeRegex);
                    if (code) {
                        try {
                            await this.command(session, "LOGOUT", "LOGOUT", deadline);
                        } catch {
                            // Best-effort logout; the code is already in hand.
                        }
                        return code;
                    }
                }

                if (Date.now() + this.config.pollMs > deadline) {
                    throw new AutoRegError(
                        "wait_mailbox",
                        ErrorCodes.MAILBOX_TIMEOUT,
                        `imap: no verification mail for ${accountEmail} within ${this.config.pollTimeoutMs}ms`,
                    );
                }
                await this.sleep(this.config.pollMs);
            }
        } finally {
            session.destroy();
        }
    }

    /** The password is read only from config or env — never hardcoded or prompted. */
    private resolvePassword(imap: ImapConfig): string {
        if (imap.password) return imap.password;
        for (const key of IMAP_PASSWORD_ENVS) {
            const value = this.env[key];
            if (value) return value;
        }
        throw new AutoRegError(
            "init",
            ErrorCodes.CONFIG,
            `IMAP password missing: set email.imap.password in the config or the ${IMAP_PASSWORD_ENVS.join(" / ")} env var`,
        );
    }

    /**
     * Send one tagged command and await its completion. `verb` (not the full
     * command line) is used in errors so credentials never leak into messages.
     */
    private async command(session: ImapSession, verb: string, line: string, deadline: number): Promise<string> {
        const tag = `A${++this.tagSeq}`;
        session.send(`${tag} ${line}`);
        const res = await session.waitFor(verb, deadline, (buffer) => {
            const found = findTaggedResponse(buffer, tag);
            return found ? { value: found, consumed: found.consumed } : null;
        });
        if (!/^OK\b/i.test(res.status)) {
            throw new AutoRegError("wait_mailbox", ErrorCodes.ENGINE, `IMAP ${verb} failed: ${res.status}`);
        }
        return res.text;
    }
}
