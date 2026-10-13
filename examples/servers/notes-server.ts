#!/usr/bin/env bun
/**
 * Fixture MCP server: read_note / write_note backed by a real SQLite file.
 */
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const dbPath = process.env.NOTES_DB ?? "./.sdfr/notes.sqlite";
mkdirSync(dirname(dbPath), { recursive: true });
const db = new Database(dbPath, { create: true });
db.exec(`CREATE TABLE IF NOT EXISTS notes (
  id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  updated_at TEXT NOT NULL
)`);

const server = new Server(
  { name: "notes", version: "0.1.0" },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "read_note",
      description: "Read a note by id",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
    },
    {
      name: "write_note",
      description: "Write a note by id",
      inputSchema: {
        type: "object",
        properties: {
          id: { type: "string" },
          body: { type: "string" },
        },
        required: ["id", "body"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const args = (req.params.arguments ?? {}) as { id?: string; body?: string };
  if (req.params.name === "read_note") {
    const row = db
      .prepare("SELECT id, body, updated_at FROM notes WHERE id = ?")
      .get(args.id ?? "");
    return {
      content: [
        {
          type: "text" as const,
          text: row ? JSON.stringify(row) : JSON.stringify({ missing: true }),
        },
      ],
    };
  }
  if (req.params.name === "write_note") {
    const ts = new Date().toISOString();
    db.prepare(
      `INSERT INTO notes(id, body, updated_at) VALUES(?,?,?)
       ON CONFLICT(id) DO UPDATE SET body=excluded.body, updated_at=excluded.updated_at`,
    ).run(args.id ?? "", args.body ?? "", ts);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ ok: true, id: args.id, updated_at: ts }),
        },
      ],
    };
  }
  return {
    content: [{ type: "text" as const, text: "unknown tool" }],
    isError: true,
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
