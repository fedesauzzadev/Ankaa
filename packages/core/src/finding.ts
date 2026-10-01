import { sha256HexString } from "./sha256.js";
import type { Finding, Severity } from "./rule.js";
import type { Spec } from "./spec.js";

/** Attach source positions (exact pointer match) without touching fingerprints. */
export function attachPositions(findings: Finding[], spec: Spec): Finding[] {
  if (spec.positions === undefined) return findings;
  return findings.map((finding) => {
    const position = spec.positions?.[finding.location];
    return position === undefined ? finding : { ...finding, position };
  });
}

const SEVERITY_RANK: Record<Severity, number> = {
  error: 0,
  warning: 1,
  info: 2,
};

export function severityRank(s: Severity): number {
  return SEVERITY_RANK[s];
}

export function messageKey(message: string): string {
  return message
    .replace(/\{[^}]*\}/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeFingerprint(f: Omit<Finding, "fingerprint">): string {
  const mk = messageKey(f.message);
  return sha256HexString(`${f.ruleId}|${f.location}|${f.apiLocation ?? ""}|${mk}`);
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const sev = severityRank(a.severity) - severityRank(b.severity);
    if (sev !== 0) return sev;
    const byRule = cmp(a.ruleId, b.ruleId);
    if (byRule !== 0) return byRule;
    const byApi = cmp(a.apiLocation ?? "", b.apiLocation ?? "");
    if (byApi !== 0) return byApi;
    const byLoc = cmp(a.location, b.location);
    if (byLoc !== 0) return byLoc;
    const byMsg = cmp(a.message, b.message);
    if (byMsg !== 0) return byMsg;
    return cmp(a.fingerprint, b.fingerprint);
  });
}

export function dedupeFindings(findings: Finding[]): Finding[] {
  const byFp = new Map<string, Finding>();
  for (const f of findings) {
    const existing = byFp.get(f.fingerprint);
    if (!existing || severityRank(f.severity) < severityRank(existing.severity)) {
      byFp.set(f.fingerprint, f);
    }
  }
  return [...byFp.values()];
}
