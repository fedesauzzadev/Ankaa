import { copyFileSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { DEV_LICENSE_KEY, generateLicenseKey } from "../src/license.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-lic-"));
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
    env: io.env ?? {},
    ...io,
  });
  return { code, stdout, stderr };
}

describe("license gating e2e (f6-distribution)", () => {
  it("AC-D.3 analyze without license exits 2 with actionable message", async () => {
    const dir = tempDir();
    copyFileSync(petstore, join(dir, "openapi.yaml"));
    const out = await runCapture(["analyze", "openapi.yaml"], { cwd: dir, env: {} });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("missing license");
    expect(out.stderr).toContain("ANKAA_LICENSE_KEY");
  });

  it("AC-D.3 analyze with env license runs normally", async () => {
    const dir = tempDir();
    copyFileSync(petstore, join(dir, "openapi.yaml"));
    const out = await runCapture(["analyze", "openapi.yaml"], {
      cwd: dir,
      env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("score");
  });

  it("AC-D.3 --license-key flag wins over env (bad flag, good env => exit 2)", async () => {
    const dir = tempDir();
    copyFileSync(petstore, join(dir, "openapi.yaml"));
    const out = await runCapture(
      ["analyze", "openapi.yaml", "--license-key", "AGS-evil-20991231-000000000000"],
      { cwd: dir, env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY } },
    );
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("bad signature");
  });

  it("AC-D.2 config license.key is used when env is absent", async () => {
    const dir = tempDir();
    copyFileSync(petstore, join(dir, "openapi.yaml"));
    writeFileSync(join(dir, "ankaa.yaml"), `license:\n  key: "${DEV_LICENSE_KEY}"\n`, "utf8");
    const out = await runCapture(["analyze", "openapi.yaml"], {
      cwd: dir,
      env: {},
    });
    expect(out.code).toBe(0);
  });

  it("AC-D.2 env wins over config (bad config, good env => runs)", async () => {
    const dir = tempDir();
    copyFileSync(petstore, join(dir, "openapi.yaml"));
    writeFileSync(
      join(dir, "ankaa.yaml"),
      'license:\n  key: "AGS-wrong-20991231-000000000000"\n',
      "utf8",
    );
    const out = await runCapture(["analyze", "openapi.yaml"], {
      cwd: dir,
      env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
    });
    expect(out.code).toBe(0);
  });

  it("expired license exits 2 with expired reason", async () => {
    const dir = tempDir();
    copyFileSync(petstore, join(dir, "openapi.yaml"));
    const expired = generateLicenseKey("acme", "20200101");
    const out = await runCapture(["analyze", "openapi.yaml"], {
      cwd: dir,
      env: { ANKAA_LICENSE_KEY: expired },
    });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("expired");
  });

  it("AC-D.4 mcp without license exits 2 before starting the server", async () => {
    const out = await runCapture(["mcp"], { env: {} });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("missing license");
  });

  it("AC-D.4 mcp with env license passes the gate (help still free)", async () => {
    const help = await runCapture(["mcp", "--help"], { env: {} });
    expect(help.code).toBe(0);
    expect(help.stdout).toContain("MCP stdio server");
  });

  it("AC-D.5 license command validates keys", async () => {
    const ok = await runCapture(["license", "--key", DEV_LICENSE_KEY], {
      env: {},
    });
    expect(ok.code).toBe(0);
    expect(ok.stdout).toContain("customer dev");
    expect(ok.stdout).toContain("20991231");

    const bad = await runCapture(["license", "--key", "nope"], { env: {} });
    expect(bad.code).toBe(2);
    expect(bad.stderr).toContain("malformed");
  });

  it("AC-D.5 license command falls back to env", async () => {
    const out = await runCapture(["license"], {
      env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("valid");
  });

  it("gated commands keep exit 2 usage errors distinct (unknown flag)", async () => {
    const dir = tempDir();
    const out = await runCapture(["analyze", "openapi.yaml", "--nope"], {
      cwd: dir,
      env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
    });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("unknown option");
  });
});
