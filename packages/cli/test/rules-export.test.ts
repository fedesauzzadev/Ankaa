import { describe, expect, it } from "vitest";
import type { RulePack } from "@apigovscan/core";
import { buildAgentsMd, buildPromptsJson } from "../src/rules-export.js";

const ELITE: RulePack = {
  id: "elite",
  version: "2026.09.1",
  rules: [
    {
      id: "NAMING-001",
      category: "naming",
      severity: "error",
      message: "Resource path segments should be plural nouns.",
      fix: "Rename the last fixed path segment to plural.",
      examples: { bad: "paths:\n  /user:", good: "paths:\n  /users:" },
      source: { title: "Google API Design Guide", url: "https://cloud.google.com/apis/design" },
      packId: "elite",
      packVersion: "2026.09.1",
      when: { op: "method", in: ["get"] },
    },
    {
      id: "DOCS-009",
      category: "docs",
      severity: "info",
      message: "Remove example.com placeholders from documentation.",
      packId: "elite",
      packVersion: "2026.09.1",
      when: { op: "method", in: ["get"] },
    },
    {
      id: "OLD-001",
      category: "custom",
      severity: "warning",
      message: "Retired rule.",
      deprecated: true,
      packId: "elite",
      packVersion: "2026.09.1",
      when: { op: "method", in: ["get"] },
    },
  ],
};

const CUSTOM: RulePack = {
  id: "custom",
  version: "0.0.0-dev",
  rules: [
    {
      id: "TEAM-001",
      category: "custom",
      severity: "warning",
      message: "Every operation must accept x-request-id.",
      appliesFrom: "stable",
      packId: "custom",
      packVersion: "0.0.0-dev",
      when: { op: "method", in: ["get"] },
    },
  ],
};

describe("buildAgentsMd (AC-R2.11)", () => {
  it("groups by MUST/SHOULD/MAY with message, fix, examples and source", () => {
    const md = buildAgentsMd([ELITE]);
    expect(md).toContain("Packs: elite@2026.09.1 (2 rules).");
    expect(md).toContain("## MUST");
    expect(md).toContain("### NAMING-001 — Resource path segments should be plural nouns.");
    expect(md).toContain("Fix: Rename the last fixed path segment to plural.");
    expect(md).toContain("Bad example:");
    expect(md).toContain("paths:\n  /user:");
    expect(md).toContain("Good example:");
    expect(md).toContain("Source: Google API Design Guide (https://cloud.google.com/apis/design)");
    expect(md).toContain("## MAY");
    expect(md).toContain("### DOCS-009");
    expect(md).not.toContain("## SHOULD");
  });

  it("excludes deprecated rules and marks custom packs and appliesFrom", () => {
    const md = buildAgentsMd([ELITE, CUSTOM]);
    expect(md).not.toContain("OLD-001");
    expect(md).toContain("## SHOULD");
    expect(md).toContain("Pack: custom.");
    expect(md).toContain("### TEAM-001");
    expect(md).toContain("Applies from: stable endpoints.");
  });

  it("is byte-identical across renders (no timestamps)", () => {
    expect(buildAgentsMd([ELITE, CUSTOM])).toBe(buildAgentsMd([ELITE, CUSTOM]));
  });
});

describe("buildPromptsJson (AC-R2.12)", () => {
  it("emits one prompt per active rule with remediation text", () => {
    const parsed = JSON.parse(buildPromptsJson([ELITE, CUSTOM])) as {
      tool: string;
      packs: Array<{ id: string; count: number }>;
      prompts: Array<{ ruleId: string; severity: string; keyword: string; prompt: string }>;
    };
    expect(parsed.tool).toBe("apigovscan");
    expect(parsed.packs).toEqual([
      { id: "custom", version: "0.0.0-dev", count: 1 },
      { id: "elite", version: "2026.09.1", count: 2 },
    ]);
    expect(parsed.prompts.map((p) => p.ruleId)).toEqual(["TEAM-001", "DOCS-009", "NAMING-001"]);
    const naming = parsed.prompts.find((p) => p.ruleId === "NAMING-001")!;
    expect(naming.keyword).toBe("MUST");
    expect(naming.prompt).toContain("Resource path segments should be plural nouns.");
    expect(naming.prompt).toContain("Fix hint: Rename the last fixed path segment to plural.");
    expect(naming.prompt).toContain("Bad example:");
    expect(naming.prompt).toContain("unified diff");
  });
});
