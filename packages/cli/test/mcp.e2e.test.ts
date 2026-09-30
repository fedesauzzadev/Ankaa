import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@ankaa/mcp";
import { run } from "../src/index.js";
import { createCliMcpHandlers } from "../src/mcp.js";
import { startLlmStub } from "./llm-stub.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const petstore = join(repoRoot, "fixtures", "petstore-mini.yaml");
const malformed = join(repoRoot, "fixtures", "malformed.yaml");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "ankaa-mcp-"));
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

async function connectCli(cwd: string): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const handlers = createCliMcpHandlers(cwd);
  const server = createMcpServer(handlers, {
    cwd,
    name: "ankaa",
    version: "0.0.0-dev",
  });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  return {
    client,
    close: async () => {
      await client.close();
      await server.close();
    },
  };
}

function parseToolText(result: unknown): Record<string, unknown> {
  const r = result as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = r.content?.find((c) => c.type === "text")?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

function setupWorkspace(): string {
  const dir = tempDir();
  writeFileSync(join(dir, "openapi.yaml"), readFileSync(petstore, "utf8"), "utf8");
  return dir;
}

const TEAM_RULE = [
  "id: TEAM-001",
  "category: custom",
  "severity: error",
  'message: "Every operation must accept x-request-id."',
  "fix: Add a required header parameter named x-request-id.",
  "when:",
  "  all:",
  "    - op: method",
  "      in: [get, post, put, patch, delete]",
  "    - not:",
  "        op: headerRequired",
  "        name: x-request-id",
  "        in: request",
].join("\n");

describe("ankaa mcp command", () => {
  it("AC-SRV.2 mcp --help exits 0 and documents tools", async () => {
    const { code, stdout } = await runCapture(["mcp", "--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("analyze_spec");
    expect(stdout).toContain("mcpServers");
    expect(stdout).toContain("explain_finding");
  });

  it("global --help mentions mcp", async () => {
    const { code, stdout } = await runCapture(["--help"]);
    expect(code).toBe(0);
    expect(stdout).toContain("ankaa mcp");
  });
});

describe("MCP tools e2e (f4-mcp-tools)", () => {
  it("AC-T.1 analyze_spec returns summary and findings", async () => {
    const dir = setupWorkspace();
    const { client, close } = await connectCli(dir);
    try {
      const payload = parseToolText(
        await client.callTool({
          name: "analyze_spec",
          arguments: { path: "openapi.yaml" },
        }),
      );
      expect(payload.ok).toBe(true);
      expect(payload.summary).toBeTruthy();
      expect(Array.isArray(payload.findings)).toBe(true);
      expect(payload.reportHash).toMatch(/^[0-9a-f]{64}$/);
      expect(payload.gate).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("AC-GQL.7 analyze_spec analyzes GraphQL SDL with the graphql pack", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "schema.graphql"),
      readFileSync(join(repoRoot, "fixtures", "graphql", "schema.graphql"), "utf8"),
      "utf8",
    );
    const { client, close } = await connectCli(dir);
    try {
      const payload = parseToolText(
        await client.callTool({
          name: "analyze_spec",
          arguments: { path: "schema.graphql" },
        }),
      );
      expect(payload.ok).toBe(true);
      const findings = payload.findings as Array<{ ruleId: string }>;
      expect(findings.map((f) => f.ruleId).sort()).toEqual([
        "GQL-001",
        "GQL-002",
        "GQL-003",
        "GQL-007",
      ]);
    } finally {
      await close();
    }
  });

  it("AC-GR.6 analyze_spec analyzes proto files with the grpc pack", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "pet.proto"),
      readFileSync(join(repoRoot, "fixtures", "grpc", "pet.proto"), "utf8"),
      "utf8",
    );
    const { client, close } = await connectCli(dir);
    try {
      const payload = parseToolText(
        await client.callTool({
          name: "analyze_spec",
          arguments: { path: "pet.proto" },
        }),
      );
      expect(payload.ok).toBe(true);
      const findings = payload.findings as Array<{ ruleId: string }>;
      expect(findings.some((f) => f.ruleId === "GRPC-001")).toBe(true);
    } finally {
      await close();
    }
  });

  it("AC-AS.6 analyze_spec analyzes AsyncAPI with the asyncapi pack", async () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "asyncapi.yaml"),
      readFileSync(join(repoRoot, "fixtures", "asyncapi", "v2.yaml"), "utf8"),
      "utf8",
    );
    const { client, close } = await connectCli(dir);
    try {
      const payload = parseToolText(
        await client.callTool({
          name: "analyze_spec",
          arguments: { path: "asyncapi.yaml" },
        }),
      );
      expect(payload.ok).toBe(true);
      const findings = payload.findings as Array<{ ruleId: string }>;
      expect(findings.map((f) => f.ruleId).sort()).toEqual(["ASYNC-001", "ASYNC-002", "ASYNC-006"]);
    } finally {
      await close();
    }
  });

  it("AC-T.3 analyze_spec fails on malformed spec with isError", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "bad.yaml"), readFileSync(malformed, "utf8"), "utf8");
    const { client, close } = await connectCli(dir);
    try {
      const result = await client.callTool({
        name: "analyze_spec",
        arguments: { path: "bad.yaml" },
      });
      expect(result).toHaveProperty("isError", true);
      const payload = parseToolText(result);
      expect(payload.ok).toBe(false);
      expect(String(payload.error)).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("AC-T.4 list_rules includes elite rules", async () => {
    const dir = setupWorkspace();
    const { client, close } = await connectCli(dir);
    try {
      const payload = parseToolText(await client.callTool({ name: "list_rules", arguments: {} }));
      expect(payload.ok).toBe(true);
      const rules = payload.rules as Array<{ id: string; severity: string }>;
      expect(rules.length).toBeGreaterThan(0);
      expect(rules.some((r) => r.id.startsWith("NAMING-"))).toBe(true);
    } finally {
      await close();
    }
  });

  it("AC-T.5 explain_rule NAMING-004 returns source citation (S5)", async () => {
    const dir = setupWorkspace();
    const { client, close } = await connectCli(dir);
    try {
      const payload = parseToolText(
        await client.callTool({
          name: "explain_rule",
          arguments: { ruleId: "NAMING-004" },
        }),
      );
      expect(payload.ok).toBe(true);
      const explanation = payload.explanation as {
        ruleId: string;
        source?: { title: string; url: string };
        fix?: string;
      };
      expect(explanation.ruleId).toBe("NAMING-004");
      expect(explanation.source?.title).toBeTruthy();
      expect(explanation.source?.url).toBeTruthy();
      expect(explanation.fix).toBeTruthy();
    } finally {
      await close();
    }
  });

  it("AC-T.6 explain_rule unknown id fails", async () => {
    const dir = setupWorkspace();
    const { client, close } = await connectCli(dir);
    try {
      const result = await client.callTool({
        name: "explain_rule",
        arguments: { ruleId: "NOPE-999" },
      });
      expect(result).toHaveProperty("isError", true);
      const payload = parseToolText(result);
      expect(payload.ok).toBe(false);
      expect(String(payload.error)).toContain("not found");
    } finally {
      await close();
    }
  });

  it("AC-T.7 validate_custom_rules valid and invalid files", async () => {
    const dir = setupWorkspace();
    writeFileSync(join(dir, "team.yaml"), TEAM_RULE, "utf8");
    writeFileSync(join(dir, "bad.yaml"), "foo: bar\n", "utf8");
    const { client, close } = await connectCli(dir);
    try {
      const good = parseToolText(
        await client.callTool({
          name: "validate_custom_rules",
          arguments: { files: ["team.yaml"] },
        }),
      );
      expect(good.ok).toBe(true);
      const goodFiles = good.files as Array<{ ok: boolean; ruleCount: number }>;
      expect(goodFiles[0]?.ok).toBe(true);
      expect(goodFiles[0]?.ruleCount).toBe(1);

      const bad = parseToolText(
        await client.callTool({
          name: "validate_custom_rules",
          arguments: { files: ["bad.yaml"] },
        }),
      );
      expect(bad.ok).toBe(false);
      const badFiles = bad.files as Array<{
        ok: boolean;
        error?: string;
        errors?: unknown[];
      }>;
      expect(badFiles[0]?.ok).toBe(false);
    } finally {
      await close();
    }
  });

  it("AC-T.8–9 explain_finding roundtrip and missing fingerprint", async () => {
    const dir = setupWorkspace();
    const reportPath = join(dir, "report.json");
    const { client, close } = await connectCli(dir);
    try {
      await runCapture(["analyze", "openapi.yaml", "--format", "json", "--output", "report.json"], {
        cwd: dir,
      });
      const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
        findings: Array<{ fingerprint: string; ruleId: string }>;
      };
      expect(report.findings.length).toBeGreaterThan(0);
      const fp = report.findings[0]!.fingerprint;

      const payload = parseToolText(
        await client.callTool({
          name: "explain_finding",
          arguments: { reportPath: "report.json", fingerprint: fp },
        }),
      );
      expect(payload.ok).toBe(true);
      const finding = payload.finding as { fingerprint: string; ruleId: string };
      expect(finding.fingerprint).toBe(fp);
      expect(payload.explanation).toBeTruthy();

      const prefixed = parseToolText(
        await client.callTool({
          name: "explain_finding",
          arguments: { reportPath: "report.json", fingerprint: fp.slice(0, 12) },
        }),
      );
      expect(prefixed.ok).toBe(true);
      expect((prefixed.finding as { fingerprint: string }).fingerprint).toBe(fp);

      const missing = await client.callTool({
        name: "explain_finding",
        arguments: {
          reportPath: "report.json",
          fingerprint: "a".repeat(64),
        },
      });
      expect(missing).toHaveProperty("isError", true);
      const missingPayload = parseToolText(missing);
      expect(String(missingPayload.error)).toContain("finding not found");
    } finally {
      await close();
    }
  });

  it("AC-T.10 parity: CLI reportHash matches analyze_spec", async () => {
    const dir = setupWorkspace();
    const { client, close } = await connectCli(dir);
    try {
      const cli = await runCapture(
        ["analyze", "openapi.yaml", "--format", "json", "--output", "cli.json"],
        { cwd: dir },
      );
      expect([0, 1]).toContain(cli.code);
      const cliReport = JSON.parse(readFileSync(join(dir, "cli.json"), "utf8")) as {
        reportHash: string;
        score: { value: number; grade: string };
      };

      const payload = parseToolText(
        await client.callTool({
          name: "analyze_spec",
          arguments: { path: "openapi.yaml" },
        }),
      );
      expect(payload.reportHash).toBe(cliReport.reportHash);
      expect(payload.score).toEqual(cliReport.score);
      expect(payload.summary).toEqual((cliReport as unknown as { summary: unknown }).summary);
    } finally {
      await close();
    }
  });

  it("AC-SRV.5 INV-1: analyze_spec succeeds with fetch stubbed to throw", async () => {
    const dir = setupWorkspace();
    const original = globalThis.fetch;
    globalThis.fetch = (() => {
      throw new Error("network disabled (INV-1)");
    }) as typeof fetch;
    try {
      const { client, close } = await connectCli(dir);
      try {
        const payload = parseToolText(
          await client.callTool({
            name: "analyze_spec",
            arguments: { path: "openapi.yaml" },
          }),
        );
        expect(payload.ok).toBe(true);
        expect(payload.summary).toBeTruthy();
      } finally {
        await close();
      }
    } finally {
      globalThis.fetch = original;
    }
  });

  it("AC-T.11 custom rules via rules input affect analyze_spec", async () => {
    const dir = setupWorkspace();
    writeFileSync(join(dir, "team.yaml"), TEAM_RULE, "utf8");
    const { client, close } = await connectCli(dir);
    try {
      const payload = parseToolText(
        await client.callTool({
          name: "analyze_spec",
          arguments: { path: "openapi.yaml", rules: ["team.yaml"] },
        }),
      );
      expect(payload.ok).toBe(true);
      const findings = payload.findings as Array<{ ruleId: string }>;
      expect(findings.some((f) => f.ruleId === "TEAM-001")).toBe(true);
      const packs = payload.packs as Array<{ id: string }>;
      expect(packs.some((p) => p.id === "elite")).toBe(true);
    } finally {
      await close();
    }
  });

  it("S5: analyze_spec then explain_rule yields cited standard", async () => {
    const dir = setupWorkspace();
    mkdirSync(join(dir, ".ankaa"), { recursive: true });
    const { client, close } = await connectCli(dir);
    try {
      const analysis = parseToolText(
        await client.callTool({
          name: "analyze_spec",
          arguments: { path: "openapi.yaml" },
        }),
      );
      expect(analysis.ok).toBe(true);

      const explainPayload = parseToolText(
        await client.callTool({
          name: "explain_rule",
          arguments: { ruleId: "NAMING-004" },
        }),
      );
      expect(explainPayload.ok).toBe(true);
      const source = (explainPayload.explanation as { source?: { url: string } }).source;
      expect(source?.url).toMatch(/^https?:\/\//);
    } finally {
      await close();
    }
  });
});

describe("MCP suggest_fix (f8-suggest-fix)", () => {
  function llmEnv(): Record<string, string | undefined> {
    return {
      ANKAA_LLM_BASE_URL: process.env.ANKAA_LLM_BASE_URL,
      ANKAA_LLM_API_KEY: process.env.ANKAA_LLM_API_KEY,
      ANKAA_LLM_MODEL: process.env.ANKAA_LLM_MODEL,
    };
  }

  function clearLlmEnv(): void {
    delete process.env.ANKAA_LLM_BASE_URL;
    delete process.env.ANKAA_LLM_API_KEY;
    delete process.env.ANKAA_LLM_MODEL;
  }

  function restoreLlmEnv(saved: Record<string, string | undefined>): void {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }

  async function analyzeToReport(dir: string): Promise<string> {
    const out = await runCapture(
      ["analyze", "openapi.yaml", "--format", "json", "--output", "report.json"],
      { cwd: dir },
    );
    expect([0, 1]).toContain(out.code);
    const report = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as {
      findings: Array<{ fingerprint: string }>;
    };
    expect(report.findings.length).toBeGreaterThan(0);
    return report.findings[0]!.fingerprint;
  }

  it("AC-SF.8 suggest_fix returns patch, explanation and confidence", async () => {
    const saved = llmEnv();
    const dir = setupWorkspace();
    const stub = await startLlmStub();
    const { client, close } = await connectCli(dir);
    try {
      process.env.ANKAA_LLM_BASE_URL = stub.url;
      process.env.ANKAA_LLM_MODEL = "stub";
      const fp = await analyzeToReport(dir);
      const payload = parseToolText(
        await client.callTool({
          name: "suggest_fix",
          arguments: { reportPath: "report.json", fingerprint: fp },
        }),
      );
      expect(payload.ok).toBe(true);
      expect(payload.fingerprint).toBe(fp);
      expect(String(payload.patch)).toContain("--- a/openapi.yaml");
      expect(String(payload.patch)).toContain("+++ b/openapi.yaml");
      expect(String(payload.explanation)).toBeTruthy();
      expect(["low", "medium", "high"]).toContain(payload.confidence);
    } finally {
      restoreLlmEnv(saved);
      await close();
      await stub.close();
    }
  });

  it("AC-SF.8 suggest_fix without LLM configured is an error", async () => {
    const saved = llmEnv();
    const dir = setupWorkspace();
    const { client, close } = await connectCli(dir);
    try {
      clearLlmEnv();
      const fp = await analyzeToReport(dir);
      const result = await client.callTool({
        name: "suggest_fix",
        arguments: { reportPath: "report.json", fingerprint: fp },
      });
      expect(result).toHaveProperty("isError", true);
      const payload = parseToolText(result);
      expect(payload.ok).toBe(false);
      expect(String(payload.error)).toContain("llm not configured");
    } finally {
      restoreLlmEnv(saved);
      await close();
    }
  });

  it("AC-SF.8 suggest_fix with invalid LLM output fails honestly", async () => {
    const saved = llmEnv();
    const dir = setupWorkspace();
    const stub = await startLlmStub({
      response: {
        choices: [{ message: { content: "not a diff at all" } }],
      },
    });
    const { client, close } = await connectCli(dir);
    try {
      process.env.ANKAA_LLM_BASE_URL = stub.url;
      process.env.ANKAA_LLM_MODEL = "stub";
      const fp = await analyzeToReport(dir);
      const result = await client.callTool({
        name: "suggest_fix",
        arguments: { reportPath: "report.json", fingerprint: fp },
      });
      expect(result).toHaveProperty("isError", true);
      const payload = parseToolText(result);
      expect(payload.ok).toBe(false);
      expect(String(payload.error)).toContain("could not produce a valid patch");
    } finally {
      restoreLlmEnv(saved);
      await close();
      await stub.close();
    }
  });

  it("AC-SF.8 suggest_fix missing reportPath and bad fingerprints fail", async () => {
    const saved = llmEnv();
    const dir = setupWorkspace();
    const stub = await startLlmStub();
    const { client, close } = await connectCli(dir);
    try {
      process.env.ANKAA_LLM_BASE_URL = stub.url;
      process.env.ANKAA_LLM_MODEL = "stub";
      const fp = await analyzeToReport(dir);

      const prefixed = parseToolText(
        await client.callTool({
          name: "suggest_fix",
          arguments: { reportPath: "report.json", fingerprint: fp.slice(0, 12) },
        }),
      );
      expect(prefixed.ok).toBe(true);
      expect(prefixed.fingerprint).toBe(fp);

      const noReport = await client.callTool({
        name: "suggest_fix",
        arguments: { fingerprint: "a".repeat(64) },
      });
      expect(noReport).toHaveProperty("isError", true);
      expect(String(parseToolText(noReport).error)).toContain("reportPath");

      const missing = await client.callTool({
        name: "suggest_fix",
        arguments: { reportPath: "report.json", fingerprint: "a".repeat(64) },
      });
      expect(missing).toHaveProperty("isError", true);
      expect(String(parseToolText(missing).error)).toContain("finding not found");

      const malformed = await client.callTool({
        name: "suggest_fix",
        arguments: { reportPath: "report.json", fingerprint: "nope" },
      });
      expect(malformed).toHaveProperty("isError", true);
      expect(String(parseToolText(malformed).error)).toContain("invalid fingerprint");
    } finally {
      restoreLlmEnv(saved);
      await close();
      await stub.close();
    }
  });
});
