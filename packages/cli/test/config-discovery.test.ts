import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { discoverSpecs } from "../src/discovery.js";
import {
  loadConfig,
  loadConfigFromText,
  resolveCustomRulePaths,
} from "../src/config.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-unit-"));
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

describe("discoverSpecs", () => {
  it("finds root openapi.yaml first and stably", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), "openapi: 3.1.0", "utf8");
    writeFileSync(join(dir, "openapi.json"), "{}", "utf8");
    const result = discoverSpecs(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toEqual(["openapi.json", "openapi.yaml"]);
  });

  it("includes swagger when no openapi match", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "swagger.yaml"), "swagger: '2.0'", "utf8");
    const result = discoverSpecs(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toEqual(["swagger.yaml"]);
  });

  it("finds nested openapi under openapi/", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "openapi", "v1"), { recursive: true });
    writeFileSync(
      join(dir, "openapi", "v1", "openapi.yaml"),
      "openapi: 3.1.0",
      "utf8",
    );
    writeFileSync(
      join(dir, "openapi", "openapi.yml"),
      "openapi: 3.1.0",
      "utf8",
    );
    const result = discoverSpecs(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toEqual([
      "openapi/openapi.yml",
      "openapi/v1/openapi.yaml",
    ]);
  });

  it("finds swagger.json anywhere", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "api"), { recursive: true });
    writeFileSync(join(dir, "api", "swagger.json"), "{}", "utf8");
    const result = discoverSpecs(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toEqual(["api/swagger.json"]);
  });

  it("skips node_modules", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(
      join(dir, "node_modules", "pkg", "swagger.yaml"),
      "swagger: '2.0'",
      "utf8",
    );
    const result = discoverSpecs(dir);
    expect(result.ok).toBe(false);
  });

  it("returns error with searched patterns when empty (AC-A.9)", () => {
    const dir = tempDir();
    const result = discoverSpecs(dir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no OpenAPI specs found");
    expect(result.error).toContain("openapi.{yaml,yml,json}");
  });

  it("sorts results lexicographically (AC-A.13)", () => {
    const dir = tempDir();
    mkdirSync(join(dir, "openapi"), { recursive: true });
    writeFileSync(
      join(dir, "openapi", "openapi.yaml"),
      "openapi: 3.1.0",
      "utf8",
    );
    writeFileSync(join(dir, "openapi.json"), "{}", "utf8");
    const result = discoverSpecs(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.paths).toEqual([
      "openapi.json",
      "openapi/openapi.yaml",
    ]);
  });
});

describe("loadConfig", () => {
  it("parses f1 subset", () => {
    const result = loadConfigFromText(
      [
        "failOn: warning",
        "standards:",
        "  pack: elite",
        "rules:",
        "  NAMING-001: off",
        "  ERR-010: warning",
      ].join("\n"),
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.failOn).toBe("warning");
    expect(result.config.standards?.pack).toBe("elite");
    expect(result.config.rules).toEqual({
      "NAMING-001": "off",
      "ERR-010": "warning",
    });
  });

  it("returns empty config when no file present", () => {
    const dir = tempDir();
    const result = loadConfig(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.failOn).toBeUndefined();
    expect(result.config.customRules).toBeUndefined();
  });

  it("fails on invalid failOn", () => {
    const result = loadConfigFromText("failOn: fatal", "apigovscan.yaml");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("failOn");
  });

  it("fails on invalid rules value", () => {
    const result = loadConfigFromText(
      "rules:\n  X-001: nope",
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("rules.X-001");
  });

  it("fails when override path missing", () => {
    const dir = tempDir();
    const result = loadConfig(dir, join(dir, "missing.yaml"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("not found");
  });

  it("AC-C.1 rejects unknown top-level key", () => {
    const result = loadConfigFromText(
      "failOn: error\nwat: true\n",
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('unknown key "wat"');
  });

  it("AC-C.7 allows skillsDir without deep validation", () => {
    const result = loadConfigFromText(
      "skillsDir: .apigovscan/skills\n",
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.skillsDir).toBe(".apigovscan/skills");
  });

  it("parses customRules as string or list", () => {
    const single = loadConfigFromText(
      "customRules: ./team.yaml\n",
      "apigovscan.yaml",
    );
    expect(single.ok).toBe(true);
    if (single.ok) expect(single.config.customRules).toEqual(["./team.yaml"]);

    const multi = loadConfigFromText(
      "customRules:\n  - a.yaml\n  - b.yaml\n",
      "apigovscan.yaml",
    );
    expect(multi.ok).toBe(true);
    if (multi.ok) expect(multi.config.customRules).toEqual(["a.yaml", "b.yaml"]);
  });

  it("parses baseline block", () => {
    const result = loadConfigFromText(
      [
        "baseline:",
        "  enabled: true",
        "  path: .apigovscan/baseline.json",
        "  strictHash: true",
      ].join("\n"),
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.baseline).toEqual({
      enabled: true,
      path: ".apigovscan/baseline.json",
      strictHash: true,
    });
  });

  it("rejects unknown key inside baseline", () => {
    const result = loadConfigFromText(
      "baseline:\n  enabled: true\n  nope: 1\n",
      "apigovscan.yaml",
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('unknown key "nope"');
  });

  it("AC-C.5 sets configDir for path resolution", () => {
    const dir = tempDir();
    const cfg = join(dir, "apigovscan.yaml");
    writeFileSync(cfg, "customRules:\n  - ./team.yaml\n", "utf8");
    const result = loadConfig(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.configDir).toBe(dir);
    expect(resolveCustomRulePaths(result.config, "/elsewhere")).toEqual([
      join(dir, "team.yaml"),
    ]);
  });
});

describe("resolveCustomRulePaths", () => {
  it("falls back to cwd when no config loaded", () => {
    const dir = tempDir();
    const paths = resolveCustomRulePaths(
      { customRules: ["./team.yaml"] },
      dir,
    );
    expect(paths).toEqual([join(dir, "team.yaml")]);
  });
});
