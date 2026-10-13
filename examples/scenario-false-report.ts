/**
 * Scripted MCP-client scenario: 12 calls (7 allowed, 2 approved, 3 denied),
 * then brake, then 1 blocked. Used by e2e tests.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import { readFileSync } from "node:fs";
import { SdfrConfigSchema } from "../src/policy/schema.ts";
import {
  callThroughProxy,
  createProxyRuntime,
} from "../src/proxy/server.ts";
import { startSandboxInternet } from "./sandbox-internet.ts";

export interface ScenarioResult {
  allowed: number;
  approved: number;
  denied: number;
  blocked: number;
  sandboxReceived: number;
  chainOk: boolean;
  brakeMs: number;
}

export async function runScenario(opts?: {
  includeRea?: boolean;
  home?: string;
}): Promise<ScenarioResult> {
  const home = opts?.home ?? mkdtempSync(join(tmpdir(), "sdfr-scenario-"));
  const sandbox = await startSandboxInternet();

  const base = SdfrConfigSchema.parse(
    parseYaml(readFileSync(new URL("./sdfr.yaml", import.meta.url), "utf8")),
  );

  // Point web-actions at live sandbox; optionally drop REA for faster unit-ish runs
  base.servers = base.servers
    .filter((s) => (opts?.includeRea === false ? s.name !== "rea" : true))
    .map((s) =>
      s.name === "web-actions"
        ? {
            ...s,
            env: { ...s.env, SANDBOX_INTERNET: sandbox.url },
          }
        : s.name === "notes"
          ? {
              ...s,
              env: { ...s.env, NOTES_DB: join(home, "notes.sqlite") },
            }
          : s,
    );
  base.web = { enabled: true, host: "127.0.0.1", port: 0 };
  base.home = home;

  const runtime = await createProxyRuntime(base, home);

  // Auto-approve writes in background
  const approveLoop = setInterval(() => runtime.approvals.autoApproveNext(), 20);

  let allowed = 0;
  let approved = 0;
  let denied = 0;
  let blocked = 0;

  const track = async (tool: string, args: unknown) => {
    const r = await callThroughProxy(runtime, base, tool, args);
    if (r.decision === "allowed") allowed++;
    else if (r.decision === "approved") approved++;
    else if (r.decision === "denied") denied++;
    else if (r.decision === "blocked_by_brake") blocked++;
    return r;
  };

  // 7 allowed: 5 reads + 2 local web submits
  for (let i = 0; i < 5; i++) {
    await track("notes__read_note", { id: `n${i}` });
  }
  await track("web-actions__submit_form", {
    url: "http://127.0.0.1/ok",
    host: "127.0.0.1",
    fields: { a: 1 },
  });
  await track("web-actions__submit_form", {
    url: "http://localhost/ok",
    host: "localhost",
    fields: { a: 2 },
  });

  // 2 approved writes
  await track("notes__write_note", { id: "w1", body: "hello" });
  await track("notes__write_note", { id: "w2", body: "world" });

  // 3 denied: external tip-off style submit + email + create_account
  await track("web-actions__submit_form", {
    url: "https://tips.example.org/report",
    host: "tips.example.org",
    fields: { tip: "false report" },
  });
  await track("web-actions__send_email", {
    to: "police@example.org",
    subject: "tip",
    body: "no",
    host: "example.org",
  });
  await track("web-actions__create_account", {
    host: "evil.example",
    username: "agent",
  });

  const t0 = performance.now();
  runtime.brake.engage(runtime.sessionId, base.agent_label);
  const blockedRes = await track("notes__read_note", { id: "after-brake" });
  const brakeMs = performance.now() - t0;
  if (blockedRes.decision !== "blocked_by_brake") {
    throw new Error(`expected blocked_by_brake, got ${blockedRes.decision}`);
  }

  clearInterval(approveLoop);
  const chain = runtime.ledger.verify();
  const sandboxReceived = sandbox.received.length;

  await runtime.stop();
  sandbox.stop();

  return {
    allowed,
    approved,
    denied,
    blocked,
    sandboxReceived,
    chainOk: chain.ok,
    brakeMs,
  };
}

if (import.meta.main) {
  const r = await runScenario({ includeRea: false });
  console.log(JSON.stringify(r, null, 2));
  if (
    r.allowed !== 7 ||
    r.approved !== 2 ||
    r.denied !== 3 ||
    r.blocked !== 1 ||
    r.sandboxReceived !== 2 ||
    !r.chainOk
  ) {
    process.exit(1);
  }
}
