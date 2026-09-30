import { readFile } from "node:fs/promises";

const [exportPath] = process.argv.slice(2);
const webhook = process.env.SLACK_WEBHOOK_URL;
if (!exportPath || !webhook) {
  throw new Error("usage: SLACK_WEBHOOK_URL=https://... node slack.mjs export.json");
}

const payload = JSON.parse(await readFile(exportPath, "utf8"));
const text = payload.groups
  .map((group) => {
    const fresh = group.findings.filter((finding) => finding.trend === "new");
    if (fresh.length === 0) return "";
    return `*${group.name}* — ${fresh.length} new findings\n${fresh
      .map((finding) => `• ${finding.severity} ${finding.ruleId}: ${finding.message}`)
      .join("\n")}`;
  })
  .filter(Boolean)
  .join("\n\n");

if (text) {
  const response = await globalThis.fetch(webhook, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
  if (!response.ok) throw new Error(`Slack webhook failed (HTTP ${response.status})`);
}
