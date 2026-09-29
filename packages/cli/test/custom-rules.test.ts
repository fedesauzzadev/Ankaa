import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { collectCustomRules, loadRulesFile, validateRulesFiles } from "../src/custom-rules.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-rules-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

function writeRules(name: string, body: string): string {
  const dir = tempDir();
  const path = join(dir, name);
  writeFileSync(path, body, "utf8");
  return path;
}

const VALID_RULE = [
  "id: TEAM-001",
  "category: custom",
  "severity: error",
  'message: "Every operation must accept x-request-id."',
  "when:",
  "  not:",
  "    op: headerRequired",
  "    name: x-request-id",
].join("\n");

describe("loadRulesFile", () => {
  it("loads array form", () => {
    const path = writeRules("a.yaml", `- ${VALID_RULE.split("\n").join("\n  ")}`);
    const result = loadRulesFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules).toHaveLength(1);
  });

  it("loads { rules: [...] } form", () => {
    const path = writeRules("b.yaml", `rules:\n  - ${VALID_RULE.split("\n").join("\n    ")}`);
    const result = loadRulesFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules).toHaveLength(1);
  });

  it("loads single object with id", () => {
    const path = writeRules("c.yaml", VALID_RULE);
    const result = loadRulesFile(path);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules).toHaveLength(1);
  });

  it("AC-R2.10 missing file exits with not found", () => {
    const result = loadRulesFile(join(tempDir(), "nope.yaml"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("rules file not found");
  });

  it("AC-R2.10 invalid structure message", () => {
    const path = writeRules("bad.yaml", "foo: bar\n");
    const result = loadRulesFile(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("expected an array of rules");
  });
});

describe("collectCustomRules", () => {
  it("stamps and validates a single rule", () => {
    const path = writeRules("ok.yaml", VALID_RULE);
    const result = collectCustomRules([{ kind: "file", path }], "0.0.0-dev");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rules[0]!.id).toBe("TEAM-001");
    expect(result.rules[0]!.packId).toBe("custom");
    expect(result.rules[0]!.source).toBeUndefined();
  });

  it("AC-R2.4 duplicate id across files exits", () => {
    const a = writeRules("a.yaml", VALID_RULE);
    const b = writeRules("b.yaml", VALID_RULE);
    const result = collectCustomRules(
      [
        { kind: "file", path: a },
        { kind: "file", path: b },
      ],
      "0.0.0-dev",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("duplicate rule id TEAM-001");
    expect(result.error).toContain(a);
    expect(result.error).toContain(b);
  });

  it("AC-R2.5 collision with elite id exits", () => {
    const path = writeRules("clash.yaml", VALID_RULE.replace("TEAM-001", "NAMING-001"));
    const result = collectCustomRules([{ kind: "file", path }], "0.0.0-dev", {
      eliteRuleIds: new Set(["NAMING-001"]),
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("already exists in pack elite");
    expect(result.error).toContain("NAMING-001");
  });

  it("rejects invalid inline JSON", () => {
    const result = collectCustomRules([{ kind: "inline", json: "{not json" }], "0.0.0-dev");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("--rule is not valid JSON");
  });

  it("rejects invalid rule shape with origin in message", () => {
    const result = collectCustomRules(
      [{ kind: "inline", json: JSON.stringify({ id: "bad", when: {} }) }],
      "0.0.0-dev",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid custom rule in --rule");
  });
});

describe("validateRulesFiles", () => {
  it("AC-R2.1 valid file reports ok and count", () => {
    const path = writeRules("v.yaml", VALID_RULE);
    const outcomes = validateRulesFiles([path], "0.0.0-dev", tempDir());
    expect(outcomes).toHaveLength(1);
    expect(outcomes[0]!.ok).toBe(true);
    expect(outcomes[0]!.ruleCount).toBe(1);
  });

  it("AC-R2.2 reports issues for bad rules", () => {
    const path = writeRules(
      "bad.yaml",
      ["id: bad", "category: custom", "severity: error", "message: x", "when: {}"].join("\n"),
    );
    const outcomes = validateRulesFiles([path], "0.0.0-dev", tempDir());
    expect(outcomes[0]!.ok).toBe(false);
    expect(outcomes[0]!.errors[0]!.issues.length).toBeGreaterThan(0);
  });

  it("AC-R2.3 collects issues across multiple files", () => {
    const good = writeRules("good.yaml", VALID_RULE);
    const bad = writeRules("bad2.yaml", "not-a-rule: true\n");
    const outcomes = validateRulesFiles([good, bad], "0.0.0-dev", tempDir());
    expect(outcomes[0]!.ok).toBe(true);
    expect(outcomes[1]!.ok).toBe(false);
    expect(outcomes[1]!.structuralError).toContain("expected an array");
  });

  it("AC-R2.9 custom rules do not require source", () => {
    const path = writeRules("nosrc.yaml", VALID_RULE);
    const outcomes = validateRulesFiles([path], "0.0.0-dev", tempDir());
    expect(outcomes[0]!.ok).toBe(true);
  });
});
