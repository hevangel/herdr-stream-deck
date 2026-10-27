import { action, KeyAction, KeyDownEvent, SingletonAction } from "@elgato/streamdeck";
import type { ActionSettings } from "../types";
import { agentStart, paneSplit, resolveProfile } from "../herdr/client";
import { keySvg, toDataUrl } from "../herdr/render";
import { loadGlobalSettings } from "./base";

/** Sanitize to herdr's agent name rule: [a-z][a-z0-9_-]{0,31}. */
function sanitizeName(raw: string): string {
    const cleaned = raw.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+/, "").slice(0, 31);
    return /^[a-z]/.test(cleaned) ? cleaned : `a${cleaned.slice(0, 30)}`;
}

/**
 * Splits a pane in the target herdr session and starts a coding agent in it.
 * Without an explicit pane, herdr splits the pane focused in its TUI.
 */
@action({ UUID: "dev.hevangel.herdr.spawn-agent" })
export class SpawnAgent extends SingletonAction<ActionSettings> {
    override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
        const action: KeyAction<ActionSettings> = ev.action;
        try {
            const settings = await action.getSettings();
            const profile = resolveProfile(await loadGlobalSettings(), settings);

            const kind = settings.kind?.trim() || "claude";
            const name = sanitizeName(settings.newAgentName?.trim() || `${kind}-${Date.now() % 10000}`);
            const timeoutMs = settings.spawnTimeoutMs ?? 60000;

            await action.setImage(toDataUrl(keySvg({ bg: "#f5a623", sub: "splitting…" })));
            const paneId = await paneSplit(profile, settings.direction ?? "right", settings.paneId?.trim() || undefined, undefined);

            await action.setImage(toDataUrl(keySvg({ bg: "#f5a623", sub: `starting ${kind}…` })));
            try {
                await agentStart(profile, name, kind, paneId, timeoutMs);
            } catch (e) {
                if ((e as { code?: string }).code === "agent_not_ready") {
                    // The agent process is still starting; herdr keeps the name reserved.
                    await action.setImage(toDataUrl(keySvg({ bg: "#4c7dff", sub: "slow start" })));
                    await action.setTitle(`${name}\n(not ready yet)`);
                    return;
                }
                throw e;
            }
            await action.setImage(toDataUrl(keySvg({ bg: "#46a758", sub: "started" })));
            await action.setTitle(name);
        } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            await action.setImage(undefined);
            await action.setTitle(`fail\n${message.slice(0, 24)}`);
        } finally {
            setTimeout(() => void action.setImage(undefined), 4000);
        }
    }
}
