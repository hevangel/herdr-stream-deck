/** A connection profile describes WHERE the herdr CLI runs. */
import type { JsonObject } from "@elgato/utils";

export type ProfileKind =
    | "local" // run `herdr` directly on this machine
    | "wsl" // run `herdr` inside a WSL distro (herdr on Linux, host on Windows)
    | "machine" // run `herdr --machine <label>`: saved SSH machine with machine API forwarding
    | "docker" // run `docker exec -i <container> herdr ...` on this machine
    | "ssh" // run `ssh <host> herdr ...`
    | "ssh-docker" // run `ssh <host> docker exec -i <container> herdr ...`
    | "custom"; // run `<prefix> herdr ...` where prefix is a whitespace-split argv head

export interface HerdrProfile extends JsonObject {
    id: string;
    name: string;
    kind: ProfileKind;
    /** wsl: distro name (omit for default distro). */
    distro?: string;
    /** machine: saved herdr machine label or profile id (see `herdr machine list --json`). */
    machine?: string;
    /** docker, ssh-docker: container name. */
    container?: string;
    /** ssh, ssh-docker: ssh target (host, user@host, or ~/.ssh/config alias). */
    sshHost?: string;
    /** custom: whitespace-split argv prefix placed before `herdr`. */
    prefix?: string;
    /** herdr binary name or absolute path as seen by the target (default "herdr"). */
    herdrBin?: string;
    /** default command timeout in ms for this profile (default 15000). */
    timeoutMs?: number;
}

export interface GlobalSettings extends JsonObject {
    profiles?: HerdrProfile[];
    defaultProfileId?: string;
}

export interface ActionSettings extends JsonObject {
    /** profile to use; empty/missing falls back to defaultProfileId. */
    profileId?: string;
    /** seconds between state polls, 5-3600 (default 15). */
    pollInterval?: number;
    // --- agent command action ---
    /** unique agent name or pane id; empty = auto-pick the agent needing attention. */
    agentName?: string;
    /** what a tap does. */
    mode?: "prompt" | "keys";
    promptText?: string;
    /** wait for the agent to settle after prompting (herdr --wait). */
    useWait?: boolean;
    /** herdr --timeout for `agent prompt --wait`, ms. */
    waitMs?: number;
    /** keys sent on tap in keys mode, e.g. "esc" or "enter". */
    keyName?: string;
    /** keys sent when the key is held >= 600ms (default "ctrl+c"). */
    longPressKeys?: string;
    // --- spawn agent action ---
    /** herdr agent kind, e.g. claude, codex, gemini, cursor, droid, amp, ... */
    kind?: string;
    /** agent name; empty = auto `<kind>-<n>`. */
    newAgentName?: string;
    direction?: "right" | "down";
    /** pane to split; empty = the pane focused in the herdr TUI. */
    paneId?: string;
    /** herdr agent start --timeout, ms (default 60000). */
    spawnTimeoutMs?: number;
}

export type AgentState = "idle" | "working" | "blocked" | "done" | "unknown";

export interface HerdrAgent {
    /** unique live agent name, if the agent has one. */
    name: string | null;
    paneId: string | null;
    kind: string | null;
    state: AgentState;
    raw: Record<string, unknown>;
}
