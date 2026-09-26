import type { Finding, Severity } from "@apigovscan/core";
import type { Report } from "./build.js";
import { redactText } from "./redact.js";
import { artifactUri } from "./uri.js";

const SARIF_SCHEMA = "https://json.schemastore.org/sarif-2.1.0.json";

const SARIF_LEVEL: Record<Severity, "error" | "warning" | "note"> = {
  error: "error",
  warning: "warning",
  info: "note",
};

interface SarifReportingDescriptor {
  id: string;
  shortDescription: { text: string };
  help?: { text: string };
  helpUri?: string;
  properties: Record<string, string>;
}

interface SarifResult {
  ruleId: string;
  level: "error" | "warning" | "note";
  message: { text: string };
  locations: Array<{ physicalLocation: { artifactLocation: { uri: string } } }>;
  partialFingerprints: Record<string, string>;
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function collectRules(report: Report): SarifReportingDescriptor[] {
  const byId = new Map<string, Finding>();
  for (const finding of report.findings) {
    if (!byId.has(finding.ruleId)) {
      byId.set(finding.ruleId, finding);
    }
  }
  const descriptors = [...byId.entries()].map(([ruleId, finding]) => {
    const descriptor: SarifReportingDescriptor = {
      id: ruleId,
      shortDescription: { text: redactText(finding.message) },
      properties: {
        "apigovscan/severity": finding.severity,
        "apigovscan/category": finding.category,
        "apigovscan/pack": `${finding.packId}@${finding.packVersion}`,
      },
    };
    if (finding.fix !== undefined) {
      descriptor.help = { text: redactText(finding.fix) };
    }
    if (finding.source?.url !== undefined) {
      descriptor.helpUri = finding.source.url;
    }
    return descriptor;
  });
  return descriptors.sort((a, b) => cmp(a.id, b.id));
}

function toResult(report: Report, finding: Finding): SarifResult {
  return {
    ruleId: finding.ruleId,
    level: SARIF_LEVEL[finding.severity],
    message: { text: redactText(finding.message) },
    locations: [
      {
        physicalLocation: {
          artifactLocation: { uri: artifactUri(report, finding) },
        },
      },
    ],
    partialFingerprints: {
      apigovscanFingerprint: finding.fingerprint,
    },
  };
}

export function formatSarif(
  report: Report,
  opts?: { pretty?: boolean },
): string {
  const pretty = opts?.pretty !== false;
  const sarif = {
    $schema: SARIF_SCHEMA,
    version: "2.1.0",
    runs: [
      {
        tool: {
          driver: {
            name: report.tool.name,
            version: report.tool.version,
            rules: collectRules(report),
          },
        },
        results: report.findings.map((finding) => toResult(report, finding)),
        properties: {
          "apigovscan/score": report.score.value,
          "apigovscan/grade": report.score.grade,
        },
      },
    ],
  };
  return `${JSON.stringify(sarif, null, pretty ? 2 : 0)}\n`;
}
