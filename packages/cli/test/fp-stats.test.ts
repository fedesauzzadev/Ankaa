import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  DEFAULT_FP_THRESHOLD,
  DEFAULT_MIN_SAMPLE,
  buildFpStats,
  renderFpStatsConsole,
} from "../src/fp-stats.js";
import type { FeedbackDecision, FeedbackFile, FeedbackItem } from "../src/learn.js";
import type { TrackingFile, TrackingStatus } from "../src/dashboard.js";
import { run } from "../src/index.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-fpstats-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

function fp(n: number): string {
  return n.toString(16).padStart(64, "0");
}

function report(entries: Array<[string, string]>): Record<string, unknown> {
  return {
    findings: entries.map(([ruleId, fingerprint]) => ({ ruleId, fingerprint })),
    summary: { total: entries.length },
  };
}

function item(fingerprint: string, decision: FeedbackDecision): FeedbackItem {
  return { fingerprint, decision };
}

function feedback(...items: FeedbackItem[]): FeedbackFile {
  return { items };
}

function tracking(states: Array<[string, TrackingStatus]>): TrackingFile {
  const map: Record<string, { status: TrackingStatus }> = {};
  for (const [fingerprint, status] of states) {
    map[fingerprint] = { status };
  }
  return { version: 1, states: map };
}

const SETTINGS = { minSample: DEFAULT_MIN_SAMPLE, fpThreshold: DEFAULT_FP_THRESHOLD };

describe("buildFpStats (AC-FP.*)", () => {
  it("AC-FP.1 aggregates signals and flags a noisy rule", () => {
    const stats = buildFpStats({
      reports: [report([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((n) => ["NAMING-001", fp(n)] as [string, string]))],
      feedbacks: [
        feedback(
          ...[1, 2, 3, 4, 5, 6].map((n) => item(fp(n), "false_positive")),
          item(fp(7), "wontfix"),
          item(fp(8), "wontfix"),
          item(fp(9), "confirm"),
          item(fp(10), "confirm"),
          item(fp(11), "confirm"),
        ),
      ],
      trackings: [tracking([[fp(12), "resolved"]])],
      settings: SETTINGS,
    });
    expect(stats.rules).toHaveLength(1);
    const rule = stats.rules[0]!;
    expect(rule).toMatchObject({
      ruleId: "NAMING-001",
      sample: 12,
      falsePositive: 6,
      wontfix: 2,
      confirm: 3,
      resolved: 1,
      rate: 0.5,
      noisy: true,
    });
    expect(stats.warnings).toEqual([]);
  });

  it("AC-FP.2 low sample is never noisy and shows insufficient sample", () => {
    const stats = buildFpStats({
      reports: [report([["SEC-001", fp(1)], ["SEC-001", fp(2)]])],
      feedbacks: [feedback(item(fp(1), "confirm"), item(fp(2), "confirm"))],
      trackings: [],
      settings: SETTINGS,
    });
    expect(stats.rules[0]).toMatchObject({ sample: 2, rate: 0, noisy: false });
    expect(renderFpStatsConsole(stats)).toContain("insufficient sample");
  });

  it("AC-FP.3 no reviewed signals yields empty rules", () => {
    const stats = buildFpStats({
      reports: [report([["SEC-001", fp(1)]])],
      feedbacks: [feedback(item(fp(1), "severity_change"))],
      trackings: [tracking([[fp(1), "pending"]])],
      settings: SETTINGS,
    });
    expect(stats.rules).toEqual([]);
    expect(stats.sources.ignoredDecisions).toBe(1);
    expect(stats.sources.unreviewedTracking).toBe(1);
  });

  it("AC-FP.4 dedups by fingerprint: later feedback wins, feedback beats tracking", () => {
    const stats = buildFpStats({
      reports: [report([["NAMING-001", fp(1)], ["NAMING-001", fp(2)]])],
      feedbacks: [feedback(item(fp(1), "false_positive")), feedback(item(fp(1), "confirm"))],
      trackings: [tracking([[fp(1), "resolved"], [fp(2), "resolved"]])],
      settings: SETTINGS,
    });
    const rule = stats.rules[0]!;
    expect(rule.falsePositive).toBe(0);
    expect(rule.confirm).toBe(1);
    expect(rule.resolved).toBe(1);
    expect(rule.sample).toBe(2);
  });

  it("AC-FP.5 silence is counted, never interpreted", () => {
    const stats = buildFpStats({
      reports: [report([1, 2, 3, 4, 5].map((n) => ["SEC-001", fp(n)] as [string, string]))],
      feedbacks: [
        feedback(
          item(fp(1), "severity_change"),
          item(fp(2), "suggest_rule"),
          item(fp(3), "confirm"),
        ),
      ],
      trackings: [tracking([[fp(4), "pending"], [fp(5), "in_progress"]])],
      settings: SETTINGS,
    });
    expect(stats.sources.ignoredDecisions).toBe(2);
    expect(stats.sources.unreviewedTracking).toBe(2);
    expect(stats.rules[0]!.sample).toBe(1);
  });

  it("AC-FP.6 unresolved feedback and unknown tracking are honest warnings", () => {
    const stats = buildFpStats({
      reports: [report([["SEC-001", fp(1)]])],
      feedbacks: [feedback(item(fp(999), "false_positive"), item("deadbeef", "confirm"))],
      trackings: [tracking([[fp(888), "resolved"]])],
      settings: SETTINGS,
    });
    expect(stats.rules).toEqual([]);
    expect(stats.warnings).toHaveLength(3);
    expect(stats.warnings[0]).toContain("not in reports");
    expect(stats.warnings[1]).toContain("deadbeef");
    expect(stats.warnings[2]).toContain("not in reports");
  });

  it("AC-FP.7 deterministic output with stable rule order", () => {
    const input = {
      reports: [report([["Z-001", fp(1)], ["A-001", fp(2)]])],
      feedbacks: [feedback(item(fp(1), "false_positive"), item(fp(2), "confirm"))],
      trackings: [tracking([[fp(3), "resolved"]])],
      settings: SETTINGS,
    } as const;
    const a = JSON.stringify(buildFpStats({ ...input }));
    const b = JSON.stringify(buildFpStats({ ...input }));
    expect(a).toBe(b);
    const ids = buildFpStats({ ...input }).rules.map((r) => r.ruleId);
    expect(ids).toEqual(["A-001", "Z-001"]);
  });

  it("prefix feedback resolves against reports like learn", () => {
    const stats = buildFpStats({
      reports: [report([["SEC-001", fp(1)]])],
      feedbacks: [feedback(item(fp(1).slice(0, 8), "false_positive"))],
      trackings: [],
      settings: SETTINGS,
    });
    expect(stats.rules[0]!.falsePositive).toBe(1);
  });
});

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

async function runCapture(
  argv: string[],
  io: { cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await run(["node", "cli", ...argv], {
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    isTTY: false,
    cwd: io.cwd ?? repoRoot,
  });
  return { code, stdout, stderr };
}

function writeStatsFixture(dir: string): void {
  const findings = [
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ ruleId: "NAMING-001", fingerprint: fp(n) })),
    ...[10, 11, 12].map((n) => ({ ruleId: "NAMING-001", fingerprint: fp(n) })),
    { ruleId: "SEC-003", fingerprint: fp(20) },
    { ruleId: "SEC-003", fingerprint: fp(21) },
  ];
  writeFileSync(join(dir, "report.json"), JSON.stringify({ findings, summary: { total: 11 } }), "utf8");
  const items = [
    ...[1, 2, 3, 4, 5, 6].map((n) => ({ fingerprint: fp(n), decision: "false_positive" })),
    { fingerprint: fp(7), decision: "confirm" },
    { fingerprint: fp(8), decision: "confirm" },
    { fingerprint: fp(9), decision: "wontfix" },
    { fingerprint: fp(20), decision: "confirm" },
    { fingerprint: fp(21), decision: "confirm" },
  ];
  writeFileSync(join(dir, "feedback.json"), JSON.stringify({ items }), "utf8");
  const states: Record<string, { status: string }> = { [fp(30)]: { status: "pending" } };
  for (const n of [10, 11, 12]) {
    states[fp(n)] = { status: "resolved" };
  }
  writeFileSync(join(dir, "t.json"), JSON.stringify({ version: 1, states }), "utf8");
}

describe("skills stats e2e (AC-FP.*)", () => {
  it("console report flags the noisy rule and exits 0", async () => {
    const dir = tempDir();
    writeStatsFixture(dir);
    const { code, stdout, stderr } = await runCapture(
      ["skills", "stats", "--report", "report.json", "--feedback", "feedback.json", "--tracking", "t.json"],
      { cwd: dir },
    );
    expect(code).toBe(0);
    expect(stdout).toContain("fp-stats:");
    expect(stdout).toContain("NAMING-001");
    expect(stdout).toContain("noisy");
    expect(stdout).toContain("insufficient sample");
    expect(stdout).toContain("1 unreviewed");
    expect(stderr).toBe("");
  });

  it("json report is stable and matches the contract", async () => {
    const dir = tempDir();
    writeStatsFixture(dir);
    const { code, stdout } = await runCapture(
      ["skills", "stats", "--report", "report.json", "--feedback", "feedback.json", "--format", "json"],
      { cwd: dir },
    );
    expect(code).toBe(0);
    const parsed = JSON.parse(stdout) as {
      settings: { minSample: number; fpThreshold: number };
      sources: { reports: number; feedbackFiles: number; trackingFiles: number; unreviewedTracking: number };
      rules: Array<{ ruleId: string; sample: number; rate: number; noisy: boolean }>;
      warnings: string[];
    };
    expect(parsed.settings).toEqual({ minSample: 10, fpThreshold: 0.3 });
    expect(parsed.sources).toMatchObject({ reports: 1, feedbackFiles: 1, trackingFiles: 0 });
    const naming = parsed.rules.find((r) => r.ruleId === "NAMING-001")!;
    expect(naming.sample).toBe(9);
    expect(naming.rate).toBeCloseTo(6 / 9, 10);
    expect(naming.noisy).toBe(false);
    expect(parsed.warnings).toEqual([]);
  });

  it("AC-FP.8 --output requires --format json and writes only that file (INV-7)", async () => {
    const dir = tempDir();
    writeStatsFixture(dir);
    const bad = await runCapture(
      ["skills", "stats", "--report", "report.json", "--feedback", "feedback.json", "--output", "stats.json"],
      { cwd: dir },
    );
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("--output requires --format json");

    const ok = await runCapture(
      [
        "skills",
        "stats",
        "--report",
        "report.json",
        "--feedback",
        "feedback.json",
        "--format",
        "json",
        "--output",
        "stats.json",
      ],
      { cwd: dir },
    );
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("wrote:");
    const outFile = join(dir, "stats.json");
    expect(existsSync(outFile)).toBe(true);
    expect(JSON.parse(readFileSync(outFile, "utf8"))).toHaveProperty("rules");
    expect(readdirSync(dir).sort()).toEqual(["feedback.json", "report.json", "stats.json", "t.json"]);
  });

  it("AC-FP.9 usage and load errors are exit 2", async () => {
    const dir = tempDir();
    writeStatsFixture(dir);
    const missingReport = await runCapture(
      ["skills", "stats", "--report", "nope.json", "--feedback", "feedback.json"],
      { cwd: dir },
    );
    expect(missingReport.code).toBe(2);
    expect(missingReport.stderr).toContain("report not found");

    const noSignals = await runCapture(["skills", "stats", "--report", "report.json"], { cwd: dir });
    expect(noSignals.code).toBe(2);
    expect(noSignals.stderr).toContain("--feedback or --tracking");

    const badSample = await runCapture(
      ["skills", "stats", "--report", "report.json", "--feedback", "feedback.json", "--min-sample", "0"],
      { cwd: dir },
    );
    expect(badSample.code).toBe(2);

    const unknown = await runCapture(
      ["skills", "stats", "--report", "report.json", "--feedback", "feedback.json", "--wat"],
      { cwd: dir },
    );
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("unknown option");
  });
});
