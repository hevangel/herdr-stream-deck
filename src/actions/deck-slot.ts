import {
    action,
    DidReceiveSettingsEvent,
    KeyDownEvent,
    KeyUpEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import type { ActionSettings } from "../types";
import { deckController, MAX_SLOTS } from "../herdr/deck-state";
import type { KeyActionOf } from "./base";

const DECK_COLUMNS = 5;
const LONG_PRESS_MS = 600;

function resolveSlotIndex(
    settings: ActionSettings,
    coords?: { row: number; column: number },
): number {
    if (typeof settings.slotIndex === "number" && Number.isFinite(settings.slotIndex)) {
        return Math.max(0, Math.min(MAX_SLOTS - 1, Math.floor(settings.slotIndex)));
    }
    if (coords) {
        const idx = coords.row * DECK_COLUMNS + coords.column;
        return Math.max(0, Math.min(MAX_SLOTS - 1, idx));
    }
    return 0;
}

/**
 * Dynamic top-row slot (0..9) driven by the active deck view:
 * Agents (default, with '+' on the first empty slot), Machines, Windows, Tabs,
 * or the coding-agent picker after tapping '+'.
 */
@action({ UUID: "dev.hevangel.herdr.deck-slot" })
export class DeckSlot extends SingletonAction<ActionSettings> {
    private coords = new Map<string, { row: number; column: number }>();
    private holdTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private longPressed = new Set<string>();

    override onWillAppear(ev: WillAppearEvent<ActionSettings>): void {
        if (ev.payload.controller !== "Keypad") return;
        const keyAction = ev.action as KeyActionOf;
        const coords = !ev.payload.isInMultiAction ? ev.payload.coordinates : undefined;
        if (coords) {
            this.coords.set(keyAction.id, coords);
        }
        const idx = resolveSlotIndex(ev.payload.settings, coords);
        deckController.registerSlot(keyAction, idx);
    }

    override onWillDisappear(ev: WillDisappearEvent<ActionSettings>): void {
        this.clearHold(ev.action.id);
        this.coords.delete(ev.action.id);
        deckController.unregisterSlot(ev.action.id);
    }

    override onDidReceiveSettings(ev: DidReceiveSettingsEvent<ActionSettings>): void {
        const idx = resolveSlotIndex(ev.payload.settings, this.coords.get(ev.action.id));
        deckController.updateSlotIndex(ev.action.id, idx);
    }

    override async onKeyDown(ev: KeyDownEvent<ActionSettings>): Promise<void> {
        const id = ev.action.id;
        this.clearHold(id);

        if (deckController.isAddSlot(id)) {
            const timer = setTimeout(() => {
                this.holdTimers.delete(id);
                this.longPressed.add(id);
                void deckController.spawnAgentInNewTab(id);
            }, LONG_PRESS_MS);
            this.holdTimers.set(id, timer);
            return;
        }

        await deckController.pressSlot(id);
    }

    override async onKeyUp(ev: KeyUpEvent<ActionSettings>): Promise<void> {
        const id = ev.action.id;
        if (this.longPressed.delete(id)) return;
        const timer = this.holdTimers.get(id);
        if (!timer) return;
        clearTimeout(timer);
        this.holdTimers.delete(id);
        await deckController.openAgentPicker();
    }

    private clearHold(actionId: string): void {
        const timer = this.holdTimers.get(actionId);
        if (timer) {
            clearTimeout(timer);
            this.holdTimers.delete(actionId);
        }
        this.longPressed.delete(actionId);
    }
}
