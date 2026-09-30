import { resolve } from "node:path";
import {
  DIFF_PACK_ID,
  diffSpecs,
  sortFindings,
  type Finding,
  type Spec,
} from "@ankaa/core";
import { buildReport, type Report } from "@ankaa/reporters";
import {
  analyzeUseCase,
  computeExitCode,
  describeSuppression,
  parseSpecInput,
  type ParsedProtocol,
} from "./analyze.js";
import type { AnalysisSetup } from "./analyze-setup.js";
import { applySkillSuppressions } from "./skills.js";
import type { FailOn } from "./args.js";
import type { PackRepository, SpecLoader } from "./ports.js";

export type ReviewFormat =
  | "openapi"
  | "swagger"
  | "graphql"
  | "grpc"
  | "asyncapi"
  | "webhooks";

export const REVIEW_COMPARISON_UNSUPPORTED_REASON =
  "Compatibility comparison currently supports OpenAPI and Swagger only.";

function normalizeLabel(absPath: string, cwd: string): string {
  const rel = absPath.startsWith(cwd)
    ? absPath.slice(cwd.length).replace(/^[\\/]+/, "")
    : absPath;
  return rel.split("\\").join("/");
}

function reviewFormat(protocol: ParsedProtocol, spec: Spec): ReviewFormat {
  if (
    protocol === "openapi" &&
    spec.parseWarnings.some((warning) => warning.code === "SWAGGER_CONVERTED")
  ) {
    return "swagger";
  }
  return protocol;
}

export interface ReviewContractSide {
  path: string;
  sha256: string;
  format: ReviewFormat;
}

export interface ApiChangeReviewSuccess {
  schemaVersion: 1;
  outcome: "clean" | "findings";
  policy: { failOn: FailOn };
  baseline: ReviewContractSide;
  candidate: ReviewContractSide;
  comparison: { supported: true; format: "openapi" };
  tool: Report["tool"];
  input: Report["input"];
  packs: Report["packs"];
  summary: Report["summary"];
  score: Report["score"];
  findings: Finding[];
  reportHash: string;
}

export interface ApiChangeReviewPartial {
  schemaVersion: 1;
  outcome: "error";
  policy: { failOn: FailOn };
  baseline: { path: string; format: ReviewFormat };
  candidate: ReviewContractSide;
  comparison: { supported: false; reason: string };
  tool: Report["tool"];
  packs: Report["packs"];
  summary: Report["summary"];
  findings: Finding[];
  reportHash: string;
  errors: Array<{ code: string; message: string }>;
}

export type ApiChangeReview = ApiChangeReviewSuccess | ApiChangeReviewPartial;

export interface ReviewUseCaseOptions {
  cwd: string;
  baselinePath: string;
  candidatePath: string;
  setup: AnalysisSetup;
  failOn: FailOn;
  toolVersion: string;
  /**
   * Stable label for the baseline input (defaults to the cwd-relative path).
   * CI passes `<ref>:<path>` so re-runs produce the same reportHash even when
   * the baseline bytes land in a random temp file (INV-2 / AC-14.4).
   */
  baselineLabel?: string;
}

export type ReviewEvaluation =
  | {
      ok: true;
      review: ApiChangeReviewSuccess;
      report: Report;
      exitCode: 0 | 1;
      /** Expired/orphan waiver notices from the diff side (stderr material). */
      skillsWarnings: string[];
    }
  | {
      ok: false;
      exitCode: 2;
      comparisonUnsupported: true;
      review: ApiChangeReviewPartial;
      candidateReport: Report;
      skillsWarnings: string[];
    }
  | { ok: false; exitCode: 2; comparisonUnsupported: false; error: string };

export async function reviewUseCase(
  deps: { loader: SpecLoader; packs: PackRepository },
  opts: ReviewUseCaseOptions,
): Promise<ReviewEvaluation> {
  const baselineAbs = resolve(opts.cwd, opts.baselinePath);
  const candidateAbs = resolve(opts.cwd, opts.candidatePath);
  const baselineLabel = opts.baselineLabel ?? normalizeLabel(baselineAbs, opts.cwd);
  const candidateLabel = normalizeLabel(candidateAbs, opts.cwd);

  let baselineBytes: Uint8Array;
  let candidateBytes: Uint8Array;
  try {
    baselineBytes = await deps.loader.load(baselineAbs);
    candidateBytes = await deps.loader.load(candidateAbs);
  } catch (err) {
    return {
      ok: false,
      exitCode: 2,
      comparisonUnsupported: false,
      error: `cannot read review inputs: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const baselineParsed = parseSpecInput(opts.baselinePath, baselineBytes, baselineLabel);
  if (!baselineParsed.ok) {
    return { ok: false, exitCode: 2, comparisonUnsupported: false, error: baselineParsed.error };
  }
  const candidateParsed = parseSpecInput(opts.candidatePath, candidateBytes, candidateLabel);
  if (!candidateParsed.ok) {
    return { ok: false, exitCode: 2, comparisonUnsupported: false, error: candidateParsed.error };
  }

  const analysis = await analyzeUseCase(
    { loader: deps.loader, packs: deps.packs, sink: { async write() {} } },
    {
      inputs: [candidateAbs],
      labelFor: (p) => normalizeLabel(p, opts.cwd),
      failOn: "never",
      customRules: opts.setup.customRules,
      disabledRuleIds: opts.setup.disabledRuleIds,
      severityOverrides: opts.setup.severityOverrides,
      skillsSuppressions: opts.setup.skillsSuppressions,
      toolVersion: opts.toolVersion,
    },
  );
  if (!analysis.ok) {
    return { ok: false, exitCode: 2, comparisonUnsupported: false, error: analysis.error };
  }
  const candidateReport = analysis.report;
  const candidateWarnings = analysis.skillsWarnings;
  const candidateInput = candidateReport.input[0];
  if (candidateInput === undefined) {
    return {
      ok: false,
      exitCode: 2,
      comparisonUnsupported: false,
      error: "review evaluator returned an incomplete candidate input",
    };
  }

  const baselineFormat = reviewFormat(baselineParsed.protocol, baselineParsed.spec);
  const candidateFormat = reviewFormat(candidateParsed.protocol, candidateParsed.spec);
  const baselineHash = `sha256:${baselineParsed.spec.inputHash}`;
  const candidateHash = `sha256:${candidateParsed.spec.inputHash}`;

  if (baselineParsed.protocol !== "openapi" || candidateParsed.protocol !== "openapi") {
    return {
      ok: false,
      exitCode: 2,
      comparisonUnsupported: true,
      candidateReport,
      skillsWarnings: candidateWarnings,
      review: {
        schemaVersion: 1,
        outcome: "error",
        policy: { failOn: opts.failOn },
        baseline: { path: baselineLabel, format: baselineFormat },
        candidate: {
          path: candidateInput.path,
          sha256: candidateInput.sha256,
          format: candidateFormat,
        },
        comparison: { supported: false, reason: REVIEW_COMPARISON_UNSUPPORTED_REASON },
        tool: candidateReport.tool,
        packs: candidateReport.packs,
        summary: candidateReport.summary,
        findings: candidateReport.findings,
        reportHash: candidateReport.reportHash,
        errors: [{ code: "comparison-unsupported", message: "Inputs cannot be compared." }],
      },
    };
  }

  let diffFindings = diffSpecs(baselineParsed.spec, candidateParsed.spec, {
    oldLabel: baselineLabel,
    newLabel: candidateLabel,
    packVersion: opts.toolVersion,
  }).findings;
  diffFindings = diffFindings.filter((f) => !opts.setup.disabledRuleIds.has(f.ruleId));
  if (opts.setup.severityOverrides.size > 0) {
    diffFindings = sortFindings(
      diffFindings.map((f) =>
        opts.setup.severityOverrides.has(f.ruleId)
          ? { ...f, severity: opts.setup.severityOverrides.get(f.ruleId)! }
          : f,
      ),
    );
  }
  let diffSkillsSuppressed = 0;
  const skillsWarnings: string[] = [];
  if (opts.setup.skillsSuppressions !== undefined) {
    const { suppressions, matchRegexes } = opts.setup.skillsSuppressions;
    const applied = applySkillSuppressions(diffFindings, suppressions, matchRegexes);
    diffSkillsSuppressed = applied.suppressed;
    diffFindings = applied.visible;
    const matched = new Set(applied.matchedIndexes);
    const expired = new Set(applied.expiredIndexes);
    for (const i of applied.expiredIndexes) {
      const sup = suppressions[i]!;
      skillsWarnings.push(
        `suppression expired (ignored): ${describeSuppression(sup)} (expires ${sup.expires})`,
      );
    }
    for (let i = 0; i < suppressions.length; i++) {
      if (!matched.has(i) && !expired.has(i)) {
        skillsWarnings.push(`suppression matches no findings: ${describeSuppression(suppressions[i]!)}`);
      }
    }
  }
  const skillsSuppressedTotal =
    (candidateReport.summary.skillsSuppressed ?? 0) + diffSkillsSuppressed;

  const report = buildReport({
    results: [
      {
        findings: sortFindings([...candidateReport.findings, ...diffFindings]) as Finding[],
        errors: [],
      },
    ],
    inputs: [
      { path: baselineLabel, sha256: baselineHash },
      { path: candidateLabel, sha256: candidateHash },
    ],
    packs: [...candidateReport.packs, { id: DIFF_PACK_ID, version: opts.toolVersion }],
    toolVersion: opts.toolVersion,
    ...(skillsSuppressedTotal > 0 ? { skillsSuppressed: skillsSuppressedTotal } : {}),
  });

  const review: ApiChangeReviewSuccess = {
    schemaVersion: 1,
    outcome: report.findings.length === 0 ? "clean" : "findings",
    policy: { failOn: opts.failOn },
    baseline: { path: baselineLabel, sha256: baselineHash, format: baselineFormat },
    candidate: { path: candidateLabel, sha256: candidateHash, format: candidateFormat },
    comparison: { supported: true, format: "openapi" },
    tool: report.tool,
    input: report.input,
    packs: report.packs,
    summary: report.summary,
    score: report.score,
    findings: report.findings,
    reportHash: report.reportHash,
  };
  return {
    ok: true,
    review,
    report,
    exitCode: computeExitCode(report, opts.failOn),
    skillsWarnings: [...candidateWarnings, ...skillsWarnings],
  };
}
