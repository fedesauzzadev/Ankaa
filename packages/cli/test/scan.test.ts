import { describe, expect, it } from "vitest";
import { aggregateScans, loadGroupMapping, type RepoScan } from "../src/scan.js";

function repo(partial: Partial<RepoScan> & { name: string }): RepoScan {
  return {
    specs: 1,
    findings: 0,
    errors: 0,
    warnings: 0,
    infos: 0,
    score: 100,
    grade: "A",
    coverage: 100,
    ...partial,
  };
}

describe("aggregateScans (AC-SO.1-3 parcial)", () => {
  it("sums totals and averages scores", () => {
    const report = aggregateScans(
      [
        repo({ name: "a", findings: 4, errors: 1, warnings: 3, score: 80, grade: "B", coverage: 70 }),
        repo({ name: "b", findings: 1, warnings: 1, score: 90, grade: "A", coverage: 90 }),
      ],
      undefined,
      "ankaa",
      "0.0.0-dev",
      null,
    );
    expect(report.tool).toBe("ankaa");
    expect(report.org).toBeNull();
    expect(report.totals).toEqual({
      repos: 2,
      specs: 2,
      findings: 5,
      errors: 1,
      warnings: 4,
      infos: 0,
    });
    expect(report.avgScore).toBe(85);
    expect(report.avgCoverage).toBe(80);
    expect(report.groups).toHaveLength(1);
    expect(report.groups[0]!.name).toBe("ungrouped");
    expect(report.groups[0]!.avgCoverage).toBe(80);
  });

  it("ranks worst-first with deterministic tie-breaks", () => {
    const report = aggregateScans(
      [
        repo({ name: "zzz", score: 50, errors: 1 }),
        repo({ name: "aaa", score: 50, errors: 3 }),
        repo({ name: "mmm", score: 50, errors: 3 }),
        repo({ name: "top", score: 99 }),
      ],
      undefined,
      "ankaa",
      "0.0.0-dev",
      null,
    );
    const names = report.groups[0]!.repos.map((r) => r.name);
    expect(names).toEqual(["aaa", "mmm", "zzz", "top"]);
  });

  it("groups by mapping, unmapped go to ungrouped, groups sorted", () => {
    const report = aggregateScans(
      [
        repo({ name: "pay-api", score: 70 }),
        repo({ name: "shop-api", score: 90 }),
        repo({ name: "misc", score: 80 }),
      ],
      { "pay-api": "checkout", "shop-api": "checkout" },
      "ankaa",
      "0.0.0-dev",
      "acme",
    );
    expect(report.org).toBe("acme");
    expect(report.groups.map((g) => g.name)).toEqual(["checkout", "ungrouped"]);
    const checkout = report.groups[0]!;
    expect(checkout.repos.map((r) => r.name)).toEqual(["pay-api", "shop-api"]);
    expect(checkout.totals.repos).toBe(2);
    expect(checkout.avgScore).toBe(80);
  });
});

describe("loadGroupMapping", () => {
  it("accepts a flat string map", () => {
    expect(loadGroupMapping("a: x\nb: y\n")).toEqual({
      ok: true,
      mapping: { a: "x", b: "y" },
    });
  });

  it("rejects non-mappings and non-string values", () => {
    expect(loadGroupMapping("- a\n- b\n").ok).toBe(false);
    expect(loadGroupMapping("a: 42\n").ok).toBe(false);
    expect(loadGroupMapping("a: ''\n").ok).toBe(false);
    expect(loadGroupMapping("not: [valid, yaml").ok).toBe(false);
  });
});
