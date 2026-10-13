# Security Policy

**Built by [SkilledDragon LLC](https://skilleddragon.com)**

This is a **SkilledDragon educational minilab**, not a production product. We do **not** maintain these repos on a regular schedule and we do **not** operate a vulnerability response program for them.

## Contact

General questions: **hello@skilleddragon.com**  
Do not use a dedicated security mailbox for this repo — none exists.

## Supported versions

Only the latest commit on `main` is considered current for this educational lab.

## Threat model (summary)

sdfr sits between an agent and MCP servers. Threats include: tampering with the ledger, bypassing policy, exfiltrating secrets via tool args, and unauthorized network side effects. Mitigations in this MVP: append-only SQLite triggers, hash chaining, deny-by-default YAML policy, emergency brake, redaction before ledger write, localhost-only web UI with one-time token, Ed25519 incident signatures.

See `docs/THREAT_MODEL.md` for detail.

## Secrets handling

- Never commit `.env`, keys under `.sdfr/keys/`, or credentials.
- Config validation rejects placeholder values (`changeme`, `YOUR_*`).
- Errors are redacted before printing.
- CI runs gitleaks + `bun audit`.

## Scanners in CI

- gitleaks (full history / working tree)
- `bun audit`
- skills layout tests
- fixtures/docs secret-pattern scan

## Accepted risks

| Risk | Notes | Expiry |
| --- | --- | --- |
| Web UI token in query string | Convenient for local demos; treat as secret | 2027-04-01 |
| REA is a large dependency | Pinned; used only for optional JS analysis e2e | 2027-04-01 |

## If you find an issue

Prefer reporting upstream when the issue is in REA, the MCP SDK, or other dependencies. For this minilab’s code, email hello@skilleddragon.com. There is **no SLA**.
