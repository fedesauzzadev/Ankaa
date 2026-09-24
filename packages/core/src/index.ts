export const VERSION = "0.0.0-dev";

export type Severity = "error" | "warning" | "info";

export interface SourceRef {
  title: string;
  url: string;
  section?: string;
}

export function isSeverity(value: unknown): value is Severity {
  return value === "error" || value === "warning" || value === "info";
}

export function packageVersion(): string {
  return VERSION;
}

export type {
  Spec,
  Operation,
  Parameter,
  RequestBody,
  ContentMedia,
  Response,
  SchemaNode,
  ComponentIndex,
  SecurityRequirement,
  ParseWarning,
} from "./spec.js";

export type {
  Rule,
  RulePack,
  Matcher,
  AtomMatcher,
  Finding,
  RuleEvalError,
  EvaluateOptions,
  EvaluationResult,
  Category,
  OperationField,
  DocField,
  ParameterIn,
} from "./rule.js";

export {
  computeFingerprint,
  sortFindings,
  dedupeFindings,
  severityRank,
  messageKey,
} from "./finding.js";

export {
  validateRule,
  validateMatcher,
  detectScope,
  findUnsafePatterns,
  type Scope,
  type ValidateRuleResult,
} from "./validate.js";

export { evaluate } from "./evaluate.js";

export { evaluateMatcher, evaluateAtom } from "./atoms.js";
