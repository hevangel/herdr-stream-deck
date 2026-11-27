# Stream Deck SDK & Plugin Specifics

Constraints and conventions learned the hard way — keep these intact when modifying the manifest, actions, rendering, or Property Inspector.

## Plugin Structure & Manifest

- The plugin folder **must** use reverse-DNS naming: `dev.hevangel.herdr.sdPlugin`, and manifest `Name` + `Category` must match it.
- Action UUIDs are referenced by user profiles — **never rename them**.
- Current manifest config: `SDKVersion: 2`, `Software.MinimumVersion: "7.1"` (required by `@elgato/streamdeck` SDK 3.x for default settings behavior; earlier v2 baseline was `"6.9"`), `Nodejs: {"Version": "20", "Debug": "enabled"}`.
- The `Localization` manifest field is **v3-only** — it fails v2 validation.
- `dev.hevangel.herdr.sdPlugin/package.json` contains `{"type": "commonjs"}` intentionally: the repo root is `"type": "module"`, and `streamdeck link` dev-installs via symlink, so Node would otherwise load the CJS bundle as ESM and crash. **Do not delete it.**

## SDK 3.x & TypeScript Action Rules

- Every registered action class **must** have the `@action({ UUID })` **standard (TC39) decorator** above it, and `tsconfig.json` must **not** enable `experimentalDecorators`. Missing the decorator causes a runtime crash (`The action's manifestId cannot be undefined`).
- Actions follow the default singleton pattern: extend `SingletonAction<ActionSettings>`, and all settings interfaces must `extends JsonObject` (SDK generic constraint).
- Only keypad actions ship (`Controllers: ["Keypad"]`). `PollingAction` narrows with `ev.payload.controller === "Keypad"` and casts, because `WillAppearEvent.action` is a `DialAction | KeyAction | …` union.

## Icons & Dynamic Key Rendering

- Top-level `Icon` must be PNG (`256` + `@2x` `512`, extension-less manifest paths); regenerate via `npm run icons`.
- Action and state images may be SVG.
- Dynamic keys are drawn by passing `data:image/svg+xml;base64,…` to `action.setImage()` (implemented in `src/herdr/render.ts`).

## Property Inspector

- The Property Inspector is hand-rolled (`dev.hevangel.herdr.sdPlugin/ui/pi-common.js` — raw WebSocket, no `sdpi-components`).
- Includes a shared global profiles JSON editor plus per-action fields, persisted via `setSettings` / `setGlobalSettings`.
