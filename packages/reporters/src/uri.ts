import type { Finding } from "@ankaa/core";
import type { Report } from "./build.js";

/**
 * Resolve the artifact URI for SARIF/annotations: the input label the finding
 * belongs to. Multi-input findings carry `label#pointer` in `location`.
 */
export function artifactUri(report: Report, finding: Finding): string {
  return locationParts(report, finding).uri;
}

/** Split a finding location into (input label, json pointer). */
export function locationParts(
  report: Report,
  finding: Finding,
): { uri: string; pointer: string } {
  if (report.input.length > 1) {
    const hash = finding.location.indexOf("#");
    if (hash > 0) {
      return { uri: finding.location.slice(0, hash), pointer: finding.location.slice(hash + 1) };
    }
    return { uri: "", pointer: finding.location };
  }
  return { uri: report.input[0]?.path ?? "", pointer: finding.location };
}
