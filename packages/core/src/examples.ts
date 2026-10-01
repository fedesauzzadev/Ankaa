import { computeFingerprint, sortFindings } from "./finding.js";
import type { Finding } from "./rule.js";
import type { SchemaNode, Spec } from "./spec.js";

export const EXAMPLES_PACK_ID = "examples";

export interface ExamplesSummary {
  checked: number;
  valid: number;
  partial: number;
  invalid: number;
  skipped: number;
}

const MAX_DEPTH = 24;
const MAX_EXAMPLE_BYTES = 100_000;
const LOCAL_REF_PREFIX = "#/components/schemas/";

/** Validation keywords the subset does NOT evaluate: they mark the result partial. */
const UNSUPPORTED_VALIDATION_KEYWORDS = new Set([
  "pattern",
  "multipleOf",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minItems",
  "maxItems",
  "uniqueItems",
  "minProperties",
  "maxProperties",
  "contains",
  "oneOf",
  "anyOf",
  "not",
  "if",
  "then",
  "else",
  "dependentRequired",
  "dependentSchemas",
  "additionalProperties",
]);

const SOURCE = {
  title: "OpenAPI Specification",
  url: "https://spec.openapis.org/oas/v3.1.0",
  section: "Schema Object / example",
};

interface NodeResult {
  status: "valid" | "partial" | "invalid" | "skip";
  reason?: string;
  unsupported: string[];
}

interface Ctx {
  spec: Spec;
  refStack: string[];
}

function typeName(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && !Number.isNaN(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    case "object":
      return typeof value === "object" && value !== null && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    default:
      return true;
  }
}

function enumIncludes(options: readonly unknown[], value: unknown): boolean {
  return options.some((option) =>
    option === value ||
    (typeof option === "object" && option !== null &&
      JSON.stringify(option) === JSON.stringify(value)),
  );
}

function merge(children: NodeResult[]): NodeResult {
  const unsupported = [
    ...new Set(children.flatMap((child) => child.unsupported)),
  ].sort();
  const invalid = children.find((child) => child.status === "invalid");
  if (invalid !== undefined) {
    return { status: "invalid", reason: invalid.reason, unsupported };
  }
  const skip = children.find((child) => child.status === "skip");
  if (skip !== undefined) {
    return { status: "skip", reason: skip.reason, unsupported };
  }
  if (children.some((child) => child.status === "partial") || unsupported.length > 0) {
    return { status: "partial", unsupported };
  }
  return { status: "valid", unsupported: [] };
}

function refName(ref: string | undefined): string | undefined {
  if (ref === undefined || !ref.startsWith(LOCAL_REF_PREFIX)) return undefined;
  return decodeURIComponent(ref.slice(LOCAL_REF_PREFIX.length));
}

function validateNode(
  schema: SchemaNode | undefined,
  value: unknown,
  depth: number,
  ctx: Ctx,
): NodeResult {
  if (depth > MAX_DEPTH) {
    return { status: "skip", reason: "depth budget exceeded", unsupported: [] };
  }
  if (schema === undefined) {
    return { status: "skip", reason: "schema is undefined", unsupported: [] };
  }

  const unsupported: string[] = [];
  for (const key of Object.keys(schema)) {
    if (UNSUPPORTED_VALIDATION_KEYWORDS.has(key)) {
      unsupported.push(key);
    }
  }

  if (schema.ref !== undefined) {
    const name = refName(schema.ref);
    if (name === undefined) {
      return {
        status: "skip",
        reason: `unsupported $ref target: ${schema.ref}`,
        unsupported,
      };
    }
    const target = ctx.spec.components.schemaNodes?.[name];
    if (target === undefined) {
      return {
        status: "skip",
        reason: `unresolvable $ref: ${schema.ref}`,
        unsupported,
      };
    }
    if (ctx.refStack.includes(name)) {
      return {
        status: "skip",
        reason: `cycle at $ref ${schema.ref}`,
        unsupported,
      };
    }
    ctx.refStack.push(name);
    const resolved = validateNode(target, value, depth + 1, ctx);
    ctx.refStack.pop();
    return resolved;
  }

  const children: NodeResult[] = [];

  if (schema.type !== undefined) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some((type) => matchesType(value, type))) {
      return {
        status: "invalid",
        reason: `expected ${types.join(" | ")}, got ${typeName(value)}`,
        unsupported,
      };
    }
  }

  if (schema.enum !== undefined && !enumIncludes(schema.enum, value)) {
    return {
      status: "invalid",
      reason: "value not in enum",
      unsupported,
    };
  }

  if (typeof value === "string") {
    if (schema.maxLength !== undefined && value.length > schema.maxLength) {
      return {
        status: "invalid",
        reason: `string longer than maxLength ${schema.maxLength}`,
        unsupported,
      };
    }
  }

  if (typeof value === "number") {
    if (schema.maximum !== undefined && value > schema.maximum) {
      return {
        status: "invalid",
        reason: `value above maximum ${schema.maximum}`,
        unsupported,
      };
    }
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const record = value as Record<string, unknown>;
    if (schema.required !== undefined) {
      for (const key of schema.required) {
        if (!(key in record)) {
          return {
            status: "invalid",
            reason: `missing required property "${key}"`,
            unsupported,
          };
        }
      }
    }
    if (schema.properties !== undefined) {
      for (const key of Object.keys(schema.properties)) {
        if (key in record) {
          children.push(
            validateNode(schema.properties[key], record[key], depth + 1, ctx),
          );
        }
      }
    }
  }

  if (Array.isArray(value) && schema.items !== undefined) {
    for (let i = 0; i < value.length; i++) {
      children.push(validateNode(schema.items, value[i], depth + 1, ctx));
    }
  }

  if (children.length > 0) {
    const merged = merge(children);
    return { ...merged, unsupported: [...new Set([...unsupported, ...merged.unsupported])].sort() };
  }

  if (unsupported.length > 0) {
    return { status: "partial", unsupported };
  }
  return { status: "valid", unsupported: [] };
}

interface ExampleTarget {
  schema: SchemaNode;
  example: unknown;
  examplePointer: string;
  apiLocation?: string;
}

function collectTargets(spec: Spec): ExampleTarget[] {
  const targets: ExampleTarget[] = [];
  for (const op of spec.operations) {
    const apiLocation = `${op.method.toUpperCase()} ${op.path}`;
    for (const param of op.parameters) {
      if (param.schema?.example !== undefined) {
        targets.push({
          schema: param.schema,
          example: param.schema.example,
          examplePointer: `${param.jsonPointer}/schema/example`,
          apiLocation,
        });
      }
    }
    if (op.requestBody !== undefined) {
      op.requestBody.content.forEach((content, index) => {
        if (content.schema?.example !== undefined) {
          targets.push({
            schema: content.schema,
            example: content.schema.example,
            examplePointer: `${op.requestBody!.jsonPointer}/content/${index}/schema/example`,
            apiLocation,
          });
        }
      });
    }
    for (const response of op.responses) {
      response.content.forEach((content, index) => {
        if (content.schema?.example !== undefined) {
          targets.push({
            schema: content.schema,
            example: content.schema.example,
            examplePointer: `${response.jsonPointer}/content/${index}/schema/example`,
            apiLocation,
          });
        }
      });
    }
  }
  return targets;
}

function exvalFinding(
  ruleId: "EXVAL-001" | "EXVAL-002",
  severity: "warning" | "info",
  message: string,
  target: ExampleTarget,
  fix: string,
  packVersion: string,
): Finding {
  const withoutFingerprint: Omit<Finding, "fingerprint"> = {
    ruleId,
    severity,
    category: "schemas",
    message,
    location: target.examplePointer,
    ...(target.apiLocation !== undefined ? { apiLocation: target.apiLocation } : {}),
    fix,
    source: SOURCE,
    packId: EXAMPLES_PACK_ID,
    packVersion,
  };
  return { ...withoutFingerprint, fingerprint: computeFingerprint(withoutFingerprint) };
}

export function validateExamples(
  spec: Spec,
  opts: { packVersion: string },
): { findings: Finding[]; summary: ExamplesSummary } {
  const counts: ExamplesSummary = { checked: 0, valid: 0, partial: 0, invalid: 0, skipped: 0 };
  const findings: Finding[] = [];

  for (const target of collectTargets(spec)) {
    counts.checked += 1;
    if (JSON.stringify(target.example).length > MAX_EXAMPLE_BYTES) {
      counts.skipped += 1;
      findings.push(
        exvalFinding(
          "EXVAL-002",
          "info",
          "example not validated: size budget exceeded (100 KB)",
          target,
          "Reduce the example so it can be validated offline.",
          opts.packVersion,
        ),
      );
      continue;
    }
    const result = validateNode(target.schema, target.example, 0, { spec, refStack: [] });
    if (result.status === "invalid") {
      counts.invalid += 1;
      findings.push(
        exvalFinding(
          "EXVAL-001",
          "warning",
          `example does not match its schema: ${result.reason ?? "mismatch"}`,
          target,
          "Update the example to match the schema, or fix the schema.",
          opts.packVersion,
        ),
      );
    } else if (result.status === "skip") {
      counts.skipped += 1;
      findings.push(
        exvalFinding(
          "EXVAL-002",
          "info",
          `example not validated: ${result.reason ?? "skipped"}`,
          target,
          "Resolve the $ref or simplify the example so it can be validated offline.",
          opts.packVersion,
        ),
      );
    } else if (result.status === "partial") {
      counts.partial += 1;
    } else {
      counts.valid += 1;
    }
  }

  return { findings: sortFindings(findings), summary: counts };
}
