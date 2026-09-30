import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { DEV_LICENSE_KEY } from "../src/license.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-diff-e2e-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best effort
    }
  }
});

type Env = Record<string, string | undefined>;

async function runCapture(
  argv: string[],
  io: { cwd?: string; env?: Env } = {},
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

function licEnv(): Env {
  return { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY };
}

const BASE = [
  "openapi: 3.1.0",
  "info:",
  "  title: Shop",
  "  version: 1.0.0",
  "paths:",
  "  /users:",
  "    get:",
  "      operationId: listUsers",
  "      parameters:",
  "        - name: verbose",
  "          in: query",
  "          required: false",
  "          schema:",
  "            type: boolean",
  "      responses:",
  '        "200":',
  "          description: ok",
  '        "404":',
  "          description: missing",
  "    post:",
  "      operationId: createUser",
  "      responses:",
  '        "201":',
  "          description: created",
  "",
].join("\n");

const HEAD = [
  "openapi: 3.1.0",
  "info:",
  "  title: Shop",
  "  version: 2.0.0",
  "paths:",
  "  /users:",
  "    get:",
  "      operationId: listUsers",
  "      parameters:",
  "        - name: verbose",
  "          in: query",
  "          required: false",
  "          schema:",
  "            type: boolean",
  "        - name: limit",
  "          in: query",
  "          required: true",
  "          schema:",
  "            type: integer",
  "      responses:",
  '        "200":',
  "          description: ok",
  "",
].join("\n");

function setupPair(): { dir: string; base: string; head: string } {
  const dir = tempDir();
  const base = join(dir, "base.yaml");
  const head = join(dir, "head.yaml");
  writeFileSync(base, BASE, "utf8");
  writeFileSync(head, HEAD, "utf8");
  return { dir, base, head };
}

describe("diff e2e (f12-breaking)", () => {
  it("AC-BK.4 json report carries diff pack, both inputs and labeled findings", async () => {
    const { dir, base, head } = setupPair();
    const out = await runCapture(["diff", base, head, "--format", "json", "--no-color"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(1);
    const report = JSON.parse(out.stdout) as {
      packs: Array<{ id: string }>;
      input: Array<{ path: string }>;
      findings: Array<{ ruleId: string; location: string; fingerprint: string }>;
      reportHash: string;
    };
    expect(report.packs).toEqual([{ id: "diff", version: "0.0.0-dev" }]);
    expect(report.input.map((i) => i.path)).toEqual(["base.yaml", "head.yaml"]);
    const ids = report.findings.map((f) => f.ruleId).sort();
    expect(ids).toEqual(["BRK-001", "BRK-002", "BRK-005"]);
    const byId = new Map(report.findings.map((f) => [f.ruleId, f]));
    expect(byId.get("BRK-001")!.location).toContain("base.yaml#");
    expect(byId.get("BRK-002")!.location).toContain("head.yaml#");
    expect(byId.get("BRK-005")!.location).toContain("base.yaml#");
    expect(report.reportHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("AC-BK.4 identical specs exit 0 with zero findings; reruns are byte-identical", async () => {
    const { dir, base } = setupPair();
    const first = await runCapture(["diff", base, base, "--format", "json", "--no-color"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(first.code).toBe(0);
    const a = JSON.parse(first.stdout) as { findings: unknown[]; reportHash: string };
    expect(a.findings).toEqual([]);
    const second = await runCapture(["diff", base, base, "--format", "json", "--no-color"], {
      cwd: dir,
      env: licEnv(),
    });
    const b = JSON.parse(second.stdout) as { findings: unknown[]; reportHash: string };
    expect(b.findings).toEqual(a.findings);
    expect(b.reportHash).toBe(a.reportHash);
  });

  it("AC-BK.4 --fail-on never exits 0 with findings; console lists rule ids", async () => {
    const { dir, base, head } = setupPair();
    const out = await runCapture(["diff", base, head, "--fail-on", "never", "--no-color"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("BRK-001");
    expect(out.stdout).toContain("BRK-002");
    expect(out.stdout).toContain("BRK-005");
  });

  it("AC-BK.5 no license exits 2", async () => {
    const { dir, base, head } = setupPair();
    const out = await runCapture(["diff", base, head], { cwd: dir, env: {} });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("license");
  });

  it("AC-BK.5 rules off disables a check; fingerprint suppression hides it", async () => {
    const { dir, base, head } = setupPair();
    writeFileSync(join(dir, "ankaa.yaml"), "rules:\n  BRK-001: off\n", "utf8");
    const off = await runCapture(["diff", base, head, "--format", "json", "--no-color"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(off.code).toBe(1);
    const offReport = JSON.parse(off.stdout) as { findings: Array<{ ruleId: string }> };
    expect(offReport.findings.map((f) => f.ruleId).sort()).toEqual(["BRK-002", "BRK-005"]);

    const { dir: dir2, base: base2, head: head2 } = setupPair();
    const first = await runCapture(["diff", base2, head2, "--format", "json", "--no-color"], {
      cwd: dir2,
      env: licEnv(),
    });
    const firstReport = JSON.parse(first.stdout) as {
      findings: Array<{ ruleId: string; fingerprint: string }>;
    };
    const target = firstReport.findings.find((f) => f.ruleId === "BRK-005")!;
    const skillsDir = join(dir2, ".ankaa", "skills");
    mkdirSync(skillsDir, { recursive: true });
    writeFileSync(
      join(skillsDir, "suppressions.yaml"),
      ["version: 1", "suppressions:", `  - fingerprint: ${target.fingerprint}`, "    reason: keep 404 gone", ""].join(
        "\n",
      ),
      "utf8",
    );
    const second = await runCapture(["diff", base2, head2, "--format", "json", "--no-color"], {
      cwd: dir2,
      env: licEnv(),
    });
    const secondReport = JSON.parse(second.stdout) as {
      findings: Array<{ ruleId: string }>;
      summary: { skillsSuppressed?: number };
    };
    expect(secondReport.findings.map((f) => f.ruleId).sort()).toEqual(["BRK-001", "BRK-002"]);
    expect(secondReport.summary.skillsSuppressed).toBe(1);
  });

  it("AC-BK.6 renamed path reports BRK-001 on the old path", async () => {
    const dir = tempDir();
    const base = join(dir, "base.yaml");
    const head = join(dir, "head.yaml");
    writeFileSync(base, BASE, "utf8");
    writeFileSync(head, BASE.replace("/users:", "/customers:"), "utf8");
    const out = await runCapture(["diff", base, head, "--format", "json", "--no-color"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(1);
    const report = JSON.parse(out.stdout) as {
      findings: Array<{ ruleId: string; apiLocation?: string }>;
    };
    const removed = report.findings.filter((f) => f.ruleId === "BRK-001");
    expect(removed.length).toBe(2);
    expect(removed.every((f) => f.apiLocation?.includes("/users"))).toBe(true);
  });

  it("usage errors exit 2 honestly", async () => {
    const { dir, base } = setupPair();
    const one = await runCapture(["diff", base], { cwd: dir, env: licEnv() });
    expect(one.code).toBe(2);
    expect(one.stderr).toContain("exactly two specs");
    const missing = await runCapture(["diff", base, join(dir, "nope.yaml")], {
      cwd: dir,
      env: licEnv(),
    });
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("input not found");
    const stdin = await runCapture(["diff", "-", base], { cwd: dir, env: licEnv() });
    expect(stdin.code).toBe(2);
    expect(stdin.stderr).toContain("stdin");
  });
});
