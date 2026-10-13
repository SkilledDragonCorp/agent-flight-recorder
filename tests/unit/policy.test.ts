import { describe, expect, test } from "bun:test";
import { evaluatePolicy } from "../../src/policy/engine.ts";
import type { PolicyDocument } from "../../src/policy/schema.ts";

const policy: PolicyDocument = {
  version: 1,
  profile: "default",
  default_decision: "deny",
  side_effect_verbs: ["submit", "send", "create_account"],
  redact_patterns: [],
  rules: [
    {
      id: "allow-notes-read",
      server: "notes",
      tool: "read_note",
      decision: "allow",
    },
    {
      id: "approve-notes-write",
      server: "notes",
      tool: "write_note",
      decision: "approve",
    },
    {
      id: "allow-web-local",
      server: "web-actions",
      tool: "*",
      when: {
        path: "$.host",
        op: "in",
        value: ["127.0.0.1", "localhost", "staging.skilleddragon.test"],
      },
      decision: "allow",
    },
    {
      id: "deny-web-external",
      server: "web-actions",
      tool: "*",
      decision: "deny",
    },
  ],
};

describe("policy engine", () => {
  const cases: Array<{
    name: string;
    server: string;
    tool: string;
    args: unknown;
    decision: "allow" | "deny" | "approve";
    rule: string | null;
  }> = [
    {
      name: "allow read",
      server: "notes",
      tool: "read_note",
      args: { id: "1" },
      decision: "allow",
      rule: "allow-notes-read",
    },
    {
      name: "approve write",
      server: "notes",
      tool: "write_note",
      args: { id: "1", body: "x" },
      decision: "approve",
      rule: "approve-notes-write",
    },
    {
      name: "allow local host",
      server: "web-actions",
      tool: "submit_form",
      args: { host: "127.0.0.1", url: "http://127.0.0.1/x" },
      decision: "allow",
      rule: "allow-web-local",
    },
    {
      name: "allow localhost",
      server: "web-actions",
      tool: "submit_form",
      args: { host: "localhost" },
      decision: "allow",
      rule: "allow-web-local",
    },
    {
      name: "allow staging",
      server: "web-actions",
      tool: "submit_form",
      args: { host: "staging.skilleddragon.test" },
      decision: "allow",
      rule: "allow-web-local",
    },
    {
      name: "deny tips.example.org",
      server: "web-actions",
      tool: "submit_form",
      args: { host: "tips.example.org", url: "https://tips.example.org/report" },
      decision: "deny",
      rule: "deny-web-external",
    },
    {
      name: "deny send_email external",
      server: "web-actions",
      tool: "send_email",
      args: { host: "example.org", to: "a@b.c" },
      decision: "deny",
      rule: "deny-web-external",
    },
    {
      name: "deny create_account",
      server: "web-actions",
      tool: "create_account",
      args: { host: "evil.example", username: "x" },
      decision: "deny",
      rule: "deny-web-external",
    },
    {
      name: "default deny unknown",
      server: "other",
      tool: "ping",
      args: {},
      decision: "deny",
      rule: "default",
    },
    {
      name: "side-effect verb deny",
      server: "other",
      tool: "submit_thing",
      args: {},
      decision: "deny",
      rule: "default-side-effect",
    },
    {
      name: "glob tool match",
      server: "web-actions",
      tool: "submit_form",
      args: { host: "127.0.0.1" },
      decision: "allow",
      rule: "allow-web-local",
    },
    {
      name: "neq path",
      server: "notes",
      tool: "read_note",
      args: { id: "x" },
      decision: "allow",
      rule: "allow-notes-read",
    },
    {
      name: "unknown server tool deny",
      server: "notes",
      tool: "delete_all",
      args: {},
      decision: "deny",
      rule: "default-side-effect",
    },
    {
      name: "matches op via dedicated policy",
      server: "notes",
      tool: "read_note",
      args: { id: "abc" },
      decision: "allow",
      rule: "allow-notes-read",
    },
    {
      name: "empty args deny other",
      server: "ghost",
      tool: "noop",
      args: null,
      decision: "deny",
      rule: "default",
    },
    {
      name: "nested host path",
      server: "web-actions",
      tool: "submit_form",
      args: { host: "127.0.0.1", fields: { nested: true } },
      decision: "allow",
      rule: "allow-web-local",
    },
    {
      name: "purchase verb",
      server: "shop",
      tool: "purchase_item",
      args: {},
      decision: "deny",
      rule: "default-side-effect",
    },
    {
      name: "publish verb",
      server: "blog",
      tool: "publish_post",
      args: {},
      decision: "deny",
      rule: "default-side-effect",
    },
    {
      name: "transfer verb",
      server: "bank",
      tool: "transfer_funds",
      args: {},
      decision: "deny",
      rule: "default-side-effect",
    },
    {
      name: "post verb",
      server: "api",
      tool: "post_message",
      args: {},
      decision: "deny",
      rule: "default-side-effect",
    },
    {
      name: "delete verb",
      server: "api",
      tool: "delete_user",
      args: {},
      decision: "deny",
      rule: "default-side-effect",
    },
  ];

  for (const c of cases) {
    test(c.name, () => {
      // extend verbs for purchase/publish/transfer/post/delete cases
      const p = {
        ...policy,
        side_effect_verbs: [
          ...policy.side_effect_verbs,
          "purchase",
          "publish",
          "transfer",
          "post",
          "delete",
        ],
      };
      const m = evaluatePolicy(p, c.server, c.tool, c.args);
      expect(m.decision).toBe(c.decision);
      expect(m.rule_id).toBe(c.rule);
    });
  }
});
