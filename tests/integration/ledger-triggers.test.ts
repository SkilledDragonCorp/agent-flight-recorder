import { describe, expect, test } from "bun:test";
import { mkdtempSync, copyFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../src/ledger/db.ts";
import { openSqlite } from "../../src/runtime/sqlite.ts";

describe("append-only triggers", () => {
  test("rejects UPDATE/DELETE; tamper on copy caught by verify", async () => {
    const home = mkdtempSync(join(tmpdir(), "sdfr-trig-"));
    const ledger = await Ledger.open(home);
    ledger.append({
      session_id: "s",
      agent_label: "a",
      server: "notes",
      tool: "read_note",
      args: { id: "1" },
      result: { ok: true },
      decision: "allowed",
      latency_ms: 1,
    });
    ledger.append({
      session_id: "s",
      agent_label: "a",
      server: "notes",
      tool: "read_note",
      args: { id: "2" },
      result: { ok: true },
      decision: "allowed",
      latency_ms: 1,
    });

    let updateFailed = false;
    try {
      ledger["db"].exec("UPDATE events SET tool = 'x' WHERE seq = 1");
    } catch {
      updateFailed = true;
    }
    expect(updateFailed).toBe(true);

    let deleteFailed = false;
    try {
      ledger["db"].exec("DELETE FROM events WHERE seq = 1");
    } catch {
      deleteFailed = true;
    }
    expect(deleteFailed).toBe(true);
    ledger.close();

    // Tamper on a copy without triggers: recreate schema without triggers
    const copyHome = mkdtempSync(join(tmpdir(), "sdfr-tamper-"));
    const copyDb = join(copyHome, "ledger.sqlite");
    copyFileSync(join(home, "ledger.sqlite"), copyDb);
    const raw = await openSqlite(copyDb);
    raw.exec("DROP TRIGGER IF EXISTS events_no_update");
    raw.exec("UPDATE events SET tool = 'tampered' WHERE seq = 1");
    raw.close();

    const tampered = await Ledger.open(copyHome);
    const v = tampered.verify();
    expect(v.ok).toBe(false);
    expect(v.brokenAt).toBe(1);
    tampered.close();

    rmSync(home, { recursive: true, force: true });
    rmSync(copyHome, { recursive: true, force: true });
  });
});
