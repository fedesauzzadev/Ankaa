import {
  mkdtempSync,
  rmSync,
  writeFileSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import type { Finding } from "@apigovscan/core";
import {
  BASELINE_SCHEMA_VERSION,
  buildBaseline,
  checkInputHashes,
  filterFindings,
  fingerprintSet,
  loadBaselineFile,
  resolveBaselinePath,
  serializeBaseline,
  writeBaselineFile,
} from "../src/baseline.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-baseline-"));
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

function finding(partial: Partial<Finding> = {}): Finding {
  return {
    fingerprint: "f".repeat(64),
    ruleId: "NAMING-001",
    severity: "error",
    category: "naming",
    message: "plural",
    location: "/paths/~1user/get",
    packId: "elite",
    packVersion: "2026.09.1",
    ...partial,
  };
}

describe("buildBaseline / serialize", () => {
  it("fingerprints are sorted unique (AC-B.1, AC-B.9)", () => {
    const baseline = buildBaseline({
      findings: [
        finding({ fingerprint: "b".repeat(64) }),
        finding({ fingerprint: "a".repeat(64) }),
        finding({ fingerprint: "b".repeat(64) }),
      ],
      inputs: [{ path: "a.yaml", sha256: "sha256:1" }],
      packs: [{ id: "elite", version: "1" }],
      toolVersion: "0.0.0-dev",
      engineVersion: "0.0.0-dev",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(baseline.version).toBe(BASELINE_SCHEMA_VERSION);
    expect(baseline.fingerprints).toEqual([
      "a".repeat(64),
      "b".repeat(64),
    ]);
    expect(baseline.counts).toEqual({
      error: 3,
      warning: 0,
      info: 0,
      total: 3,
    });
  });

  it("serialize ends with newline and stable keys", () => {
    const baseline = buildBaseline({
      findings: [finding()],
      inputs: [{ path: "a.yaml", sha256: "sha256:1" }],
      packs: [{ id: "elite", version: "1" }],
      toolVersion: "0.0.0-dev",
      engineVersion: "0.0.0-dev",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const text = serializeBaseline(baseline);
    expect(text.endsWith("\n")).toBe(true);
    const keys = Object.keys(JSON.parse(text) as object);
    expect(keys).toEqual([
      "version",
      "createdAt",
      "tool",
      "engineVersion",
      "packs",
      "inputs",
      "fingerprints",
      "counts",
    ]);
  });
});

describe("writeBaselineFile / loadBaselineFile", () => {
  it("writes then loads roundtrip", () => {
    const dir = tempDir();
    const path = join(dir, ".apigovscan", "baseline.json");
    const baseline = buildBaseline({
      findings: [finding()],
      inputs: [{ path: "a.yaml", sha256: "sha256:1" }],
      packs: [{ id: "elite", version: "1" }],
      toolVersion: "0.0.0-dev",
      engineVersion: "0.0.0-dev",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(writeBaselineFile(path, baseline, false).ok).toBe(true);
    const loaded = loadBaselineFile(path);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.baseline.fingerprints).toEqual(baseline.fingerprints);
    expect(loaded.baseline.inputs).toEqual(baseline.inputs);
  });

  it("refuses overwrite without force; force creates .bak", () => {
    const dir = tempDir();
    const path = join(dir, "baseline.json");
    const baseline = buildBaseline({
      findings: [finding()],
      inputs: [],
      packs: [],
      toolVersion: "0.0.0-dev",
      engineVersion: "0.0.0-dev",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(writeBaselineFile(path, baseline, false).ok).toBe(true);
    const again = writeBaselineFile(path, baseline, false);
    expect(again.ok).toBe(false);
    if (again.ok) return;
    expect(again.error).toContain("already exists");
    expect(again.error).toContain("--force");

    expect(writeBaselineFile(path, baseline, true).ok).toBe(true);
    expect(existsSync(`${path}.bak`)).toBe(true);
  });

  it("missing file → clear error (AC-B.6)", () => {
    const dir = tempDir();
    const result = loadBaselineFile(join(dir, "nope.json"));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("baseline not found");
    expect(result.error).toContain("--write-baseline");
  });

  it("version 99 rejected (AC-B.7)", () => {
    const dir = tempDir();
    const path = join(dir, "b.json");
    writeFileSync(path, JSON.stringify({ version: 99, fingerprints: [] }), "utf8");
    const result = loadBaselineFile(path);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unsupported version 99");
  });
});

describe("filterFindings / fingerprintSet", () => {
  it("drops baselined fingerprints only", () => {
    const keep = finding({ fingerprint: "n".repeat(64) });
    const drop = finding({ fingerprint: "o".repeat(64) });
    const set = new Set(["o".repeat(64)]);
    const { visible, suppressed } = filterFindings([keep, drop], set);
    expect(visible).toHaveLength(1);
    expect(visible[0]!.fingerprint).toBe("n".repeat(64));
    expect(suppressed).toHaveLength(1);
  });
});

describe("checkInputHashes", () => {
  const baseline = buildBaseline({
    findings: [],
    inputs: [
      { path: "a.yaml", sha256: "sha256:old" },
      { path: "gone.yaml", sha256: "sha256:x" },
    ],
    packs: [],
    toolVersion: "0.0.0-dev",
    engineVersion: "0.0.0-dev",
    createdAt: "2026-01-01T00:00:00.000Z",
  });

  it("warn mode: mismatch + unused warnings (AC-B.5)", () => {
    const result = checkInputHashes(
      baseline,
      [{ path: "a.yaml", sha256: "sha256:new" }],
      "warn",
    );
    expect(result.fatal).toBeUndefined();
    expect(result.warnings.some((w) => w.includes("inputHash mismatch"))).toBe(
      true,
    );
    expect(result.warnings.some((w) => w.includes("entry unused"))).toBe(true);
    expect(result.warnings.some((w) => w.includes("inputs differ"))).toBe(true);
  });

  it("strict mode: mismatch is fatal", () => {
    const result = checkInputHashes(
      baseline,
      [{ path: "a.yaml", sha256: "sha256:new" }],
      "strict",
    );
    expect(result.fatal).toContain("inputHash mismatch");
  });

  it("ignore mode: no mismatch warning", () => {
    const result = checkInputHashes(
      baseline,
      [
        { path: "a.yaml", sha256: "sha256:new" },
        // gone.yaml still unused → still warned (path set differs)
      ],
      "ignore",
    );
    expect(result.fatal).toBeUndefined();
    expect(
      result.warnings.some((w) => w.includes("inputHash mismatch")),
    ).toBe(false);
  });
});

describe("resolveBaselinePath", () => {
  it("flag wins over config and resolves vs cwd", () => {
    const path = resolveBaselinePath(
      "custom.json",
      "cfg.json",
      "/cfgdir",
      "/cwd",
    );
    expect(path).toBe(resolve("/cwd", "custom.json"));
  });

  it("config path resolves relative to config dir", () => {
    const path = resolveBaselinePath(
      undefined,
      "bl.json",
      "/cfgdir",
      "/cwd",
    );
    expect(path).toBe(resolve("/cfgdir", "bl.json"));
  });

  it("default path when nothing set", () => {
    const path = resolveBaselinePath(undefined, undefined, undefined, "/cwd");
    expect(path).toBe(resolve("/cwd", ".apigovscan", "baseline.json"));
  });
});

describe("fingerprintSet", () => {
  it("builds set from baseline", () => {
    const baseline = buildBaseline({
      findings: [finding({ fingerprint: "z".repeat(64) })],
      inputs: [],
      packs: [],
      toolVersion: "v",
      engineVersion: "e",
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    expect(fingerprintSet(baseline).has("z".repeat(64))).toBe(true);
  });
});
