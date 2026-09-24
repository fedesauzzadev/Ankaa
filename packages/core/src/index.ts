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
