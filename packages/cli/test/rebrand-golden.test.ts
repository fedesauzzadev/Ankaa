import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

interface GoldenCase {
  input: string;
  count: number;
  findings: string[];
}

interface Golden {
  schemaVersion: number;
  cases: GoldenCase[];
}

const golden = JSON.parse(
  readFileSync(join(repoRoot, "fixtures", "rebrand", "golden-fingerprints.json"), "utf8"),
) as Golden;

async function analyzeCase(input: string): Promise<string[]> {
  let stdout = "";
  const code = await run(["node", "cli", "analyze", input, "--format", "json"], {
    stdout: (t) => {
      stdout += t;
    },
    stderr: () => {},
    env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY, APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY },
    cwd: repoRoot,
    isTTY: false,
  });
  expect(code, stdout).not.toBe(2);
  const report = JSON.parse(stdout) as { findings: Array<{ ruleId: string; fingerprint: string }> };
  return report.findings.map((f) => `${f.ruleId} ${f.fingerprint}`);
}

describe("rebrand golden fingerprints (f16 AC-16.6)", () => {
  it("golden file covers a broad multi-protocol corpus", () => {
    expect(golden.schemaVersion).toBe(1);
    expect(golden.cases.length).toBeGreaterThanOrEqual(24);
    const total = golden.cases.reduce((sum, c) => sum + c.count, 0);
    expect(total).toBeGreaterThanOrEqual(300);
  });

  for (const testCase of golden.cases) {
    it(`${testCase.input}: findings and fingerprints match the pre-rename golden`, async () => {
      const findings = await analyzeCase(testCase.input);
      expect(findings).toEqual(testCase.findings);
    });
  }
});
