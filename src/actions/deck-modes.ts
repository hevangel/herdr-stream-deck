import {
    action,
    KeyDownEvent,
    SingletonAction,
    WillAppearEvent,
    WillDisappearEvent,
} from "@elgato/streamdeck";
import type { ActionSettings } from "../types";
import { deckController } from "../herdr/deck-state";
import type { NavDeckMode } from "../herdr/render";
import type { KeyActionOf } from "./base";

abstract class DeckModeAction extends SingletonAction<ActionSettings> {
    protected abstract readonly mode: NavDeckMode;

    override onWillAppear(ev: WillAppearEvent<ActionSettings>): void {
        if (ev.payload.controller !== "Keypad") return;
        deckController.registerMode(ev.action as KeyActionOf, this.mode);
    }

    override onWillDisappear(ev: WillDisappearEvent<ActionSettings>): void {
        deckController.unregisterMode(ev.action.id);
    }

    override async onKeyDown(_ev: KeyDownEvent<ActionSettings>): Promise<void> {
        await deckController.setMode(this.mode);
    }
}

@action({ UUID: "dev.hevangel.herdr.mode-agents" })
export class ModeAgents extends DeckModeAction {
    protected readonly mode: NavDeckMode = "agents";
}

@action({ UUID: "dev.hevangel.herdr.mode-machines" })
export class ModeMachines extends DeckModeAction {
    protected readonly mode: NavDeckMode = "machines";
}

@action({ UUID: "dev.hevangel.herdr.mode-windows" })
export class ModeWindows extends DeckModeAction {
    protected readonly mode: NavDeckMode = "windows";
}

@action({ UUID: "dev.hevangel.herdr.mode-tabs" })
export class ModeTabs extends DeckModeAction {
    protected readonly mode: NavDeckMode = "tabs";
}
