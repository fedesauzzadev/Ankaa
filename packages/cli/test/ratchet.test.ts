import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { computeRatchetStats } from "../src/baseline.js";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-ratchet-"));
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

const DEBT_PATH = (name: string): string[] => [
  `  ${name}:`,
  "    get:",
  "      summary: Get thing",
  "      description: Returns a thing.",
  "      responses:",
  '        "200":',
  "          description: ok",
];

function specWith(paths: string[]): string {
  const lines = [
    "openapi: 3.1.0",
    "info:",
    "  title: Ratchet API",
    "  version: 1.0.0",
  ];
  if (paths.length > 0) {
    lines.push("paths:");
    lines.push(...paths.flat());
  }
  lines.push("");
  return lines.join("\n");
}

describe("computeRatchetStats (unit)", () => {
  const fp = (n: number): string => n.toString(16).padStart(64, "0");

  it("net zero when nothing changed", () => {
    const stats = computeRatchetStats({
      baselineFingerprints: new Set([fp(1), fp(2)]),
      currentFindings: [
        { fingerprint: fp(1), severity: "warning" },
        { fingerprint: fp(2), severity: "info" },
      ],
      newFindings: [],
      severity: "warning",
    });
    expect(stats).toEqual({ newCount: 0, resolvedCount: 0, netDelta: 0 });
  });

  it("gate error ignores warnings; gate warning counts errors+warnings", () => {
    const newFindings = [
      { fingerprint: fp(9), severity: "error" },
      { fingerprint: fp(10), severity: "warning" },
      { fingerprint: fp(11), severity: "info" },
    ];
    const base = computeRatchetStats({
      baselineFingerprints: new Set<string>(),
      currentFindings: newFindings,
      newFindings,
      severity: "error",
    });
    expect(base.newCount).toBe(1);
    const wide = computeRatchetStats({
      baselineFingerprints: new Set<string>(),
      currentFindings: newFindings,
      newFindings,
      severity: "warning",
    });
    expect(wide.newCount).toBe(2);
  });

  it("baseline entry silenced by skills counts as resolved", () => {
    const stats = computeRatchetStats({
      baselineFingerprints: new Set([fp(1), fp(2)]),
      currentFindings: [{ fingerprint: fp(1), severity: "warning" }],
      newFindings: [],
      severity: "warning",
    });
    expect(stats).toEqual({ newCount: 0, resolvedCount: 1, netDelta: -1 });
  });
});

describe("analyze --ratchet (e2e, AC-RA.*)", () => {
  it("AC-RA.1/2/4 baseline → net 0 (exit 0) → debt grows (exit 1) → improves (exit 0)", async () => {
    const dir = tempDir();
    const specA = join(dir, "a.yaml");
    writeFileSync(specA, specWith(DEBT_PATH("/user")), "utf8");

    const written = await runCapture(
      ["analyze", specA, "--write-baseline", "--baseline-path", join(dir, "base.json"), "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect(written.code).toBe(0);
    const reportA = JSON.parse(written.stdout) as {
      summary: { total: number };
      findings: Array<{ fingerprint: string; severity: string }>;
    };
    expect(reportA.summary.total).toBeGreaterThan(0);

    const same = await runCapture(
      ["analyze", specA, "--baseline", "--baseline-path", join(dir, "base.json"), "--ratchet", "--ratchet-severity", "warning", "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect(same.code).toBe(0);
    const sameReport = JSON.parse(same.stdout) as { summary: { ratchet?: { newCount: number; resolvedCount: number; netDelta: number } } };
    expect(sameReport.summary.ratchet).toEqual({ newCount: 0, resolvedCount: 0, netDelta: 0 });

    const specB = join(dir, "b.yaml");
    writeFileSync(specB, specWith([DEBT_PATH("/user"), DEBT_PATH("/admin")]), "utf8");
    const worse = await runCapture(
      ["analyze", specB, "--baseline", "--baseline-path", join(dir, "base.json"), "--ratchet", "--ratchet-severity", "warning", "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect(worse.code).toBe(1);
    const worseReport = JSON.parse(worse.stdout) as {
      summary: { ratchet?: { newCount: number; resolvedCount: number; netDelta: number } };
      findings: Array<{ severity: string }>;
    };
    const expectedNew = worseReport.findings.filter((f) => f.severity !== "info").length;
    expect(worseReport.summary.ratchet).toEqual({
      newCount: expectedNew,
      resolvedCount: 0,
      netDelta: expectedNew,
    });
    expect(expectedNew).toBeGreaterThan(0);

    const specC = join(dir, "c.yaml");
    writeFileSync(specC, specWith([]), "utf8");
    const better = await runCapture(
      ["analyze", specC, "--baseline", "--baseline-path", join(dir, "base.json"), "--ratchet", "--ratchet-severity", "warning", "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect(better.code).toBe(0);
    const betterReport = JSON.parse(better.stdout) as { summary: { ratchet?: { newCount: number; resolvedCount: number; netDelta: number } } };
    expect(betterReport.summary.ratchet!.newCount).toBe(0);
    expect(betterReport.summary.ratchet!.resolvedCount).toBeGreaterThan(0);
    expect(betterReport.summary.ratchet!.netDelta).toBeLessThan(0);
  });

  it("AC-RA.6 console shows the ratchet note", async () => {
    const dir = tempDir();
    const specA = join(dir, "a.yaml");
    writeFileSync(specA, specWith(DEBT_PATH("/user")), "utf8");
    await runCapture(
      ["analyze", specA, "--write-baseline", "--baseline-path", join(dir, "base.json"), "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    const run1 = await runCapture(
      ["analyze", specA, "--baseline", "--baseline-path", join(dir, "base.json"), "--ratchet", "--ratchet-severity", "warning", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect(run1.code).toBe(0);
    expect(run1.stdout).toContain("ratchet:");
    expect(run1.stdout).toContain("net +0");
  });

  it("AC-RA.5 baseline entry suppressed by skills counts as resolved", async () => {
    const dir = tempDir();
    const specA = join(dir, "a.yaml");
    writeFileSync(specA, specWith(DEBT_PATH("/user")), "utf8");
    const first = await runCapture(
      ["analyze", specA, "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    const report = JSON.parse(first.stdout) as { findings: Array<{ fingerprint: string }> };
    const target = report.findings[0]!;
    await runCapture(
      ["analyze", specA, "--write-baseline", "--baseline-path", join(dir, "base.json"), "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );

    const skillsDir = join(dir, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      ["version: 1", "suppressions:", `  - fingerprint: ${target.fingerprint}`, "    reason: skill-hidden", ""].join("\n"),
      "utf8",
    );

    const run1 = await runCapture(
      ["analyze", specA, "--baseline", "--baseline-path", join(dir, "base.json"), "--ratchet", "--ratchet-severity", "warning", "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect(run1.code).toBe(0);
    const parsed = JSON.parse(run1.stdout) as { summary: { ratchet?: { resolvedCount: number } } };
    expect(parsed.summary.ratchet!.resolvedCount).toBe(1);
  });

  it("AC-RA.3 usage validations are exit 2", async () => {
    const dir = tempDir();
    const specA = join(dir, "a.yaml");
    writeFileSync(specA, specWith(DEBT_PATH("/user")), "utf8");

    const noBaseline = await runCapture(
      ["analyze", specA, "--ratchet", "--no-color"],
      { cwd: dir },
    );
    expect(noBaseline.code).toBe(2);
    expect(noBaseline.stderr).toContain("--ratchet requires baseline");

    const badSeverity = await runCapture(
      ["analyze", specA, "--baseline", "--ratchet", "--ratchet-severity", "info", "--no-color"],
      { cwd: dir },
    );
    expect(badSeverity.code).toBe(2);
    expect(badSeverity.stderr).toContain("--ratchet-severity");

    const orphanSeverity = await runCapture(
      ["analyze", specA, "--ratchet-severity", "warning", "--no-color"],
      { cwd: dir },
    );
    expect(orphanSeverity.code).toBe(2);
    expect(orphanSeverity.stderr).toContain("--ratchet-severity requires --ratchet");
  });

  it("AC-RA.4 deterministic: same input + baseline ⇒ same netDelta and reportHash", async () => {
    const dir = tempDir();
    const specA = join(dir, "a.yaml");
    writeFileSync(specA, specWith(DEBT_PATH("/user")), "utf8");
    await runCapture(
      ["analyze", specA, "--write-baseline", "--baseline-path", join(dir, "base.json"), "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    const specB = join(dir, "b.yaml");
    writeFileSync(specB, specWith([DEBT_PATH("/user"), DEBT_PATH("/admin")]), "utf8");
    const args = [
      "analyze",
      specB,
      "--baseline",
      "--baseline-path",
      join(dir, "base.json"),
      "--ratchet",
      "--ratchet-severity",
      "warning",
      "--format",
      "json",
      "--fail-on",
      "never",
      "--no-color",
    ];
    const first = await runCapture(args, { cwd: dir });
    const second = await runCapture(args, { cwd: dir });
    expect(first.code).toBe(second.code);
    const a = JSON.parse(first.stdout) as { reportHash: string; summary: { ratchet?: unknown } };
    const b = JSON.parse(second.stdout) as { reportHash: string; summary: { ratchet?: unknown } };
    expect(a.reportHash).toBe(b.reportHash);
    expect(a.summary.ratchet).toEqual(b.summary.ratchet);
  });
});
