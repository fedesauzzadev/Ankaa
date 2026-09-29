import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { evaluate, explain, flattenRuleLists, loadPack, validateRule } from "@apigovscan/core";
import { parseSpec } from "@apigovscan/openapi";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packDir = join(repoRoot, "packs", "elite");
const fixturesDir = join(repoRoot, "fixtures");
const publicDir = join(fixturesDir, "public");

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

const EXPECTED_INVENTORY = [
  "STRUCT-001",
  "STRUCT-002",
  "STRUCT-003",
  "STRUCT-004",
  "STRUCT-005",
  "STRUCT-006",
  "NAMING-001",
  "NAMING-002",
  "NAMING-003",
  "NAMING-004",
  "NAMING-005",
  "NAMING-006",
  "NAMING-007",
  "NAMING-008",
  "NAMING-009",
  "NAMING-010",
  "DOCS-001",
  "DOCS-002",
  "DOCS-003",
  "DOCS-004",
  "DOCS-005",
  "DOCS-006",
  "PARAM-001",
  "PARAM-002",
  "PARAM-003",
  "PARAM-004",
  "PARAM-005",
  "PARAM-006",
  "PARAM-007",
  "SCHEMA-001",
  "SCHEMA-002",
  "SCHEMA-003",
  "SCHEMA-004",
  "SCHEMA-005",
  "RESP-001",
  "RESP-002",
  "RESP-003",
  "RESP-004",
  "RESP-005",
  "ERR-001",
  "ERR-002",
  "ERR-003",
  "ERR-004",
  "ERR-005",
  "ERR-006",
  "AUTH-001",
  "AUTH-002",
  "AUTH-003",
  "AUTH-004",
  "AUTH-005",
  "PAG-001",
  "PAG-002",
  "PAG-003",
  "VER-001",
  "VER-002",
  "VER-003",
  "DEPR-001",
  "DEPR-002",
  "CONS-001",
  "CONS-002",
  "CONS-003",
  "SEC-001",
  "SEC-002",
  "SEC-003",
  "PERF-001",
];

/** Noise ceilings documented in packs/elite/CHANGELOG.md (AC-P.6/7). */
const NOISE_THRESHOLDS: Record<string, { max: number }> = {
  "petstore-mini.yaml": { max: 60 },
  "petstore-mini.json": { max: 60 },
  "public/petstore3.json": { max: 80 },
  "public/petstore2.yaml": { max: 80 },
};

const loaded = loadElitePack();

function analyzeFixture(rel: string) {
  expect(loaded.ok, `pack must load before analyzing ${rel}`).toBe(true);
  if (!loaded.ok) return null;
  const raw = readFileSync(join(fixturesDir, rel), "utf8");
  const parsed = parseSpec(raw, { sourceLabel: rel });
  expect(parsed.ok, `parse failed for ${rel}`).toBe(true);
  if (!parsed.ok) return null;
  const result = evaluate({
    specs: [parsed.spec],
    packs: [loaded.pack],
  });
  expect(result.errors).toEqual([]);
  return result;
}

describe("elite pack load (M1.5)", () => {
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

  it("AC-P.1 has ≥ 50 active rules (enabledByDefault !== false)", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const active = loaded.pack.rules.filter(
      (r) => r.enabledByDefault !== false && r.deprecated !== true,
    );
    expect(active.length).toBeGreaterThanOrEqual(50);
  });

  it("AC-P.2 all rules have valid source.url", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.pack.rules.length).toBeGreaterThan(0);
    for (const rule of loaded.pack.rules) {
      expect(rule.source, rule.id).toBeDefined();
      expect(rule.source?.url, rule.id).toMatch(/^https?:\/\/\S+$/);
    }
  });

  it("AC-P.3 unique ids in PREFIX-NNN format", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const ids = loaded.pack.rules.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[A-Z][A-Z0-9]*-\d{3}$/);
    }
  });

  it("AC-P.4 validateRule passes for every rule", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    for (const rule of loaded.pack.rules) {
      const result = validateRule(rule, { strictSource: true });
      expect(result.ok, `${rule.id}: ${!result.ok ? result.issues.join("; ") : ""}`).toBe(true);
    }
  });

  it("AC-P.5 inventory allowlist is fully present", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const ids = new Set(loaded.pack.rules.map((r) => r.id));
    const missing = EXPECTED_INVENTORY.filter((id) => !ids.has(id));
    expect(missing).toEqual([]);
  });

  it("stamps packId/packVersion on every rule", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    for (const rule of loaded.pack.rules) {
      expect(rule.packId).toBe("elite");
      expect(rule.packVersion).toBe("2026.09.1");
    }
  });

  it("AC-P.10 messages are literal EN strings (no locale interpolation)", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    // Locale risk = i18n placeholders / ICU / non-literal runtime formatting.
    // Single-token {param} style placeholders are allowed and stay deterministic.
    const localeRisk = /\{[a-z]+:[^}]+\}|\{\{|\}\}|%s|%d|Intl\.|toLocaleString/i;
    for (const rule of loaded.pack.rules) {
      expect(rule.message, rule.id).toBeTypeOf("string");
      expect(rule.message.length, rule.id).toBeGreaterThan(0);
      expect(localeRisk.test(rule.message), rule.id).toBe(false);
      expect(/[àáâãäåèéêëìíîïòóôõöùúûüñç]/i.test(rule.message), rule.id).toBe(false);
      if (rule.fix !== undefined) {
        expect(localeRisk.test(rule.fix), rule.id).toBe(false);
      }
    }
  });
});

describe("elite pack explain (AC-P.9)", () => {
  it("explain returns message + source + url for NAMING-001", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    const explanation = explain(loaded.pack, "NAMING-001");
    expect(explanation).toBeDefined();
    expect(explanation!.id).toBe("NAMING-001");
    expect(explanation!.message.length).toBeGreaterThan(0);
    expect(explanation!.source).toBeDefined();
    expect(explanation!.source!.url).toMatch(/^https?:\/\//);
    expect(explanation!.packId).toBe("elite");
    expect(explanation!.packVersion).toBe("2026.09.1");
  });

  it("explain returns undefined for unknown ids", () => {
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(explain(loaded.pack, "NOPE-999")).toBeUndefined();
  });
});

describe("CLI rules explain (AC-P.9)", () => {
  async function runCapture(argv: string[]): Promise<{
    code: number;
    stdout: string;
    stderr: string;
  }> {
    let stdout = "";
    let stderr = "";
    const code = await run(["node", "cli", ...argv], {
      stdout: (t) => {
        stdout += t;
      },
      stderr: (t) => {
        stderr += t;
      },
      isTTY: false,
      cwd: repoRoot,
    });
    return { code, stdout, stderr };
  }

  it("prints message + source + url for NAMING-001", async () => {
    const { code, stdout, stderr } = await runCapture(["rules", "explain", "NAMING-001"]);
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(stdout).toContain("NAMING-001");
    expect(stdout).toContain("plural");
    expect(stdout).toMatch(/url: https?:\/\//);
    expect(stdout).toContain("elite@2026.09.1");
  });

  it("exits 2 for unknown rule id", async () => {
    const { code, stderr } = await runCapture(["rules", "explain", "NOPE-999"]);
    expect(code).toBe(2);
    expect(stderr).toContain("rule not found");
  });
});

describe("elite pack evaluate smoke", () => {
  it("evaluates petstore-mini without engine errors", () => {
    const result = analyzeFixture("petstore-mini.yaml");
    expect(result).not.toBeNull();
    if (!result) return;
    expect(Array.isArray(result.findings)).toBe(true);
    for (const f of result.findings) {
      expect(f.fingerprint).toMatch(/^[0-9a-f]{64}$/);
      expect(f.packId).toBe("elite");
    }
  });
});

describe("elite pack noise thresholds (AC-P.6)", () => {
  for (const [rel, { max }] of Object.entries(NOISE_THRESHOLDS)) {
    it(`${rel} findings ≤ ${max}`, () => {
      const result = analyzeFixture(rel);
      expect(result).not.toBeNull();
      if (!result) return;
      const summary = {
        total: result.findings.length,
        bySeverity: result.findings.reduce(
          (acc, f) => {
            acc[f.severity] = (acc[f.severity] ?? 0) + 1;
            return acc;
          },
          {} as Record<string, number>,
        ),
      };
      expect(
        summary.total,
        `noise ceiling for ${rel}: ${JSON.stringify(summary)}`,
      ).toBeLessThanOrEqual(max);
    });
  }
});

describe("elite pack public fixtures (AC-P.6)", () => {
  it("has committed public specs for noise runs", () => {
    const files = readdirSync(publicDir);
    expect(files).toContain("petstore3.json");
    expect(files).toContain("petstore2.yaml");
    expect(files.length).toBeGreaterThanOrEqual(3);
  });

  it("parses public petstore without engine errors", () => {
    const result = analyzeFixture("public/petstore3.json");
    expect(result).not.toBeNull();
  });
});
