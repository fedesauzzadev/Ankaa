import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFile } from "node:child_process";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { run } from "../src/index.js";

const execFileAsync = promisify(execFile);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const tempRoots: string[] = [];
function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-export-e2e-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) rmSync(dir, { recursive: true, force: true });
});

describe("export CLI", () => {
  it("exports groups and baseline trends to stdout and the explicit output", async () => {
    const dir = tempDir();
    const fingerprint = "a".repeat(64);
    const finding = {
      fingerprint,
      ruleId: "NAMING-001",
      severity: "warning",
      category: "naming",
      message: "Use plural resource names.",
      location: "openapi.yaml#/paths/~1user/get",
      packId: "elite",
      packVersion: "2026.09.1",
    };
    const report = {
      tool: { name: "ankaa", version: "1.0.0" },
      input: [{ path: "openapi.yaml", sha256: "b".repeat(64) }],
      findings: [finding],
    };
    writeFileSync(join(dir, "current.json"), JSON.stringify(report), "utf8");
    writeFileSync(join(dir, "old.json"), JSON.stringify({ ...report, findings: [] }), "utf8");
    writeFileSync(join(dir, "owners.yaml"), "openapi.yaml: payments\n", "utf8");
    let stdout = "";
    let stderr = "";
    const code = await run(
      [
        "node",
        "cli",
        "export",
        "current.json",
        "--group-by",
        "owners.yaml",
        "--since",
        "old.json",
        "--out",
        "export.json",
      ],
      {
        cwd: dir,
        env: {},
        stdout: (text) => (stdout += text),
        stderr: (text) => (stderr += text),
        isTTY: false,
      },
    );
    expect(code).toBe(0);
    expect(stderr).toBe("");
    const saved = readFileSync(join(dir, "export.json"), "utf8");
    expect(saved).toBe(stdout);
    expect(JSON.parse(saved)).toMatchObject({
      schemaVersion: 1,
      groups: [{ name: "payments", findings: [{ trend: "new", owner: "payments" }] }],
      summary: { total: 1, new: 1, repeated: 0 },
    });
  });

  it("rejects malformed reports and overwrite without force", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "bad.json"), "{}", "utf8");
    let stderr = "";
    const invalid = await run(["node", "cli", "export", "bad.json"], {
      cwd: dir,
      env: {},
      stdout: () => {},
      stderr: (text) => (stderr += text),
      isTTY: false,
    });
    expect(invalid).toBe(2);
    expect(stderr).toContain("not an ankaa report");

    writeFileSync(join(dir, "existing.json"), "keep", "utf8");
    writeFileSync(
      join(dir, "valid.json"),
      JSON.stringify({
        tool: { name: "ankaa", version: "1.0.0" },
        input: [],
        findings: [],
      }),
      "utf8",
    );
    stderr = "";
    const overwrite = await run(["node", "cli", "export", "valid.json", "--out", "existing.json"], {
      cwd: dir,
      env: {},
      stdout: () => {},
      stderr: (text) => (stderr += text),
      isTTY: false,
    });
    expect(overwrite).toBe(2);
    expect(stderr).toContain("--force");
    expect(readFileSync(join(dir, "existing.json"), "utf8")).toBe("keep");
  });

  it("Jira example creates one issue per new finding against a local stub", async () => {
    const dir = tempDir();
    const seen: unknown[] = [];
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => {
        seen.push(JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown);
        res.writeHead(201, { "content-type": "application/json" });
        res.end("{}");
      });
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address !== null ? address.port : 0;
    expect(port).toBeGreaterThan(0);
    const exportData = {
      groups: [
        {
          name: "payments",
          findings: [
            {
              trend: "new",
              ruleId: "NAMING-001",
              severity: "warning",
              message: "Use plural paths.",
              location: "openapi.yaml#/paths",
              apiLocation: "GET /user",
              fingerprint: "a".repeat(64),
            },
            {
              trend: "repeated",
              ruleId: "DOCS-001",
              severity: "info",
              message: "Add summary.",
              location: "openapi.yaml#/paths",
              fingerprint: "b".repeat(64),
            },
          ],
        },
      ],
    };
    const exportPath = join(dir, "export.json");
    writeFileSync(exportPath, JSON.stringify(exportData), "utf8");
    try {
      await execFileAsync(
        process.execPath,
        [join(repoRoot, "examples", "integrations", "jira.mjs"), exportPath],
        {
          env: {
            ...process.env,
            JIRA_BASE_URL: `http://127.0.0.1:${port}`,
            JIRA_PROJECT_KEY: "API",
          },
        },
      );
      expect(seen).toHaveLength(1);
      expect(seen[0]).toMatchObject({
        fields: {
          project: { key: "API" },
          summary: "[Ankaa] NAMING-001: GET /user",
          labels: ["ankaa", "a".repeat(64)],
        },
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
