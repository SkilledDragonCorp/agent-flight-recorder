/**
 * Runtime adapter: bun:sqlite under Bun, node:sqlite under Node 24.
 * Same surface used by the ledger. Tested on both runtimes.
 */

export type SqlValue = null | number | string | Uint8Array | bigint;
export type SqlParams = SqlValue[] | Record<string, SqlValue>;

export interface Stmt {
  run(...params: SqlValue[]): { changes: number };
  get(...params: SqlValue[]): Record<string, unknown> | null;
  all(...params: SqlValue[]): Record<string, unknown>[];
}

export interface Db {
  exec(sql: string): void;
  prepare(sql: string): Stmt;
  close(): void;
}

type BunSqliteModule = {
  Database: new (
    path: string,
    opts?: { create?: boolean; readwrite?: boolean },
  ) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run: (...params: unknown[]) => { changes: number };
      get: (...params: unknown[]) => Record<string, unknown> | null | undefined;
      all: (...params: unknown[]) => Record<string, unknown>[];
    };
    close(): void;
  };
};

type NodeSqliteModule = {
  DatabaseSync: new (
    path: string,
  ) => {
    exec(sql: string): void;
    prepare(sql: string): {
      run: (...params: unknown[]) => { changes: number };
      get: (...params: unknown[]) => Record<string, unknown> | undefined;
      all: (...params: unknown[]) => Record<string, unknown>[];
    };
    close(): void;
  };
};

function isBun(): boolean {
  return typeof (globalThis as { Bun?: unknown }).Bun !== "undefined";
}

export async function openSqlite(path: string): Promise<Db> {
  if (isBun()) {
    const mod = (await import("bun:sqlite")) as unknown as BunSqliteModule;
    const raw = new mod.Database(path, { create: true, readwrite: true });
    return wrapBun(raw);
  }
  // node:sqlite (Node 22.5+ / 24): https://nodejs.org/api/sqlite.html
  const mod = (await import("node:sqlite")) as unknown as NodeSqliteModule;
  const raw = new mod.DatabaseSync(path);
  return wrapNode(raw);
}

function wrapBun(raw: InstanceType<BunSqliteModule["Database"]>): Db {
  return {
    exec(sql) {
      raw.exec(sql);
    },
    prepare(sql) {
      const s = raw.prepare(sql);
      return {
        run(...params) {
          const r = s.run(...params);
          return { changes: Number(r.changes ?? 0) };
        },
        get(...params) {
          return (s.get(...params) as Record<string, unknown> | null) ?? null;
        },
        all(...params) {
          return s.all(...params) as Record<string, unknown>[];
        },
      };
    },
    close() {
      raw.close();
    },
  };
}

function wrapNode(raw: InstanceType<NodeSqliteModule["DatabaseSync"]>): Db {
  return {
    exec(sql) {
      raw.exec(sql);
    },
    prepare(sql) {
      const s = raw.prepare(sql);
      return {
        run(...params) {
          const r = s.run(...params);
          return { changes: Number(r.changes ?? 0) };
        },
        get(...params) {
          return (s.get(...params) as Record<string, unknown> | undefined) ?? null;
        },
        all(...params) {
          return s.all(...params) as Record<string, unknown>[];
        },
      };
    },
    close() {
      raw.close();
    },
  };
}
