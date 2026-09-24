import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-r2-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
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

const TEAM_RULE = [
  "id: TEAM-001",
  "category: custom",
  "severity: error",
  'message: "Every operation must accept x-request-id."',
  "fix: Add a required header parameter named x-request-id.",
  "when:",
  "  all:",
  "    - op: method",
  "      in: [get, post, put, patch, delete]",
  "    - not:",
  "        op: headerRequired",
  "        name: x-request-id",
  "        in: request",
].join("\n");

describe("rules validate (AC-R2.1…3, AC-R2.10)", () => {
  it("AC-R2.1 exits 0 with count for a valid file", async () => {
    const dir = tempDir();
    const file = join(dir, "team.yaml");
    writeFileSync(file, TEAM_RULE, "utf8");
    const { code, stdout } = await runCapture([
      "rules",
      "validate",
      file,
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("ok: 1 rules");
  });

  it("AC-R2.2 exits 2 with issues for invalid DSL", async () => {
    const dir = tempDir();
    const file = join(dir, "bad.yaml");
    writeFileSync(
      file,
      [
        "id: TEAM-002",
        "category: custom",
        "severity: error",
        "message: broken",
        "when:",
        "  op: notARealAtom",
      ].join("\n"),
      "utf8",
    );
    const { code, stderr } = await runCapture([
      "rules",
      "validate",
      file,
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("invalid custom rule");
    expect(stderr).toContain("bad.yaml");
    expect(stderr).not.toContain("at Object.");
  });

  it("AC-R2.3 multi-file fails if any fails", async () => {
    const dir = tempDir();
    const good = join(dir, "good.yaml");
    const bad = join(dir, "bad.yaml");
    writeFileSync(good, TEAM_RULE, "utf8");
    writeFileSync(bad, "foo: bar\n", "utf8");
    const { code, stderr } = await runCapture([
      "rules",
      "validate",
      good,
      bad,
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("bad.yaml");
  });

  it("AC-R2.10 missing file exits 2", async () => {
    const dir = tempDir();
    const { code, stderr } = await runCapture([
      "rules",
      "validate",
      join(dir, "missing.yaml"),
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("rules file not found");
  });

  it("AC-R2.1 --format json emits machine payload", async () => {
    const dir = tempDir();
    const file = join(dir, "team.yaml");
    writeFileSync(file, TEAM_RULE, "utf8");
    const { code, stdout } = await runCapture([
      "rules",
      "validate",
      file,
      "--format",
      "json",
    ]);
    expect(code).toBe(0);
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    expect(parsed!.ok).toBe(true);
  });
});

describe("rules list (AC-R2.6)", () => {
  it("lists elite rules sorted by id", async () => {
    const { code, stdout, stderr } = await runCapture(["rules", "list"]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("elite@2026.09.1");
    expect(stdout).toContain("NAMING-001");
    expect(stdout).toContain("STRUCT-001");
    const lines = stdout.split("\n").filter((l) => /^ {2}[A-Z]/.test(l));
    expect(lines.length).toBeGreaterThanOrEqual(50);
    const ids = lines.map((l) => l.trim().split(/\s+/)[0]!);
    expect(ids).toEqual([...ids].sort());
  });

  it("appends custom rules after pack when --rules given", async () => {
    const dir = tempDir();
    const file = join(dir, "team.yaml");
    writeFileSync(file, TEAM_RULE, "utf8");
    const { code, stdout } = await runCapture([
      "rules",
      "list",
      "--rules",
      file,
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("custom@");
    expect(stdout).toContain("TEAM-001");
    const customIdx = stdout.indexOf("TEAM-001");
    const namingIdx = stdout.indexOf("NAMING-001");
    expect(customIdx).toBeGreaterThan(namingIdx);
  });
});

describe("rules explain with custom (AC-R2.7)", () => {
  it("explains TEAM-001 when --rules provided", async () => {
    const dir = tempDir();
    const file = join(dir, "team.yaml");
    writeFileSync(file, TEAM_RULE, "utf8");
    const { code, stdout } = await runCapture([
      "rules",
      "explain",
      "TEAM-001",
      "--rules",
      file,
    ]);
    expect(code).toBe(0);
    expect(stdout).toContain("TEAM-001");
    expect(stdout).toContain("x-request-id");
    expect(stdout).toContain("pack: custom@");
  });

  it("exits 2 without --rules for unknown custom id", async () => {
    const { code, stderr } = await runCapture([
      "rules",
      "explain",
      "TEAM-001",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("rule not found");
  });
});

describe("analyze with custom rules (AC-R2.4, AC-R2.5, AC-R2.8)", () => {
  it("AC-R2.8 emits TEAM-001 findings with packId custom", async () => {
    const dir = tempDir();
    const file = join(dir, "team.yaml");
    writeFileSync(file, TEAM_RULE, "utf8");
    const { code, stdout, stderr } = await runCapture([
      "analyze",
      petstore,
      "--rules",
      file,
      "--format",
      "json",
      "--no-color",
      "--fail-on",
      "never",
    ]);
    if (code === 2) {
      throw new Error(`analyze failed: ${stderr}`);
    }
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const findings = parsed!.findings as Array<{
      ruleId: string;
      packId: string;
    }>;
    expect(findings.some((f) => f.ruleId === "TEAM-001")).toBe(true);
    const team = findings.find((f) => f.ruleId === "TEAM-001")!;
    expect(team.packId).toBe("custom");
  });

  it("AC-R2.4 duplicate ids across --rules files exit 2", async () => {
    const dir = tempDir();
    const a = join(dir, "a.yaml");
    const b = join(dir, "b.yaml");
    writeFileSync(a, TEAM_RULE, "utf8");
    writeFileSync(b, TEAM_RULE, "utf8");
    const { code, stderr } = await runCapture([
      "analyze",
      petstore,
      "--rules",
      a,
      "--rules",
      b,
      "--no-color",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("duplicate rule id TEAM-001");
  });

  it("AC-R2.5 custom id colliding with elite exits 2", async () => {
    const dir = tempDir();
    const file = join(dir, "clash.yaml");
    writeFileSync(file, TEAM_RULE.replace(/TEAM-001/g, "NAMING-001"), "utf8");
    const { code, stderr } = await runCapture([
      "analyze",
      petstore,
      "--rules",
      file,
      "--no-color",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("already exists in pack elite");
  });

  it("AC-R2.9 elite still validates strictSource (no-regresion via explain)", async () => {
    const { code, stdout } = await runCapture([
      "rules",
      "explain",
      "NAMING-001",
    ]);
    expect(code).toBe(0);
    expect(stdout).toMatch(/url: https?:\/\//);
  });
});
