import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { SdfrConfig } from "../policy/schema.ts";

export interface DownstreamServer {
  name: string;
  client: Client;
  transport: StdioClientTransport;
  close: () => Promise<void>;
}

export async function connectDownstreams(
  servers: SdfrConfig["servers"],
): Promise<DownstreamServer[]> {
  const out: DownstreamServer[] = [];
  for (const s of servers) {
    const transport = new StdioClientTransport({
      command: s.command,
      args: s.args,
      env: { ...process.env, ...s.env } as Record<string, string>,
      cwd: s.cwd,
      stderr: "pipe",
    });
    const client = new Client({ name: `sdfr-${s.name}`, version: "0.1.0" });
    await client.connect(transport);
    out.push({
      name: s.name,
      client,
      transport,
      close: async () => {
        try {
          await client.close();
        } catch {
          /* ignore */
        }
      },
    });
  }
  return out;
}

export async function closeDownstreams(servers: DownstreamServer[]): Promise<void> {
  await Promise.all(servers.map((s) => s.close()));
}
