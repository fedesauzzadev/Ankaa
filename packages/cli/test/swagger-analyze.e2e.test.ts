import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const swagger2 = join(repoRoot, "fixtures", "swagger2-minimal.yaml");
const swagger1 = join(repoRoot, "fixtures", "swagger1-minimal.yaml");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

async function runCapture(
  argv: string[],
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
  });
  return { code, stdout, stderr };
}

describe("swagger legacy analyze e2e (f8-legacy-convert)", () => {
  it("AC-LG.1 analyzes Swagger 2.0 with the elite pack", async () => {
    const { code, stdout } = await runCapture([
      "analyze",
      swagger2,
      "--format",
      "json",
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout) as {
      packs: Array<{ id: string }>;
      findings: Array<{ ruleId: string }>;
    };
    expect(report.packs.map((p) => p.id)).toEqual(["elite"]);
  });

  it("AC-LG.2 analyzes Swagger 1.2 with the elite pack", async () => {
    const { code, stdout } = await runCapture([
      "analyze",
      swagger1,
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

  it("AC-LG.2 deterministic across runs", async () => {
    const first = await runCapture(["analyze", swagger1, "--format", "json", "--no-color"]);
    const second = await runCapture(["analyze", swagger1, "--format", "json", "--no-color"]);
    const a = JSON.parse(first.stdout) as { reportHash: string };
    const b = JSON.parse(second.stdout) as { reportHash: string };
    expect(a.reportHash).toBe(b.reportHash);
  });

  it("AC-LG.5 regression: OpenAPI 3.x still elite", async () => {
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
});
