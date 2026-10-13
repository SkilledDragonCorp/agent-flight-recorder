import { createHash, createHmac, randomBytes } from "node:crypto";

const DEFAULT_PATTERNS: RegExp[] = [
  /\bAIza[0-9A-Za-z_-]{35}\b/g,
  /\bsk-ant-[A-Za-z0-9_-]{20,}\b/g,
  /\bsk-[A-Za-z0-9]{20,}\b/g,
  /\bghp_[A-Za-z0-9]{36}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{20,}\b/g,
  /\bxox[bp]-[A-Za-z0-9-]{10,}\b/g,
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi,
  /\bBearer\s+[A-Za-z0-9._\-+/=]+\b/gi,
  /\b(?:api[_-]?key|token|secret|password)\s*[:=]\s*["']?([^\s"']+)["']?/gi,
];

export interface RedactionResult {
  value: unknown;
  salt: string;
  hashes: Record<string, string>;
}

export function redactValue(
  input: unknown,
  extraPatterns: string[] = [],
  salt = randomBytes(16).toString("hex"),
): RedactionResult {
  const hashes: Record<string, string> = {};
  const patterns = [
    ...DEFAULT_PATTERNS,
    ...extraPatterns.map((p) => new RegExp(p, "gi")),
  ];

  const walk = (v: unknown): unknown => {
    if (typeof v === "string") {
      let out = v;
      for (const re of patterns) {
        out = out.replace(re, (match) => {
          const h = createHmac("sha256", salt).update(match).digest("hex").slice(0, 16);
          hashes[h] = createHash("sha256").update(salt + match).digest("hex");
          return `[REDACTED:${h}]`;
        });
      }
      return out;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") {
      const o: Record<string, unknown> = {};
      for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
        o[k] = walk(val);
      }
      return o;
    }
    return v;
  };

  return { value: walk(input), salt, hashes };
}
