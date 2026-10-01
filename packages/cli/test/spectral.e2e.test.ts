import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-spectral-e2e-"));
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

const RULESET = [
  "extends: [spectral:oas]",
  "rules:",
  "  typed-enum: false",
  "  my-summary-required:",
  "    description: Every operation must have a summary.",
  "    severity: 1",
  "    given: '#OperationObject'",
  "    then:",
  "      - field: summary",
  "        function: truthy",
  "",
].join("\n");

describe("ankaa migrate --spectral-rules (f8-spectral-import, M17.9)", () => {
  it("imports vendored + user rules offline, reports covered/skipped, writes a valid draft", async () => {
    const dir = tempDir();
    const ruleset = join(dir, "spectral.yaml");
    writeFileSync(ruleset, RULESET, "utf8");
    const out = join(dir, "draft.yaml");

    const result = await runCapture([
      "migrate",
      "--spectral-rules",
      ruleset,
      "--out",
      out,
      "--no-color",
    ], { cwd: dir });
    expect(result.code).toBe(0);
    expect(result.stdout).toContain("resolved: 57 rules");
    expect(result.stdout).toContain("imported: 5 (shapes)");
    expect(result.stdout).toContain("covered: 14 (elite)");
    expect(result.stdout).toContain("skipped: 38");
    expect(result.stdout).not.toContain("path-declarations-must-exist —");
    expect(existsSync(out)).toBe(true);

    const draft = readFileSync(out, "utf8");
    expect(draft).toContain("id: SPEC-001");
    expect(draft).toContain("category: custom");
    expect(draft).toContain("Every operation must have a summary.");

    const validate = await runCapture(["rules", "validate", out], { cwd: dir });
    expect(validate.code).toBe(0);
    expect(validate.stdout).toContain("ok: 5 rules");
  }, 30000);

  it("the imported draft actually evaluates with analyze (end-to-end semantics)", async () => {
    const dir = tempDir();
    const ruleset = join(dir, "spectral.yaml");
    writeFileSync(ruleset, RULESET, "utf8");
    const out = join(dir, "draft.yaml");
    const migrated = await runCapture(
      ["migrate", "--spectral-rules", ruleset, "--out", out, "--no-color"],
      { cwd: dir },
    );
    expect(migrated.code).toBe(0);

    const spec = join(dir, "spec.yaml");
    writeFileSync(
      spec,
      [
        "openapi: 3.1.0",
        "info: { title: T, version: 1.0.0 }",
        "paths:",
        "  /things:",
        "    get:",
        "      summary: list things",
        "      description: Returns things.",
        "      responses:",
        '        "200": { description: ok }',
        "  /others:",
        "    get:",
        "      description: No summary here.",
        "      responses:",
        '        "200": { description: ok }',
        "",
      ].join("\n"),
      "utf8",
    );

    const analyzed = await runCapture([
      "analyze",
      spec,
      "--rules",
      out,
      "--format",
      "json",
      "--fail-on",
      "never",
      "--no-color",
    ], { cwd: dir });
    expect(analyzed.code).toBe(0);
    const report = JSON.parse(analyzed.stdout) as {
      findings: Array<{ ruleId: string; message: string; apiLocation?: string }>;
    };
    const mine = report.findings.filter((f) => f.message === "Every operation must have a summary.");
    expect(mine).toHaveLength(1);
    expect(mine[0]!.ruleId).toMatch(/^SPEC-\d{3}$/);
    expect(mine[0]!.apiLocation).toBe("GET /others");
  }, 40000);

  it("is deterministic: two runs produce byte-identical drafts", async () => {
    const dir = tempDir();
    const ruleset = join(dir, "spectral.yaml");
    writeFileSync(ruleset, RULESET, "utf8");
    const a = join(dir, "a.yaml");
    const b = join(dir, "b.yaml");
    await runCapture(["migrate", "--spectral-rules", ruleset, "--out", a, "--no-color"], { cwd: dir });
    await runCapture(["migrate", "--spectral-rules", ruleset, "--out", b, "--no-color"], { cwd: dir });
    expect(readFileSync(a, "utf8")).toBe(readFileSync(b, "utf8"));
  }, 30000);

  it("refuses to overwrite without --force; dry-run writes nothing", async () => {
    const dir = tempDir();
    const ruleset = join(dir, "spectral.yaml");
    writeFileSync(ruleset, RULESET, "utf8");
    const out = join(dir, "draft.yaml");

    const dry = await runCapture(
      ["migrate", "--spectral-rules", ruleset, "--out", out, "--dry-run", "--no-color"],
      { cwd: dir },
    );
    expect(dry.code).toBe(0);
    expect(dry.stdout).toContain("dry-run: nothing written");
    expect(existsSync(out)).toBe(false);

    const first = await runCapture(["migrate", "--spectral-rules", ruleset, "--out", out, "--no-color"], { cwd: dir });
    expect(first.code).toBe(0);
    const second = await runCapture(["migrate", "--spectral-rules", ruleset, "--out", out, "--no-color"], { cwd: dir });
    expect(second.code).toBe(2);
    expect(second.stderr).toContain("--force");
    const forced = await runCapture(
      ["migrate", "--spectral-rules", ruleset, "--out", out, "--force", "--no-color"],
      { cwd: dir },
    );
    expect(forced.code).toBe(0);
  }, 40000);

  it("usage errors: missing file, unsupported extends, and --spectral-disables still a follow-up", async () => {
    const dir = tempDir();
    const missing = await runCapture(["migrate", "--spectral-rules", "nope.yaml"], { cwd: dir });
    expect(missing.code).toBe(2);

    const remote = join(dir, "remote.yaml");
    writeFileSync(remote, "extends: [https://example.com/rs.yaml]\nrules: {}\n", "utf8");
    const remoteRun = await runCapture(["migrate", "--spectral-rules", remote, "--no-color"], { cwd: dir });
    expect(remoteRun.code).toBe(2);
    expect(remoteRun.stderr).toContain("INV-1");

    const disables = await runCapture(["migrate", "--spectral-disables", "x.yaml"], { cwd: dir });
    expect(disables.code).toBe(2);
    expect(disables.stderr).toContain("follow-up");
  }, 30000);
});
