import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { verifyBytes } from "./sign.ts";
import { sha256Hex } from "../ledger/chain.ts";

export function verifyIncident(dir: string): {
  ok: boolean;
  errors: string[];
} {
  const errors: string[] = [];
  const manifestPath = join(dir, "manifest.json");
  const sigPath = join(dir, "manifest.sig");
  const pubPath = join(dir, "ed25519.pub.pem");
  if (!existsSync(manifestPath) || !existsSync(sigPath) || !existsSync(pubPath)) {
    return { ok: false, errors: ["missing manifest.json, manifest.sig, or ed25519.pub.pem"] };
  }
  const body = readFileSync(manifestPath);
  const sig = readFileSync(sigPath);
  const pub = readFileSync(pubPath, "utf8");
  if (!verifyBytes(pub, body, sig)) {
    errors.push("manifest signature invalid");
  }
  const manifest = JSON.parse(body.toString("utf8")) as {
    files: Record<string, string>;
  };
  for (const [rel, expected] of Object.entries(manifest.files)) {
    const p = join(dir, rel);
    if (!existsSync(p)) {
      errors.push(`missing file ${rel}`);
      continue;
    }
    const actual = sha256Hex(readFileSync(p));
    if (actual !== expected) {
      errors.push(`hash mismatch for ${rel}`);
    }
  }
  return { ok: errors.length === 0, errors };
}
