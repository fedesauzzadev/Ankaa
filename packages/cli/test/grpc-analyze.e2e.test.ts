import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
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
const grpcFixtures = join(repoRoot, "fixtures", "grpc");
const pet = join(grpcFixtures, "pet.proto");
const invalid = join(grpcFixtures, "invalid.proto");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-grpc-"));
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

describe("grpc analyze e2e (f8-grpc)", () => {
  it("AC-GR.5 analyzes pet.proto with the grpc pack", async () => {
    const { code, stdout } = await runCapture([
      "analyze",
      pet,
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
    expect(report.packs.map((p) => p.id)).toEqual(["grpc"]);
    expect(report.findings.length).toBeGreaterThan(0);
    expect(report.findings.some((f) => f.ruleId === "GRPC-001")).toBe(true);
    expect(report.score.value).toBeGreaterThan(0);
    expect(report.score.grade).toMatch(/^[A-F]$/);
  });

  it("AC-GR.5 deterministic across runs", async () => {
    const first = await runCapture([
      "analyze",
      pet,
      "--format",
      "json",
      "--no-color",
    ]);
    const second = await runCapture([
      "analyze",
      pet,
      "--format",
      "json",
      "--no-color",
    ]);
    const a = JSON.parse(first.stdout) as { reportHash: string };
    const b = JSON.parse(second.stdout) as { reportHash: string };
    expect(a.reportHash).toBe(b.reportHash);
  });

  it("AC-GR.5 invalid proto exits 2 with line info", async () => {
    const { code, stderr } = await runCapture(["analyze", invalid, "--no-color"]);
    expect(code).toBe(2);
    expect(stderr).toContain("failed to parse");
    expect(stderr).toContain("line");
  });

  it("AC-GR.5 discovers **/*.proto in directories", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "api"));
    copyFileSync(pet, join(dir, "api", "pet.proto"));
    const { code, stdout } = await runCapture(
      ["analyze", ".", "--format", "json", "--no-color"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout) as {
      input: Array<{ path: string }>;
    };
    expect(report.input.map((i) => i.path)).toEqual(["api/pet.proto"]);
  });

  it("rules explain resolves GRPC ids", async () => {
    const { code, stdout } = await runCapture(["rules", "explain", "GRPC-001"]);
    expect(code).toBe(0);
    expect(stdout).toContain("PascalCase");
  });
});
