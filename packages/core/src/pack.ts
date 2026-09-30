import type { Rule, RulePack } from "./rule.js";
import { validateRule } from "./validate.js";

export interface PackMeta {
  id: string;
  version: string;
  strictSource?: boolean;
}

export interface PackLoadIssue {
  ruleId?: string;
  issues: string[];
}

export type PackLoadResult = { ok: true; pack: RulePack } | { ok: false; errors: PackLoadIssue[] };

export function loadPack(meta: PackMeta, rawRules: readonly unknown[]): PackLoadResult {
  const errors: PackLoadIssue[] = [];
  const rules: Rule[] = [];
  const seen = new Set<string>();

  for (const raw of rawRules) {
    const withMeta =
      raw !== null && typeof raw === "object" && !Array.isArray(raw)
        ? {
            ...(raw as Record<string, unknown>),
            packId: meta.id,
            packVersion: meta.version,
          }
        : raw;
    const result = validateRule(withMeta, {
      strictSource: meta.strictSource === true,
    });
    if (!result.ok) {
      const ruleId =
        raw !== null && typeof raw === "object" && "id" in raw
          ? String((raw as { id: unknown }).id)
          : undefined;
      errors.push({ ruleId, issues: result.issues });
      continue;
    }
    const rule = result.rule;
    if (seen.has(rule.id)) {
      errors.push({
        ruleId: rule.id,
        issues: [`duplicate rule id: ${rule.id}`],
      });
      continue;
    }
    seen.add(rule.id);
    rules.push(rule);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    pack: { id: meta.id, version: meta.version, rules },
  };
}

export function flattenRuleLists(lists: readonly unknown[][]): unknown[] {
  return lists.flat();
}

export interface RuleExplanation {
  id: string;
  category: Rule["category"];
  severity: Rule["severity"];
  message: string;
  fix?: string;
  examples?: Rule["examples"];
  source?: Rule["source"];
  packId: string;
  packVersion: string;
}

export function explainRule(
  pack: RulePack | readonly Rule[],
  ruleId: string,
): RuleExplanation | undefined {
  const rules = Array.isArray(pack) ? (pack as readonly Rule[]) : (pack as RulePack).rules;
  const rule = rules.find((r) => r.id === ruleId);
  if (!rule) return undefined;
  return {
    id: rule.id,
    category: rule.category,
    severity: rule.severity,
    message: rule.message,
    ...(rule.fix !== undefined ? { fix: rule.fix } : {}),
    ...(rule.examples !== undefined ? { examples: rule.examples } : {}),
    ...(rule.source !== undefined ? { source: rule.source } : {}),
    packId: rule.packId,
    packVersion: rule.packVersion,
  };
}

export function explain(
  pack: RulePack | readonly Rule[],
  ruleId: string,
): RuleExplanation | undefined {
  return explainRule(pack, ruleId);
}
