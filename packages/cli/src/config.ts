import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Severity } from "@apigovscan/core";
import type { FailOn } from "./args.js";

export interface AnalyzeConfig {
  failOn?: FailOn;
  standards?: { pack?: string; version?: string };
  rules?: Record<string, Severity | "off">;
}

export type LoadConfigResult =
  | { ok: true; config: AnalyzeConfig; path?: string }
  | { ok: false; error: string };

const FAIL_ON = new Set(["error", "warning", "info", "never"]);
const SEVERITIES = new Set(["error", "warning", "info", "off"]);

function parseConfigObject(raw: unknown, path: string): LoadConfigResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `config ${path}: root must be a mapping` };
  }
  const obj = raw as Record<string, unknown>;
  const config: AnalyzeConfig = {};

  if (obj.failOn !== undefined) {
    if (typeof obj.failOn !== "string" || !FAIL_ON.has(obj.failOn)) {
      return {
        ok: false,
        error: `config ${path}: failOn must be error | warning | info | never`,
      };
    }
    config.failOn = obj.failOn as FailOn;
  }

  if (obj.standards !== undefined) {
    if (
      obj.standards === null ||
      typeof obj.standards !== "object" ||
      Array.isArray(obj.standards)
    ) {
      return { ok: false, error: `config ${path}: standards must be a mapping` };
    }
    const standards = obj.standards as Record<string, unknown>;
    const out: { pack?: string; version?: string } = {};
    if (standards.pack !== undefined) {
      if (typeof standards.pack !== "string" || standards.pack.length === 0) {
        return { ok: false, error: `config ${path}: standards.pack must be a non-empty string` };
      }
      out.pack = standards.pack;
    }
    if (standards.version !== undefined) {
      if (typeof standards.version !== "string" || standards.version.length === 0) {
        return {
          ok: false,
          error: `config ${path}: standards.version must be a non-empty string`,
        };
      }
      out.version = standards.version;
    }
    config.standards = out;
  }

  if (obj.rules !== undefined) {
    if (
      obj.rules === null ||
      typeof obj.rules !== "object" ||
      Array.isArray(obj.rules)
    ) {
      return { ok: false, error: `config ${path}: rules must be a mapping` };
    }
    const rules: Record<string, Severity | "off"> = {};
    for (const [ruleId, value] of Object.entries(
      obj.rules as Record<string, unknown>,
    )) {
      if (typeof value !== "string" || !SEVERITIES.has(value)) {
        return {
          ok: false,
          error: `config ${path}: rules.${ruleId} must be off | error | warning | info`,
        };
      }
      rules[ruleId] = value as Severity | "off";
    }
    config.rules = rules;
  }

  return { ok: true, config, path };
}

export function loadConfigFromText(
  text: string,
  path: string,
): LoadConfigResult {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return {
      ok: false,
      error: `config ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (raw === undefined || raw === null) {
    return { ok: true, config: {}, path };
  }
  return parseConfigObject(raw, path);
}

export function loadConfig(cwd: string, overridePath?: string): LoadConfigResult {
  const candidates = overridePath
    ? [overridePath]
    : [join(cwd, "apigovscan.yaml"), join(cwd, "apigovscan.yml")];

  for (const candidate of candidates) {
    if (!existsSync(candidate)) {
      if (overridePath) {
        return { ok: false, error: `config file not found: ${candidate}` };
      }
      continue;
    }
    const text = readFileSync(candidate, "utf8");
    return loadConfigFromText(text, candidate);
  }

  if (overridePath) {
    return { ok: false, error: `config file not found: ${overridePath}` };
  }
  return { ok: true, config: {} };
}
