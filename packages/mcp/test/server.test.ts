import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";
import { createMcpServer, type McpToolHandlers } from "../src/index.js";

const cwd = process.cwd();

function fakeHandlers(overrides?: Partial<McpToolHandlers>): McpToolHandlers {
  const record = <T extends object>(name: string, input: T) => {
    return Promise.resolve({
      payload: { ok: true, tool: name, input },
    });
  };
  return {
    analyzeSpec: (input) => record("analyze_spec", input),
    listRules: (input) => record("list_rules", input),
    explainRule: (input) => record("explain_rule", input),
    validateCustomRules: (input) => record("validate_custom_rules", input),
    explainFinding: (input) => record("explain_finding", input),
    suggestFix: (input) => record("suggest_fix", input),
    ...overrides,
  };
}

type Connected = {
  client: Client;
  close: () => Promise<void>;
};

const open: Array<() => Promise<void>> = [];

async function connect(handlers: McpToolHandlers): Promise<Connected> {
  const server = createMcpServer(handlers, { cwd, version: "0.0.0-dev" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-client", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const close = async () => {
    await client.close();
    await server.close();
  };
  open.push(close);
  return { client, close };
}

afterEach(async () => {
  while (open.length > 0) {
    const close = open.pop();
    if (close) await close();
  }
});

function parseToolText(result: unknown): Record<string, unknown> {
  const r = result as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
  };
  const text = r.content?.find((c) => c.type === "text")?.text ?? "{}";
  return JSON.parse(text) as Record<string, unknown>;
}

describe("createMcpServer (f4-mcp-server)", () => {
  it("AC-SRV.1 lists FR-50 tools plus suggest_fix after initialize", async () => {
    const { client } = await connect(fakeHandlers());
    const tools = await client.listTools();
    const names = tools.tools.map((t) => t.name).sort();
    expect(names).toEqual([
      "analyze_spec",
      "explain_finding",
      "explain_rule",
      "list_rules",
      "suggest_fix",
      "validate_custom_rules",
    ]);
    const analyze = tools.tools.find((t) => t.name === "analyze_spec");
    expect(analyze?.inputSchema).toBeTruthy();
  });

  it("AC-SRV.3 rejects path escapes before calling handlers", async () => {
    let called = false;
    const handlers = fakeHandlers({
      analyzeSpec: (input) => {
        called = true;
        return Promise.resolve({ payload: { ok: true, input } });
      },
    });
    const { client } = await connect(handlers);
    const result = await client.callTool({
      name: "analyze_spec",
      arguments: { path: "../outside.yaml" },
    });
    const payload = parseToolText(result);
    expect(result).toHaveProperty("isError", true);
    expect(payload.ok).toBe(false);
    expect(String(payload.error)).toContain("path escapes cwd sandbox");
    expect(called).toBe(false);
  });

  it("AC-SRV.4 two calls are independent (stateless)", async () => {
    const { client } = await connect(fakeHandlers());
    const a = parseToolText(
      await client.callTool({
        name: "list_rules",
        arguments: {},
      }),
    );
    const b = parseToolText(
      await client.callTool({
        name: "list_rules",
        arguments: {},
      }),
    );
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
  });

  it("truncates analyze_spec findings above maxFindings", async () => {
    const findings = Array.from({ length: 30 }, (_, i) => ({
      ruleId: `R-${i}`,
    }));
    const handlers = fakeHandlers({
      analyzeSpec: () =>
        Promise.resolve({
          payload: {
            ok: true,
            findings,
            totalFindings: 30,
          },
        }),
    });
    const { client } = await connect(handlers);
    const payload = parseToolText(
      await client.callTool({
        name: "analyze_spec",
        arguments: { path: "package.json" },
      }),
    );
    expect(payload.ok).toBe(true);
    expect((payload.findings as unknown[]).length).toBe(20);
    expect(payload.truncated).toBe(true);
    expect(payload.totalFindings).toBe(30);
    expect(String(payload.note)).toContain("use CLI for full report");
  });

  it("passes sandboxed absolute paths to handlers", async () => {
    let seen: { path?: string; files?: string[] } = {};
    const handlers = fakeHandlers({
      analyzeSpec: (input) => {
        seen = { path: input.path };
        return Promise.resolve({ payload: { ok: true } });
      },
      validateCustomRules: (input) => {
        seen = { files: input.files };
        return Promise.resolve({ payload: { ok: true } });
      },
    });
    const { client } = await connect(handlers);
    await client.callTool({
      name: "analyze_spec",
      arguments: { path: "package.json" },
    });
    expect(seen.path).toBeTruthy();
    expect(seen.path?.endsWith("package.json")).toBe(true);

    await client.callTool({
      name: "validate_custom_rules",
      arguments: { files: ["package.json"] },
    });
    expect(seen.files?.[0]?.endsWith("package.json")).toBe(true);
  });
});
