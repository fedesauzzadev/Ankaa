import { readFile } from "node:fs/promises";

const [exportPath] = process.argv.slice(2);
if (!exportPath) throw new Error("usage: node csv.mjs export.json");

const payload = JSON.parse(await readFile(exportPath, "utf8"));
const columns = [
  "group",
  "owner",
  "trend",
  "severity",
  "ruleId",
  "location",
  "fingerprint",
  "message",
];
const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
const rows = payload.groups.flatMap((group) =>
  group.findings.map((finding) =>
    [
      group.name,
      finding.owner ?? "",
      finding.trend,
      finding.severity,
      finding.ruleId,
      finding.location,
      finding.fingerprint,
      finding.message,
    ]
      .map(escapeCsv)
      .join(","),
  ),
);

process.stdout.write(`${[columns.map(escapeCsv).join(","), ...rows].join("\n")}\n`);
