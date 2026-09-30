import { describe, expect, it } from "vitest";
import { buildReport, computeReportHash, computeScore, type ReportScore } from "../src/index.js";
import type { EvaluationResult, Finding, Severity } from "@ankaa/core";

function finding(severity: Severity): Finding {
  return {
    ruleId: "TEST-001",
    severity,
    category: "consistency",
    message: "test finding",
    location: "/paths/~1users",
    fingerprint: "a".repeat(64),
    packId: "elite",
    packVersion: "2026.09.1",
  };
}

function reportWith(counts: { error: number; warning: number; info: number }) {
  const findings: Finding[] = [
    ...Array.from({ length: counts.error }, () => finding("error")),
    ...Array.from({ length: counts.warning }, () => finding("warning")),
    ...Array.from({ length: counts.info }, () => finding("info")),
  ];
  const result: EvaluationResult = { findings, errors: [] };
  return buildReport({
    results: [result],
    inputs: [{ path: "openapi.yaml", sha256: "sha256:" + "0".repeat(64) }],
    packs: [{ id: "elite", version: "2026.09.1" }],
    toolVersion: "0.0.0-dev",
  });
}

describe("computeScore (f6-score)", () => {
  it("AC-S.1 zero findings => 100/A", () => {
    expect(computeScore({ error: 0, warning: 0, info: 0 })).toEqual({
      value: 100,
      grade: "A",
    } satisfies ReportScore);
    expect(reportWith({ error: 0, warning: 0, info: 0 }).score).toEqual({
      value: 100,
      grade: "A",
    });
  });

  it("AC-S.2 formula 8E+3W+1I (petstore-mini 0E/6W/8I => 74/C)", () => {
    const { score } = reportWith({ error: 0, warning: 6, info: 8 });
    expect(score.value).toBe(100 - (6 * 3 + 8 * 1));
    expect(score).toEqual({ value: 74, grade: "C" });
  });

  it("AC-S.2 penalty floors at 0", () => {
    expect(computeScore({ error: 20, warning: 0, info: 0 })).toEqual({
      value: 0,
      grade: "F",
    });
  });

  it("AC-S.3 grade thresholds at 90/75/60/40 boundaries", () => {
    expect(computeScore({ error: 1, warning: 0, info: 2 }).value).toBe(90);
    expect(computeScore({ error: 1, warning: 0, info: 2 }).grade).toBe("A");
    expect(computeScore({ error: 1, warning: 0, info: 3 }).value).toBe(89);
    expect(computeScore({ error: 1, warning: 0, info: 3 }).grade).toBe("B");
    expect(computeScore({ error: 0, warning: 8, info: 1 }).value).toBe(75);
    expect(computeScore({ error: 0, warning: 8, info: 2 }).value).toBe(74);
    expect(computeScore({ error: 0, warning: 8, info: 2 }).grade).toBe("C");
    expect(computeScore({ error: 0, warning: 13, info: 1 }).value).toBe(60);
    expect(computeScore({ error: 0, warning: 13, info: 2 }).value).toBe(59);
    expect(computeScore({ error: 0, warning: 13, info: 2 }).grade).toBe("D");
    expect(computeScore({ error: 0, warning: 19, info: 3 }).value).toBe(40);
    expect(computeScore({ error: 0, warning: 19, info: 4 }).value).toBe(39);
    expect(computeScore({ error: 0, warning: 19, info: 4 }).grade).toBe("F");
  });

  it("AC-S.8 deterministic: same findings => same score and hash", () => {
    const a = reportWith({ error: 2, warning: 3, info: 4 });
    const b = reportWith({ error: 2, warning: 3, info: 4 });
    expect(a.score).toEqual(b.score);
    expect(a.reportHash).toBe(b.reportHash);
    expect(computeReportHash(a)).toBe(a.reportHash);
  });

  it("AC-S.8 score changes => reportHash changes", () => {
    const a = reportWith({ error: 0, warning: 0, info: 0 });
    const b = reportWith({ error: 0, warning: 0, info: 1 });
    expect(a.reportHash).not.toBe(b.reportHash);
  });
});
