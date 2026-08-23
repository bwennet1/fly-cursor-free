import { randomBytes } from "node:crypto";

import type {
    AutoRegConfig,
    EventSink,
    Identity,
    RegisterEngine,
    RegisterStage,
} from "../types.js";

/** Canned verification code returned by the dry-run engine. */
const DRY_RUN_CODE = "123456";

/**
 * Engine that walks the whole pipeline shape without touching a browser,
 * network or mailbox. It emits the same stage events a real run would and
 * returns a synthetic session token (`dryrun_<hex>`) plus a canned code so the
 * orchestrator, sink and reporting can be exercised end to end offline.
 */
export class DryRunEngine implements RegisterEngine {
    readonly name = "dry-run";

    async register(input: {
        identity: Identity;
        config: AutoRegConfig;
        waitForCode: (since: Date) => Promise<string>;
        onEvent: EventSink;
    }): Promise<{ sessionToken?: string; code?: string }> {
        const { identity, config, onEvent } = input;
        const emit = (stage: RegisterStage, message: string): void => {
            onEvent({ stage, message, at: new Date().toISOString() });
        };

        emit("open_signup", `dry-run: pretend to open ${config.signupUrl}`);
        emit("submit_profile", `dry-run: pretend to fill profile for ${identity.email}`);
        emit("submit_password", "dry-run: pretend to fill password");
        // A dry run never reaches the real mailbox; it uses a canned code.
        emit("wait_mailbox", "dry-run: skipping mailbox, using canned code");

        const code = DRY_RUN_CODE;
        emit("submit_code", `dry-run: pretend to submit code ${code}`);

        const sessionToken = `dryrun_${randomBytes(16).toString("hex")}`;
        emit("capture_session", "dry-run: produced synthetic session token");

        return { sessionToken, code };
    }
}

/** Convenience factory returning a fresh {@link DryRunEngine}. */
export function createDryRunEngine(): RegisterEngine {
    return new DryRunEngine();
}
