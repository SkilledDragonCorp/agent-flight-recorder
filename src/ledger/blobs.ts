import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const THRESHOLD = 8_192;

export function maybeStoreBlob(
  blobRoot: string,
  payload: unknown,
): { summary: string; blobHash: string | null } {
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload ?? null);
  if (text.length <= THRESHOLD) {
    return { summary: text.slice(0, 2_000), blobHash: null };
  }
  mkdirSync(blobRoot, { recursive: true });
  const hash = createHash("sha256").update(text).digest("hex");
  const path = join(blobRoot, `${hash}.bin`);
  if (!existsSync(path)) {
    writeFileSync(path, text, "utf8");
  }
  return {
    summary: `blob:${hash} size=${text.length}`,
    blobHash: hash,
  };
}

export function readBlob(blobRoot: string, hash: string): string {
  return readFileSync(join(blobRoot, `${hash}.bin`), "utf8");
}
