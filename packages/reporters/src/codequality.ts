import type { Severity } from "@ankaa/core";
import type { Report } from "./build.js";
import { redactText } from "./redact.js";
import { locationParts } from "./uri.js";

const CC_SEVERITY: Record<Severity, "critical" | "major" | "minor"> = {
  error: "critical",
  warning: "major",
  info: "minor",
};

/** CodeClimate/GitLab CodeQuality JSON; fingerprint = finding fingerprint (stable dedupe). */
export function formatCodequality(report: Report): string {
  if (report.findings.length === 0) {
    return "[]\n";
  }
  const issues = report.findings.map((finding) => {
    const { uri } = locationParts(report, finding);
    return JSON.stringify({
      description: redactText(finding.message),
      check_name: finding.ruleId,
      fingerprint: finding.fingerprint,
      severity: CC_SEVERITY[finding.severity],
      location: {
        path: uri,
        lines: { begin: finding.position?.line ?? 1 },
      },
    });
  });
  return `[\n${issues.map((issue) => `  ${issue}`).join(",\n")}\n]\n`;
}
