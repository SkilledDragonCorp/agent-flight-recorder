import { existsSync, mkdirSync, writeFileSync, unlinkSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Ledger } from "./ledger/db.ts";

export class Brake {
  private locked = false;
  private readonly lockPath: string;

  constructor(
    private readonly home: string,
    private readonly ledger: Ledger,
  ) {
    this.lockPath = join(home, "BRAKE.lock");
    mkdirSync(home, { recursive: true });
    this.locked = existsSync(this.lockPath) || ledger.getMeta("brake") === "1";
  }

  isActive(): boolean {
    return this.locked || existsSync(this.lockPath);
  }

  engage(session_id: string, agent_label: string): void {
    this.locked = true;
    writeFileSync(
      this.lockPath,
      JSON.stringify({ engagedAt: new Date().toISOString() }, null, 2),
    );
    this.ledger.setMeta("brake", "1");
    this.ledger.append({
      session_id,
      agent_label,
      server: "sdfr",
      tool: "brake",
      args: {},
      result: { engaged: true },
      decision: "allowed",
      policy_rule_id: "brake",
      latency_ms: 0,
    });
  }

  release(session_id: string, agent_label: string, reason: string): void {
    this.locked = false;
    if (existsSync(this.lockPath)) unlinkSync(this.lockPath);
    this.ledger.setMeta("brake", "0");
    this.ledger.append({
      session_id,
      agent_label,
      server: "sdfr",
      tool: "release",
      args: { reason },
      result: { released: true, reason },
      decision: "allowed",
      policy_rule_id: "brake",
      latency_ms: 0,
    });
  }

  reasonFile(): string | null {
    if (!existsSync(this.lockPath)) return null;
    return readFileSync(this.lockPath, "utf8");
  }
}
