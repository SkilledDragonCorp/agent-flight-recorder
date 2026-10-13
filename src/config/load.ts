import { readFileSync } from "node:fs";
import { parse as parseYaml } from "yaml";
import { SdfrConfigSchema, type SdfrConfig } from "../policy/schema.ts";

const PLACEHOLDERS = /^(changeme|your-key-here|YOUR_.*|xxx+)$/i;

export function loadConfig(path: string): SdfrConfig {
  const raw = readFileSync(path, "utf8");
  const parsed = parseYaml(raw);
  const result = SdfrConfigSchema.safeParse(parsed);
  if (!result.success) {
    const msg = result.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    throw new Error(`Invalid sdfr config (${path}): ${msg}`);
  }
  // Fail fast on placeholder secrets in server env
  for (const s of result.data.servers) {
    for (const [k, v] of Object.entries(s.env)) {
      if (PLACEHOLDERS.test(v)) {
        throw new Error(
          `Placeholder value for env ${k} on server ${s.name}. Set a real value or remove it. See .env.example.`,
        );
      }
    }
  }
  return result.data;
}

/** Redact secret-looking strings in error messages (never print values). */
export function redactErrorMessage(msg: string): string {
  return msg
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, "[REDACTED]")
    .replace(/\bsk-[A-Za-z0-9]{20,}\b/g, "[REDACTED]")
    .replace(/\bghp_[A-Za-z0-9]{36}\b/g, "[REDACTED]");
}
