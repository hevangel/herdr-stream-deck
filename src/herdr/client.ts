import { execFile } from "node:child_process";
import streamDeck from "@elgato/streamdeck";
import type { ActionSettings, AgentState, GlobalSettings, HerdrAgent, HerdrProfile } from "../types";
import { buildCommand } from "./profiles";

const DEFAULT_TIMEOUT_MS = 15000;
const POLL_TIMEOUT_MARGIN_MS = 15000;

export class HerdrError extends Error {
    readonly code: string;
    readonly raw: string;

    constructor(message: string, code = "unknown", raw = "") {
        super(message);
        this.name = "HerdrError";
        this.code = code;
        this.raw = raw;
    }
}

export function resolveProfile(globalSettings: GlobalSettings, settings: ActionSettings): HerdrProfile {
    const profiles = globalSettings.profiles ?? [];
    const profile = settings.profileId
        ? profiles.find((p) => p.id === settings.profileId)
        : (profiles.find((p) => p.id === globalSettings.defaultProfileId) ?? profiles[0]);
    if (!profile) throw new HerdrError("No herdr profile configured. Open the action settings.", "no_profile");
    return profile;
}

interface RunResult {
    stdout: string;
    stderr: string;
    exitCode: number | null;
}

async function run(profile: HerdrProfile, herdrArgs: string[], timeoutMs: number): Promise<RunResult> {
    const { argv, describe } = buildCommand(profile, herdrArgs);
    streamDeck.logger.debug(`herdr[${describe}]: ${herdrArgs.join(" ")}`);
    return new Promise((resolve, reject) => {
        execFile(
            argv[0],
            argv.slice(1),
            {
                timeout: timeoutMs,
                windowsHide: true,
                maxBuffer: 8 * 1024 * 1024,
            },
            (err, stdout, stderr) => {
                if (!err) {
                    resolve({ stdout, stderr, exitCode: 0 });
                    return;
                }
                const code = typeof err.code === "number" ? err.code : null;
                if (err.killed || (err as NodeJS.ErrnoException).code === "ETIMEDOUT") {
                    reject(new HerdrError(`herdr timed out after ${timeoutMs}ms`, "timeout", stdout + stderr));
                    return;
                }
                if (code !== null) {
                    resolve({ stdout, stderr, exitCode: code });
                    return;
                }
                reject(new HerdrError(`failed to start "${argv[0]}": ${err.message}`, "spawn_failed", String(stderr)));
            },
        );
    });
}

/** herdr reports server errors as JSON `{"error":{code,message}}`; syntax errors exit 2. */
function assertNoJsonError(result: RunResult): void {
    for (const stream of [result.stdout, result.stderr]) {
        const trimmed = stream.trim();
        if (!trimmed.startsWith("{")) continue;
        try {
            const parsed = JSON.parse(trimmed) as { error?: { code?: string; message?: string } };
            if (parsed.error) {
                throw new HerdrError(parsed.error.message ?? "herdr error", parsed.error.code ?? "unknown", trimmed);
            }
        } catch (e) {
            if (e instanceof HerdrError) throw e;
        }
    }
    if (result.exitCode !== 0 && result.exitCode !== null) {
        throw new HerdrError(
            `herdr exited with code ${result.exitCode}`,
            result.exitCode === 2 ? "usage" : "exit",
            (result.stderr || result.stdout).trim(),
        );
    }
}

function pickString(obj: Record<string, unknown>, keys: string[]): string | null {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === "string" && value.length > 0) return value;
    }
    return null;
}

const KNOWN_STATES: AgentState[] = ["idle", "working", "blocked", "done"];

/**
 * herdr's agent-list schema is not contractually documented; normalize the
 * common field spellings. Raw payload is kept for debugging via logs.
 */
function normalizeAgent(obj: Record<string, unknown>): HerdrAgent {
    const stateRaw = (pickString(obj, ["agent_status", "state", "status", "agent_state"]) ?? "unknown").toLowerCase();
    return {
        // Live schema (0.9.4-preview): "agent" holds the unique agent name.
        name: pickString(obj, ["agent", "agent_name", "name", "agentName", "label"]),
        paneId: pickString(obj, ["pane_id", "paneId", "pane"]),
        kind: pickString(obj, ["agent_kind", "kind", "agentKind", "agent"]),
        state: (KNOWN_STATES as string[]).includes(stateRaw) ? (stateRaw as AgentState) : "unknown",
        raw: obj,
    };
}

function parseAgentList(stdout: string): HerdrAgent[] {
    const trimmed = stdout.trim();
    if (trimmed.length === 0) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        throw new HerdrError(`herdr agent list returned non-JSON output: ${trimmed.slice(0, 200)}`, "bad_output", trimmed);
    }
    let list: unknown = parsed;
    if (list && typeof list === "object" && !Array.isArray(list)) {
        const obj = list as Record<string, unknown>;
        list = obj.agents ?? obj.result ?? obj.data ?? [];
        if (list && typeof list === "object" && !Array.isArray(list)) {
            const inner = list as Record<string, unknown>;
            list = inner.agents ?? inner.result ?? [];
        }
    }
    if (!Array.isArray(list)) return [];
    return list
        .filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object")
        .map(normalizeAgent);
}

export async function agentList(profile: HerdrProfile): Promise<HerdrAgent[]> {
    const result = await run(profile, ["agent", "list"], profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    assertNoJsonError(result);
    return parseAgentList(result.stdout);
}

async function expectJson(profile: HerdrProfile, herdrArgs: string[], timeoutMs: number): Promise<Record<string, unknown>> {
    const result = await run(profile, herdrArgs, timeoutMs);
    assertNoJsonError(result);
    const trimmed = result.stdout.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
        // Some commands print a human confirmation on success; that's fine.
        return { _text: trimmed };
    }
    try {
        return JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
        throw new HerdrError(`unexpected herdr output for "${herdrArgs.join(" ")}": ${trimmed.slice(0, 200)}`, "bad_output", trimmed);
    }
}

/** First key that holds a string value, searched depth-first through result envelopes. */
function findDeep(obj: unknown, keys: string[]): string | null {
    if (obj === null || typeof obj !== "object") return null;
    if (Array.isArray(obj)) {
        for (const item of obj) {
            const hit = findDeep(item, keys);
            if (hit !== null) return hit;
        }
        return null;
    }
    const record = obj as Record<string, unknown>;
    for (const key of keys) {
        const value = record[key];
        if (typeof value === "string" && value.length > 0) return value;
    }
    for (const key of ["result", "data", "pane", "agent", "workspace", "tab"]) {
        const hit = findDeep(record[key], keys);
        if (hit !== null) return hit;
    }
    return null;
}

/** Ordered by who needs a human most: blocked, working, done, idle, unknown. */
export function pickAttentionAgent(agents: HerdrAgent[]): HerdrAgent | null {
    const order: AgentState[] = ["blocked", "working", "done", "idle", "unknown"];
    for (const state of order) {
        const hit = agents.find((a) => a.state === state);
        if (hit) return hit;
    }
    return null;
}

export function resolveAgentTarget(settings: ActionSettings, agents: HerdrAgent[]): string | null {
    const configured = settings.agentName?.trim();
    if (configured) return configured;
    return pickAttentionAgent(agents)?.name ?? pickAttentionAgent(agents)?.paneId ?? null;
}

export async function agentPrompt(
    profile: HerdrProfile,
    target: string,
    text: string,
    wait: boolean,
    waitMs: number,
): Promise<string> {
    const args = ["agent", "prompt", target, text];
    if (wait) args.push("--wait", "--timeout", String(waitMs));
    // The wait timeout runs server-side; give the process itself headroom.
    const json = await expectJson(profile, args, wait ? waitMs + POLL_TIMEOUT_MARGIN_MS : DEFAULT_TIMEOUT_MS);
    return findDeep(json, ["status", "state", "message"]) ?? (json._text as string) ?? "submitted";
}

export async function agentSendKeys(profile: HerdrProfile, target: string, keys: string[]): Promise<void> {
    await expectJson(profile, ["agent", "send-keys", target, ...keys], profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

export async function agentGet(profile: HerdrProfile, target: string): Promise<HerdrAgent> {
    const json = await expectJson(profile, ["agent", "get", target], profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    return normalizeAgent(json);
}

export async function agentWait(profile: HerdrProfile, target: string, until: string, timeoutMs: number): Promise<void> {
    await expectJson(profile, ["agent", "wait", target, "--until", until, "--timeout", String(timeoutMs)], timeoutMs + POLL_TIMEOUT_MARGIN_MS);
}

export async function paneSplit(
    profile: HerdrProfile,
    direction: "right" | "down",
    paneId: string | undefined,
    cwd: string | undefined,
): Promise<string> {
    const args = ["pane", "split"];
    if (paneId) args.push(paneId);
    args.push("--direction", direction, "--no-focus");
    if (cwd) args.push("--cwd", cwd);
    const json = await expectJson(profile, args, profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    const newPaneId = findDeep(json, ["pane_id", "paneId"]);
    if (!newPaneId) throw new HerdrError("herdr pane split returned no pane id", "bad_output", JSON.stringify(json).slice(0, 300));
    return newPaneId;
}

export async function agentStart(
    profile: HerdrProfile,
    name: string,
    kind: string,
    paneId: string,
    timeoutMs: number,
): Promise<void> {
    await expectJson(profile, ["agent", "start", name, "--kind", kind, "--pane", paneId, "--timeout", String(timeoutMs)], timeoutMs + POLL_TIMEOUT_MARGIN_MS);
}

/** For the PI: saved SSH machines usable as `machine` profiles (`herdr machine list --json`). */
export async function machineList(): Promise<Array<{ id: string; label: string }>> {
    const result = await run(
        { id: "local", name: "local", kind: "local" },
        ["machine", "list", "--json"],
        DEFAULT_TIMEOUT_MS,
    );
    try {
        const parsed = JSON.parse(result.stdout.trim() || "[]") as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
            .map((m) => ({
                id: pickString(m, ["profile_id", "profileId", "id"]) ?? "",
                label: pickString(m, ["label", "name"]) ?? "",
            }))
            .filter((m) => m.id.length > 0);
    } catch {
        return [];
    }
}
