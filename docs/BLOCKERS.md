# Blockers

## REA

- **Status (2026-10-13):** `rea-agents@6.4.0` installs and exposes `analyze_javascript_application` over stdio MCP. Keyless e2e `tests/e2e/rea-proxy.test.ts` exercises list + call through sdfr.
- If CI runners hit REA startup timeouts, mark the REA e2e with a longer timeout (already 180s) before declaring blocked.

## Claude plugin validate

- `claude plugin validate .claude/skills` may require Claude Code auth in CI. Gate remains `bun test tests/skills`. Evidence: no headless auth token in this org’s free CI.

## ABC article URL

- The Principles link slug may change; if the ABC URL 404s, update `docs/PRINCIPLES.md` with the canonical story URL when re-checked.
