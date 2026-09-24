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
}

const SEVERITIES: Severity[] = ["error", "warning", "info"];

function redactFinding(finding: Finding): Finding {
  return {
    ...finding,
    message: redactText(finding.message),
    fix: finding.fix === undefined ? undefined : redactText(finding.fix),
  };
}

function countSummary(findings: Finding[]): ReportSummary {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of findings) {
    counts[f.severity] += 1;
  }
  return {
    error: counts.error,
    warning: counts.warning,
    info: counts.info,
    total: findings.length,
  };
}

function hashPayload(report: Omit<Report, "reportHash" | "meta">): string {
  const canonical = canonicalJson({
    tool: report.tool,
    packs: report.packs,
    input: report.input,
    summary: report.summary,
    findings: report.findings,
  });
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildReport(input: BuildReportInput): Report {
  const findings = input.results
    .flatMap((r) => r.findings)
    .map(redactFinding);

  const packs = [...input.packs].sort((a, b) => cmp(a.id, b.id));
  const summary = countSummary(findings);
  const withoutHash = {
    tool: { name: "apigovscan" as const, version: input.toolVersion },
    packs,
    input: input.inputs,
    summary,
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
    findings: report.findings,
  });
}

export { SEVERITIES };
