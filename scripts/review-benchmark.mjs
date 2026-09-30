#!/usr/bin/env node
// Review benchmark runner (f14 M14.5). Requires `pnpm build` first.
// Usage: node scripts/review-benchmark.mjs --out docs/benchmarks/review-benchmark.json
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runReviewBenchmark } from "../packages/cli/dist/review-benchmark.js";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const outFlag = process.argv.indexOf("--out");
const outPath =
  outFlag !== -1 && process.argv[outFlag + 1] !== undefined
    ? resolve(process.cwd(), process.argv[outFlag + 1])
    : resolve(repoRoot, "docs", "benchmarks", "review-benchmark.json");

const result = await runReviewBenchmark(resolve(repoRoot, "fixtures", "review-corpus"));

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");

for (const c of result.cases) {
  const detection = c.comparison.supported
    ? `expected [${c.detection.expectedRuleIds.join(",") || "-"}] detected [${c.detection.detectedRuleIds.join(",") || "-"}]`
    : `unsupported (${c.format})`;
  console.log(
    `${c.id.padEnd(42)} ${String(c.withContext.tokens).padStart(6)} full ${String(c.withTruncatedContext.tokens).padStart(6)} trunc ${String(c.withoutContext.tokens).padStart(7)} raw   ${detection}`,
  );
}
console.log(
  `\ntotals: ${result.totals.cases} cases (${result.totals.comparable} comparable / ${result.totals.nonComparable} unsupported)`,
);
console.log(
  `tokens: full context ${result.totals.withContextTokens} · truncated context ${result.totals.withTruncatedContextTokens} · without context ${result.totals.withoutContextTokens} (approximation ${result.tokenizer})`,
);
console.log(
  `detection: expected ${result.totals.expectedFindings} · detected ${result.totals.detectedFindings} · missed ${result.totals.missedFindings} · unexpected ${result.totals.unexpectedFindings}`,
);
console.log(`wrote ${outPath}`);
console.log(`note: ${result.note}`);
