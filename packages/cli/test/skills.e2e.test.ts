import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-skills-e2e-"));
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

function extractJson(stdout: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SPEC_WITH_DEBT = [
  "openapi: 3.1.0",
  "info:",
  "  title: Skills Debt API",
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

async function analyzeOnce(dir: string): Promise<{
  code: number;
  report: Record<string, unknown> | null;
  stdout: string;
  stderr: string;
}> {
  const { code, stdout, stderr } = await runCapture(
    ["analyze", join(dir, "openapi.yaml"), "--format", "json", "--fail-on", "never", "--no-color"],
    { cwd: dir },
  );
  return { code, report: extractJson(stdout), stdout, stderr };
}

function firstFingerprint(report: Record<string, unknown>): string {
  const findings = report.findings as Array<{ fingerprint: string }>;
  expect(findings.length).toBeGreaterThan(0);
  return findings[0]!.fingerprint;
}

describe("skills e2e (AC-S.*)", () => {
  it("AC-S.5 no skills dir → no skillsSuppressed in summary", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const { code, report } = await analyzeOnce(dir);
    expect([0, 1]).toContain(code);
    expect(report).not.toBeNull();
    const summary = report!.summary as Record<string, unknown>;
    expect(summary.skillsSuppressed).toBeUndefined();
  });

  it("AC-S.1 fingerprint suppression hides finding and counts skillsSuppressed", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");

    const before = await analyzeOnce(dir);
    const fp = firstFingerprint(before.report!);

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: ${fp}`,
        "    reason: legacy freeze",
        "",
      ].join("\n"),
      "utf8",
    );

    const after = await analyzeOnce(dir);
    expect([0, 1]).toContain(after.code);
    const summary = after.report!.summary as {
      total: number;
      skillsSuppressed?: number;
    };
    expect(summary.skillsSuppressed).toBeGreaterThanOrEqual(1);
    expect(summary.total).toBe(before.report!.summary.total - summary.skillsSuppressed);
    const findings = after.report!.findings as Array<{ fingerprint: string }>;
    expect(findings.map((f) => f.fingerprint)).not.toContain(fp);
  });

  it("AC-S.10 console shows (skills: N suppressed)", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const before = await analyzeOnce(dir);
    const fp = firstFingerprint(before.report!);

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: ${fp}`,
        "    reason: legacy freeze",
        "",
      ].join("\n"),
      "utf8",
    );

    const { code, stdout } = await runCapture(
      ["analyze", join(dir, "openapi.yaml"), "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(code);
    expect(stdout).toContain("skills:");
    expect(stdout).toContain("suppressed");
  });

  it("AC-S.4 severity override changes finding severity in report", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");

    const before = await analyzeOnce(dir);
    const findingsBefore = before.report!.findings as Array<{
      ruleId: string;
      severity: string;
      fingerprint: string;
    }>;
    expect(findingsBefore.length).toBeGreaterThan(0);
    const target = findingsBefore[0]!;
    const newSev = target.severity === "error" ? "info" : "error";

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "severities.yaml"),
      [
        "version: 1",
        "overrides:",
        `  - ruleId: ${target.ruleId}`,
        `    severity: ${newSev}`,
        "",
      ].join("\n"),
      "utf8",
    );

    const after = await analyzeOnce(dir);
    const findingsAfter = after.report!.findings as Array<{
      ruleId: string;
      severity: string;
      fingerprint: string;
    }>;
    const updated = findingsAfter.find((f) => f.fingerprint === target.fingerprint);
    // fingerprint does not include severity; same finding should show new severity
    // (unless suppressed elsewhere)
    if (updated) {
      expect(updated.severity).toBe(newSev);
    } else {
      // if all findings for that rule changed count layout, at least rule severity changed
      const sameRule = findingsAfter.filter((f) => f.ruleId === target.ruleId);
      expect(sameRule.every((f) => f.severity === newSev)).toBe(true);
    }
  });

  it("AC-S.6 invalid skills YAML → exit 2 with path", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      "version: 1\nsuppressions: not-an-array\n",
      "utf8",
    );

    const { code, stderr } = await analyzeOnce(dir);
    expect(code).toBe(2);
    expect(stderr).toContain("suppressions");
    expect(stderr).toContain("skills");
  });

  it("AC-S.7 draft:true does not fire; draft:false does (with matching spec)", async () => {
    const dir = tempDir();
    // Spec with POST /batch so method atom matches
    const spec = [
      "openapi: 3.1.0",
      "info:",
      "  title: Draft API",
      "  version: 1.0.0",
      "paths:",
      "  /batch:",
      "    post:",
      "      summary: Batch",
      "      description: Run a batch operation.",
      "      responses:",
      '        "200":',
      "          description: ok",
      "",
    ].join("\n");
    writeFileSync(join(dir, "openapi.yaml"), spec, "utf8");

    const skillsDir = join(dir, ".ankaa", "skills", "drafts");
    mkdirSync(skillsDir, { recursive: true });
    const draftRule = [
      "id: TEAM-001",
      "draft: {draftFlag}",
      "category: custom",
      "severity: warning",
      'message: "Batch endpoints must document max array size."',
      "when:",
      "  op: method",
      "  in: [post]",
      "",
    ].join("\n");

    writeFileSync(
      join(skillsDir, "TEAM-001.yaml"),
      draftRule.replace("{draftFlag}", "true"),
      "utf8",
    );

    const inactive = await analyzeOnce(dir);
    const inactiveFindings = inactive.report!.findings as Array<{
      ruleId: string;
    }>;
    expect(inactiveFindings.some((f) => f.ruleId === "TEAM-001")).toBe(false);

    writeFileSync(
      join(skillsDir, "TEAM-001.yaml"),
      draftRule.replace("{draftFlag}", "false"),
      "utf8",
    );

    const active = await analyzeOnce(dir);
    expect([0, 1]).toContain(active.code);
    const activeFindings = active.report!.findings as Array<{
      ruleId: string;
    }>;
    expect(activeFindings.some((f) => f.ruleId === "TEAM-001")).toBe(true);
  });

  it("AC-S.9 manual skills edit applies without learn (FR-34)", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const before = await analyzeOnce(dir);
    const fp = firstFingerprint(before.report!);

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    // empty first
    writeFileSync(join(skillsDir, "suppressions.yaml"), "version: 1\nsuppressions: []\n", "utf8");
    const stillVisible = await analyzeOnce(dir);
    const stillFindings = stillVisible.report!.findings as Array<{
      fingerprint: string;
    }>;
    expect(stillFindings.map((f) => f.fingerprint)).toContain(fp);

    // hand-edit → immediately reflected
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      ["version: 1", "suppressions:", `  - fingerprint: ${fp}`, "    reason: hand edit", ""].join(
        "\n",
      ),
      "utf8",
    );
    const afterEdit = await analyzeOnce(dir);
    const afterFindings = afterEdit.report!.findings as Array<{
      fingerprint: string;
    }>;
    expect(afterFindings.map((f) => f.fingerprint)).not.toContain(fp);
  });

  it("AC-S.8 load order determinism: same reportHash across runs with skills", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const first = await analyzeOnce(dir);
    const fp = firstFingerprint(first.report!);

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: "${"0".repeat(64)}"`,
        "    reason: no match",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(join(skillsDir, "severities.yaml"), "version: 1\noverrides: []\n", "utf8");

    const a = await analyzeOnce(dir);
    const b = await analyzeOnce(dir);
    expect(a.report!.reportHash).toBe(b.report!.reportHash);
    expect(fp).toMatch(/^[0-9a-f]{64}$/);
    expect(existsSync(join(dir, ".ankaa", "baseline.json"))).toBe(false);
    // skills only read, not written (INV-7)
    expect(readdirSync(skillsDir).sort()).toEqual(["severities.yaml", "suppressions.yaml"]);
  });

  it("--skills-dir flag points analyze at alternate directory", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const before = await analyzeOnce(dir);
    const fp = firstFingerprint(before.report!);

    const alt = join(dir, "alt-skills");
    mkdirSync(alt, { recursive: true });
    writeFileSync(
      join(alt, "suppressions.yaml"),
      ["version: 1", "suppressions:", `  - fingerprint: ${fp}`, "    reason: via flag", ""].join(
        "\n",
      ),
      "utf8",
    );

    const { code, stdout } = await runCapture(
      [
        "analyze",
        join(dir, "openapi.yaml"),
        "--format",
        "json",
        "--fail-on",
        "never",
        "--skills-dir",
        alt,
        "--no-color",
      ],
      { cwd: dir },
    );
    expect([0, 1]).toContain(code);
    const report = extractJson(stdout);
    expect(report).not.toBeNull();
    const summary = report!.summary as { skillsSuppressed?: number };
    expect(summary.skillsSuppressed).toBeGreaterThanOrEqual(1);
  });

  it("AC-S.12 expired waiver is ignored with a warning; future waiver applies", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const before = await analyzeOnce(dir);
    const fp = firstFingerprint(before.report!);
    const total = (before.report!.summary as { total: number }).total;

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: ${fp}`,
        "    reason: long past waiver",
        "    owner: team-a",
        "    expires: 2000-01-01",
        "",
      ].join("\n"),
      "utf8",
    );

    const expired = await analyzeOnce(dir);
    expect([0, 1]).toContain(expired.code);
    const summary = expired.report!.summary as { total: number; skillsSuppressed?: number };
    expect(summary.total).toBe(total);
    expect(summary.skillsSuppressed).toBeUndefined();
    expect(expired.stderr).toContain("suppression expired");
    expect(expired.stderr).toContain("long past waiver");

    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: ${fp}`,
        "    reason: far future waiver",
        "    expires: 2099-12-31",
        "",
      ].join("\n"),
      "utf8",
    );
    const active = await analyzeOnce(dir);
    const activeSummary = active.report!.summary as { total: number; skillsSuppressed?: number };
    expect(activeSummary.skillsSuppressed).toBeGreaterThanOrEqual(1);
    expect(activeSummary.total).toBe(total - activeSummary.skillsSuppressed!);
    expect(active.stderr).not.toContain("suppression expired");
  });

  it("AC-S.13 orphan waiver warns but keeps exit behavior", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const before = await analyzeOnce(dir);
    const total = (before.report!.summary as { total: number }).total;

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: "${"0".repeat(64)}"`,
        "    reason: ghost waiver",
        "",
      ].join("\n"),
      "utf8",
    );

    const { code, report, stderr } = await analyzeOnce(dir);
    expect([0, 1]).toContain(code);
    expect((report!.summary as { total: number }).total).toBe(total);
    expect(stderr).toContain("suppression matches no findings");
    expect(stderr).toContain("ghost waiver");
  });

  it("AC-S.11 invalid expires in YAML is exit 2", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        `  - fingerprint: "${"0".repeat(64)}"`,
        "    reason: bad date",
        "    expires: next-friday",
        "",
      ].join("\n"),
      "utf8",
    );
    const { code, stderr } = await analyzeOnce(dir);
    expect(code).toBe(2);
    expect(stderr).toContain("expires must be YYYY-MM-DD");
  });

  it("config skillsDir is honored", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const before = await analyzeOnce(dir);
    const fp = firstFingerprint(before.report!);

    const custom = join(dir, "team", "skills");
    mkdirSync(custom, { recursive: true });
    writeFileSync(
      join(custom, "suppressions.yaml"),
      ["version: 1", "suppressions:", `  - fingerprint: ${fp}`, "    reason: config dir", ""].join(
        "\n",
      ),
      "utf8",
    );
    writeFileSync(
      join(dir, "ankaa.yaml"),
      ["failOn: never", "skillsDir: team/skills", ""].join("\n"),
      "utf8",
    );

    const { code, stdout } = await runCapture(
      ["analyze", join(dir, "openapi.yaml"), "--format", "json", "--no-color"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(code);
    const report = extractJson(stdout);
    const summary = report!.summary as { skillsSuppressed?: number };
    expect(summary.skillsSuppressed).toBeGreaterThanOrEqual(1);
  });
});
