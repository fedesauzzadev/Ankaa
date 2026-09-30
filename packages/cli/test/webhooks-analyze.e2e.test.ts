import { copyFileSync, mkdirSync, rmSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const webhooksFixtures = join(repoRoot, "fixtures", "webhooks");
const valid = join(webhooksFixtures, "valid.yaml");
const invalid = join(webhooksFixtures, "invalid.yaml");
const openapiWithWebhooks = join(webhooksFixtures, "openapi-3.1-with-webhooks.yaml");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-webhooks-"));
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

describe("webhooks analyze e2e (f8-webhooks)", () => {
  it("AC-WH.5 analyzes valid.yaml with the webhooks pack", async () => {
    const { code, stdout } = await runCapture(["analyze", valid, "--format", "json", "--no-color"]);
    expect(code).toBe(0);
    const report = JSON.parse(stdout) as {
      reportHash: string;
      findings: Array<{ ruleId: string }>;
      packs: Array<{ id: string }>;
      score: { value: number; grade: string };
    };
    expect(report.packs.map((p) => p.id)).toEqual(["webhooks"]);
    expect(report.findings.map((f) => f.ruleId).sort()).toEqual([
      "WH-001",
      "WH-003",
      "WH-004",
      "WH-005",
      "WH-006",
    ]);
    expect(report.score.value).toBeGreaterThan(0);
    expect(report.score.grade).toMatch(/^[A-F]$/);
  });

  it("AC-WH.5 does not steal OpenAPI yaml files (sniff regression)", async () => {
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

  it("AC-WH.5 OpenAPI 3.1 with webhooks section stays OpenAPI", async () => {
    const { code, stdout } = await runCapture([
      "analyze",
      openapiWithWebhooks,
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

  it("AC-WH.5 deterministic across runs", async () => {
    const first = await runCapture(["analyze", valid, "--format", "json", "--no-color"]);
    const second = await runCapture(["analyze", valid, "--format", "json", "--no-color"]);
    const a = JSON.parse(first.stdout) as { reportHash: string };
    const b = JSON.parse(second.stdout) as { reportHash: string };
    expect(a.reportHash).toBe(b.reportHash);
  });

  it("AC-WH.5 invalid webhooks exits 2", async () => {
    const { code, stderr } = await runCapture(["analyze", invalid, "--no-color"]);
    expect(code).toBe(2);
    expect(stderr).toContain("failed to parse");
  });

  it("AC-WH.5 discovers webhooks.* in directories", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "events"));
    copyFileSync(valid, join(dir, "events", "webhooks.yaml"));
    const { code, stdout } = await runCapture(["analyze", ".", "--format", "json", "--no-color"], {
      cwd: dir,
    });
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout) as {
      input: Array<{ path: string }>;
    };
    expect(report.input.map((i) => i.path)).toEqual(["events/webhooks.yaml"]);
  });

  it("rules explain resolves WH ids", async () => {
    const { code, stdout } = await runCapture(["rules", "explain", "WH-001"]);
    expect(code).toBe(0);
    expect(stdout).toContain("dot-delimited");
  });
});
