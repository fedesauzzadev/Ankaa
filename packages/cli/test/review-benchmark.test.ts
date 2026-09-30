import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { runReviewBenchmark, type ReviewBenchmarkResult } from "../src/review-benchmark.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const corpusDir = join(repoRoot, "fixtures", "review-corpus");

function stripVolatile(result: ReviewBenchmarkResult): unknown {
  return {
    ...result,
    runtime: "<stripped>",
    cases: result.cases.map((c) => ({ ...c, durationMs: "<stripped>" })),
  };
}

describe("review benchmark (f14 M14.5, AC-14.10)", () => {
  it("runs the corpus and detects every ground-truth BRK case", async () => {
    const result = await runReviewBenchmark(corpusDir, { toolVersion: "0.0.0-dev" });
    expect(result.schemaVersion).toBe(1);
    expect(result.tokenizer).toContain("chars/4");
    expect(result.totals.cases).toBe(15);
    expect(result.totals.comparable).toBe(11);
    expect(result.totals.nonComparable).toBe(4);
    expect(result.totals.missedFindings).toBe(0);
    expect(result.totals.unexpectedFindings).toBe(0);
    expect(result.totals.expectedFindings).toBe(9);
    for (const c of result.cases) {
      expect(c.withContext.tokens).toBeGreaterThan(0);
      expect(c.withoutContext.tokens).toBeGreaterThan(
        Math.floor(
          (c.withoutContext.baselineChars + c.withoutContext.candidateChars) / 4,
        ),
      );
      expect(c.detection.totalFindings).toBeGreaterThan(0);
    }
  }, 30000);

  it("is deterministic: token counts and detection are identical across runs", async () => {
    const first = await runReviewBenchmark(corpusDir, { toolVersion: "0.0.0-dev" });
    const second = await runReviewBenchmark(corpusDir, { toolVersion: "0.0.0-dev" });
    expect(stripVolatile(second)).toEqual(stripVolatile(first));
  }, 30000);
});
