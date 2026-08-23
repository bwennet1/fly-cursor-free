import type {
    AccountSink,
    AutoRegConfig,
    EventSink,
    Identity,
    MailboxProvider,
    PipelineEvent,
    RegisterEngine,
    RegisterResult,
    RegisterStage,
} from "./types.js";
import { AutoRegError } from "./errors.ts";
import { createJsonSink } from "./sink/json.ts";

/**
 * Factories the pipeline needs. In production these are resolved lazily from
 * the sibling modules; tests inject stubs so the orchestration can be exercised
 * offline without a browser, a mailbox, or the network.
 */
export interface PipelineDeps {
    createIdentity: (config: AutoRegConfig) => Identity;
    createMailbox: (config: AutoRegConfig) => MailboxProvider;
    createEngine: (config: AutoRegConfig) => RegisterEngine;
    createSink: (config: AutoRegConfig) => AccountSink;
}

/**
 * Runs the registration loop `config.count` times.
 *
 * Each iteration builds a fresh identity, wires the mailbox's code-waiter into
 * the engine, runs the engine, and appends successful accounts to the sink. A
 * failure in one iteration is captured as a `failed` result and never blocks
 * the remaining iterations. Returns one {@link RegisterResult} per attempt.
 */
export async function runRegister(
    config: AutoRegConfig,
    onEvent?: EventSink,
    deps?: Partial<PipelineDeps>,
): Promise<RegisterResult[]> {
    const emit = safeEmit(onEvent);
    const { createIdentity, createMailbox, createEngine, createSink } = await resolveDeps(deps);

    const mailbox = createMailbox(config);
    const engine = createEngine(config);
    const sink = createSink(config);

    const count = normalizeCount(config.count);
    const results: RegisterResult[] = [];

    for (let i = 0; i < count; i++) {
        results.push(await runOne({ index: i, count, config, createIdentity, mailbox, engine, sink, emit }));
    }

    return results;
}

interface RunOneArgs {
    index: number;
    count: number;
    config: AutoRegConfig;
    createIdentity: (config: AutoRegConfig) => Identity;
    mailbox: MailboxProvider;
    engine: RegisterEngine;
    sink: AccountSink;
    emit: EventSink;
}

async function runOne(args: RunOneArgs): Promise<RegisterResult> {
    const { index, count, config, createIdentity, mailbox, engine, sink, emit } = args;
    const startedAt = new Date();
    let identity: Identity | undefined;

    try {
        emit(event("init", `starting ${index + 1}/${count}`));

        identity = createIdentity(config);
        // dry-run must not consume live mailbox quota (e.g. liao.bot @bwen.net).
        if (mailbox.allocateAddress && !config.dryRun) {
            // Providers like liao.bot hand out the real mailbox address; the
            // locally generated email/domain are replaced with the allocated one.
            const allocated = (await mailbox.allocateAddress()).trim();
            const at = allocated.indexOf("@");
            identity = {
                ...identity,
                email: allocated,
                domain: at >= 0 ? allocated.slice(at + 1) : identity.domain,
            };
        }
        emit(event("identity", identity.email));

        const accountEmail = identity.email;
        const { sessionToken, code } = await engine.register({
            identity,
            config,
            waitForCode: (since: Date) => mailbox.waitForCode(accountEmail, since),
            onEvent: emit,
        });

        const result: RegisterResult = {
            ok: true,
            stage: "done",
            identity,
            sessionToken,
            code,
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
        };

        await sink.append(result);
        emit(event("done", `ok ${identity.email}`));
        return result;
    } catch (err) {
        const stage: RegisterStage = err instanceof AutoRegError ? err.stage : "failed";
        const result: RegisterResult = {
            ok: false,
            stage,
            identity: identity ?? placeholderIdentity(config),
            error: errMessage(err),
            startedAt: startedAt.toISOString(),
            finishedAt: new Date().toISOString(),
        };
        emit(event(stage, `failed ${result.identity.email || "(no email)"}`));
        return result;
    }
}

async function resolveDeps(overrides: Partial<PipelineDeps> = {}): Promise<PipelineDeps> {
    const createIdentity =
        overrides.createIdentity ?? (await import("./identity.ts")).createIdentity;
    const createMailbox =
        overrides.createMailbox ?? (await import("./email/index.ts")).createMailbox;
    const createEngine =
        overrides.createEngine ?? (await import("./engine/index.ts")).createEngine;
    const createSink =
        overrides.createSink ??
        ((config: AutoRegConfig): AccountSink =>
            // With output.encrypt on, the sink seals the accounts file in an
            // AES-256-GCM envelope; the passphrase is resolved inside the sink
            // (options.password or AUTO_REG_VAULT_PASSWORD), never stored here.
            createJsonSink({
                accountsPath: config.output.accountsPath,
                encrypt: config.output.encrypt,
            }));

    return { createIdentity, createMailbox, createEngine, createSink };
}

function normalizeCount(count: number): number {
    if (!Number.isFinite(count)) {
        return 0;
    }
    return Math.max(0, Math.floor(count));
}

function placeholderIdentity(config: AutoRegConfig): Identity {
    return {
        firstName: "",
        lastName: "",
        email: "",
        password: "",
        domain: config.email?.domain ?? "",
    };
}

function safeEmit(onEvent?: EventSink): EventSink {
    if (!onEvent) {
        return () => {};
    }
    return (e: PipelineEvent) => {
        try {
            onEvent(e);
        } catch {
            // A misbehaving event listener must never abort a registration run.
        }
    };
}

function event(stage: RegisterStage, message: string): PipelineEvent {
    return { stage, message, at: new Date().toISOString() };
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
