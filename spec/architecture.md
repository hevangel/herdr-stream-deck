# Architecture & Design

## Integration Model

**Settled decision: the plugin shells out to the `herdr` CLI.**

`herdr` also exposes a socket API (`herdr.dev/docs/socket-api`) supporting state subscriptions, but it is intentionally out of scope unless CLI polling proves insufficient.

All CLI invocations must remain non-interactive everywhere:
- Explicit subcommand and explicit target
- JSON output
- Bounded `execFile` timeout (`herdr` wait commands receive `timeout + 15s` process headroom)

## Codebase Layout

```text
src/plugin.ts                  entry: registers actions, seeds global settings
src/types.ts                   ActionSettings / HerdrProfile / HerdrAgent / Machine / Workspace / Tab
src/herdr/profiles.ts          profile -> argv builders (incl. POSIX quoting)
src/herdr/client.ts            execFile wrapper + herdr command calls (agent, workspace, tab, machine, pane)
src/herdr/agent-icons.ts       auto-generated official agent SVG icons (via scripts/fetch-agent-icons.mjs)
src/herdr/render.ts            dynamic key SVGs / state colors / icons with monogram fallback
src/herdr/deck-state.ts        shared 5x3 deck view controller (agents | machines | windows | tabs)
src/actions/base.ts            PollingAction base (per-key interval polling)
src/actions/fleet-status.ts    agent-state counts, urgency coloring
src/actions/agent-command.ts   tap = prompt/keys, hold 600ms = interrupt
src/actions/agent-focus.ts     one key per agent: kind icon, state color, press to focus
src/actions/spawn-agent.ts     pane split + agent start
src/actions/deck-slot.ts       dynamic top-row slot (0..9, auto-indexed from coordinates)
src/actions/deck-modes.ts      bottom-row mode switchers (List Agents / Machines / Windows / Tabs)
dev.hevangel.herdr.sdPlugin/   manifest.json, imgs/ (SVG), ui/ (Property Inspector), bin/ (built)
```

## 5×3 Dynamic Deck Architecture (`deck-state.ts`)

`DeckController` owns a single shared polling loop (default 5s) and view state for the 15-key layout:
- **Top 2 rows (10 keys):** `DeckSlot` (`dev.hevangel.herdr.deck-slot`) auto-maps key coordinates `row * 5 + col` to slot `0..9` (displaying top 10 items, no pagination).
- **Bottom row:** 1 Home key + 4 mode buttons (`mode-agents`, `mode-machines`, `mode-windows`, `mode-tabs`).
- **Navigation flow:**
  - **Agents (default):** aggregates live agents across **Local + all enabled machines** (top 10); state-colored background, downloaded agent SVG icon (monogram fallback), agent name or `workspace/tab#`; press focuses that agent's tab on its machine. The first empty slot displays **`+`**: tap opens an **Agent Picker** across the top 10 slots (selecting an icon creates a new tab in the focused workspace and starts that agent), while long-press (≥600ms) immediately starts the global `defaultAgentKind` (default `codex`) in a new tab.
  - **Machines:** `Local` + enabled `herdr machine list --json` entries; press selects that machine, switches to **Windows**, and focuses its 1st workspace → 1st tab.
  - **Windows:** `workspace list` on the selected machine; press focuses that workspace and its 1st tab.
  - **Tabs:** `tab list --workspace <focused>` on the selected machine; press focuses that tab.

## Multi-Target Architecture (Connection Profiles)

Connection profiles live in **Stream Deck global settings** (shared across all keys and edited in each Property Inspector as JSON). Each profile defines where the `herdr` CLI executes; `src/herdr/profiles.ts` translates a profile and subcommand into `argv`:

| kind | argv shape | notes |
|---|---|---|
| `local` | `herdr …` | Windows `herdr` is beta |
| `wsl` | `wsl [-d D] -- bash -lc '<herdr …>'` | `bash -l` so login `PATH` resolves `herdr` |
| `machine` | `herdr --machine <label> …` | `herdr`'s native SSH forwarding; label from `herdr machine list --json`; remote server must run and support machine API |
| `docker` | `docker exec -i <container> herdr …` | `argv` passed directly, no shell; `herdr` must be on the container `PATH` (use `herdrBin` override) |
| `ssh` | `ssh <host> '<herdr …>'` | Remote shell joins args — every arg is POSIX single-quote escaped (`shQuote`) |
| `ssh-docker` | `ssh <host> '<docker exec -i <c> herdr …>'` | Same POSIX single-quote escaping rule |
| `custom` | `<prefix argv> herdr …` | Prefix split on whitespace |

### Credentials & Security

- SSH credentials stay owned by OpenSSH; the plugin never handles or passes passwords.
