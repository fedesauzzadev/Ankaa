import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import { validateRule, type Finding, type Severity } from "@ankaa/core";
import { resolveFingerprint } from "./fix.js";
import {
  DEFAULT_SKILLS_DIR,
  SKILLS_SCHEMA_VERSION,
  isValidExpiryDate,
  type SeverityOverride,
  type SuppressionEntry,
} from "./skills.js";

export type FeedbackDecision =
  "false_positive" | "wontfix" | "severity_change" | "confirm" | "suggest_rule";

const DECISIONS = new Set<FeedbackDecision>([
  "false_positive",
  "wontfix",
  "severity_change",
  "confirm",
  "suggest_rule",
]);

const SEVERITIES = new Set<Severity>(["error", "warning", "info"]);
const FINGERPRINT_RE = /^[0-9a-f]{8,64}$/;

export interface FeedbackItem {
  fingerprint: string;
  decision: FeedbackDecision;
  comment?: string;
  severity?: Severity;
  /** Waiver expiry (YYYY-MM-DD). Only applies to false_positive|wontfix. */
  expires?: string;
  /** Waiver owner. Only applies to false_positive|wontfix. */
  owner?: string;
  draft?: Record<string, unknown>;
}

export interface FeedbackFile {
  reportHash?: string;
  items: FeedbackItem[];
}

export type LoadFeedbackResult =
  { ok: true; feedback: FeedbackFile } | { ok: false; error: string };

export function loadReportFile(
  path: string,
): { ok: true; report: Record<string, unknown> } | { ok: false; error: string } {
  if (!existsSync(path)) {
    return { ok: false, error: `report not found: ${path}` };
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `report ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  try {
    const raw = JSON.parse(text) as unknown;
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      return { ok: false, error: `report ${path}: root must be an object` };
    }
    return { ok: true, report: raw as Record<string, unknown> };
  } catch (err) {
    return {
      ok: false,
      error: `report ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function loadFeedbackFile(path: string): LoadFeedbackResult {
  if (!existsSync(path)) {
    return { ok: false, error: `feedback not found: ${path}` };
  }
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (err) {
    return {
      ok: false,
      error: `feedback ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (err) {
    return {
      ok: false,
      error: `feedback ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `feedback ${path}: root must be an object` };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.reportHash !== undefined && typeof obj.reportHash !== "string") {
    return { ok: false, error: `feedback ${path}: reportHash must be a string` };
  }
  if (!Array.isArray(obj.items)) {
    return { ok: false, error: `feedback ${path}: items must be an array` };
  }

  const items: FeedbackItem[] = [];
  for (let i = 0; i < obj.items.length; i++) {
    const item = obj.items[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { ok: false, error: `feedback ${path}: items[${i}] must be an object` };
    }
    const entry = item as Record<string, unknown>;
    if (typeof entry.fingerprint !== "string" || !FINGERPRINT_RE.test(entry.fingerprint)) {
      return {
        ok: false,
        error: `feedback ${path}: items[${i}].fingerprint must be 8-64 hex chars (a unique prefix is enough)`,
      };
    }
    if (typeof entry.decision !== "string" || !DECISIONS.has(entry.decision as FeedbackDecision)) {
      return {
        ok: false,
        error: `feedback ${path}: items[${i}].decision must be false_positive | wontfix | severity_change | confirm | suggest_rule`,
      };
    }
    const decision = entry.decision as FeedbackDecision;
    const fb: FeedbackItem = {
      fingerprint: entry.fingerprint,
      decision,
    };
    if (entry.comment !== undefined) {
      if (typeof entry.comment !== "string") {
        return { ok: false, error: `feedback ${path}: items[${i}].comment must be a string` };
      }
      fb.comment = entry.comment;
    }
    if (entry.expires !== undefined) {
      if (typeof entry.expires !== "string" || !isValidExpiryDate(entry.expires)) {
        return {
          ok: false,
          error: `feedback ${path}: items[${i}].expires must be YYYY-MM-DD (got ${String(entry.expires).slice(0, 20)})`,
        };
      }
      fb.expires = entry.expires;
    }
    if (entry.owner !== undefined) {
      if (typeof entry.owner !== "string" || entry.owner.trim().length === 0) {
        return {
          ok: false,
          error: `feedback ${path}: items[${i}].owner must be a non-empty string`,
        };
      }
      fb.owner = entry.owner;
    }
    if (decision === "severity_change") {
      if (typeof entry.severity !== "string" || !SEVERITIES.has(entry.severity as Severity)) {
        return {
          ok: false,
          error: `feedback ${path}: items[${i}].severity must be error | warning | info`,
        };
      }
      fb.severity = entry.severity as Severity;
    }
    if (decision === "suggest_rule") {
      if (entry.draft === null || typeof entry.draft !== "object" || Array.isArray(entry.draft)) {
        return {
          ok: false,
          error: `feedback ${path}: items[${i}].draft must be a mapping`,
        };
      }
      fb.draft = entry.draft as Record<string, unknown>;
    }
    items.push(fb);
  }

  const feedback: FeedbackFile = { items };
  if (typeof obj.reportHash === "string") feedback.reportHash = obj.reportHash;
  return { ok: true, feedback };
}

function extractReportFindings(report: Record<string, unknown>): Map<string, Finding> {
  const map = new Map<string, Finding>();
  const findings = report.findings;
  if (!Array.isArray(findings)) return map;
  for (const item of findings) {
    if (item === null || typeof item !== "object") continue;
    const f = item as Partial<Finding>;
    if (typeof f.fingerprint === "string") {
      map.set(f.fingerprint, f as Finding);
    }
  }
  return map;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function suppressionKey(entry: SuppressionEntry): string {
  if (entry.fingerprint !== undefined) return `fp:${entry.fingerprint}`;
  const m = entry.match!;
  return `m:${m.ruleId}|${m.apiPath ?? ""}`;
}

function sortSuppressions(list: SuppressionEntry[]): SuppressionEntry[] {
  return [...list].sort((a, b) => cmp(suppressionKey(a), suppressionKey(b)));
}

function serializeSuppressions(list: SuppressionEntry[]): string {
  const ordered = list.map((e) => {
    const out: Record<string, unknown> = {};
    if (e.fingerprint !== undefined) out.fingerprint = e.fingerprint;
    if (e.match !== undefined) {
      const m: Record<string, unknown> = { ruleId: e.match.ruleId };
      if (e.match.apiPath !== undefined) m.apiPath = e.match.apiPath;
      out.match = m;
    }
    out.reason = e.reason;
    if (e.by !== undefined) out.by = e.by;
    if (e.owner !== undefined) out.owner = e.owner;
    if (e.expires !== undefined) out.expires = e.expires;
    if (e.createdAt !== undefined) out.createdAt = e.createdAt;
    return out;
  });
  return stringifyYaml({
    version: SKILLS_SCHEMA_VERSION,
    suppressions: ordered,
  });
}

function serializeSeverities(list: SeverityOverride[]): string {
  const sorted = [...list].sort((a, b) => cmp(a.ruleId, b.ruleId));
  return stringifyYaml({
    version: SKILLS_SCHEMA_VERSION,
    overrides: sorted.map((o) => ({
      ruleId: o.ruleId,
      severity: o.severity,
    })),
  });
}

export function loadExistingSuppressions(path: string): SuppressionEntry[] {
  if (!existsSync(path)) return [];
  try {
    const raw = parseYaml(readFileSync(path, "utf8")) as {
      suppressions?: unknown;
    } | null;
    if (!raw || !Array.isArray(raw.suppressions)) return [];
    return raw.suppressions.filter(
      (e): e is SuppressionEntry =>
        e !== null &&
        typeof e === "object" &&
        !Array.isArray(e) &&
        typeof (e as SuppressionEntry).reason === "string",
    );
  } catch {
    return [];
  }
}

export function loadExistingSeverities(path: string): SeverityOverride[] {
  if (!existsSync(path)) return [];
  try {
    const raw = parseYaml(readFileSync(path, "utf8")) as {
      overrides?: unknown;
    } | null;
    if (!raw || !Array.isArray(raw.overrides)) return [];
    return raw.overrides.filter(
      (e): e is SeverityOverride =>
        e !== null &&
        typeof e === "object" &&
        !Array.isArray(e) &&
        typeof (e as SeverityOverride).ruleId === "string" &&
        SEVERITIES.has((e as SeverityOverride).severity),
    );
  } catch {
    return [];
  }
}

export interface LearnPatchResult {
  suppressions: SuppressionEntry[];
  severities: SeverityOverride[];
  draftsToWrite: Array<{ id: string; content: string }>;
  confirmCount: number;
  warnings: string[];
}

export function buildLearnPatch(input: {
  report: Record<string, unknown>;
  feedback: FeedbackFile;
  existingSuppressions: SuppressionEntry[];
  existingSeverities: SeverityOverride[];
  toolVersion: string;
}): { ok: true; patch: LearnPatchResult } | { ok: false; error: string } {
  const findingsByFp = extractReportFindings(input.report);
  const suppressions = [...input.existingSuppressions];
  const severities = [...input.existingSeverities];
  const draftsToWrite: Array<{ id: string; content: string }> = [];
  const warnings: string[] = [];
  let confirmCount = 0;

  // Index suppressions for upsert
  const supIndex = new Map<string, number>();
  suppressions.forEach((s, i) => supIndex.set(suppressionKey(s), i));
  const sevIndex = new Map<string, number>();
  severities.forEach((s, i) => sevIndex.set(s.ruleId, i));

  for (let n = 0; n < input.feedback.items.length; n++) {
    const item = input.feedback.items[n]!;
    if (item.expires !== undefined && !isValidExpiryDate(item.expires)) {
      return {
        ok: false,
        error: `items[${n}].expires must be YYYY-MM-DD (got ${item.expires.slice(0, 20)})`,
      };
    }
    if (
      item.owner !== undefined &&
      (typeof item.owner !== "string" || item.owner.trim().length === 0)
    ) {
      return { ok: false, error: `items[${n}].owner must be a non-empty string` };
    }
    // Short prefixes resolve against the report; files always store the full
    // fingerprint. A full fingerprint absent from the report keeps the legacy
    // behavior (warning + apply); an unresolvable prefix is an honest error
    // (a prefix can never match at analyze time, so storing it would be a lie).
    const resolved = resolveFingerprint([...findingsByFp.keys()], item.fingerprint);
    let fingerprint: string;
    if (resolved.ok) {
      fingerprint = resolved.fingerprint;
    } else if (item.fingerprint.length === 64) {
      fingerprint = item.fingerprint;
    } else {
      return { ok: false, error: resolved.error };
    }
    const finding = findingsByFp.get(fingerprint);
    if (finding === undefined) {
      warnings.push(`fingerprint ${fingerprint} not in report (possible stale feedback)`);
    }

    if (
      (item.expires !== undefined || item.owner !== undefined) &&
      item.decision !== "false_positive" &&
      item.decision !== "wontfix"
    ) {
      return {
        ok: false,
        error: `expires/owner only apply to false_positive|wontfix (got ${item.decision})`,
      };
    }

    if (item.decision === "confirm") {
      confirmCount += 1;
      continue;
    }

    if (item.decision === "false_positive" || item.decision === "wontfix") {
      const reason =
        item.comment !== undefined && item.comment.trim().length > 0
          ? item.comment
          : item.decision === "false_positive"
            ? "false_positive"
            : "wontfix";
      const key = `fp:${fingerprint}`;
      const existing = supIndex.get(key);
      const entry: SuppressionEntry = {
        fingerprint,
        reason,
      };
      if (item.expires !== undefined) entry.expires = item.expires;
      if (item.owner !== undefined) entry.owner = item.owner;
      if (existing !== undefined) {
        suppressions[existing] = entry;
      } else {
        supIndex.set(key, suppressions.length);
        suppressions.push(entry);
      }
      continue;
    }

    if (item.decision === "severity_change") {
      if (finding === undefined) {
        return {
          ok: false,
          error: `severity_change requires fingerprint present in report (unknown ruleId): ${fingerprint}`,
        };
      }
      if (item.severity === undefined) {
        return { ok: false, error: `severity_change missing severity` };
      }
      const ruleId = finding.ruleId;
      const existing = sevIndex.get(ruleId);
      const entry: SeverityOverride = {
        ruleId,
        severity: item.severity,
      };
      if (existing !== undefined) {
        severities[existing] = entry;
      } else {
        sevIndex.set(ruleId, severities.length);
        severities.push(entry);
      }
      continue;
    }

    if (item.decision === "suggest_rule") {
      const draft = item.draft!;
      const id = draft.id;
      if (typeof id !== "string" || !/^[A-Z][A-Z0-9]*-\d{3}$/.test(id)) {
        return {
          ok: false,
          error: `suggest_rule draft.id must match PREFIX-NNN (got ${String(id)})`,
        };
      }
      const { draft: _d, ...rest } = draft;
      const stamped: Record<string, unknown> = {
        ...rest,
        packId: "custom",
        packVersion: input.toolVersion,
      };
      // strip empty source.url for validation (allowed only as draft metadata)
      if (
        stamped.source !== null &&
        stamped.source !== undefined &&
        typeof stamped.source === "object" &&
        !Array.isArray(stamped.source)
      ) {
        const src = stamped.source as Record<string, unknown>;
        if (src.url === "") {
          const { url: _url, ...srcRest } = src;
          stamped.source = srcRest;
        }
      }
      const validated = validateRule(stamped);
      if (!validated.ok) {
        return {
          ok: false,
          error: `suggest_rule draft invalid: ${validated.issues.join("; ")}`,
        };
      }
      // serialize with draft: true and original structure (including empty source.url if present)
      const toWrite: Record<string, unknown> = {
        id,
        draft: true,
        category: rest.category,
        severity: rest.severity,
        message: rest.message,
        when: rest.when,
      };
      if (rest.source !== undefined) toWrite.source = rest.source;
      if (rest.fix !== undefined) toWrite.fix = rest.fix;
      draftsToWrite.push({
        id,
        content: stringifyYaml(toWrite),
      });
      continue;
    }
  }

  return {
    ok: true,
    patch: {
      suppressions: sortSuppressions(suppressions),
      severities: [...severities].sort((a, b) => cmp(a.ruleId, b.ruleId)),
      draftsToWrite,
      confirmCount,
      warnings,
    },
  };
}

export interface LearnWriteResult {
  written: string[];
  dryRun: boolean;
}

export function writeLearnPatch(
  skillsDir: string,
  patch: LearnPatchResult,
  dryRun: boolean,
): LearnWriteResult {
  const written: string[] = [];
  if (dryRun) {
    written.push(join(skillsDir, "suppressions.yaml"));
    written.push(join(skillsDir, "severities.yaml"));
    for (const d of patch.draftsToWrite) {
      written.push(join(skillsDir, "drafts", `${d.id}.yaml`));
    }
    return { written, dryRun: true };
  }

  mkdirSync(skillsDir, { recursive: true });
  const supPath = join(skillsDir, "suppressions.yaml");
  const sevPath = join(skillsDir, "severities.yaml");
  writeFileSync(supPath, serializeSuppressions(patch.suppressions), "utf8");
  written.push(supPath);
  writeFileSync(sevPath, serializeSeverities(patch.severities), "utf8");
  written.push(sevPath);
  if (patch.draftsToWrite.length > 0) {
    const draftsDir = join(skillsDir, "drafts");
    mkdirSync(draftsDir, { recursive: true });
    for (const d of patch.draftsToWrite) {
      const path = join(draftsDir, `${d.id}.yaml`);
      writeFileSync(path, d.content, "utf8");
      written.push(path);
    }
  }
  return { written, dryRun: false };
}

export function resolveLearnSkillsDir(
  flagPath: string | undefined,
  configSkillsDir: string | undefined,
  configDir: string | undefined,
  cwd: string,
): string {
  const raw = flagPath ?? configSkillsDir ?? DEFAULT_SKILLS_DIR;
  if (raw.startsWith("/") || /^[A-Za-z]:[\\/]/.test(raw)) return raw;
  const base = flagPath === undefined && configSkillsDir !== undefined ? (configDir ?? cwd) : cwd;
  return join(base, raw);
}

export function ensureParentDir(path: string): void {
  mkdirSync(dirname(path), { recursive: true });
}
