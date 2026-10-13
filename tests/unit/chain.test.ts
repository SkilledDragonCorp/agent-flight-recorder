import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../src/ledger/db.ts";
import { GENESIS_PREV, eventHash } from "../../src/ledger/chain.ts";

describe("hash chain", () => {
  test("append and verify", async () => {
    const home = mkdtempSync(join(tmpdir(), "sdfr-chain-"));
    const ledger = await Ledger.open(home);
    expect(ledger.lastHash()).toBe(GENESIS_PREV);
    const e1 = ledger.append({
      session_id: "s",
      agent_label: "a",
      server: "notes",
      tool: "read_note",
      args: { id: "1" },
      result: { ok: true },
      decision: "allowed",
      latency_ms: 1,
    });
    expect(e1.prev_hash).toBe(GENESIS_PREV);
    expect(e1.hash).toBe(
      eventHash({
        seq: e1.seq,
        ts: e1.ts,
        session_id: e1.session_id,
        agent_label: e1.agent_label,
        server: e1.server,
        tool: e1.tool,
        args_json: e1.args_json,
        result_summary: e1.result_summary,
        result_hash: e1.result_hash,
        decision: e1.decision,
        policy_rule_id: e1.policy_rule_id,
        latency_ms: e1.latency_ms,
        prev_hash: e1.prev_hash,
      }),
    );
    ledger.append({
      session_id: "s",
      agent_label: "a",
      server: "notes",
      tool: "read_note",
      args: { id: "2" },
      result: { ok: true },
      decision: "allowed",
      latency_ms: 2,
    });
    expect(ledger.verify().ok).toBe(true);
    ledger.close();
    rmSync(home, { recursive: true, force: true });
  });
});
