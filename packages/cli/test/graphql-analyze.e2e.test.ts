import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const gqlFixtures = join(repoRoot, "fixtures", "graphql");
const schema = join(gqlFixtures, "schema.graphql");
const invalid = join(gqlFixtures, "invalid.graphql");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-gql-"));
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
  io: { cwd?: string; env?: Record<string, string | undefined> } = {},
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
    ...io,
  });
  return { code, stdout, stderr };
}

describe("graphql analyze e2e (f8-graphql)", () => {
  it("AC-GQL.5 analyzes schema.graphql with the graphql pack", async () => {
    const { code, stdout } = await runCapture([
      "analyze",
      schema,
      "--format",
      "json",
      "--no-color",
    ]);
    expect(code).toBe(0);
    const report = JSON.parse(stdout) as {
      reportHash: string;
      findings: Array<{ ruleId: string }>;
      packs: Array<{ id: string }>;
      score: { value: number; grade: string };
    };
    expect(report.packs.map((p) => p.id)).toEqual(["graphql"]);
    expect(report.findings.map((f) => f.ruleId).sort()).toEqual([
      "GQL-001",
      "GQL-002",
      "GQL-003",
      "GQL-007",
    ]);
    expect(report.score.value).toBeGreaterThan(0);
    expect(report.score.grade).toMatch(/^[A-F]$/);
  });

  it("AC-GQL.5 deterministic across runs", async () => {
    const first = await runCapture(["analyze", schema, "--format", "json", "--no-color"]);
    const second = await runCapture(["analyze", schema, "--format", "json", "--no-color"]);
    const a = JSON.parse(first.stdout) as { reportHash: string };
    const b = JSON.parse(second.stdout) as { reportHash: string };
    expect(a.reportHash).toBe(b.reportHash);
  });

  it("AC-GQL.5 invalid SDL exits 2 with line info", async () => {
    const { code, stderr } = await runCapture(["analyze", invalid, "--no-color"]);
    expect(code).toBe(2);
    expect(stderr).toContain("failed to parse");
    expect(stderr).toContain("line");
  });

  it("AC-GQL.6 discovers schema.graphql but not client fragments", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "api"));
    copyFileSync(schema, join(dir, "api", "schema.graphql"));
    copyFileSync(join(gqlFixtures, "client-fragment.graphql"), join(dir, "client.graphql"));
    const { code, stdout } = await runCapture(["analyze", ".", "--format", "json", "--no-color"], {
      cwd: dir,
    });
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout) as {
      input: Array<{ path: string }>;
    };
    expect(report.input.map((i) => i.path)).toEqual(["api/schema.graphql"]);
  });

  it("AC-GQL.6 directory with only client fragments exits 2", async () => {
    const dir = tempDir();
    copyFileSync(join(gqlFixtures, "client-fragment.graphql"), join(dir, "client.graphql"));
    const { code, stderr } = await runCapture(["analyze", dir, "--no-color"]);
    expect(code).toBe(2);
    expect(stderr).toContain("no API specs found");
  });

  it("rules explain resolves GQL ids", async () => {
    const { code, stdout } = await runCapture(["rules", "explain", "GQL-001"]);
    expect(code).toBe(0);
    expect(stdout).toContain("camelCase");
  });
});
