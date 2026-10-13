import { z } from "zod";

export const PolicyRuleSchema = z.object({
  id: z.string().min(1),
  server: z.string().default("*"),
  tool: z.string().default("*"),
  /** Simple JSONPath-like predicates: "$.url.host" notIn ["evil.com"] */
  when: z
    .object({
      path: z.string(),
      op: z.enum(["eq", "neq", "in", "notIn", "matches"]),
      value: z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]),
    })
    .optional(),
  decision: z.enum(["allow", "deny", "approve"]),
});

export const PolicyDocumentSchema = z.object({
  version: z.number().int().positive().default(1),
  profile: z.string().default("default"),
  default_decision: z.enum(["allow", "deny", "approve"]).default("deny"),
  side_effect_verbs: z
    .array(z.string())
    .default([
      "submit",
      "send",
      "post",
      "create_account",
      "delete",
      "transfer",
      "purchase",
      "publish",
    ]),
  rules: z.array(PolicyRuleSchema),
  redact_patterns: z.array(z.string()).default([]),
});

export type PolicyRule = z.infer<typeof PolicyRuleSchema>;
export type PolicyDocument = z.infer<typeof PolicyDocumentSchema>;

export const SdfrConfigSchema = z.object({
  agent_label: z.string().default("agent"),
  home: z.string().optional(),
  web: z
    .object({
      enabled: z.boolean().default(true),
      host: z.literal("127.0.0.1").default("127.0.0.1"),
      port: z.number().int().min(0).max(65535).default(0),
    })
    .default({}),
  policy: PolicyDocumentSchema,
  servers: z.array(
    z.object({
      name: z
        .string()
        .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/),
      command: z.string().min(1),
      args: z.array(z.string()).default([]),
      env: z.record(z.string()).default({}),
      cwd: z.string().optional(),
    }),
  ),
});

export type SdfrConfig = z.infer<typeof SdfrConfigSchema>;
