# AGENTS.md

Guidance for ZCode agents working in this repository.

## What this repo is

A Stream Deck plugin for **herdr** — the open-source Rust terminal multiplexer (herdr.dev, [github.com/herdrdev/herdr](https://github.com/herdrdev/herdr)) the owner uses to run and supervise all their AI coding agents. The plugin lets the owner drive herdr from physical Stream Deck keys: see agent state, send prompts/keystrokes, spawn agents — locally, in WSL, over SSH, or inside Docker containers.

**Integration decision (settled): the plugin shells out to the `herdr` CLI.** herdr also has a socket API (herdr.dev/docs/socket-api) that supports state subscriptions, but it is out of scope unless CLI polling proves insufficient.

## Commands

```bash
npm install            # SDK + build toolchain (Node >= 20)
npm run build          # rollup: src/plugin.ts -> dev.hevangel.herdr.sdPlugin/bin/plugin.js
npx tsc --noEmit       # typecheck
npm run watch          # build + hot reload while Stream Deck runs
npm run validate       # streamdeck validate (official Elgato CLI, npx)
npm run pack           # dist .streamDeckPlugin bundle
npm run icons          # regenerate plugin-icon PNGs (pure Node, no deps)
npx streamdeck link    # dev-install into Stream Deck; `npx streamdeck restart <uuid>` to reload
```

`@elgato/cli` is a devDependency — always use `npx streamdeck ...` (the global CLI is not installed).

## Layout

```
src/plugin.ts                  entry: registers actions, seeds global settings
src/types.ts                   ActionSettings / HerdrProfile / HerdrAgent
src/herdr/profiles.ts          profile -> argv builders (incl. POSIX quoting)
src/herdr/client.ts            execFile wrapper + herdr command calls
src/herdr/render.ts            dynamic key SVGs / state colors
src/actions/base.ts            PollingAction base (per-key interval polling)
src/actions/fleet-status.ts    agent-state counts, urgency coloring
src/actions/agent-command.ts   tap = prompt/keys, hold 600ms = interrupt
src/actions/spawn-agent.ts     pane split + agent start
dev.hevangel.herdr.sdPlugin/   manifest.json, imgs/ (SVG), ui/ (Property Inspector), bin/ (built)
```

## Multi-target architecture (profiles)

Connection profiles live in **global settings** (shared by all keys, edited in each Property Inspector as JSON). Each profile says where the herdr CLI runs; `src/herdr/profiles.ts` builds argv:

| kind | argv shape | notes |
|---|---|---|
| `local` | `herdr …` | Windows herdr is beta |
| `wsl` | `wsl [-d D] -- bash -lc '<herdr …>'` | bash -l so login PATH resolves herdr |
| `machine` | `herdr --machine <label> …` | herdr's native SSH forwarding; label from `herdr machine list --json`; remote server must run and support machine API |
| `docker` | `docker exec -i <container> herdr …` | argv passed directly, no shell; herdr must be on the container PATH (use `herdrBin` override) |
| `ssh` | `ssh <host> '<herdr …>'` | remote shell joins args — every arg is POSIX single-quote escaped (`shQuote`) |
| `ssh-docker` | `ssh <host> '<docker exec -i <c> herdr …>'` | same quoting rule |
| `custom` | `<prefix argv> herdr …` | prefix split on whitespace |

SSH credentials stay owned by OpenSSH; the plugin never passes passwords. The plugin must remain non-interactive everywhere: explicit subcommand, explicit target, JSON output, bounded `execFile` timeout (herdr wait commands get timeout + 15s process headroom).

## herdr CLI facts (verified against installed 0.9.4-preview, protocol 22)

- Errors come as JSON `{"error":{"code","message"}}` (e.g. `server_not_running` when the herdr server is down); usage errors exit 2. `src/herdr/client.ts` surfaces both as `HerdrError` keyed by that code.
- Agent kinds (from `herdr agent` help): `pi claude codex gemini cursor devin agy cline omp mastracode opencode copilot kimi kiro droid amp grok hermes kilo qodercli qwen letta maki muse`.
- `herdr agent list` schema **verified live** (2026-10-27): envelope `{"id":"cli:agent:list","result":{"agents":[…],"type":"agent_list"}}`; per agent the name field is **`agent`** (not `agent_name`), state is `agent_status`, ids are `pane_id` / `tab_id` / `workspace_id`, plus `cwd`, `focused`, `agent_session{…}`. `normalizeAgent` matches this.
- Agent states: `idle working blocked done unknown`; names match `[a-z][a-z0-9_-]{0,31}`.
- Never run bare `herdr` (launches the TUI), never `herdr server stop`, never kill the herdr process, don't close panes/tabs/workspaces the plugin didn't create.
- IDs are opaque (`w1`, `w1:t1`, `w1:p1`) and parse from JSON responses only.

## Live-testing on the real deck (workflow + gotchas)

- `npx streamdeck link` registers the plugin, but a freshly linked plugin only launches after a **full Stream Deck app restart** (quit via tray/CloseMainWindow, relaunch `C:\Program Files\Elgato\StreamDeck\StreamDeck.exe`). Same for any `manifest.json` change; `npx streamdeck restart` alone often doesn't relaunch (can report success while the old process lives — verify via `logs/` mtime + node PID).
- Crash/launch evidence goes to `dev.hevangel.herdr.sdPlugin/logs/dev.hevangel.herdr.N.log` (rotated per launch; newest by mtime) and `%APPDATA%\Elgato\StreamDeck\logs\StreamDeck.log`.
- SDK 3.x requires `Software.MinimumVersion: "7.1"` (default settings behavior), the `@action({ UUID })` **standard (TC39) decorator** on every registered action class, and therefore NO `experimentalDecorators` in tsconfig. Missing the decorator = crash "The action's manifestId cannot be undefined" — happened twice; always check the class has `@action` above it.
- Stream Deck 7.6 profile store: `%APPDATA%\Elgato\StreamDeck\ProfilesV3\<profile>.sdProfile\manifest.json` (root: Pages.Current) → `Profiles/<page>/manifest.json` → `Controllers[0].Actions` keyed `"row,col"` (5×3). `scripts/inject-demo-keys.cjs` injects test keys (`AGENT_FOCUS_PANE=w9:p1` adds an Agent Focus key; backs up to `scripts/page-manifest.backup.json`); screenshot helpers: `scripts/capture-sd-window.ps1`, `scripts/click-and-capture.ps1`.
- **Clicking a key in the Stream Deck app grid SELECTS it, it does not press it** — there is no software press API. Action handlers are verified by running their exact `herdr` command sequence and checking herdr state (`agent focus` flips `focused`; `agent prompt` flips state to `working`; `pane split`+`agent start` spawn a real agent — close panes the test created). Key *rendering* is fully verifiable via screenshots; the physical press hop is hardware-only.
- The plugin is verified running against the live herdr server with real agents: kind icons render (OC monogram), state colors flip live idle↔working on poll ticks, focus/prompt/spawn backends verified (spawned claude then closed its pane). Screenshots in `docs/screenshots/`, embedded by the root `index.html` user guide.
- The user works on this machine — never blind-capture the screen region without confirming the Stream Deck window is foreground (a capture once grabbed the user's browser).

## Publishing to the Elgato Marketplace (researched 2026-10-27)

Official catalog: marketplace.elgato.com. Submission portal: **Maker Console** (maker.elgato.com). Flow:

1. `npm run validate` then `npm run pack` → `dist/*.streamDeckPlugin` (pack validates too; `.sdignore` excludes files).
2. Maker Console → create organization + sign the Maker Agreement (Stripe Connect only for paid products; free has no restrictions). Author in manifest must match the Marketplace organization name.
3. Listing assets: plugin icon PNG 256+512 (have), category icon 28×28 + action icons 20×20 monochrome white SVG (have), 1 thumbnail + ≥3 gallery images (can reuse `docs/screenshots/`), description ≤1500 chars, optional links (website/support/privacy).
4. Upload → review → publish. Beta/test builds: upload with "Publish after review" unchecked; DRM-processed builds download from the product's Versions tab.
5. Updates: same flow (never change UUIDs; clone + hide old actions instead).

Guideline gaps to close BEFORE submitting:

- Call `showAlert()` when an action fails (guidelines require it; we only paint the key today).
- Check the name "herdr" is unique on Marketplace; Author must equal the Maker org name.
- DRM (optional, default-on for SDKVersion 3 + CLI 1.6+): needs manifest `SDKVersion: 3` + `@elgato/streamdeck` v2+ (have 3.x) + `Software.MinimumVersion` ≥ 6.9 (ours is 7.1) + shipped files immutable (never rewrite plugin files at runtime except SDK-managed `logs/`).
- Support: Marketplace Makers Discord / maker@elgato.com.

## Stream Deck specifics (learned the hard way — keep these)

- Plugin folder **must** be named after the plugin: `dev.hevangel.herdr.sdPlugin` (reverse-DNS), and manifest `Name` + `Category` must match it. Action UUIDs are referenced by user profiles — never rename them.
- `SDKVersion: 2`, `Software.MinimumVersion: "6.9"`, `Nodejs: {"Version": "20", "Debug": "enabled"}`. The `Localization` manifest field is **v3-only** — it fails v2 validation.
- `dev.hevangel.herdr.sdPlugin/package.json` contains `{"type": "commonjs"}` on purpose: the repo root is `"type": "module"`, and `streamdeck link` dev-installs by symlink, so Node would otherwise load the CJS bundle as ESM and crash. Do not delete it.
- Top-level `Icon` must be PNG (256 + `@2x` 512, extension-less manifest paths); action/state images may be SVG. `action.setImage()` accepts `data:image/svg+xml;base64,…` — that's how dynamic keys are drawn (`src/herdr/render.ts`).
- Only keypad actions ship (`Controllers: ["Keypad"]`); `PollingAction` narrows with `ev.payload.controller === "Keypad"` and casts, because `WillAppearEvent.action` is a `DialAction | KeyAction | …` union.
- Property Inspector is hand-rolled (`ui/pi-common.js` — raw WebSocket, no sdpi-components): global profiles JSON editor + per-action fields, saved via `setSettings`/`setGlobalSettings`.
- Default singleton pattern: actions extend `SingletonAction<ActionSettings>`; settings interfaces must `extends JsonObject` (SDK generic constraint).

## Environment

- Windows dev machine (Git Bash shell); herdr 0.9.4-preview, Docker Desktop, OpenSSH and WSL are installed locally. herdr Windows support is beta — SSH/WSL/Docker targets are the owner's primary paths.
- `.mimosa/` is local tool state — never commit or edit it.
- `herdr status` tells you client/server versions; `herdr machine list --json` lists saved SSH machines for the PI's profile examples.
