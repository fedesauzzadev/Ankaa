import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-cifmt-"));
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

describe("analyze CI formats e2e (f17-ci-reporters, AC-CI.2/3/4)", () => {
  it("AC-CI.2 accepts junit/checkstyle/codequality with the same exit codes", async () => {
    for (const format of ["junit", "checkstyle", "codequality"]) {
      const never = await runCapture([
        "analyze",
        petstore,
        "--format",
        format,
        "--fail-on",
        "never",
        "--no-color",
      ]);
      expect(never.code).toBe(0);
      expect(never.stdout.length).toBeGreaterThan(0);
    }

    const gated = await runCapture([
      "analyze",
      petstore,
      "--format",
      "junit",
      "--fail-on",
      "error",
      "--no-color",
    ]);
    expect([0, 1]).toContain(gated.code);
  }, 30000);

  it("AC-CI.3 double run yields byte-identical output for every CI format", async () => {
    for (const format of ["junit", "checkstyle", "codequality"]) {
      const first = await runCapture(["analyze", petstore, "--format", format, "--no-color"]);
      const second = await runCapture(["analyze", petstore, "--format", format, "--no-color"]);
      expect(first.stdout).toBe(second.stdout);
      expect(first.stdout.length).toBeGreaterThan(0);
      expect(first.stdout).not.toContain("timestamp");
    }
  }, 30000);

  it("AC-CI.2 --output writes the report file and keeps stdout silent", async () => {
    const cwd = tempDir();
    const files: Array<[string, string, (content: string) => void]> = [
      [
        "ankaa-junit.xml",
        "junit",
        (content) => {
          expect(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
          expect(content).toContain("<testsuites name=\"ankaa\"");
        },
      ],
      [
        "ankaa-checkstyle.xml",
        "checkstyle",
        (content) => {
          expect(content.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
          expect(content).toContain("<checkstyle version=\"ankaa/");
        },
      ],
      [
        "ankaa-codequality.json",
        "codequality",
        (content) => {
          const issues = JSON.parse(content) as Array<{ fingerprint: string }>;
          expect(Array.isArray(issues)).toBe(true);
          for (const issue of issues) {
            expect(issue.fingerprint).toMatch(/^[0-9a-f]{64}$/);
          }
        },
      ],
    ];
    for (const [file, format, check] of files) {
      const out = join(cwd, file);
      const { code, stdout } = await runCapture(
        ["analyze", petstore, "--format", format, "--output", out, "--fail-on", "never"],
        { cwd },
      );
      expect(code).toBe(0);
      expect(stdout).toBe("");
      expect(existsSync(out)).toBe(true);
      check(readFileSync(out, "utf8"));
    }
  }, 30000);

  it("AC-CI.4 recipes exist in examples/ci and reference the CLI", async () => {
    for (const recipe of ["gitlab-ci.yml", "azure-pipelines.yml", "Jenkinsfile"]) {
      const path = join(repoRoot, "examples", "ci", recipe);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf8");
      expect(content).toContain("ankaa");
    }
  });

  it("M17.8a checkstyle emits real lines for YAML specs with positions", async () => {
    const { stdout } = await runCapture([
      "analyze",
      petstore,
      "--format",
      "checkstyle",
      "--fail-on",
      "never",
      "--no-color",
    ]);
    const lines = [...stdout.matchAll(/line="(\d+)" column="(\d+)"/g)].map(
      (m) => Number(m[1]),
    );
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.some((line) => line > 1)).toBe(true);
    expect(stdout).not.toContain("[at /paths");
  }, 20000);
});
