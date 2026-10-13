# Threat model (MVP)

| Asset | Threat | Control |
| --- | --- | --- |
| Ledger integrity | Silent rewrite | Append-only triggers + hash chain |
| Secrets in args | Persistence in DB | Redaction + salted hashes |
| External side effects | Agent posts to public net | Policy deny + sandbox proof in tests |
| Operator panic | Runaway session | Brake lockfile + MCP error |
| Incident denial | Altered export | Ed25519 manifest signature |
| Web UI | Remote bind / CSRF | 127.0.0.1 + bearer token |
