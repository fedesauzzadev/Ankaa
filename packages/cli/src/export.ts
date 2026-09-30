import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type { Finding } from "@ankaa/core";
import type { Report } from "@ankaa/reporters";
import { ownerOf } from "./dashboard.js";

export type ExportableReport = Pick<Report, "tool" | "input" | "findings">;

export interface ControlEntry {
  framework: string;
  control: string;
  title: string;
  status: "pass" | "fail";
  findings: string[];
}

export interface ComplianceMappings {
  version: number;
  frameworks: Record<string, Array<{ id: string; title: string }>>;
  mappings: Array<{ ruleId: string; controls: string[] }>;
}

export type LoadComplianceMappingsResult =
  | { ok: true; mappings: ComplianceMappings }
  | { ok: false; error: string };

export function loadComplianceMappings(packDir: string): LoadComplianceMappingsResult {
  const path = join(packDir, "compliance-mappings.yaml");
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return { ok: false, error: `compliance mappings not found: ${path}` };
  }
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (err) {
    return {
      ok: false,
      error: `compliance mappings ${path}: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: `compliance mappings ${path}: root must be a mapping` };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.version !== 1) {
    return { ok: false, error: `compliance mappings ${path}: unsupported version ${String(obj.version)}` };
  }
  const frameworksRaw = obj.frameworks;
  if (frameworksRaw === null || typeof frameworksRaw !== "object" || Array.isArray(frameworksRaw)) {
    return { ok: false, error: `compliance mappings ${path}: frameworks must be a mapping` };
  }
  const frameworks: ComplianceMappings["frameworks"] = {};
  for (const [name, entries] of Object.entries(frameworksRaw as Record<string, unknown>)) {
    if (!Array.isArray(entries)) {
      return { ok: false, error: `compliance mappings ${path}: framework "${name}" must be a list` };
    }
    const catalog: Array<{ id: string; title: string }> = [];
    for (const entry of entries) {
      if (
        entry === null ||
        typeof entry !== "object" ||
        typeof (entry as { id?: unknown }).id !== "string" ||
        typeof (entry as { title?: unknown }).title !== "string"
      ) {
        return {
          ok: false,
          error: `compliance mappings ${path}: framework "${name}" entries need id and title`,
        };
      }
      catalog.push({ id: (entry as { id: string }).id, title: (entry as { title: string }).title });
    }
    frameworks[name] = catalog;
  }
  const mappingsRaw = obj.mappings;
  if (!Array.isArray(mappingsRaw)) {
    return { ok: false, error: `compliance mappings ${path}: mappings must be a list` };
  }
  const mappings: ComplianceMappings["mappings"] = [];
  for (const entry of mappingsRaw) {
    if (
      entry === null ||
      typeof entry !== "object" ||
      typeof (entry as { ruleId?: unknown }).ruleId !== "string" ||
      !Array.isArray((entry as { controls?: unknown }).controls)
    ) {
      return { ok: false, error: `compliance mappings ${path}: mapping entries need ruleId and controls` };
    }
    const controls = (entry as { controls: unknown[] }).controls;
    if (!controls.every((c): c is string => typeof c === "string")) {
      return { ok: false, error: `compliance mappings ${path}: controls must be strings` };
    }
    mappings.push({ ruleId: (entry as { ruleId: string }).ruleId, controls });
  }
  return { ok: true, mappings: { version: 1, frameworks, mappings } };
}

export function buildControlsSection(
  findings: readonly Finding[],
  mappings: ComplianceMappings,
  frameworks: readonly string[],
): ControlEntry[] {
  const fingerprintsByRule = new Map<string, string[]>();
  for (const finding of findings) {
    const list = fingerprintsByRule.get(finding.ruleId) ?? [];
    list.push(finding.fingerprint);
    fingerprintsByRule.set(finding.ruleId, list);
  }
  const controlsByRule = new Map<string, string[]>();
  for (const mapping of mappings.mappings) {
    controlsByRule.set(mapping.ruleId, mapping.controls);
  }
  const entries: ControlEntry[] = [];
  for (const framework of frameworks) {
    for (const control of mappings.frameworks[framework] ?? []) {
      const key = `${framework}:${control.id}`;
      const fingerprints: string[] = [];
      for (const [ruleId, ruleFindings] of fingerprintsByRule) {
        const mapped = controlsByRule.get(ruleId);
        if (mapped !== undefined && mapped.includes(key)) {
          fingerprints.push(...ruleFindings);
        }
      }
      fingerprints.sort();
      entries.push({
        framework,
        control: control.id,
        title: control.title,
        status: fingerprints.length > 0 ? "fail" : "pass",
        findings: fingerprints,
      });
    }
  }
  return entries;
}

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
  tool: "ankaa";
  schemaVersion: 1;
  version: string;
  groups: ExportGroup[];
  /** Present only with `export --controls` (additive; f17-compliance-pack). */
  controls?: ControlEntry[];
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
    return { ok: false, error: `report file is not an ankaa report: ${path}` };
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
    value.tool.name === "ankaa" &&
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
    tool: "ankaa",
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
