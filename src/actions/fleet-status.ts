import { action, KeyAction, KeyDownEvent } from "@elgato/streamdeck";
import type { ActionSettings, AgentState, HerdrProfile } from "../types";
import { agentList, resolveProfile } from "../herdr/client";
import { keySvg, toDataUrl, worstState } from "../herdr/render";
import { PollingAction, loadGlobalSettings } from "./base";

type Counts = Record<AgentState, number>;

function emptyCounts(): Counts {
    return { idle: 0, working: 0, blocked: 0, done: 0, unknown: 0 };
}

/**
 * Shows live agent-state counts for one herdr target. The key turns the color
 * of the most urgent state (blocked > working > done > idle). Press to refresh.
 */
@action({ UUID: "dev.hevangel.herdr.fleet-status" })
export class FleetStatus extends PollingAction {
    override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
        try {
            const settings = await ev.action.getSettings();
            const profile = resolveProfile(await loadGlobalSettings(), settings);
            await this.refresh(ev.action, settings, profile);
        } catch (e) {
            await this.onError(ev.action, e instanceof Error ? e : new Error(String(e)));
        }
    }

    protected async refresh(
        action: KeyAction<ActionSettings>,
        _settings: ActionSettings,
        profile: HerdrProfile,
    ): Promise<void> {
        const agents = await agentList(profile);
        const counts = emptyCounts();
        for (const agent of agents) counts[agent.state] += 1;

        const { bg, label } = worstState(counts, agents.length);
        await action.setImage(toDataUrl(keySvg({ bg, headline: String(agents.length), sub: label })));
        await action.setTitle(this.titleFor(counts, agents.length));
    }

    private titleFor(counts: Counts, total: number): string {
        if (total === 0) return "no\nagents";
        const lines: string[] = [];
        for (const [state, count] of Object.entries(counts)) {
            if (count > 0) lines.push(`${count} ${state}`);
        }
        return lines.join("\n");
    }
}
