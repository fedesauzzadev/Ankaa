import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import {
  buildLearnPatch,
  loadFeedbackFile,
  loadReportFile,
  writeLearnPatch,
} from "../src/learn.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-learn-"));
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

async function runCapture(
  argv: string[],
  io: { cwd?: string; isTTY?: boolean } = {},
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
    cwd: repoRoot,
    ...io,
  });
  return { code, stdout, stderr };
}

const SPEC = [
  "openapi: 3.1.0",
  "info:",
  "  title: Learn API",
  "  version: 1.0.0",
  "paths:",
  "  /user:",
  "    get:",
  "      summary: Get user",
  "      description: Returns a single user.",
  "      responses:",
  '        "200":',
  "          description: ok",
  "",
].join("\n");

const REPORT = {
  reportHash: "abc123",
  findings: [
    {
      fingerprint: "a".repeat(64),
      ruleId: "NAMING-001",
      severity: "error",
      category: "naming",
      message: "plural",
      location: "/paths/~1user/get",
      packId: "elite",
      packVersion: "2026.09.1",
    },
    {
      fingerprint: "b".repeat(64),
      ruleId: "PAGINATION-001",
      severity: "warning",
      category: "pagination",
      message: "page",
      location: "/paths/~1user/get/responses/200",
      packId: "elite",
      packVersion: "2026.09.1",
    },
  ],
};

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, JSON.stringify(value, null, 2), "utf8");
}

describe("learn unit (AC-L.*)", () => {
  it("AC-L.1 maps FP + severity_change + suggest_rule", () => {
    const feedback = {
      items: [
        {
          fingerprint: "a".repeat(64),
          decision: "false_positive",
          comment: "internal only",
        },
        {
          fingerprint: "b".repeat(64),
          decision: "severity_change",
          severity: "info",
        },
        {
          fingerprint: "b".repeat(64),
          decision: "suggest_rule",
          draft: {
            id: "TEAM-008",
            category: "custom",
            severity: "warning",
            message: "Batch endpoints must document max array size.",
            when: {
              all: [
                { op: "method", in: ["post"] },
                { op: "pathMatches", pattern: "/batch$" },
              ],
            },
          },
        },
      ],
    };
    const path = join(tempDir(), "feedback.json");
    writeJson(path, feedback);
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const reportPath = join(tempDir(), "report.json");
    writeJson(reportPath, REPORT);
    const report = loadReportFile(reportPath);
    expect(report.ok).toBe(true);
    if (!report.ok) return;

    const result = buildLearnPatch({
      report: report.report,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.suppressions).toHaveLength(1);
    expect(result.patch.suppressions[0]).toEqual({
      fingerprint: "a".repeat(64),
      reason: "internal only",
    });
    expect(result.patch.severities).toEqual([{ ruleId: "PAGINATION-001", severity: "info" }]);
    expect(result.patch.draftsToWrite).toHaveLength(1);
    expect(result.patch.draftsToWrite[0]!.id).toBe("TEAM-008");
  });

  it("AC-L.3 default reason false_positive / wontfix", () => {
    const path = join(tempDir(), "fb.json");
    writeJson(path, {
      items: [
        { fingerprint: "c".repeat(64), decision: "false_positive" },
        { fingerprint: "d".repeat(64), decision: "wontfix" },
      ],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = buildLearnPatch({
      report: REPORT,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.suppressions.map((s) => s.reason)).toEqual(["false_positive", "wontfix"]);
  });

  it("AC-L.4 unknown decision → load error", () => {
    const path = join(tempDir(), "bad.json");
    writeJson(path, {
      items: [{ fingerprint: "e".repeat(64), decision: "explode" }],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toContain("decision");
  });

  it("AC-L.6 severity_change missing finding → error", () => {
    const path = join(tempDir(), "fb2.json");
    writeJson(path, {
      items: [
        {
          fingerprint: "f".repeat(64),
          decision: "severity_change",
          severity: "info",
        },
      ],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = buildLearnPatch({
      report: REPORT,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("severity_change");
  });

  it("AC-L.7 invalid draft DSL → error", () => {
    const path = join(tempDir(), "fb3.json");
    writeJson(path, {
      items: [
        {
          fingerprint: "a".repeat(64),
          decision: "suggest_rule",
          draft: {
            id: "TEAM-009",
            category: "custom",
            severity: "warning",
            message: "bad",
            when: { op: "eval", code: "1" },
          },
        },
      ],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = buildLearnPatch({
      report: REPORT,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("draft invalid");
  });

  it("AC-L.5 fingerprint not in report → warning but applies FP", () => {
    const path = join(tempDir(), "fb4.json");
    writeJson(path, {
      items: [{ fingerprint: "9".repeat(64), decision: "false_positive", comment: "stale" }],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = buildLearnPatch({
      report: REPORT,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.warnings.some((w) => w.includes("not in report"))).toBe(true);
    expect(result.patch.suppressions).toHaveLength(1);
    expect(result.patch.suppressions[0]!.fingerprint).toBe("9".repeat(64));
  });

  it("unique short prefixes resolve to full fingerprints before storing", () => {
    const path = join(tempDir(), "fb-prefix.json");
    writeJson(path, {
      items: [{ fingerprint: "a".repeat(12), decision: "wontfix", comment: "hotfix" }],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = buildLearnPatch({
      report: REPORT,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.patch.suppressions).toHaveLength(1);
    expect(result.patch.suppressions[0]!.fingerprint).toBe("a".repeat(64));
    expect(result.patch.suppressions[0]!.reason).toBe("hotfix");
  });

  it("unknown short prefixes fail honestly (a prefix must never be stored)", () => {
    const path = join(tempDir(), "fb-prefix-missing.json");
    writeJson(path, {
      items: [{ fingerprint: "f".repeat(12), decision: "wontfix", comment: "stale" }],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = buildLearnPatch({
      report: REPORT,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("finding not found");
  });

  it("ambiguous short prefixes fail honestly", () => {
    const report = {
      reportHash: "ambig",
      findings: [
        { ...REPORT.findings[0]!, fingerprint: `abcdef01${"0".repeat(56)}` },
        { ...REPORT.findings[1]!, fingerprint: `abcdef01${"1".repeat(56)}` },
      ],
    };
    const path = join(tempDir(), "fb-prefix-ambig.json");
    writeJson(path, {
      items: [{ fingerprint: "abcdef01", decision: "wontfix", comment: "x" }],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const result = buildLearnPatch({
      report,
      feedback: loaded.feedback,
      existingSuppressions: [],
      existingSeverities: [],
      toolVersion: "0.0.0-dev",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("ambiguous fingerprint prefix");
  });

  it("malformed fingerprints are still rejected at load", () => {
    const path = join(tempDir(), "fb-malformed.json");
    writeJson(path, {
      items: [{ fingerprint: "nope", decision: "wontfix", comment: "x" }],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(false);
    if (loaded.ok) return;
    expect(loaded.error).toContain("8-64 hex chars");
  });

  it("AC-L.2 INV-5: same patch twice → same serialized bytes", () => {
    const dir = tempDir();
    const path = join(dir, "fb.json");
    writeJson(path, {
      items: [
        {
          fingerprint: "a".repeat(64),
          decision: "false_positive",
          comment: "x",
        },
        {
          fingerprint: "b".repeat(64),
          decision: "severity_change",
          severity: "info",
        },
      ],
    });
    const loaded = loadFeedbackFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;

    const make = () =>
      buildLearnPatch({
        report: REPORT,
        feedback: loaded.feedback,
        existingSuppressions: [],
        existingSeverities: [],
        toolVersion: "0.0.0-dev",
      });

    const skills1 = join(dir, "s1");
    const skills2 = join(dir, "s2");
    const p1 = make();
    const p2 = make();
    expect(p1.ok).toBe(true);
    expect(p2.ok).toBe(true);
    if (!p1.ok || !p2.ok) return;
    writeLearnPatch(skills1, p1.patch, false);
    writeLearnPatch(skills2, p2.patch, false);
    expect(readFileSync(join(skills1, "suppressions.yaml"), "utf8")).toBe(
      readFileSync(join(skills2, "suppressions.yaml"), "utf8"),
    );
    expect(readFileSync(join(skills1, "severities.yaml"), "utf8")).toBe(
      readFileSync(join(skills2, "severities.yaml"), "utf8"),
    );

    // Re-apply on top of existing → still idempotent
    const existingSup = [{ fingerprint: "a".repeat(64), reason: "x" }];
    const existingSev = [{ ruleId: "PAGINATION-001", severity: "info" as const }];
    const reapply = buildLearnPatch({
      report: REPORT,
      feedback: loaded.feedback,
      existingSuppressions: existingSup,
      existingSeverities: existingSev,
      toolVersion: "0.0.0-dev",
    });
    expect(reapply.ok).toBe(true);
    if (!reapply.ok) return;
    writeLearnPatch(skills1, reapply.patch, false);
    expect(readFileSync(join(skills1, "suppressions.yaml"), "utf8")).toBe(
      readFileSync(join(skills2, "suppressions.yaml"), "utf8"),
    );
  });
});

describe("learn + skills e2e (AC-L.8–12)", () => {
  async function analyzeJson(dir: string): Promise<{
    code: number;
    report: Record<string, unknown> | null;
    stdout: string;
    stderr: string;
  }> {
    const { code, stdout, stderr } = await runCapture(
      [
        "analyze",
        join(dir, "openapi.yaml"),
        "--format",
        "json",
        "--fail-on",
        "never",
        "--no-color",
      ],
      { cwd: dir },
    );
    let report: Record<string, unknown> | null = null;
    try {
      report = JSON.parse(stdout) as Record<string, unknown>;
    } catch {
      report = null;
    }
    return { code, report, stdout, stderr };
  }

  it("AC-L.8/L.9 full loop: analyze → feedback → learn → re-analyze", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC, "utf8");

    const before = await analyzeJson(dir);
    expect([0, 1]).toContain(before.code);
    expect(before.report).not.toBeNull();
    const findings = before.report!.findings as Array<{
      fingerprint: string;
      ruleId: string;
    }>;
    expect(findings.length).toBeGreaterThan(0);

    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(before.report, null, 2), "utf8");

    const pick = findings.slice(0, 2);
    const feedbackPath = join(dir, "feedback.json");
    writeJson(feedbackPath, {
      reportHash: before.report!.reportHash,
      items: pick.map((f) => ({
        fingerprint: f.fingerprint,
        decision: "false_positive",
        comment: "known noise for demo",
      })),
    });

    const learn1 = await runCapture(
      ["learn", "--report", reportPath, "--feedback", feedbackPath, "--no-color"],
      { cwd: dir },
    );
    expect(learn1.code).toBe(0);
    expect(existsSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"))).toBe(true);

    const after = await analyzeJson(dir);
    const afterFindings = after.report!.findings as Array<{
      fingerprint: string;
    }>;
    const afterFps = new Set(afterFindings.map((f) => f.fingerprint));
    for (const f of pick) {
      expect(afterFps.has(f.fingerprint)).toBe(false);
    }
    const summary = after.report!.summary as { skillsSuppressed?: number };
    expect(summary.skillsSuppressed).toBeGreaterThanOrEqual(pick.length);
  });

  it("AC-L.2 second learn is byte-identical (INV-5)", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC, "utf8");
    const before = await analyzeJson(dir);
    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(before.report, null, 2), "utf8");
    const findings = before.report!.findings as Array<{ fingerprint: string }>;
    const feedbackPath = join(dir, "feedback.json");
    writeJson(feedbackPath, {
      items: [
        {
          fingerprint: findings[0]!.fingerprint,
          decision: "false_positive",
          comment: "fp",
        },
      ],
    });

    await runCapture(["learn", "--report", reportPath, "--feedback", feedbackPath], { cwd: dir });
    const sup1 = readFileSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"), "utf8");
    const sev1 = readFileSync(join(dir, ".apigovscan", "skills", "severities.yaml"), "utf8");

    await runCapture(["learn", "--report", reportPath, "--feedback", feedbackPath], { cwd: dir });
    const sup2 = readFileSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"), "utf8");
    const sev2 = readFileSync(join(dir, ".apigovscan", "skills", "severities.yaml"), "utf8");
    expect(sup2).toBe(sup1);
    expect(sev2).toBe(sev1);
  });

  it("AC-L.8 --dry-run does not write (INV-7)", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC, "utf8");
    const before = await analyzeJson(dir);
    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(before.report, null, 2), "utf8");
    const findings = before.report!.findings as Array<{ fingerprint: string }>;
    const feedbackPath = join(dir, "feedback.json");
    writeJson(feedbackPath, {
      items: [
        {
          fingerprint: findings[0]!.fingerprint,
          decision: "wontfix",
          comment: "accepted",
        },
      ],
    });

    const { code, stdout } = await runCapture(
      ["learn", "--report", reportPath, "--feedback", feedbackPath, "--dry-run"],
      { cwd: dir },
    );
    expect(code).toBe(0);
    expect(stdout).toContain("dry-run");
    expect(existsSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"))).toBe(false);
  });

  it("AC-L.4 missing --report → exit 2", async () => {
    const { code, stderr } = await runCapture(["learn", "--feedback", "x.json"], {
      cwd: tempDir(),
    });
    expect(code).toBe(2);
    expect(stderr).toContain("--report");
  });

  it("AC-L.10 skills list shows inventory; --format json", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, ".apigovscan", "skills", "drafts"), { recursive: true });
    writeFileSync(
      join(dir, ".apigovscan", "skills", "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: "${"a".repeat(64)}"`,
        "    reason: demo",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(dir, ".apigovscan", "skills", "severities.yaml"),
      ["version: 1", "overrides:", "  - ruleId: PAGINATION-001", "    severity: info", ""].join(
        "\n",
      ),
      "utf8",
    );
    writeFileSync(
      join(dir, ".apigovscan", "skills", "drafts", "TEAM-001.yaml"),
      [
        "id: TEAM-001",
        "draft: true",
        "category: custom",
        "severity: warning",
        'message: "Demo draft."',
        "when:",
        "  op: method",
        "  in: [post]",
        "",
      ].join("\n"),
      "utf8",
    );

    const list = await runCapture(["skills", "list"], { cwd: dir });
    expect(list.code).toBe(0);
    expect(list.stdout).toContain("suppressions: 1");
    expect(list.stdout).toContain("PAGINATION-001");
    expect(list.stdout).toContain("TEAM-001");
    expect(list.stdout).toContain("[draft]");

    const json = await runCapture(["skills", "list", "--format", "json"], { cwd: dir });
    expect(json.code).toBe(0);
    const parsed = JSON.parse(json.stdout) as {
      suppressions: unknown[];
      severities: unknown[];
      drafts: Array<{ id: string; draft: boolean }>;
    };
    expect(parsed.suppressions).toHaveLength(1);
    expect(parsed.severities).toHaveLength(1);
    expect(parsed.drafts[0]).toMatchObject({ id: "TEAM-001", draft: true });
  });

  it("AC-L.11 promote flips draft; missing id → exit 2", async () => {
    const dir = tempDir();
    const drafts = join(dir, ".apigovscan", "skills", "drafts");
    mkdirSync(drafts, { recursive: true });
    const draftPath = join(drafts, "TEAM-007.yaml");
    writeFileSync(
      draftPath,
      [
        "id: TEAM-007",
        "draft: true",
        "category: custom",
        "severity: warning",
        'message: "Promote me."',
        "when:",
        "  op: method",
        "  in: [put]",
        "",
      ].join("\n"),
      "utf8",
    );

    const missing = await runCapture(["skills", "promote", "TEAM-999"], { cwd: dir });
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("draft not found");

    const badId = await runCapture(["skills", "promote", "lowercase"], { cwd: dir });
    expect(badId.code).toBe(2);
    expect(badId.stderr).toContain("PREFIX-NNN");

    const ok = await runCapture(["skills", "promote", "TEAM-007"], { cwd: dir });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("promoted");
    const content = readFileSync(draftPath, "utf8");
    expect(content).toContain("draft: false");

    // re-analyze evaluates the promoted draft
    writeFileSync(join(dir, "openapi.yaml"), SPEC, "utf8");
    const { code, report } = await analyzeJson(dir);
    expect([0, 1]).toContain(code);
    // method put won't match GET /user — just ensure no crash and draft loaded
    const findings = report!.findings as Array<{ ruleId: string }>;
    expect(findings.some((f) => f.ruleId === "TEAM-007")).toBe(false);
  });

  it("suppress writes a suppression without feedback.json (short prefix ok)", async () => {
    const dir = tempDir();
    const reportPath = join(dir, "report.json");
    writeJson(reportPath, REPORT);
    const skills = join(dir, "skills");
    const out = await runCapture(
      [
        "suppress",
        "--report",
        reportPath,
        "--fingerprint",
        "a".repeat(12),
        "--decision",
        "wontfix",
        "--reason",
        "hotfix",
        "--skills-dir",
        skills,
      ],
      { cwd: dir },
    );
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("suppress: 1 suppressions");
    const yaml = readFileSync(join(skills, "suppressions.yaml"), "utf8");
    expect(yaml).toContain("a".repeat(64));
    expect(yaml).toContain("hotfix");
  });

  it("suppress --dry-run writes nothing and validates honestly", async () => {
    const dir = tempDir();
    const reportPath = join(dir, "report.json");
    writeJson(reportPath, REPORT);
    const skills = join(dir, "skills");
    const dry = await runCapture(
      [
        "suppress",
        "--report",
        reportPath,
        "--fingerprint",
        "b".repeat(12),
        "--decision",
        "severity_change",
        "--severity",
        "info",
        "--skills-dir",
        skills,
        "--dry-run",
      ],
      { cwd: dir },
    );
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("suppress(dry-run)");
    expect(existsSync(skills)).toBe(false);

    const missingDecision = await runCapture(
      ["suppress", "--report", reportPath, "--fingerprint", "b".repeat(12)],
      { cwd: dir },
    );
    expect(missingDecision.code).toBe(2);
    expect(missingDecision.stderr).toContain("missing required option --decision");

    const severityMismatch = await runCapture(
      [
        "suppress",
        "--report",
        reportPath,
        "--fingerprint",
        "b".repeat(12),
        "--decision",
        "wontfix",
        "--severity",
        "info",
      ],
      { cwd: dir },
    );
    expect(severityMismatch.code).toBe(2);
    expect(severityMismatch.stderr).toContain("--severity only applies");

    const unknown = await runCapture(
      [
        "suppress",
        "--report",
        reportPath,
        "--fingerprint",
        "f".repeat(12),
        "--decision",
        "wontfix",
        "--reason",
        "x",
      ],
      { cwd: dir },
    );
    expect(unknown.code).toBe(2);
    expect(unknown.stderr).toContain("finding not found");
  });

  it("AC-L.12 learn does not write outside skillsDir (INV-7)", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC, "utf8");
    const before = await analyzeJson(dir);
    const reportPath = join(dir, "report.json");
    writeFileSync(reportPath, JSON.stringify(before.report, null, 2), "utf8");
    const findings = before.report!.findings as Array<{ fingerprint: string }>;
    const feedbackPath = join(dir, "feedback.json");
    writeJson(feedbackPath, {
      items: [
        {
          fingerprint: findings[0]!.fingerprint,
          decision: "false_positive",
          comment: "x",
        },
      ],
    });

    const { code } = await runCapture(
      ["learn", "--report", reportPath, "--feedback", feedbackPath],
      { cwd: dir },
    );
    expect(code).toBe(0);
    // only skills tree was created under .apigovscan (no baseline)
    expect(existsSync(join(dir, ".apigovscan", "baseline.json"))).toBe(false);
    expect(existsSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"))).toBe(true);
  });
});
