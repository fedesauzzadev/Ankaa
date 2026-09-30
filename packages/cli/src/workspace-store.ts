import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import type { OrgReport, RepoScan } from "./scan.js";

export interface ScanOrgCachedRepo {
  revision: string;
  analysisFingerprint: string;
  scan: RepoScan;
}

export interface ScanOrgWorkspaceRun {
  id: string;
  createdAt: string;
  status: "running" | "completed" | "failed";
  analysisFingerprint: string;
  repos: Record<string, ScanOrgCachedRepo>;
  report?: OrgReport;
}

export interface ScanOrgWorkspace {
  schemaVersion: 1;
  org: string;
  latestRunId: string | null;
  runs: ScanOrgWorkspaceRun[];
}

export type LoadScanOrgWorkspaceResult =
  { ok: true; workspace: ScanOrgWorkspace } | { ok: false; error: string };

export function scanOrgWorkspaceFile(cwd: string, org: string): string {
  const orgKey = createHash("sha256").update(org.toLowerCase()).digest("hex");
  return join(cwd, ".apigovscan", "workspace", "orgs", orgKey, "history.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isRepoScan(value: unknown): value is RepoScan {
  if (!isRecord(value)) return false;
  return (
    typeof value.name === "string" &&
    typeof value.specs === "number" &&
    typeof value.findings === "number" &&
    typeof value.errors === "number" &&
    typeof value.warnings === "number" &&
    typeof value.infos === "number" &&
    typeof value.score === "number" &&
    typeof value.grade === "string" &&
    typeof value.coverage === "number"
  );
}

function isWorkspaceRun(value: unknown): value is ScanOrgWorkspaceRun {
  if (!isRecord(value) || !isRecord(value.repos)) return false;
  const reposAreValid = Object.values(value.repos).every((repo) => {
    if (!isRecord(repo)) return false;
    return (
      typeof repo.revision === "string" &&
      typeof repo.analysisFingerprint === "string" &&
      isRepoScan(repo.scan)
    );
  });
  return (
    typeof value.id === "string" &&
    typeof value.createdAt === "string" &&
    (value.status === "running" || value.status === "completed" || value.status === "failed") &&
    typeof value.analysisFingerprint === "string" &&
    reposAreValid &&
    (value.report === undefined || isRecord(value.report))
  );
}

function isWorkspace(value: unknown, org: string): value is ScanOrgWorkspace {
  if (!isRecord(value)) return false;
  return (
    value.schemaVersion === 1 &&
    value.org === org &&
    (value.latestRunId === null || typeof value.latestRunId === "string") &&
    Array.isArray(value.runs) &&
    value.runs.every(isWorkspaceRun) &&
    (value.latestRunId === null || value.runs.some((run) => run.id === value.latestRunId))
  );
}

function ensureWorkspaceParent(historyPath: string): void {
  const workspaceRoot = resolve(dirname(historyPath), "..", "..", "..", "..");
  const directories = [".apigovscan", "workspace", "orgs", basename(dirname(historyPath))];
  let current = workspaceRoot;
  for (const directory of directories) {
    current = join(current, directory);
    try {
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || !stat.isDirectory()) {
        throw new Error(`workspace path is not a real directory: ${current}`);
      }
    } catch (err) {
      if (errorCode(err) !== "ENOENT") throw err;
      mkdirSync(current);
    }
  }
}

function ensureRegularHistoryFile(filePath: string): void {
  try {
    const stat = lstatSync(filePath);
    if (stat.isSymbolicLink() || !stat.isFile()) {
      throw new Error("workspace history must be a regular file");
    }
  } catch (err) {
    if (errorCode(err) !== "ENOENT") throw err;
  }
}

export function loadScanOrgWorkspace(filePath: string, org: string): LoadScanOrgWorkspaceResult {
  try {
    ensureWorkspaceParent(filePath);
    ensureRegularHistoryFile(filePath);
  } catch (err) {
    return {
      ok: false,
      error: `cannot access workspace history: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!existsSync(filePath)) {
    return {
      ok: true,
      workspace: { schemaVersion: 1, org, latestRunId: null, runs: [] },
    };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  } catch (err) {
    return {
      ok: false,
      error: `cannot read workspace history: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (!isWorkspace(parsed, org)) {
    return { ok: false, error: "workspace history has an unsupported or invalid schema" };
  }
  return { ok: true, workspace: parsed };
}

let temporaryFileSequence = 0;

export function saveScanOrgWorkspace(
  filePath: string,
  workspace: ScanOrgWorkspace,
): { ok: true } | { ok: false; error: string } {
  let temporaryPath: string | undefined;
  try {
    ensureWorkspaceParent(filePath);
    ensureRegularHistoryFile(filePath);
    temporaryFileSequence += 1;
    temporaryPath = `${filePath}.${process.pid}.${temporaryFileSequence}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(workspace, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    renameSync(temporaryPath, filePath);
    return { ok: true };
  } catch (err) {
    let cleanupError: string | undefined;
    if (temporaryPath !== undefined && existsSync(temporaryPath)) {
      try {
        unlinkSync(temporaryPath);
      } catch (cleanup) {
        cleanupError = cleanup instanceof Error ? cleanup.message : String(cleanup);
      }
    }
    return {
      ok: false,
      error:
        `cannot save workspace history: ${err instanceof Error ? err.message : String(err)}` +
        (cleanupError === undefined ? "" : `; cannot remove temporary file: ${cleanupError}`),
    };
  }
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return !(err instanceof Error && "code" in err && err.code === "ESRCH");
  }
}

function errorCode(error: unknown): string | undefined {
  return error instanceof Error && "code" in error && typeof error.code === "string"
    ? error.code
    : undefined;
}

export type AcquireWorkspaceLockResult =
  { ok: true; release: () => void } | { ok: false; error: string };

export function acquireScanOrgWorkspaceLock(historyPath: string): AcquireWorkspaceLockResult {
  const lockPath = `${historyPath}.lock`;
  try {
    ensureWorkspaceParent(historyPath);
    ensureRegularHistoryFile(lockPath);
    const lockContent = `${JSON.stringify({ pid: process.pid, createdAt: new Date().toISOString() })}\n`;
    try {
      writeFileSync(lockPath, lockContent, { encoding: "utf8", flag: "wx" });
    } catch (err) {
      if (errorCode(err) !== "EEXIST") throw err;
      const recoveryPath = `${lockPath}.recovery`;
      try {
        writeFileSync(recoveryPath, `${process.pid}\n`, { encoding: "utf8", flag: "wx" });
      } catch (recoveryError) {
        if (errorCode(recoveryError) !== "EEXIST") throw recoveryError;
        return {
          ok: false,
          error: "scan-org workspace is already in use by another process",
        };
      }
      try {
        let owner: unknown;
        try {
          owner = JSON.parse(readFileSync(lockPath, "utf8")) as unknown;
        } catch (readError) {
          if (errorCode(readError) === "ENOENT") {
            owner = undefined;
          } else {
            return {
              ok: false,
              error:
                "scan-org workspace lock is unreadable; inspect and remove it if no scan is running",
            };
          }
        }
        if (owner !== undefined) {
          const pid =
            isRecord(owner) && typeof owner.pid === "number" && Number.isInteger(owner.pid)
              ? owner.pid
              : undefined;
          if (pid === undefined) {
            return {
              ok: false,
              error:
                "scan-org workspace lock is unreadable; inspect and remove it if no scan is running",
            };
          }
          if (processExists(pid)) {
            return {
              ok: false,
              error: "scan-org workspace is already in use by another process",
            };
          }
          unlinkSync(lockPath);
        }
        try {
          writeFileSync(lockPath, lockContent, { encoding: "utf8", flag: "wx" });
        } catch (createError) {
          if (errorCode(createError) === "EEXIST") {
            return {
              ok: false,
              error: "scan-org workspace is already in use by another process",
            };
          }
          throw createError;
        }
      } finally {
        if (existsSync(recoveryPath)) unlinkSync(recoveryPath);
      }
    }
    return {
      ok: true,
      release: () => {
        unlinkSync(lockPath);
      },
    };
  } catch (err) {
    return {
      ok: false,
      error: `cannot lock scan-org workspace: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}
