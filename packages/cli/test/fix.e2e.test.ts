import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { startLlmStub } from "./llm-stub.js";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-fix-"));
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

function licensedDir(): string {
  const dir = tempDir();
  copyFileSync(petstore, join(dir, "openapi.yaml"));
  return dir;
}

function licEnv(llmUrl?: string): Env {
  return {
    APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY,
    ...(llmUrl !== undefined
      ? { APIGOVSCAN_LLM_BASE_URL: llmUrl, APIGOVSCAN_LLM_MODEL: "stub" }
      : {}),
  };
}

async function firstFingerprint(dir: string): Promise<string> {
  const out = await runCapture(
    ["analyze", "openapi.yaml", "--format", "json", "--no-color"],
    { cwd: dir, env: licEnv() },
  );
  expect(out.code).toBe(0);
  const report = JSON.parse(out.stdout) as {
    findings: Array<{ fingerprint: string }>;
  };
  expect(report.findings.length).toBeGreaterThan(0);
  return report.findings[0]!.fingerprint;
}

describe("fix command e2e (f8-suggest-fix)", () => {
  it("AC-SF.3 analyze is byte-identical with or without llm configured", async () => {
    const dir = licensedDir();
    const dead = { ...licEnv(), APIGOVSCAN_LLM_BASE_URL: "http://127.0.0.1:1" };
    const plain = await runCapture(
      ["analyze", "openapi.yaml", "--format", "json", "--no-color"],
      { cwd: dir, env: licEnv() },
    );
    const withLlm = await runCapture(
      ["analyze", "openapi.yaml", "--format", "json", "--no-color"],
      { cwd: dir, env: dead },
    );
    expect(plain.code).toBe(0);
    expect(withLlm.code).toBe(0);
    const a = JSON.parse(plain.stdout) as { reportHash: string };
    const b = JSON.parse(withLlm.stdout) as { reportHash: string };
    expect(a.reportHash).toBe(b.reportHash);
  });

  it("AC-SF.4 fix without llm config exits 2 with llm.baseUrl guidance", async () => {
    const dir = licensedDir();
    const out = await runCapture(["fix", "openapi.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("llm not configured");
    expect(out.stderr).toContain("llm.baseUrl");
  });

  it("AC-SF.5 fix prints the proposed unified diff and never writes", async () => {
    const dir = licensedDir();
    const stub = await startLlmStub();
    try {
      const before = readFileSync(join(dir, "openapi.yaml"), "utf8");
      const out = await runCapture(["fix", "openapi.yaml"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(out.stdout).toContain("--- a/openapi.yaml");
      expect(out.stdout).toContain("+++ b/openapi.yaml");
      expect(out.stdout).toContain("explanation:");
      expect(out.stdout).toContain("confidence: high (LLM-declared)");
      expect(stub.requests.length).toBeGreaterThan(0);
      const after = readFileSync(join(dir, "openapi.yaml"), "utf8");
      expect(after).toBe(before);
    } finally {
      await stub.close();
    }
  });

  it("AC-SF.6 --fingerprint limits to one finding; unknown/malformed fail", async () => {
    const dir = licensedDir();
    const stub = await startLlmStub();
    try {
      const fp = await firstFingerprint(dir);
      const out = await runCapture(
        ["fix", "openapi.yaml", "--fingerprint", fp],
        { cwd: dir, env: licEnv(stub.url) },
      );
      expect(out.code).toBe(0);
      expect(out.stdout.split("confidence:").length).toBe(2);
      expect(out.stdout).toContain(fp.slice(0, 8));

      const missing = await runCapture(
        ["fix", "openapi.yaml", "--fingerprint", "b".repeat(64)],
        { cwd: dir, env: licEnv(stub.url) },
      );
      expect(missing.code).toBe(2);
      expect(missing.stderr).toContain("finding not found");

      const malformed = await runCapture(
        ["fix", "openapi.yaml", "--fingerprint", "nope"],
        { cwd: dir, env: licEnv(stub.url) },
      );
      expect(malformed.code).toBe(2);
      expect(malformed.stderr).toContain("invalid fingerprint");
    } finally {
      await stub.close();
    }
  });

  it("AC-SF.7 secrets in the spec never reach the LLM request body", async () => {
    const dir = tempDir();
    const tainted = readFileSync(petstore, "utf8").replace(
      /description: /g,
      "description: key AKIAIOSFODNN7EXAMPLE ",
    );
    writeFileSync(join(dir, "openapi.yaml"), tainted, "utf8");
    const stub = await startLlmStub();
    try {
      const out = await runCapture(["fix", "openapi.yaml"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(stub.requests.length).toBeGreaterThan(0);
      for (const req of stub.requests) {
        expect(req.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
      }
    } finally {
      await stub.close();
    }
  });

  it("fix on a clean spec reports no fixable findings", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "openapi.yaml"),
      [
        "openapi: 3.1.0",
        "info:",
        "  title: Clean",
        "  version: 1.0.0",
        "paths: {}",
        "",
      ].join("\n"),
      "utf8",
    );
    const probe = await runCapture(
      ["analyze", "openapi.yaml", "--format", "json", "--no-color"],
      { cwd: dir, env: licEnv() },
    );
    expect(probe.code).toBe(0);
    const probeReport = JSON.parse(probe.stdout) as {
      findings: Array<{ ruleId: string }>;
    };
    const off = [...new Set(probeReport.findings.map((f) => f.ruleId))]
      .map((id) => `  ${id}: off`)
      .join("\n");
    writeFileSync(join(dir, "apigovscan.yaml"), `rules:\n${off}\n`, "utf8");
    const stub = await startLlmStub();
    try {
      const out = await runCapture(["fix", "openapi.yaml"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(out.stdout).toContain("no fixable findings");
      expect(stub.requests).toHaveLength(0);
    } finally {
      await stub.close();
    }
  });
});
