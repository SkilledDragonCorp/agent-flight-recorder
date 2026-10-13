import { describe, expect, test } from "bun:test";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../src/config/load.ts";
import { parseNamespaced } from "../../src/proxy/aggregate.ts";

describe("input validation boundaries", () => {
  test("rejects path-traversal-looking server names via schema", () => {
    const dir = mkdtempSync(join(tmpdir(), "sdfr-iv-"));
    const path = join(dir, "bad.yaml");
    writeFileSync(
      path,
      `
agent_label: x
policy:
  version: 1
  rules: []
servers:
  - name: "../evil"
    command: bun
    args: ["run", "x.ts"]
`,
    );
    expect(() => loadConfig(path)).toThrow(/Invalid sdfr config/);
    rmSync(dir, { recursive: true, force: true });
  });

  test("rejects placeholder env secrets", () => {
    const dir = mkdtempSync(join(tmpdir(), "sdfr-iv-"));
    const path = join(dir, "bad.yaml");
    writeFileSync(
      path,
      `
agent_label: x
policy:
  version: 1
  rules: []
servers:
  - name: notes
    command: bun
    args: ["run", "x.ts"]
    env:
      API_KEY: changeme
`,
    );
    expect(() => loadConfig(path)).toThrow(/Placeholder value/);
    rmSync(dir, { recursive: true, force: true });
  });

  test("parseNamespaced rejects missing separator", () => {
    expect(parseNamespaced("nosep")).toBeNull();
    expect(parseNamespaced("__tool")).toBeNull();
    expect(parseNamespaced("server__tool")).toEqual({
      server: "server",
      tool: "tool",
    });
  });
});
