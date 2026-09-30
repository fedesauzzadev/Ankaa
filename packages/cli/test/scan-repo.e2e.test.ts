import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DEV_LICENSE_KEY } from "../src/license.js";

const mockExecFile = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({ execFile: mockExecFile }));

import { run } from "../src/index.js";

const tempRoots: string[] = [];
const clonedDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-scan-repo-e2e-"));
  tempRoots.push(dir);
  return dir;
}

function fakeClone(destDir: string): void {
  mkdirSync(destDir, { recursive: true });
  writeFileSync(
    join(destDir, "openapi.yaml"),
    ["openapi: 3.1.0", "info:", "  title: Test API", '  version: "1.0.0"', "paths: {}", ""].join(
      "\n",
    ),
    "utf8",
  );
  clonedDirs.push(destDir);
}

beforeEach(() => {
  mockExecFile.mockReset();
  mockExecFile.mockImplementation(
    (
      _command: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv; timeout?: number },
      callback: (error: Error | null, result?: { stdout: string; stderr: string }) => void,
    ) => {
      const destDir = args[5];
      if (destDir === undefined) throw new Error("git clone destination was not passed");
      fakeClone(destDir);
      expect(options.env?.GIT_TERMINAL_PROMPT).toBe("0");
      expect(options.timeout).toBe(120000);
      if (args[4]?.startsWith("ssh://") || args[4]?.includes("@")) {
        expect(options.env?.GIT_SSH_COMMAND).toContain("BatchMode=yes");
      }
      callback(null, { stdout: "", stderr: "" });
    },
  );
});

afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

describe("scan-repo CLI e2e", () => {
  it("analyzes a shallow remote clone and removes the temporary checkout", async () => {
    const cwd = tempDir();
    let stdout = "";
    let stderr = "";
    const code = await run(
      ["node", "cli", "scan-repo", "https://github.com/example/api.git", "--format", "json"],
      {
        cwd,
        env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
        stdout: (text) => (stdout += text),
        stderr: (text) => (stderr += text),
        isTTY: false,
      },
    );

    expect(code).toBe(0);
    expect(stderr).toBe("");
    const report = JSON.parse(stdout) as {
      tool: { name: string };
      input: Array<{ path: string }>;
      findings: unknown[];
    };
    expect(report).toMatchObject({
      tool: { name: "ankaa" },
      input: [{ path: expect.stringContaining("openapi.yaml") }],
    });
    expect(report.findings.length).toBeGreaterThan(0);
    expect(mockExecFile).toHaveBeenCalledWith(
      "git",
      ["clone", "--depth", "1", "--", "https://github.com/example/api.git", expect.any(String)],
      expect.objectContaining({ timeout: expect.any(Number) }),
      expect.any(Function),
    );
    expect(clonedDirs).toHaveLength(1);
    expect(existsSync(clonedDirs[0]!)).toBe(false);
  });

  it("retains a successful clone in the explicitly requested empty workdir", async () => {
    const cwd = tempDir();
    const workdir = join(cwd, "checkout");
    mkdirSync(workdir);
    let stdout = "";
    const code = await run(
      ["node", "cli", "scan-repo", "git@github.com:example/api.git", "--workdir", "checkout"],
      {
        cwd,
        env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
        stdout: (text) => (stdout += text),
        stderr: () => {},
        isTTY: false,
      },
    );

    expect(code).toBe(0);
    expect(stdout).toContain("Ankaa");
    expect(readdirSync(workdir)).toEqual(["repo"]);
    expect(readFileSync(join(workdir, "repo", "openapi.yaml"), "utf8")).toContain("openapi:");
  });

  it("overwrites only the explicit output when --force is provided", async () => {
    const cwd = tempDir();
    const output = join(cwd, "report.json");
    writeFileSync(output, "previous report", "utf8");
    const code = await run(
      [
        "node",
        "cli",
        "scan-repo",
        "https://github.com/example/api.git",
        "--format",
        "json",
        "--out",
        output,
        "--force",
      ],
      {
        cwd,
        env: { ANKAA_LICENSE_KEY: DEV_LICENSE_KEY },
        stdout: () => {},
        stderr: () => {},
        isTTY: false,
      },
    );

    expect(code).toBe(0);
    expect(JSON.parse(readFileSync(output, "utf8"))).toMatchObject({
      tool: { name: "ankaa" },
      input: [expect.objectContaining({ path: expect.stringContaining("openapi.yaml") })],
    });
  });

  it("preserves an existing explicit output without --force", async () => {
    const cwd = tempDir();
    const output = join(cwd, "report.json");
    writeFileSync(output, "keep", "utf8");
    let stderr = "";
    const code = await run(
      ["node", "cli", "scan-repo", "https://github.com/example/api.git", "--out", output],
      {
        cwd,
        env: {},
        stdout: () => {},
        stderr: (text) => (stderr += text),
        isTTY: false,
      },
    );

    expect(code).toBe(2);
    expect(stderr).toContain("--force");
    expect(readFileSync(output, "utf8")).toBe("keep");
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("rejects invalid remote URLs before starting Git", async () => {
    const cwd = tempDir();
    let stderr = "";
    const code = await run(["node", "cli", "scan-repo", "https://user:secret@example.com/a/b"], {
      cwd,
      env: {},
      stdout: () => {},
      stderr: (text) => (stderr += text),
      isTTY: false,
    });

    expect(code).toBe(2);
    expect(stderr).not.toContain("example.com");
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  it("redacts Git failures and removes a failed temporary checkout", async () => {
    const cloneCount = clonedDirs.length;
    mockExecFile.mockImplementationOnce(
      (_command: string, args: string[], _options: unknown, callback: (error: Error) => void) => {
        const destDir = args[5]!;
        fakeClone(destDir);
        callback(new Error("fatal: https://user:secret@host/private"));
      },
    );
    const cwd = tempDir();
    let stderr = "";
    const code = await run(["node", "cli", "scan-repo", "https://host.example/team/repo.git"], {
      cwd,
      env: {},
      stdout: () => {},
      stderr: (text) => (stderr += text),
      isTTY: false,
    });

    expect(code).toBe(2);
    expect(stderr).not.toContain("secret");
    expect(stderr).not.toContain("host.example");
    expect(clonedDirs).toHaveLength(cloneCount + 1);
    expect(existsSync(clonedDirs.at(-1)!)).toBe(false);
  });

  it("reports a bounded clone timeout without leaking the remote URL", async () => {
    mockExecFile.mockImplementationOnce(
      (
        _command: string,
        _args: string[],
        options: { timeout?: number },
        callback: (error: NodeJS.ErrnoException) => void,
      ) => {
        expect(options.timeout).toBe(120000);
        const error = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
        callback(error);
      },
    );
    let stderr = "";
    const code = await run(["node", "cli", "scan-repo", "https://host.example/team/repo.git"], {
      cwd: tempDir(),
      env: {},
      stdout: () => {},
      stderr: (text) => (stderr += text),
      isTTY: false,
    });

    expect(code).toBe(2);
    expect(stderr).toContain("git clone timed out");
    expect(stderr).not.toContain("host.example");
  });

  it("does not reuse a non-empty workdir", async () => {
    const cwd = tempDir();
    const workdir = join(cwd, "checkout");
    mkdirSync(workdir);
    writeFileSync(join(workdir, "keep.txt"), "keep", "utf8");
    let stderr = "";
    const code = await run(
      ["node", "cli", "scan-repo", "https://host.example/team/repo.git", "--workdir", "checkout"],
      {
        cwd,
        env: {},
        stdout: () => {},
        stderr: (text) => (stderr += text),
        isTTY: false,
      },
    );

    expect(code).toBe(2);
    expect(stderr).toContain("workdir must be empty");
    expect(readdirSync(workdir)).toEqual(["keep.txt"]);
    expect(mockExecFile).not.toHaveBeenCalled();
  });
});
