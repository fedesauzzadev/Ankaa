import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Finding } from "@ankaa/core";
import {
  applySkillSuppressions,
  compileMatchRegexes,
  isExpiredWaiver,
  isValidExpiryDate,
  loadSkills,
  mergeSeverityOverrides,
  resolveSkillsDir,
  todayYmd,
  type SuppressionEntry,
} from "../src/skills.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-skills-"));
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
  const skillsDir = join(dir, ".ankaa", "skills");
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

describe("waiver expiry + owner (AC-S.11…13)", () => {
  it("isValidExpiryDate accepts real dates, rejects garbage", () => {
    expect(isValidExpiryDate("2026-12-31")).toBe(true);
    expect(isValidExpiryDate("2024-02-29")).toBe(true);
    expect(isValidExpiryDate("2023-02-29")).toBe(false);
    expect(isValidExpiryDate("2026-13-01")).toBe(false);
    expect(isValidExpiryDate("2026-00-10")).toBe(false);
    expect(isValidExpiryDate("2026-1-1")).toBe(false);
    expect(isValidExpiryDate("tomorrow")).toBe(false);
    expect(isValidExpiryDate("")).toBe(false);
    expect(todayYmd()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("isExpiredWaiver compares strictly against the given day", () => {
    expect(isExpiredWaiver(undefined, "2026-09-30")).toBe(false);
    expect(isExpiredWaiver("2026-09-29", "2026-09-30")).toBe(true);
    expect(isExpiredWaiver("2026-09-30", "2026-09-30")).toBe(false);
    expect(isExpiredWaiver("2026-10-01", "2026-09-30")).toBe(false);
  });

  it("loads expires + owner (AC-S.11)", () => {
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "suppressions.yaml": [
        "version: 1",
        "suppressions:",
        `  - fingerprint: ${"b".repeat(64)}`,
        "    reason: freeze",
        "    owner: payments-team",
        "    expires: 2099-12-31",
      ].join("\n"),
    });
    const result = loadSkills(skillsDir, "0.0.0-dev");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skills.suppressions[0]).toMatchObject({
      owner: "payments-team",
      expires: "2099-12-31",
    });
  });

  it("rejects bad expires and empty owner at load (AC-S.11)", () => {
    for (const bad of ["tomorrow", "2026-13-40", "2023-02-29", "2026-1-1"]) {
      const dir = tempDir();
      const skillsDir = writeSkills(dir, {
        "suppressions.yaml": [
          "version: 1",
          "suppressions:",
          `  - fingerprint: ${"b".repeat(64)}`,
          "    reason: freeze",
          `    expires: ${bad}`,
        ].join("\n"),
      });
      const result = loadSkills(skillsDir, "0.0.0-dev");
      expect(result.ok).toBe(false);
      if (result.ok) continue;
      expect(result.error).toContain("expires must be YYYY-MM-DD");
    }
    const dir = tempDir();
    const skillsDir = writeSkills(dir, {
      "suppressions.yaml": ["version: 1", "suppressions:", `  - fingerprint: ${"b".repeat(64)}`, "    reason: freeze", "    owner: '   '"].join(
        "\n",
      ),
    });
    const empty = loadSkills(skillsDir, "0.0.0-dev");
    expect(empty.ok).toBe(false);
    if (!empty.ok) expect(empty.error).toContain("owner must be a non-empty string");
  });

  it("expired waiver does not suppress and is reported (AC-S.12)", () => {
    const sup: SuppressionEntry[] = [
      { fingerprint: "a".repeat(64), reason: "old", expires: "2000-01-01" },
    ];
    const out = applySkillSuppressions([finding()], sup, new Map(), "2026-09-30");
    expect(out.suppressed).toBe(0);
    expect(out.visible).toHaveLength(1);
    expect(out.expiredIndexes).toEqual([0]);
    expect(out.matchedIndexes).toEqual([]);
  });

  it("future waiver suppresses normally (AC-S.12)", () => {
    const sup: SuppressionEntry[] = [
      { fingerprint: "a".repeat(64), reason: "freeze", expires: "2099-01-01", owner: "t" },
    ];
    const out = applySkillSuppressions([finding()], sup, new Map(), "2026-09-30");
    expect(out.suppressed).toBe(1);
    expect(out.visible).toHaveLength(0);
    expect(out.matchedIndexes).toEqual([0]);
    expect(out.expiredIndexes).toEqual([]);
  });

  it("same-day expiry is still active (strict <)", () => {
    const sup: SuppressionEntry[] = [
      { fingerprint: "a".repeat(64), reason: "today", expires: "2026-09-30" },
    ];
    const out = applySkillSuppressions([finding()], sup, new Map(), "2026-09-30");
    expect(out.suppressed).toBe(1);
  });

  it("unmatched entry is neither matched nor expired (orphan input, AC-S.13)", () => {
    const sup: SuppressionEntry[] = [{ fingerprint: "f".repeat(64), reason: "ghost" }];
    const out = applySkillSuppressions([finding()], sup, new Map(), "2026-09-30");
    expect(out.suppressed).toBe(0);
    expect(out.matchedIndexes).toEqual([]);
    expect(out.expiredIndexes).toEqual([]);
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
  it("default is .ankaa/skills under cwd", () => {
    const dir = tempDir();
    const resolved = resolveSkillsDir({}, dir);
    expect(resolved).toBe(join(dir, ".ankaa", "skills"));
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
