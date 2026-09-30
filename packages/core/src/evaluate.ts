import { buildOpCache, evaluateMatcher } from "./atoms.js";
import { computeFingerprint, dedupeFindings, sortFindings } from "./finding.js";
import type { EvaluateOptions, EvaluationResult, Finding, Rule, RuleEvalError } from "./rule.js";
import type { Operation, Stability } from "./spec.js";
import { detectScope, validateRule } from "./validate.js";
import { isRuleActive } from "./coverage.js";

const STABILITY_RANK: Record<Stability, number> = { draft: 0, beta: 1, stable: 2 };

/** Strict rules skip operations below their stability threshold (AC-E.14). */
export function stabilityApplies(rule: Rule, operation: Operation): boolean {
  const need = rule.appliesFrom ?? "draft";
  if (need === "draft") return true;
  const have = operation.stability ?? "stable";
  return STABILITY_RANK[have] >= STABILITY_RANK[need];
}

function shouldRun(rule: Rule, opts: EvaluateOptions, customIds: ReadonlySet<string>): boolean {
  return isRuleActive(rule, customIds, opts.disabledRuleIds);
}

function flattenPacks(opts: EvaluateOptions): unknown[] {
  const out: unknown[] = [];
  for (const pack of opts.packs) {
    for (const rule of pack.rules) {
      out.push(rule);
    }
  }
  for (const custom of opts.customRules ?? []) {
    out.push(custom);
  }
  return out;
}

function buildFinding(
  rule: Rule,
  opts: EvaluateOptions,
  specIndex: number,
  op?: { method: string; path: string; location: string },
): Finding {
  const severity = opts.severityOverrides?.get(rule.id) ?? rule.severity;
  const base = {
    ruleId: rule.id,
    severity,
    category: rule.category,
    message: rule.message,
    location: op ? op.location : `/paths`,
    apiLocation: op ? `${op.method.toUpperCase()} ${op.path}` : undefined,
    fix: rule.fix,
    examples: rule.examples,
    source: rule.source,
    packId: rule.packId,
    packVersion: rule.packVersion,
  };
  return {
    ...base,
    fingerprint: computeFingerprint(base),
  };
}

export function evaluate(opts: EvaluateOptions): EvaluationResult {
  const errors: RuleEvalError[] = [];
  const findings: Finding[] = [];
  const rawRules = flattenPacks(opts);
  const seenIds = new Set<string>();
  const customIds = new Set((opts.customRules ?? []).map((r) => r.id));

  // OpEvalCache (spec f1-engine M-perf): JSON + path segments are derived
  // once per operation for the whole run and reused across all rules.
  // Pure derivation, so findings and sort order are identical.
  const specCaches = opts.specs.map((spec) => {
    const byPointer = new Map<string, ReturnType<typeof buildOpCache>>();
    for (const operation of spec.operations) {
      if (!byPointer.has(operation.jsonPointer)) {
        byPointer.set(operation.jsonPointer, buildOpCache(operation));
      }
    }
    return byPointer;
  });

  for (const raw of rawRules) {
    const result = validateRule(raw);
    if (!result.ok) {
      const id =
        raw && typeof raw === "object" && "id" in raw
          ? String((raw as { id: unknown }).id)
          : undefined;
      errors.push({ ruleId: id, issues: result.issues });
      continue;
    }

    const rule = result.rule;
    if (seenIds.has(rule.id)) continue;
    seenIds.add(rule.id);

    if (!shouldRun(rule, opts, customIds)) continue;

    const scope = detectScope(rule.when);
    if (scope === "mixed") {
      errors.push({
        ruleId: rule.id,
        issues: ["MIXED_SCOPE: when mixes doc-level and operation-level atoms"],
      });
      continue;
    }

    opts.specs.forEach((_spec, specIndex) => {
      const spec = opts.specs[specIndex]!;
      const opCaches = specCaches[specIndex]!;
      if (scope === "doc") {
        if (evaluateMatcher(rule.when, undefined, spec)) {
          findings.push(buildFinding(rule, opts, specIndex));
        }
        return;
      }
      for (const operation of spec.operations) {
        if (!stabilityApplies(rule, operation)) continue;
        const opMeta = {
          method: operation.method,
          path: operation.path,
          location: operation.jsonPointer,
        };
        if (evaluateMatcher(rule.when, operation, spec, opCaches.get(operation.jsonPointer))) {
          findings.push(buildFinding(rule, opts, specIndex, opMeta));
        }
      }
    });
  }

  const deduped = dedupeFindings(findings);
  const sorted = sortFindings(deduped);
  return { findings: sorted, errors };
}
