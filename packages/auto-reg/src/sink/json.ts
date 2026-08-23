import { promises as fs } from "node:fs";
import { randomBytes } from "node:crypto";
import path from "node:path";
import type { AccountSink, RegisterResult } from "../types.js";
import { AutoRegError, ErrorCodes } from "../errors.ts";

export interface JsonSinkOptions {
    /** Path to the JSON file that holds the array of registered accounts. */
    accountsPath: string;
}

/**
 * Creates a sink that appends {@link RegisterResult} entries to a JSON array
 * file. Each append does a read/modify/write cycle and commits atomically by
 * writing a sibling temp file and renaming it over the target, so a crash mid
 * write can never leave a half-written accounts file.
 *
 * The full result (including password and session token) is stored on disk on
 * purpose — this is the local account vault. Nothing here writes to the
 * console; keeping secrets out of stdout is the caller's job.
 */
export function createJsonSink(options: JsonSinkOptions): AccountSink {
    const accountsPath = path.resolve(options.accountsPath);

    return {
        async append(result: RegisterResult): Promise<void> {
            const existing = await readArray(accountsPath);
            existing.push(result);
            await writeAtomic(accountsPath, existing);
        },
    };
}

async function readArray(accountsPath: string): Promise<RegisterResult[]> {
    let raw: string;
    try {
        raw = await fs.readFile(accountsPath, "utf8");
    } catch (err) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
            return [];
        }
        throw new AutoRegError(
            "persist",
            ErrorCodes.SINK,
            `failed to read accounts file ${accountsPath}: ${errMessage(err)}`,
        );
    }

    const trimmed = raw.trim();
    if (trimmed.length === 0) {
        return [];
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch (err) {
        throw new AutoRegError(
            "persist",
            ErrorCodes.SINK,
            `accounts file ${accountsPath} is not valid JSON: ${errMessage(err)}`,
        );
    }

    if (!Array.isArray(parsed)) {
        throw new AutoRegError(
            "persist",
            ErrorCodes.SINK,
            `accounts file ${accountsPath} must contain a JSON array`,
        );
    }

    return parsed as RegisterResult[];
}

async function writeAtomic(accountsPath: string, data: RegisterResult[]): Promise<void> {
    const dir = path.dirname(accountsPath);
    await fs.mkdir(dir, { recursive: true });

    const serialized = `${JSON.stringify(data, null, 2)}\n`;
    const tmpPath = path.join(
        dir,
        `.${path.basename(accountsPath)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );

    try {
        await fs.writeFile(tmpPath, serialized, { encoding: "utf8", mode: 0o600 });
        await fs.rename(tmpPath, accountsPath);
    } catch (err) {
        await fs.rm(tmpPath, { force: true }).catch(() => {});
        throw new AutoRegError(
            "persist",
            ErrorCodes.SINK,
            `failed to persist accounts file ${accountsPath}: ${errMessage(err)}`,
        );
    }
}

function errMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
}
