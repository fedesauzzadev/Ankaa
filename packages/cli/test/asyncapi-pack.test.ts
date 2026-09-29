import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { evaluate, flattenRuleLists, loadPack } from "@apigovscan/core";
import { parseAsyncAPI } from "@apigovscan/asyncapi";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packDir = join(repoRoot, "packs", "asyncapi");

function loadAsyncapiPack() {
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

const loaded = loadAsyncapiPack();
if (!loaded.ok) {
  throw new Error(`asyncapi pack failed to load: ${JSON.stringify(loaded.errors)}`);
}

function fires(ruleId: string, doc: string): boolean {
  const parsed = parseAsyncAPI(doc, { sourceLabel: "inline.yaml" });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return false;
  const result = evaluate({ specs: [parsed.spec], packs: [loaded.pack] });
  expect(result.errors).toEqual([]);
  return result.findings.some((f) => f.ruleId === ruleId);
}

function v2doc(channels: string): string {
  return `asyncapi: "2.6.0"\ninfo:\n  title: T\n  version: "1"\nchannels:\n${channels}`;
}

function v2op(body: string): string {
  return `  test/channel:\n    publish:\n      operationId: testOp\n      description: A sufficiently long description here.\n${body}`;
}

const EXPECTED: Array<{ id: string; severity: "warning" | "info" }> = [
  { id: "ASYNC-001", severity: "warning" },
  { id: "ASYNC-002", severity: "warning" },
  { id: "ASYNC-003", severity: "warning" },
  { id: "ASYNC-004", severity: "info" },
  { id: "ASYNC-005", severity: "info" },
  { id: "ASYNC-006", severity: "warning" },
];

describe("asyncapi pack inventory (M8.8)", () => {
  it("holds 6 active rules", () => {
    expect(loaded.pack.rules).toHaveLength(6);
  });

  it("contains every rule id with the expected severity", () => {
    const byId = new Map(loaded.pack.rules.map((r) => [r.id, r.severity]));
    for (const { id, severity } of EXPECTED) {
      expect(byId.get(id)).toBe(severity);
    }
  });

  it("ASYNC-001 fires on uppercase channels", () => {
    expect(
      fires("ASYNC-001", v2doc(v2op("      message:\n        payload:\n          type: object"))),
    ).toBe(false);
    expect(
      fires(
        "ASYNC-001",
        v2doc(
          "  BadChannel:\n    publish:\n      operationId: testOp\n      description: A sufficiently long description here.\n",
        ),
      ),
    ).toBe(true);
  });

  it("ASYNC-002 fires on missing operationId", () => {
    expect(
      fires("ASYNC-002", v2doc(v2op("      message:\n        payload:\n          type: object"))),
    ).toBe(false);
    expect(
      fires(
        "ASYNC-002",
        v2doc(
          "  test/channel:\n    publish:\n      description: A sufficiently long description here.\n",
        ),
      ),
    ).toBe(true);
  });

  it("ASYNC-003 fires on missing descriptions", () => {
    expect(
      fires("ASYNC-003", v2doc(v2op("      message:\n        payload:\n          type: object"))),
    ).toBe(false);
    expect(
      fires("ASYNC-003", v2doc("  test/channel:\n    publish:\n      operationId: testOp\n")),
    ).toBe(true);
  });

  it("ASYNC-004 fires on short descriptions", () => {
    expect(
      fires("ASYNC-004", v2doc(v2op("      message:\n        payload:\n          type: object"))),
    ).toBe(false);
    expect(
      fires(
        "ASYNC-004",
        v2doc(
          "  test/channel:\n    publish:\n      operationId: testOp\n      description: Too short.\n",
        ),
      ),
    ).toBe(true);
  });

  it("ASYNC-005 fires on TODO placeholders", () => {
    expect(
      fires("ASYNC-005", v2doc(v2op("      message:\n        payload:\n          type: object"))),
    ).toBe(false);
    expect(
      fires(
        "ASYNC-005",
        v2doc(
          "  test/channel:\n    publish:\n      operationId: testOp\n      description: TODO document this.\n",
        ),
      ),
    ).toBe(true);
  });

  it("ASYNC-006 fires on snake_case payload properties", () => {
    const good = v2doc(
      v2op(
        "      message:\n        payload:\n          type: object\n          properties:\n            petId:\n              type: string\n",
      ),
    );
    expect(fires("ASYNC-006", good)).toBe(false);
    const bad = v2doc(
      v2op(
        "      message:\n        payload:\n          type: object\n          properties:\n            pet_id:\n              type: string\n",
      ),
    );
    expect(fires("ASYNC-006", bad)).toBe(true);
  });
});
