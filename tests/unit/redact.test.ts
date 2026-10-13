import { describe, expect, test } from "bun:test";
import { redactValue } from "../../src/ledger/redact.ts";

describe("redact", () => {
  test("redacts api keys and emails", () => {
    const input = {
      email: "user@example.com",
      key: "sk-abcdefghijklmnopqrstuvwxyz0123456789",
      note: "ok",
    };
    const { value } = redactValue(input);
    const s = JSON.stringify(value);
    expect(s).not.toContain("user@example.com");
    expect(s).not.toContain("sk-abcdefghijklmnopqrstuvwxyz0123456789");
    expect(s).toContain("[REDACTED:");
    expect(s).toContain("ok");
  });
});
