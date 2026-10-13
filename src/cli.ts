#!/usr/bin/env bun
import { Command } from "commander";
import { resolve } from "node:path";
import { loadConfig, redactErrorMessage } from "./config/load.ts";
import { Ledger, resolveHome } from "./ledger/db.ts";
import { Brake } from "./brake.ts";
import { keygen, hasKeys } from "./incident/sign.ts";
import { exportIncident } from "./incident/export.ts";
import { verifyIncident } from "./incident/verify.ts";
import { runProxyStdio } from "./proxy/server.ts";

const program = new Command();
program
  .name("sdfr")
  .description("Agent Flight Recorder — MCP gateway with hash-chained ledger")
  .version("0.1.0");

program
  .command("run")
  .description("Run as stdio MCP proxy")
  .requiredOption("-c, --config <path>", "Path to sdfr.yaml")
  .option("--home <path>", "Data directory", process.env.SDFR_HOME)
  .action(async (opts: { config: string; home?: string }) => {
    try {
      const config = loadConfig(resolve(opts.config));
      const home = resolveHome(opts.home ?? config.home);
      await runProxyStdio(config, home);
    } catch (err) {
      console.error(redactErrorMessage(err instanceof Error ? err.message : String(err)));
      process.exit(1);
    }
  });

program
  .command("verify")
  .description("Verify the hash chain")
  .option("--home <path>", "Data directory", process.env.SDFR_HOME)
  .action(async (opts: { home?: string }) => {
    const home = resolveHome(opts.home);
    const ledger = await Ledger.open(home);
    const result = ledger.verify();
    ledger.close();
    console.log(result.message);
    process.exit(result.ok ? 0 : 2);
  });

program
  .command("brake")
  .description("Engage the emergency brake")
  .option("--home <path>", "Data directory", process.env.SDFR_HOME)
  .option("--session <id>", "Session id for ledger", "cli")
  .option("--agent <label>", "Agent label", "cli")
  .action(async (opts: { home?: string; session: string; agent: string }) => {
    const home = resolveHome(opts.home);
    const ledger = await Ledger.open(home);
    const brake = new Brake(home, ledger);
    brake.engage(opts.session, opts.agent);
    ledger.close();
    console.log("brake engaged");
  });

program
  .command("release")
  .description("Release the emergency brake")
  .requiredOption("--reason <text>", "Why the brake is being lifted")
  .option("--home <path>", "Data directory", process.env.SDFR_HOME)
  .option("--session <id>", "Session id for ledger", "cli")
  .option("--agent <label>", "Agent label", "cli")
  .action(
    async (opts: {
      reason: string;
      home?: string;
      session: string;
      agent: string;
    }) => {
      const home = resolveHome(opts.home);
      const ledger = await Ledger.open(home);
      const brake = new Brake(home, ledger);
      brake.release(opts.session, opts.agent, opts.reason);
      ledger.close();
      console.log("brake released:", opts.reason);
    },
  );

program
  .command("keygen")
  .description("Generate Ed25519 keys under .sdfr/keys")
  .option("--home <path>", "Data directory", process.env.SDFR_HOME)
  .action((opts: { home?: string }) => {
    const home = resolveHome(opts.home);
    const paths = keygen(home);
    console.log("wrote", paths.privateKeyPath);
    console.log("wrote", paths.publicKeyPath);
  });

program
  .command("tail")
  .description("Print recent ledger events")
  .option("--home <path>", "Data directory", process.env.SDFR_HOME)
  .option("-n, --lines <n>", "How many events", "50")
  .action(async (opts: { home?: string; lines: string }) => {
    const home = resolveHome(opts.home);
    const ledger = await Ledger.open(home);
    const events = ledger.list().slice(-Number(opts.lines));
    for (const e of events) {
      const t = e.ts.slice(11, 19);
      console.log(
        `${t} ${e.agent_label} › ${e.server}__${e.tool} ${e.decision.toUpperCase()}${
          e.policy_rule_id ? ` (${e.policy_rule_id})` : ""
        }`,
      );
    }
    ledger.close();
  });

const incident = program.command("incident").description("Incident packet tools");

incident
  .command("export")
  .description("Export a signed incident packet")
  .option("--from <iso>", "Start timestamp")
  .option("--to <iso>", "End timestamp")
  .option("--session <id>", "Session filter")
  .option("--out <dir>", "Output directory", "incident-out")
  .option("--home <path>", "Data directory", process.env.SDFR_HOME)
  .action(
    async (opts: {
      from?: string;
      to?: string;
      session?: string;
      out: string;
      home?: string;
    }) => {
      const home = resolveHome(opts.home);
      if (!hasKeys(home)) {
        console.error("No keys found. Run: sdfr keygen");
        process.exit(1);
      }
      const ledger = await Ledger.open(home);
      const dir = exportIncident(ledger, home, {
        from: opts.from,
        to: opts.to,
        session: opts.session,
        outDir: resolve(opts.out),
      });
      ledger.close();
      console.log("exported", dir);
    },
  );

incident
  .command("verify")
  .description("Verify a signed incident packet")
  .argument("<dir>", "Packet directory")
  .action((dir: string) => {
    const result = verifyIncident(resolve(dir));
    if (result.ok) {
      console.log("incident ok");
      process.exit(0);
    }
    console.error("incident INVALID:");
    for (const e of result.errors) console.error("-", e);
    process.exit(2);
  });

program
  .command("approve")
  .description("Approve a pending tool call (via meta file — prefer web UI)")
  .argument("<id>", "Approval id")
  .action(() => {
    console.error(
      "Use the web timeline Approve button, or the programmatic ApprovalBroker in tests.",
    );
    process.exit(1);
  });

await program.parseAsync(process.argv);
