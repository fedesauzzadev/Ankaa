import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-compliance-"));
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

function piiSpec(email: string): string {
  return [
    "openapi: 3.1.0",
    "info:",
    "  title: PII API",
    "  version: 1.0.0",
    "paths:",
    "  /users:",
    "    get:",
    "      summary: List users",
    "      description: Returns users.",
    "      responses:",
    '        "200":',
    "          description: ok",
    "          content:",
    "            application/json:",
    "              schema:",
    "                type: object",
    "                properties:",
    "                  email:",
    "                    type: string",
    "                example:",
    `                  email: ${email}`,
    "",
  ].join("\n");
}

describe("PRIV-001 (f17-compliance-pack, AC-CP.1/2)", () => {
  it("fires deterministically on a real-looking email in a schema example", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, piiSpec("jane.doe@acme-corp.com"), "utf8");
    const first = await runCapture(
      ["analyze", spec, "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(first.code);
    const report = JSON.parse(first.stdout) as {
      findings: Array<{ ruleId: string; fingerprint: string }>;
    };
    const priv = report.findings.filter((f) => f.ruleId === "PRIV-001");
    expect(priv).toHaveLength(1);

    const second = await runCapture(
      ["analyze", spec, "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    const again = JSON.parse(second.stdout) as { findings: Array<{ ruleId: string; fingerprint: string }> };
    expect(again.findings.find((f) => f.ruleId === "PRIV-001")!.fingerprint).toBe(priv[0]!.fingerprint);
  });

  it("does not fire on placeholder domains", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, piiSpec("user@example.com"), "utf8");
    const { code, stdout } = await runCapture(
      ["analyze", spec, "--format", "json", "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(code);
    const report = JSON.parse(stdout) as { findings: Array<{ ruleId: string }> };
    expect(report.findings.some((f) => f.ruleId === "PRIV-001")).toBe(false);
  });
});

describe("export --controls (f17-compliance-pack, AC-CP.3..6)", () => {
  async function exportWith(dir: string, extra: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, piiSpec("jane.doe@acme-corp.com"), "utf8");
    const analyzed = await runCapture(
      ["analyze", spec, "--format", "json", "--output", join(dir, "report.json"), "--fail-on", "never", "--no-color"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(analyzed.code);
    return runCapture(["export", join(dir, "report.json"), ...extra], { cwd: dir });
  }

  it("lists every catalog control with pass/fail and fingerprints", async () => {
    const dir = tempDir();
    const result = await exportWith(dir, ["--controls", "owasp-api,gdpr"]);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as {
      controls?: Array<{ framework: string; control: string; status: string; findings: string[] }>;
    };
    expect(parsed.controls).toBeDefined();
    const controls = parsed.controls!;
    expect(controls).toHaveLength(12);
    expect(controls.filter((c) => c.framework === "owasp-api")).toHaveLength(10);
    expect(controls.filter((c) => c.framework === "gdpr")).toHaveLength(2);
    const api3 = controls.find((c) => c.control === "API3:2023")!;
    expect(api3.status).toBe("fail");
    expect(api3.findings.length).toBeGreaterThanOrEqual(1);
    const gdpr25 = controls.find((c) => c.control === "art. 25")!;
    expect(gdpr25.status).toBe("fail");
    expect(controls.find((c) => c.control === "API1:2023")!.status).toBe("pass");
    expect(controls.filter((c) => c.status === "pass").length).toBeGreaterThan(0);

    const again = await runCapture([
      "export",
      join(dir, "report.json"),
      "--controls",
      "owasp-api,gdpr",
    ], { cwd: dir });
    expect(again.stdout).toBe(result.stdout);
  });

  it("AC-CP.5 without --controls the output keeps the v1 shape", async () => {
    const dir = tempDir();
    const result = await exportWith(dir, []);
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { controls?: unknown };
    expect(parsed.controls).toBeUndefined();
  });

  it("AC-CP.4 unknown framework is exit 2 listing the known ones", async () => {
    const dir = tempDir();
    const result = await exportWith(dir, ["--controls", "soc2"]);
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("soc2");
    expect(result.stderr).toContain("owasp-api");
    expect(result.stderr).toContain("gdpr");
  });

  it("writes --out file with the controls section", async () => {
    const dir = tempDir();
    const result = await exportWith(dir, ["--controls", "gdpr", "--out", join(dir, "integration.json")]);
    expect(result.code).toBe(0);
    const written = JSON.parse(readFileSync(join(dir, "integration.json"), "utf8")) as {
      controls?: unknown[];
    };
    expect(written.controls).toHaveLength(2);
  });
});
