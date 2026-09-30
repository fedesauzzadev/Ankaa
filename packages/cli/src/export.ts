import { readFileSync } from "node:fs";
import type { Finding } from "@apigovscan/core";
import type { Report } from "@apigovscan/reporters";
import { ownerOf } from "./dashboard.js";

export type ExportableReport = Pick<Report, "tool" | "input" | "findings">;

export interface ExportFinding extends Finding {
  trend: "new" | "repeated";
  owner?: string;
}

export interface ExportGroup {
  name: string;
  findings: ExportFinding[];
  summary: { error: number; warning: number; info: number; total: number };
}

export interface IntegrationExport {
  tool: "apigovscan";
  schemaVersion: 1;
  version: string;
  groups: ExportGroup[];
  summary: {
    error: number;
    warning: number;
    info: number;
    total: number;
    new: number;
    repeated: number;
  };
}

export function loadExportReportFile(
  path: string,
): { ok: true; report: ExportableReport } | { ok: false; error: string } {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: `report file not found or unreadable: ${path}` };
  }
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    return { ok: false, error: `report file is not valid JSON: ${path}` };
  }
  if (!isExportableReport(value)) {
    return { ok: false, error: `report file is not an apigovscan report: ${path}` };
  }
  return { ok: true, report: value };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isExportableReport(value: unknown): value is ExportableReport {
  return (
    isRecord(value) &&
    isRecord(value.tool) &&
    value.tool.name === "apigovscan" &&
    typeof value.tool.version === "string" &&
    Array.isArray(value.input) &&
    value.input.every(
      (entry) =>
        isRecord(entry) && typeof entry.path === "string" && typeof entry.sha256 === "string",
    ) &&
    Array.isArray(value.findings) &&
    value.findings.every(isFinding)
  );
}

function isFinding(value: unknown): value is Finding {
  if (!isRecord(value)) return false;
  return (
    typeof value.fingerprint === "string" &&
    typeof value.ruleId === "string" &&
    (value.severity === "error" || value.severity === "warning" || value.severity === "info") &&
    (value.category === "naming" ||
      value.category === "structure" ||
      value.category === "docs" ||
      value.category === "errors" ||
      value.category === "security" ||
      value.category === "versioning" ||
      value.category === "pagination" ||
      value.category === "parameters" ||
      value.category === "schemas" ||
      value.category === "deprecation" ||
      value.category === "consistency" ||
      value.category === "performance" ||
      value.category === "custom") &&
    typeof value.message === "string" &&
    typeof value.location === "string" &&
    (value.apiLocation === undefined || typeof value.apiLocation === "string") &&
    (value.fix === undefined || typeof value.fix === "string") &&
    (value.examples === undefined ||
      (isRecord(value.examples) &&
        (value.examples.bad === undefined || typeof value.examples.bad === "string") &&
        (value.examples.good === undefined || typeof value.examples.good === "string") &&
        (value.examples.bad !== undefined || value.examples.good !== undefined))) &&
    (value.source === undefined ||
      (isRecord(value.source) &&
        typeof value.source.title === "string" &&
        typeof value.source.url === "string" &&
        (value.source.section === undefined || typeof value.source.section === "string"))) &&
    typeof value.packId === "string" &&
    typeof value.packVersion === "string"
  );
}

function compareFindings(a: ExportFinding, b: ExportFinding): number {
  return (
    a.location.localeCompare(b.location) ||
    a.ruleId.localeCompare(b.ruleId) ||
    a.fingerprint.localeCompare(b.fingerprint)
  );
}

export function buildIntegrationExport(
  report: ExportableReport,
  previous: ExportableReport | undefined,
  ownerMapping: Record<string, string> | undefined,
): IntegrationExport {
  const previousFingerprints = new Set(previous?.findings.map((finding) => finding.fingerprint));
  const byGroup = new Map<string, ExportFinding[]>();
  const inputPaths = report.input.map((input) => input.path);

  for (const finding of report.findings) {
    const owner = ownerOf(finding, ownerMapping, inputPaths);
    const enriched: ExportFinding = {
      ...finding,
      trend: previousFingerprints.has(finding.fingerprint) ? "repeated" : "new",
      ...(owner !== "ungrouped" ? { owner } : {}),
    };
    const findings = byGroup.get(owner) ?? [];
    findings.push(enriched);
    byGroup.set(owner, findings);
  }

  const groups = [...byGroup.keys()].sort().map((name): ExportGroup => {
    const findings = byGroup.get(name)!.sort(compareFindings);
    return {
      name,
      findings,
      summary: summarize(findings),
    };
  });
  const summary = summarize(groups.flatMap((group) => group.findings));
  return {
    tool: "apigovscan",
    schemaVersion: 1,
    version: report.tool.version,
    groups,
    summary: {
      ...summary,
      new: groups.reduce(
        (count, group) =>
          count + group.findings.filter((finding) => finding.trend === "new").length,
        0,
      ),
      repeated: groups.reduce(
        (count, group) =>
          count + group.findings.filter((finding) => finding.trend === "repeated").length,
        0,
      ),
    },
  };
}

function summarize(findings: readonly ExportFinding[]): {
  error: number;
  warning: number;
  info: number;
  total: number;
} {
  const summary = { error: 0, warning: 0, info: 0, total: findings.length };
  for (const finding of findings) summary[finding.severity] += 1;
  return summary;
}
