import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  classifySpectralRules,
  resolveSpectralRuleset,
  ruleCountGuard,
  serializeImports,
  validateImports,
  type SpectralRule,
} from "../src/spectral.js";
import { VENDOR_OAS } from "../src/vendor-oas.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-spectral-"));
  tempRoots.push(dir);
  return dir;
}

function writeRuleset(dir: string, name: string, lines: string[]): string {
  const path = join(dir, name);
  writeFileSync(path, lines.join("\n") + "\n", "utf8");
  return path;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
});

function rule(partial: Partial<SpectralRule> & { given: SpectralRule["given"]; then: SpectralRule["then"] }): SpectralRule {
  return { severity: 1, ...partial };
}

function classifySingle(spec: SpectralRule) {
  const map = new Map<string, SpectralRule | false>([["test-rule", spec]]);
  return classifySpectralRules(map as Map<string, never>);
}

describe("resolveSpectralRuleset (extends offline, D1)", () => {
  it("resolves extends: [spectral:oas] against the vendored 1.23.0 copy", () => {
    const dir = tempDir();
    const path = writeRuleset(dir, "rs.yaml", ["extends: [spectral:oas]", "rules: {}"]);
    const result = resolveSpectralRuleset(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.size).toBe(57);
    expect(VENDOR_OAS._ankaaVendor.version).toBe("1.23.0");
  });

  it("merges user overrides and disables rules set to false", () => {
    const dir = tempDir();
    const path = writeRuleset(dir, "rs.yaml", [
      "extends: [spectral:oas]",
      "rules:",
      "  info-description:",
      "    severity: 0",
      "  typed-enum: false",
      "  my-own-rule:",
      "    severity: 1",
      "    given: '#OperationObject'",
      "    then:",
      "      - field: summary",
      "        function: truthy",
    ]);
    const result = resolveSpectralRuleset(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.size).toBe(57);
    expect((result.rules.get("info-description") as SpectralRule).severity).toBe(0);
    expect(result.rules.has("typed-enum")).toBe(false);
    expect(result.rules.has("my-own-rule")).toBe(true);
  });

  it("resolves local extends files (depth-limited, cycle-safe)", () => {
    const dir = tempDir();
    writeRuleset(dir, "base.yaml", [
      "rules:",
      "  from-base:",
      "    severity: 2",
      "    given: '#OperationObject'",
      "    then:",
      "      - field: description",
      "        function: truthy",
    ]);
    const main = writeRuleset(dir, "main.yaml", [
      "extends: [./base.yaml]",
      "rules: {}",
    ]);
    const result = resolveSpectralRuleset(main);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules.size).toBe(1);
    expect(result.rules.has("from-base")).toBe(true);

    const selfRef = writeRuleset(dir, "cycle.yaml", ["extends: [./cycle.yaml]", "rules: {}"]);
    const cycle = resolveSpectralRuleset(selfRef);
    expect(cycle.ok).toBe(false);
    if (cycle.ok) return;
    expect(cycle.error).toContain("cycle");
  });

  it("rejects other spectral:* and remote targets with a clear error (INV-1)", () => {
    const dir = tempDir();
    const unsupported = writeRuleset(dir, "u.yaml", ["extends: [spectral:oas3]", "rules: {}"]);
    const r1 = resolveSpectralRuleset(unsupported);
    expect(r1.ok).toBe(false);
    if (r1.ok) return;
    expect(r1.error).toContain("spectral:oas");

    const remote = writeRuleset(dir, "r.yaml", [
      "extends: [https://example.com/rules.yaml]",
      "rules: {}",
    ]);
    const r2 = resolveSpectralRuleset(remote);
    expect(r2.ok).toBe(false);
    if (r2.ok) return;
    expect(r2.error).toContain("INV-1");
  });
});

describe("shapes S1..S7 (D2, spec Â§3c)", () => {
  it("S1/S2: $.paths + pattern(@key, notMatch/match) â†’ pathMatches", () => {
    const s1 = classifySingle(
      rule({
        given: "$.paths",
        then: [{ field: "@key", function: "pattern", functionOptions: { notMatch: "\\{\\}" } }],
      }),
    );
    expect(s1.imports[0]!.shape).toBe("S1");
    expect((s1.imports[0]!.rule as { when: unknown }).when).toEqual({
      op: "pathMatches",
      pattern: "\\{\\}",
    });

    const s2 = classifySingle(
      rule({
        given: "$.paths",
        then: [{ field: "@key", function: "pattern", functionOptions: { match: "/$" } }],
      }),
    );
    expect((s2.imports[0]!.rule as { when: unknown }).when).toEqual({
      not: { op: "pathMatches", pattern: "/$" },
    });
  });

  it("S3/S4: #OperationObject + pattern(operationId) â†’ operationIdPattern", () => {
    const s3 = classifySingle(
      rule({
        given: "#OperationObject",
        then: [
          { field: "operationId", function: "pattern", functionOptions: { match: "^[a-z]+$" } },
        ],
      }),
    );
    expect((s3.imports[0]!.rule as { when: unknown }).when).toEqual({
      not: { op: "operationIdPattern", pattern: "^[a-z]+$" },
    });

    const s4 = classifySingle(
      rule({
        given: "#OperationObject",
        then: [
          { field: "operationId", function: "pattern", functionOptions: { notMatch: "\\s" } },
        ],
      }),
    );
    expect((s4.imports[0]!.rule as { when: unknown }).when).toEqual({
      op: "operationIdPattern",
      pattern: "\\s",
    });
  });

  it("S5/S6: $..[description,title] + pattern â†’ descriptionMatches (op-level approximation)", () => {
    const s5 = classifySingle(
      rule({
        given: "$..[description,title]",
        then: [{ function: "pattern", functionOptions: { notMatch: "eval\\(" } }],
      }),
    );
    const when = (s5.imports[0]!.rule as { when: { any: unknown[] } }).when;
    expect(when.any).toEqual([
      { op: "descriptionMatches", target: "description", pattern: "eval\\(" },
      { op: "descriptionMatches", target: "summary", pattern: "eval\\(" },
    ]);

    const s6 = classifySingle(
      rule({
        given: "$..[description,title]",
        then: [{ function: "pattern", functionOptions: { match: "^[A-Z]" } }],
      }),
    );
    expect((s6.imports[0]!.rule as { when: { not: unknown } }).when.not).toBeDefined();
  });

  it("S7: #OperationObject + truthy(field) â†’ missingField (whitelisted fields)", () => {
    for (const field of ["description", "operationId", "summary", "tags"]) {
      const out = classifySingle(
        rule({ given: "#OperationObject", then: [{ field, function: "truthy" }] }),
      );
      expect((out.imports[0]!.rule as { when: unknown }).when).toEqual({
        op: "missingField",
        field,
      });
    }
    const rejected = classifySingle(
      rule({ given: "#OperationObject", then: [{ field: "deprecated", function: "truthy" }] }),
    );
    expect(rejected.skipped[0]!.reason).toContain("truthy field");
  });

  it("every generated rule passes validateRule (envelope D4)", () => {
    const map = new Map<string, SpectralRule | false>();
    const fixtures: Array<[string, SpectralRule]> = [
      ["a", rule({ given: "$.paths", then: [{ field: "@key", function: "pattern", functionOptions: { notMatch: "\\{\\}" } }] })],
      ["b", rule({ given: "#OperationObject", then: [{ field: "summary", function: "truthy" }] })],
      ["c", rule({ given: "$..[description,title]", then: [{ function: "pattern", functionOptions: { notMatch: "<script" } }] })],
    ];
    for (const [name, spec] of fixtures) map.set(name, spec);
    const classified = classifySpectralRules(map as Map<string, never>);
    expect(classified.imports).toHaveLength(3);
    const { valid, invalid } = validateImports(classified.imports, "0.0.0-dev");
    expect(invalid).toEqual([]);
    expect(valid.map((v) => v.id)).toEqual(["SPEC-001", "SPEC-002", "SPEC-003"]);
  });

  it("out-of-shape functions and givens skip with a reason, never silently", () => {
    const out = classifySingle(
      rule({ given: "$.tags[*]", then: [{ field: "description", function: "truthy" }] }),
    );
    expect(out.imports).toHaveLength(0);
    expect(out.skipped[0]!.reason).toContain("truthy over given");

    const multi = classifySingle(
      rule({
        given: "#OperationObject",
        then: [
          { field: "summary", function: "truthy" },
          { field: "description", function: "truthy" },
        ],
      }),
    );
    expect(multi.skipped[0]!.reason).toContain("single-then");
  });
});

describe("classification of the vendored spectral:oas (spec Â§3b)", () => {
  it("14 covered Â· 4 imported Â· deterministic SPEC-NNN ids", () => {
    const dir = tempDir();
    const path = writeRuleset(dir, "rs.yaml", ["extends: [spectral:oas]", "rules: {}"]);
    const resolved = resolveSpectralRuleset(path);
    expect(resolved.ok).toBe(true);
    if (!resolved.ok) return;
    const out = classifySpectralRules(resolved.rules as Map<string, never>);
    expect(out.covered).toHaveLength(14);
    expect(out.covered.map((c) => c.equivalent).sort()).toContain("RESP-001");
    expect(out.imports.map((i) => i.name)).toEqual([
      "no-eval-in-markdown",
      "no-script-tags-in-markdown",
      "operation-operationId-valid-in-url",
      "path-declarations-must-exist",
    ]);
    expect(out.imports.map((i) => i.id)).toEqual(["SPEC-001", "SPEC-002", "SPEC-003", "SPEC-004"]);
    expect(out.imports.length + out.covered.length + out.skipped.length).toBe(57);
    const { valid, invalid } = validateImports(out.imports, "0.0.0-dev");
    expect(invalid).toHaveLength(0);
    expect(valid).toHaveLength(4);
  });

  it("serializeImports emits a stable custom-rules envelope", () => {
    const dir = tempDir();
    const path = writeRuleset(dir, "rs.yaml", ["extends: [spectral:oas]", "rules: {}"]);
    const resolved = resolveSpectralRuleset(path);
    if (!resolved.ok) return;
    const out = classifySpectralRules(resolved.rules as Map<string, never>);
    const first = serializeImports(validateImports(out.imports, "0.0.0-dev").valid);
    const second = serializeImports(validateImports(out.imports, "0.0.0-dev").valid);
    expect(first).toBe(second);
    expect(first).toContain("id: SPEC-001");
    expect(first).toContain("category: custom");
  });

  it("guards rule counts over the cap (D5)", () => {
    const big = new Map<string, SpectralRule | false>();
    for (let i = 0; i < 501; i++) big.set(`r-${i}`, rule({ given: "$.paths", then: [] }));
    expect(ruleCountGuard(big as Map<string, never>)).toContain("max 500");
    expect(ruleCountGuard(new Map())).toBeUndefined();
  });
});
