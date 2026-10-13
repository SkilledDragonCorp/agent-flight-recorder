import { describe, expect, test } from "bun:test";
import { ApprovalBroker } from "../../src/policy/approvals.ts";

describe("approvals", () => {
  test("times out to deny", async () => {
    process.env.SDFR_APPROVAL_TIMEOUT_SEC = "0";
    const broker = new ApprovalBroker(0);
    const p = broker.request("notes", "write_note", { id: "1" });
    // allow microtask + timer
    await Bun.sleep(30);
    const status = await p;
    expect(status).toBe("timed_out");
    delete process.env.SDFR_APPROVAL_TIMEOUT_SEC;
  });

  test("decide approve", async () => {
    const broker = new ApprovalBroker(30);
    const p = broker.request("notes", "write_note", { id: "1" });
    await Bun.sleep(5);
    const pending = broker.listPending();
    expect(pending.length).toBe(1);
    expect(broker.decide(pending[0]!.id, "approved")).toBe(true);
    expect(await p).toBe("approved");
  });
});
