import type { Finding, Severity } from "@apigovscan/core";
import { redactText } from "./redact.js";
import type { Report } from "./build.js";

export interface ConsoleOpts {
  color: boolean;
  maxFindings?: number;
}

const ESC = String.fromCharCode(27);

const ANSI = {
  reset: `${ESC}[0m`,
  bold: `${ESC}[1m`,
  red: `${ESC}[31m`,
  yellow: `${ESC}[33m`,
  cyan: `${ESC}[36m`,
} as const;

const SEVERITY_COLOR: Record<Severity, string> = {
  error: ANSI.red,
  warning: ANSI.yellow,
  info: ANSI.cyan,
};

function paint(text: string, code: string, color: boolean): string {
  return color ? `${code}${text}${ANSI.reset}` : text;
}

function findingLines(finding: Finding, color: boolean): string[] {
  const severity = paint(
    finding.severity,
    SEVERITY_COLOR[finding.severity],
    color,
  );
  const location = finding.apiLocation ?? finding.location;
  const lines: string[] = [`${severity}  ${finding.ruleId}  ${location}`];
  lines.push(`        ${redactText(finding.message)}`);
  if (finding.fix) {
    lines.push(`        fix: ${redactText(finding.fix)}`);
  }
  if (finding.source) {
    const section = finding.source.section
      ? ` - ${finding.source.section}`
      : "";
    lines.push(`        > ${finding.source.title}${section}`);
    lines.push(`        ${finding.source.url}`);
  }
  return lines;
}

function groupKey(finding: Finding): string {
  return finding.apiLocation ?? finding.location;
}

export function formatConsole(report: Report, opts: ConsoleOpts): string {
  const color = opts.color;
  const packs = report.packs.map((p) => `${p.id}@${p.version}`).join(", ");
  const inputs = report.input.map((i) => i.sha256).join(", ");
  const duration =
    report.meta?.durationMs !== undefined
      ? ` · ${(report.meta.durationMs / 1000).toFixed(1)}s`
      : "";

  const lines: string[] = [];
  lines.push(
    `${paint("ApiGovScan", ANSI.bold, color)} ${report.tool.version} · packs ${packs} · input ${inputs}${duration}`,
  );
  lines.push("");

  const findings =
    opts.maxFindings !== undefined
      ? report.findings.slice(0, opts.maxFindings)
      : report.findings;

  let lastGroup: string | undefined;
  for (const finding of findings) {
    const group = groupKey(finding);
    if (lastGroup !== undefined && group !== lastGroup) {
      lines.push("");
    }
    lastGroup = group;
    lines.push(...findingLines(finding, color));
  }

  if (findings.length > 0) {
    lines.push("");
  }

  const { error, warning, info, total } = report.summary;
  const counts = [
    `${error} error${error === 1 ? "" : "s"}`,
    `${warning} warning${warning === 1 ? "" : "s"}`,
    `${info} info`,
  ].join(" · ");
  const hash = report.reportHash.slice(0, 8);
  const mark = total > 0 ? "!" : "ok";
  lines.push(`${mark} ${counts} · reportHash ${hash}`);

  if (
    opts.maxFindings !== undefined &&
    report.findings.length > opts.maxFindings
  ) {
    lines.push(
      `  ... ${report.findings.length - opts.maxFindings} more findings omitted`,
    );
  }

  return `${lines.join("\n")}\n`;
}
