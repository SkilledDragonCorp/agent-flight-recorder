import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openSqlite } from "../../src/runtime/sqlite.ts";

describe("sqlite runtime adapter", () => {
  test("open prepare insert select under current runtime", async () => {
    const dir = mkdtempSync(join(tmpdir(), "sdfr-sqlite-"));
    const db = await openSqlite(join(dir, "t.sqlite"));
    db.exec("CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)");
    db.prepare("INSERT INTO t(v) VALUES (?)").run("hello");
    const row = db.prepare("SELECT v FROM t WHERE id = 1").get();
    expect(row?.v).toBe("hello");
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });
});
