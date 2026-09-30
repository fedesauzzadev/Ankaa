import { readFile } from "node:fs/promises";

const [exportPath] = process.argv.slice(2);
const baseUrl = process.env.JIRA_BASE_URL;
const projectKey = process.env.JIRA_PROJECT_KEY;

if (!exportPath || !baseUrl || !projectKey) {
  throw new Error(
    "usage: JIRA_BASE_URL=https://jira.example JIRA_PROJECT_KEY=API node jira.mjs export.json",
  );
}

const payload = JSON.parse(await readFile(exportPath, "utf8"));
const findings = payload.groups.flatMap((group) =>
  group.findings
    .filter((finding) => finding.trend === "new")
    .map((finding) => ({ group, finding })),
);

for (const { group, finding } of findings) {
  const response = await globalThis.fetch(`${baseUrl.replace(/\/+$/, "")}/rest/api/2/issue`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(process.env.JIRA_API_TOKEN
        ? { authorization: `Bearer ${process.env.JIRA_API_TOKEN}` }
        : {}),
    },
    body: JSON.stringify({
      fields: {
        project: { key: projectKey },
        issuetype: { name: "Task" },
        summary: `[Ankaa] ${finding.ruleId}: ${finding.apiLocation ?? finding.location}`,
        description: [
          finding.message,
          `Location: ${finding.location}`,
          `Owner: ${group.name}`,
          `Fingerprint: ${finding.fingerprint}`,
          finding.fix ? `Suggested fix: ${finding.fix}` : "",
        ]
          .filter(Boolean)
          .join("\n"),
        labels: ["ankaa", finding.fingerprint],
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`ticket creation failed (HTTP ${response.status})`);
  }
}

console.log(`Created ${findings.length} tickets.`);
