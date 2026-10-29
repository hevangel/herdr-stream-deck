import streamDeck, {
    DidReceiveSettingsEvent,
    KeyAction,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import type { ActionSettings, GlobalSettings, HerdrProfile } from "../types";
import { HerdrError, resolveProfile } from "../herdr/client";
import { normalizeGlobalSettings } from "../herdr/profiles";

const MIN_POLL_SECONDS = 5;
const MAX_POLL_SECONDS = 3600;

export type KeyActionOf = KeyAction<ActionSettings>;

export async function loadGlobalSettings(): Promise<GlobalSettings> {
    return normalizeGlobalSettings(await streamDeck.settings.getGlobalSettings());
}

/**
 * Base for keypad actions that keep a live state on their key while visible.
 * Polling restarts when settings change (poll interval) and stops when hidden.
 */
export abstract class PollingAction extends SingletonAction<ActionSettings> {
    private timers = new Map<string, ReturnType<typeof setInterval>>();
    private live = new Map<string, KeyActionOf>();

    override onWillAppear(ev: WillAppearEvent<ActionSettings>): void {
        if (ev.payload.controller !== "Keypad") return;
        // Controller check above guarantees a keypad action at runtime.
        const action = ev.action as KeyActionOf;
        this.live.set(action.id, action);
        this.schedule(action);
    }

    override onWillDisappear(ev: WillDisappearEvent<ActionSettings>): void {
        this.unschedule(ev.action.id);
        this.live.delete(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>): void {
        // Poll interval may have changed; restart the loop.
        const action = this.live.get(ev.action.id);
        if (action) this.schedule(action);
    }

    protected pollSeconds(settings: ActionSettings): number {
        const raw = settings.pollInterval ?? 15;
        return Math.min(MAX_POLL_SECONDS, Math.max(MIN_POLL_SECONDS, Math.floor(raw)));
    }

    private schedule(action: KeyActionOf): void {
        this.unschedule(action.id);
        void (async () => {
            try {
                const settings = await action.getSettings();
                const timer = setInterval(() => void this.tick(action), this.pollSeconds(settings) * 1000);
                this.timers.set(action.id, timer);
                void this.tick(action);
            } catch (e) {
                streamDeck.logger.error(`poll scheduling failed: ${String(e)}`);
            }
        })();
    }

    private unschedule(actionId: string): void {
        const timer = this.timers.get(actionId);
        if (timer) {
            clearInterval(timer);
            this.timers.delete(actionId);
        }
    }

    private async tick(action: KeyActionOf): Promise<void> {
        try {
            const settings = await action.getSettings();
            const profile = resolveProfile(await loadGlobalSettings(), settings);
            await this.refresh(action, settings, profile);
        } catch (e) {
            await this.onError(action, e instanceof Error ? e : new Error(String(e)));
        }
    }

    protected abstract refresh(action: KeyActionOf, settings: ActionSettings, profile: HerdrProfile): Promise<void>;

    protected async onError(action: KeyActionOf, error: Error): Promise<void> {
        const code = error instanceof HerdrError ? error.code : "error";
        const short: Record<string, string> = {
            server_not_running: "herdr\nnot running",
            no_profile: "no\nprofile",
            timeout: "timeout",
            spawn_failed: "spawn\nfailed",
            usage: "bad\ncommand",
        };
        try {
            await action.setImage(undefined);
            await action.setTitle(short[code] ?? `err\n${code}`);
            // Marketplace guideline: surface failures via the standard alert.
            await action.showAlert();
        } catch {
            // Key went away mid-update; the poll loop stops on disappear.
        }
        streamDeck.logger.error(`${this.constructor.name}: ${error.message}`);
    }
}
