import { action, KeyAction, KeyDownEvent } from "@elgato/streamdeck";
import type { ActionSettings, HerdrAgent, HerdrProfile } from "../types";
import { agentFocus, agentList, resolveAgentTarget, resolveProfile } from "../herdr/client";
import { agentKeySvg, STATE_COLORS, toDataUrl } from "../herdr/render";
import { PollingAction, loadGlobalSettings } from "./base";

/**
 * One key per agent: shows the agent's kind icon, name and live state; pressing
 * it moves herdr's focus to the tab hosting that agent (and marks it seen).
 * Pin an agent by unique name or pane id; unpinned keys auto-target the agent
 * needing attention.
 */
@action({ UUID: "dev.hevangel.herdr.agent-focus" })
export class AgentFocus extends PollingAction {
    override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
        try {
            const settings = await ev.action.getSettings();
            const profile = resolveProfile(await loadGlobalSettings(), settings);
            const agents = await agentList(profile);
            const target = resolveAgentTarget(settings, agents);
            if (!target) {
                await ev.action.setTitle("no agents");
                return;
            }
            await agentFocus(profile, target);
            await this.flash(ev.action, agents.find((a) => a.name === target || a.paneId === target), "focused");
        } catch (e) {
            await this.onError(ev.action, e instanceof Error ? e : new Error(String(e)));
        }
    }

    protected async refresh(
        action: KeyAction<ActionSettings>,
        settings: ActionSettings,
        profile: HerdrProfile,
    ): Promise<void> {
        const agents = await agentList(profile);
        const target = resolveAgentTarget(settings, agents);
        const agent = target ? agents.find((a) => a.name === target || a.paneId === target) : undefined;
        if (!agent) {
            await action.setImage(toDataUrl(agentKeySvg({ bg: "#3a3f45", kind: null, sub: "no agent" })));
            await action.setTitle("no agent");
            return;
        }
        await this.render(action, agent);
    }

    private async render(action: KeyAction<ActionSettings>, agent: HerdrAgent): Promise<void> {
        await action.setImage(toDataUrl(agentKeySvg({ bg: STATE_COLORS[agent.state], kind: agent.kind, sub: agent.name ?? agent.paneId ?? "?" })));
        await action.setTitle("");
    }

    /** Show success feedback for ~1.2s, then repaint the live state. */
    private async flash(action: KeyAction<ActionSettings>, agent: HerdrAgent | undefined, text: string): Promise<void> {
        await action.setImage(toDataUrl(agentKeySvg({ bg: "#2b6cb0", kind: agent?.kind, sub: text })));
        await new Promise((resolve) => setTimeout(resolve, 1200));
        try {
            const settings = await action.getSettings();
            const profile = resolveProfile(await loadGlobalSettings(), settings);
            const agents = await agentList(profile);
            const target = resolveAgentTarget(settings, agents);
            const fresh = target ? agents.find((a) => a.name === target || a.paneId === target) : undefined;
            if (fresh) await this.render(action, fresh);
        } catch {
            // The next poll tick will repaint; keep the flash visible meanwhile.
        }
    }
}
