import { describe, expect, it } from "vitest";
import { createLspServer, frame, parseFrames, type LspAnalyzeResult } from "../src/index.js";

interface Notification {
  method: string;
  params: unknown;
}

function rpcMessage(method: string, params?: unknown, id?: number): string {
  return frame(
    JSON.stringify({
      jsonrpc: "2.0",
      ...(id !== undefined ? { id } : {}),
      method,
      ...(params !== undefined ? { params } : {}),
    }),
  );
}

interface Harness {
  out: string[];
  notifications: Notification[];
  responses: Array<{ id: number; result: unknown; error?: { code: number } }>;
  analyzeCalls: string[];
  server: ReturnType<typeof createLspServer>;
  analyzeResult: (content: string) => LspAnalyzeResult;
}

function createHarness(
  analyzeResult: (content: string) => LspAnalyzeResult,
  debounceMs = 20,
): Harness {
  const notifications: Notification[] = [];
  const responses: Array<{ id: number; result: unknown; error?: { code: number } }> = [];
  const analyzeCalls: string[] = [];
  const server = createLspServer({
    analyze: async (content) => {
      analyzeCalls.push(content);
      return analyzeResult(content);
    },
    send: (text) => {
      const match = /^Content-Length: \d+\r\n\r\n([\s\S]*)$/.exec(text);
      if (match === null) return;
      const message = JSON.parse(match[1]!) as {
        method?: string;
        id?: number;
        result?: unknown;
        error?: { code: number };
      };
      if (message.method !== undefined && message.id === undefined) {
        notifications.push({ method: message.method, params: message.params });
      } else if (message.id !== undefined) {
        responses.push({ id: message.id, result: message.result, error: message.error });
      }
    },
    debounceMs,
  });
  return { out: [], notifications, responses, analyzeCalls, server, analyzeResult };
}

async function waitFor<T>(probe: () => T | undefined, ms = 2000): Promise<T> {
  const deadline = Date.now() + ms;
  for (;;) {
    const value = probe();
    if (value !== undefined) return value;
    if (Date.now() > deadline) throw new Error("waitFor: condition not met");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

const GOOD = "openapi: 3.1.0";
const DIAGNOSTICS: LspAnalyzeResult = {
  ok: true,
  diagnostics: [
    {
      ruleId: "NAMING-001",
      severity: "warning",
      message: "Resource path segments should be plural nouns.",
      location: "/paths/~1user/get",
      position: { line: 12, column: 5 },
    },
    {
      ruleId: "DOC-003",
      severity: "info",
      message: "Consider adding a description.",
      location: "/info",
    },
  ],
};

describe("parseFrames (framing)", () => {
  it("parses one frame and keeps the remainder", () => {
    const body = JSON.stringify({ jsonrpc: "2.0", method: "x" });
    const framed = frame(body);
    const bytes = new TextEncoder().encode(framed + framed.slice(0, 5));
    const { messages, rest } = parseFrames(bytes);
    expect(messages).toHaveLength(1);
    expect(messages[0]!.method).toBe("x");
    expect(rest.length).toBe(5);
  });

  it("survives byte-by-byte feeding", () => {
    const framed = frame(JSON.stringify({ jsonrpc: "2.0", method: "y" }));
    const bytes = new TextEncoder().encode(framed);
    let state = new Uint8Array(0);
    let count = 0;
    for (const byte of bytes) {
      const merged = new Uint8Array(state.length + 1);
      merged.set(state, 0);
      merged[state.length] = byte;
      const parsed = parseFrames(merged);
      count += parsed.messages.length;
      state = parsed.rest;
    }
    expect(count).toBe(1);
    expect(state.length).toBe(0);
  });
});

describe("createLspServer (AC-LSP.*)", () => {
  it("initialize responds with minimal capabilities", () => {
    const h = createHarness(() => DIAGNOSTICS);
    h.server.handle(rpcMessage("initialize", {}, 1));
    expect(h.responses).toHaveLength(1);
    const result = h.responses[0]!.result as {
      capabilities: Record<string, unknown>;
      serverInfo: { name: string };
    };
    expect(result.serverInfo.name).toBe("ankaa");
    expect(result.capabilities.positionEncoding).toBe("utf-16");
  });

  it("unknown request gets -32601; unknown notifications are ignored", () => {
    const h = createHarness(() => DIAGNOSTICS);
    h.server.handle(rpcMessage("workspace/symbol", {}, 7));
    expect(h.responses[0]!.error?.code).toBe(-32601);
    h.server.handle(rpcMessage("$/cancelRequest", {}));
    expect(h.notifications).toHaveLength(0);
  });

  it("didOpen publishes diagnostics with ranges and severity mapping (AC-LSP.1)", async () => {
    const h = createHarness(() => DIAGNOSTICS);
    h.server.handle(rpcMessage("initialize", {}, 1));
    h.server.handle(rpcMessage("initialized"));
    h.server.handle(
      rpcMessage("textDocument/didOpen", {
        textDocument: { uri: "file:///spec.yaml", languageId: "yaml", text: GOOD },
      }),
    );
    const params = (await waitFor(() =>
      h.notifications.find((n) => n.method === "textDocument/publishDiagnostics"),
    ))!.params as {
      uri: string;
      diagnostics: Array<{
        range: unknown;
        severity: number;
        code: string;
        source: string;
        message: string;
      }>;
    };
    expect(params.uri).toBe("file:///spec.yaml");
    expect(params.diagnostics).toHaveLength(2);
    const [withPosition, without] = params.diagnostics;
    expect(without!.range).toEqual({
      start: { line: 0, character: 0 },
      end: { line: 0, character: 0 },
    });
    expect(withPosition!.range).toEqual({
      start: { line: 11, character: 4 },
      end: { line: 11, character: 4 },
    });
    expect(withPosition!.severity).toBe(2);
    expect(without!.severity).toBe(3);
    expect(params.diagnostics.every((d) => d.source === "ankaa")).toBe(true);
    expect(params.diagnostics.map((d) => d.code)).toEqual(["NAMING-001", "DOC-003"]);
  });

  it("didChange debounces: rapid edits analyze once with final content (AC-LSP.2)", async () => {
    const h = createHarness(() => DIAGNOSTICS, 30);
    h.server.handle(rpcMessage("initialize", {}, 1));
    h.server.handle(
      rpcMessage("textDocument/didOpen", {
        textDocument: { uri: "file:///spec.yaml", languageId: "yaml", text: GOOD },
      }),
    );
    await waitFor(() => (h.analyzeCalls.length >= 1 ? true : undefined));
    h.server.handle(
      rpcMessage("textDocument/didChange", {
        textDocument: { uri: "file:///spec.yaml", version: 2 },
        contentChanges: [{ text: "openapi: 3.1.0\n# a" }],
      }),
    );
    h.server.handle(
      rpcMessage("textDocument/didChange", {
        textDocument: { uri: "file:///spec.yaml", version: 3 },
        contentChanges: [{ text: "openapi: 3.1.0\n# b" }],
      }),
    );
    await waitFor(() => (h.analyzeCalls.includes("openapi: 3.1.0\n# b") ? true : undefined));
    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(h.analyzeCalls).toEqual([GOOD, "openapi: 3.1.0\n# b"]);
  });

  it("identical content never re-analyzes (cache por hash de contenido)", async () => {
    const h = createHarness(() => DIAGNOSTICS, 5);
    h.server.handle(rpcMessage("initialize", {}, 1));
    const open = rpcMessage("textDocument/didOpen", {
      textDocument: { uri: "file:///s.yaml", languageId: "yaml", text: GOOD },
    });
    h.server.handle(open);
    await waitFor(() => (h.analyzeCalls.length >= 1 ? true : undefined));
    h.server.handle(
      rpcMessage("textDocument/didSave", { textDocument: { uri: "file:///s.yaml" }, text: GOOD }),
    );
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(h.analyzeCalls).toHaveLength(1);
  });

  it("parse failure publishes an honest PARSE diagnostic, no crash (AC-LSP.3)", async () => {
    const h = createHarness((_content) => ({
      ok: false,
      parseError: "YAML_PARSE: bad indentation",
      diagnostics: [],
    }));
    h.server.handle(rpcMessage("initialize", {}, 1));
    h.server.handle(
      rpcMessage("textDocument/didOpen", {
        textDocument: { uri: "file:///broken.yaml", languageId: "yaml", text: ":::" },
      }),
    );
    const params = (await waitFor(() =>
      h.notifications.find((n) => n.method === "textDocument/publishDiagnostics"),
    ))!.params as { diagnostics: Array<{ code: string; severity: number; message: string }> };
    expect(params.diagnostics).toHaveLength(1);
    expect(params.diagnostics[0]!.code).toBe("PARSE");
    expect(params.diagnostics[0]!.severity).toBe(1);
    expect(params.diagnostics[0]!.message).toContain("YAML_PARSE");
  });

  it("same buffer analyzed twice yields identical diagnostics (AC-LSP.5)", async () => {
    const h = createHarness(() => DIAGNOSTICS);
    const first = await runOnce(h, "file:///a.yaml", "content-1");
    const second = await runOnce(h, "file:///b.yaml", "content-1");
    expect(JSON.stringify(second)).toBe(JSON.stringify(first).replaceAll("a.yaml", "b.yaml"));
  });

  it("shutdown responds null and exit reports code 0", () => {
    const exits: number[] = [];
    const responses: unknown[] = [];
    const server = createLspServer({
      analyze: async () => ({ ok: true, diagnostics: [] }),
      send: (text) => {
        responses.push(JSON.parse(text.replace(/^Content-Length: \d+\r\n\r\n/, "")));
      },
      onExit: (code) => exits.push(code),
    });
    server.handle(rpcMessage("initialize", {}, 1));
    server.handle(rpcMessage("shutdown", undefined, 5));
    expect(responses[1]).toEqual({ jsonrpc: "2.0", id: 5, result: null });
    server.handle(rpcMessage("exit"));
    expect(exits).toEqual([0]);
  });

  it("didClose clears diagnostics", async () => {
    const h = createHarness(() => DIAGNOSTICS);
    h.server.handle(rpcMessage("initialize", {}, 1));
    h.server.handle(
      rpcMessage("textDocument/didOpen", {
        textDocument: { uri: "file:///c.yaml", languageId: "yaml", text: GOOD },
      }),
    );
    await waitFor(() => (h.notifications.length >= 1 ? true : undefined));
    h.server.handle(rpcMessage("textDocument/didClose", { textDocument: { uri: "file:///c.yaml" } }));
    const last = h.notifications[h.notifications.length - 1]!;
    expect(last.method).toBe("textDocument/publishDiagnostics");
    expect((last.params as { diagnostics: unknown[] }).diagnostics).toEqual([]);
  });
});

async function runOnce(
  h: Harness,
  uri: string,
  content: string,
): Promise<unknown> {
  h.server.handle(
    rpcMessage("textDocument/didOpen", {
      textDocument: { uri, languageId: "yaml", text: content },
    }),
  );
  const notification = await waitFor(() =>
    h.notifications.find(
      (n) => n.method === "textDocument/publishDiagnostics" && (n.params as { uri: string }).uri === uri,
    ),
  );
  return notification.params;
}
