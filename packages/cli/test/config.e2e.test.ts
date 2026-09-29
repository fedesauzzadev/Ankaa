import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-cfg-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
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

const TEAM_RULE = [
  "id: TEAM-001",
  "category: custom",
  "severity: error",
  'message: "Every operation must accept x-request-id."',
  "when:",
  "  all:",
  "    - op: method",
  "      in: [get, post, put, patch, delete]",
  "    - not:",
  "        op: headerRequired",
  "        name: x-request-id",
].join("\n");

const INLINE_TEAM = JSON.stringify({
  id: "TEAM-900",
  category: "custom",
  severity: "warning",
  message: "Inline team rule.",
  when: { op: "method", in: ["get"] },
});

describe("config e2e (AC-C.*)", () => {
  it("AC-C.1 unknown top-level key exits 2", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "apigovscan.yaml"), "failOn: error\nwat: true\n", "utf8");
    const { code, stderr } = await runCapture(["analyze", petstore, "--no-color"], { cwd: dir });
    expect(code).toBe(2);
    expect(stderr).toContain('unknown key "wat"');
  });

  it("AC-C.3 --fail-on overrides config failOn", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "apigovscan.yaml"), "failOn: never\n", "utf8");
    const withFlag = await runCapture(
      ["analyze", petstore, "--fail-on", "warning", "--format", "json", "--no-color"],
      { cwd: dir },
    );
    const parsed = extractJson(withFlag.stdout);
    expect(parsed).not.toBeNull();
    const summary = parsed!.summary as { error: number; warning: number };
    const expected = summary.error + summary.warning > 0 ? 1 : 0;
    expect(withFlag.code).toBe(expected);

    const withoutFlag = await runCapture(["analyze", petstore, "--no-color"], { cwd: dir });
    expect(withoutFlag.stderr).toContain("failOn=never");
    expect(withoutFlag.code).toBe(0);
  });

  it("AC-C.2 config customRules loads and evaluates", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "team.yaml"), TEAM_RULE, "utf8");
    writeFileSync(
      join(dir, "apigovscan.yaml"),
      ["failOn: never", "customRules:", "  - ./team.yaml"].join("\n"),
      "utf8",
    );
    const { code, stdout, stderr } = await runCapture(
      ["analyze", petstore, "--format", "json", "--no-color"],
      { cwd: dir },
    );
    if (code === 2) throw new Error(stderr);
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const findings = parsed!.findings as Array<{
      ruleId: string;
      packId: string;
    }>;
    expect(findings.some((f) => f.ruleId === "TEAM-001")).toBe(true);
    expect(findings.find((f) => f.ruleId === "TEAM-001")!.packId).toBe("custom");
  });

  it("AC-C.4 missing customRules path exits 2", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "apigovscan.yaml"), "customRules:\n  - ./missing.yaml\n", "utf8");
    const { code, stderr } = await runCapture(["analyze", petstore, "--no-color"], { cwd: dir });
    expect(code).toBe(2);
    expect(stderr).toContain("customRules not found");
  });

  it("AC-C.5 paths resolve relative to config file directory", async () => {
    const root = tempDir();
    const nested = join(root, "cfg");
    const { mkdirSync } = await import("node:fs");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "team.yaml"), TEAM_RULE, "utf8");
    writeFileSync(
      join(nested, "apigovscan.yaml"),
      ["failOn: never", "customRules:", "  - ./team.yaml"].join("\n"),
      "utf8",
    );
    const { code, stdout, stderr } = await runCapture(
      ["analyze", petstore, "--format", "json", "--no-color"],
      { cwd: root },
    );
    // config is not auto-discovered from nested dir — use --config
    const withConfig = await runCapture(
      [
        "analyze",
        petstore,
        "--config",
        join(nested, "apigovscan.yaml"),
        "--format",
        "json",
        "--no-color",
      ],
      { cwd: root },
    );
    void code;
    void stdout;
    void stderr;
    expect(withConfig.code === 2).toBe(false);
    const parsed = extractJson(withConfig.stdout);
    expect(parsed).not.toBeNull();
    const findings = parsed!.findings as Array<{ ruleId: string }>;
    expect(findings.some((f) => f.ruleId === "TEAM-001")).toBe(true);
  });

  it("AC-C.6 f1 config subset still works (failOn + rules off)", async () => {
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
    const without = await runCapture(["analyze", badSpec, "--format", "json", "--no-color"], {
      cwd: tempDir(),
    });
    const withCfg = await runCapture(["analyze", badSpec, "--format", "json", "--no-color"], {
      cwd: dir,
    });
    const withoutJson = extractJson(without.stdout);
    const withJson = extractJson(withCfg.stdout);
    expect(withoutJson).not.toBeNull();
    expect(withJson).not.toBeNull();
    const baseIds = (withoutJson!.findings as Array<{ ruleId: string }>).map((f) => f.ruleId);
    const cfgIds = (withJson!.findings as Array<{ ruleId: string }>).map((f) => f.ruleId);
    expect(baseIds).toContain("NAMING-001");
    expect(cfgIds).not.toContain("NAMING-001");
  });

  it("AC-C.7 skillsDir is accepted (allowlist f3)", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "apigovscan.yaml"),
      "failOn: never\nskillsDir: .apigovscan/skills\n",
      "utf8",
    );
    const { code, stderr } = await runCapture(["analyze", petstore, "--no-color"], { cwd: dir });
    expect([0, 1]).toContain(code);
    expect(stderr).not.toContain("unknown key");
  });

  it("AC-C.8 merge config + --rules + --rule applies all", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "team.yaml"), TEAM_RULE, "utf8");
    writeFileSync(
      join(dir, "apigovscan.yaml"),
      ["failOn: never", "customRules:", "  - ./team.yaml"].join("\n"),
      "utf8",
    );
    const cliRules = join(dir, "cli.yaml");
    writeFileSync(
      cliRules,
      [
        "id: TEAM-002",
        "category: custom",
        "severity: warning",
        'message: "CLI-only rule."',
        "when:",
        "  op: method",
        "  in: [get]",
      ].join("\n"),
      "utf8",
    );
    const { code, stdout, stderr } = await runCapture(
      [
        "analyze",
        petstore,
        "--rules",
        cliRules,
        "--rule",
        INLINE_TEAM,
        "--format",
        "json",
        "--no-color",
      ],
      { cwd: dir },
    );
    if (code === 2) throw new Error(stderr);
    const parsed = extractJson(stdout);
    expect(parsed).not.toBeNull();
    const ids = (parsed!.findings as Array<{ ruleId: string }>).map((f) => f.ruleId);
    expect(ids).toContain("TEAM-001");
    expect(ids).toContain("TEAM-002");
    expect(ids).toContain("TEAM-900");
  });

  it("AC-C.9 examples/apigovscan.yaml parses against f2 schema", async () => {
    const example = join(repoRoot, "examples", "apigovscan.yaml");
    const { readFileSync } = await import("node:fs");
    const { loadConfigFromText } = await import("../src/config.js");
    const result = loadConfigFromText(readFileSync(example, "utf8"), example);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.config.failOn).toBe("error");
    expect(result.config.customRules).toEqual(["./team-rules.yaml"]);
    expect(result.config.baseline?.enabled).toBe(false);
    expect(result.config.skillsDir).toBe(".apigovscan/skills");
  });

  it("warns when standards.version mismatches embedded pack", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "apigovscan.yaml"),
      ["failOn: never", "standards:", '  version: "1999.01.1"'].join("\n"),
      "utf8",
    );
    const { code, stderr } = await runCapture(["analyze", petstore, "--no-color"], { cwd: dir });
    expect([0, 1]).toContain(code);
    expect(stderr).toContain("does not match embedded pack");
  });
});
