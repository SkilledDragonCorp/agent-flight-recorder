import { describe, expect, test } from "bun:test";
import { canonicalJson } from "../../src/ledger/canonical.ts";

// RFC 8785 examples (https://www.rfc-editor.org/rfc/rfc8785#name-test-vectors)
describe("canonicalJson RFC 8785", () => {
  test("object key order", () => {
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("nested", () => {
    expect(canonicalJson({ z: { y: 1, x: 2 }, a: [3, 1] })).toBe(
      '{"a":[3,1],"z":{"x":2,"y":1}}',
    );
  });

  test("primitives", () => {
    expect(canonicalJson(null)).toBe("null");
    expect(canonicalJson(true)).toBe("true");
    expect(canonicalJson(false)).toBe("false");
    expect(canonicalJson("hi")).toBe('"hi"');
    expect(canonicalJson(0)).toBe("0");
    expect(canonicalJson(-0)).toBe("0");
  });

  test("rejects non-finite numbers", () => {
    expect(() => canonicalJson(Number.NaN)).toThrow();
    expect(() => canonicalJson(Number.POSITIVE_INFINITY)).toThrow();
  });

  test("unicode keys sort by code units", () => {
    expect(canonicalJson({ "\u20ac": 1, a: 2 })).toBe('{"a":2,"€":1}');
  });
});
