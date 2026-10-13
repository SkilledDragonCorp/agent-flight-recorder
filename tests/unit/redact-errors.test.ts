import { describe, expect, test } from "bun:test";
import { redactErrorMessage } from "../../src/config/load.ts";

describe("error redaction", () => {
  test("never echoes secret-looking substrings", () => {
    const msg = redactErrorMessage(
      "failed key=sk-abcdefghijklmnopqrstuvwxyz0123 and AIzaSyA-abcdefghijklmnopqrstuvwxyz0123456",
    );
    expect(msg).not.toContain("sk-abcdefghijklmnopqrstuvwxyz0123");
    expect(msg).toContain("[REDACTED]");
  });
});
