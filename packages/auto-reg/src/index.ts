export { runRegister } from "./pipeline.ts";
export type { PipelineDeps } from "./pipeline.ts";

export { createJsonSink } from "./sink/json.ts";
export type { JsonSinkOptions } from "./sink/json.ts";

export { AutoRegError, ErrorCodes } from "./errors.ts";

export { loadConfig, defaultConfig } from "./config.ts";
export { createIdentity } from "./identity.ts";
export { createMailbox } from "./email/index.ts";
export { createEngine } from "./engine/index.ts";

export type {
    AccountSink,
    AutoRegConfig,
    EmailConfig,
    EventSink,
    Identity,
    IdentityConfig,
    ImapConfig,
    MailboxProvider,
    OutputConfig,
    PipelineEvent,
    RegisterEngine,
    RegisterResult,
    RegisterStage,
    SelectorConfig,
} from "./types.js";
