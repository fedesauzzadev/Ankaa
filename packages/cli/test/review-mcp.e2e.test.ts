import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { createMcpServer } from "@apigovscan/mcp";
import { DEV_LICENSE_KEY } from "../src/license.js";
import { run } from "../src/index.js";
import { createCliMcpHandlers } from "../src/mcp.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

const tempRoots: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "apigovscan-review-mcp-"));
  tempRoots.push(dir);
  return dir;
}

afterAll(() => {
  for (const dir of tempRoots) {
    rmSync(dir, { recursive: true, force: true });
  }
});

async function connect(
  cwd: string,
  maxFindings?: number,
): Promise<{
  client: Client;
  close: () => Promise<void>;
}> {
  const handlers = createCliMcpHandlers(cwd);
  const server = createMcpServer(handlers, {
    cwd,
    name: "apigovscan",
    version: "0.0.0-dev",
    ...(maxFindings !== undefined ? { maxFindings } : {}),
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

async function callReview(
  client: Client,
  args: { baselinePath: string; candidatePath: string; failOn?: string },
): Promise<{ isError?: boolean; payload: Record<string, unknown> }> {
  const result = (await client.callTool({
    name: "review_api_change",
    arguments: args,
  })) as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = result.content?.find((c) => c.type === "text")?.text ?? "{}";
  return { isError: result.isError, payload: JSON.parse(text) as Record<string, unknown> };
}

async function runCliReview(
  cwd: string,
  baseline: string,
  candidate: string,
): Promise<Record<string, unknown>> {
  let stdout = "";
  const code = await run(["node", "cli", "review", baseline, candidate, "--format", "json"], {
    stdout: (t) => {
      stdout += t;
    },
    stderr: () => {},
    env: { APIGOVSCAN_LICENSE_KEY: DEV_LICENSE_KEY },
    cwd,
    isTTY: false,
  });
  expect(code, stdout).toBe(1);
  return JSON.parse(stdout) as Record<string, unknown>;
}

function fixture(path: string): string {
  return [
    "openapi: 3.1.0",
    "info:",
    "  title: Users",
    "  version: 1.0.0",
    "paths:",
    `  ${path}:`,
    "    get:",
    "      operationId: getUser",
    "      responses:",
    '        "200":',
    "          description: OK",
    "",
  ].join("\n");
}

describe("MCP review_api_change (f14 M14.2)", () => {
  it("AC-14.7 parity: same reportHash, outcome and findings as the CLI review", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "base.yaml"), fixture("/users"), "utf8");
    writeFileSync(join(dir, "candidate.yaml"), fixture("/user"), "utf8");

    const cli = await runCliReview(dir, "base.yaml", "candidate.yaml");
    const { client, close } = await connect(dir);
    try {
      const { payload } = await callReview(client, {
        baselinePath: "base.yaml",
        candidatePath: "candidate.yaml",
      });
      expect(payload.ok).toBe(true);
      expect(payload.outcome).toBe(cli.outcome);
      expect(payload.reportHash).toBe(cli.reportHash);
      expect(payload.comparison).toEqual(cli.comparison);
      expect(payload.summary).toEqual(cli.summary);
      const findings = payload.findings as Array<{ ruleId: string; fingerprint: string }>;
      expect(findings.map((f) => f.ruleId)).toEqual(
        (cli.findings as Array<{ ruleId: string }>).map((f) => f.ruleId),
      );
      expect(payload.totalFindings).toBe(findings.length);
      expect(payload.truncated).toBeUndefined();
      expect((findings[0] as Record<string, unknown>).fingerprint).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await close();
    }
  });

  it("AC-14.7 declares truncation with totalFindings, truncated and reportHash", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "base.yaml"), fixture("/users"), "utf8");
    writeFileSync(join(dir, "candidate.yaml"), fixture("/user"), "utf8");

    const { client, close } = await connect(dir, 2);
    try {
      const { payload } = await callReview(client, {
        baselinePath: "base.yaml",
        candidatePath: "candidate.yaml",
      });
      const findings = payload.findings as unknown[];
      expect(findings.length).toBe(2);
      expect(payload.truncated).toBe(true);
      expect(payload.totalFindings as number).toBeGreaterThan(2);
      expect(payload.note).toContain("truncated");
      expect(payload.reportHash).toMatch(/^[0-9a-f]{64}$/);
    } finally {
      await close();
    }
  });

  it("AC-14.7 rejects paths that escape the cwd sandbox", async () => {
    const dir = tempDir();
    const { client, close } = await connect(dir);
    try {
      const { isError, payload } = await callReview(client, {
        baselinePath: "../outside.yaml",
        candidatePath: "candidate.yaml",
      });
      expect(isError).toBe(true);
      expect(payload.error).toContain("path escapes cwd sandbox");
    } finally {
      await close();
    }
  });

  it("AC-14.8 re-evaluates on every call; never reports a stale review", async () => {
    const dir = tempDir();
    writeFileSync(join(dir, "base.yaml"), fixture("/users"), "utf8");
    writeFileSync(join(dir, "candidate.yaml"), fixture("/user"), "utf8");

    const { client, close } = await connect(dir);
    try {
      const first = await callReview(client, {
        baselinePath: "base.yaml",
        candidatePath: "candidate.yaml",
      });
      expect(first.payload.outcome).toBe("findings");
      expect(
        (first.payload.findings as Array<{ ruleId: string }>).some((f) =>
          f.ruleId.startsWith("BRK-"),
        ),
      ).toBe(true);

      writeFileSync(join(dir, "candidate.yaml"), fixture("/users"), "utf8");
      const second = await callReview(client, {
        baselinePath: "base.yaml",
        candidatePath: "candidate.yaml",
      });
      expect(
        (second.payload.findings as Array<{ ruleId: string }>).some((f) =>
          f.ruleId.startsWith("BRK-"),
        ),
      ).toBe(false);
      expect(second.payload.reportHash).not.toBe(first.payload.reportHash);
    } finally {
      await close();
    }
  });

  it("returns the unsupported-comparison review, never a clean outcome", async () => {
    const dir = tempDir();
    const graphql = join(repoRoot, "fixtures", "graphql", "schema.graphql");
    writeFileSync(join(dir, "base.graphql"), readFileSync(graphql));
    writeFileSync(join(dir, "candidate.graphql"), readFileSync(graphql));

    const { client, close } = await connect(dir);
    try {
      const { isError, payload } = await callReview(client, {
        baselinePath: "base.graphql",
        candidatePath: "candidate.graphql",
      });
      expect(isError).toBeUndefined();
      expect(payload.outcome).toBe("error");
      expect(payload.comparison).toMatchObject({ supported: false });
      expect((payload.findings as unknown[]).length).toBeGreaterThan(0);
      expect(payload.note).toContain("comparison unsupported");
    } finally {
      await close();
    }
  });

  it("fails honestly on missing inputs", async () => {
    const dir = tempDir();
    const { client, close } = await connect(dir);
    try {
      const { isError, payload } = await callReview(client, {
        baselinePath: "missing.yaml",
        candidatePath: "also-missing.yaml",
      });
      expect(isError).toBe(true);
      expect(payload.error).toContain("input not found");
    } finally {
      await close();
    }
  });
});
