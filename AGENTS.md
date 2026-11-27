# AGENTS.md

Guidance for coding agents working in this repository.

## What This Repo Is

A Stream Deck plugin for **herdr** — the open-source Rust terminal multiplexer ([herdr.dev](https://herdr.dev), [github.com/herdrdev/herdr](https://github.com/herdrdev/herdr)) used to run and supervise AI coding agents from physical Stream Deck keys (locally, in WSL, over SSH, or inside Docker containers).

**Core integration decision:** the plugin shells out to the `herdr` CLI (socket API is out of scope unless CLI polling proves insufficient).

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

## Always-On Rules & Environment

- **herdr safety:** never run bare `herdr` (launches TUI), never run `herdr server stop`, never kill the `herdr` process, and never close panes/tabs/workspaces the plugin or your test didn't create.
- **Repo hygiene:** `.mimosa/` is local tool state — never commit or edit it. Never rename action UUIDs in `manifest.json`.
- **Environment:** Windows dev machine (Git Bash / PowerShell) with `herdr` 0.9.4-preview, Docker Desktop, OpenSSH, and WSL installed. Windows `herdr` support is beta — SSH/WSL/Docker targets are primary paths.

## Detailed Specs (`spec/`)

Read only the spec(s) relevant to your current task:

| Spec | Read when… |
|---|---|
| [spec/architecture.md](spec/architecture.md) | Reviewing or changing codebase layout, CLI integration, or multi-target connection profiles (`profiles.ts`) |
| [spec/herdr-cli.md](spec/herdr-cli.md) | Working with `herdr` commands, JSON schemas, error codes, agent kinds/states, or `client.ts` |
| [spec/stream-deck-sdk.md](spec/stream-deck-sdk.md) | Editing `manifest.json`, action classes (`@action`), SVG rendering (`render.ts`), or the Property Inspector (`ui/`) |
| [spec/live-testing.md](spec/live-testing.md) | Linking, restarting, reading logs, injecting demo keys, or capturing screenshots on the real Stream Deck app |
| [spec/marketplace-publishing.md](spec/marketplace-publishing.md) | Packaging, validating, or preparing a submission for the Elgato Marketplace |
