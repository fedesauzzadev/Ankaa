import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  evaluate,
  flattenRuleLists,
  loadPack,
  validateRule,
} from "@apigovscan/core";
import { parseSpec } from "@apigovscan/openapi";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const packDir = join(repoRoot, "packs", "elite");
const fixturesDir = join(repoRoot, "fixtures");

function readYaml(rel: string): unknown {
  return parseYaml(readFileSync(join(packDir, rel), "utf8"));
}

function loadElitePack() {
  const meta = readYaml("pack.yaml") as {
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

const loaded = loadElitePack();

describe("elite pack load (M1.3)", () => {
  it("loads without errors", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) {
      expect(JSON.stringify(loaded.errors, null, 2)).toBe("[]");
    }
  });

  it("has pack meta id/version", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.pack.id).toBe("elite");
    expect(loaded.pack.version).toBe("2026.09.1");
  });

  it("has ≥ 10 skeleton rules (AC-P partial)", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.pack.rules.length).toBeGreaterThanOrEqual(10);
  });

  it("has unique ids in PREFIX-NNN format (AC-P.3 partial)", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const ids = loaded.pack.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Z][A-Z0-9]*-\d{3}$/);
    }
  });

  it("all rules have valid source.url (AC-P.2 / strictSource)", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    for (const rule of loaded.pack.rules) {
      expect(rule.source, rule.id).toBeDefined();
      expect(rule.source?.url, rule.id).toMatch(/^https?:\/\//);
    }
  });

  it("every rule passes validateRule (AC-P.4 partial)", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    for (const rule of loaded.pack.rules) {
      const result = validateRule(rule, { strictSource: true });
      expect(
        result.ok,
        `${rule.id}: ${!result.ok ? result.issues.join("; ") : ""}`,
      ).toBe(true);
    }
  });

  it("stamps packId/packVersion on every rule", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    for (const rule of loaded.pack.rules) {
      expect(rule.packId).toBe("elite");
      expect(rule.packVersion).toBe("2026.09.1");
    }
  });

  it("contains the M1.3 batch-1 rule ids", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const ids = new Set(loaded.pack.rules.map((r) => r.id));
    for (const id of [
      "STRUCT-001",
      "STRUCT-002",
      "STRUCT-003",
      "NAMING-001",
      "NAMING-003",
      "NAMING-009",
      "DOCS-001",
      "DOCS-004",
      "RESP-001",
      "ERR-001",
      "PARAM-001",
      "PARAM-002",
      "AUTH-003",
      "SEC-002",
    ]) {
      expect(ids.has(id), `missing ${id}`).toBe(true);
    }
  });
});

describe("elite pack evaluate smoke", () => {
  it("evaluates petstore-mini without engine errors", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const raw = readFileSync(join(fixturesDir, "petstore-mini.yaml"), "utf8");
    const parsed = parseSpec(raw, { sourceLabel: "petstore-mini.yaml" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const result = evaluate({
      specs: [parsed.spec],
      packs: [loaded.pack],
    });
    expect(result.errors).toEqual([]);
    expect(Array.isArray(result.findings)).toBe(true);
    for (const f of result.findings) {
      expect(f.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(f.packId).toBe("elite");
    }
  });
});
