---
name: flight-recorder-incident
description: "Export and verify a signed sdfr incident packet for a time range. Use after a suspected agent incident; disable-model-invocation."
license: Apache-2.0
compatibility: Claude Code, Cursor
disable-model-invocation: true
---

# Incident packet

Human-operated skill (model invocation disabled).

## Export

```bash
bun run sdfr -- keygen --home .sdfr
bun run sdfr -- incident export --home .sdfr --from 2026-01-01T00:00:00.000Z --out incident-out
bun run sdfr -- incident verify incident-out
```

Packet contains `summary.md`, `events.jsonl`, blobs, `chain_proof.json`, `manifest.json` + `manifest.sig`.

Any modified file must fail `incident verify`.
---
