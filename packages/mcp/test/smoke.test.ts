import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_FINDINGS,
  SandboxError,
  mcpPackageId,
  resolveSandboxPath,
  truncateAnalyzePayload,
} from "../src/index.js";

describe("@ankaa/mcp", () => {
  it("exposes package id", () => {
    expect(mcpPackageId()).toBe("@ankaa/mcp");
  });
});

describe("resolveSandboxPath", () => {
  const cwd = "C:\\repo\\project".replace(/\\/g, "/");

  it("allows paths under cwd", () => {
    const resolved = resolveSandboxPath(cwd, "specs/openapi.yaml");
    expect(resolved.replace(/\\/g, "/")).toContain("specs/openapi.yaml");
  });

  it("rejects parent escapes", () => {
    expect(() => resolveSandboxPath(cwd, "../outside.yaml")).toThrow(SandboxError);
  });

  it("rejects absolute paths outside cwd", () => {
    expect(() => resolveSandboxPath(cwd, "/etc/passwd")).toThrow(SandboxError);
  });

  it("rejects stdin dash", () => {
    expect(() => resolveSandboxPath(cwd, "-")).toThrow(SandboxError);
  });

  it("keeps the lexical path through an inside symlink (CLI parity)", () => {
    const root = mkdtempSync(join(tmpdir(), "ankaa-sb-"));
    try {
      const realDir = join(root, "real");
      mkdirSync(realDir);
      writeFileSync(join(realDir, "openapi.yaml"), "openapi: 3.0.3\n");
      try {
        symlinkSync(realDir, join(root, "link"), "junction");
      } catch {
        return; // runner without symlink privileges
      }
      const resolved = resolveSandboxPath(root, "link/openapi.yaml").replace(/\\/g, "/");
      expect(resolved).toContain("link/openapi.yaml");
      expect(resolved).not.toContain("/real/openapi.yaml");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("rejects symlinks that escape cwd", () => {
    const root = mkdtempSync(join(tmpdir(), "ankaa-sb-"));
    const outside = mkdtempSync(join(tmpdir(), "ankaa-out-"));
    try {
      writeFileSync(join(outside, "openapi.yaml"), "openapi: 3.0.3\n");
      try {
        symlinkSync(outside, join(root, "escape"), "junction");
      } catch {
        return; // runner without symlink privileges
      }
      expect(() => resolveSandboxPath(root, "escape/openapi.yaml")).toThrow(SandboxError);
    } finally {
      rmSync(root, { recursive: true, force: true });
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe("truncateAnalyzePayload", () => {
  it("keeps short finding lists intact", () => {
    const payload = {
      ok: true,
      findings: [{ ruleId: "NAMING-001" }],
      totalFindings: 1,
    };
    const out = truncateAnalyzePayload(payload, 20);
    expect(out.findings).toHaveLength(1);
    expect(out.truncated).toBeUndefined();
    expect(out.totalFindings).toBe(1);
  });

  it("truncates long finding lists with note", () => {
    const findings = Array.from({ length: 50 }, (_, i) => ({
      ruleId: `NAMING-${String(i).padStart(3, "0")}`,
    }));
    const out = truncateAnalyzePayload(
      { ok: true, findings, totalFindings: 50 },
      DEFAULT_MAX_FINDINGS,
    );
    expect(out.findings).toHaveLength(DEFAULT_MAX_FINDINGS);
    expect(out.truncated).toBe(true);
    expect(out.totalFindings).toBe(50);
    expect(out.note).toContain("use CLI for full report");
  });
});
