import { createHash } from "node:crypto";
import { canonicalJson } from "./canonical.ts";

export const GENESIS_PREV =
  "0000000000000000000000000000000000000000000000000000000000000000";

export interface ChainableEvent {
  seq: number;
  ts: string;
  session_id: string;
  agent_label: string;
  server: string;
  tool: string;
  args_json: string;
  result_summary: string;
  result_hash: string;
  decision: string;
  policy_rule_id: string | null;
  latency_ms: number;
  prev_hash: string;
}

export function eventHash(event: ChainableEvent): string {
  const { prev_hash, ...rest } = event;
  const payload = canonicalJson(rest);
  return createHash("sha256").update(prev_hash + payload).digest("hex");
}

export function sha256Hex(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}
