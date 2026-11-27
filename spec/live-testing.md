# Live Testing on the Real Stream Deck

Workflow and gotchas for testing changes against the installed Elgato Stream Deck app on Windows.

## Linking & Reloading

- `npx streamdeck link` registers the plugin, but a freshly linked plugin only launches after a **full Stream Deck app restart** (quit via tray / `CloseMainWindow`, then relaunch `C:\Program Files\Elgato\StreamDeck\StreamDeck.exe`).
- The same full restart is required for any `manifest.json` change.
- `npx streamdeck restart` alone often does not relaunch (it can report success while the old process stays alive) — always verify via `logs/` mtime and Node PID.

## Logs

- Plugin crash/launch logs: `dev.hevangel.herdr.sdPlugin/logs/dev.hevangel.herdr.N.log` (rotated per launch; newest by mtime).
- Stream Deck host app log: `%APPDATA%\Elgato\StreamDeck\logs\StreamDeck.log`.

## Profile Store & Demo Key Injection

- Stream Deck 7.6 profile store:
  `%APPDATA%\Elgato\StreamDeck\ProfilesV3\<profile>.sdProfile\manifest.json` (root: `Pages.Current`) → `Profiles/<page>/manifest.json` → `Controllers[0].Actions` keyed `"row,col"` (5×3 grid).
- `scripts/inject-demo-keys.cjs` injects test keys (`AGENT_FOCUS_PANE=w9:p1` adds an Agent Focus key) and backs up the original manifest to `scripts/page-manifest.backup.json`.
- Screenshot helpers: `scripts/capture-sd-window.ps1`, `scripts/click-and-capture.ps1`.

## Verification Limitations & Strategy

- **Clicking a key in the Stream Deck app grid SELECTS it; it does not press it** — there is no software key-press API.
- Verify **action handlers** by running their exact `herdr` command sequence and checking `herdr` state:
  - `agent focus` flips `focused`
  - `agent prompt` flips state to `working`
  - `pane split` + `agent start` spawns a real agent (close panes created by the test afterward)
- Key **rendering** is fully verifiable via screenshots; only the physical press hop is hardware-only.
- Verified baseline: kind icons render (e.g. `OC` monogram), state colors flip live `idle` ↔ `working` on poll ticks, and focus/prompt/spawn backends have been verified live. Screenshots live in `docs/screenshots/` and are embedded by `index.html`.

## Screen Capture Etiquette

- The user actively works on this machine — **never blind-capture the screen region** without confirming the Stream Deck window is in the foreground.
