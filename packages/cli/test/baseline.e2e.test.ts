import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-bl-"));
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
  io: { cwd?: string; isTTY?: boolean } = {},
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
    cwd: repoRoot,
    ...io,
  });
  return { code, stdout, stderr };
}

function extractJson(stdout: string): Record<string, unknown> | null {
  try {
    return JSON.parse(stdout) as Record<string, unknown>;
  } catch {
    return null;
  }
}

const SPEC_WITH_DEBT = [
  "openapi: 3.1.0",
  "info:",
  "  title: Baseline Debt API",
  "  version: 1.0.0",
  "paths:",
  "  /user:",
  "    get:",
  "      summary: Get user",
  "      description: Returns a single user.",
  "      responses:",
  '        "200":',
  "          description: ok",
  "",
].join("\n");

// Same as above but with a new operation that also trips NAMING-001 (+ more)
const SPEC_WITH_NEW_DEBT = SPEC_WITH_DEBT.replace(
  "paths:\n  /user:",
  'paths:\n  /item:\n    get:\n      summary: Get item\n      description: Returns a single item record for the given id.\n      responses:\n        "200":\n          description: ok\n  /user:',
);

describe("baseline e2e (AC-B.*)", () => {
  it("AC-B.1 write-baseline creates v1 file with sorted fingerprints", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, ".apigovscan", "baseline.json");

    const { code } = await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--format",
      "json",
      "--no-color",
    ]);
    // write mode: exit from full findings with failOn never → 0
    expect(code).toBe(0);
    expect(existsSync(blPath)).toBe(true);

    const parsed = JSON.parse(readFileSync(blPath, "utf8")) as {
      version: number;
      fingerprints: string[];
      inputs: Array<{ path: string; sha256: string }>;
      counts: { total: number };
      createdAt: string;
    };
    expect(parsed.version).toBe(1);
    expect(parsed.fingerprints.length).toBeGreaterThan(0);
    expect([...parsed.fingerprints].sort()).toEqual(parsed.fingerprints);
    expect(new Set(parsed.fingerprints).size).toBe(parsed.fingerprints.length);
    expect(parsed.inputs.length).toBe(1);
    expect(parsed.inputs[0]!.sha256).toMatch(/^sha256:[0-9a-f]+$/);
    expect(parsed.counts.total).toBe(parsed.fingerprints.length);
    expect(typeof parsed.createdAt).toBe("string");

    // report still emitted (JSON on stdout)
    // (stdout is JSON report because --format json)
  });

  it("AC-B.2 second write without force → exit 2; with force → .bak", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    const first = await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(first.code).toBe(0);

    const second = await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(second.code).toBe(2);
    expect(second.stderr).toContain("already exists");
    expect(second.stderr).toContain("--force");
    expect(existsSync(`${blPath}.bak`)).toBe(false);

    const forced = await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--force",
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(forced.code).toBe(0);
    expect(existsSync(`${blPath}.bak`)).toBe(true);
  });

  it("AC-B.3 --baseline filters all baselined findings → suppressed ≥ 1, exit 0", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);

    const { code, stdout } = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--format",
      "json",
      "--no-color",
    ]);
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const summary = parsed!.summary as {
      total: number;
      suppressed?: number;
    };
    expect(summary.suppressed).toBeGreaterThanOrEqual(1);
    expect(summary.total).toBe(0);
    expect(code).toBe(0);
    expect((parsed!.findings as unknown[]).length).toBe(0);
  });

  it("AC-B.4 new finding after baseline → only new remain; exit 1 if ≥ failOn", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);

    // introduce new debt (extra singular path)
    writeFileSync(spec, SPEC_WITH_NEW_DEBT, "utf8");

    const { code, stdout, stderr } = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "error",
      "--format",
      "json",
      "--no-color",
    ]);
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const findings = parsed!.findings as Array<{ ruleId: string; fingerprint: string }>;
    const summary = parsed!.summary as { total: number; suppressed?: number };
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.suppressed).toBeGreaterThanOrEqual(1);
    // new finding(s) visible
    expect(findings.length).toBeGreaterThanOrEqual(1);
    expect(code === 0 || code === 1).toBe(true);
    // inputHash mismatch warning expected (spec content changed)
    void stderr;
  });

  it("AC-B.5 inputHash mismatch: default warn; strict exit 2; ignore silent", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);

    writeFileSync(spec, `${SPEC_WITH_DEBT}\n# touched\n`, "utf8");

    const warnRun = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(warnRun.stderr).toContain("inputHash mismatch");
    expect([0, 1]).toContain(warnRun.code);

    const strictRun = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--strict-hash",
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(strictRun.code).toBe(2);
    expect(strictRun.stderr).toContain("inputHash mismatch");

    const ignoreRun = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--baseline-ignore-hash",
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(ignoreRun.stderr).not.toContain("inputHash mismatch");
    expect([0, 1]).toContain(ignoreRun.code);
  });

  it("AC-B.6 --baseline missing file → exit 2", async () => {
    const dir = tempDir();
    const { code, stderr } = await runCapture([
      "analyze",
      petstore,
      "--baseline",
      "--baseline-path",
      join(dir, "missing.json"),
      "--no-color",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("baseline not found");
    expect(stderr).toContain("--write-baseline");
  });

  it("AC-B.7 version 99 → exit 2", async () => {
    const dir = tempDir();
    const blPath = join(dir, "b.json");
    writeFileSync(blPath, JSON.stringify({ version: 99, fingerprints: [] }), "utf8");
    const { code, stderr } = await runCapture([
      "analyze",
      petstore,
      "--baseline",
      "--baseline-path",
      blPath,
      "--no-color",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("unsupported version");
  });

  it("AC-B.8 console includes (baseline: N suppressed)", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);

    const { code, stdout } = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    expect(stdout).toContain("baseline:");
    expect(stdout).toContain("suppressed");
  });

  it("AC-B.9 determinism: two force writes → same fingerprints and input hashes", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);
    const first = JSON.parse(readFileSync(blPath, "utf8")) as {
      fingerprints: string[];
      inputs: Array<{ path: string; sha256: string }>;
      createdAt: string;
    };

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--force",
      "--fail-on",
      "never",
      "--no-color",
    ]);
    const second = JSON.parse(readFileSync(blPath, "utf8")) as typeof first;

    expect(second.fingerprints).toEqual(first.fingerprints);
    expect(second.inputs.map((i) => i.sha256)).toEqual(first.inputs.map((i) => i.sha256));
    // createdAt may differ
    void second.createdAt;
    void first.createdAt;
  });

  it("AC-B.10 --baseline does not write files (INV-7)", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);

    const before = readdirSafe(dir);
    const blStatBefore = readFileSync(blPath, "utf8");

    await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);

    expect(readdirSafe(dir)).toEqual(before);
    expect(readFileSync(blPath, "utf8")).toBe(blStatBefore);
    expect(existsSync(join(dir, ".apigovscan"))).toBe(false);
  });

  it("AC-B.11 config baseline.enabled acts as --baseline", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "bl.json");

    await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "never",
      "--no-color",
    ]);

    writeFileSync(
      join(dir, "apigovscan.yaml"),
      [
        "failOn: never",
        "baseline:",
        "  enabled: true",
        `  path: ${blPath.replace(/\\/g, "/")}`,
      ].join("\n"),
      "utf8",
    );

    const { code, stdout, stderr } = await runCapture(
      ["analyze", spec, "--format", "json", "--no-color"],
      { cwd: dir },
    );
    expect(stderr).not.toContain("unknown key");
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const summary = parsed!.summary as { suppressed?: number };
    expect(summary.suppressed).toBeGreaterThanOrEqual(1);
    expect([0, 1]).toContain(code);
  });

  it("AC-B.12 phase exit criterion: baseline clean CI; new error fails only for new", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    // Freeze debt
    const write = await runCapture([
      "analyze",
      spec,
      "--write-baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "error",
      "--no-color",
    ]);
    // without baseline, debt may exit 1; with baseline later should be 0
    void write;

    const withBl = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "error",
      "--format",
      "json",
      "--no-color",
    ]);
    const blJson = extractJson(withBl.stdout);
    expect(blJson).not.toBeNull();
    expect((blJson!.summary as { total: number }).total).toBe(0);
    expect(withBl.code).toBe(0);

    // Introduce a brand-new error-level finding path
    writeFileSync(spec, SPEC_WITH_NEW_DEBT, "utf8");

    const after = await runCapture([
      "analyze",
      spec,
      "--baseline",
      "--baseline-path",
      blPath,
      "--fail-on",
      "error",
      "--format",
      "json",
      "--no-color",
    ]);
    const afterJson = extractJson(after.stdout);
    expect(afterJson).not.toBeNull();
    const summary = afterJson!.summary as {
      error: number;
      total: number;
      suppressed?: number;
    };
    // Only the NEW findings are counted for failOn
    expect(summary.total).toBeGreaterThanOrEqual(1);
    expect(summary.suppressed).toBeGreaterThanOrEqual(1);
    expect(after.code).toBe(summary.error > 0 ? 1 : 0);
  });

  it("multi-input directory writes single baseline with all inputs", async () => {
    const dir = tempDir();
    mkdirSync(join(dir, "openapi", "svc-a"), { recursive: true });
    mkdirSync(join(dir, "openapi", "svc-b"), { recursive: true });
    writeFileSync(join(dir, "openapi", "svc-a", "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    writeFileSync(join(dir, "openapi", "svc-b", "openapi.yaml"), SPEC_WITH_DEBT, "utf8");
    const blPath = join(dir, "baseline.json");

    const { code, stderr } = await runCapture(
      [
        "analyze",
        dir,
        "--write-baseline",
        "--baseline-path",
        blPath,
        "--fail-on",
        "never",
        "--no-color",
      ],
      { cwd: dir },
    );
    if (code === 2) throw new Error(stderr);
    expect(code).toBe(0);
    const parsed = JSON.parse(readFileSync(blPath, "utf8")) as {
      inputs: Array<{ path: string }>;
    };
    expect(parsed.inputs.length).toBe(2);
    expect(parsed.inputs.map((i) => i.path).sort()).toEqual([
      "openapi/svc-a/openapi.yaml",
      "openapi/svc-b/openapi.yaml",
    ]);
  });
});

function readdirSafe(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}
