import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Ledger } from "../../src/ledger/db.ts";
import { Brake } from "../../src/brake.ts";
import { ApprovalBroker } from "../../src/policy/approvals.ts";
import { startWeb } from "../../src/web/app.ts";

describe("web UI", () => {
  test("requires token and binds 127.0.0.1", async () => {
    const home = mkdtempSync(join(tmpdir(), "sdfr-web-"));
    const ledger = await Ledger.open(home);
    const brake = new Brake(home, ledger);
    const approvals = new ApprovalBroker(30);
    const web = await startWeb({
      host: "127.0.0.1",
      port: 0,
      ledger,
      brake,
      approvals,
      agentLabel: "test",
      sessionId: "s",
    });
    expect(web.url.startsWith("http://127.0.0.1:")).toBe(true);

    const denied = await fetch(web.url.split("?")[0] + "/api/status");
    expect(denied.status).toBe(401);

    const ok = await fetch(web.url.replace("/?", "/api/status?"), {
      headers: { Authorization: `Bearer ${web.token}` },
    });
    // url is http://127.0.0.1:PORT/?token=...
    const statusUrl = new URL(web.url);
    statusUrl.pathname = "/api/status";
    const ok2 = await fetch(statusUrl.toString(), {
      headers: { Authorization: `Bearer ${web.token}` },
    });
    expect(ok2.status).toBe(200);
    const body = (await ok2.json()) as { brake: boolean };
    expect(body.brake).toBe(false);

    web.stop();
    ledger.close();
    rmSync(home, { recursive: true, force: true });
    void ok;
  });
});
