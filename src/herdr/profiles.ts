import type { GlobalSettings, HerdrProfile } from "../types";

export const DEFAULT_PROFILES: HerdrProfile[] = [{ id: "local", name: "Local", kind: "local" }];

export function normalizeGlobalSettings(raw: unknown): GlobalSettings {
    const g = (raw ?? {}) as GlobalSettings;
    const profiles = Array.isArray(g.profiles) && g.profiles.length > 0 ? g.profiles : DEFAULT_PROFILES;
    return { profiles, defaultProfileId: g.defaultProfileId ?? profiles[0]?.id };
}

export function findProfile(globalSettings: GlobalSettings, profileId?: string): HerdrProfile | undefined {
    const profiles = globalSettings.profiles ?? [];
    if (profileId) return profiles.find((p) => p.id === profileId);
    const defaultId = globalSettings.defaultProfileId;
    return profiles.find((p) => p.id === defaultId) ?? profiles[0];
}

/**
 * Quote one argument for a POSIX shell. Only ssh targets run commands through a
 * remote shell; local/wsl/docker targets receive an argv array directly.
 */
export function shQuote(arg: string): string {
    if (arg === "") return "''";
    if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(arg)) return arg;
    return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export interface BuiltCommand {
    argv: string[];
    /** Human-readable description for logs, e.g. "ssh gpu-box". */
    describe: string;
}

/**
 * Build the argv that spawns herdr for a profile. Windows targets spawn without
 * a shell; the ssh kinds join a single remote command string (POSIX-quoted).
 */
export function buildCommand(profile: HerdrProfile, herdrArgs: string[]): BuiltCommand {
    const herdr = profile.herdrBin || "herdr";
    switch (profile.kind) {
        case "local":
            return { argv: [herdr, ...herdrArgs], describe: "local" };
        case "wsl": {
            const argv = ["wsl"];
            if (profile.distro) argv.push("-d", profile.distro);
            // bash -l so the login profile puts herdr on PATH inside the distro.
            argv.push("--", "bash", "-lc", [herdr, ...herdrArgs].map(shQuote).join(" "));
            return { argv, describe: `wsl${profile.distro ? `:${profile.distro}` : ""}` };
        }
        case "machine":
            if (!profile.machine) throw new Error(`profile "${profile.name}" (machine) is missing the machine label`);
            return { argv: [herdr, "--machine", profile.machine, ...herdrArgs], describe: `machine:${profile.machine}` };
        case "docker":
            if (!profile.container) throw new Error(`profile "${profile.name}" (docker) is missing the container name`);
            return {
                argv: ["docker", "exec", "-i", profile.container, herdr, ...herdrArgs],
                describe: `docker:${profile.container}`,
            };
        case "ssh": {
            if (!profile.sshHost) throw new Error(`profile "${profile.name}" (ssh) is missing the ssh host`);
            return {
                argv: ["ssh", profile.sshHost, [herdr, ...herdrArgs].map(shQuote).join(" ")],
                describe: `ssh:${profile.sshHost}`,
            };
        }
        case "ssh-docker": {
            if (!profile.sshHost) throw new Error(`profile "${profile.name}" (ssh-docker) is missing the ssh host`);
            if (!profile.container)
                throw new Error(`profile "${profile.name}" (ssh-docker) is missing the container name`);
            const remote = ["docker", "exec", "-i", profile.container, herdr, ...herdrArgs]
                .map(shQuote)
                .join(" ");
            return { argv: ["ssh", profile.sshHost, remote], describe: `ssh:${profile.sshHost} docker:${profile.container}` };
        }
        case "custom": {
            const prefix = (profile.prefix ?? "").trim().split(/\s+/).filter(Boolean);
            if (prefix.length === 0) throw new Error(`profile "${profile.name}" (custom) is missing a command prefix`);
            return { argv: [...prefix, herdr, ...herdrArgs], describe: `custom:${prefix.join(" ")}` };
        }
    }
}
