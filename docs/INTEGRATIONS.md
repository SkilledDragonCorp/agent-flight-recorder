# Integrations

REA manual MCP registration (upstream docs):  
https://github.com/morluto/rea/blob/main/docs/installation.md

```json
{
  "mcpServers": {
    "rea": {
      "command": "npx",
      "args": ["-y", "rea-agents@6.4.0", "mcp"]
    }
  }
}
```

Behind sdfr, register **sdfr** instead and list REA under `servers:` in `sdfr.yaml`.

| Client | Config | Status |
| --- | --- | --- |
| Cursor | `.cursor/mcp.json` | Snippet verified against docs 2026-10-13 |
| Claude Code | `claude mcp add` | Snippet from docs; live UI registration untested in CI |
| Codex | `~/.codex/config.toml` `[mcp_servers.sdfr]` | Snippet from docs; live UI registration untested in CI |
