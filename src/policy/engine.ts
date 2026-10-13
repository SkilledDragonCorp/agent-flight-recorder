import type { PolicyDocument, PolicyRule } from "./schema.ts";

export interface PolicyMatch {
  decision: "allow" | "deny" | "approve";
  rule_id: string | null;
}

function globMatch(pattern: string, value: string): boolean {
  if (pattern === "*") return true;
  const re = new RegExp(
    `^${pattern
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".")}$`,
  );
  return re.test(value);
}

function getPath(obj: unknown, path: string): unknown {
  // Supports $.a.b.c and a.b.c
  const clean = path.startsWith("$.") ? path.slice(2) : path.replace(/^\$/, "");
  if (!clean) return obj;
  let cur: unknown = obj;
  for (const part of clean.split(".")) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function evalWhen(rule: PolicyRule, args: unknown): boolean {
  if (!rule.when) return true;
  const actual = getPath(args, rule.when.path);
  const { op, value } = rule.when;
  switch (op) {
    case "eq":
      return actual === value;
    case "neq":
      return actual !== value;
    case "in":
      return Array.isArray(value) && value.includes(String(actual));
    case "notIn":
      return Array.isArray(value) && !value.includes(String(actual));
    case "matches":
      return typeof actual === "string" && new RegExp(String(value)).test(actual);
    default:
      return false;
  }
}

function looksLikeSideEffect(tool: string, verbs: string[]): boolean {
  const lower = tool.toLowerCase();
  return verbs.some((v) => lower.includes(v.toLowerCase()));
}

export function evaluatePolicy(
  policy: PolicyDocument,
  server: string,
  tool: string,
  args: unknown,
): PolicyMatch {
  for (const rule of policy.rules) {
    if (!globMatch(rule.server, server)) continue;
    if (!globMatch(rule.tool, tool)) continue;
    if (!evalWhen(rule, args)) continue;
    return { decision: rule.decision, rule_id: rule.id };
  }

  if (looksLikeSideEffect(tool, policy.side_effect_verbs)) {
    return { decision: "deny", rule_id: "default-side-effect" };
  }

  return {
    decision: policy.default_decision,
    rule_id: "default",
  };
}
