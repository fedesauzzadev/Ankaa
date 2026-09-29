import { createHash } from "node:crypto";
import type { EvaluationResult, Finding, Severity } from "@apigovscan/core";
import { canonicalJson } from "./canonical.js";
import { redactText } from "./redact.js";

export interface ReportTool {
  name: "apigovscan";
  version: string;
}

export interface ReportPack {
  id: string;
  version: string;
}

export interface ReportInput {
  path: string;
  sha256: string;
}

export interface ReportSummary {
  error: number;
  warning: number;
  info: number;
  total: number;
  /** Findings dropped by baseline filter (present only when baseline read mode ran). */
  suppressed?: number;
  /** Findings dropped by skills suppressions (present only when > 0). */
  skillsSuppressed?: number;
}

export interface ReportScore {
  /** 0..100 (100 = no findings). */
  value: number;
  grade: "A" | "B" | "C" | "D" | "F";
}

export interface ReportMeta {
  durationMs?: number;
  startedAt?: string;
  engineVersion?: string;
}

export interface Report {
  tool: ReportTool;
  packs: ReportPack[];
  input: ReportInput[];
  summary: ReportSummary;
  score: ReportScore;
  findings: Finding[];
  reportHash: string;
  meta?: ReportMeta;
}

export interface BuildReportInput {
  results: EvaluationResult[];
  inputs: ReportInput[];
  packs: ReportPack[];
  toolVersion: string;
  meta?: ReportMeta;
  /** Count of findings suppressed by baseline (omit when baseline off). */
  suppressed?: number;
  /** Count of findings suppressed by skills (omit when 0 / skills off). */
  skillsSuppressed?: number;
}

const SEVERITIES: Severity[] = ["error", "warning", "info"];

/** penalty weights: one error is worth ~3 warnings. */
const SCORE_PENALTY: Record<Severity, number> = {
  error: 8,
  warning: 3,
  info: 1,
};

export function computeScore(summary: {
  error: number;
  warning: number;
  info: number;
}): ReportScore {
  const penalty =
    SCORE_PENALTY.error * summary.error +
    SCORE_PENALTY.warning * summary.warning +
    SCORE_PENALTY.info * summary.info;
  const value = Math.max(0, 100 - penalty);
  const grade: ReportScore["grade"] =
    value >= 90 ? "A" : value >= 75 ? "B" : value >= 60 ? "C" : value >= 40 ? "D" : "F";
  return { value, grade };
}

function redactFinding(finding: Finding): Finding {
  return {
    ...finding,
    message: redactText(finding.message),
    fix: finding.fix === undefined ? undefined : redactText(finding.fix),
  };
}

function countSummary(
  findings: Finding[],
  suppressed?: number,
  skillsSuppressed?: number,
): ReportSummary {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  const summary: ReportSummary = {
    error: counts.error,
    warning: counts.warning,
    info: counts.info,
    total: findings.length,
  };
  if (suppressed !== undefined) {
    summary.suppressed = suppressed;
  }
  if (skillsSuppressed !== undefined && skillsSuppressed > 0) {
    summary.skillsSuppressed = skillsSuppressed;
  }
  return summary;
}

function hashPayload(report: Omit<Report, "reportHash" | "meta">): string {
  const canonical = canonicalJson({
    tool: report.tool,
    packs: report.packs,
    input: report.input,
    summary: report.summary,
    score: report.score,
    findings: report.findings,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildReport(input: BuildReportInput): Report {
  const findings = input.results.flatMap((r) => r.findings).map(redactFinding);

  const packs = [...input.packs].sort((a, b) => cmp(a.id, b.id));
  const summary = countSummary(findings, input.suppressed, input.skillsSuppressed);
  const withoutHash = {
    tool: { name: "apigovscan" as const, version: input.toolVersion },
    packs,
    input: input.inputs,
    summary,
    score: computeScore(summary),
    findings,
  };
  const reportHash = hashPayload(withoutHash);

  const report: Report = { ...withoutHash, reportHash };
  if (input.meta !== undefined) {
    report.meta = input.meta;
  }
  return report;
}

export function computeReportHash(report: Report): string {
  return hashPayload({
    tool: report.tool,
    packs: report.packs,
    input: report.input,
    summary: report.summary,
    score: report.score,
    findings: report.findings,
  });
}

export { SEVERITIES };
