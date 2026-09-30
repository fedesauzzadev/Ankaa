import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type { Finding } from "@ankaa/core";

export const DEFAULT_BASELINE_PATH = ".ankaa/baseline.json";
export const BASELINE_SCHEMA_VERSION = 1;

export interface BaselineFile {
  version: number;
  createdAt: string;
  tool: { name: "ankaa"; version: string };
  engineVersion: string;
  packs: Array<{ id: string; version: string }>;
  inputs: Array<{ path: string; sha256: string }>;
  fingerprints: string[];
  counts: { error: number; warning: number; info: number; total: number };
}

export interface BaselineComplaints {
  warnings: string[];
  fatal?: string;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function countBySeverity(findings: readonly Finding[]): BaselineFile["counts"] {
  const counts = { error: 0, warning: 0, info: 0, total: findings.length };
  for (const f of findings) {
    if (f.severity === "error") counts.error += 1;
    else if (f.severity === "warning") counts.warning += 1;
    else if (f.severity === "info") counts.info += 1;
  }
  return counts;
}

export function resolveBaselinePath(
  flagPath: string | undefined,
  configPath: string | undefined,
  configDir: string | undefined,
  cwd: string,
): string {
  const raw = flagPath ?? configPath ?? DEFAULT_BASELINE_PATH;
  if (isAbsolute(raw)) return raw;
  // flag path → cwd; config path → config file dir
  const base = flagPath === undefined && configPath !== undefined ? (configDir ?? cwd) : cwd;
  return resolve(base, raw);
}

export function buildBaseline(input: {
  findings: readonly Finding[];
  inputs: ReadonlyArray<{ path: string; sha256: string }>;
  packs: ReadonlyArray<{ id: string; version: string }>;
  toolVersion: string;
  engineVersion: string;
  createdAt?: string;
}): BaselineFile {
  const fingerprints = [...new Set(input.findings.map((f) => f.fingerprint))].sort(cmp);
  return {
    version: BASELINE_SCHEMA_VERSION,
    createdAt: input.createdAt ?? new Date().toISOString(),
    tool: { name: "ankaa", version: input.toolVersion },
    engineVersion: input.engineVersion,
    packs: [...input.packs]
      .map((p) => ({ id: p.id, version: p.version }))
      .sort((a, b) => cmp(a.id, b.id)),
    inputs: input.inputs.map((i) => ({ path: i.path, sha256: i.sha256 })),
    fingerprints,
    counts: countBySeverity(input.findings),
  };
}

export function serializeBaseline(baseline: BaselineFile): string {
  // Stable key order + trailing newline (canonical top-level keys).
  const ordered = {
    version: baseline.version,
    createdAt: baseline.createdAt,
    tool: baseline.tool,
    engineVersion: baseline.engineVersion,
    packs: baseline.packs,
    inputs: baseline.inputs,
    fingerprints: baseline.fingerprints,
    counts: baseline.counts,
  };
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

export function writeBaselineFile(
  path: string,
  baseline: BaselineFile,
  force: boolean,
): { ok: true } | { ok: false; error: string } {
  if (existsSync(path)) {
    if (!force) {
      return {
        ok: false,
        error: `baseline already exists: ${path} (pass --force to overwrite)`,
      };
    }
    try {
      copyFileSync(path, `${path}.bak`);
    } catch (err) {
      return {
        ok: false,
        error: `failed to backup baseline: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }
  try {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, serializeBaseline(baseline), "utf8");
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: `failed to write baseline: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function loadBaselineFile(
  path: string,
): { ok: true; baseline: BaselineFile } | { ok: false; error: string } {
  if (!existsSync(path)) {
    return {
      ok: false,
      error: `baseline not found: ${path} (run --write-baseline first)`,
    };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    return {
      ok: false,
      error: `baseline ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `baseline ${path}: root must be an object` };
  }
  const obj = raw as Record<string, unknown>;
  if (typeof obj.version !== "number") {
    return { ok: false, error: `baseline ${path}: missing numeric "version"` };
  }
  if (obj.version !== BASELINE_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `baseline ${path}: unsupported version ${obj.version} (supported: ${BASELINE_SCHEMA_VERSION})`,
    };
  }
  if (!Array.isArray(obj.fingerprints)) {
    return {
      ok: false,
      error: `baseline ${path}: "fingerprints" must be an array`,
    };
  }
  const fingerprints = obj.fingerprints.filter((f): f is string => typeof f === "string");
  if (fingerprints.length !== obj.fingerprints.length) {
    return {
      ok: false,
      error: `baseline ${path}: "fingerprints" must be strings`,
    };
  }
  const inputs: Array<{ path: string; sha256: string }> = [];
  if (Array.isArray(obj.inputs)) {
    for (const item of obj.inputs) {
      if (
        item === null ||
        typeof item !== "object" ||
        typeof (item as { path?: unknown }).path !== "string" ||
        typeof (item as { sha256?: unknown }).sha256 !== "string"
      ) {
        return {
          ok: false,
          error: `baseline ${path}: "inputs" entries must have path and sha256 strings`,
        };
      }
      const i = item as { path: string; sha256: string };
      inputs.push({ path: i.path, sha256: i.sha256 });
    }
  }
  const tool = obj.tool as { name?: unknown; version?: unknown } | undefined;
  const packsRaw = Array.isArray(obj.packs) ? obj.packs : [];
  const packs: Array<{ id: string; version: string }> = [];
  for (const p of packsRaw) {
    if (
      p !== null &&
      typeof p === "object" &&
      typeof (p as { id?: unknown }).id === "string" &&
      typeof (p as { version?: unknown }).version === "string"
    ) {
      const pp = p as { id: string; version: string };
      packs.push({ id: pp.id, version: pp.version });
    }
  }
  const countsRaw = (obj.counts ?? {}) as Record<string, unknown>;
  const counts = {
    error: typeof countsRaw.error === "number" ? countsRaw.error : 0,
    warning: typeof countsRaw.warning === "number" ? countsRaw.warning : 0,
    info: typeof countsRaw.info === "number" ? countsRaw.info : 0,
    total: typeof countsRaw.total === "number" ? countsRaw.total : 0,
  };
  const baseline: BaselineFile = {
    version: BASELINE_SCHEMA_VERSION,
    createdAt: typeof obj.createdAt === "string" ? obj.createdAt : new Date(0).toISOString(),
    tool: {
      name: "ankaa",
      version: tool && typeof tool.version === "string" ? tool.version : "0.0.0-dev",
    },
    engineVersion: typeof obj.engineVersion === "string" ? obj.engineVersion : "0.0.0-dev",
    packs,
    inputs,
    fingerprints: [...fingerprints].sort(cmp),
    counts,
  };
  return { ok: true, baseline };
}

export function fingerprintSet(baseline: BaselineFile): Set<string> {
  return new Set(baseline.fingerprints);
}

export function filterFindings(
  findings: readonly Finding[],
  set: ReadonlySet<string>,
): { visible: Finding[]; suppressed: Finding[] } {
  const visible: Finding[] = [];
  const suppressed: Finding[] = [];
  for (const f of findings) {
    if (set.has(f.fingerprint)) suppressed.push(f);
    else visible.push(f);
  }
  return { visible, suppressed };
}

export function checkInputHashes(
  baseline: BaselineFile,
  currentInputs: ReadonlyArray<{ path: string; sha256: string }>,
  mode: "warn" | "strict" | "ignore",
): BaselineComplaints {
  const warnings: string[] = [];
  const currentByPath = new Map(currentInputs.map((i) => [i.path, i.sha256]));
  const baselinePaths = new Set(baseline.inputs.map((i) => i.path));
  const currentPaths = new Set(currentInputs.map((i) => i.path));

  if (
    baselinePaths.size !== currentPaths.size ||
    [...baselinePaths].some((p) => !currentPaths.has(p))
  ) {
    warnings.push("baseline inputs differ");
  }

  let fatal: string | undefined;
  for (const entry of baseline.inputs) {
    const now = currentByPath.get(entry.path);
    if (now === undefined) {
      warnings.push(`baseline entry unused: ${entry.path}`);
      continue;
    }
    if (now !== entry.sha256) {
      const msg = `baseline inputHash mismatch for ${entry.path} (spec changed)`;
      if (mode === "strict") {
        fatal = msg;
      } else if (mode === "warn") {
        warnings.push(msg);
      }
    }
  }

  return fatal === undefined ? { warnings } : { warnings, fatal };
}
