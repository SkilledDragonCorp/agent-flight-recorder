import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";

const ROOT = join(import.meta.dir, "../..");
const SKILLS = [
  "flight-recorder-wrap",
  "flight-recorder-incident",
  "flight-recorder-policy",
];
const PORTABLE = new Set([
  "name",
  "description",
  "license",
  "compatibility",
  "metadata",
  "allowed-tools",
  "disable-model-invocation",
  "paths",
]);

function frontmatter(text: string): { fm: Record<string, unknown>; lines: number } {
  expect(text.startsWith("---\n")).toBe(true);
  const end = text.indexOf("\n---\n", 4);
  expect(end).toBeGreaterThan(0);
  const yaml = text.slice(4, end);
  const fm = parseYaml(yaml) as Record<string, unknown>;
  return { fm, lines: text.split("\n").length };
}

describe("skills layout", () => {
  test("canonical skills only under .claude/skills", () => {
    expect(existsSync(join(ROOT, ".claude/skills"))).toBe(true);
    expect(existsSync(join(ROOT, ".cursor/skills"))).toBe(false);
    expect(existsSync(join(ROOT, ".agents/skills"))).toBe(false);
    for (const name of SKILLS) {
      expect(existsSync(join(ROOT, ".claude/skills", name, "SKILL.md"))).toBe(
        true,
      );
    }
  });

  test("frontmatter portable and valid", () => {
    for (const name of SKILLS) {
      const text = readFileSync(
        join(ROOT, ".claude/skills", name, "SKILL.md"),
        "utf8",
      );
      const { fm, lines } = frontmatter(text);
      expect(lines).toBeLessThanOrEqual(500);
      expect(fm.name).toBe(name);
      expect(String(fm.name)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      expect(String(fm.name).length).toBeLessThanOrEqual(64);
      expect(String(fm.description).length).toBeGreaterThan(0);
      expect(String(fm.description).length).toBeLessThanOrEqual(1024);
      for (const k of Object.keys(fm)) {
        expect(PORTABLE.has(k)).toBe(true);
      }
    }
  });

  test("AGENTS.md lists skills; CLAUDE.md is @AGENTS.md", () => {
    const agents = readFileSync(join(ROOT, "AGENTS.md"), "utf8");
    for (const name of SKILLS) expect(agents).toContain(name);
    expect(readFileSync(join(ROOT, "CLAUDE.md"), "utf8").trim()).toBe(
      "@AGENTS.md",
    );
  });

  test("bun run scripts referenced in skills exist", () => {
    const pkg = JSON.parse(
      readFileSync(join(ROOT, "package.json"), "utf8"),
    ) as { scripts: Record<string, string> };
    for (const name of SKILLS) {
      const text = readFileSync(
        join(ROOT, ".claude/skills", name, "SKILL.md"),
        "utf8",
      );
      for (const m of text.matchAll(/bun run ([a-zA-Z0-9:_-]+)/g)) {
        const script = m[1]!;
        // allow `bun run sdfr -- ...` and `bun run src/...` and `bun test ...`
        if (script === "sdfr" || script === "src" || script.startsWith("tests"))
          continue;
        if (script.includes("/") || script.includes(".")) continue;
        expect(pkg.scripts[script]).toBeTruthy();
      }
    }
  });

  test("cursor rules have frontmatter", () => {
    const rulesDir = join(ROOT, ".cursor/rules");
    for (const f of readdirSync(rulesDir)) {
      if (!f.endsWith(".mdc")) continue;
      const text = readFileSync(join(rulesDir, f), "utf8");
      expect(text.startsWith("---\n")).toBe(true);
      const end = text.indexOf("\n---\n", 4);
      const fm = parseYaml(text.slice(4, end)) as {
        description?: string;
        alwaysApply?: boolean;
      };
      expect(typeof fm.description).toBe("string");
      expect(typeof fm.alwaysApply).toBe("boolean");
    }
  });

  test("no duplicate skill names across trees", () => {
    const names = new Set<string>();
    for (const tree of [".claude/skills", ".cursor/skills", ".agents/skills"]) {
      const dir = join(ROOT, tree);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (!statSync(join(dir, name)).isDirectory()) continue;
        expect(names.has(name)).toBe(false);
        names.add(name);
      }
    }
  });
});
