# Policy

Rules in `sdfr.yaml` / `examples/policies/*.yaml`:

| Field | Meaning |
| --- | --- |
| `id` | Stable rule id written to the ledger |
| `server` / `tool` | Glob (`*` allowed) |
| `when` | Optional predicate on args (`path`, `op`: eq/neq/in/notIn/matches, `value`) |
| `decision` | `allow` \| `deny` \| `approve` |

Default profile denies tools whose names contain side-effect verbs (`submit`, `send`, `post`, `create_account`, `delete`, `transfer`, `purchase`, `publish`) unless a prior rule allows them.

`eval-mode` denies all network egress (no web-actions allows).
