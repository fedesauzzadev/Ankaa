import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseDashboardArgs } from "../src/args.js";
import {
  compareReports,
  defaultTrackingPath,
  emptyTracking,
  loadOwnerMapping,
  loadReportFile,
  loadTrackingFile,
  ownerOf,
  saveTrackingFile,
  setFindingStatus,
  type DashboardReport,
} from "../src/dashboard.js";
import { renderDashboardPage } from "../src/dashboard-page.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtures = join(repoRoot, "fixtures", "dashboard");

function loadFixture(name: string): DashboardReport {
  const loaded = loadReportFile(join(fixtures, name));
  expect(loaded.ok).toBe(true);
  if (!loaded.ok) throw new Error("fixture failed to load");
  return loaded.report;
}

describe("dashboard helpers (f10-dashboard)", () => {
  it("AC-DB.2 loads the small report with 5 findings", () => {
    const report = loadFixture("report-small.json");
    expect(report.findings).toHaveLength(5);
    expect(report.score).toEqual({ value: 61, grade: "D" });
  });

  it("rejects non-report JSON honestly", () => {
    const loaded = loadReportFile(join(fixtures, "groups.yaml"));
    expect(loaded.ok).toBe(false);
  });

  it("AC-DB.4 compares current vs old by fingerprint", () => {
    const current = loadFixture("report-small.json");
    const old = loadFixture("report-old.json");
    const trends = compareReports(current, old);
    expect(trends.byFingerprint["c".repeat(64)]).toBe("new");
    expect(trends.byFingerprint["e".repeat(64)]).toBe("new");
    expect(trends.byFingerprint["a".repeat(64)]).toBe("repeated");
    expect(trends.resolved).toEqual(["f".repeat(64)]);
  });

  it("AC-DB.3 setFindingStatus is pure and caps notes", () => {
    const base = emptyTracking();
    const next = setFindingStatus(base, "a".repeat(64), "in_progress", "x".repeat(600));
    expect(base.states).toEqual({});
    expect(next.states["a".repeat(64)]?.status).toBe("in_progress");
    expect(next.states["a".repeat(64)]?.note).toHaveLength(500);
  });

  it("tracking roundtrips through save/load", () => {
    const dir = mkdtempSync(join(tmpdir(), "apigovscan-dashboard-"));
    try {
      const tracking = setFindingStatus(emptyTracking(), "a".repeat(64), "resolved");
      const path = join(dir, "roundtrip.tracking.json");
      const saved = saveTrackingFile(path, tracking);
      expect(saved.ok).toBe(true);
      const loaded = loadTrackingFile(path);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.tracking.states["a".repeat(64)]?.status).toBe("resolved");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("AC-DB.2 ownerOf maps input paths and basenames", () => {
    const mapping = loadOwnerMapping(readFileSync(join(fixtures, "groups.yaml"), "utf8"));
    expect(mapping.ok).toBe(true);
    if (!mapping.ok) return;
    const report = loadFixture("report-small.json");
    const inputs = report.input.map((i) => i.path);
    expect(ownerOf(report.findings[0]!, mapping.mapping, inputs)).toBe("checkout");
    expect(ownerOf(report.findings[4]!, mapping.mapping, inputs)).toBe("platform");
    expect(ownerOf(report.findings[0]!, mapping.mapping, [])).toBe("checkout");
    expect(ownerOf(report.findings[0]!, undefined, inputs)).toBe("ungrouped");
  });

  it("defaultTrackingPath appends the suffix", () => {
    expect(defaultTrackingPath("/x/report.json")).toBe("/x/report.json.tracking.json");
  });

  it("page renders without external requests", () => {
    const html = renderDashboardPage();
    expect(html).toContain("Findings dashboard");
    expect(html).not.toMatch(/src="http|href="http/);
    expect(html).toContain("Group by");
    expect(html).toContain("Copy prompt for LLM");
    expect(html).toContain("Copy fix command");
    expect(html).toContain("Copy suppress command");
  });

  it("page shows coverage badge with legacy fallback (AC-CV.4)", () => {
    const html = renderDashboardPage();
    expect(html).toContain("· coverage ");
    expect(html).toContain("typeof cov.pct");
    expect(html).toContain("per-class breakdown");
  });
});

describe("parseDashboardArgs", () => {
  it("parses report plus flags", () => {
    const parsed = parseDashboardArgs([
      "report.json",
      "--port",
      "8080",
      "--against",
      "old.json",
      "--group-by",
      "g.yaml",
      "--tracking",
      "t.json",
    ]);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.args).toEqual({
      report: "report.json",
      port: 8080,
      tracking: "t.json",
      against: "old.json",
      groupBy: "g.yaml",
    });
  });

  it("rejects missing report and bad ports", () => {
    expect(parseDashboardArgs([]).ok).toBe(false);
    expect(parseDashboardArgs(["r.json", "--port", "abc"]).ok).toBe(false);
    expect(parseDashboardArgs(["r.json", "--port", "99999"]).ok).toBe(false);
    expect(parseDashboardArgs(["r.json", "--bogus"]).ok).toBe(false);
  });
});
