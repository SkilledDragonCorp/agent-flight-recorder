import {
  mkdirSync,
  writeFileSync,
  copyFileSync,
  existsSync,
  readFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Ledger } from "../ledger/db.ts";
import { signBytes } from "./sign.ts";
import { sha256Hex } from "../ledger/chain.ts";

export interface ExportOpts {
  from?: string;
  to?: string;
  session?: string;
  outDir: string;
}

export function exportIncident(
  ledger: Ledger,
  home: string,
  opts: ExportOpts,
): string {
  const events = ledger.list({
    session_id: opts.session,
    from: opts.from,
    to: opts.to,
  });
  mkdirSync(opts.outDir, { recursive: true });
  const blobsDir = join(opts.outDir, "blobs");
  mkdirSync(blobsDir, { recursive: true });

  const lines = events.map((e) => JSON.stringify(e));
  writeFileSync(join(opts.outDir, "events.jsonl"), lines.join("\n") + "\n");

  for (const e of events) {
    if (e.blob_hash) {
      const src = join(ledger.blobRoot, `${e.blob_hash}.bin`);
      if (existsSync(src)) {
        copyFileSync(src, join(blobsDir, `${e.blob_hash}.bin`));
      }
    }
  }

  const external = new Set<string>();
  for (const e of events) {
    try {
      const args = JSON.parse(e.args_json) as { url?: string; host?: string };
      if (args.url) {
        try {
          external.add(new URL(args.url).host);
        } catch {
          /* ignore */
        }
      }
      if (args.host) external.add(String(args.host));
    } catch {
      /* ignore */
    }
  }

  const summary = [
    `# Incident summary`,
    ``,
    `- Exported at: ${new Date().toISOString()}`,
    `- Events: ${events.length}`,
    `- From: ${opts.from ?? "(start)"}`,
    `- To: ${opts.to ?? "(end)"}`,
    `- Session: ${opts.session ?? "(all)"}`,
    ``,
    `## Timeline`,
    ...events.map(
      (e) =>
        `- ${e.ts} ${e.agent_label} › ${e.server}__${e.tool} ${e.decision}${
          e.policy_rule_id ? ` (${e.policy_rule_id})` : ""
        }`,
    ),
    ``,
    `## External parties touched`,
    ...(external.size
      ? [...external].map((h) => `- ${h}`)
      : ["- (none detected in args)"]),
    ``,
    `## Disclosure checklist`,
    `- [ ] Confirm chain verifies: see chain_proof.json`,
    `- [ ] Confirm denied calls never left the sandbox`,
    `- [ ] Notify affected parties if external hosts were contacted`,
    `- [ ] Preserve this packet (signed manifest)`,
  ].join("\n");
  writeFileSync(join(opts.outDir, "summary.md"), summary + "\n");

  const verify = ledger.verify();
  const chainProof = {
    ok: verify.ok,
    message: verify.message,
    brokenAt: verify.brokenAt,
    eventCount: events.length,
    firstHash: events[0]?.hash ?? null,
    lastHash: events[events.length - 1]?.hash ?? null,
  };
  writeFileSync(
    join(opts.outDir, "chain_proof.json"),
    JSON.stringify(chainProof, null, 2) + "\n",
  );

  const files = [
    "summary.md",
    "events.jsonl",
    "chain_proof.json",
  ];
  const fileHashes: Record<string, string> = {};
  for (const f of files) {
    fileHashes[f] = sha256Hex(readFileSync(join(opts.outDir, f)));
  }
  // include blob hashes
  for (const e of events) {
    if (e.blob_hash) {
      const p = join(blobsDir, `${e.blob_hash}.bin`);
      if (existsSync(p)) {
        fileHashes[`blobs/${e.blob_hash}.bin`] = sha256Hex(readFileSync(p));
      }
    }
  }

  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    files: fileHashes,
  };
  const manifestBody = JSON.stringify(manifest, null, 2) + "\n";
  writeFileSync(join(opts.outDir, "manifest.json"), manifestBody);
  const sig = signBytes(home, manifestBody);
  writeFileSync(join(opts.outDir, "manifest.sig"), sig);

  // embed public key for verify
  const pub = readFileSync(join(home, "keys", "ed25519.pub.pem"));
  writeFileSync(join(opts.outDir, "ed25519.pub.pem"), pub);

  return opts.outDir;
}
