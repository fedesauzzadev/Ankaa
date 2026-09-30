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
  SecuritySchemeDef,
  ParseWarning,
} from "./spec.js";

export type {
  Rule,
  RulePack,
  RuleExamples,
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

export {
  diffSpecs,
  DIFF_PACK_ID,
  type DiffOptions,
  type DiffResult,
} from "./diff.js";

export {
  computeCoverage,
  isRuleActive,
  mergeCoverages,
  ruleCoverageClasses,
  type Coverage,
  type CoverageByClass,
  type CoverageClass,
} from "./coverage.js";

export { evaluateMatcher, evaluateAtom } from "./atoms.js";

export {
  loadPack,
  flattenRuleLists,
  explain,
  explainRule,
  type PackMeta,
  type PackLoadIssue,
  type PackLoadResult,
  type RuleExplanation,
} from "./pack.js";
