import { existsSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Severity } from "@apigovscan/core";
import type { FailOn } from "./args.js";

export interface AnalyzeConfig {
  failOn?: FailOn;
  standards?: { pack?: string; version?: string };
  rules?: Record<string, Severity | "off">;
  customRules?: string[];
  baseline?: {
    enabled?: boolean;
    path?: string;
    strictHash?: boolean;
  };
  skillsDir?: string;
  license?: {
    key?: string;
  };
  llm?: {
    baseUrl?: string;
    apiKey?: string;
    model?: string;
  };
  /** Directory of the config file when one was loaded (for relative paths). */
  configDir?: string;
}

export type LoadConfigResult =
  | { ok: true; config: AnalyzeConfig; path?: string }
  | { ok: false; error: string };

const FAIL_ON = new Set(["error", "warning", "info", "never"]);
const SEVERITIES = new Set(["error", "warning", "info", "off"]);
const TOP_LEVEL_KEYS = new Set([
  "failOn",
  "standards",
  "rules",
  "customRules",
  "baseline",
  "skillsDir",
  "license",
  "llm",
]);

function parseStringList(
  raw: unknown,
  path: string,
  key: string,
): { ok: true; values: string[] } | { ok: false; error: string } {
  if (typeof raw === "string") {
    if (raw.length === 0) {
      return { ok: false, error: `config ${path}: ${key} must be a non-empty string` };
    }
    return { ok: true, values: [raw] };
  }
  if (Array.isArray(raw)) {
    const values: string[] = [];
    for (let i = 0; i < raw.length; i++) {
      const item = raw[i];
      if (typeof item !== "string" || item.length === 0) {
        return {
          ok: false,
          error: `config ${path}: ${key}[${i}] must be a non-empty string`,
        };
      }
      values.push(item);
    }
    return { ok: true, values };
  }
  return {
    ok: false,
    error: `config ${path}: ${key} must be a string or list of strings`,
  };
}

function parseConfigObject(raw: unknown, path: string): LoadConfigResult {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `config ${path}: root must be a mapping` };
  }
  const obj = raw as Record<string, unknown>;
  const config: AnalyzeConfig = {};

  for (const key of Object.keys(obj)) {
    if (!TOP_LEVEL_KEYS.has(key)) {
      return {
        ok: false,
        error: `config ${path}: unknown key "${key}"`,
      };
    }
  }

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
    for (const key of Object.keys(standards)) {
      if (key !== "pack" && key !== "version") {
        return {
          ok: false,
          error: `config ${path}: standards: unknown key "${key}"`,
        };
      }
    }
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

  if (obj.customRules !== undefined) {
    const list = parseStringList(obj.customRules, path, "customRules");
    if (!list.ok) return { ok: false, error: list.error };
    config.customRules = list.values;
  }

  if (obj.baseline !== undefined) {
    if (
      obj.baseline === null ||
      typeof obj.baseline !== "object" ||
      Array.isArray(obj.baseline)
    ) {
      return { ok: false, error: `config ${path}: baseline must be a mapping` };
    }
    const baseline = obj.baseline as Record<string, unknown>;
    for (const key of Object.keys(baseline)) {
      if (key !== "enabled" && key !== "path" && key !== "strictHash") {
        return {
          ok: false,
          error: `config ${path}: baseline: unknown key "${key}"`,
        };
      }
    }
    const out: { enabled?: boolean; path?: string; strictHash?: boolean } = {};
    if (baseline.enabled !== undefined) {
      if (typeof baseline.enabled !== "boolean") {
        return {
          ok: false,
          error: `config ${path}: baseline.enabled must be a boolean`,
        };
      }
      out.enabled = baseline.enabled;
    }
    if (baseline.path !== undefined) {
      if (typeof baseline.path !== "string" || baseline.path.length === 0) {
        return {
          ok: false,
          error: `config ${path}: baseline.path must be a non-empty string`,
        };
      }
      out.path = baseline.path;
    }
    if (baseline.strictHash !== undefined) {
      if (typeof baseline.strictHash !== "boolean") {
        return {
          ok: false,
          error: `config ${path}: baseline.strictHash must be a boolean`,
        };
      }
      out.strictHash = baseline.strictHash;
    }
    config.baseline = out;
  }

  if (obj.skillsDir !== undefined) {
    if (typeof obj.skillsDir !== "string" || obj.skillsDir.length === 0) {
      return {
        ok: false,
        error: `config ${path}: skillsDir must be a non-empty string`,
      };
    }
    config.skillsDir = obj.skillsDir;
  }

  if (obj.license !== undefined) {
    if (
      obj.license === null ||
      typeof obj.license !== "object" ||
      Array.isArray(obj.license)
    ) {
      return { ok: false, error: `config ${path}: license must be a mapping` };
    }
    const license = obj.license as Record<string, unknown>;
    for (const key of Object.keys(license)) {
      if (key !== "key") {
        return {
          ok: false,
          error: `config ${path}: license: unknown key "${key}"`,
        };
      }
    }
    if (license.key !== undefined) {
      if (typeof license.key !== "string" || license.key.length === 0) {
        return {
          ok: false,
          error: `config ${path}: license.key must be a non-empty string`,
        };
      }
      config.license = { key: license.key };
    }
  }

  if (obj.llm !== undefined) {
    if (
      obj.llm === null ||
      typeof obj.llm !== "object" ||
      Array.isArray(obj.llm)
    ) {
      return { ok: false, error: `config ${path}: llm must be a mapping` };
    }
    const llm = obj.llm as Record<string, unknown>;
    for (const key of Object.keys(llm)) {
      if (key !== "baseUrl" && key !== "apiKey" && key !== "model") {
        return {
          ok: false,
          error: `config ${path}: llm: unknown key "${key}"`,
        };
      }
    }
    const out: { baseUrl?: string; apiKey?: string; model?: string } = {};
    for (const key of ["baseUrl", "apiKey", "model"] as const) {
      const value = llm[key];
      if (value !== undefined) {
        if (typeof value !== "string" || value.length === 0) {
          return {
            ok: false,
            error: `config ${path}: llm.${key} must be a non-empty string`,
          };
        }
        out[key] = value;
      }
    }
    config.llm = out;
  }

  config.configDir = dirname(path);

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
    return {
      ok: true,
      config: { configDir: dirname(path) },
      path,
    };
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
    const abs = isAbsolute(candidate) ? candidate : resolve(cwd, candidate);
    return loadConfigFromText(text, abs);
  }

  if (overridePath) {
    return { ok: false, error: `config file not found: ${overridePath}` };
  }
  return { ok: true, config: { configDir: cwd } };
}

/**
 * Resolve config customRules paths relative to the config file directory
 * (or cwd when no config file was loaded). Returns absolute paths.
 */
export function resolveCustomRulePaths(
  config: AnalyzeConfig,
  cwd: string,
): string[] {
  const base = config.configDir ?? cwd;
  return (config.customRules ?? []).map((p) =>
    isAbsolute(p) ? p : resolve(base, p),
  );
}
