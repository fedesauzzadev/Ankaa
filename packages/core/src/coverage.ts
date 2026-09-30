import type { Matcher, Rule, RulePack, Spec } from "./rule.js";
import { validateRule } from "./validate.js";

export type CoverageClass =
  "operation" | "parameter" | "requestBody" | "response" | "schema" | "doc";

export interface CoverageByClass {
  total: number;
  inspected: number;
}

export interface Coverage {
  total: number;
  inspected: number;
  /** 0..100, rounded. */
  pct: number;
  byClass: Record<CoverageClass, CoverageByClass>;
}

type Atom = Extract<Matcher, { op: string }>;

type AtomOp = Atom["op"];

/**
 * Primary node class inspected by each DSL atom (spec f11-coverage §7:
 * static approximation, documented). Field/target-dependent atoms
 * (presentField, missingField, descriptionMinLength, exampleRequired) carry
 * their dominant class here and are refined in classesForAtom.
 *
 * Typed as Record<AtomOp, CoverageClass>: adding an atom to the whitelist
 * without mapping it here is a compile error (AC-CV.7).
 */
const ATOM_CLASS: Record<AtomOp, CoverageClass> = {
  method: "operation",
  pathMatches: "operation",
  pathSegmentPlural: "operation",
  pathHasPrefix: "operation",
  presentField: "operation",
  missingField: "operation",
  responseMissing: "response",
  responsePresent: "response",
  descriptionMinLength: "operation",
  descriptionMatches: "operation",
  operationIdRequired: "operation",
  operationIdPattern: "operation",
  securityMissing: "operation",
  headerRequired: "response",
  parameterNamingPattern: "parameter",
  exampleRequired: "operation",
  sensitiveExample: "response",
  examplePii: "response",
  deprecatedWithoutSunset: "operation",
  docFieldMissing: "doc",
  specExtensionPresent: "operation",
  schemaInlineDepthMax: "schema",
  pathParamUndeclared: "parameter",
  pathParamNotRequired: "parameter",
  responseDescriptionMissing: "response",
  operationIdDuplicate: "operation",
  securitySchemeMissing: "doc",
  openapiVersionMismatch: "doc",
  serverInsecure: "doc",
  parameterNamingViolation: "parameter",
  parameterDuplicate: "parameter",
  booleanParamNotTyped: "parameter",
  arrayParamNotExploded: "parameter",
  pageParamWithoutMax: "parameter",
  paginationParamMissing: "parameter",
  paginationTotalMissing: "parameter",
  collectionGetNonArrayResponse: "response",
  responseHasContent: "response",
  redirectMissingLocation: "response",
  securityEmptyOverride: "operation",
  errorUsesJsonNotProblem: "response",
  errorSchemaMissingTitle: "response",
  objectSchemaNotRef: "schema",
  emptyObjectSchema: "schema",
  schemaTypeAmbiguous: "schema",
  enumWithoutDescription: "schema",
  enumTypeMismatch: "schema",
  additionalPropertiesAbsent: "schema",
  enumCasingInconsistent: "schema",
  nonStandardDateTimeFormat: "schema",
  sensitiveFieldInResponse: "schema",
  propertyNamingViolation: "schema",
  externalDocsMissingUrl: "operation",
  operationTagsWithoutRootTags: "doc",
  schemaNameNotMatching: "schema",
  errorMediaTypeInconsistent: "response",
  missingAny5xx: "response",
  securityDeclaredNowhere: "doc",
  apiKeySchemeInQuery: "doc",
  bearerSchemeWithoutAuthHeader: "doc",
  versionStyleInconsistent: "doc",
  breakingChangePolicyUndocumented: "doc",
  infoVersionNotMatching: "doc",
  inputSizeExceeds: "doc",
  paginationNamingInconsistent: "parameter",
  unusedComponents: "schema",
  undefinedOAuthScopes: "doc",
  ambiguousPaths: "operation",
};

function classesForAtom(atom: Atom, out: Set<CoverageClass>): void {
  if (atom.op === "presentField" || atom.op === "missingField") {
    out.add(atom.field === "requestBody" ? "requestBody" : "operation");
    return;
  }
  if (atom.op === "descriptionMinLength") {
    out.add(atom.target === "response" ? "response" : "operation");
    return;
  }
  if (atom.op === "exampleRequired") {
    out.add(atom.target === "response" ? "response" : "operation");
    return;
  }
  out.add(ATOM_CLASS[atom.op]);
}

function collectClasses(matcher: Matcher, out: Set<CoverageClass>): void {
  if ("all" in matcher) {
    for (const c of matcher.all) collectClasses(c, out);
    return;
  }
  if ("any" in matcher) {
    for (const c of matcher.any) collectClasses(c, out);
    return;
  }
  if ("not" in matcher) {
    collectClasses(matcher.not, out);
    return;
  }
  classesForAtom(matcher, out);
}

/** Rule classes inspected by a (validated) rule. */
export function ruleCoverageClasses(rule: Rule): Set<CoverageClass> {
  const out = new Set<CoverageClass>();
  collectClasses(rule.when, out);
  return out;
}

/**
 * Same activation semantics as the engine (evaluate shouldRun): honors
 * disabledRuleIds, deprecated, and enabledByDefault:false without explicit
 * custom enablement.
 */
export function isRuleActive(
  rule: Rule,
  customRuleIds: ReadonlySet<string>,
  disabledRuleIds?: ReadonlySet<string>,
): boolean {
  if (disabledRuleIds?.has(rule.id)) return false;
  if (rule.deprecated) return false;
  if (rule.enabledByDefault === false) return customRuleIds.has(rule.id);
  return true;
}

/** Doc-level checklist (fixed denominator: absence is governable too). */
const DOC_CHECKLIST = [
  "info.title",
  "info.version",
  "info.description",
  "servers",
  "tags",
  "security",
] as const;

function inventoryByClass(specs: readonly Spec[]): Record<CoverageClass, number> {
  const counts: Record<CoverageClass, number> = {
    operation: 0,
    parameter: 0,
    requestBody: 0,
    response: 0,
    schema: 0,
    doc: 0,
  };
  for (const spec of specs) {
    counts.doc += DOC_CHECKLIST.length;
    counts.schema += spec.components.schemas.length;
    for (const op of spec.operations) {
      counts.operation += 1;
      counts.parameter += op.parameters.length;
      if (op.requestBody !== undefined) counts.requestBody += 1;
      counts.response += op.responses.length;
    }
  }
  return counts;
}

const CLASSES: CoverageClass[] = [
  "doc",
  "operation",
  "parameter",
  "requestBody",
  "response",
  "schema",
];

function emptyByClass(): Record<CoverageClass, CoverageByClass> {
  return {
    operation: { total: 0, inspected: 0 },
    parameter: { total: 0, inspected: 0 },
    requestBody: { total: 0, inspected: 0 },
    response: { total: 0, inspected: 0 },
    schema: { total: 0, inspected: 0 },
    doc: { total: 0, inspected: 0 },
  };
}

/**
 * Merge per-input coverages (multi-input / multi-protocol runs): totals add
 * up; a class counts its nodes only from inputs where it is covered.
 */
export function mergeCoverages(parts: readonly Coverage[]): Coverage {
  const byClass = emptyByClass();
  for (const part of parts) {
    for (const cls of CLASSES) {
      const slot = byClass[cls];
      const node = part.byClass[cls];
      slot.total += node.total;
      if (node.inspected > 0) slot.inspected += node.total;
    }
  }
  let total = 0;
  let inspected = 0;
  for (const cls of CLASSES) {
    total += byClass[cls].total;
    inspected += byClass[cls].inspected;
  }
  if (total === 0) return { total: 0, inspected: 0, pct: 100, byClass };
  return { total, inspected, pct: Math.round((100 * inspected) / total), byClass };
}

export function computeCoverage(
  specs: readonly Spec[],
  packs: readonly RulePack[],
  opts?: { customRules?: readonly Rule[]; disabledRuleIds?: ReadonlySet<string> },
): Coverage {
  const totals = inventoryByClass(specs);
  const customRules = opts?.customRules ?? [];
  const customIds = new Set(customRules.map((r) => r.id));
  const seenIds = new Set<string>();
  const covered = new Set<CoverageClass>();

  const consider = (raw: unknown): void => {
    const result = validateRule(raw);
    if (!result.ok) return;
    const rule = result.rule;
    if (seenIds.has(rule.id)) return;
    seenIds.add(rule.id);
    if (!isRuleActive(rule, customIds, opts?.disabledRuleIds)) return;
    for (const c of ruleCoverageClasses(rule)) covered.add(c);
  };
  for (const pack of packs) {
    for (const rule of pack.rules) consider(rule);
  }
  for (const rule of customRules) consider(rule);

  const byClass = emptyByClass();
  let total = 0;
  let inspected = 0;
  for (const cls of CLASSES) {
    const t = totals[cls];
    const hit = covered.has(cls) ? t : 0;
    byClass[cls] = { total: t, inspected: hit };
    total += t;
    inspected += hit;
  }
  if (total === 0) return { total: 0, inspected: 0, pct: 100, byClass };
  return { total, inspected, pct: Math.round((100 * inspected) / total), byClass };
}
