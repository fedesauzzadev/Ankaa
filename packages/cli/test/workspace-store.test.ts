import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  acquireScanOrgWorkspaceLock,
  loadScanOrgWorkspace,
  saveScanOrgWorkspace,
  scanOrgWorkspaceFile,
  type ScanOrgWorkspace,
} from "../src/workspace-store.js";

const roots: string[] = [];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "ankaa-workspace-"));
  roots.push(root);
  return root;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("scan-org workspace persistence", () => {
  it("stores versioned history under the local Ankaa workspace", () => {
    const cwd = makeRoot();
    const filePath = scanOrgWorkspaceFile(cwd, "acme");
    const initial = loadScanOrgWorkspace(filePath, "acme");
    expect(initial).toMatchObject({
      ok: true,
      workspace: { schemaVersion: 1, org: "acme", latestRunId: null, runs: [] },
    });

    const workspace: ScanOrgWorkspace = {
      schemaVersion: 1,
      org: "acme",
      latestRunId: null,
      runs: [],
    };
    expect(saveScanOrgWorkspace(filePath, workspace)).toEqual({ ok: true });
    expect(loadScanOrgWorkspace(filePath, "acme")).toEqual({ ok: true, workspace });
  });

  it("rejects corrupt or incompatible history instead of resetting it", () => {
    const cwd = makeRoot();
    const filePath = scanOrgWorkspaceFile(cwd, "acme");
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, '{"schemaVersion":99,"org":"acme","runs":[]}', "utf8");
    expect(loadScanOrgWorkspace(filePath, "acme")).toEqual({
      ok: false,
      error: "workspace history has an unsupported or invalid schema",
    });
  });

  it("rejects a non-directory workspace parent", () => {
    const cwd = makeRoot();
    const workspaceEntry = join(cwd, ".ankaa");
    writeFileSync(workspaceEntry, "preserve this file", "utf8");
    const result = acquireScanOrgWorkspaceLock(scanOrgWorkspaceFile(cwd, "acme"));
    expect(result.ok).toBe(false);
    expect(readFileSync(workspaceEntry, "utf8")).toBe("preserve this file");
  });

  it("prevents two processes from mutating one organization history concurrently", () => {
    const historyPath = scanOrgWorkspaceFile(makeRoot(), "acme");
    const first = acquireScanOrgWorkspaceLock(historyPath);
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    expect(acquireScanOrgWorkspaceLock(historyPath)).toEqual({
      ok: false,
      error: "scan-org workspace is already in use by another process",
    });
    first.release();
    const second = acquireScanOrgWorkspaceLock(historyPath);
    expect(second.ok).toBe(true);
    if (second.ok) second.release();
  });
});
