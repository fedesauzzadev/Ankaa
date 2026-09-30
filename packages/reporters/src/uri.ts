import type { Finding } from "@ankaa/core";
import type { Report } from "./build.js";

/**
 * Resolve the artifact URI for SARIF/annotations: the input label the finding
 * belongs to. Multi-input findings carry `label#pointer` in `location`.
 */
export function artifactUri(report: Report, finding: Finding): string {
  if (report.input.length > 1) {
    const hash = finding.location.indexOf("#");
    return hash > 0 ? finding.location.slice(0, hash) : "";
  }
  return report.input[0]?.path ?? "";
}
