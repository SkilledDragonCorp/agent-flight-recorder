#!/usr/bin/env bun
/**
 * Keyless report: bun test counts + false-report scenario + REA e2e signal + brake latency.
 * Writes reports/flight-recorder.json (+ .md). Deterministic apart from timings / generated_at.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runScenario } from "../examples/scenario-false-report.ts";

const ROOT = join(import.meta.dir, "..");
const REPORTS = join(ROOT, "reports");

type Step = {
  id: string;
  command: string;
  ok: boolean;
  exit_code: number;
  elapsed_ms: number;
  output: string;
};

function run(id: string, cmd: string[]): Step {
  const t0 = performance.now();
  const r = Bun.spawnSync(cmd, {
    cwd: ROOT,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env },
  });
  const output = `${r.stdout?.toString() ?? ""}${r.stderr?.toString() ?? ""}`;
  return {
    id,
    command: cmd.join(" "),
    ok: r.exitCode === 0,
    exit_code: r.exitCode ?? 1,
    elapsed_ms: Math.round(performance.now() - t0),
    output,
  };
}

function parseBunTest(out: string): { pass: number; fail: number } {
  const pass = Number(out.match(/(\d+)\s+pass/i)?.[1] ?? 0);
  const fail = Number(out.match(/(\d+)\s+fail/i)?.[1] ?? 0);
  return { pass, fail };
}

const tAll = performance.now();
const testStep = run("bun:test", ["bun", "test"]);
const counts = parseBunTest(testStep.output);

// Scenario without REA (fast path for brake + policy counts); REA covered by dedicated e2e file.
const tScen = performance.now();
let scenarioOk = false;
let scenarioErr: string | null = null;
let scenario = {
  allowed: 0,
  approved: 0,
  denied: 0,
  blocked: 0,
  sandboxReceived: 0,
  chainOk: false,
  brakeMs: -1,
};
try {
  scenario = await runScenario({ includeRea: false });
  scenarioOk =
    scenario.allowed === 7 &&
    scenario.approved === 2 &&
    scenario.denied === 3 &&
    scenario.blocked === 1 &&
    scenario.sandboxReceived === 2 &&
    scenario.chainOk;
} catch (e) {
  scenarioErr = e instanceof Error ? e.message : String(e);
}
const scenario_elapsed_ms = Math.round(performance.now() - tScen);

// REA: run only the REA e2e file so we do not double-pay full suite time in the report narrative.
const reaStep = run("e2e:rea", ["bun", "test", "tests/e2e/rea-proxy.test.ts"]);
const elapsed_ms = Math.round(performance.now() - tAll);

const steps: Step[] = [
  testStep,
  {
    id: "scenario:false-report",
    command: "runScenario({ includeRea: false })",
    ok: scenarioOk,
    exit_code: scenarioOk ? 0 : 1,
    elapsed_ms: scenario_elapsed_ms,
    output: scenarioErr ?? JSON.stringify(scenario),
  },
  reaStep,
];
const steps_passed = steps.filter((s) => s.ok).length;
const steps_failed = steps.length - steps_passed;
const ok = steps_failed === 0 && counts.fail === 0;

const brake_ms =
  typeof scenario.brakeMs === "number" && scenario.brakeMs >= 0
    ? Math.round(scenario.brakeMs * 100) / 100
    : null;

const payload = {
  generated_at: new Date().toISOString(),
  lab: "agent-flight-recorder",
  keyless: true,
  ok,
  elapsed_ms,
  elapsed_s: Math.round(elapsed_ms / 100) / 10,
  bun: { version: Bun.version, pass: counts.pass, fail: counts.fail },
  scenario: {
    ok: scenarioOk,
    allowed: scenario.allowed,
    approved: scenario.approved,
    denied: scenario.denied,
    blocked: scenario.blocked,
    sandbox_received: scenario.sandboxReceived,
    chain_ok: scenario.chainOk,
    brake_ms,
    elapsed_ms: scenario_elapsed_ms,
    error: scenarioErr,
  },
  rea: {
    ok: reaStep.ok,
    exit_code: reaStep.exit_code,
    package: "rea-agents@6.4.0",
    elapsed_ms: reaStep.elapsed_ms,
  },
  steps: steps.map(({ id, command, ok, exit_code, elapsed_ms }) => ({
    id,
    command,
    ok,
    exit_code,
    elapsed_ms,
  })),
  headline: {
    bun_pass: counts.pass,
    bun_fail: counts.fail,
    scenario: "7/2/3/1",
    rea_ok: reaStep.ok,
    brake_ms,
  },
};

mkdirSync(REPORTS, { recursive: true });
writeFileSync(join(REPORTS, "flight-recorder.json"), `${JSON.stringify(payload, null, 2)}\n`);

const md = [
  "# Agent Flight Recorder — keyless report",
  "",
  `- **Generated:** ${payload.generated_at}`,
  `- **Result:** ${ok ? "GREEN" : "RED"} — ${steps_passed}/${steps.length} steps, bun ${counts.pass} pass / ${counts.fail} fail`,
  `- **Scenario:** allowed ${scenario.allowed} / approved ${scenario.approved} / denied ${scenario.denied} / blocked ${scenario.blocked}; sandbox ${scenario.sandboxReceived}; chain ${scenario.chainOk ? "ok" : "FAIL"}`,
  `- **Brake latency:** ${brake_ms != null ? `${brake_ms} ms` : "n/a"}`,
  `- **REA e2e:** ${reaStep.ok ? "OK" : "FAIL"} (${payload.rea.package})`,
  `- **Elapsed:** ${elapsed_ms} ms (~${payload.elapsed_s} s)`,
  "",
  "## Steps",
  "",
  ...steps.map(
    (s) =>
      `- \`${s.id}\`: ${s.ok ? "PASS" : "FAIL"} (exit ${s.exit_code}, ${s.elapsed_ms} ms)`,
  ),
  "",
].join("\n");
writeFileSync(join(REPORTS, "flight-recorder.md"), md);

console.log(
  JSON.stringify(
    {
      ok,
      bun_pass: counts.pass,
      bun_fail: counts.fail,
      scenario_ok: scenarioOk,
      rea_ok: reaStep.ok,
      brake_ms,
      elapsed_ms,
      generated_at: payload.generated_at,
    },
    null,
    2,
  ),
);
if (!ok) process.exit(1);
