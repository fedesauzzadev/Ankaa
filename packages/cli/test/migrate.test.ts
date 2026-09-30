import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import {
  buildMigration,
  jsonPathToPointer,
  parseRedoclyIgnore,
  parseVacuumIgnore,
  serializeMigrated,
  type IgnoreEntry,
} from "../src/migrate.js";
import type { Finding } from "@ankaa/core";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-migrate-"));
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

async function runCapture(
  argv: string[],
  io: { cwd?: string } = {},
): Promise<{ code: number; stdout: string; stderr: string }> {
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
    cwd: io.cwd ?? repoRoot,
  });
  return { code, stdout, stderr };
}

function finding(ruleId: string, pointer: string, fingerprint: string): Finding {
  return {
    fingerprint,
    ruleId,
    severity: "warning",
    category: "naming",
    message: "x",
    location: pointer,
    packId: "elite",
    packVersion: "1",
  };
}

describe("migrate unit", () => {
  it("jsonPathToPointer converts dot, bracket-index and quoted segments with escaping", () => {
    expect(jsonPathToPointer("$.paths.pets.get")).toEqual({ ok: true, pointer: "/paths/pets/get" });
    expect(jsonPathToPointer("$.paths[0].get")).toEqual({ ok: true, pointer: "/paths/0/get" });
    expect(jsonPathToPointer("$['paths']['pets/cat']['get']")).toEqual({
      ok: true,
      pointer: "/paths/pets~1cat/get",
    });
    expect(jsonPathToPointer("$['a~b']")).toEqual({ ok: true, pointer: "/a~0b" });
  });

  it("jsonPathToPointer rejects unsupported paths honestly", () => {
    expect(jsonPathToPointer("$..paths").ok).toBe(false);
    expect(jsonPathToPointer("$.paths[*]").ok).toBe(false);
    expect(jsonPathToPointer("paths.get").ok).toBe(false);
    expect(jsonPathToPointer("$.paths[?(@.x)]").ok).toBe(false);
  });

  it("buildMigration matches by location and records the foreign rule in the reason", () => {
    const findings = [
      finding("NAMING-001", "/paths/~1pets/get", "a".repeat(64)),
      finding("SEC-002", "/paths/~1pets/get", "b".repeat(64)),
      finding("ERR-003", "/paths/~1pets/post", "c".repeat(64)),
    ];
    const entries: IgnoreEntry[] = [
      { ruleId: "operation-operationId", pointer: "/paths/~1pets/get", rawPath: "#/paths/~1pets/get", fileKey: "openapi.yaml" },
      { ruleId: "info-license", pointer: "/info/license", rawPath: "#/info/license", fileKey: "openapi.yaml" },
      { ruleId: "op-2", pointer: "/paths/~1pets/get", rawPath: "#/paths/~1pets/get", fileKey: "other.yaml" },
    ];
    const plan = buildMigration({ findings, entries, specBasename: "openapi.yaml", origin: "redocly" });
    expect(plan.suppressions).toHaveLength(2);
    expect(plan.suppressions.map((s) => s.fingerprint).sort()).toEqual(["a".repeat(64), "b".repeat(64)]);
    expect(plan.suppressions[0]!.reason).toContain("redocly");
    expect(plan.suppressions[0]!.reason).toContain("operation-operationId");
    expect(plan.unmatched).toHaveLength(2);
    expect(plan.unmatched[0]!.reason).toContain("no finding at");
    expect(plan.unmatched[1]!.reason).toContain("does not match spec");
  });

  it("buildMigration dedups fingerprints across entries and is deterministic", () => {
    const findings = [finding("NAMING-001", "/x", "d".repeat(64))];
    const entries: IgnoreEntry[] = [
      { ruleId: "r1", pointer: "/x", rawPath: "#/x" },
      { ruleId: "r2", pointer: "/x", rawPath: "#/x" },
    ];
    const plan = buildMigration({ findings, entries, specBasename: "openapi.yaml", origin: "vacuum" });
    expect(plan.suppressions).toHaveLength(1);
    expect(serializeMigrated(plan.suppressions)).toBe(serializeMigrated(plan.suppressions));
  });

  it("unconvertible vacuum paths become unmatched entries, not guesses", () => {
    const dir = tempDir();
    const ignore = join(dir, "ignore.yaml");
    writeFileSync(ignore, ["rule-a:", "  - $..paths", "rule-b:", "  - $.info.title", ""].join("\n"), "utf8");
    const parsed = parseVacuumIgnore(ignore);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.entries[0]!.pointer).toBe("");
    expect(parsed.entries[1]!.pointer).toBe("/info/title");
    const plan = buildMigration({
      findings: [],
      entries: parsed.entries,
      specBasename: "openapi.yaml",
      origin: "vacuum",
    });
    expect(plan.suppressions).toEqual([]);
    expect(plan.unmatched).toHaveLength(2);
    expect(plan.unmatched[0]!.reason).toContain("not convertible");
    expect(plan.unmatched[1]!.reason).toContain("no finding at");
  });

  it("parseRedoclyIgnore validates shapes", () => {
    const dir = tempDir();
    const ok = join(dir, "ok.yaml");
    writeFileSync(
      ok,
      ["openapi.yaml:", "  operation-operationId:", "    - '#/paths/~1pets/get'", ""].join("\n"),
      "utf8",
    );
    const parsed = parseRedoclyIgnore(ok);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.entries[0]!.pointer).toBe("/paths/~1pets/get");
      expect(parsed.entries[0]!.fileKey).toBe("openapi.yaml");
    }

    const bad = join(dir, "bad.yaml");
    writeFileSync(bad, "openapi.yaml:\n  rule: not-a-list\n", "utf8");
    expect(parseRedoclyIgnore(bad).ok).toBe(false);
    expect(parseRedoclyIgnore(join(dir, "nope.yaml")).ok).toBe(false);
  });
});

async function analyzeSpec(dir: string, specPath: string): Promise<Array<{ fingerprint: string; ruleId: string; location: string }>> {
  const { code, stdout } = await runCapture(
    ["analyze", specPath, "--format", "json", "--fail-on", "never", "--no-color"],
    { cwd: dir },
  );
  expect([0, 1]).toContain(code);
  const report = JSON.parse(stdout) as { findings: Array<{ fingerprint: string; ruleId: string; location: string }> };
  expect(report.findings.length).toBeGreaterThan(2);
  return report.findings;
}

describe("migrate e2e (AC-MG.*)", () => {
  it("AC-MG.1/2 redocly: migrate → re-analyze applies migrated suppressions", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, readFileSync(petstore, "utf8"), "utf8");
    const findings = await analyzeSpec(dir, spec);
    const specName = basename(spec);

    const targets = findings.filter((f, i, all) => all.findIndex((o) => o.location === f.location) === i).slice(0, 2);
    const ignoreFile = join(dir, ".redocly.lint-ignore.yaml");
    const lines = [`${specName}:`, "  operation-operationId:"];
    for (const t of targets) {
      lines.push(`    - '${t.location.replace(/^\//, "#/")}'`);
    }
    lines.push(`    - '#/info/nonexistent'`, "");
    writeFileSync(ignoreFile, lines.join("\n"), "utf8");

    const migrated = await runCapture(
      ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml"],
      { cwd: dir },
    );
    expect(migrated.code).toBe(0);
    expect(migrated.stdout).toContain("imported:");
    const dest = join(dir, ".ankaa", "skills", "migrated", "redocly.yaml");
    expect(existsSync(dest)).toBe(true);
    const written = readFileSync(dest, "utf8");
    expect(written).toContain("migrated from redocly ignore");
    expect(migrated.stdout).toContain("unmatched: 1");
    expect(migrated.stdout).toContain("no finding at");

    const expected = targets.reduce<number>((sum, t) => sum + findings.filter((f) => f.location === t.location).length, 0);
    const after = await runCapture(
      ["analyze", spec, "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    const afterReport = JSON.parse(after.stdout) as { summary: { skillsSuppressed?: number } };
    expect(afterReport.summary.skillsSuppressed).toBeGreaterThanOrEqual(expected);
  });

  it("AC-MG.4 idempotent: second migrate writes byte-identical file", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, readFileSync(petstore, "utf8"), "utf8");
    const findings = await analyzeSpec(dir, spec);
    const first = findings[0]!;
    const ignoreFile = join(dir, ".redocly.lint-ignore.yaml");
    writeFileSync(
      ignoreFile,
      ["openapi.yaml:", "  rule-x:", `    - '${first.location.replace(/^\//, "#/")}'`, ""].join("\n"),
      "utf8",
    );
    const one = await runCapture(
      ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml"],
      { cwd: dir },
    );
    expect(one.code).toBe(0);
    const dest = join(dir, ".ankaa", "skills", "migrated", "redocly.yaml");
    const bytes = readFileSync(dest);
    const two = await runCapture(
      ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml"],
      { cwd: dir },
    );
    expect(two.code).toBe(0);
    expect(readFileSync(dest).equals(bytes)).toBe(true);
  });

  it("AC-MG.6 vacuum: bracket JSONPath converts and matches; recursive is unmatched", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, readFileSync(petstore, "utf8"), "utf8");
    const findings = await analyzeSpec(dir, spec);
    const target = findings[0]!;
    const jsonPath =
      "$" +
      target.location
        .split("/")
        .slice(1)
        .map((segment) => `['${segment.replace(/~1/g, "/").replace(/~0/g, "~")}']`)
        .join("");
    const ignoreFile = join(dir, "vacuum-ignore.yaml");
    writeFileSync(
      ignoreFile,
      ["rule-a:", `  - ${jsonPath}`, "rule-b:", "  - $..paths", ""].join("\n"),
      "utf8",
    );
    const migrated = await runCapture(
      ["migrate", "--vacuum-ignore", "vacuum-ignore.yaml", "--spec", "openapi.yaml"],
      { cwd: dir },
    );
    expect(migrated.code).toBe(0);
    expect(migrated.stdout).toContain("unmatched: 1");
    const dest = join(dir, ".ankaa", "skills", "migrated", "vacuum.yaml");
    expect(readFileSync(dest, "utf8")).toContain(target.fingerprint);
  });

  it("AC-MG.5/7 dry-run writes nothing; skills list shows migrated", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, readFileSync(petstore, "utf8"), "utf8");
    const findings = await analyzeSpec(dir, spec);
    const target = findings[0]!;
    const ignoreFile = join(dir, ".redocly.lint-ignore.yaml");
    writeFileSync(
      ignoreFile,
      ["openapi.yaml:", "  rule-x:", `    - '${target.location.replace(/^\//, "#/")}'`, ""].join("\n"),
      "utf8",
    );
    const dry = await runCapture(
      ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml", "--dry-run"],
      { cwd: dir },
    );
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("dry-run: nothing written");
    expect(existsSync(join(dir, ".ankaa"))).toBe(false);

    await runCapture(
      ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml"],
      { cwd: dir },
    );
    const expectedMigrated = findings.filter((f) => f.location === target.location).length;
    const listed = await runCapture(["skills", "list"], { cwd: dir });
    expect(listed.code).toBe(0);
    expect(listed.stdout).toContain(`migrated: ${expectedMigrated}`);
    expect(listed.stdout).toContain("migrated from redocly ignore");
  });

  it("AC-MG.8 usage, license gate and spectral follow-ups exit 2", async () => {
    const dir = tempDir();
    const noOrigin = await runCapture(["migrate", "--spec", "openapi.yaml"], { cwd: dir });
    expect(noOrigin.code).toBe(2);
    expect(noOrigin.stderr).toContain("--redocly-ignore");

    const spectral = await runCapture(["migrate", "--spectral-rules", ".spectral.yaml", "--spec", "openapi.yaml"], { cwd: dir });
    expect(spectral.code).toBe(2);
    expect(spectral.stderr).toContain("follow-up");

    const missing = await runCapture(
      ["migrate", "--redocly-ignore", "nope.yaml", "--spec", "nope.yaml"],
      { cwd: dir },
    );
    expect(missing.code).toBe(2);

    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, readFileSync(petstore, "utf8"), "utf8");
    const ignoreFile = join(dir, ".redocly.lint-ignore.yaml");
    writeFileSync(ignoreFile, "openapi.yaml:\n  r:\n    - '#/info'\n", "utf8");

    const previous = process.env.ANKAA_LICENSE_KEY;
    delete process.env.ANKAA_LICENSE_KEY;
    try {
      const noLicense = await runCapture(
        ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml"],
        { cwd: dir },
      );
      expect(noLicense.code).toBe(2);
      expect(noLicense.stderr).toContain("missing license");
    } finally {
      if (previous !== undefined) {
        process.env.ANKAA_LICENSE_KEY = previous;
      }
    }
  });

  it("AC-MG.9 does not call fetch during migrate (INV-1)", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, readFileSync(petstore, "utf8"), "utf8");
    const findings = await analyzeSpec(dir, spec);
    const ignoreFile = join(dir, ".redocly.lint-ignore.yaml");
    writeFileSync(
      ignoreFile,
      ["openapi.yaml:", "  rule-x:", `    - '${findings[0]!.location.replace(/^\//, "#/")}'`, ""].join("\n"),
      "utf8",
    );
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network is forbidden in migrate");
    }) as typeof fetch;
    try {
      const result = await runCapture(
        ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml"],
        { cwd: dir },
      );
      expect(result.code).toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("AC-MG.9 INV-7: migrate writes only the migrated file", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, readFileSync(petstore, "utf8"), "utf8");
    const findings = await analyzeSpec(dir, spec);
    const ignoreFile = join(dir, ".redocly.lint-ignore.yaml");
    writeFileSync(
      ignoreFile,
      ["openapi.yaml:", "  rule-x:", `    - '${findings[0]!.location.replace(/^\//, "#/")}'`, ""].join("\n"),
      "utf8",
    );
    const migrated = await runCapture(
      ["migrate", "--redocly-ignore", ".redocly.lint-ignore.yaml", "--spec", "openapi.yaml"],
      { cwd: dir },
    );
    expect(migrated.code).toBe(0);
    const files = readdirSync(dir, { recursive: false }).sort();
    expect(files).toEqual([".ankaa", ".redocly.lint-ignore.yaml", "openapi.yaml"]);
    expect(readdirSync(join(dir, ".ankaa", "skills", "migrated")).sort()).toEqual(["redocly.yaml"]);
  });
});
