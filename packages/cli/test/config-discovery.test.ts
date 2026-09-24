import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { discoverSpecs } from "../src/discovery.js";
import { loadConfig, loadConfigFromText } from "../src/config.js";

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
    expect(result.config).toEqual({});
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
});
