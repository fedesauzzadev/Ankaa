import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-exval-"));
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

const SPEC = [
  "openapi: 3.1.0",
  "info:",
  "  title: Examples API",
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
  "                required: [email]",
  "                properties:",
  "                  email: { type: string }",
  "                  age: { type: integer }",
  "                example:",
  "                  email: 42",
  "  /orders:",
  "    get:",
  "      summary: List orders",
  "      description: Returns orders.",
  "      responses:",
  '        "200":',
  "          description: ok",
  "          content:",
  "            application/json:",
  "              schema:",
  "                $ref: '#/components/schemas/Remote'",
  "                example:",
  "                  id: o-1",
  "",
].join("\n");

describe("ankaa validate-examples (f13, AC-MV.5)", () => {
  it("reports counts, EXVAL findings and exit codes by fail-on", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC, "utf8");

    const def = await runCapture(["validate-examples", spec, "--no-color"], { cwd: dir });
    expect(def.code).toBe(0);
    expect(def.stdout).toContain("examples: 2 checked");
    expect(def.stdout).toContain("1 invalid · 1 skipped");
    expect(def.stdout).toContain("EXVAL-001");
    expect(def.stdout).toContain("EXVAL-002");
    expect(def.stdout).toContain("unresolvable $ref");

    const strict = await runCapture(
      ["validate-examples", spec, "--fail-on", "warning", "--no-color"],
      { cwd: dir },
    );
    expect(strict.code).toBe(1);
  });

  it("json output is deterministic (reportHash) and --output writes the file", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC, "utf8");
    const args = ["validate-examples", spec, "--format", "json", "--fail-on", "never", "--no-color"];
    const first = await runCapture(args, { cwd: dir });
    const second = await runCapture(args, { cwd: dir });
    expect(first.code).toBe(0);
    const a = JSON.parse(first.stdout) as { reportHash: string; packs: Array<{ id: string }> };
    const b = JSON.parse(second.stdout) as { reportHash: string };
    expect(a.reportHash).toBe(b.reportHash);
    expect(a.packs[0]!.id).toBe("examples");

    const out = join(dir, "exval.json");
    const written = await runCapture(
      ["validate-examples", spec, "--format", "json", "--output", out, "--fail-on", "never"],
      { cwd: dir },
    );
    expect(written.code).toBe(0);
    expect(existsSync(out)).toBe(true);
    expect((JSON.parse(readFileSync(out, "utf8")) as { findings: unknown[] }).findings.length).toBe(2);
  });

  it("gating and usage errors", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(spec, SPEC, "utf8");

    const previous = process.env.ANKAA_LICENSE_KEY;
    delete process.env.ANKAA_LICENSE_KEY;
    try {
      const noLicense = await runCapture(["validate-examples", spec], { cwd: dir });
      expect(noLicense.code).toBe(2);
      expect(noLicense.stderr).toContain("missing license");
    } finally {
      if (previous !== undefined) {
        process.env.ANKAA_LICENSE_KEY = previous;
      }
    }

    const missing = await runCapture(["validate-examples", "nope.yaml"], { cwd: dir });
    expect(missing.code).toBe(2);

    const badFormat = await runCapture(["validate-examples", spec, "--format", "sarif"], { cwd: dir });
    expect(badFormat.code).toBe(2);
  });

  it("clean spec exits 0 with zero findings", async () => {
    const dir = tempDir();
    const spec = join(dir, "openapi.yaml");
    writeFileSync(
      spec,
      [
        "openapi: 3.1.0",
        "info:",
        "  title: Clean",
        "  version: 1.0.0",
        "paths:",
        "  /ping:",
        "    get:",
        "      summary: Ping",
        "      description: Ping endpoint.",
        "      responses:",
        '        "200":',
        "          description: ok",
        "          content:",
        "            application/json:",
        "              schema:",
        "                type: object",
        "                properties:",
        "                  status: { type: string }",
        "                example:",
        "                  status: up",
        "",
      ].join("\n"),
      "utf8",
    );
    const result = await runCapture(
      ["validate-examples", spec, "--fail-on", "warning", "--format", "json", "--no-color"],
      { cwd: dir },
    );
    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as { findings: unknown[]; summary: { total: number } };
    expect(parsed.findings).toEqual([]);
    expect(parsed.summary.total).toBe(0);
  });
});
