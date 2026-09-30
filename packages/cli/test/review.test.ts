import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { packageVersion } from "@ankaa/core";
import { loadConfig } from "../src/config.js";
import { prepareAnalysis } from "../src/analyze-setup.js";
import { createFsPackRepository, createFsSpecLoader } from "../src/loaders.js";
import { reviewUseCase } from "../src/review.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-review-unit-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

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

async function evaluate(cwd: string, baselinePath: string, candidatePath: string) {
  const configResult = loadConfig(cwd, undefined);
  if (!configResult.ok) throw new Error(configResult.error);
  const prepared = prepareAnalysis(cwd, configResult.config, {
    rulesFiles: [],
    baselineMode: "off",
  });
  if (!prepared.ok) throw new Error(prepared.error);
  return reviewUseCase(
    { loader: createFsSpecLoader(), packs: createFsPackRepository(cwd) },
    {
      cwd,
      baselinePath,
      candidatePath,
      setup: prepared.setup,
      failOn: "error",
      toolVersion: packageVersion(),
    },
  );
}

describe("reviewUseCase (f14 shared evaluator)", () => {
  it("merges candidate governance and breaking findings deterministically", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "base.yaml"), fixture("/users"), "utf8");
    writeFileSync(join(dir, "candidate.yaml"), fixture("/user"), "utf8");

    const first = await evaluate(dir, "base.yaml", "candidate.yaml");
    const second = await evaluate(dir, "base.yaml", "candidate.yaml");

    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.review.outcome).toBe("findings");
    expect(first.review.comparison).toEqual({ supported: true, format: "openapi" });
    expect(first.review.baseline.format).toBe("openapi");
    expect(first.review.findings.map((f) => f.ruleId)).toEqual(
      expect.arrayContaining(["BRK-001", "NAMING-001"]),
    );
    expect(first.exitCode).toBe(1);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.review.reportHash).toBe(first.review.reportHash);
  });

  it("reports unsupported comparison as an explicit partial error, never clean", async () => {
    const dir = tempDir();
    const graphql = join(repoRoot, "fixtures", "graphql", "schema.graphql");
    writeFileSync(join(dir, "base.graphql"), readFileSync(graphql));
    writeFileSync(join(dir, "candidate.graphql"), readFileSync(graphql));

    const result = await evaluate(dir, "base.graphql", "candidate.graphql");

    expect(result.ok).toBe(false);
    if (result.ok || !result.comparisonUnsupported) return;
    expect(result.exitCode).toBe(2);
    expect(result.review.outcome).toBe("error");
    expect(result.review.comparison.supported).toBe(false);
    expect(result.review.comparison.reason).toContain("OpenAPI and Swagger");
    expect(result.review.errors).toEqual([
      { code: "comparison-unsupported", message: "Inputs cannot be compared." },
    ]);
    expect(result.review.findings.length).toBeGreaterThan(0);
    expect(result.review.candidate.format).toBe("graphql");
  });

  it("surfaces unreadable inputs as an operational error", async () => {
    const dir = tempDir();
    const result = await evaluate(dir, "missing.yaml", "also-missing.yaml");
    expect(result.ok).toBe(false);
    if (result.ok || result.comparisonUnsupported) return;
    expect(result.error).toContain("cannot read review inputs");
    expect(result.exitCode).toBe(2);
  });
});
