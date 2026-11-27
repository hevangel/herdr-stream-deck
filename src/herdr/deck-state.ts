import streamDeck from "@elgato/streamdeck";
import type {
    ActionSettings,
    DeckViewMode,
    HerdrAgent,
    HerdrProfile,
    HerdrTab,
    HerdrWorkspace,
} from "../types";
import { loadGlobalSettings, type KeyActionOf } from "../actions/base";
import {
    agentFocus,
    agentList,
    agentStart,
    HerdrError,
    machineList,
    resolveProfile,
    tabCreate,
    tabFocus,
    tabList,
    workspaceFocus,
    workspaceList,
} from "./client";
import { DEFAULT_AGENT_KIND } from "./profiles";
import {
    addAgentSlotSvg,
    agentKeySvg,
    emptySlotSvg,
    modeButtonSvg,
    slotKeySvg,
    STATE_COLORS,
    toDataUrl,
    type NavDeckMode,
} from "./render";

export const MAX_SLOTS = 10;
const DEFAULT_POLL_MS = 5000;
const SPAWN_TIMEOUT_MS = 60000;

/** Coding agent kinds offered in the '+' picker (top 10). */
const BASE_PICKER_KINDS = [
    "codex",
    "claude",
    "agy",
    "cursor",
    "zcode",
    "opencode",
    "hermes",
    "kiro",
    "kilo",
];

export interface MachineEntry {
    isLocal: boolean;
    label: string;
    target: string;
}

interface DeckAgentEntry {
    agent: HerdrAgent;
    /** null = Local/default profile, string = remote machine label. */
    machine: string | null;
    profile: HerdrProfile;
    label: string;
}

interface SlotBinding {
    action: KeyActionOf;
    slotIndex: number;
}

interface ModeBinding {
    action: KeyActionOf;
    mode: NavDeckMode;
}

function nextUniqueAgentName(kind: string, existing: HerdrAgent[]): string {
    const cleanKind = kind.toLowerCase().replace(/[^a-z0-9_-]/g, "") || "agent";
    const prefix = /^[a-z]/.test(cleanKind) ? cleanKind : `a-${cleanKind}`;
    const used = new Set(existing.map((a) => a.name).filter((n): n is string => Boolean(n)));
    for (let i = 1; i < 1000; i++) {
        const candidate = `${prefix}-${i}`.slice(0, 32);
        if (!used.has(candidate)) return candidate;
    }
    return `${prefix}-${Date.now() % 10000}`.slice(0, 32);
}

/**
 * Shared state & single polling loop for the 5x3 dynamic Stream Deck layout:
 * - Top 2 rows (slots 0..9): dynamic items for the active view
 * - Bottom row: 4 mode buttons (Agents, Machines, Windows, Tabs) + Home
 */
class DeckController {
    private view: DeckViewMode = "agents";
    /** null = local/default profile; string = saved herdr machine label (`--machine <label>`). */
    private selectedMachine: string | null = null;
    private selectedWorkspaceId: string | null = null;
    private defaultAgentKind: string = DEFAULT_AGENT_KIND;

    private slots = new Map<string, SlotBinding>();
    private modes = new Map<string, ModeBinding>();

    private agents: DeckAgentEntry[] = [];
    private machines: MachineEntry[] = [];
    private workspaces: HerdrWorkspace[] = [];
    private tabs: HerdrTab[] = [];
    /** Lookup maps for the currently selected machine's workspaces. */
    private wsById = new Map<string, HerdrWorkspace>();

    private timer: ReturnType<typeof setInterval> | null = null;
    private inFlight = false;
    private lastError: string | null = null;

    registerSlot(action: KeyActionOf, slotIndex: number): void {
        this.slots.set(action.id, { action, slotIndex });
        this.ensurePolling();
        void this.repaintSlot({ action, slotIndex });
        void this.refresh();
    }

    updateSlotIndex(actionId: string, slotIndex: number): void {
        const entry = this.slots.get(actionId);
        if (!entry) return;
        entry.slotIndex = slotIndex;
        void this.repaintSlot(entry);
    }

    unregisterSlot(actionId: string): void {
        this.slots.delete(actionId);
        this.maybeStopPolling();
    }

    registerMode(action: KeyActionOf, mode: NavDeckMode): void {
        this.modes.set(action.id, { action, mode });
        this.ensurePolling();
        void this.repaintMode({ action, mode });
        void this.refresh();
    }

    unregisterMode(actionId: string): void {
        this.modes.delete(actionId);
        this.maybeStopPolling();
    }

    /** True when this slot is currently displaying the '+' new-agent button. */
    isAddSlot(actionId: string): boolean {
        if (this.view !== "agents") return false;
        const binding = this.slots.get(actionId);
        if (!binding) return false;
        return this.agents.length < MAX_SLOTS && binding.slotIndex === this.agents.length;
    }

    async setMode(mode: NavDeckMode): Promise<void> {
        this.view = mode;
        this.lastError = null;
        await this.repaintModes();
        await this.refresh();
    }

    /** Tap on '+': show coding agent icons across the top 10 slots. */
    async openAgentPicker(): Promise<void> {
        const global = await loadGlobalSettings();
        this.defaultAgentKind = global.defaultAgentKind || DEFAULT_AGENT_KIND;
        this.view = "pick-agent";
        this.lastError = null;
        await this.repaintAll();
    }

    /**
     * Start a coding agent (defaultAgentKind if omitted) in a newly created tab
     * on the same workspace (window) as the currently focused tab.
     */
    async spawnAgentInNewTab(actionId: string, kindOverride?: string): Promise<void> {
        const binding = this.slots.get(actionId);
        const action = binding?.action;
        try {
            const global = await loadGlobalSettings();
            this.defaultAgentKind = global.defaultAgentKind || DEFAULT_AGENT_KIND;
            const kind = kindOverride ?? this.defaultAgentKind;

            if (action) {
                await action.setImage(
                    toDataUrl(agentKeySvg({ bg: "#2b6cb0", kind, sub: "starting…" })),
                );
                await action.setTitle("");
            }

            const profile = await this.activeProfile(action);
            const [wsList, liveAgents] = await Promise.all([
                workspaceList(profile).catch(() => [] as HerdrWorkspace[]),
                agentList(profile).catch(() => [] as HerdrAgent[]),
            ]);
            const focusedWs = wsList.find((w) => w.focused);
            const targetWsId = focusedWs?.workspaceId ?? this.selectedWorkspaceId ?? undefined;

            const { paneId } = await tabCreate(profile, targetWsId);
            const name = nextUniqueAgentName(kind, liveAgents);
            await agentStart(profile, name, kind, paneId, SPAWN_TIMEOUT_MS);

            this.view = "agents";
            await this.refresh();
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            streamDeck.logger.error(`DeckController.spawnAgentInNewTab: ${err.message}`);
            if (action) {
                try {
                    await action.showAlert();
                } catch {
                    // key disappeared
                }
            }
            this.view = "agents";
            await this.refresh();
        }
    }

    async pressSlot(actionId: string): Promise<void> {
        const binding = this.slots.get(actionId);
        if (!binding) return;
        const { action, slotIndex } = binding;

        try {
            if (this.view === "pick-agent") {
                const kinds = this.pickerKinds();
                const kind = kinds[slotIndex];
                if (!kind) return;
                await this.spawnAgentInNewTab(actionId, kind);
                return;
            }

            const profile = await this.activeProfile(action);

            if (this.view === "agents") {
                if (this.agents.length < MAX_SLOTS && slotIndex === this.agents.length) {
                    await this.openAgentPicker();
                    return;
                }
                const entry = this.agents[slotIndex];
                if (!entry) return;
                const target = entry.agent.name ?? entry.agent.paneId;
                if (!target) return;
                this.selectedMachine = entry.machine;
                if (entry.agent.workspaceId) {
                    this.selectedWorkspaceId = entry.agent.workspaceId;
                }
                await agentFocus(entry.profile, target);
                await this.refresh();
                return;
            }

            if (this.view === "machines") {
                const machine = this.machines[slotIndex];
                if (!machine) return;
                this.selectedMachine = machine.isLocal ? null : machine.label;
                this.selectedWorkspaceId = null;
                this.view = "windows";
                await this.repaintModes();

                const nextProfile = await this.activeProfile(action);
                const wsList = await workspaceList(nextProfile);
                this.workspaces = wsList.slice(0, MAX_SLOTS);
                this.wsById = new Map(wsList.map((w) => [w.workspaceId, w]));

                if (wsList.length > 0) {
                    const firstWs = wsList[0];
                    this.selectedWorkspaceId = firstWs.workspaceId;
                    await workspaceFocus(nextProfile, firstWs.workspaceId);
                    const wsTabs = await tabList(nextProfile, firstWs.workspaceId);
                    if (wsTabs.length > 0) {
                        await tabFocus(nextProfile, wsTabs[0].tabId);
                    }
                }
                await this.refresh();
                return;
            }

            if (this.view === "windows") {
                const ws = this.workspaces[slotIndex];
                if (!ws) return;
                this.selectedWorkspaceId = ws.workspaceId;
                await workspaceFocus(profile, ws.workspaceId);
                const wsTabs = await tabList(profile, ws.workspaceId);
                if (wsTabs.length > 0) {
                    await tabFocus(profile, wsTabs[0].tabId);
                }
                await this.refresh();
                return;
            }

            if (this.view === "tabs") {
                const tab = this.tabs[slotIndex];
                if (!tab) return;
                await tabFocus(profile, tab.tabId);
                await this.refresh();
            }
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            streamDeck.logger.error(`DeckController.pressSlot[${this.view}#${slotIndex}]: ${err.message}`);
            try {
                await action.showAlert();
            } catch {
                // key disappeared
            }
        }
    }

    private pickerKinds(): string[] {
        const list = [...BASE_PICKER_KINDS];
        if (this.defaultAgentKind && !list.includes(this.defaultAgentKind)) {
            list[list.length - 1] = this.defaultAgentKind;
        }
        return list.slice(0, MAX_SLOTS);
    }

    private ensurePolling(): void {
        if (this.timer) return;
        this.timer = setInterval(() => void this.refresh(), DEFAULT_POLL_MS);
    }

    private maybeStopPolling(): void {
        if (this.slots.size === 0 && this.modes.size === 0 && this.timer) {
            clearInterval(this.timer);
            this.timer = null;
        }
    }

    private async activeProfile(action?: KeyActionOf): Promise<HerdrProfile> {
        if (this.selectedMachine) {
            return {
                id: `machine:${this.selectedMachine}`,
                name: this.selectedMachine,
                kind: "machine",
                machine: this.selectedMachine,
            };
        }
        const settings: ActionSettings = action ? await action.getSettings().catch(() => ({})) : {};
        return resolveProfile(await loadGlobalSettings(), settings);
    }

    private async fetchAllMachineAgents(localProfile: HerdrProfile): Promise<DeckAgentEntry[]> {
        const remote = await machineList().catch(() => []);
        const targets: Array<{ machine: string | null; profile: HerdrProfile }> = [
            { machine: null, profile: localProfile },
            ...remote
                .filter((m) => m.enabled)
                .map((m) => {
                    const label = m.label || m.target;
                    return {
                        machine: label,
                        profile: {
                            id: `machine:${label}`,
                            name: label,
                            kind: "machine" as const,
                            machine: label,
                        },
                    };
                }),
        ];

        const perMachine = await Promise.all(
            targets.map(async ({ machine, profile }): Promise<DeckAgentEntry[]> => {
                try {
                    const [agents, wsList, allTabs] = await Promise.all([
                        agentList(profile),
                        workspaceList(profile).catch(() => [] as HerdrWorkspace[]),
                        tabList(profile).catch(() => [] as HerdrTab[]),
                    ]);
                    const wsMap = new Map(wsList.map((w) => [w.workspaceId, w]));
                    const tabMap = new Map(allTabs.map((t) => [t.tabId, t]));
                    if (machine === this.selectedMachine) {
                        this.wsById = wsMap;
                        const focusedWs = wsList.find((w) => w.focused);
                        if (focusedWs) this.selectedWorkspaceId = focusedWs.workspaceId;
                    }
                    return agents.map((agent) => ({
                        agent,
                        machine,
                        profile,
                        label: this.formatAgentLabel(agent, wsMap, tabMap),
                    }));
                } catch (e) {
                    streamDeck.logger.warn(
                        `DeckController: skipped agents for ${machine ?? "Local"}: ${String(e)}`,
                    );
                    return [];
                }
            }),
        );

        return perMachine.flat();
    }

    async refresh(): Promise<void> {
        if (this.inFlight) return;
        if (this.slots.size === 0 && this.modes.size === 0) return;
        this.inFlight = true;
        try {
            const global = await loadGlobalSettings();
            this.defaultAgentKind = global.defaultAgentKind || DEFAULT_AGENT_KIND;

            if (this.view === "pick-agent") {
                await this.repaintAll();
                return;
            }

            this.lastError = null;

            if (this.view === "agents") {
                const localProfile = resolveProfile(global, {});
                const allAgents = await this.fetchAllMachineAgents(localProfile);
                this.agents = allAgents.slice(0, MAX_SLOTS);
            } else if (this.view === "machines") {
                const remote = await machineList();
                const list: MachineEntry[] = [
                    { isLocal: true, label: "Local", target: "local" },
                    ...remote
                        .filter((m) => m.enabled)
                        .map((m) => ({ isLocal: false, label: m.label || m.target, target: m.target })),
                ];
                this.machines = list.slice(0, MAX_SLOTS);
            } else if (this.view === "windows") {
                const profile = await this.activeProfile();
                const wsList = await workspaceList(profile);
                this.workspaces = wsList.slice(0, MAX_SLOTS);
                this.wsById = new Map(wsList.map((w) => [w.workspaceId, w]));
                const focusedWs = wsList.find((w) => w.focused);
                if (focusedWs) this.selectedWorkspaceId = focusedWs.workspaceId;
            } else if (this.view === "tabs") {
                const profile = await this.activeProfile();
                const wsList = await workspaceList(profile);
                this.wsById = new Map(wsList.map((w) => [w.workspaceId, w]));
                const focusedWs = wsList.find((w) => w.focused);
                const wsId = focusedWs?.workspaceId ?? this.selectedWorkspaceId ?? wsList[0]?.workspaceId;
                if (wsId) {
                    this.selectedWorkspaceId = wsId;
                    const wsTabs = await tabList(profile, wsId);
                    this.tabs = wsTabs.slice(0, MAX_SLOTS);
                } else {
                    this.tabs = [];
                }
            }

            await this.repaintAll();
        } catch (e) {
            const err = e instanceof Error ? e : new Error(String(e));
            this.lastError = err instanceof HerdrError ? err.code : "error";
            streamDeck.logger.error(`DeckController.refresh[${this.view}]: ${err.message}`);
            await this.repaintAll();
        } finally {
            this.inFlight = false;
        }
    }

    private async repaintAll(): Promise<void> {
        await Promise.all([
            ...Array.from(this.slots.values()).map((b) => this.repaintSlot(b)),
            this.repaintModes(),
        ]);
    }

    private async repaintModes(): Promise<void> {
        await Promise.all(Array.from(this.modes.values()).map((b) => this.repaintMode(b)));
    }

    private async repaintMode(binding: ModeBinding): Promise<void> {
        const active =
            this.view === binding.mode || (this.view === "pick-agent" && binding.mode === "agents");
        const ws = this.selectedWorkspaceId ? this.wsById.get(this.selectedWorkspaceId) : undefined;
        let sub: string | undefined;
        if (binding.mode === "agents") {
            sub = this.view === "pick-agent" ? "pick" : String(this.agents.length);
        } else if (binding.mode === "machines") {
            sub = this.selectedMachine ?? "Local";
        } else if (binding.mode === "windows") {
            sub = ws ? ws.label || `#${ws.number}` : undefined;
        } else if (binding.mode === "tabs") {
            const count = this.view === "tabs" ? this.tabs.length : ws?.tabCount;
            if (typeof count === "number") sub = String(count);
        }
        try {
            await binding.action.setImage(toDataUrl(modeButtonSvg({ mode: binding.mode, active, sub })));
            await binding.action.setTitle("");
        } catch {
            // key disappeared
        }
    }

    private formatAgentLabel(
        agent: HerdrAgent,
        wsById: Map<string, HerdrWorkspace>,
        tabById: Map<string, HerdrTab>,
    ): string {
        if (agent.name) return agent.name;
        const ws = agent.workspaceId ? wsById.get(agent.workspaceId) : undefined;
        const tab = agent.tabId ? tabById.get(agent.tabId) : undefined;
        if (ws && tab) {
            const wsName = ws.label ? ws.label.slice(0, 7) : `W${ws.number}`;
            return `${wsName}/${tab.label || tab.number}`;
        }
        if (ws) return ws.label || `W${ws.number}`;
        return agent.tabId ?? agent.paneId ?? agent.kind ?? "?";
    }

    private async repaintSlot(binding: SlotBinding): Promise<void> {
        const { action, slotIndex } = binding;
        try {
            if (this.view === "pick-agent") {
                const kinds = this.pickerKinds();
                const kind = kinds[slotIndex];
                if (!kind) {
                    await action.setImage(toDataUrl(emptySlotSvg()));
                    await action.setTitle("");
                    return;
                }
                await action.setImage(
                    toDataUrl(
                        agentKeySvg({
                            bg: kind === this.defaultAgentKind ? "#1c4b35" : "#1c2128",
                            kind,
                            sub: kind,
                            focused: kind === this.defaultAgentKind,
                        }),
                    ),
                );
                await action.setTitle("");
                return;
            }

            if (this.lastError && slotIndex === 0) {
                await action.setImage(
                    toDataUrl(slotKeySvg({ label: this.lastError, badge: "ERR", accentColor: "#e5484d" })),
                );
                await action.setTitle("");
                return;
            }

            if (this.view === "agents") {
                const entry = this.agents[slotIndex];
                if (!entry) {
                    if (slotIndex === this.agents.length && this.agents.length < MAX_SLOTS) {
                        await action.setImage(toDataUrl(addAgentSlotSvg(this.defaultAgentKind)));
                        await action.setTitle("");
                        return;
                    }
                    await action.setImage(toDataUrl(emptySlotSvg()));
                    await action.setTitle("");
                    return;
                }
                await action.setImage(
                    toDataUrl(
                        agentKeySvg({
                            bg: STATE_COLORS[entry.agent.state],
                            kind: entry.agent.kind,
                            sub: entry.label,
                            focused: entry.agent.focused && entry.machine === this.selectedMachine,
                            tag: entry.machine ?? undefined,
                        }),
                    ),
                );
                await action.setTitle("");
                return;
            }

            if (this.view === "machines") {
                const machine = this.machines[slotIndex];
                if (!machine) {
                    await action.setImage(toDataUrl(emptySlotSvg()));
                    await action.setTitle("");
                    return;
                }
                const isSelected = machine.isLocal
                    ? this.selectedMachine === null
                    : this.selectedMachine === machine.label;
                await action.setImage(
                    toDataUrl(
                        slotKeySvg({
                            label: machine.label,
                            badge: machine.isLocal ? "LOCAL" : "SSH",
                            active: isSelected,
                        }),
                    ),
                );
                await action.setTitle("");
                return;
            }

            if (this.view === "windows") {
                const ws = this.workspaces[slotIndex];
                if (!ws) {
                    await action.setImage(toDataUrl(emptySlotSvg()));
                    await action.setTitle("");
                    return;
                }
                await action.setImage(
                    toDataUrl(
                        slotKeySvg({
                            label: ws.label || `Window ${ws.number}`,
                            badge: `W${ws.number}`,
                            active: ws.focused || ws.workspaceId === this.selectedWorkspaceId,
                            statusDot: ws.agentStatus,
                        }),
                    ),
                );
                await action.setTitle("");
                return;
            }

            if (this.view === "tabs") {
                const tab = this.tabs[slotIndex];
                if (!tab) {
                    await action.setImage(toDataUrl(emptySlotSvg()));
                    await action.setTitle("");
                    return;
                }
                const display = tab.label && tab.label !== String(tab.number) ? tab.label : `Tab ${tab.label || tab.number}`;
                await action.setImage(
                    toDataUrl(
                        slotKeySvg({
                            label: display,
                            badge: `#${tab.label || tab.number}`,
                            active: tab.focused,
                            statusDot: tab.agentStatus,
                        }),
                    ),
                );
                await action.setTitle("");
            }
        } catch {
            // key disappeared
        }
    }
}

export const deckController = new DeckController();
