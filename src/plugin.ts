import streamDeck from "@elgato/streamdeck";
import { AgentCommand } from "./actions/agent-command";
import { FleetStatus } from "./actions/fleet-status";
import { SpawnAgent } from "./actions/spawn-agent";
import { DEFAULT_PROFILES } from "./herdr/profiles";

const pkg = { name: "dev.hevangel.herdr", version: "1.0.0" } as const;

async function seedGlobalSettings(): Promise<void> {
    try {
        const existing = await streamDeck.settings.getGlobalSettings();
        const profiles = (existing as { profiles?: unknown })?.profiles;
        if (Array.isArray(profiles) && profiles.length > 0) return;
        await streamDeck.settings.setGlobalSettings({
            profiles: DEFAULT_PROFILES,
            defaultProfileId: DEFAULT_PROFILES[0].id,
        });
    } catch (e) {
        streamDeck.logger.warn(`could not seed global settings: ${String(e)}`);
    }
}

streamDeck.actions.registerAction(new FleetStatus());
streamDeck.actions.registerAction(new AgentCommand());
streamDeck.actions.registerAction(new SpawnAgent());

streamDeck
    .connect()
    .then(async () => {
        streamDeck.logger.info(`${pkg.name} v${pkg.version} connected`);
        await seedGlobalSettings();
    })
    .catch((e: unknown) => streamDeck.logger.error(`connection failed: ${String(e)}`));
