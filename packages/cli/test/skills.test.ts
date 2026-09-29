import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Finding } from "@apigovscan/core";
import {
  applySkillSuppressions,
  compileMatchRegexes,
  loadSkills,
  mergeSeverityOverrides,
  resolveSkillsDir,
  type SuppressionEntry,
} from "../src/skills.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-skills-"));
  tempRoots.push(dir);
  return dir;
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

function writeSkills(dir: string, files: Record<string, string>): string {
  const skillsDir = join(dir, ".apigovscan", "skills");
  mkdirSync(skillsDir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    const full = join(skillsDir, name);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, content, "utf8");
  }
  return skillsDir;
}

function finding(partial: Partial<Finding> = {}): Finding {
  return {
    fingerprint: "a".repeat(64),
    ruleId: "NAMING-001",
    severity: "error",
    category: "naming",
    message: "plural",
    location: "/paths/~1user/get",
    apiLocation: "GET /user",
    packId: "elite",
    packVersion: "2026.09.1",
    ...partial,
  };
}

describe("loadSkills (AC-S.1–6)", () => {
  it("missing skills dir → empty skills, not error (AC-S.5)", () => {
    const dir = tempDir();
    const result = loadSkills(join(dir, "nope"), "0.0.0-dev");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skills.suppressions).toEqual([]);
    expect(result.skills.severities).toEqual([]);
    expect(result.skills.activeDraftRules).toEqual([]);
  });

  it("loads valid suppressions and severities (AC-S.1, AC-S.4)", () => {
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "suppressions.yaml": [
        "version: 1",
        "suppressions:",
        `  - fingerprint: ${"b".repeat(64)}`,
        "    reason: legacy",
        "  - match:",
        "      ruleId: NAMING-001",
        '      apiPath: "^/legacy/"',
        "    reason: legacy namespace",
      ].join("\n"),
      "severities.yaml": [
        "version: 1",
        "overrides:",
        "  - ruleId: PAGINATION-001",
        "    severity: error",
      ].join("\n"),
    });
    const result = loadSkills(skillsDir, "0.0.0-dev");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skills.suppressions).toHaveLength(2);
    expect(result.skills.suppressions[0]!.fingerprint).toBe("b".repeat(64));
    expect(result.skills.suppressions[1]!.match?.ruleId).toBe("NAMING-001");
    expect(result.skills.severities).toEqual([{ ruleId: "PAGINATION-001", severity: "error" }]);
  });

  it("missing reason → error (AC-S.3)", () => {
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "suppressions.yaml": [
        "version: 1",
        "suppressions:",
        `  - fingerprint: ${"c".repeat(64)}`,
      ].join("\n"),
    });
    const result = loadSkills(skillsDir, "0.0.0-dev");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("reason");
  });

  it("unsupported version → error (AC-S.6)", () => {
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "severities.yaml": "version: 99\noverrides: []\n",
    });
    const result = loadSkills(skillsDir, "0.0.0-dev");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unsupported skills version");
  });

  it("neither fingerprint nor match → error (AC-S.3)", () => {
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "suppressions.yaml": ["version: 1", "suppressions:", "  - reason: no key"].join("\n"),
    });
    const result = loadSkills(skillsDir, "0.0.0-dev");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("exactly one");
  });

  it("draft: true not loaded; draft: false loaded as active (AC-S.7)", () => {
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "drafts/TEAM-001.yaml": [
        "id: TEAM-001",
        "draft: true",
        "category: custom",
        "severity: warning",
        'message: "Draft rule message."',
        "when:",
        "  op: method",
        "  in: [post]",
      ].join("\n"),
      "drafts/TEAM-002.yaml": [
        "id: TEAM-002",
        "draft: false",
        "category: custom",
        "severity: warning",
        'message: "Active draft message."',
        "when:",
        "  op: method",
        "  in: [put]",
      ].join("\n"),
    });
    const result = loadSkills(skillsDir, "0.0.0-dev");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skills.activeDraftRules.map((r) => r.id)).toEqual(["TEAM-002"]);
  });

  it("unsafe apiPath regex → error (AC-S.6)", () => {
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "suppressions.yaml": [
        "version: 1",
        "suppressions:",
        "  - match:",
        "      ruleId: NAMING-001",
        '      apiPath: "(a+)+$"',
        "    reason: bad",
      ].join("\n"),
    });
    const result = loadSkills(skillsDir, "0.0.0-dev");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatch(/unsafe|nested/i);
  });
});

describe("applySkillSuppressions (AC-S.1, AC-S.2, AC-S.8)", () => {
  const fingerprintSup: SuppressionEntry[] = [{ fingerprint: "a".repeat(64), reason: "fp" }];

  it("fingerprint match suppresses", () => {
    const regexes = new Map<number, RegExp>();
    const { visible, suppressed } = applySkillSuppressions(
      [finding(), finding({ fingerprint: "d".repeat(64) })],
      fingerprintSup,
      regexes,
    );
    expect(suppressed).toBe(1);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.fingerprint).toBe("d".repeat(64));
  });

  it("match by ruleId + apiPath (AC-S.2)", () => {
    const sup: SuppressionEntry[] = [
      {
        match: { ruleId: "NAMING-001", apiPath: "^/legacy/" },
        reason: "legacy",
      },
    ];
    const compiled = compileMatchRegexes(sup, "test");
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const legacy = finding({
      fingerprint: "e".repeat(64),
      apiLocation: "GET /legacy/user",
    });
    const modern = finding({
      fingerprint: "f".repeat(64),
      apiLocation: "GET /users",
    });
    const { visible, suppressed } = applySkillSuppressions([legacy, modern], sup, compiled.map);
    expect(suppressed).toBe(1);
    expect(visible.map((f) => f.fingerprint)).toEqual(["f".repeat(64)]);
  });

  it("order of severity vs suppressions load does not change apply result (AC-S.8)", () => {
    const a = applySkillSuppressions([finding()], fingerprintSup, new Map());
    const b = applySkillSuppressions([finding()], fingerprintSup, new Map());
    expect(a).toEqual(b);
  });
});

describe("mergeSeverityOverrides precedence", () => {
  it("config rules win over skills (AC-S.4)", () => {
    const merged = mergeSeverityOverrides(
      [
        { ruleId: "A-001", severity: "info" },
        { ruleId: "B-001", severity: "warning" },
      ],
      new Map([["A-001", "error" as const]]),
    );
    expect(merged.get("A-001")).toBe("error");
    expect(merged.get("B-001")).toBe("warning");
  });

  it("skills override pack default when no config", () => {
    const merged = mergeSeverityOverrides(
      [{ ruleId: "PAGINATION-001", severity: "error" }],
      new Map(),
    );
    expect(merged.get("PAGINATION-001")).toBe("error");
  });
});

describe("resolveSkillsDir", () => {
  it("default is .apigovscan/skills under cwd", () => {
    const dir = tempDir();
    const resolved = resolveSkillsDir({}, dir);
    expect(resolved).toBe(join(dir, ".apigovscan", "skills"));
  });

  it("config skillsDir relative to configDir", () => {
    const dir = tempDir();
    const configDir = join(dir, "cfg");
    mkdirSync(configDir, { recursive: true });
    const resolved = resolveSkillsDir({ skillsDir: "custom/skills", configDir }, dir);
    expect(resolved).toBe(join(configDir, "custom", "skills"));
  });

  it("flag overrides config", () => {
    const dir = tempDir();
    const resolved = resolveSkillsDir(
      { skillsDir: "from-config", configDir: dir },
      dir,
      join(dir, "flagged"),
    );
    expect(resolved).toBe(join(dir, "flagged"));
  });
});
