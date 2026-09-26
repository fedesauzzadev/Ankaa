import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
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
const demoRepo = join(repoRoot, "fixtures", "drift-demo");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-drift-"));
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

function licEnv(llmUrl?: string): Env {
  return {
    APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY,
    ...(llmUrl !== undefined
      ? { APIGOVSCAN_LLM_BASE_URL: llmUrl, APIGOVSCAN_LLM_MODEL: "stub" }
      : {}),
  };
}

function setupDemo(): string {
  const dir = tempDir();
  mkdirSync(join(dir, "repo"));
  copyFileSync(join(demoRepo, "app.js"), join(dir, "repo", "app.js"));
  copyFileSync(join(demoRepo, "openapi-stale.yaml"), join(dir, "openapi-stale.yaml"));
  return dir;
}

const SHAPE_RESPONSE = [
  { op: "GET /pets", outputChanged: false, confidence: "high", note: "Same shape." },
];

describe("drift command e2e (f8-drift)", () => {
  it("AC-DR.3 stale spec reports missing, removed and changed; exit 1", async () => {
    const dir = setupDemo();
    const out = await runCapture(
      ["drift", "repo", "--spec", "openapi-stale.yaml", "--format", "json"],
      { cwd: dir, env: licEnv() },
    );
    expect(out.code).toBe(1);
    expect(out.stderr).toContain("shape analysis requires llm");
    const report = JSON.parse(out.stdout) as {
      missing: Array<{ method: string; path: string }>;
      removed: Array<{ method: string; path: string }>;
      changed: Array<{ path: string; specMethods: string[]; codeMethods: string[] }>;
      shapeNotes: unknown[];
    };
    expect(report.missing).toEqual([{ method: "GET", path: "/gone" }]);
    expect(report.removed).toEqual([{ method: "DELETE", path: "/extra" }]);
    expect(report.changed).toEqual([
      { path: "/both", specMethods: ["GET", "POST"], codeMethods: ["GET"] },
    ]);
    expect(report.shapeNotes).toEqual([]);
  });

  it("AC-DR.3 console output lists the three sections", async () => {
    const dir = setupDemo();
    const out = await runCapture(["drift", "repo", "--spec", "openapi-stale.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(1);
    expect(out.stdout).toContain("missing (1):");
    expect(out.stdout).toContain("GET /gone");
    expect(out.stdout).toContain("removed (1):");
    expect(out.stdout).toContain("DELETE /extra");
    expect(out.stdout).toContain("changed (1):");
    expect(out.stdout).toContain("/both");
  });

  it("AC-DR.4 clean drift exits 0", async () => {
    const dir = setupDemo();
    const gen = await runCapture(["drift", "repo", "--out", "gen.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(gen.code).toBe(0);
    const out = await runCapture(["drift", "repo", "--spec", "gen.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("no drift detected");
  });

  it("AC-DR.6 without llm the endpoint level is complete", async () => {
    const dir = setupDemo();
    const stub = await startLlmStub({
      response: { choices: [{ message: { content: JSON.stringify(SHAPE_RESPONSE) } }] },
    });
    try {
      const plain = await runCapture(
        ["drift", "repo", "--spec", "openapi-stale.yaml", "--format", "json"],
        { cwd: dir, env: licEnv() },
      );
      const shaped = await runCapture(
        ["drift", "repo", "--spec", "openapi-stale.yaml", "--format", "json"],
        { cwd: dir, env: licEnv(stub.url) },
      );
      expect(plain.code).toBe(1);
      expect(shaped.code).toBe(1);
      const plainReport = JSON.parse(plain.stdout) as { shapeNotes: unknown[] };
      const shapedReport = JSON.parse(shaped.stdout) as {
        shapeNotes: Array<{ op: string; confidence: string }>;
      };
      expect(plainReport.shapeNotes).toEqual([]);
      expect(shapedReport.shapeNotes).toEqual([
        { op: "GET /pets", outputChanged: false, confidence: "high", note: "Same shape." },
      ]);
      expect(stub.requests).toHaveLength(1);
      for (const req of stub.requests) {
        expect(req.body).not.toContain("AKIAIOSFODNN7EXAMPLE");
      }
    } finally {
      await stub.close();
    }
  });

  it("AC-DR.5 sweep fallback feeds unknown frameworks; garbage is honest", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "weird.xyz"), "frobnicator => GET /sweep\n", "utf8");
    const stub = await startLlmStub({
      response: {
        choices: [
          {
            message: {
              content: JSON.stringify([
                { method: "GET", path: "/sweep", confidence: "low", file: "weird.xyz" },
                { method: "POST", path: "/sweep", confidence: "low", file: "weird.xyz" },
              ]),
            },
          },
        ],
      },
    });
    try {
      const out = await runCapture(["drift", ".", "--out", "gen.yaml"], {
        cwd: dir,
        env: licEnv(stub.url),
      });
      expect(out.code).toBe(0);
      expect(out.stdout).toContain("(2 operations)");
      expect(readFileSync(join(dir, "gen.yaml"), "utf8")).toContain("/sweep:");
    } finally {
      await stub.close();
    }

    const dir2 = tempDir();
    writeFileSync(join(dir2, "weird.xyz"), "nothing route-like here\n", "utf8");
    copyFileSync(join(demoRepo, "openapi-stale.yaml"), join(dir2, "openapi-stale.yaml"));
    const garbage = await startLlmStub({
      response: { choices: [{ message: { content: "definitely not json" } }] },
    });
    try {
      const out = await runCapture(
        ["drift", ".", "--spec", "openapi-stale.yaml", "--format", "json"],
        { cwd: dir2, env: licEnv(garbage.url) },
      );
      expect([0, 1]).toContain(out.code);
      expect(out.stderr).toContain("sweep returned no routes");
      JSON.parse(out.stdout);
    } finally {
      await garbage.close();
    }
  });

  it("AC-DR.7 generation writes a parseable skeleton; overwrite needs --force", async () => {
    const dir = setupDemo();
    const out = await runCapture(["drift", "repo", "--out", "gen.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(0);
    expect(out.stdout).toContain("draft written: gen.yaml (4 operations)");
    const text = readFileSync(join(dir, "gen.yaml"), "utf8");
    expect(text).toContain("openapi: 3.1.0");
    expect(text).toContain("getPets");
    expect(text).toContain("deleteExtra");

    const reanalyze = await runCapture(
      ["analyze", "gen.yaml", "--format", "json", "--no-color"],
      { cwd: dir, env: licEnv() },
    );
    expect([0, 1]).toContain(reanalyze.code);
    const report = JSON.parse(reanalyze.stdout) as { operations: unknown };
    expect(report).toHaveProperty("reportHash");

    const again = await runCapture(["drift", "repo", "--out", "gen.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(again.code).toBe(2);
    expect(again.stderr).toContain("output exists");
    expect(again.stderr).toContain("--force");

    const forced = await runCapture(
      ["drift", "repo", "--out", "gen.yaml", "--force"],
      { cwd: dir, env: licEnv() },
    );
    expect(forced.code).toBe(0);
  });

  it("AC-DR.8 gates: license required", async () => {
    const dir = setupDemo();
    const out = await runCapture(["drift", "repo", "--spec", "openapi-stale.yaml"], {
      cwd: dir,
      env: {},
    });
    expect(out.code).toBe(2);
    expect(out.stderr).toContain("missing license");
  });

  it("AC-DR.9 drift mode writes nothing (INV-7)", async () => {
    const dir = setupDemo();
    const before = new Set(readdirSync(dir));
    const out = await runCapture(["drift", "repo", "--spec", "openapi-stale.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(out.code).toBe(1);
    const after = new Set(readdirSync(dir));
    expect([...after].filter((f) => !before.has(f))).toEqual([]);
  });

  it("AC-DR.10 re-runs are byte-identical", async () => {
    const dir = setupDemo();
    const env = licEnv();
    const first = await runCapture(
      ["drift", "repo", "--spec", "openapi-stale.yaml", "--format", "json"],
      { cwd: dir, env },
    );
    const second = await runCapture(
      ["drift", "repo", "--spec", "openapi-stale.yaml", "--format", "json"],
      { cwd: dir, env },
    );
    expect(first.code).toBe(1);
    expect(second.stdout).toBe(first.stdout);
    expect(second.stderr).toBe(first.stderr);
  });

  it("usage errors: missing dir, bad format, unknown option", async () => {
    const dir = setupDemo();
    const missing = await runCapture(["drift", "nope", "--spec", "openapi-stale.yaml"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(missing.code).toBe(2);
    expect(missing.stderr).toContain("drift directory not found");

    const badFormat = await runCapture(
      ["drift", "repo", "--spec", "openapi-stale.yaml", "--format", "yaml"],
      { cwd: dir, env: licEnv() },
    );
    expect(badFormat.code).toBe(2);
    expect(badFormat.stderr).toContain("invalid --format");

    const badFlag = await runCapture(["drift", "repo", "--nope"], {
      cwd: dir,
      env: licEnv(),
    });
    expect(badFlag.code).toBe(2);
    expect(badFlag.stderr).toContain("unknown option");
  });
});
