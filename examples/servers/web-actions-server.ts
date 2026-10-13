#!/usr/bin/env bun
/**
 * Fixture MCP server that performs REAL HTTP requests (submit_form, send_email, create_account)
 * to a sandbox internet URL from SAND_BOX_INTERNET / SANDBOX_INTERNET.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

const sandbox =
  process.env.SANDBOX_INTERNET ??
  process.env.SAND_BOX_INTERNET ??
  "http://127.0.0.1:9";

async function post(path: string, body: unknown): Promise<unknown> {
  const res = await fetch(`${sandbox}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  try {
    return { status: res.status, body: JSON.parse(text) };
  } catch {
    return { status: res.status, body: text };
  }
}

const server = new Server(
  { name: "web-actions", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "submit_form",
      description: "Submit a form to a URL (side effect)",
      inputSchema: {
        type: "object",
        properties: {
          url: { type: "string" },
          host: { type: "string" },
          fields: { type: "object" },
        },
        required: ["url"],
      },
    },
    {
      name: "send_email",
      description: "Send an email via sandbox",
      inputSchema: {
        type: "object",
        properties: {
          to: { type: "string" },
          subject: { type: "string" },
          body: { type: "string" },
        },
        required: ["to", "subject"],
      },
    },
    {
      name: "create_account",
      description: "Create an account via sandbox",
      inputSchema: {
        type: "object",
        properties: {
          host: { type: "string" },
          username: { type: "string" },
        },
        required: ["host", "username"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  let result: unknown;
  if (req.params.name === "submit_form") {
    let host = String(args.host ?? "");
    if (!host && typeof args.url === "string") {
      try {
        host = new URL(args.url).host;
      } catch {
        host = "";
      }
    }
    result = await post("/submit_form", { ...args, host });
  } else if (req.params.name === "send_email") {
    result = await post("/send_email", args);
  } else if (req.params.name === "create_account") {
    result = await post("/create_account", args);
  } else {
    return {
      content: [{ type: "text" as const, text: "unknown tool" }],
      isError: true,
    };
  }
  return {
    content: [{ type: "text" as const, text: JSON.stringify(result) }],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
