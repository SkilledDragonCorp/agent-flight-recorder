import { describe, expect, test } from "bun:test";
import { runScenario } from "../../examples/scenario-false-report.ts";

describe("e2e scenario-false-report", () => {
  test(
    "exact counts, sandbox only allowed, brake < 1s, chain ok",
    async () => {
      const r = await runScenario({ includeRea: false });
      expect(r.allowed).toBe(7);
      expect(r.approved).toBe(2);
      expect(r.denied).toBe(3);
      expect(r.blocked).toBe(1);
      expect(r.sandboxReceived).toBe(2);
      expect(r.chainOk).toBe(true);
      expect(r.brakeMs).toBeLessThan(1000);
    },
    120_000,
  );
});
