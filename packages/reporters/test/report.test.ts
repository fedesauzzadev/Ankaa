import { describe, expect, it } from "vitest";
import type { EvaluationResult, Finding } from "@apigovscan/core";
import {
  buildReport,
  canonicalJson,
  computeReportHash,
  formatConsole,
  formatJson,
  redactText,
} from "../src/index.js";

function finding(partial: Partial<Finding> = {}): Finding {
  return {
    fingerprint: "a".repeat(64),
    ruleId: "NAMING-001",
    severity: "error",
    category: "naming",
    message: "Resource path segments should be plural nouns.",
    location: "/paths/~1user/get",
    apiLocation: "GET /user",
    fix: "Rename user to users.",
    source: {
      title: "Microsoft REST API Guidelines",
      url: "https://github.com/microsoft/api-guidelines",
    },
    packId: "elite",
    packVersion: "2026.09.1",
    ...partial,
  };
}

function result(findings: Finding[]): EvaluationResult {
  return { findings, errors: [] };
}

function makeReport(
  overrides: Partial<Parameters<typeof buildReport>[0]> = {},
) {
  return buildReport({
    results: [result([finding()])],
    inputs: [{ path: "openapi.yaml", sha256: "sha256:9f3a" }],
    packs: [{ id: "elite", version: "2026.09.1" }],
    toolVersion: "0.0.0-dev",
    ...overrides,
  });
}

describe("buildReport (AC-R.5, AC-R.10)", () => {
  it("counts summary by severity", () => {
    const report = makeReport({
      results: [
        result([
          finding(),
          finding({ severity: "warning", fingerprint: "b".repeat(64) }),
          finding({ severity: "warning", fingerprint: "c".repeat(64) }),
          finding({ severity: "info", fingerprint: "d".repeat(64) }),
        ]),
      ],
    });
    expect(report.summary).toEqual({
      error: 1,
      warning: 2,
      info: 1,
      total: 4,
    });
  });

  it("sorts packs by id (AC-R.10)", () => {
    const report = makeReport({
      packs: [
        { id: "zeta", version: "1" },
        { id: "alpha", version: "2" },
      ],
    });
    expect(report.packs.map((p) => p.id)).toEqual(["alpha", "zeta"]);
  });

  it("same construction yields same reportHash (AC-R.1)", () => {
    const a = makeReport();
    const b = makeReport();
    expect(a.reportHash).toBe(b.reportHash);
    expect(a.reportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("meta.durationMs does not change reportHash (AC-R.2)", () => {
    const a = makeReport({ meta: { durationMs: 1 } });
    const b = makeReport({ meta: { durationMs: 9999 } });
    expect(a.reportHash).toBe(b.reportHash);
    expect(computeReportHash(a)).toBe(b.reportHash);
  });

  it("changing a finding changes reportHash (AC-R.3)", () => {
    const a = makeReport();
    const b = makeReport({
      results: [result([finding({ message: "Different message." })])],
    });
    expect(a.reportHash).not.toBe(b.reportHash);
  });

  it("canonical key order independent of input order (AC-R.4)", () => {
    const h1 = canonicalJson({ a: 1, b: { c: 2, d: 3 } });
    const h2 = canonicalJson({ b: { d: 3, c: 2 }, a: 1 });
    expect(h1).toBe(h2);
    expect(h1).toBe('{"a":1,"b":{"c":2,"d":3}}');
  });

  it("redacts PEM material in messages (AC-R.8)", () => {
    const report = makeReport({
      results: [
        result([
          finding({
            message:
              "Example leaks: -----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
          }),
        ]),
      ],
    });
    const json = formatJson(report);
    expect(json).not.toContain("BEGIN PRIVATE KEY");
    expect(json).toContain("***REDACTED***");
  });

  it("includes meta when provided", () => {
    const report = makeReport({
      meta: { durationMs: 1200, startedAt: "2026-09-23T00:00:00.000Z" },
    });
    expect(report.meta?.durationMs).toBe(1200);
  });

  it("includes optional summary.suppressed when provided (AC-B.3)", () => {
    const report = makeReport({ suppressed: 7 });
    expect(report.summary.suppressed).toBe(7);
    expect(report.summary.total).toBe(1);
  });

  it("omits summary.suppressed when not provided", () => {
    const report = makeReport();
    expect(report.summary.suppressed).toBeUndefined();
  });

  it("suppressed changes reportHash (spec decision)", () => {
    const a = makeReport();
    const b = makeReport({ suppressed: 0 });
    expect(a.reportHash).not.toBe(b.reportHash);
  });

  it("includes summary.skillsSuppressed when > 0 (AC-S.1)", () => {
    const report = makeReport({ skillsSuppressed: 3 });
    expect(report.summary.skillsSuppressed).toBe(3);
  });

  it("omits summary.skillsSuppressed when 0 (AC-S.5)", () => {
    const report = makeReport({ skillsSuppressed: 0 });
    expect(report.summary.skillsSuppressed).toBeUndefined();
  });

  it("skillsSuppressed changes reportHash when present", () => {
    const a = makeReport();
    const b = makeReport({ skillsSuppressed: 1 });
    expect(a.reportHash).not.toBe(b.reportHash);
  });
});

describe("formatJson", () => {
  it("parses to object with required schema keys (AC-A.4)", () => {
    const report = makeReport();
    const parsed = JSON.parse(formatJson(report)) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual([
      "findings",
      "input",
      "packs",
      "reportHash",
      "score",
      "summary",
      "tool",
    ]);
    expect(parsed.tool).toEqual({
      name: "apigovscan",
      version: "0.0.0-dev",
    });
    expect(parsed.score).toEqual({ value: 92, grade: "A" });
  });

  it("pretty option indents", () => {
    const report = makeReport();
    expect(formatJson(report, { pretty: true })).toContain("\n  ");
    expect(formatJson(report, { pretty: false })).not.toContain("\n  ");
  });
});

describe("formatConsole (AC-R.6, AC-R.9)", () => {
  it("color:false has no ANSI escapes", () => {
    const report = makeReport();
    const out = formatConsole(report, { color: false });
    expect(out.includes(String.fromCharCode(27))).toBe(false);
    expect(out).toContain("error");
    expect(out).toContain("NAMING-001");
    expect(out).toContain("reportHash");
    expect(out).toContain("score 92 (A)");
  });

  it("color:true includes ANSI", () => {
    const report = makeReport();
    const out = formatConsole(report, { color: true });
    expect(out.includes(String.fromCharCode(27))).toBe(true);
  });

  it("is stable across runs (AC-R.9)", () => {
    const report = makeReport({ meta: { durationMs: 1000 } });
    const a = formatConsole(report, { color: false });
    const b = formatConsole(report, { color: false });
    expect(a).toBe(b);
  });

  it("shows zero-finding summary", () => {
    const report = makeReport({ results: [result([])] });
    const out = formatConsole(report, { color: false });
    expect(out).toContain("0 errors");
    expect(out).toContain("reportHash");
  });
});

describe("redactText (AC-R.8)", () => {
  it("redacts PEM blocks", () => {
    const input =
      "key=-----BEGIN PRIVATE KEY-----\nsecretmaterial\n-----END PRIVATE KEY-----";
    const out = redactText(input);
    expect(out).not.toContain("secretmaterial");
    expect(out).toContain("***REDACTED***");
  });

  it("redacts AWS access key ids", () => {
    expect(redactText("id AKIAIOSFODNN7EXAMPLE")).toContain("***REDACTED***");
  });
});
