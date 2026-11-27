import { execFile } from "node:child_process";
import streamDeck from "@elgato/streamdeck";
import type {
    ActionSettings,
    AgentState,
    GlobalSettings,
    HerdrAgent,
    HerdrMachine,
    HerdrProfile,
    HerdrTab,
    HerdrWorkspace,
} from "../types";
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

function normalizeState(raw: string | null): AgentState {
    const lower = (raw ?? "unknown").toLowerCase();
    return (KNOWN_STATES as string[]).includes(lower) ? (lower as AgentState) : "unknown";
}

function pickNumber(obj: Record<string, unknown>, keys: string[], fallback = 0): number {
    for (const key of keys) {
        const value = obj[key];
        if (typeof value === "number" && Number.isFinite(value)) return value;
    }
    return fallback;
}

/**
 * Live herdr 0.9.4-preview schema:
 * - "agent" is the agent kind (e.g. "claude", "codex")
 * - "name" is the optional unique live agent name (e.g. "aao-codex-4634")
 */
function normalizeAgent(obj: Record<string, unknown>): HerdrAgent {
    return {
        name: pickString(obj, ["name", "agent_name", "agentName", "label"]),
        paneId: pickString(obj, ["pane_id", "paneId", "pane"]),
        workspaceId: pickString(obj, ["workspace_id", "workspaceId", "workspace"]),
        tabId: pickString(obj, ["tab_id", "tabId", "tab"]),
        kind: pickString(obj, ["agent", "agent_kind", "kind", "agentKind"]),
        state: normalizeState(pickString(obj, ["agent_status", "state", "status", "agent_state"])),
        focused: obj.focused === true,
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

/** Focus the tab/pane hosting the target agent in the herdr TUI (also marks it seen). */
export async function agentFocus(profile: HerdrProfile, target: string): Promise<void> {
    await expectJson(profile, ["agent", "focus", target], profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
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

/** Saved SSH machines (`herdr machine list --json`). */
export async function machineList(profile?: HerdrProfile): Promise<HerdrMachine[]> {
    const targetProfile: HerdrProfile = profile ?? { id: "local", name: "local", kind: "local" };
    const result = await run(
        targetProfile,
        ["machine", "list", "--json"],
        targetProfile.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    );
    try {
        const parsed = JSON.parse(result.stdout.trim() || "[]") as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed
            .filter((m): m is Record<string, unknown> => m !== null && typeof m === "object")
            .map((m) => ({
                id: pickString(m, ["id", "profile_id", "profileId"]) ?? "",
                label: pickString(m, ["label", "name"]) ?? "",
                target: pickString(m, ["target"]) ?? "",
                session: pickString(m, ["session"]) ?? "default",
                enabled: m.enabled !== false,
                selected: m.selected === true,
            }))
            .filter((m) => m.id.length > 0 || m.label.length > 0);
    } catch {
        return [];
    }
}

function unwrapArray(parsed: unknown, key: string): Record<string, unknown>[] {
    let list: unknown = parsed;
    if (list && typeof list === "object" && !Array.isArray(list)) {
        const obj = list as Record<string, unknown>;
        list = obj[key] ?? obj.result ?? obj.data ?? [];
        if (list && typeof list === "object" && !Array.isArray(list)) {
            const inner = list as Record<string, unknown>;
            list = inner[key] ?? inner.result ?? [];
        }
    }
    if (!Array.isArray(list)) return [];
    return list.filter((entry): entry is Record<string, unknown> => entry !== null && typeof entry === "object");
}

export async function workspaceList(profile: HerdrProfile): Promise<HerdrWorkspace[]> {
    const result = await run(profile, ["workspace", "list"], profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    assertNoJsonError(result);
    const trimmed = result.stdout.trim();
    if (!trimmed) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        throw new HerdrError(`herdr workspace list returned non-JSON output: ${trimmed.slice(0, 200)}`, "bad_output", trimmed);
    }
    return unwrapArray(parsed, "workspaces")
        .map((w) => ({
            workspaceId: pickString(w, ["workspace_id", "workspaceId", "id"]) ?? "",
            label: pickString(w, ["label", "name"]) ?? "",
            number: pickNumber(w, ["number"], 0),
            focused: w.focused === true,
            activeTabId: pickString(w, ["active_tab_id", "activeTabId"]),
            agentStatus: normalizeState(pickString(w, ["agent_status", "state", "status"])),
            tabCount: pickNumber(w, ["tab_count", "tabCount"], 0),
            paneCount: pickNumber(w, ["pane_count", "paneCount"], 0),
        }))
        .filter((w) => w.workspaceId.length > 0)
        .sort((a, b) => a.number - b.number);
}

export async function workspaceFocus(profile: HerdrProfile, workspaceId: string): Promise<void> {
    await expectJson(profile, ["workspace", "focus", workspaceId], profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

export async function tabList(profile: HerdrProfile, workspaceId?: string): Promise<HerdrTab[]> {
    const args = ["tab", "list"];
    if (workspaceId) args.push("--workspace", workspaceId);
    const result = await run(profile, args, profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    assertNoJsonError(result);
    const trimmed = result.stdout.trim();
    if (!trimmed) return [];
    let parsed: unknown;
    try {
        parsed = JSON.parse(trimmed);
    } catch {
        throw new HerdrError(`herdr tab list returned non-JSON output: ${trimmed.slice(0, 200)}`, "bad_output", trimmed);
    }
    return unwrapArray(parsed, "tabs")
        .map((t) => ({
            tabId: pickString(t, ["tab_id", "tabId", "id"]) ?? "",
            workspaceId: pickString(t, ["workspace_id", "workspaceId"]) ?? "",
            label: pickString(t, ["label", "name"]) ?? "",
            number: pickNumber(t, ["number"], 0),
            focused: t.focused === true,
            agentStatus: normalizeState(pickString(t, ["agent_status", "state", "status"])),
            paneCount: pickNumber(t, ["pane_count", "paneCount"], 0),
        }))
        .filter((t) => t.tabId.length > 0)
        .sort((a, b) => a.number - b.number);
}

export async function tabFocus(profile: HerdrProfile, tabId: string): Promise<void> {
    await expectJson(profile, ["tab", "focus", tabId], profile.timeoutMs ?? DEFAULT_TIMEOUT_MS);
}

/**
 * Create a new tab (in the given workspace, or focused workspace if omitted),
 * focus it, and return its tabId + initial paneId so an agent can be started in it.
 */
export async function tabCreate(
    profile: HerdrProfile,
    workspaceId?: string,
): Promise<{ tabId: string | null; paneId: string }> {
    const args = ["tab", "create"];
    if (workspaceId) args.push("--workspace", workspaceId);
    args.push("--focus");
    const timeoutMs = profile.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const json = await expectJson(profile, args, timeoutMs);
    const tabId = findDeep(json, ["tab_id", "tabId"]);
    let paneId = findDeep(json, ["pane_id", "paneId", "active_pane_id", "activePaneId"]);
    if (!paneId && tabId) {
        // `herdr tab create` / `tab get` do not always include pane_id; resolve it via `pane list`.
        const panesJson = await expectJson(profile, ["pane", "list"], timeoutMs);
        const panes = unwrapArray(panesJson, "panes");
        const match = panes.find((p) => pickString(p, ["tab_id", "tabId"]) === tabId);
        if (match) {
            paneId = pickString(match, ["pane_id", "paneId", "id"]);
        }
    }
    if (!paneId) {
        throw new HerdrError("herdr tab create returned no pane id", "bad_output", JSON.stringify(json).slice(0, 300));
    }
    return { tabId, paneId };
}
