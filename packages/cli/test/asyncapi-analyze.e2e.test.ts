import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const asyncapiFixtures = join(repoRoot, "fixtures", "asyncapi");
const v2 = join(asyncapiFixtures, "v2.yaml");
const invalid = join(asyncapiFixtures, "invalid.yaml");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-asyncapi-"));
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

describe("asyncapi analyze e2e (f8-asyncapi)", () => {
  it("AC-AS.5 analyzes v2.yaml with the asyncapi pack", async () => {
    const { code, stdout } = await runCapture(["analyze", v2, "--format", "json", "--no-color"]);
    expect(code).toBe(0);
    const report = JSON.parse(stdout) as {
      reportHash: string;
      findings: Array<{ ruleId: string }>;
      packs: Array<{ id: string }>;
      score: { value: number; grade: string };
    };
    expect(report.packs.map((p) => p.id)).toEqual(["asyncapi"]);
    expect(report.findings.map((f) => f.ruleId).sort()).toEqual([
      "ASYNC-001",
      "ASYNC-002",
      "ASYNC-006",
    ]);
    expect(report.score.value).toBeGreaterThan(0);
    expect(report.score.grade).toMatch(/^[A-F]$/);
  });

  it("AC-AS.5 does not steal OpenAPI yaml files (sniff regression)", async () => {
    const { code, stdout } = await runCapture([
      "analyze",
      petstore,
      "--format",
      "json",
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout) as {
      packs: Array<{ id: string }>;
    };
    expect(report.packs.map((p) => p.id)).toEqual(["elite"]);
  });

  it("AC-AS.5 deterministic across runs", async () => {
    const first = await runCapture(["analyze", v2, "--format", "json", "--no-color"]);
    const second = await runCapture(["analyze", v2, "--format", "json", "--no-color"]);
    const a = JSON.parse(first.stdout) as { reportHash: string };
    const b = JSON.parse(second.stdout) as { reportHash: string };
    expect(a.reportHash).toBe(b.reportHash);
  });

  it("AC-AS.5 invalid AsyncAPI exits 2", async () => {
    const { code, stderr } = await runCapture(["analyze", invalid, "--no-color"]);
    expect(code).toBe(2);
    expect(stderr).toContain("failed to parse");
  });

  it("AC-AS.5 discovers asyncapi.* in directories", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "events"));
    copyFileSync(v2, join(dir, "events", "asyncapi.yaml"));
    const { code, stdout } = await runCapture(["analyze", ".", "--format", "json", "--no-color"], {
      cwd: dir,
    });
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout) as {
      input: Array<{ path: string }>;
    };
    expect(report.input.map((i) => i.path)).toEqual(["events/asyncapi.yaml"]);
  });

  it("rules explain resolves ASYNC ids", async () => {
    const { code, stdout } = await runCapture(["rules", "explain", "ASYNC-001"]);
    expect(code).toBe(0);
    expect(stdout).toContain("lowercase");
  });
});
