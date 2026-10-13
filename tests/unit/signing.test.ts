import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { keygen, signBytes, verifyBytes } from "../../src/incident/sign.ts";
import { Ledger } from "../../src/ledger/db.ts";
import { exportIncident } from "../../src/incident/export.ts";
import { verifyIncident } from "../../src/incident/verify.ts";

describe("incident signing", () => {
  test("sign and verify packet; fail on modify", async () => {
    const home = mkdtempSync(join(tmpdir(), "sdfr-sign-"));
    keygen(home);
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
    const out = join(home, "packet");
    exportIncident(ledger, home, { outDir: out });
    expect(verifyIncident(out).ok).toBe(true);

    // tamper
    writeFileSync(join(out, "summary.md"), "tampered\n");
    expect(verifyIncident(out).ok).toBe(false);

    const data = "hello";
    const sig = signBytes(home, data);
    const pub = readFileSync(join(home, "keys", "ed25519.pub.pem"), "utf8");
    expect(verifyBytes(pub, data, sig)).toBe(true);
    expect(verifyBytes(pub, "nope", sig)).toBe(false);

    ledger.close();
    rmSync(home, { recursive: true, force: true });
  });
});
