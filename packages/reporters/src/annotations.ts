import type { Severity } from "@ankaa/core";
import type { Report } from "./build.js";
import { redactText } from "./redact.js";
import { artifactUri } from "./uri.js";

const ANNOTATION_COMMAND: Record<Severity, "error" | "warning" | "notice"> = {
  error: "error",
  warning: "warning",
  info: "notice",
};

function escapeData(text: string): string {
  return text.replace(/%/g, "%25").replace(/\r/g, "%0D").replace(/\n/g, "%0A");
}

function escapeProperty(text: string): string {
  return escapeData(text).replace(/:/g, "%3A").replace(/,/g, "%2C");
}

export function formatAnnotations(report: Report): string {
  const lines: string[] = [];
  for (const finding of report.findings) {
    const command = ANNOTATION_COMMAND[finding.severity];
    const uri = artifactUri(report, finding);
    const properties: string[] = [];
    if (uri !== "") {
      properties.push(`file=${escapeProperty(uri)}`);
    }
    properties.push(`title=${escapeProperty(finding.ruleId)}`);
    lines.push(`::${command} ${properties.join(",")}::${escapeData(redactText(finding.message))}`);
  }
  return lines.length > 0 ? `${lines.join("\n")}\n` : "";
}
