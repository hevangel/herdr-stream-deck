# herdr CLI Contract

Verified against installed `herdr` **0.9.4-preview** (protocol **22**).

> Run `herdr --skill` to see the full skill on how to use `herdr`.

## Errors

- Runtime errors return JSON `{"error":{"code","message"}}` (e.g. `server_not_running` when the `herdr` server is down).
- Usage errors exit with code `2`.
- `src/herdr/client.ts` surfaces both as `HerdrError` keyed by the error `code`.

## Agent Kinds

From `herdr agent` help:

```text
pi claude codex gemini cursor devin agy cline omp mastracode opencode copilot kimi kiro droid amp grok hermes kilo qodercli qwen letta maki muse
```

## Live-Verified JSON Schemas

### `herdr agent list`
- Envelope: `{"id":"cli:agent:list","result":{"agents":[…],"type":"agent_list"}}`
- Per-agent fields (`normalizeAgent` matches this):
  - `agent` — **agent kind** (e.g. `"claude"`, `"codex"`)
  - `name` — optional unique **agent name** (e.g. `"aao-codex-4634"`; absent when unnamed)
  - `agent_status` — state (`idle`, `working`, `blocked`, `done`, `unknown`)
  - `pane_id`, `tab_id`, `workspace_id` — opaque IDs
  - `cwd`, `focused`, `agent_session{…}`

### `herdr workspace list`
- Envelope: `{"id":"cli:workspace:list","result":{"type":"workspace_list","workspaces":[…]}}`
- Per-workspace fields: `workspace_id`, `label`, `number`, `focused`, `active_tab_id`, `agent_status`, `tab_count`, `pane_count`.
- Focus: `herdr workspace focus <workspace_id>`.

### `herdr tab list [--workspace <workspace_id>]`
- Envelope: `{"id":"cli:tab:list","result":{"type":"tab_list","tabs":[…]}}`
- Per-tab fields: `tab_id`, `workspace_id`, `label`, `number`, `focused`, `agent_status`, `pane_count`.
- Focus: `herdr tab focus <tab_id>`.

### `herdr machine list --json`
- Returns JSON array: `[{"id","label","target","session","enabled","selected"}, …]`.
- Target a remote machine via `herdr --machine <label> <subcommand>`.

## Naming & IDs

- Agent states: `idle`, `working`, `blocked`, `done`, `unknown`.
- Agent names match `[a-z][a-z0-9_-]{0,31}`.
- IDs are opaque (`w1`, `w1:t1`, `w1:p1`) and must be parsed from JSON responses only — never constructed manually.

## Useful Diagnostic Commands

- `herdr status` — prints client/server versions.
- `herdr machine list --json` — lists saved SSH machines (useful for Property Inspector profile examples).

## Safety Rules

- Never run bare `herdr` (launches the interactive TUI).
- Never run `herdr server stop` or kill the `herdr` process.
- Never close panes, tabs, or workspaces that the plugin/test did not create.
