import { z } from "zod";
import type { Matcher, Rule } from "./rule.js";

const RULE_ID_RE = /^[A-Z][A-Z0-9]*-\d{3}$/;

const CATEGORY = [
  "naming",
  "structure",
  "docs",
  "errors",
  "security",
  "versioning",
  "pagination",
  "parameters",
  "schemas",
  "deprecation",
  "consistency",
  "performance",
  "custom",
] as const;

const SEVERITY = ["error", "warning", "info"] as const;

const OPERATION_FIELD = [
  "operationId",
  "summary",
  "description",
  "tags",
  "requestBody",
  "security",
  "deprecated",
  "extensions",
] as const;

const DOC_FIELD = [
  "info.title",
  "info.version",
  "servers",
  "components.schemas",
] as const;

const PARAMETER_IN = ["path", "query", "header", "cookie"] as const;

const SEGMENT_INDEX = z.union([z.number().int(), z.literal("last")]);

const sourceSchema = z.strictObject({
  title: z.string().min(1),
  url: z.string().url(),
  section: z.string().optional(),
});

const atomSchema = z.discriminatedUnion("op", [
  z.strictObject({
    op: z.literal("method"),
    in: z.array(z.string().min(1)).min(1),
  }),
  z.strictObject({
    op: z.literal("pathMatches"),
    pattern: z.string().min(1).max(200),
    segmentIndex: SEGMENT_INDEX.optional(),
  }),
  z.strictObject({
    op: z.literal("pathSegmentPlural"),
    segmentIndex: SEGMENT_INDEX.optional(),
  }),
  z.strictObject({
    op: z.literal("pathHasPrefix"),
    prefix: z.string().min(1),
  }),
  z.strictObject({
    op: z.literal("presentField"),
    field: z.enum(OPERATION_FIELD),
  }),
  z.strictObject({
    op: z.literal("missingField"),
    field: z.enum(OPERATION_FIELD),
  }),
  z.strictObject({
    op: z.literal("responseMissing"),
    status: z.string().min(1),
  }),
  z.strictObject({
    op: z.literal("responsePresent"),
    status: z.string().min(1),
  }),
  z.strictObject({
    op: z.literal("descriptionMinLength"),
    target: z.enum(["summary", "description", "response"]),
    min: z.number().int().min(0),
  }),
  z.strictObject({
    op: z.literal("descriptionMatches"),
    target: z.enum(["summary", "description"]),
    pattern: z.string().min(1).max(200),
  }),
  z.strictObject({ op: z.literal("operationIdRequired") }),
  z.strictObject({
    op: z.literal("operationIdPattern"),
    pattern: z.string().min(1).max(200),
  }),
  z.strictObject({ op: z.literal("securityMissing") }),
  z.strictObject({
    op: z.literal("headerRequired"),
    name: z.string().min(1),
    in: z.enum(["request", "response"]).optional(),
  }),
  z.strictObject({
    op: z.literal("parameterNamingPattern"),
    pattern: z.string().min(1).max(200),
    in: z.union([z.enum(PARAMETER_IN), z.literal("any")]).optional(),
  }),
  z.strictObject({
    op: z.literal("exampleRequired"),
    target: z.enum(["operation", "response"]),
    status: z.string().optional(),
  }),
  z.strictObject({ op: z.literal("sensitiveExample") }),
  z.strictObject({ op: z.literal("deprecatedWithoutSunset") }),
  z.strictObject({
    op: z.literal("docFieldMissing"),
    field: z.enum(DOC_FIELD),
  }),
  z.strictObject({
    op: z.literal("specExtensionPresent"),
    name: z.string().min(1),
  }),
  z.strictObject({
    op: z.literal("schemaInlineDepthMax"),
    max: z.number().int().min(1),
  }),
]);

const matcherSchema: z.ZodType<Matcher> = z.lazy(() =>
  z.union([
    z.strictObject({ all: z.array(matcherSchema).min(1) }),
    z.strictObject({ any: z.array(matcherSchema).min(1) }),
    z.strictObject({ not: matcherSchema }),
    atomSchema,
  ]),
) as z.ZodType<Matcher>;

const ruleSchema = z.strictObject({
  id: z.string().regex(RULE_ID_RE),
  category: z.enum(CATEGORY),
  severity: z.enum(SEVERITY),
  message: z.string().min(1),
  when: matcherSchema,
  source: sourceSchema.optional(),
  fix: z.string().optional(),
  enabledByDefault: z.boolean().optional(),
  deprecated: z.boolean().optional(),
  packId: z.string().min(1),
  packVersion: z.string().min(1),
});

const DOC_ATOMS = new Set<string>(["docFieldMissing"]);

export type Scope = "doc" | "operation" | "mixed";

export function detectScope(m: Matcher): Scope {
  if ("all" in m) return mergeScopes(m.all.map(detectScope));
  if ("any" in m) return mergeScopes(m.any.map(detectScope));
  if ("not" in m) return detectScope(m.not);
  return DOC_ATOMS.has(m.op) ? "doc" : "operation";
}

function mergeScopes(scopes: Scope[]): Scope {
  const hasDoc = scopes.includes("doc");
  const hasOp = scopes.includes("operation");
  const hasMixed = scopes.includes("mixed");
  if (hasMixed || (hasDoc && hasOp)) return "mixed";
  if (hasDoc) return "doc";
  return "operation";
}

const UNSAFE_NESTED_QUANTIFIER =
  /\([^)]*[+*][^)]*\)\s*[+*]/;

export function findUnsafePatterns(m: Matcher, issues: string[]): void {
  if ("all" in m) {
    for (const c of m.all) findUnsafePatterns(c, issues);
    return;
  }
  if ("any" in m) {
    for (const c of m.any) findUnsafePatterns(c, issues);
    return;
  }
  if ("not" in m) {
    findUnsafePatterns(m.not, issues);
    return;
  }
  const pattern =
    "pattern" in m ? m.pattern : undefined;
  if (pattern !== undefined) {
    if (pattern.length > 200) {
      issues.push(`pattern length ${pattern.length} exceeds 200`);
    }
    if (UNSAFE_NESTED_QUANTIFIER.test(pattern)) {
      issues.push(
        `UNSAFE_PATTERN: nested quantifier in ${pattern.slice(0, 40)}`,
      );
    }
    try {
      new RegExp(pattern);
    } catch {
      issues.push(`invalid regex: ${pattern.slice(0, 40)}`);
    }
  }
}

export type ValidateRuleResult =
  | { ok: true; rule: Rule }
  | { ok: false; issues: string[] };

export function validateRule(
  raw: unknown,
  opts?: { strictSource?: boolean },
): ValidateRuleResult {
  const parsed = ruleSchema.safeParse(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => {
      const path = i.path.join(".");
      return path ? `${path}: ${i.message}` : i.message;
    });
    return { ok: false, issues };
  }

  const issues: string[] = [];
  findUnsafePatterns(parsed.data.when, issues);

  if (opts?.strictSource && !parsed.data.source) {
    issues.push("source is required when strictSource is enabled");
  }

  const scope = detectScope(parsed.data.when);
  if (scope === "mixed") {
    issues.push("MIXED_SCOPE: when mixes doc-level and operation-level atoms");
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, rule: parsed.data as Rule };
}

export function validateMatcher(raw: unknown, path?: string): string[] {
  const result = matcherSchema.safeParse(raw);
  if (result.success) return [];
  return result.error.issues.map((i) => {
    const p = [...(path ? [path] : []), ...i.path.map(String)].join(".");
    return p ? `${p}: ${i.message}` : i.message;
  });
}
