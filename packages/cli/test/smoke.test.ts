import { describe, expect, it } from "vitest";
import { getHelp, getVersion, run } from "../src/index.js";

async function runCapture(
  argv: string[],
  io: {
    cwd?: string;
    env?: Record<string, string | undefined>;
    isTTY?: boolean;
    stdin?: () => Promise<Uint8Array>;
  } = {},
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
    ...io,
  });
  return { code, stdout, stderr };
}

describe("@apigovscan/cli", () => {
  it("reports dev version", () => {
    expect(getVersion()).toBe("0.0.0-dev");
  });

  it("prints help text with usage", () => {
    expect(getHelp()).toContain("apigovscan");
    expect(getHelp()).toContain("--version");
    expect(getHelp()).toContain("analyze <path>");
  });

  it("returns 0 for --version", async () => {
    await expect(run(["node", "cli", "--version"])).resolves.toBe(0);
  });

  it("returns 0 for --help", async () => {
    await expect(run(["node", "cli", "--help"])).resolves.toBe(0);
  });

  it("returns 2 for unknown command", async () => {
    const { code, stderr } = await runCapture(["frobnicate"]);
    expect(code).toBe(2);
    expect(stderr).toContain("Unknown command");
  });

  it("returns 2 for analyze without path", async () => {
    const { code, stderr } = await runCapture(["analyze"]);
    expect(code).toBe(2);
    expect(stderr).toContain("missing required argument");
  });

  it("returns 2 for missing input file", async () => {
    const { code, stderr } = await runCapture(["analyze", "./nope.yaml"]);
    expect(code).toBe(2);
    expect(stderr).toContain("input not found");
  });
});
