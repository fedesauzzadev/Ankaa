import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const fixtures = join(repoRoot, "fixtures");
const petstore = join(fixtures, "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-formats-"));
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

describe("analyze output formats e2e (f5-reporters)", () => {
  it("AC-CLI.1 accepts sarif/markdown/annotations and lists all 5 on invalid", async () => {
    for (const format of ["sarif", "markdown", "annotations"]) {
      const { code, stdout } = await runCapture([
        "analyze",
        petstore,
        "--format",
        format,
        "--no-color",
      ]);
      expect([0, 1]).toContain(code);
      expect(stdout.length).toBeGreaterThan(0);
    }

    const bad = await runCapture(["analyze", petstore, "--format", "yaml", "--no-color"]);
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("invalid --format");
    expect(bad.stderr).toContain("expected console | json | sarif | markdown | annotations");
  });

  it("AC-CLI.2 sarif to --output writes the file and keeps stdout silent", async () => {
    const cwd = tempDir();
    const outFile = join(cwd, "out.sarif");
    const { code, stdout } = await runCapture(
      ["analyze", petstore, "--format", "sarif", "--output", outFile, "--no-color"],
      { cwd },
    );
    expect([0, 1]).toContain(code);
    expect(stdout).toBe("");
    expect(existsSync(outFile)).toBe(true);
    const sarif = JSON.parse(readFileSync(outFile, "utf8")) as {
      version: string;
      runs: unknown[];
    };
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
  });

  it("AC-CLI.3 rules commands keep console | json only", async () => {
    const { code, stderr } = await runCapture(["rules", "list", "--format", "sarif"]);
    expect(code).toBe(2);
    expect(stderr).toContain("invalid --format");
    expect(stderr).toContain("(expected console | json)");
  });

  it("AC-CLI.4 help documents the 5 formats", async () => {
    const { code, stdout } = await runCapture(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("console     human-readable report");
    expect(stdout).toContain("json        canonical JSON with reportHash");
    expect(stdout).toContain("sarif       SARIF 2.1.0 (code scanning)");
    expect(stdout).toContain("markdown    Markdown summary (job summaries)");
    expect(stdout).toContain("annotations GitHub workflow commands");
  });

  it("AC-INV.2 double run yields byte-identical sarif and markdown", async () => {
    for (const format of ["sarif", "markdown"]) {
      const first = await runCapture(["analyze", petstore, "--format", format, "--no-color"]);
      const second = await runCapture(["analyze", petstore, "--format", format, "--no-color"]);
      expect(first.code).toBe(second.code);
      expect(first.stdout).toBe(second.stdout);
      expect(first.stdout.length).toBeGreaterThan(0);
    }
  });

  it("annotations stdout uses workflow commands on the petstore fixture", async () => {
    const { code, stdout } = await runCapture([
      "analyze",
      petstore,
      "--format",
      "annotations",
      "--no-color",
    ]);
    expect([0, 1]).toContain(code);
    expect(stdout).toMatch(/^::(error|warning|notice) /m);
    expect(stdout).not.toContain("# ApiGovScan report");
    expect(stdout).not.toContain("reportHash");
  });

  it("gate semantics unchanged for new formats (--fail-on never exits 0)", async () => {
    const never = await runCapture([
      "analyze",
      petstore,
      "--format",
      "markdown",
      "--fail-on",
      "never",
      "--no-color",
    ]);
    expect(never.code).toBe(0);

    const gate = await runCapture([
      "analyze",
      petstore,
      "--format",
      "sarif",
      "--fail-on",
      "error",
      "--no-color",
    ]);
    expect([0, 1]).toContain(gate.code);
  });

  it("markdown stdout is a job-summary ready document", async () => {
    const { stdout } = await runCapture([
      "analyze",
      petstore,
      "--format",
      "markdown",
      "--no-color",
    ]);
    expect(stdout.startsWith("# ApiGovScan report")).toBe(true);
    expect(stdout).toContain("reportHash");
    expect(stdout).toContain("## Findings");
    expect(stdout.endsWith("\n")).toBe(true);
    expect(stdout.includes(String.fromCharCode(27))).toBe(false);
  });
});
