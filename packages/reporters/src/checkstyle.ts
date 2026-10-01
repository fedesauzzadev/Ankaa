import type { Report } from "./build.js";
import { redactText } from "./redact.js";
import { locationParts } from "./uri.js";
import { escapeXml } from "./xml.js";

/** Checkstyle-style XML. Fallback line/column = 1 with the pointer in the message (spec f17-ci-reporters §3). */
export function formatCheckstyle(report: Report): string {
  const files = new Map<string, string[]>();
  const orderedNames: string[] = [];
  for (const finding of report.findings) {
    const { uri, pointer } = locationParts(report, finding);
    const name = uri === "" ? report.input[0]?.path ?? "" : uri;
    let errors = files.get(name);
    if (errors === undefined) {
      errors = [];
      files.set(name, errors);
      orderedNames.push(name);
    }
    const message =
      pointer === ""
        ? redactText(finding.message)
        : `${redactText(finding.message)} [at ${pointer}]`;
    errors.push(
      `      <error line="1" column="1" severity="${finding.severity}" message="${escapeXml(message)}" source="${escapeXml(finding.ruleId)}"/>`,
    );
  }

  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<checkstyle version="ankaa/${report.tool.version}">`,
  ];
  for (const name of [...orderedNames].sort()) {
    lines.push(`  <file name="${escapeXml(name)}">`);
    lines.push(...(files.get(name) ?? []));
    lines.push("  </file>");
  }
  lines.push("</checkstyle>");
  return `${lines.join("\n")}\n`;
}
