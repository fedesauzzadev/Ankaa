import { describe, expect, it } from "vitest";
import {
  DEFAULT_MAX_FINDINGS,
  SandboxError,
  mcpPackageId,
  resolveSandboxPath,
  truncateAnalyzePayload,
} from "../src/index.js";

describe("@apigovscan/mcp", () => {
  it("exposes package id", () => {
    expect(mcpPackageId()).toBe("@apigovscan/mcp");
  });
});

describe("resolveSandboxPath", () => {
  const cwd = "C:\\repo\\project".replace(/\\/g, "/");

  it("allows paths under cwd", () => {
    const resolved = resolveSandboxPath(cwd, "specs/openapi.yaml");
    expect(resolved.replace(/\\/g, "/")).toContain("specs/openapi.yaml");
  });

  it("rejects parent escapes", () => {
    expect(() => resolveSandboxPath(cwd, "../outside.yaml")).toThrow(
      SandboxError,
    );
  });

  it("rejects absolute paths outside cwd", () => {
    expect(() => resolveSandboxPath(cwd, "/etc/passwd")).toThrow(SandboxError);
  });

  it("rejects stdin dash", () => {
    expect(() => resolveSandboxPath(cwd, "-")).toThrow(SandboxError);
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
