import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { queueLineReader, runGuided, buildCiWorkflow } from "../src/guided.js";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-guided-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

interface Capture {
  code: number;
  stdout: string;
  stderr: string;
}

async function guided(cwd: string, lines: readonly string[]): Promise<Capture> {
  let stdout = "";
  let stderr = "";
  const code = await runGuided({
    stdout: (t) => {
      stdout += t;
    },
    stderr: (t) => {
      stderr += t;
    },
    env: { APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY },
    cwd,
    readLine: queueLineReader(lines),
  });
  return { code, stdout, stderr };
}

async function cliAnalyzeHash(cwd: string, path: string): Promise<string> {
  let stdout = "";
  const code = await run(["node", "cli", "analyze", path, "--format", "json"], {
    stdout: (t) => {
      stdout += t;
    },
    stderr: () => {},
    env: { APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY },
    cwd,
    isTTY: false,
  });
  expect([0, 1]).toContain(code);
  return (JSON.parse(stdout) as { reportHash: string }).reportHash;
}

describe("guided assistant (f15 M15.5, AC-15.1/15.2)", () => {
  it("shows the action catalog and exits cleanly", async () => {
    const cwd = tempDir();
    const result = await guided(cwd, ["3"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Analyze API specifications");
    expect(result.stdout).toContain("Prepare CI configuration");
    expect(result.stdout).toContain("Exit");
    expect(result.stdout).toContain("Bye.");
  });

  it("analyzes after confirmation with the same reportHash as the CLI (AC-15.2)", async () => {
    const cwd = tempDir();
    copyFileSync(petstore, join(cwd, "openapi.yaml"));

    const result = await guided(cwd, ["1", "openapi.yaml", "", "y", "3"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('Will analyze "openapi.yaml" with fail-on error');
    expect(result.stdout).toContain("reportHash ");
    const hash = /reportHash ([0-9a-f]{64})/.exec(result.stdout)![1]!;
    expect(hash).toBe(await cliAnalyzeHash(cwd, "openapi.yaml"));
  });

  it("cancel at confirmation runs nothing; invalid paths re-ask (AC-15.2)", async () => {
    const cwd = tempDir();
    copyFileSync(petstore, join(cwd, "openapi.yaml"));
    const result = await guided(cwd, ["1", "missing.yaml", "openapi.yaml", "never", "n", "3"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("input not found: missing.yaml");
    expect(result.stdout).toContain("Cancelled — nothing was run.");
    expect(result.stdout).not.toContain("reportHash");
  });

  it("empty path cancels the flow without running anything", async () => {
    const cwd = tempDir();
    const result = await guided(cwd, ["1", "", "3"]);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("Cancelled — nothing was run.");
  });

  it("analyze failures return the honest error with exit 2", async () => {
    const cwd = tempDir();
    writeFileSync(join(cwd, "broken.yaml"), "openapi: [not: valid\n", "utf8");
    const result = await guided(cwd, ["1", "broken.yaml", "", "y"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("failed to parse");
  });
});

describe("guided CI preparation (f15 M15.5, AC-15.10)", () => {
  it("previews the workflow and writes only after confirmation", async () => {
    const cwd = tempDir();
    copyFileSync(petstore, join(cwd, "specs.yaml"));

    const cancelled = await guided(cwd, [
      "2",
      "analyze",
      "specs.yaml",
      "error",
      ".github/workflows/apigovscan.yml",
      "n",
      "3",
    ]);
    expect(cancelled.code).toBe(0);
    expect(cancelled.stdout).toContain("--- preview of");
    expect(cancelled.stdout).toContain("Cancelled — nothing was written.");
    expect(existsSync(join(cwd, ".github", "workflows", "apigovscan.yml"))).toBe(false);

    const written = await guided(cwd, [
      "2",
      "review",
      "main",
      "specs.yaml",
      "error",
      ".github/workflows/apigovscan.yml",
      "y",
      "3",
    ]);
    expect(written.code).toBe(0);
    expect(written.stdout).toContain("written .github/workflows/apigovscan.yml");
    const content = readFileSync(join(cwd, ".github", "workflows", "apigovscan.yml"), "utf8");
    expect(content).toContain("path: specs.yaml");
    expect(content).toContain("fail-on: error");
    expect(content).toContain("review-ref: main");
    expect(content).toContain("ApiGovScan never changes branch protection");

    const exists = await guided(cwd, [
      "2",
      "analyze",
      "specs.yaml",
      "error",
      ".github/workflows/apigovscan.yml",
      "y",
      "n",
      "3",
    ]);
    expect(exists.code).toBe(0);
    expect(exists.stdout).toContain("destination already exists");
    expect(exists.stdout).toContain("Cancelled — existing file kept.");
  });

  it("buildCiWorkflow renders both modes deterministically", () => {
    const analyze = buildCiWorkflow({ path: "openapi.yaml", failOn: "error", mode: "analyze" });
    expect(analyze).not.toContain("review-ref");
    expect(analyze).toContain("uses: owner/repo@v1");
    const review = buildCiWorkflow({
      path: "openapi.yaml",
      failOn: "never",
      mode: "review",
      reviewRef: "v1.2.0",
    });
    expect(review).toContain("review-ref: v1.2.0");
    expect(buildCiWorkflow({ path: "openapi.yaml", failOn: "error", mode: "analyze" })).toBe(
      analyze,
    );
  });
});

describe("guided command (f15 M15.5)", () => {
  it("guided --help exits 0 and documents the command", async () => {
    let stdout = "";
    const code = await run(["node", "cli", "guided", "--help"], {
      stdout: (t) => {
        stdout += t;
      },
      stderr: () => {},
      isTTY: false,
    });
    expect(code).toBe(0);
    expect(stdout).toContain("usage: apigovscan guided");
  });

  it("rejects unexpected arguments with exit 2", async () => {
    let stderr = "";
    const code = await run(["node", "cli", "guided", "extra"], {
      stdout: () => {},
      stderr: (t) => {
        stderr += t;
      },
      isTTY: false,
    });
    expect(code).toBe(2);
    expect(stderr).toContain("unexpected argument");
  });
});
