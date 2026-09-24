import type { Spec } from "./spec.js";

export type { Spec } from "./spec.js";

export type Severity = "error" | "warning" | "info";

export type Category =
  | "naming"
  | "structure"
  | "docs"
  | "errors"
  | "security"
  | "versioning"
  | "pagination"
  | "parameters"
  | "schemas"
  | "deprecation"
  | "consistency"
  | "performance"
  | "custom";

export interface SourceRef {
  title: string;
  url: string;
  section?: string;
}

export type OperationField =
  | "operationId"
  | "summary"
  | "description"
  | "tags"
  | "requestBody"
  | "security"
  | "deprecated"
  | "extensions";

export type ParameterIn = "path" | "query" | "header" | "cookie";

export type DocField =
  | "info.title"
  | "info.version"
  | "servers"
  | "components.schemas";

export type AtomMatcher =
  | { op: "method"; in: string[] }
  | {
      op: "pathMatches";
      pattern: string;
      segmentIndex?: number | "last";
    }
  | { op: "pathSegmentPlural"; segmentIndex?: number | "last" }
  | { op: "pathHasPrefix"; prefix: string }
  | { op: "presentField"; field: OperationField }
  | { op: "missingField"; field: OperationField }
  | { op: "responseMissing"; status: string }
  | { op: "responsePresent"; status: string }
  | {
      op: "descriptionMinLength";
      target: "summary" | "description" | "response";
      min: number;
    }
  | {
      op: "descriptionMatches";
      target: "summary" | "description";
      pattern: string;
    }
  | { op: "operationIdRequired" }
  | { op: "operationIdPattern"; pattern: string }
  | { op: "securityMissing" }
  | {
      op: "headerRequired";
      name: string;
      in?: "request" | "response";
    }
  | {
      op: "parameterNamingPattern";
      pattern: string;
      in?: ParameterIn | "any";
    }
  | { op: "exampleRequired"; target: "operation" | "response"; status?: string }
  | { op: "sensitiveExample" }
  | { op: "deprecatedWithoutSunset" }
  | { op: "docFieldMissing"; field: DocField }
  | { op: "specExtensionPresent"; name: string }
  | { op: "schemaInlineDepthMax"; max: number };

export type Matcher =
  | { all: Matcher[] }
  | { any: Matcher[] }
  | { not: Matcher }
  | AtomMatcher;

export interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  message: string;
  when: Matcher;
  source?: SourceRef;
  fix?: string;
  enabledByDefault?: boolean;
  deprecated?: boolean;
  packId: string;
  packVersion: string;
}

export interface RulePack {
  id: string;
  version: string;
  rules: Rule[];
}

export interface Finding {
  fingerprint: string;
  ruleId: string;
  severity: Severity;
  category: Category;
  message: string;
  location: string;
  apiLocation?: string;
  fix?: string;
  source?: SourceRef;
  packId: string;
  packVersion: string;
}

export interface RuleEvalError {
  ruleId?: string;
  issues: string[];
}

export interface EvaluateOptions {
  specs: Spec[];
  packs: RulePack[];
  customRules?: Rule[];
  disabledRuleIds?: Set<string>;
  severityOverrides?: Map<string, Severity>;
}

export interface EvaluationResult {
  findings: Finding[];
  errors: RuleEvalError[];
}
