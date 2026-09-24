import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateRule, type Finding, type Rule, type Severity } from "@apigovscan/core";
import type { AnalyzeConfig } from "./config.js";

export const DEFAULT_SKILLS_DIR = ".apigovscan/skills";
export const SKILLS_SCHEMA_VERSION = 1;

const FINGERPRINT_RE = /^[0-9a-f]{64}$/;
const SEVERITIES = new Set<Severity>(["error", "warning", "info"]);
const UNSAFE_NESTED_QUANTIFIER = /\([^)]*[+*][^)]*\)\s*[+*]/;

export interface SuppressionMatch {
  ruleId: string;
  apiPath?: string;
}

export interface SuppressionEntry {
  fingerprint?: string;
  match?: SuppressionMatch;
  reason: string;
  by?: string;
  createdAt?: string;
}

export interface SeverityOverride {
  ruleId: string;
  severity: Severity;
}

export interface LoadedSkills {
  suppressions: SuppressionEntry[];
  severities: SeverityOverride[];
  activeDraftRules: Rule[];
}

export type LoadSkillsResult =
  | { ok: true; skills: LoadedSkills }
  | { ok: false; error: string };

const EMPTY_SKILLS: LoadedSkills = {
  suppressions: [],
  severities: [],
  activeDraftRules: [],
};

export function resolveSkillsDir(
  config: AnalyzeConfig,
  cwd: string,
  flagPath?: string,
): string {
  if (flagPath !== undefined) {
    return isAbsolute(flagPath) ? flagPath : resolve(cwd, flagPath);
  }
  const raw = config.skillsDir ?? DEFAULT_SKILLS_DIR;
  if (isAbsolute(raw)) return raw;
  const base = config.skillsDir !== undefined ? (config.configDir ?? cwd) : cwd;
  return resolve(base, raw);
}

function parseYamlFile(path: string): { ok: true; raw: unknown } | { ok: false; error: string } {
  if (!existsSync(path)) {
    return { ok: false, error: `skills file not found: ${path}` };
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `skills ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    const raw = parseYaml(text);
    return { ok: true, raw };
  } catch (err) {
    return {
      ok: false,
      error: `skills ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

function checkVersion(path: string, raw: unknown): string | undefined {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return `skills ${path}: root must be a mapping`;
  }
  const version = (raw as { version?: unknown }).version;
  if (version !== SKILLS_SCHEMA_VERSION) {
    return `skills ${path}: unsupported skills version ${String(version)} (supported: ${SKILLS_SCHEMA_VERSION})`;
  }
  return undefined;
}

function safeApiPathRegex(
  path: string,
  pattern: string,
): { ok: true; re: RegExp } | { ok: false; error: string } {
  if (pattern.length > 200) {
    return { ok: false, error: `skills ${path}: apiPath pattern length exceeds 200` };
  }
  if (UNSAFE_NESTED_QUANTIFIER.test(pattern)) {
    return {
      ok: false,
      error: `skills ${path}: unsafe apiPath pattern (nested quantifier)`,
    };
  }
  try {
    return { ok: true, re: new RegExp(pattern) };
  } catch {
    return { ok: false, error: `skills ${path}: invalid apiPath regex: ${pattern.slice(0, 40)}` };
  }
}

function loadSuppressions(path: string): { ok: true; entries: SuppressionEntry[]; matchRes: Map<number, RegExp> } | { ok: false; error: string } {
  if (!existsSync(path)) {
    return { ok: true, entries: [], matchRes: new Map() };
  }
  const parsed = parseYamlFile(path);
  if (!parsed.ok) return parsed;
  const versionErr = checkVersion(path, parsed.raw);
  if (versionErr) return { ok: false, error: versionErr };

  const obj = parsed.raw as { suppressions?: unknown };
  if (obj.suppressions === undefined || obj.suppressions === null) {
    return { ok: true, entries: [], matchRes: new Map() };
  }
  if (!Array.isArray(obj.suppressions)) {
    return { ok: false, error: `skills ${path}: suppressions must be an array` };
  }

  const entries: SuppressionEntry[] = [];
  const matchRes = new Map<number, RegExp>();
  for (let i = 0; i < obj.suppressions.length; i++) {
    const item = obj.suppressions[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `skills ${path}: suppressions[${i}] must be a mapping` };
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.reason !== "string" || entry.reason.trim().length === 0) {
      return { ok: false, error: `skills ${path}: suppressions[${i}].reason is required` };
    }
    const hasFingerprint = entry.fingerprint !== undefined;
    const hasMatch = entry.match !== undefined;
    if (hasFingerprint === hasMatch) {
      return {
        ok: false,
        error: `skills ${path}: suppressions[${i}] needs exactly one of fingerprint or match`,
      };
    }

    if (hasFingerprint) {
      if (typeof entry.fingerprint !== "string" || !FINGERPRINT_RE.test(entry.fingerprint)) {
        return {
          ok: false,
          error: `skills ${path}: suppressions[${i}].fingerprint must be 64 hex chars`,
        };
      }
      const sup: SuppressionEntry = { fingerprint: entry.fingerprint, reason: entry.reason };
      if (typeof entry.by === "string") sup.by = entry.by;
      if (typeof entry.createdAt === "string") sup.createdAt = entry.createdAt;
      entries.push(sup);
      continue;
    }

    const match = entry.match;
    if (match === null || typeof match !== "object" || Array.isArray(match)) {
      return { ok: false, error: `skills ${path}: suppressions[${i}].match must be a mapping` };
    }
    const matchObj = match as Record<string, unknown>;
    if (typeof matchObj.ruleId !== "string" || matchObj.ruleId.length === 0) {
      return { ok: false, error: `skills ${path}: suppressions[${i}].match.ruleId is required` };
    }
    const supMatch: SuppressionMatch = { ruleId: matchObj.ruleId };
    if (matchObj.apiPath !== undefined) {
      if (typeof matchObj.apiPath !== "string") {
        return { ok: false, error: `skills ${path}: suppressions[${i}].match.apiPath must be a string` };
      }
      const safe = safeApiPathRegex(path, matchObj.apiPath);
      if (!safe.ok) return { ok: false, error: safe.error };
      supMatch.apiPath = matchObj.apiPath;
      matchRes.set(entries.length, safe.re);
    }
    const sup: SuppressionEntry = { match: supMatch, reason: entry.reason };
    if (typeof entry.by === "string") sup.by = entry.by;
    if (typeof entry.createdAt === "string") sup.createdAt = entry.createdAt;
    entries.push(sup);
  }
  return { ok: true, entries, matchRes };
}

function loadSeverities(path: string): { ok: true; entries: SeverityOverride[] } | { ok: false; error: string } {
  if (!existsSync(path)) {
    return { ok: true, entries: [] };
  }
  const parsed = parseYamlFile(path);
  if (!parsed.ok) return parsed;
  const versionErr = checkVersion(path, parsed.raw);
  if (versionErr) return { ok: false, error: versionErr };

  const obj = parsed.raw as { overrides?: unknown };
  if (obj.overrides === undefined || obj.overrides === null) {
    return { ok: true, entries: [] };
  }
  if (!Array.isArray(obj.overrides)) {
    return { ok: false, error: `skills ${path}: overrides must be an array` };
  }

  const entries: SeverityOverride[] = [];
  for (let i = 0; i < obj.overrides.length; i++) {
    const item = obj.overrides[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `skills ${path}: overrides[${i}] must be a mapping` };
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.ruleId !== "string" || entry.ruleId.length === 0) {
      return { ok: false, error: `skills ${path}: overrides[${i}].ruleId is required` };
    }
    if (typeof entry.severity !== "string" || !SEVERITIES.has(entry.severity as Severity)) {
      return {
        ok: false,
        error: `skills ${path}: overrides[${i}].severity must be error | warning | info`,
      };
    }
    entries.push({ ruleId: entry.ruleId, severity: entry.severity as Severity });
  }
  return { ok: true, entries };
}

function loadActiveDrafts(
  draftsDir: string,
  toolVersion: string,
): { ok: true; rules: Rule[] } | { ok: false; error: string } {
  if (!existsSync(draftsDir)) {
    return { ok: true, rules: [] };
  }
  let names: string[];
  try {
    names = readdirSync(draftsDir)
      .filter((n) => n.endsWith(".yaml") || n.endsWith(".yml") || n.endsWith(".json"))
      .sort();
  } catch (err) {
    return {
      ok: false,
      error: `skills ${draftsDir}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const rules: Rule[] = [];
  for (const name of names) {
    const path = join(draftsDir, name);
    const parsed = parseYamlFile(path);
    if (!parsed.ok) return { ok: false, error: parsed.error };
    if (parsed.raw === null || typeof parsed.raw !== "object" || Array.isArray(parsed.raw)) {
      return { ok: false, error: `skills ${path}: root must be a mapping` };
    }
    const raw = parsed.raw as Record<string, unknown>;
    if (raw.draft === true) continue;
    if (raw.draft !== undefined && raw.draft !== false) {
      return { ok: false, error: `skills ${path}: draft must be a boolean` };
    }

    const { draft: _draft, ...rest } = raw;
    const stamped = {
      ...rest,
      packId: "custom",
      packVersion: toolVersion,
    };
    const result = validateRule(stamped);
    if (!result.ok) {
      return {
        ok: false,
        error: `invalid draft rule in ${path}: ${result.issues.join("; ")}`,
      };
    }
    rules.push(result.rule);
  }
  return { ok: true, rules };
}

export function loadSkills(
  skillsDir: string,
  toolVersion: string,
): LoadSkillsResult {
  if (!existsSync(skillsDir)) {
    return { ok: true, skills: EMPTY_SKILLS };
  }

  const supPath = join(skillsDir, "suppressions.yaml");
  const sevPath = join(skillsDir, "severities.yaml");
  const draftsDir = join(skillsDir, "drafts");

  const sup = loadSuppressions(supPath);
  if (!sup.ok) return sup;

  const sev = loadSeverities(sevPath);
  if (!sev.ok) return sev;

  const drafts = loadActiveDrafts(draftsDir, toolVersion);
  if (!drafts.ok) return drafts;

  // Attach compiled match regexes for fingerprint/match application
  return {
    ok: true,
    skills: {
      suppressions: sup.entries,
      severities: sev.entries,
      activeDraftRules: drafts.rules,
    },
  };
}

/** Regexes for match suppressions, keyed by entry index (parallel to suppressions). */
export function compileMatchRegexes(
  suppressions: readonly SuppressionEntry[],
  origin: string,
): { ok: true; map: Map<number, RegExp> } | { ok: false; error: string } {
  const map = new Map<number, RegExp>();
  for (let i = 0; i < suppressions.length; i++) {
    const apiPath = suppressions[i]?.match?.apiPath;
    if (apiPath === undefined) continue;
    const safe = safeApiPathRegex(origin, apiPath);
    if (!safe.ok) return { ok: false, error: safe.error };
    map.set(i, safe.re);
  }
  return { ok: true, map };
}

function suppressionSubject(finding: Finding): string {
  if (finding.apiLocation !== undefined) {
    const space = finding.apiLocation.indexOf(" ");
    return space >= 0 ? finding.apiLocation.slice(space + 1) : finding.apiLocation;
  }
  return finding.location;
}

export function isSuppressedBySkills(
  finding: Finding,
  suppressions: readonly SuppressionEntry[],
  matchRegexes: ReadonlyMap<number, RegExp>,
): boolean {
  for (let i = 0; i < suppressions.length; i++) {
    const sup = suppressions[i]!;
    if (sup.fingerprint !== undefined) {
      if (sup.fingerprint === finding.fingerprint) return true;
      continue;
    }
    if (sup.match === undefined) continue;
    if (sup.match.ruleId !== finding.ruleId) continue;
    if (sup.match.apiPath === undefined) {
      return true;
    }
    const re = matchRegexes.get(i);
    if (re === undefined) continue;
    re.lastIndex = 0;
    if (re.test(suppressionSubject(finding))) return true;
  }
  return false;
}

export function applySkillSuppressions(
  findings: readonly Finding[],
  suppressions: readonly SuppressionEntry[],
  matchRegexes: ReadonlyMap<number, RegExp>,
): { visible: Finding[]; suppressed: number } {
  const visible: Finding[] = [];
  let suppressed = 0;
  for (const f of findings) {
    if (isSuppressedBySkills(f, suppressions, matchRegexes)) {
      suppressed += 1;
    } else {
      visible.push(f);
    }
  }
  return { visible, suppressed };
}

/**
 * Precedence: config rules > skills severities > pack default.
 * Config map wins on collision.
 */
export function mergeSeverityOverrides(
  skillsSeverities: readonly SeverityOverride[],
  configOverrides: ReadonlyMap<string, Severity>,
): Map<string, Severity> {
  const merged = new Map<string, Severity>();
  for (const o of skillsSeverities) {
    merged.set(o.ruleId, o.severity);
  }
  for (const [ruleId, severity] of configOverrides) {
    merged.set(ruleId, severity);
  }
  return merged;
}

export interface DraftListEntry {
  id: string;
  draft: boolean;
  severity?: string;
  path: string;
}

export interface SkillsInventory {
  suppressions: SuppressionEntry[];
  severities: SeverityOverride[];
  drafts: DraftListEntry[];
}

export function listSkills(
  skillsDir: string,
  toolVersion: string,
): { ok: true; inventory: SkillsInventory } | { ok: false; error: string } {
  const loaded = loadSkills(skillsDir, toolVersion);
  if (!loaded.ok) return loaded;

  const drafts: DraftListEntry[] = [];
  const draftsDir = join(skillsDir, "drafts");
  if (existsSync(draftsDir)) {
    let names: string[];
    try {
      names = readdirSync(draftsDir)
        .filter((n) => n.endsWith(".yaml") || n.endsWith(".yml") || n.endsWith(".json"))
        .sort();
    } catch (err) {
      return {
        ok: false,
        error: `skills ${draftsDir}: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    for (const name of names) {
      const path = join(draftsDir, name);
      const parsed = parseYamlFile(path);
      if (!parsed.ok) return { ok: false, error: parsed.error };
      if (parsed.raw === null || typeof parsed.raw !== "object" || Array.isArray(parsed.raw)) {
        return { ok: false, error: `skills ${path}: root must be a mapping` };
      }
      const raw = parsed.raw as Record<string, unknown>;
      const id =
        typeof raw.id === "string"
          ? raw.id
          : name.replace(/\.(ya?ml|json)$/, "");
      drafts.push({
        id,
        draft: raw.draft !== false,
        severity: typeof raw.severity === "string" ? raw.severity : undefined,
        path,
      });
    }
  }

  return {
    ok: true,
    inventory: {
      suppressions: loaded.skills.suppressions,
      severities: loaded.skills.severities,
      drafts,
    },
  };
}

export function promoteDraft(
  skillsDir: string,
  draftId: string,
): { ok: true; path: string } | { ok: false; error: string } {
  const draftsDir = join(skillsDir, "drafts");
  const candidates = [
    join(draftsDir, `${draftId}.yaml`),
    join(draftsDir, `${draftId}.yml`),
    join(draftsDir, `${draftId}.json`),
  ];
  const path = candidates.find((p) => existsSync(p));
  if (path === undefined) {
    return { ok: false, error: `draft not found: ${draftId} (in ${draftsDir})` };
  }
  const parsed = parseYamlFile(path);
  if (!parsed.ok) return { ok: false, error: parsed.error };
  if (parsed.raw === null || typeof parsed.raw !== "object" || Array.isArray(parsed.raw)) {
    return { ok: false, error: `skills ${path}: root must be a mapping` };
  }
  const raw = parsed.raw as Record<string, unknown>;
  if (raw.draft === false) {
    return { ok: true, path };
  }
  const updated = { ...raw, draft: false };
  try {
    writeFileSync(path, stringifyYaml(updated), "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `failed to promote draft: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  return { ok: true, path };
}
