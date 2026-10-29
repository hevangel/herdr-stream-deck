import { action, KeyAction, KeyDownEvent, KeyUpEvent } from "@elgato/streamdeck";
import type { ActionSettings, HerdrProfile } from "../types";
import { agentList, agentPrompt, agentSendKeys, resolveAgentTarget, resolveProfile } from "../herdr/client";
import { agentKeySvg, STATE_COLORS, toDataUrl } from "../herdr/render";
import { PollingAction, loadGlobalSettings } from "./base";

const LONG_PRESS_MS = 600;

/**
 * Sends a prompt (or keystrokes) to one agent. Tap runs the configured action;
 * holding the key for >=600ms sends the long-press keys (default ctrl+c) to
 * interrupt. With no agent configured, targets the agent needing attention
 * (blocked first, then working, done, idle).
 */
@action({ UUID: "dev.hevangel.herdr.agent-command" })
export class AgentCommand extends PollingAction {
    private keyDownAt = new Map<string, number>();

    override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
        this.keyDownAt.set(ev.action.id, Date.now());
    }

    override async onKeyUp(ev: KeyUpEvent<ActionSettings>): Promise<void> {
        const startedAt = this.keyDownAt.get(ev.action.id);
        this.keyDownAt.delete(ev.action.id);
        const held = startedAt ? Date.now() - startedAt : 0;
        await this.run(ev.action, held >= LONG_PRESS_MS);
    }

    protected async refresh(
        action: KeyAction<ActionSettings>,
        settings: ActionSettings,
        profile: HerdrProfile,
    ): Promise<void> {
        const agents = await agentList(profile);
        const target = resolveAgentTarget(settings, agents);
        if (!target) {
            await action.setImage(toDataUrl(agentKeySvg({ bg: "#3a3f45", kind: null, sub: "no agents" })));
            await action.setTitle("no agents");
            return;
        }
        const agent = agents.find((a) => a.name === target || a.paneId === target);
        await action.setImage(
            toDataUrl(agentKeySvg({ bg: STATE_COLORS[agent?.state ?? "unknown"], kind: agent?.kind, sub: agent?.name ?? target })),
        );
        await action.setTitle(this.displayName(settings.agentName, agent?.name, agent?.kind));
    }

    private async run(action: KeyAction<ActionSettings>, longPress: boolean): Promise<void> {
        try {
            const settings = await action.getSettings();
            const profile = resolveProfile(await loadGlobalSettings(), settings);

            const agents = await agentList(profile);
            const target = resolveAgentTarget(settings, agents);
            if (!target) {
                await action.setTitle("no agents");
                return;
            }
            const agent = agents.find((a) => a.name === target || a.paneId === target);

            if (longPress) {
                const keys = (settings.longPressKeys || "ctrl+c").trim().split(/\s+/);
                await agentSendKeys(profile, target, keys);
                await this.flash(action, "sent", "#2b6cb0", agent?.kind, settings, profile);
                return;
            }
            if ((settings.mode ?? "prompt") === "keys") {
                const key = settings.keyName?.trim() || "enter";
                await agentSendKeys(profile, target, [key]);
                await this.flash(action, key, "#2b6cb0", agent?.kind, settings, profile);
                return;
            }
            const text = settings.promptText?.trim();
            if (!text) {
                await this.flash(action, "no text", "#6e7681", agent?.kind, settings, profile);
                return;
            }
            await agentPrompt(profile, target, text, settings.useWait ?? false, settings.waitMs ?? 120000);
            await this.flash(action, "sent", "#46a758", agent?.kind, settings, profile);
        } catch (e) {
            await this.onError(action, e instanceof Error ? e : new Error(String(e)));
        }
    }

    /** Show success feedback for 1.5s, then repaint the live state. */
    private async flash(
        action: KeyAction<ActionSettings>,
        text: string,
        color: string,
        kind: string | null | undefined,
        settings: ActionSettings,
        profile: HerdrProfile,
    ): Promise<void> {
        await action.setImage(toDataUrl(agentKeySvg({ bg: color, kind, sub: text })));
        await new Promise((resolve) => setTimeout(resolve, 1500));
        try {
            await this.refresh(action, settings, profile);
        } catch {
            // The next poll tick will repaint; keep the flash visible meanwhile.
        }
    }

    private displayName(configured: string | undefined, resolved: string | null | undefined, kind: string | null | undefined): string {
        const raw = configured?.trim() || resolved || "agent";
        const short = raw.length > 12 ? `${raw.slice(0, 11)}…` : raw;
        return kind ? `${short}\n${kind}` : short;
    }
}
