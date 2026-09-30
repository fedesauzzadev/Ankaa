import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { loadLlmConfig } from "../src/llm.js";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { run } from "../src/index.js";

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-rebrand-legacy-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function runCapture(
  argv: string[],
  env: Record<string, string | undefined>,
  cwd: string,
): Promise<{ code: number; stderr: string }> {
  let stderr = "";
  const code = await run(["node", "cli", ...argv], {
    stdout: () => {},
    stderr: (t) => {
      stderr += t;
    },
    env,
    cwd,
    isTTY: false,
  });
  return { code, stderr };
}

describe("rebrand legacy negatives (f16 AC-16.2/16.3/16.5)", () => {
  it("AC-16.2: apigovscan.yaml is no longer auto-detected", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "apigovscan.yaml"),
      "failOn: never\n",
      "utf8",
    );
    const loaded = loadConfig(dir, undefined);
    expect(loaded.ok).toBe(true);
    if (!loaded.ok) return;
    expect(loaded.config.failOn).not.toBe("never");

    writeFileSync(join(dir, "ankaa.yaml"), "failOn: never\n", "utf8");
    const reloaded = loadConfig(dir, undefined);
    expect(reloaded.ok).toBe(true);
    if (!reloaded.ok) return;
    expect(reloaded.config.failOn).toBe("never");
  });

  it("AC-16.3: APIGOVSCAN_LICENSE_KEY is ignored (no legacy fallback)", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "openapi.yaml"),
      ["openapi: 3.1.0", "info:", "  title: T", "  version: 1.0.0", "paths: {}", ""].join("\n"),
      "utf8",
    );
    const result = await runCapture(
      ["analyze", "openapi.yaml"],
      { APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY },
      dir,
    );
    expect(result.code).toBe(2);
    expect(result.stderr).toContain("missing license");
    expect(result.stderr).toContain("ANKAA_LICENSE_KEY");
  });

  it("AC-16.3: APIGOVSCAN_LLM_* is ignored (no legacy fallback)", () => {
    const llm = loadLlmConfig(undefined, {
      APIGOVSCAN_LLM_BASE_URL: "http://localhost:11434/v1",
      APIGOVSCAN_LLM_MODEL: "stub",
    });
    expect(llm).toBeUndefined();
    const active = loadLlmConfig(undefined, {
      ANKAA_LLM_BASE_URL: "http://localhost:11434/v1",
      ANKAA_LLM_MODEL: "stub",
    });
    expect(active).toMatchObject({ baseUrl: "http://localhost:11434/v1", model: "stub" });
  });

  it("AC-16.5: the public community key still validates under Ankaa", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "openapi.yaml"),
      ["openapi: 3.1.0", "info:", "  title: T", "  version: 1.0.0", "paths: {}", ""].join("\n"),
      "utf8",
    );
    const result = await runCapture(
      ["analyze", "openapi.yaml"],
      { ANKAA_LICENSE_KEY: "AGS-community-20300101-ba8a91370cc7" },
      dir,
    );
    expect(result.code).not.toBe(2);
    expect(result.stderr).not.toContain("license");
  });
});
