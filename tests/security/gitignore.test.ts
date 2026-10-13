import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const required = [
  ".env",
  ".env.*",
  "!.env.example",
  "*.pem",
  "*.key",
  "*.p12",
  "*.pfx",
  "*.crt",
  "id_rsa*",
  "*service-account*.json",
  "credentials*.json",
  ".sdfr/keys/",
  "node_modules/",
  ".bun/",
  ".bun-cache/",
  "dist/",
  "build/",
  "out/",
  ".venv/",
  "venv/",
  "__pycache__/",
  "*.pyc",
  ".pytest_cache/",
  ".mypy_cache/",
  ".ruff_cache/",
  "target/",
  ".idea/",
  "*.swp",
  ".DS_Store",
  "Thumbs.db",
  "*.log",
  "logs/",
  "coverage/",
  ".nyc_output/",
  "lcov.info",
  "htmlcov/",
  ".coverage",
];

describe("gitignore", () => {
  test("contains required patterns", () => {
    const gi = readFileSync(join(import.meta.dir, "../../.gitignore"), "utf8");
    for (const p of required) {
      expect(gi.includes(p)).toBe(true);
    }
  });

  test("git check-ignore samples", async () => {
    const root = join(import.meta.dir, "../..");
    const ignored = [".env", ".env.local", "a.pem", "node_modules/x", "target/x", ".venv/x"];
    for (const path of ignored) {
      const proc = Bun.spawn(["git", "check-ignore", "-q", path], {
        cwd: root,
        stdout: "ignore",
        stderr: "ignore",
      });
      expect(await proc.exited).toBe(0);
    }
    // Negation: parse -v (older git returns 0 even when the last match is !pattern)
    const proc = Bun.spawn(["git", "check-ignore", "-v", ".env.example"], {
      cwd: root,
      stdout: "pipe",
      stderr: "ignore",
    });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    expect(out.includes("!.env.example") || out.trim() === "").toBe(true);
    // Confirmed trackable: appears as untracked, not ignored, in status porcelain
    const st = Bun.spawn(["git", "status", "--porcelain", "--ignored", ".env.example"], {
      cwd: root,
      stdout: "pipe",
      stderr: "ignore",
    });
    const status = await new Response(st.stdout).text();
    await st.exited;
    expect(status.startsWith("!!")).toBe(false);
  });
});
