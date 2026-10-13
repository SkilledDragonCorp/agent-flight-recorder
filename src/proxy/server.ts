import { randomUUID } from "node:crypto";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { SdfrConfig } from "../policy/schema.ts";
import { evaluatePolicy } from "../policy/engine.ts";
import { ApprovalBroker } from "../policy/approvals.ts";
import { Ledger } from "../ledger/db.ts";
import { Brake } from "../brake.ts";
import {
  closeDownstreams,
  connectDownstreams,
  type DownstreamServer,
} from "./downstream.ts";
import { listAggregatedTools, parseNamespaced } from "./aggregate.ts";
import { startWeb } from "../web/app.ts";

export interface ProxyRuntime {
  ledger: Ledger;
  brake: Brake;
  approvals: ApprovalBroker;
  sessionId: string;
  servers: DownstreamServer[];
  web?: { url: string; token: string; stop: () => void };
  stop: () => Promise<void>;
}

export async function createProxyRuntime(
  config: SdfrConfig,
  home: string,
): Promise<ProxyRuntime> {
  const ledger = await Ledger.open(home);
  const brake = new Brake(home, ledger);
  const approvals = new ApprovalBroker();
  const sessionId = randomUUID();
  const servers = await connectDownstreams(config.servers);

  let web: ProxyRuntime["web"];
  if (config.web.enabled) {
    web = await startWeb({
      host: config.web.host,
      port: config.web.port,
      ledger,
      brake,
      approvals,
      agentLabel: config.agent_label,
      sessionId,
    });
  }

  return {
    ledger,
    brake,
    approvals,
    sessionId,
    servers,
    web,
    stop: async () => {
      web?.stop();
      await closeDownstreams(servers);
      ledger.close();
    },
  };
}

export async function runProxyStdio(
  config: SdfrConfig,
  home: string,
): Promise<void> {
  const runtime = await createProxyRuntime(config, home);
  const tools = await listAggregatedTools(runtime.servers);

  const server = new Server(
    { name: "sdfr", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      ...tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: (t.inputSchema ?? {
          type: "object",
          properties: {},
        }) as Record<string, unknown>,
      })),
      {
        name: "sdfr__status",
        description: "Flight recorder status",
        inputSchema: { type: "object", properties: {} },
      },
    ],
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name;
    const args = req.params.arguments ?? {};
    if (name === "sdfr__status") {
      const v = runtime.ledger.verify();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              sessionId: runtime.sessionId,
              brake: runtime.brake.isActive(),
              chain: v,
              web: runtime.web?.url ?? null,
            }),
          },
        ],
      };
    }
    const parsed = parseNamespaced(name);
    if (!parsed) {
      return {
        content: [{ type: "text" as const, text: "invalid tool name" }],
        isError: true,
      };
    }
    return handleToolCall(
      runtime,
      config,
      parsed.server,
      parsed.tool,
      args,
    );
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);

  const shutdown = async () => {
    await runtime.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

export async function handleToolCall(
  runtime: ProxyRuntime,
  config: SdfrConfig,
  server: string,
  tool: string,
  args: unknown,
): Promise<{
  content: { type: "text"; text: string }[];
  isError?: boolean;
}> {
  const start = performance.now();
  const redactPatterns = config.policy.redact_patterns;

  const block = (decision: "blocked_by_brake" | "denied", text: string, rule: string | null) => {
    runtime.ledger.append({
      session_id: runtime.sessionId,
      agent_label: config.agent_label,
      server,
      tool,
      args,
      result: { error: text },
      decision,
      policy_rule_id: rule,
      latency_ms: Math.round(performance.now() - start),
      redactPatterns,
    });
    return {
      content: [{ type: "text" as const, text }],
      isError: true as const,
    };
  };

  if (runtime.brake.isActive()) {
    return block("blocked_by_brake", "blocked_by_brake", "brake");
  }

  const match = evaluatePolicy(config.policy, server, tool, args);
  const finalDecision: "allow" | "deny" | "approve" = match.decision;

  if (finalDecision === "approve") {
    const status = await runtime.approvals.request(server, tool, args);
    if (status !== "approved") {
      return block("denied", `denied: approval ${status}`, match.rule_id);
    }
  }

  if (finalDecision === "deny") {
    return block(
      "denied",
      `denied_by_policy (${match.rule_id ?? "default"})`,
      match.rule_id,
    );
  }

  if (runtime.brake.isActive()) {
    return block("blocked_by_brake", "blocked_by_brake", "brake");
  }

  const ds = runtime.servers.find((s) => s.name === server);
  if (!ds) {
    return block("denied", `unknown server ${server}`, null);
  }

  try {
    const result = await ds.client.callTool({
      name: tool,
      arguments: (args ?? {}) as Record<string, unknown>,
    });
    const text = JSON.stringify(result);
    runtime.ledger.append({
      session_id: runtime.sessionId,
      agent_label: config.agent_label,
      server,
      tool,
      args,
      result,
      decision: match.decision === "approve" ? "approved" : "allowed",
      policy_rule_id: match.rule_id,
      latency_ms: Math.round(performance.now() - start),
      redactPatterns,
    });
    return {
      content: [{ type: "text", text }],
      isError: Boolean((result as { isError?: boolean }).isError),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    runtime.ledger.append({
      session_id: runtime.sessionId,
      agent_label: config.agent_label,
      server,
      tool,
      args,
      result: { error: message },
      decision: match.decision === "approve" ? "approved" : "allowed",
      policy_rule_id: match.rule_id,
      latency_ms: Math.round(performance.now() - start),
      redactPatterns,
    });
    return {
      content: [{ type: "text", text: message }],
      isError: true,
    };
  }
}

/** Programmatic call path for e2e / scenario (no stdio MCP server). */
export async function callThroughProxy(
  runtime: ProxyRuntime,
  config: SdfrConfig,
  namespacedTool: string,
  args: unknown,
): Promise<{
  ok: boolean;
  text: string;
  decision: string;
}> {
  const parsed = parseNamespaced(namespacedTool);
  if (!parsed) {
    return { ok: false, text: "invalid tool name", decision: "denied" };
  }
  const res = await handleToolCall(
    runtime,
    config,
    parsed.server,
    parsed.tool,
    args,
  );
  const text = res.content.map((c) => c.text).join("\n");
  const last = runtime.ledger.list().at(-1);
  return {
    ok: !res.isError,
    text,
    decision: last?.decision ?? "unknown",
  };
}
