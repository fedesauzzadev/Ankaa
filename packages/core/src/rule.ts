import type { Spec, Stability } from "./spec.js";

export type { Spec, Stability } from "./spec.js";

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

export interface RuleExamples {
  bad?: string;
  good?: string;
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
  "info.title" | "info.version" | "info.description" | "servers" | "tags" | "components.schemas";

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
  | { op: "schemaInlineDepthMax"; max: number }
  | { op: "pathParamUndeclared" }
  | { op: "pathParamNotRequired" }
  | { op: "responseDescriptionMissing" }
  | { op: "operationIdDuplicate" }
  | { op: "securitySchemeMissing" }
  | { op: "openapiVersionMismatch"; pattern: string }
  | { op: "serverInsecure" }
  | {
      op: "parameterNamingViolation";
      pattern: string;
      in?: ParameterIn | "any";
    }
  | { op: "parameterDuplicate" }
  | { op: "booleanParamNotTyped" }
  | { op: "arrayParamNotExploded" }
  | { op: "pageParamWithoutMax" }
  | { op: "paginationParamMissing" }
  | { op: "paginationTotalMissing" }
  | { op: "collectionGetNonArrayResponse" }
  | { op: "responseHasContent"; status: string }
  | { op: "redirectMissingLocation" }
  | { op: "securityEmptyOverride" }
  | { op: "errorUsesJsonNotProblem" }
  | { op: "errorSchemaMissingTitle" }
  | { op: "objectSchemaNotRef" }
  | { op: "emptyObjectSchema" }
  | { op: "schemaTypeAmbiguous" }
  | { op: "enumWithoutDescription" }
  | { op: "enumTypeMismatch" }
  | { op: "additionalPropertiesAbsent" }
  | { op: "enumCasingInconsistent" }
  | { op: "nonStandardDateTimeFormat" }
  | { op: "sensitiveFieldInResponse" }
  | { op: "propertyNamingViolation"; pattern: string }
  | { op: "externalDocsMissingUrl" }
  | { op: "operationTagsWithoutRootTags" }
  | { op: "schemaNameNotMatching"; pattern: string }
  | { op: "errorMediaTypeInconsistent" }
  | { op: "missingAny5xx" }
  | { op: "securityDeclaredNowhere" }
  | { op: "apiKeySchemeInQuery" }
  | { op: "bearerSchemeWithoutAuthHeader" }
  | { op: "versionStyleInconsistent" }
  | { op: "breakingChangePolicyUndocumented" }
  | { op: "infoVersionNotMatching"; pattern: string }
  | { op: "inputSizeExceeds"; maxBytes: number }
  | { op: "paginationNamingInconsistent" }
  | { op: "unusedComponents" }
  | { op: "undefinedOAuthScopes" }
  | { op: "ambiguousPaths" };

export type Matcher = { all: Matcher[] } | { any: Matcher[] } | { not: Matcher } | AtomMatcher;

export interface Rule {
  id: string;
  category: Category;
  severity: Severity;
  message: string;
  when: Matcher;
  source?: SourceRef;
  fix?: string;
  examples?: RuleExamples;
  appliesFrom?: Stability;
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
  examples?: RuleExamples;
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
