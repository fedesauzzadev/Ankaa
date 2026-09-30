import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { packageVersion } from "@apigovscan/core";
import { loadConfig } from "./config.js";
import { prepareAnalysis } from "./analyze-setup.js";
import { createFsPackRepository, createFsSpecLoader } from "./loaders.js";
import { reviewUseCase } from "./review.js";

/**
 * Reference prompt a user would paste (plus both full contracts) to ask an LLM
 * for the same review without ApiGovScan context. English: global CI consumers.
 */
export const REFERENCE_REVIEW_PROMPT = [
  "You are reviewing an API change.",
  "Contract A is the baseline version; Contract B is the candidate.",
  "Compare them and list every breaking change for existing clients",
  "(removed operations, newly required parameters or request fields, removed",
  "responses or enum values, type/format changes, new authentication",
  "requirements) plus every governance issue you can find (naming, docs,",
  "errors, pagination, security hygiene).",
  "For each issue include: rule, location in the contract, evidence, and a",
  "suggested fix. Answer with a numbered list.",
  "",
  "### Contract A (baseline)",
  "",
].join("\n");

export const TOKENIZER_NOTE = "chars/4 (approximation; no model called)";

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface ReviewBenchmarkCase {
  id: string;
  format: string;
  comparable: boolean;
  baseline: string;
  candidate: string;
  expectDiffRuleIds: string[];
}

export interface ReviewBenchmarkManifest {
  schemaVersion: number;
  cases: ReviewBenchmarkCase[];
}

export interface ReviewBenchmarkCaseResult {
  id: string;
  format: string;
  comparison: { supported: boolean; reason?: string };
  withContext: { tokens: number; contextChars: number };
  withTruncatedContext: { tokens: number; totalFindings: number; truncated: boolean };
  withoutContext: {
    tokens: number;
    promptChars: number;
    baselineChars: number;
    candidateChars: number;
  };
  detection: {
    expectedRuleIds: string[];
    detectedRuleIds: string[];
    unexpectedRuleIds: string[];
    missedRuleIds: string[];
    totalFindings: number;
  };
  durationMs: number;
}

export interface ReviewBenchmarkResult {
  schemaVersion: 1;
  toolVersion: string;
  tokenizer: string;
  runtime: string;
  cases: ReviewBenchmarkCaseResult[];
  totals: {
    cases: number;
    comparable: number;
    nonComparable: number;
    withContextTokens: number;
    withTruncatedContextTokens: number;
    withoutContextTokens: number;
    expectedFindings: number;
    detectedFindings: number;
    missedFindings: number;
    unexpectedFindings: number;
  };
  note: string;
}

export function loadReviewBenchmarkManifest(corpusDir: string): ReviewBenchmarkManifest {
  const manifest = JSON.parse(
    readFileSync(join(corpusDir, "manifest.json"), "utf8"),
  ) as ReviewBenchmarkManifest;
  if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.cases)) {
    throw new Error("invalid review corpus manifest (expected schemaVersion 1 with cases[])");
  }
  return manifest;
}

function sortedUnique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

export async function runReviewBenchmark(
  corpusDir: string,
  opts?: { toolVersion?: string },
): Promise<ReviewBenchmarkResult> {
  const manifest = loadReviewBenchmarkManifest(corpusDir);
  const configResult = loadConfig(corpusDir, undefined);
  if (!configResult.ok) throw new Error(configResult.error);
  const prepared = prepareAnalysis(corpusDir, configResult.config, {
    rulesFiles: [],
    baselineMode: "off",
  });
  if (!prepared.ok) throw new Error(prepared.error);

  const caseResults: ReviewBenchmarkCaseResult[] = [];
  for (const testCase of manifest.cases) {
    const baselinePath = resolve(corpusDir, testCase.baseline);
    const candidatePath = resolve(corpusDir, testCase.candidate);
    const started = performance.now();
    const evaluation = await reviewUseCase(
      { loader: createFsSpecLoader(), packs: createFsPackRepository(corpusDir) },
      {
        cwd: corpusDir,
        baselinePath,
        candidatePath,
        setup: prepared.setup,
        failOn: "never",
        toolVersion: opts?.toolVersion ?? packageVersion(),
      },
    );
    const durationMs = Math.round(performance.now() - started);

    if (!evaluation.ok && !evaluation.comparisonUnsupported) {
      throw new Error(`corpus case ${testCase.id} failed: ${evaluation.error}`);
    }

    const supported = evaluation.ok;
    const expected = sortedUnique(testCase.expectDiffRuleIds);
    const diffRuleIds = supported
      ? evaluation.review.findings
          .map((f) => f.ruleId)
          .filter((ruleId) => ruleId.startsWith("BRK-"))
      : [];
    const detected = sortedUnique(diffRuleIds);
    const totalFindings = evaluation.review.findings.length;

    const contextPayload = evaluation.ok
      ? evaluation.review
      : { ...evaluation.review, note: "candidate governance findings only" };
    const contextText = JSON.stringify(contextPayload);
    const truncatedText = JSON.stringify({
      ...contextPayload,
      findings: contextPayload.findings.slice(0, 20),
      totalFindings: contextPayload.findings.length,
      truncated: contextPayload.findings.length > 20,
      ...(contextPayload.findings.length > 20
        ? { note: "truncated: use CLI for the full review" }
        : {}),
    });
    const baselineText = readFileSync(baselinePath, "utf8");
    const candidateText = readFileSync(candidatePath, "utf8");
    const withoutContextText =
      REFERENCE_REVIEW_PROMPT +
      baselineText +
      "\n\n### Contract B (candidate)\n\n" +
      candidateText;

    caseResults.push({
      id: testCase.id,
      format: testCase.format,
      comparison: supported
        ? { supported: true }
        : { supported: false, reason: evaluation.review.comparison.reason },
      withContext: {
        tokens: estimateTokens(contextText),
        contextChars: contextText.length,
      },
      withTruncatedContext: {
        tokens: estimateTokens(truncatedText),
        totalFindings: contextPayload.findings.length,
        truncated: contextPayload.findings.length > 20,
      },
      withoutContext: {
        tokens: estimateTokens(withoutContextText),
        promptChars: REFERENCE_REVIEW_PROMPT.length,
        baselineChars: baselineText.length,
        candidateChars: candidateText.length,
      },
      detection: {
        expectedRuleIds: expected,
        detectedRuleIds: detected,
        unexpectedRuleIds: detected.filter((ruleId) => !expected.includes(ruleId)),
        missedRuleIds: expected.filter((ruleId) => !detected.includes(ruleId)),
        totalFindings,
      },
      durationMs,
    });
  }

  const comparable = caseResults.filter((c) => c.comparison.supported).length;
  return {
    schemaVersion: 1,
    toolVersion: opts?.toolVersion ?? packageVersion(),
    tokenizer: TOKENIZER_NOTE,
    runtime: `node ${process.version} on ${process.platform}`,
    cases: caseResults,
    totals: {
      cases: caseResults.length,
      comparable,
      nonComparable: caseResults.length - comparable,
      withContextTokens: caseResults.reduce((sum, c) => sum + c.withContext.tokens, 0),
      withTruncatedContextTokens: caseResults.reduce(
        (sum, c) => sum + c.withTruncatedContext.tokens,
        0,
      ),
      withoutContextTokens: caseResults.reduce((sum, c) => sum + c.withoutContext.tokens, 0),
      expectedFindings: caseResults.reduce(
        (sum, c) => sum + c.detection.expectedRuleIds.length,
        0,
      ),
      detectedFindings: caseResults.reduce(
        (sum, c) => sum + c.detection.detectedRuleIds.length,
        0,
      ),
      missedFindings: caseResults.reduce((sum, c) => sum + c.detection.missedRuleIds.length, 0),
      unexpectedFindings: caseResults.reduce(
        (sum, c) => sum + c.detection.unexpectedRuleIds.length,
        0,
      ),
    },
    note: "Token counts are chars/4 approximations of the reference prompt path vs the ApiGovScan context package; no model was called. Detection is the deterministic engine against corpus ground truth. durationMs is machine-dependent. No savings percentage is claimed without measured model results.",
  };
}
