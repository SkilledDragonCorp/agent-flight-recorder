---
name: flight-recorder-wrap
description: "Wrap an MCP server behind sdfr in sdfr.yaml and Cursor/Claude Code/Codex config. Use when adding a downstream MCP server to Agent Flight Recorder."
license: Apache-2.0
compatibility: Claude Code, Cursor
---

# Wrap an MCP server behind sdfr

## Steps

1. Add a server entry under `servers:` in `examples/sdfr.yaml` (or your config):
   - `name`: lowercase hyphenated id (becomes the tool namespace prefix)
   - `command` / `args`: stdio launch (for REA: `node` + `node_modules/rea-agents/scripts/rea.mjs` + `mcp`)
2. Add policy rules under `policy.rules` — deny-by-default; explicitly `allow` or `approve` tools.
3. Run: `bun run sdfr -- run --config examples/sdfr.yaml`
4. Point the agent at sdfr instead of the downstream server:

**Cursor** (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "sdfr": {
      "command": "bun",
      "args": ["run", "src/cli.ts", "run", "--config", "examples/sdfr.yaml"]
    }
  }
}
```

**Claude Code**: `claude mcp add sdfr -- bun run src/cli.ts run --config examples/sdfr.yaml`

**Codex** (`~/.codex/config.toml`):

```toml
[mcp_servers.sdfr]
command = "bun"
args = ["run", "src/cli.ts", "run", "--config", "examples/sdfr.yaml"]
```

5. Confirm tools appear as `<server>__<tool>` with descriptions prefixed `[recorded by sdfr]`.
6. Verify: `bun run sdfr -- verify --home .sdfr`
---
