import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const SECRET_RE =
  /AIza[0-9A-Za-z_-]{35}|sk-ant-|sk-[A-Za-z0-9]{20,}|ghp_[A-Za-z0-9]{36}|github_pat_|xox[bp]-|-----BEGIN .*PRIVATE KEY-----/;

function walk(dir: string, files: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, files);
    else files.push(p);
  }
  return files;
}

describe("fixtures/docs secret scan", () => {
  test("no real-looking secrets", () => {
    const roots = [
      join(import.meta.dir, "../fixtures"),
      join(import.meta.dir, "../../docs"),
    ];
    const hits: string[] = [];
    for (const root of roots) {
      for (const f of walk(root)) {
        if (f.endsWith(".png") || f.endsWith(".jpg")) continue;
        const text = readFileSync(f, "utf8");
        if (SECRET_RE.test(text)) hits.push(f);
      }
    }
    expect(hits).toEqual([]);
  });
});
