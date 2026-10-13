import type { DownstreamServer } from "./downstream.ts";

export interface AggregatedTool {
  name: string;
  description?: string;
  inputSchema: unknown;
  server: string;
  originalName: string;
}

export async function listAggregatedTools(
  servers: DownstreamServer[],
): Promise<AggregatedTool[]> {
  const tools: AggregatedTool[] = [];
  for (const s of servers) {
    const res = await s.client.listTools();
    for (const t of res.tools) {
      tools.push({
        name: `${s.name}__${t.name}`,
        description: `[recorded by sdfr] ${t.description ?? ""}`.trim(),
        inputSchema: t.inputSchema,
        server: s.name,
        originalName: t.name,
      });
    }
  }
  return tools;
}

export function parseNamespaced(
  namespaced: string,
): { server: string; tool: string } | null {
  const idx = namespaced.indexOf("__");
  if (idx <= 0) return null;
  return {
    server: namespaced.slice(0, idx),
    tool: namespaced.slice(idx + 2),
  };
}
