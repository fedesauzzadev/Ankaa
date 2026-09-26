import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const fixtures = join(repoRoot, "fixtures");
const petstore = join(fixtures, "petstore-mini.yaml");
const malformed = join(fixtures, "malformed.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-e2e-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // temp cleanup is best-effort
    }
  }
});

async function runCapture(
  argv: string[],
  io: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    isTTY?: boolean;
    stdin?: () => Promise<Uint8Array>;
  } = {},
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

describe("analyze e2e (f1-analyze)", () => {
  it("AC-A.1 happy path on petstore-mini exits 0 or 1 without crashing", async () => {
    const { code, stdout, stderr } = await runCapture([
      "analyze",
      petstore,
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    expect(stdout).toContain("ApiGovScan");
    expect(stdout).toContain("reportHash");
    expect(stderr).not.toContain("error:");
  });

  it("AC-A.2 double run yields identical reportHash (INV-2)", async () => {
    const first = await runCapture([
      "analyze",
      petstore,
      "--format",
      "json",
      "--no-color",
    ]);
    const second = await runCapture([
      "analyze",
      petstore,
      "--format",
      "json",
      "--no-color",
    ]);
    expect(first.code).toBe(second.code);
    const a = extractJson(first.stdout);
    const b = extractJson(second.stdout);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(a!.reportHash).toBe(b!.reportHash);
  });

  it("AC-A.3 does not attempt network calls (INV-1)", async () => {
    const originalFetch = globalThis.fetch;
    let fetchCalled = false;
    globalThis.fetch = ((...args: unknown[]) => {
      fetchCalled = true;
      throw new Error(`NETWORK_CALL_FORBIDDEN: ${String(args[0])}`);
    }) as typeof fetch;
    try {
      const { code } = await runCapture(["analyze", petstore, "--no-color"]);
      expect([0, 1]).toContain(code);
      expect(fetchCalled).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("AC-A.4 --format json produces schema with required keys", async () => {
    const { stdout } = await runCapture([
      "analyze",
      petstore,
      "--format",
      "json",
      "--no-color",
    ]);
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const keys = Object.keys(parsed!).sort();
    for (const required of [
      "findings",
      "input",
      "packs",
      "reportHash",
      "score",
      "summary",
      "tool",
    ]) {
      expect(keys).toContain(required);
    }
    expect(parsed!.tool).toEqual({ name: "apigovscan", version: "0.0.0-dev" });
    expect(Array.isArray(parsed!.findings)).toBe(true);
    expect(Array.isArray(parsed!.packs)).toBe(true);
    expect(Array.isArray(parsed!.input)).toBe(true);
    expect(parsed!.score).toEqual({ value: 74, grade: "C" });
  });

  it("AC-A.5 --fail-on never always exits 0; --fail-on warning can exit 1", async () => {
    const never = await runCapture([
      "analyze",
      petstore,
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(never.code).toBe(0);
    expect(never.stderr).toContain("failOn=never");

    const warning = await runCapture([
      "analyze",
      petstore,
      "--fail-on",
      "warning",
      "--format",
      "json",
      "--no-color",
    ]);
    const parsed = extractJson(warning.stdout);
    expect(parsed).not.toBeNull();
    const summary = parsed!.summary as { error: number; warning: number };
    const expected = summary.error + summary.warning > 0 ? 1 : 0;
    expect(warning.code).toBe(expected);
  });

  it("AC-A.6 malformed spec exits 2 with pointer, no raw stack", async () => {
    const { code, stderr } = await runCapture(["analyze", malformed]);
    expect(code).toBe(2);
    expect(stderr).toContain("failed to parse");
    expect(stderr).not.toContain("at Object.");
    expect(stderr).not.toContain("node:internal");
  });

  it("AC-A.7 --rule with invalid JSON exits 2 without analyzing", async () => {
    const { code, stderr } = await runCapture([
      "analyze",
      petstore,
      "--rule",
      "{not json",
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("--rule is not valid JSON");
  });

  it("AC-A.7 --rule with invalid rule shape exits 2", async () => {
    const { code, stderr } = await runCapture([
      "analyze",
      petstore,
      "--rule",
      JSON.stringify({ id: "bad", when: {} }),
    ]);
    expect(code).toBe(2);
    expect(stderr).toContain("invalid custom rule");
  });

  it("AC-A.8 config rules off removes findings of that rule", async () => {
    const dir = tempDir();
    const badSpec = join(dir, "openapi.yaml");
    writeFileSync(
      badSpec,
      [
        "openapi: 3.1.0",
        "info:",
        "  title: Singular Paths",
        "  version: 1.0.0",
        "paths:",
        "  /user:",
        "    get:",
        "      summary: Get a user by identifier",
        "      description: Returns a single user record for the given id.",
        "      responses:",
        '        "200":',
        "          description: ok",
        "",
      ].join("\n"),
      "utf8",
    );
    writeFileSync(
      join(dir, "apigovscan.yaml"),
      ["failOn: error", "rules:", "  NAMING-001: off"].join("\n"),
      "utf8",
    );

    const baseline = await runCapture([
      "analyze",
      badSpec,
      "--format",
      "json",
      "--no-color",
    ]);
    const withConfig = await runCapture(
      ["analyze", badSpec, "--format", "json", "--no-color"],
      { cwd: dir },
    );

    const baseJson = extractJson(baseline.stdout);
    const configJson = extractJson(withConfig.stdout);
    expect(baseJson).not.toBeNull();
    expect(configJson).not.toBeNull();

    const baseFindings = baseJson!.findings as Array<{ ruleId: string }>;
    const configFindings = configJson!.findings as Array<{ ruleId: string }>;

    expect(baseFindings.some((f) => f.ruleId === "NAMING-001")).toBe(true);
    expect(configFindings.some((f) => f.ruleId === "NAMING-001")).toBe(false);
  });

  it("AC-A.9 directory with 0 specs exits 2 listing patterns", async () => {
    const dir = tempDir();
    const { code, stderr } = await runCapture(["analyze", dir]);
    expect(code).toBe(2);
    expect(stderr).toContain("no OpenAPI specs found");
    expect(stderr).toContain("openapi.{yaml,yml,json}");
    expect(stderr).toContain("**/swagger.{yaml,yml,json}");
  });

  it("AC-A.10 stdin '-' analyzes piped YAML", async () => {
    const bytes = readFileSync(petstore);
    const { code, stdout, stderr } = await runCapture(
      ["analyze", "-", "--format", "json", "--no-color"],
      {
        stdin: async () => bytes,
      },
    );
    if (code === 2) {
      throw new Error(`stdin analyze failed: ${stderr}`);
    }
    expect([0, 1]).toContain(code);
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const input = parsed!.input as Array<{ path: string }>;
    expect(input[0]!.path).toBe("<stdin>");
  });

  it("AC-A.11 --output json writes file and keeps stdout silent", async () => {
    const dir = tempDir();
    const outPath = join(dir, "report.json");
    const { code, stdout } = await runCapture([
      "analyze",
      petstore,
      "--format",
      "json",
      "--output",
      outPath,
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    expect(stdout).toBe("");
    const written = JSON.parse(readFileSync(outPath, "utf8")) as Record<
      string,
      unknown
    >;
    expect(written.reportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("AC-A.11 --output console writes file and prints short summary", async () => {
    const dir = tempDir();
    const outPath = join(dir, "report.txt");
    const { code, stdout } = await runCapture([
      "analyze",
      petstore,
      "--output",
      outPath,
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    expect(stdout).toContain("reportHash");
    expect(stdout).not.toContain("ApiGovScan 0.0.0-dev · packs");
    const file = readFileSync(outPath, "utf8");
    expect(file).toContain("ApiGovScan");
    expect(file).toContain("reportHash");
  });

  it("AC-A.12 --debug prints stage timings without spec bodies", async () => {
    const { code, stderr } = await runCapture([
      "analyze",
      petstore,
      "--debug",
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    expect(stderr).toContain("debug:");
    expect(stderr).toMatch(/debug: parse/);
    expect(stderr).toMatch(/debug: evaluate/);
    expect(stderr).not.toContain('"openapi":');
    expect(stderr).not.toContain("properties:");
    const lines = stderr.split("\n");
    for (const line of lines) {
      if (line.startsWith("debug:")) {
        expect(line.length).toBeLessThan(300);
      }
    }
  });

  it("AC-A.13 multi-spec directory has stable lexicographic input order", async () => {
    const dir = tempDir();
    const nested = join(dir, "openapi");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(dir, "openapi.yaml"), readFileSync(petstore), "utf8");
    writeFileSync(
      join(nested, "openapi.json"),
      readFileSync(join(fixtures, "petstore-mini.json"), "utf8"),
      "utf8",
    );

    const first = await runCapture([
      "analyze",
      dir,
      "--format",
      "json",
      "--no-color",
    ]);
    const second = await runCapture([
      "analyze",
      dir,
      "--format",
      "json",
      "--no-color",
    ]);

    const a = extractJson(first.stdout);
    const b = extractJson(second.stdout);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();

    const paths = (a!.input as Array<{ path: string }>).map((i) => i.path);
    expect(paths).toEqual([...paths].sort());
    expect(paths.length).toBe(2);
    expect(a!.reportHash).toBe(b!.reportHash);
  });

  it("AC-R.7 NO_COLOR disables ANSI even on TTY", async () => {
    const { stdout } = await runCapture(["analyze", petstore], {
      env: { NO_COLOR: "1" },
      isTTY: true,
    });
    expect(stdout.includes(String.fromCharCode(27))).toBe(false);
  });

  it("exit 1 when findings meet fail-on error threshold", async () => {
    const dir = tempDir();
    const badSpec = join(dir, "openapi.yaml");
    writeFileSync(
      badSpec,
      [
        "openapi: 3.1.0",
        "info:",
        "  title: Bad",
        "  version: 1.0.0",
        "paths:",
        "  /user:",
        "    get:",
        "      summary: Get a user by identifier",
        "      description: Returns a single user record for the given id.",
        "      responses:",
        '        "200":',
        "          description: ok",
        "",
      ].join("\n"),
      "utf8",
    );
    const { code } = await runCapture([
      "analyze",
      badSpec,
      "--fail-on",
      "error",
      "--no-color",
    ]);
    expect(code).toBe(1);
  });
});
