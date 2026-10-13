import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { openSqlite, type Db } from "../runtime/sqlite.ts";
import { GENESIS_PREV, eventHash, sha256Hex, type ChainableEvent } from "./chain.ts";
import { redactValue } from "./redact.ts";
import { maybeStoreBlob } from "./blobs.ts";

export type Decision =
  | "allowed"
  | "denied"
  | "approved"
  | "blocked_by_brake";

export interface LedgerEvent {
  seq: number;
  ts: string;
  session_id: string;
  agent_label: string;
  server: string;
  tool: string;
  args_json: string;
  result_summary: string;
  result_hash: string;
  decision: Decision;
  policy_rule_id: string | null;
  latency_ms: number;
  prev_hash: string;
  hash: string;
  blob_hash: string | null;
}

export interface AppendInput {
  session_id: string;
  agent_label: string;
  server: string;
  tool: string;
  args: unknown;
  result: unknown;
  decision: Decision;
  policy_rule_id?: string | null;
  latency_ms: number;
  redactPatterns?: string[];
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT NOT NULL,
  session_id TEXT NOT NULL,
  agent_label TEXT NOT NULL,
  server TEXT NOT NULL,
  tool TEXT NOT NULL,
  args_json TEXT NOT NULL,
  result_summary TEXT NOT NULL,
  result_hash TEXT NOT NULL,
  decision TEXT NOT NULL,
  policy_rule_id TEXT,
  latency_ms INTEGER NOT NULL,
  prev_hash TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  blob_hash TEXT
);

CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TRIGGER IF NOT EXISTS events_no_update
BEFORE UPDATE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;

CREATE TRIGGER IF NOT EXISTS events_no_delete
BEFORE DELETE ON events
BEGIN
  SELECT RAISE(ABORT, 'events are append-only');
END;
`;

export class Ledger {
  readonly dbPath: string;
  readonly blobRoot: string;
  private db!: Db;

  private constructor(home: string) {
    this.dbPath = join(home, "ledger.sqlite");
    this.blobRoot = join(home, "blobs");
  }

  static async open(home: string): Promise<Ledger> {
    mkdirSync(home, { recursive: true });
    mkdirSync(join(home, "blobs"), { recursive: true });
    const ledger = new Ledger(home);
    ledger.db = await openSqlite(ledger.dbPath);
    ledger.db.exec(SCHEMA);
    return ledger;
  }

  close(): void {
    this.db.close();
  }

  getMeta(key: string): string | null {
    const row = this.db.prepare("SELECT value FROM meta WHERE key = ?").get(key);
    return row ? String(row.value) : null;
  }

  setMeta(key: string, value: string): void {
    this.db
      .prepare(
        "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      )
      .run(key, value);
  }

  lastHash(): string {
    const row = this.db
      .prepare("SELECT hash FROM events ORDER BY seq DESC LIMIT 1")
      .get();
    return row ? String(row.hash) : GENESIS_PREV;
  }

  append(input: AppendInput): LedgerEvent {
    const redacted = redactValue(input.args, input.redactPatterns);
    const args_json = JSON.stringify(redacted.value);
    const { summary, blobHash } = maybeStoreBlob(this.blobRoot, input.result);
    const result_hash = sha256Hex(
      typeof input.result === "string"
        ? input.result
        : JSON.stringify(input.result ?? null),
    );
    const prev_hash = this.lastHash();
    const ts = new Date().toISOString();
    const seqRow = this.db
      .prepare("SELECT COALESCE(MAX(seq), 0) + 1 AS next FROM events")
      .get();
    const seq = Number(seqRow?.next ?? 1);
    const chainable: ChainableEvent = {
      seq,
      ts,
      session_id: input.session_id,
      agent_label: input.agent_label,
      server: input.server,
      tool: input.tool,
      args_json,
      result_summary: summary,
      result_hash,
      decision: input.decision,
      policy_rule_id: input.policy_rule_id ?? null,
      latency_ms: input.latency_ms,
      prev_hash,
    };
    const hash = eventHash(chainable);
    this.db
      .prepare(
        `INSERT INTO events(
          seq, ts, session_id, agent_label, server, tool, args_json,
          result_summary, result_hash, decision, policy_rule_id, latency_ms,
          prev_hash, hash, blob_hash
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      )
      .run(
        seq,
        ts,
        input.session_id,
        input.agent_label,
        input.server,
        input.tool,
        args_json,
        summary,
        result_hash,
        input.decision,
        input.policy_rule_id ?? null,
        input.latency_ms,
        prev_hash,
        hash,
        blobHash,
      );
    return { ...chainable, hash, blob_hash: blobHash, decision: input.decision };
  }

  list(opts?: {
    session_id?: string;
    from?: string;
    to?: string;
    limit?: number;
  }): LedgerEvent[] {
    let sql = "SELECT * FROM events WHERE 1=1";
    const params: (string | number)[] = [];
    if (opts?.session_id) {
      sql += " AND session_id = ?";
      params.push(opts.session_id);
    }
    if (opts?.from) {
      sql += " AND ts >= ?";
      params.push(opts.from);
    }
    if (opts?.to) {
      sql += " AND ts <= ?";
      params.push(opts.to);
    }
    sql += " ORDER BY seq ASC";
    if (opts?.limit) {
      sql += " LIMIT ?";
      params.push(opts.limit);
    }
    return this.db.prepare(sql).all(...params) as unknown as LedgerEvent[];
  }

  verify(): { ok: boolean; brokenAt: number | null; message: string } {
    const events = this.list();
    let prev = GENESIS_PREV;
    for (const e of events) {
      if (e.prev_hash !== prev) {
        return {
          ok: false,
          brokenAt: e.seq,
          message: `prev_hash mismatch at seq ${e.seq}`,
        };
      }
      const expected = eventHash({
        seq: e.seq,
        ts: e.ts,
        session_id: e.session_id,
        agent_label: e.agent_label,
        server: e.server,
        tool: e.tool,
        args_json: e.args_json,
        result_summary: e.result_summary,
        result_hash: e.result_hash,
        decision: e.decision,
        policy_rule_id: e.policy_rule_id,
        latency_ms: e.latency_ms,
        prev_hash: e.prev_hash,
      });
      if (expected !== e.hash) {
        return {
          ok: false,
          brokenAt: e.seq,
          message: `hash mismatch at seq ${e.seq}`,
        };
      }
      prev = e.hash;
    }
    return { ok: true, brokenAt: null, message: `ok: ${events.length} events` };
  }
}

export function resolveHome(explicit?: string): string {
  return explicit ?? process.env.SDFR_HOME ?? join(process.cwd(), ".sdfr");
}

export function ensureParent(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}
