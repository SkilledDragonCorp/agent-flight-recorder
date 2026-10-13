# Agent Flight Recorder (sdfr)

## Commands

- Install: `bun install --frozen-lockfile`
- Test: `bun test`
- Typecheck: `bun run typecheck`
- Lint: `bun run lint`
- CLI (dev): `bun run sdfr -- <command>`
- Build: `bun run build`
- Scenario: `bun run scenario`

## Conventions

- Bun 1.4.2 / Node 24. Skills live only under `.claude/skills/` (no `.cursor/skills` or `.agents/skills` mirrors).
- Contact: hello@skilleddragon.com
- Org: SkilledDragonCorp

## Skills

| Skill | Purpose |
| --- | --- |
| `flight-recorder-wrap` | Add an MCP server behind sdfr in yaml + client config |
| `flight-recorder-incident` | Export/verify signed incident packet (human-only) |
| `flight-recorder-policy` | TDD a YAML policy rule |
