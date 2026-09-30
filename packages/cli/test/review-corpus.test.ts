import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadReviewBenchmarkManifest } from "../src/review-benchmark.js";
import { loadConfig } from "../src/config.js";
import { prepareAnalysis } from "../src/analyze-setup.js";
import { createFsPackRepository, createFsSpecLoader } from "../src/loaders.js";
import { reviewUseCase } from "../src/review.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const corpusDir = join(repoRoot, "fixtures", "review-corpus");

async function evaluateCase(baseline: string, candidate: string) {
  const configResult = loadConfig(corpusDir, undefined);
  if (!configResult.ok) throw new Error(configResult.error);
  const prepared = prepareAnalysis(corpusDir, configResult.config, {
    rulesFiles: [],
    baselineMode: "off",
  });
  if (!prepared.ok) throw new Error(prepared.error);
  return reviewUseCase(
    { loader: createFsSpecLoader(), packs: createFsPackRepository(corpusDir) },
    {
      cwd: corpusDir,
      baselinePath: join(corpusDir, baseline),
      candidatePath: join(corpusDir, candidate),
      setup: prepared.setup,
      failOn: "never",
      toolVersion: "0.0.0-dev",
    },
  );
}

describe("review corpus (f14 M14.5, AC-14.3)", () => {
  const manifest = loadReviewBenchmarkManifest(corpusDir);

  it("declares a case for every BRK rule plus negatives and unsupported formats", () => {
    const ids = manifest.cases.map((c) => c.id);
    for (let i = 1; i <= 8; i++) {
      const ruleId = `BRK-${String(i).padStart(3, "0")}`;
      expect(
        manifest.cases.some((c) => c.expectDiffRuleIds.includes(ruleId)),
        `missing positive case for ${ruleId}`,
      ).toBe(true);
    }
    expect(ids).toContain("openapi-no-breaking-changes");
    expect(ids).toContain("swagger-additive-operation");
    for (const format of ["graphql", "grpc", "asyncapi", "webhooks"]) {
      expect(
        manifest.cases.filter((c) => c.format === format && !c.comparable).length,
      ).toBeGreaterThan(0);
    }
  });

  for (const testCase of manifest.cases) {
    it(`${testCase.id}: ${
      testCase.comparable
        ? `diff findings match ground truth [${testCase.expectDiffRuleIds.join(", ") || "none"}]`
        : "reports unsupported comparison, never a clean outcome"
    }`, async () => {
      const evaluation = await evaluateCase(testCase.baseline, testCase.candidate);
      if (testCase.comparable) {
        expect(evaluation.ok).toBe(true);
        if (!evaluation.ok) return;
        expect(evaluation.review.comparison).toEqual({ supported: true, format: "openapi" });
        const detected = [
          ...new Set(
            evaluation.review.findings
              .map((f) => f.ruleId)
              .filter((ruleId) => ruleId.startsWith("BRK-")),
          ),
        ].sort();
        expect(detected).toEqual([...testCase.expectDiffRuleIds].sort());
        expect(readFileSync(join(corpusDir, testCase.baseline), "utf8").length).toBeGreaterThan(
          0,
        );
      } else {
        expect(evaluation.ok).toBe(false);
        if (evaluation.ok || !evaluation.comparisonUnsupported) return;
        expect(evaluation.review.outcome).toBe("error");
        expect(evaluation.review.comparison.supported).toBe(false);
        expect(evaluation.review.comparison.reason).toContain("OpenAPI and Swagger");
        expect(evaluation.review.findings.length).toBeGreaterThan(0);
        expect(evaluation.exitCode).toBe(2);
      }
    });
  }
});
