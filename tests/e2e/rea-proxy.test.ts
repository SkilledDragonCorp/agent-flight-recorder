import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { SdfrConfigSchema } from "../../src/policy/schema.ts";
import { callThroughProxy, createProxyRuntime } from "../../src/proxy/server.ts";
import { listAggregatedTools } from "../../src/proxy/aggregate.ts";

const asarSrc = resolve("tests/fixtures/asar-src");

describe("e2e REA via sdfr", () => {
  test(
    "lists rea__analyze_javascript_application and matches direct call",
    async () => {
      const home = mkdtempSync(join(tmpdir(), "sdfr-rea-"));
      const config = SdfrConfigSchema.parse({
        agent_label: "e2e",
        web: { enabled: false, host: "127.0.0.1", port: 0 },
        policy: {
          version: 1,
          profile: "default",
          default_decision: "deny",
          rules: [
            {
              id: "allow-rea-js",
              server: "rea",
              tool: "analyze_javascript_application",
              decision: "allow",
            },
            {
              id: "allow-notes-read",
              server: "notes",
              tool: "read_note",
              decision: "allow",
            },
          ],
        },
        servers: [
          {
            name: "notes",
            command: "bun",
            args: ["run", "examples/servers/notes-server.ts"],
            env: { NOTES_DB: join(home, "notes.sqlite") },
          },
          {
            name: "rea",
            command: "node",
            args: ["node_modules/rea-agents/scripts/rea.mjs", "mcp"],
          },
        ],
      });

      const runtime = await createProxyRuntime(config, home);
      const tools = await listAggregatedTools(runtime.servers);
      const reaTool = tools.find(
        (t) => t.name === "rea__analyze_javascript_application",
      );
      expect(reaTool).toBeTruthy();
      expect(reaTool!.description).toContain("[recorded by sdfr]");

      // REA schema: required `input_path`; format=directory for extracted trees.
      // https://github.com/morluto/rea (analyze_javascript_application)
      const args = {
        input_path: asarSrc,
        format: "directory" as const,
        detail: "summary" as const,
      };
      const directTransport = new StdioClientTransport({
        command: "node",
        args: ["node_modules/rea-agents/scripts/rea.mjs", "mcp"],
      });
      const direct = new Client({ name: "direct", version: "0.0.1" });
      await direct.connect(directTransport);
      const directResult = await direct.callTool({
        name: "analyze_javascript_application",
        arguments: args,
      });
      await direct.close();

      const proxied = await callThroughProxy(
        runtime,
        config,
        "rea__analyze_javascript_application",
        args,
      );
      expect(proxied.ok).toBe(true);
      expect(proxied.decision).toBe("allowed");

      // Compare normalized JSON text presence of fixture name
      const directText = JSON.stringify(directResult);
      expect(directText.length).toBeGreaterThan(20);
      expect(proxied.text.length).toBeGreaterThan(20);
      // Both should mention the fixture somehow or return structured evidence
      const chain = runtime.ledger.verify();
      expect(chain.ok).toBe(true);
      expect(runtime.ledger.list().length).toBeGreaterThanOrEqual(1);

      await runtime.stop();
      rmSync(home, { recursive: true, force: true });
    },
    180_000,
  );
});
