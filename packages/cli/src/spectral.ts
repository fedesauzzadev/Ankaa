import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateRule } from "@ankaa/core";
import { VENDOR_OAS } from "./vendor-oas.js";

export const SPECTRAL_VENDOR_VERSION = "1.23.0";

const MAX_EXTENDS_DEPTH = 5;
const MAX_RULES = 500;
const VENDOR_TARGET = "spectral:oas";

export interface SpectralThen {
  field?: string;
  function?: string | null;
  functionOptions?: Record<string, unknown>;
}

export interface SpectralRule {
  description?: string;
  severity: number;
  recommended?: boolean;
  given: string | string[];
  then: SpectralThen[];
  formats?: string[];
  documentationUrl?: string;
}

export type SpectralRuleDoc = SpectralRule | false;

export interface SpectralRulesetDoc {
  extends?: string[];
  rules?: Record<string, SpectralRuleDoc>;
}

export type SpectralOutcome =
  | { ok: true; rule: unknown; id: string }
  | { ok: false; reason: string };

export interface SpectralImport {
  id: string;
  name: string;
  shape: string;
  rule: unknown;
}

export interface SpectralSkip {
  name: string;
  reason: string;
  equivalent?: string;
}

export interface SpectralImportResult {
  imports: SpectralImport[];
  covered: SpectralSkip[];
  skipped: SpectralSkip[];
}

const COVERED_ELITE: Record<string, string> = {
  "info-description": "DOCS-005",
  "oas3-api-servers": "STRUCT-004",
  "oas3-operation-security-defined": "AUTH-003",
  "oas3-unused-component": "STRUCT-008",
  "operation-description": "DOCS-002",
  "operation-operationId": "NAMING-003",
  "operation-operationId-unique": "NAMING-003",
  "operation-parameters": "PARAM-006",
  "operation-success-response": "RESP-001",
  "operation-tag-defined": "STRUCT-005",
  "operation-tags": "DOCS-003",
  "path-keys-no-trailing-slash": "NAMING-002",
  "path-not-include-query": "NAMING-011",
  "path-params": "NAMING-009",
};

const TRUTHY_FIELDS = new Set(["description", "operationId", "summary", "tags"]);

function parseDocText(text: string, label: string): SpectralRulesetDoc {
  const raw: unknown = parseYaml(text);
  if (raw === null || raw === undefined) return {};
  if (typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`${label}: root must be a mapping`);
  }
  return raw as SpectralRulesetDoc;
}

function readDoc(path: string): SpectralRulesetDoc {
  const text = readFileSync(path, "utf8");
  return parseDocText(text, path);
}

function vendorRules(): Map<string, SpectralRuleDoc> {
  const out = new Map<string, SpectralRuleDoc>();
  const rules = VENDOR_OAS.rules as unknown as Record<string, SpectralRuleDoc>;
  for (const [name, rule] of Object.entries(rules)) {
    out.set(name, rule);
  }
  return out;
}

function mergeInto(
  target: Map<string, SpectralRuleDoc>,
  source: ReadonlyMap<string, SpectralRuleDoc>,
): void {
  for (const [name, doc] of source) {
    const base = target.get(name);
    if (doc === false || base === undefined || base === false) {
      target.set(name, doc);
      continue;
    }
    target.set(name, { ...base, ...doc });
  }
}

export function resolveSpectralRuleset(
  entryPath: string,
  state: { depth: number; visited: string[] } = { depth: 0, visited: [] },
): { ok: true; rules: Map<string, SpectralRuleDoc> } | { ok: false; error: string } {
  const abs = isAbsolute(entryPath) ? entryPath : resolve(process.cwd(), entryPath);
  if (state.visited.includes(abs)) {
    return { ok: false, error: `extends cycle detected at ${entryPath}` };
  }
  if (!existsSync(abs) || !statSync(abs).isFile()) {
    return { ok: false, error: `ruleset not found or not a file: ${entryPath}` };
  }
  if (state.visited.length > MAX_EXTENDS_DEPTH) {
    return { ok: false, error: `extends nesting exceeds depth ${MAX_EXTENDS_DEPTH}` };
  }

  let doc: SpectralRulesetDoc;
  try {
    doc = readDoc(abs);
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }

  const merged = new Map<string, SpectralRuleDoc>();
  for (const target of doc.extends ?? []) {
    if (target === VENDOR_TARGET) {
      mergeInto(merged, vendorRules());
      continue;
    }
    if (target.startsWith("spectral:")) {
      return {
        ok: false,
        error: `unsupported extends "${target}": only ${VENDOR_TARGET} (vendored ${SPECTRAL_VENDOR_VERSION}) and local file paths resolve offline`,
      };
    }
    if (/^https?:\/\//.test(target) || target.startsWith("npm:")) {
      return {
        ok: false,
        error: `remote extends are forbidden offline (INV-1): ${target}`,
      };
    }
    const child = resolve(dirname(abs), target);
    const sub = resolveSpectralRuleset(child, {
      depth: state.depth + 1,
      visited: [...state.visited, abs],
    });
    if (!sub.ok) return sub;
    mergeInto(merged, sub.rules);
  }

  for (const [name, override] of Object.entries(doc.rules ?? {})) {
    if (override === false) {
      merged.delete(name);
      continue;
    }
    const base = merged.get(name);
    merged.set(name, base === undefined || base === false ? override : { ...base, ...override });
  }

  return { ok: true, rules: merged };
}

function patternOption(
  then: SpectralThen,
  key: "match" | "notMatch",
): string | undefined {
  const value = then.functionOptions?.[key];
  if (typeof value !== "string" || value.length === 0 || value.length > 200) {
    return undefined;
  }
  return value;
}

interface ShapeMatch {
  shape: string;
  when: Record<string, unknown>;
}

function matchShape(rule: SpectralRule): ShapeMatch | { reason: string } {
  const given = Array.isArray(rule.given) ? undefined : rule.given;
  if (given === undefined) {
    return { reason: `given ${JSON.stringify(rule.given)}: only single string expressions are transliterable` };
  }
  if (rule.then.length !== 1) {
    return { reason: `then with ${rule.then.length} entries: only single-then rules are transliterable` };
  }
  const then = rule.then[0]!;

  if (then.function === "truthy") {
    if (given !== "#OperationObject") {
      return { reason: `truthy over given "${given}" has no atom equivalent` };
    }
    if (typeof then.field !== "string" || !TRUTHY_FIELDS.has(then.field)) {
      return { reason: `truthy field ${String(then.field)} has no atom equivalent` };
    }
    return { shape: "S7", when: { op: "missingField", field: then.field } };
  }

  if (then.function === "pattern") {
    const match = patternOption(then, "match");
    const notMatch = patternOption(then, "notMatch");
    if (match !== undefined && notMatch !== undefined) {
      return { reason: "pattern with both match and notMatch is not transliterable" };
    }
    if (match === undefined && notMatch === undefined) {
      return { reason: "pattern without a string match/notMatch option is not transliterable" };
    }

    if (given === "$.paths" && then.field === "@key") {
      return match === undefined
        ? { shape: "S1", when: { op: "pathMatches", pattern: notMatch } }
        : { shape: "S2", when: { not: { op: "pathMatches", pattern: match } } };
    }
    if (given === "#OperationObject" && then.field === "operationId") {
      return match === undefined
        ? { shape: "S4", when: { op: "operationIdPattern", pattern: notMatch } }
        : { shape: "S3", when: { not: { op: "operationIdPattern", pattern: match } } };
    }
    if (given === "$..[description,title]" && then.field === undefined) {
      const inner = [
        { op: "descriptionMatches", target: "description", pattern: match ?? notMatch },
        { op: "descriptionMatches", target: "summary", pattern: match ?? notMatch },
      ];
      return match === undefined
        ? { shape: "S5", when: { any: inner } }
        : { shape: "S6", when: { not: { any: inner } } };
    }
    return {
      reason: `pattern over given "${given}"${then.field !== undefined ? ` field "${then.field}"` : ""} has no shape`,
    };
  }

  return { reason: `function "${String(then.function)}" is not transliterable (whitelist: truthy, pattern)` };
}

function severityOf(rule: SpectralRule): "error" | "warning" | "info" {
  if (rule.severity === 0) return "error";
  if (rule.severity === 1) return "warning";
  return "info";
}

export function classifySpectralRules(
  rules: ReadonlyMap<string, SpectralRuleDoc>,
): SpectralImportResult {
  const imports: SpectralImport[] = [];
  const covered: SpectralSkip[] = [];
  const skipped: SpectralSkip[] = [];
  const names = [...rules.keys()].sort();

  for (const name of names) {
    const doc = rules.get(name)!;
    if (doc === false) continue;
    const equivalent = COVERED_ELITE[name];
    if (equivalent !== undefined) {
      covered.push({ name, reason: "already covered by the elite pack", equivalent });
      continue;
    }
    const shape = matchShape(doc);
    if ("reason" in shape) {
      skipped.push({ name, reason: shape.reason });
      continue;
    }
    imports.push({
      id: "",
      name,
      shape: shape.shape,
      rule: {
        id: "",
        category: "custom",
        severity: severityOf(doc),
        message:
          doc.description !== undefined && doc.description.length > 0
            ? doc.description.replace(/\s+/g, " ").slice(0, 300)
            : `Imported from Spectral rule "${name}".`,
        ...(doc.documentationUrl !== undefined
          ? {
              source: {
                title: `Spectral: ${name}`,
                url: doc.documentationUrl,
              },
            }
          : {}),
        fix: `Review the source rule "${name}" (${shape.shape}) and adapt it to your guideline.`,
        when: shape.when,
      },
    });
  }

  imports.forEach((entry, index) => {
    entry.id = `SPEC-${String(index + 1).padStart(3, "0")}`;
    (entry.rule as { id: string }).id = entry.id;
  });

  return { imports, covered, skipped };
}

export function validateImports(
  imports: SpectralImport[],
  toolVersion: string,
): {
  valid: SpectralImport[];
  invalid: SpectralSkip[];
} {
  const valid: SpectralImport[] = [];
  const invalid: SpectralSkip[] = [];
  for (const entry of imports) {
    const stamped = {
      ...(entry.rule as Record<string, unknown>),
      packId: "custom",
      packVersion: toolVersion,
    };
    const result = validateRule(stamped);
    if (result.ok) {
      valid.push(entry);
    } else {
      invalid.push({ name: entry.name, reason: `generated rule failed validation: ${result.issues.join("; ")}` });
    }
  }
  return { valid, invalid };
}

export function serializeImports(imports: SpectralImport[]): string {
  return stringifyYaml({
    version: 1,
    source: `spectral-ruleset (vendored ${VENDOR_TARGET}@${SPECTRAL_VENDOR_VERSION})`,
    rules: imports.map((entry) => {
      const { packId: _p, packVersion: _v, ...rest } = entry.rule as Record<string, unknown>;
      return rest;
    }),
  });
}

export function ruleCountGuard(rules: ReadonlyMap<string, SpectralRuleDoc>): string | undefined {
  if (rules.size > MAX_RULES) {
    return `ruleset has ${rules.size} rules (max ${MAX_RULES})`;
  }
  return undefined;
}
