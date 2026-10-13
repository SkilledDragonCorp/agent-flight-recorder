/**
 * RFC 8785 JSON Canonicalization Scheme (JCS).
 * Tested against RFC examples in tests/unit/canonical.test.ts.
 * Spec: https://www.rfc-editor.org/rfc/rfc8785
 */

export function canonicalJson(value: unknown): string {
  return serialize(value);
}

function serialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return serializeNumber(value);
  if (typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((v) => serialize(v)).join(",")}]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort(compareUtf16);
    const parts: string[] = [];
    for (const k of keys) {
      const v = obj[k];
      if (v === undefined) continue;
      parts.push(`${JSON.stringify(k)}:${serialize(v)}`);
    }
    return `{${parts.join(",")}}`;
  }
  throw new TypeError(`unsupported type for canonical JSON: ${typeof value}`);
}

function serializeNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new TypeError("canonical JSON rejects NaN/Infinity");
  }
  // ES6 NumberToString / RFC 8785 §3.2.2.3
  if (Object.is(n, -0)) return "0";
  return JSON.stringify(n);
}

/** UTF-16 code unit order as required by RFC 8785. */
function compareUtf16(a: string, b: string): number {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}
