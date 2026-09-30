import type { Severity } from "@ankaa/core";
import type { Report } from "./build.js";
import { redactText } from "./redact.js";

const SEVERITY_ORDER: Severity[] = ["error", "warning", "info"];

function cell(text: string): string {
  return redactText(text)
    .replace(/\r\n|\n|\r/g, "<br>")
    .replace(/\|/g, "\\|");
}

function countsLine(report: Report): string {
  const { error, warning, info } = report.summary;
  return [
    `${error} error${error === 1 ? "" : "s"}`,
    `${warning} warning${warning === 1 ? "" : "s"}`,
    `${info} info`,
  ].join(" · ");
}

function suppressionNotes(report: Report): string {
  const { suppressed, skillsSuppressed } = report.summary;
  const notes: string[] = [];
  if (suppressed !== undefined && suppressed > 0) {
    notes.push(`(baseline: ${suppressed} suppressed)`);
  }
  if (skillsSuppressed !== undefined && skillsSuppressed > 0) {
    notes.push(`(skills: ${skillsSuppressed} suppressed)`);
  }
  return notes.length > 0 ? ` ${notes.join(" ")}` : "";
}

export function formatMarkdown(report: Report): string {
  const packs =
    report.packs.length > 0
      ? report.packs.map((p) => `${p.id}@${p.version}`).join(", ")
      : "_(none)_";

  const lines: string[] = [];
  lines.push("# Ankaa report");
  lines.push("");
  lines.push("| | |");
  lines.push("|---|---|");
  lines.push(`| Tool | ${report.tool.name} ${report.tool.version} |`);
  lines.push(`| Packs | ${packs} |`);
  lines.push(`| Inputs | ${report.input.length} file(s) |`);
  lines.push(`| Findings | ${countsLine(report)}${suppressionNotes(report)} |`);
  lines.push(`| Score | **${report.score.value}/100 (${report.score.grade})** |`);
  lines.push(`| reportHash | \`${report.reportHash.slice(0, 8)}…\` |`);
  lines.push("");
  lines.push("## Findings");
  lines.push("");

  for (const severity of SEVERITY_ORDER) {
    lines.push(`### ${severity}`);
    lines.push("");
    const matching = report.findings.filter((f) => f.severity === severity);
    if (matching.length === 0) {
      lines.push("_(none)_");
      lines.push("");
      continue;
    }
    lines.push("| Rule | Location | Message | Fix |");
    lines.push("|---|---|---|---|");
    for (const finding of matching) {
      const location = finding.apiLocation ?? finding.location;
      const fix = finding.fix !== undefined ? cell(finding.fix) : "_(none)_";
      lines.push(
        `| \`${finding.ruleId}\` | \`${cell(location)}\` | ${cell(finding.message)} | ${fix} |`,
      );
    }
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}
