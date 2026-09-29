import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { evaluate, flattenRuleLists, loadPack } from "@apigovscan/core";
import { parseWebhooks } from "@apigovscan/webhooks";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packDir = join(repoRoot, "packs", "webhooks");

function loadWebhooksPack() {
  const meta = parseYaml(readFileSync(join(packDir, "pack.yaml"), "utf8")) as {
    id: string;
    version: string;
    strictSource?: boolean;
  };
  const rulesDir = join(packDir, "rules");
  const files = readdirSync(rulesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const lists = files.map((f) => {
    const parsed = parseYaml(readFileSync(join(rulesDir, f), "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`rules/${f} must be a YAML array of rules`);
    }
    return parsed;
  });
  return loadPack(
    {
      id: meta.id,
      version: meta.version,
      strictSource: meta.strictSource === true,
    },
    flattenRuleLists(lists),
  );
}

const loaded = loadWebhooksPack();
if (!loaded.ok) {
  throw new Error(`webhooks pack failed to load: ${JSON.stringify(loaded.errors)}`);
}

function fires(ruleId: string, doc: string): boolean {
  const parsed = parseWebhooks(doc, { sourceLabel: "inline.yaml" });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return false;
  const result = evaluate({ specs: [parsed.spec], packs: [loaded.pack] });
  expect(result.errors).toEqual([]);
  return result.findings.some((f) => f.ruleId === ruleId);
}

function whdoc(events: string): string {
  return `version: "1"\ninfo:\n  title: T\n  version: "1"\nwebhooks:\n${events}`;
}

function whevent(name: string, body: string): string {
  return `  ${name}:\n${body}`;
}

function goodBody(): string {
  return `    description: A sufficiently long description here for tests.\n    payload:\n      type: object\n      properties:\n        userId:\n          type: string\n    headers:\n      - name: webhook-signature\n        required: true\n`;
}

const EXPECTED: Array<{ id: string; severity: "warning" | "info" }> = [
  { id: "WH-001", severity: "warning" },
  { id: "WH-002", severity: "warning" },
  { id: "WH-003", severity: "info" },
  { id: "WH-004", severity: "info" },
  { id: "WH-005", severity: "warning" },
  { id: "WH-006", severity: "warning" },
];

describe("webhooks pack inventory (M8.9)", () => {
  it("holds 6 active rules", () => {
    expect(loaded.pack.rules).toHaveLength(6);
  });

  it("contains every rule id with the expected severity", () => {
    const byId = new Map(loaded.pack.rules.map((r) => [r.id, r.severity]));
    for (const { id, severity } of EXPECTED) {
      expect(byId.get(id)).toBe(severity);
    }
  });

  it("WH-001 fires on non dot-delimited names", () => {
    expect(fires("WH-001", whdoc(whevent("user.created", goodBody())))).toBe(false);
    expect(fires("WH-001", whdoc(whevent("BadEvent", goodBody())))).toBe(true);
  });

  it("WH-002 fires on missing descriptions", () => {
    expect(fires("WH-002", whdoc(whevent("user.created", goodBody())))).toBe(false);
    expect(
      fires(
        "WH-002",
        whdoc(
          whevent(
            "user.created",
            `    payload:\n      type: object\n    headers:\n      - name: webhook-signature\n        required: true\n`,
          ),
        ),
      ),
    ).toBe(true);
  });

  it("WH-003 fires on short descriptions", () => {
    expect(fires("WH-003", whdoc(whevent("user.created", goodBody())))).toBe(false);
    expect(
      fires(
        "WH-003",
        whdoc(
          whevent(
            "user.created",
            `    description: Too short.\n${goodBody().split("\n").slice(1).join("\n")}`,
          ),
        ),
      ),
    ).toBe(true);
  });

  it("WH-004 fires on TODO placeholders", () => {
    expect(fires("WH-004", whdoc(whevent("user.created", goodBody())))).toBe(false);
    expect(
      fires(
        "WH-004",
        whdoc(
          whevent(
            "user.created",
            `    description: TODO document this event properly here.\n    payload:\n      type: object\n    headers:\n      - name: webhook-signature\n        required: true\n`,
          ),
        ),
      ),
    ).toBe(true);
  });

  it("WH-005 fires when webhook-signature is missing", () => {
    expect(fires("WH-005", whdoc(whevent("user.created", goodBody())))).toBe(false);
    expect(
      fires(
        "WH-005",
        whdoc(
          whevent(
            "user.created",
            `    description: A sufficiently long description here for tests.\n    payload:\n      type: object\n`,
          ),
        ),
      ),
    ).toBe(true);
  });

  it("WH-006 fires when payload is missing", () => {
    expect(fires("WH-006", whdoc(whevent("user.created", goodBody())))).toBe(false);
    expect(
      fires(
        "WH-006",
        whdoc(
          whevent(
            "user.created",
            `    description: A sufficiently long description here for tests.\n    headers:\n      - name: webhook-signature\n        required: true\n`,
          ),
        ),
      ),
    ).toBe(true);
  });
});
