import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { parse as parseYaml } from "yaml";
import { run } from "../src/index.js";
import { runInit } from "../src/init.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-init-"));
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

describe("init e2e (AC-I.*)", () => {
  it("AC-I.1 init in empty dir creates scaffold paths and exits 0", async () => {
    const dir = tempDir();
    const { code, stdout, stderr } = await runCapture(["init"], { cwd: dir });
    expect(code).toBe(0);
    expect(stderr).toBe("");
    expect(existsSync(join(dir, "apigovscan.yaml"))).toBe(true);
    expect(existsSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"))).toBe(
      true,
    );
    expect(existsSync(join(dir, ".apigovscan", "skills", "severities.yaml"))).toBe(
      true,
    );
    expect(existsSync(join(dir, ".apigovscan", "skills", "drafts", ".gitkeep"))).toBe(
      true,
    );
    expect(existsSync(join(dir, ".apigovscan", "skills", "README.md"))).toBe(true);
    expect(stdout).toContain("created: apigovscan.yaml");
    expect(stdout).toContain("created: .apigovscan/skills/suppressions.yaml");

    const config = parseYaml(readFileSync(join(dir, "apigovscan.yaml"), "utf8")) as Record<
      string,
      unknown
    >;
    expect(config.failOn).toBe("error");
    expect(config.skillsDir).toBe(".apigovscan/skills");

    const sup = parseYaml(
      readFileSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"), "utf8"),
    ) as Record<string, unknown>;
    expect(sup.version).toBe(1);
    expect(sup.suppressions).toEqual([]);

    const sev = parseYaml(
      readFileSync(join(dir, ".apigovscan", "skills", "severities.yaml"), "utf8"),
    ) as Record<string, unknown>;
    expect(sev.version).toBe(1);
    expect(sev.overrides).toEqual([]);
  });

  it("AC-I.2 second init without --force skips existing (INV-7)", async () => {
    const dir = tempDir();
    await runCapture(["init"], { cwd: dir });
    const { code, stdout } = await runCapture(["init"], { cwd: dir });
    expect(code).toBe(0);
    expect(stdout).toContain("ok: already present: apigovscan.yaml");
    expect(stdout).toContain("ok: already present: .apigovscan/skills/suppressions.yaml");
    expect(stdout).not.toContain("created: apigovscan.yaml");
  });

  it("AC-I.3 --force overwrites scaffold but never user skills content", async () => {
    const dir = tempDir();
    await runCapture(["init"], { cwd: dir });

    // user puts a real suppression
    writeFileSync(
      join(dir, ".apigovscan", "skills", "suppressions.yaml"),
      [
        "version: 1",
        "suppressions:",
        '  - fingerprint: "' + "a".repeat(64) + '"',
        "    reason: user content",
        "",
      ].join("\n"),
      "utf8",
    );
    const before = readFileSync(
      join(dir, ".apigovscan", "skills", "suppressions.yaml"),
      "utf8",
    );

    // corrupt config so force can re-scaffold only if it matches known scaffold — it won't
    writeFileSync(join(dir, "apigovscan.yaml"), "failOn: warning\n", "utf8");

    const { code, stdout } = await runCapture(["init", "--force"], { cwd: dir });
    expect(code).toBe(0);
    // user suppressions preserved
    expect(
      readFileSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"), "utf8"),
    ).toBe(before);
    // config not overwritten (differs from scaffold)
    expect(readFileSync(join(dir, "apigovscan.yaml"), "utf8")).toBe("failOn: warning\n");
    expect(stdout).toContain("ok: already present: .apigovscan/skills/suppressions.yaml");
    expect(stdout).toContain("ok: already present: apigovscan.yaml");

    // force on pristine scaffold overwrites README (alwaysForce) and empty skills
    const dir2 = tempDir();
    await runCapture(["init"], { cwd: dir2 });
    const { code: code2, stdout: out2 } = await runCapture(["init", "--force"], {
      cwd: dir2,
    });
    expect(code2).toBe(0);
    expect(out2).toContain("overwritten: apigovscan.yaml");
    expect(out2).toContain("overwritten: .apigovscan/skills/README.md");
  });

  it("AC-I.4 init ./nope (missing dir) exits 2", async () => {
    const dir = tempDir();
    const { code, stderr } = await runCapture(["init", "./nope"], { cwd: dir });
    expect(code).toBe(2);
    expect(stderr).toContain("init target is not a directory: ./nope");
  });

  it("AC-I.5 existing config skillsDir: custom/skills is respected", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "apigovscan.yaml"),
      ["failOn: error", "skillsDir: custom/skills", ""].join("\n"),
      "utf8",
    );
    const { code, stdout } = await runCapture(["init"], { cwd: dir });
    expect(code).toBe(0);
    expect(existsSync(join(dir, "custom", "skills", "suppressions.yaml"))).toBe(true);
    expect(existsSync(join(dir, "custom", "skills", "drafts", ".gitkeep"))).toBe(true);
    expect(stdout).toContain("created: custom/skills/suppressions.yaml");
    expect(stdout).toContain("ok: already present: apigovscan.yaml");
  });

  it("AC-I.6 help mentions init", async () => {
    const { code, stdout } = await runCapture(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("apigovscan init [dir]");
    const sub = await runCapture(["init", "--help"]);
    expect(sub.code).toBe(0);
    expect(sub.stdout).toContain("Scaffold apigovscan.yaml");
  });

  it("--skills-dir flag overrides config path", async () => {
    const dir = tempDir();
    const { code } = await runCapture(["init", "--skills-dir", "team/skills"], {
      cwd: dir,
    });
    expect(code).toBe(0);
    expect(existsSync(join(dir, "team", "skills", "suppressions.yaml"))).toBe(true);
  });

  it("runInit unit: creates dirs first then files deterministically", () => {
    const dir = tempDir();
    const result = runInit(dir, {
      force: false,
      config: { configDir: dir },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.map((e) => e.action)).toEqual([
      "created",
      "created",
      "created",
      "created",
      "created",
    ]);
  });
});

describe("phase 3 e2e S4: init → analyze → feedback → learn → re-analyze", () => {
  const SPEC = [
    "openapi: 3.1.0",
    "info:",
    "  title: S4 API",
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

  it("full loop with init scaffold (criterio salida fase 3)", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "openapi.yaml"), SPEC, "utf8");

    const init = await runCapture(["init"], { cwd: dir });
    expect(init.code).toBe(0);

    const a1 = await runCapture(
      [
        "analyze",
        "openapi.yaml",
        "--format",
        "json",
        "--fail-on",
        "never",
        "--output",
        "report.json",
      ],
      { cwd: dir },
    );
    expect(a1.code).toBe(0);
    const report = JSON.parse(
      readFileSync(join(dir, "report.json"), "utf8"),
    ) as { findings: Array<{ fingerprint: string }> };
    expect(report.findings.length).toBeGreaterThan(0);

    const fp = report.findings[0]!.fingerprint;
    writeFileSync(
      join(dir, "feedback.json"),
      JSON.stringify({
        reportHash: undefined,
        items: [
          { fingerprint: fp, decision: "false_positive", comment: "by design" },
        ],
      }),
      "utf8",
    );

    const learn = await runCapture(
      ["learn", "--report", "report.json", "--feedback", "feedback.json"],
      { cwd: dir },
    );
    expect(learn.code).toBe(0);
    expect(existsSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"))).toBe(
      true,
    );
    const supText = readFileSync(
      join(dir, ".apigovscan", "skills", "suppressions.yaml"),
      "utf8",
    );
    expect(supText).toContain(fp);
    expect(supText).toContain("by design");

    const a2 = await runCapture(
      [
        "analyze",
        "openapi.yaml",
        "--format",
        "json",
        "--fail-on",
        "never",
        "--output",
        "report2.json",
      ],
      { cwd: dir },
    );
    expect(a2.code).toBe(0);
    const report2 = JSON.parse(
      readFileSync(join(dir, "report2.json"), "utf8"),
    ) as {
      findings: Array<{ fingerprint: string }>;
      summary: { skillsSuppressed?: number };
    };
    expect(report2.findings.map((f) => f.fingerprint)).not.toContain(fp);
    expect(report2.summary.skillsSuppressed).toBeGreaterThanOrEqual(1);

    // INV-5: second learn with same input is byte-identical
    const before = readFileSync(
      join(dir, ".apigovscan", "skills", "suppressions.yaml"),
      "utf8",
    );
    const learn2 = await runCapture(
      ["learn", "--report", "report.json", "--feedback", "feedback.json"],
      { cwd: dir },
    );
    expect(learn2.code).toBe(0);
    expect(
      readFileSync(join(dir, ".apigovscan", "skills", "suppressions.yaml"), "utf8"),
    ).toBe(before);
  });
});
