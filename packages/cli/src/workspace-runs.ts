import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import type { Report } from "@ankaa/reporters";
import type { OperationState } from "./operations.js";

export interface WorkspaceAnalyzeRun {
  schemaVersion: 1;
  id: string;
  operation: "analyze";
  source: string;
  inputs: string[];
  state: OperationState;
  startedAt: string;
  finishedAt: string;
  failOn: string;
  error?: string;
  reportHash?: string;
  summary?: Report["summary"];
  report?: Report;
}

export type WorkspaceAnalyzeRunSummary = Omit<WorkspaceAnalyzeRun, "report">;

export interface ListAnalyzeRunsResult {
  ok: true;
  runs: WorkspaceAnalyzeRunSummary[];
  invalidFiles: number;
}

export type LoadAnalyzeRunResult =
  | { ok: true; run: WorkspaceAnalyzeRun }
  | { ok: false; error: string };

const RUN_ID_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTerminalState(value: unknown): value is OperationState {
  return value === "succeeded" || value === "failed" || value === "cancelled";
}

function isSummary(value: unknown): value is Report["summary"] {
  if (!isRecord(value)) return false;
  return (
    typeof value.error === "number" &&
    typeof value.warning === "number" &&
    typeof value.info === "number" &&
    typeof value.total === "number"
  );
}

function isAnalyzeRun(value: unknown): value is WorkspaceAnalyzeRun {
  if (!isRecord(value)) return false;
  if (
    value.schemaVersion !== 1 ||
    typeof value.id !== "string" ||
    value.operation !== "analyze" ||
    typeof value.source !== "string" ||
    !Array.isArray(value.inputs) ||
    !value.inputs.every((i) => typeof i === "string") ||
    !isTerminalState(value.state) ||
    typeof value.startedAt !== "string" ||
    typeof value.finishedAt !== "string" ||
    typeof value.failOn !== "string"
  ) {
    return false;
  }
  if (value.error !== undefined && typeof value.error !== "string") return false;
  if (value.reportHash !== undefined && typeof value.reportHash !== "string") return false;
  if (value.summary !== undefined && !isSummary(value.summary)) return false;
  if (value.report !== undefined && !isRecord(value.report)) return false;
  if (value.state === "succeeded" && (value.report === undefined || value.summary === undefined)) {
    return false;
  }
  return true;
}

export function analyzeRunsDir(cwd: string): string {
  return join(cwd, ".ankaa", "workspace", "runs");
}

function ensureRunsDir(cwd: string): void {
  const segments = [".ankaa", "workspace", "runs"];
  let current = cwd;
  for (const segment of segments) {
    current = join(current, segment);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`workspace path is not a real directory: ${current}`);
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
      mkdirSync(current);
    }
  }
}

export function validRunId(id: string): boolean {
  return RUN_ID_RE.test(id) && !id.includes("..");
}

export function saveAnalyzeRun(
  cwd: string,
  run: WorkspaceAnalyzeRun,
): { ok: true } | { ok: false; error: string } {
  const target = join(analyzeRunsDir(cwd), `${run.id}.json`);
  let temporaryPath: string | undefined;
  try {
    ensureRunsDir(cwd);
    try {
      const stat = lstatSync(target);
      if (stat.isSymbolicLink() || !stat.isFile()) {
        throw new Error("run file must be a regular file");
      }
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
    temporaryPath = `${target}.${process.pid}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(run, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporaryPath, target);
    return { ok: true };
  } catch (err) {
    if (temporaryPath !== undefined && existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath);
      } catch {
        // best-effort cleanup
      }
    }
    return {
      ok: false,
      error: `cannot save run: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export function listAnalyzeRuns(cwd: string): ListAnalyzeRunsResult | { ok: false; error: string } {
  const dir = analyzeRunsDir(cwd);
  if (!existsSync(dir)) {
    return { ok: true, runs: [], invalidFiles: 0 };
  }
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch (err) {
    return {
      ok: false,
      error: `cannot read runs directory: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  const runs: WorkspaceAnalyzeRunSummary[] = [];
  let invalidFiles = 0;
  for (const entry of entries.sort()) {
    if (!entry.endsWith(".json")) continue;
    const filePath = join(dir, entry);
    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
      if (!isAnalyzeRun(parsed)) {
        invalidFiles += 1;
        continue;
      }
      const { report: _report, ...summary } = parsed;
      runs.push(summary);
    } catch {
      invalidFiles += 1;
    }
  }
  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
  return { ok: true, runs, invalidFiles };
}

export function loadAnalyzeRun(cwd: string, id: string): LoadAnalyzeRunResult {
  if (!validRunId(id)) {
    return { ok: false, error: `invalid run id: ${id}` };
  }
  const filePath = join(analyzeRunsDir(cwd), `${id}.json`);
  if (!existsSync(filePath)) {
    return { ok: false, error: `run not found: ${id}` };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (err) {
    return {
      ok: false,
      error: `cannot read run: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!isAnalyzeRun(parsed)) {
    return { ok: false, error: `run file has an unsupported or invalid schema: ${id}` };
  }
  return { ok: true, run: parsed };
}
