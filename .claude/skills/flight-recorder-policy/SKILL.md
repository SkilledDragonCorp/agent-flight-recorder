---
name: flight-recorder-policy
description: "Write and test an sdfr YAML policy rule with a failing test first. Use when adding allow/deny/approve rules for MCP tools."
license: Apache-2.0
compatibility: Claude Code, Cursor
---

# Policy rule TDD

1. Add a failing case in `tests/unit/policy.test.ts` describing the intended decision.
2. Run `bun test tests/unit/policy.test.ts` and confirm it fails.
3. Add a rule to `examples/policies/default.yaml` / `examples/sdfr.yaml`:
   - `id`, `server`, `tool` (glob), optional `when` (`path`/`op`/`value`), `decision`: allow|deny|approve
4. Re-run the unit test until green, then `bun test tests/e2e/scenario.test.ts`.
5. Remember: default profile denies side-effect verbs (`submit`, `send`, `post`, …) unless allowlisted.
---
