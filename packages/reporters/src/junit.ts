import type { Finding, Severity } from "@ankaa/core";
import type { Report } from "./build.js";
import { redactText } from "./redact.js";
import { locationParts } from "./uri.js";
import { escapeXml } from "./xml.js";

const UNKNOWN_SUITE = "(unknown)";

interface Suite {
  name: string;
  findings: Finding[];
}

function groupBySuite(report: Report): Suite[] {
  const suites = new Map<string, Finding[]>();
  for (const finding of report.findings) {
    const name = locationParts(report, finding).uri || UNKNOWN_SUITE;
    const bucket = suites.get(name);
    if (bucket === undefined) {
      suites.set(name, [finding]);
    } else {
      bucket.push(finding);
    }
  }
  for (const input of report.input) {
    if (!suites.has(input.path)) {
      suites.set(input.path, []);
    }
  }
  return [...suites.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([name, findings]) => ({ name, findings }));
}

function suiteCounts(findings: Finding[]): {
  tests: number;
  errors: number;
  failures: number;
  skipped: number;
} {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const finding of findings) {
    counts[finding.severity] += 1;
  }
  return {
    tests: findings.length,
    errors: counts.error,
    failures: counts.warning,
    skipped: counts.info,
  };
}

function testcaseBody(finding: Finding, indent: string): string {
  const message = escapeXml(redactText(finding.message));
  const fix = finding.fix === undefined ? "" : redactText(finding.fix);
  if (finding.severity === "info") {
    return `${indent}<skipped message="${message}" type="${escapeXml(finding.ruleId)}"/>`;
  }
  const tag = finding.severity === "error" ? "error" : "failure";
  const body = fix === "" ? "" : escapeXml(fix);
  return `${indent}<${tag} message="${message}" type="${escapeXml(finding.ruleId)}">${body}</${tag}>`;
}

/** JUnit-style XML (no timestamps — INV-2; findings in canonical order). */
export function formatJunit(report: Report): string {
  const suites = groupBySuite(report);
  const totals = suiteCounts(report.findings);
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuites name="ankaa" tests="${totals.tests}" failures="${totals.failures}" errors="${totals.errors}" skipped="${totals.skipped}">`,
  ];
  for (const suite of suites) {
    const counts = suiteCounts(suite.findings);
    lines.push(
      `  <testsuite name="${escapeXml(suite.name)}" tests="${counts.tests}" failures="${counts.failures}" errors="${counts.errors}" skipped="${counts.skipped}">`,
    );
    for (const finding of suite.findings) {
      const { pointer } = locationParts(report, finding);
      const name = pointer === "" ? finding.ruleId : `${finding.ruleId} · ${pointer}`;
      lines.push(
        `    <testcase name="${escapeXml(name)}" classname="${escapeXml(suite.name)}">`,
      );
      lines.push(testcaseBody(finding, "      "));
      lines.push("    </testcase>");
    }
    lines.push("  </testsuite>");
  }
  lines.push("</testsuites>");
  return `${lines.join("\n")}\n`;
}
