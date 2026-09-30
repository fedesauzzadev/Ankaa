import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-review-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function runCapture(
  argv: string[],
  cwd: string,
): Promise<{ code: number; stdout: string; stderr: string }> {
  let stdout = "";
  let stderr = "";
  const code = await run(["node", "cli", ...argv], {
    stdout: (text) => {
      stdout += text;
    },
    stderr: (text) => {
      stderr += text;
    },
    env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
    cwd,
    isTTY: false,
  });
  return { code, stdout, stderr };
}

function fixture(path: string): string {
  return [
    "openapi: 3.1.0",
    "info:",
    "  title: Users",
    "  version: 1.0.0",
    "paths:",
    `  ${path}:`,
    "    get:",
    "      operationId: getUser",
    "      responses:",
    '        "200":',
    "          description: OK",
    "",
  ].join("\n");
}

function swaggerFixture(): string {
  return [
    'swagger: "2.0"',
    "info:",
    "  title: Users",
    "  version: 1.0.0",
    "host: api.example.com",
    "basePath: /v1",
    "schemes: [https]",
    "paths:",
    "  /users:",
    "    get:",
    "      operationId: listUsers",
    "      responses:",
    '        "200":',
    "          description: OK",
    "",
  ].join("\n");
}

describe("review command (f14-agent-api-review)", () => {
  it("combines candidate governance and compatibility findings deterministically", async () => {
    const dir = tempDir();
    const baseline = join(dir, "base.yaml");
    const candidate = join(dir, "candidate.yaml");
    writeFileSync(baseline, fixture("/users"), "utf8");
    writeFileSync(candidate, fixture("/user"), "utf8");

    const first = await runCapture(
      ["review", baseline, candidate, "--format", "json", "--no-color"],
      dir,
    );
    const second = await runCapture(
      ["review", baseline, candidate, "--format", "json", "--no-color"],
      dir,
    );

    expect(first.code, first.stderr).toBe(1);
    const report = JSON.parse(first.stdout) as {
      schemaVersion: number;
      outcome: string;
      baseline: { path: string; format: string };
      candidate: { path: string; format: string };
      comparison: { supported: boolean };
      packs: Array<{ id: string }>;
      findings: Array<{ ruleId: string }>;
      reportHash: string;
    };
    expect(report.schemaVersion).toBe(1);
    expect(report.outcome).toBe("findings");
    expect(report.baseline).toMatchObject({ path: "base.yaml", format: "openapi" });
    expect(report.candidate).toMatchObject({ path: "candidate.yaml", format: "openapi" });
    expect(report.comparison.supported).toBe(true);
    expect(report.packs.map((pack) => pack.id)).toEqual(["diff", "elite"]);
    expect(report.findings.map((finding) => finding.ruleId)).toEqual(
      expect.arrayContaining(["BRK-001", "NAMING-001"]),
    );
    expect(report.reportHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(second.stdout).reportHash).toBe(report.reportHash);
  });

  it("recognizes Swagger inputs and compares them after conversion", async () => {
    const dir = tempDir();
    const baseline = join(dir, "base.yaml");
    const candidate = join(dir, "candidate.yaml");
    writeFileSync(baseline, swaggerFixture(), "utf8");
    writeFileSync(candidate, swaggerFixture(), "utf8");

    const result = await runCapture(["review", baseline, candidate, "--format", "json"], dir);
    const payload = JSON.parse(result.stdout) as {
      baseline: { format: string };
      candidate: { format: string };
      comparison: { supported: boolean };
    };
    expect([0, 1]).toContain(result.code);
    expect(payload.baseline.format).toBe("swagger");
    expect(payload.candidate.format).toBe("swagger");
    expect(payload.comparison.supported).toBe(true);
  });

  it("prints the comparison result and findings for a person", async () => {
    const dir = tempDir();
    const baseline = join(dir, "base.yaml");
    const candidate = join(dir, "candidate.yaml");
    writeFileSync(baseline, fixture("/users"), "utf8");
    writeFileSync(candidate, fixture("/user"), "utf8");

    const result = await runCapture(["review", baseline, candidate, "--no-color"], dir);
    expect(result.code).toBe(1);
    expect(result.stdout).toContain("review: findings");
    expect(result.stdout).toContain("baseline: base.yaml → candidate: candidate.yaml");
    expect(result.stdout).toContain("BRK-001");
    expect(result.stdout).toContain("NAMING-001");
  });

  it("returns an explicit error when compatibility comparison is unsupported", async () => {
    const dir = tempDir();
    const graphql = join(repoRoot, "fixtures", "graphql", "schema.graphql");
    const baseline = join(dir, "base.graphql");
    const candidate = join(dir, "candidate.graphql");
    writeFileSync(baseline, readFileSync(graphql));
    writeFileSync(candidate, readFileSync(graphql));

    const result = await runCapture(["review", baseline, candidate, "--format", "json"], dir);
    const payload = JSON.parse(result.stdout) as {
      outcome: string;
      comparison: { supported: boolean; reason: string };
      findings: Array<{ ruleId: string }>;
      reportHash: string;
    };
    expect(result.code).toBe(2);
    expect(payload.outcome).toBe("error");
    expect(payload.comparison.supported).toBe(false);
    expect(payload.comparison.reason).toContain("OpenAPI and Swagger");
    expect(payload.findings.length).toBeGreaterThan(0);
    expect(payload.reportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects missing paths instead of returning a clean review", async () => {
    const result = await runCapture(["review", "missing.yaml", "also-missing.yaml"], tempDir());
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("input not found");
  });
});

describe("review UX quality (f14 M14.4)", () => {
  it("fingerprint suppression hides only its finding and reports the count", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "base.yaml"), fixture("/users"), "utf8");
    writeFileSync(join(dir, "candidate.yaml"), fixture("/user"), "utf8");

    const first = await runCapture(
      ["review", "base.yaml", "candidate.yaml", "--format", "json"],
      dir,
    );
    const report = JSON.parse(first.stdout) as {
      findings: Array<{ ruleId: string; fingerprint: string }>;
    };
    const brk = report.findings.find((f) => f.ruleId === "BRK-001")!;
    expect(brk).toBeDefined();

    mkdirSync(join(dir, ".ankaa", "skills"), { recursive: true });
    writeFileSync(
      join(dir, ".ankaa", "skills", "suppressions.yaml"),
      [`version: 1`, `suppressions:`, `  - fingerprint: "${brk.fingerprint}"`, `    reason: "Removal accepted for v2"`].join(
        "\n",
      ),
      "utf8",
    );

    const second = await runCapture(["review", "base.yaml", "candidate.yaml"], dir);
    expect(second.code).toBe(1);
    expect(second.stdout).not.toContain("BRK-001");
    expect(second.stdout).toContain("NAMING-001");
    expect(second.stdout).toContain("(skills: 1 suppressed)");

    const json = await runCapture(
      ["review", "base.yaml", "candidate.yaml", "--format", "json"],
      dir,
    );
    const suppressedReport = JSON.parse(json.stdout) as {
      summary: { skillsSuppressed?: number };
      findings: Array<{ ruleId: string }>;
    };
    expect(suppressedReport.summary.skillsSuppressed).toBe(1);
    expect(suppressedReport.findings.some((f) => f.ruleId === "BRK-001")).toBe(false);
    expect(suppressedReport.findings.some((f) => f.ruleId === "NAMING-001")).toBe(true);
  });

  it("match-based suppression stays scoped and does not hide adjacent findings", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "base.yaml"), fixture("/users"), "utf8");
    writeFileSync(join(dir, "candidate.yaml"), fixture("/user"), "utf8");

    mkdirSync(join(dir, ".ankaa", "skills"), { recursive: true });
    writeFileSync(
      join(dir, ".ankaa", "skills", "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        "  - match:",
        "      ruleId: NAMING-001",
        '      apiPath: "^/user$"',
        '    reason: "Legacy singular path frozen"',
      ].join("\n"),
      "utf8",
    );

    const result = await runCapture(["review", "base.yaml", "candidate.yaml"], dir);
    expect(result.code).toBe(1);
    expect(result.stdout).not.toContain("NAMING-001");
    expect(result.stdout).toContain("BRK-001");
    expect(result.stdout).toContain("AUTH-001");
    expect(result.stdout).toContain("(skills: 1 suppressed)");
  });

  it("clean, findings, unsupported and error states are never confusable", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "base.yaml"), fixture("/users"), "utf8");
    writeFileSync(join(dir, "candidate.yaml"), fixture("/user"), "utf8");

    const findings = await runCapture(["review", "base.yaml", "candidate.yaml"], dir);
    expect(findings.code).toBe(1);
    expect(findings.stdout).toContain("review: findings");
    expect(findings.stdout).not.toContain("review: clean");
    expect(findings.stdout).toContain("fix:");

    // clean = successful evaluation with no findings visible after suppressions
    const first = await runCapture(
      ["review", "base.yaml", "candidate.yaml", "--format", "json"],
      dir,
    );
    const fingerprints = (
      (JSON.parse(first.stdout) as { findings: Array<{ fingerprint: string }> }).findings ?? []
    ).map((f) => f.fingerprint);
    expect(fingerprints.length).toBeGreaterThan(0);
    mkdirSync(join(dir, ".ankaa", "skills"), { recursive: true });
    writeFileSync(
      join(dir, ".ankaa", "skills", "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        ...fingerprints.map(
          (fp, i) => `  - fingerprint: "${fp}"\n    reason: "accepted debt ${i + 1}"`,
        ),
      ].join("\n"),
      "utf8",
    );
    const clean = await runCapture(["review", "base.yaml", "candidate.yaml"], dir);
    expect(clean.code).toBe(0);
    expect(clean.stdout).toContain("review: clean");
    expect(clean.stdout).not.toContain("review: findings");
    expect(clean.stdout).not.toContain("review: error");

    const unsupportedDir = tempDir();
    const graphql = readFileSync(join(repoRoot, "fixtures", "graphql", "schema.graphql"));
    writeFileSync(join(unsupportedDir, "gql-base.graphql"), graphql);
    writeFileSync(join(unsupportedDir, "gql-candidate.graphql"), graphql);
    const unsupported = await runCapture(
      ["review", "gql-base.graphql", "gql-candidate.graphql"],
      unsupportedDir,
    );
    expect(unsupported.stdout).toContain("review: error");
    expect(unsupported.stdout).toContain("not supported for graphql → graphql");

    const missing = await runCapture(["review", "nope.yaml", "candidate.yaml"], dir);
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("input not found");
    expect(missing.stdout).toBe("");
  });

  it("AC-14.11 does not leak spec bodies into review output or errors", async () => {
    const marker = "XMARKERX-DO-NOT-LEAK";
    const dir = tempDir();
    const leaky = [
      "openapi: 3.1.0",
      "info:",
      "  title: Users",
      "  version: 1.0.0",
      `  description: ${marker} internal notes`,
      "paths:",
      "  /users:",
      "    get:",
      "      operationId: listUsers",
      `      summary: ${marker}`,
      "      responses:",
      '        "200":',
      `          description: ${marker}`,
      "",
    ].join("\n");
    writeFileSync(join(dir, "base.yaml"), leaky, "utf8");
    writeFileSync(join(dir, "candidate.yaml"), leaky.replace("/users", "/user"), "utf8");

    const findings = await runCapture(
      ["review", "base.yaml", "candidate.yaml", "--format", "json", "--output", "review.json"],
      dir,
    );
    expect(findings.code).toBe(1);
    expect(findings.stdout).not.toContain(marker);
    expect(findings.stderr).not.toContain(marker);
    expect(readFileSync(join(dir, "review.json"), "utf8")).not.toContain(marker);

    writeFileSync(join(dir, "broken.yaml"), `openapi: 3.1.0\ninfo: {description: ${marker}\n`, "utf8");
    const malformed = await runCapture(["review", "base.yaml", "broken.yaml"], dir);
    expect(malformed.code).toBe(2);
    expect(malformed.stderr).not.toContain(marker);

    const unsupportedDir = tempDir();
    const graphql = readFileSync(join(repoRoot, "fixtures", "graphql", "schema.graphql"));
    writeFileSync(join(unsupportedDir, "gql-base.graphql"), graphql);
    writeFileSync(join(unsupportedDir, "gql-candidate.graphql"), graphql);
    const unsupported = await runCapture(
      ["review", "gql-base.graphql", "gql-candidate.graphql", "--format", "json"],
      unsupportedDir,
    );
    expect(unsupported.stdout).not.toContain(marker);
    expect(unsupported.stderr).not.toContain(marker);
  });
});
