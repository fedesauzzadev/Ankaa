export interface LspSourcePosition {
  line: number;
  column: number;
}

export interface LspDiagnosticInput {
  ruleId: string;
  severity: "error" | "warning" | "info";
  message: string;
  location: string;
  position?: LspSourcePosition;
}

export interface LspAnalyzeResult {
  ok: boolean;
  parseError?: string;
  diagnostics: LspDiagnosticInput[];
}

export interface LspServerOptions {
  analyze: (content: string, languageId: string, uri: string) => Promise<LspAnalyzeResult>;
  send: (text: string) => void;
  debounceMs?: number;
  onExit?: (code: number) => void;
  onError?: (err: unknown) => void;
}

export interface LspServer {
  handle(chunk: Uint8Array | string): void;
  dispose(): void;
}

interface JsonRpcMessage {
  jsonrpc?: string;
  id?: number | string;
  method?: string;
  params?: unknown;
}

interface TextDocumentIdentifier {
  uri?: string;
  languageId?: string;
  text?: string;
  version?: number;
}

const DEFAULT_DEBOUNCE_MS = 300;
const LSP_SEVERITY = { error: 1, warning: 2, info: 3 } as const;

function utf8Decode(bytes: Uint8Array): string {
  return new TextDecoder("utf-8").decode(bytes);
}

function frame(body: string): string {
  return `Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Parse complete frames out of an accumulating buffer (LSP over stdio). */
export function parseFrames(buffer: Uint8Array): {
  messages: JsonRpcMessage[];
  rest: Uint8Array;
} {
  const messages: JsonRpcMessage[] = [];
  let offset = 0;
  let rest = buffer;
  for (;;) {
    const headerEnd = indexOfSubarray(rest, [13, 10, 13, 10], offset);
    if (headerEnd === -1) break;
    const headerText = utf8Decode(rest.subarray(offset, headerEnd));
    const match = /Content-Length:\s*(\d+)/i.exec(headerText);
    if (match === null) {
      offset = headerEnd + 4;
      continue;
    }
    const length = Number(match[1]);
    const bodyStart = headerEnd + 4;
    if (rest.length - bodyStart < length) break;
    const body = utf8Decode(rest.subarray(bodyStart, bodyStart + length));
    try {
      const parsed = JSON.parse(body) as unknown;
      if (isRecord(parsed)) {
        messages.push({
          jsonrpc: typeof parsed.jsonrpc === "string" ? parsed.jsonrpc : undefined,
          id: typeof parsed.id === "number" || typeof parsed.id === "string" ? parsed.id : undefined,
          method: typeof parsed.method === "string" ? parsed.method : undefined,
          params: parsed.params,
        });
      }
    } catch {
      // malformed JSON body: skip the frame entirely
    }
    offset = bodyStart + length;
  }
  if (offset > 0) {
    rest = rest.subarray(offset);
  }
  return { messages, rest };
}

function indexOfSubarray(haystack: Uint8Array, needle: number[], from: number): number {
  outer: for (let i = from; i <= haystack.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

interface DocumentState {
  languageId: string;
  content: string;
  timer: ReturnType<typeof setTimeout> | undefined;
  analyzedContent: string | undefined;
}

/**
 * Minimal LSP 3.17 server over stdio: initialize/initialized,
 * didOpen/didChange/didSave, publishDiagnostics, shutdown/exit.
 * Hand-rolled JSON-RPC framing, zero dependencies, INV-1/INV-2 safe.
 */
export function createLspServer(options: LspServerOptions): LspServer {
  const debounceMs = options.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const documents = new Map<string, DocumentState>();
  let buffer: Uint8Array<ArrayBufferLike> = new Uint8Array(0);
  let shutdownSeen = false;
  let disposed = false;

  const respond = (id: number | string, result: unknown): void => {
    options.send(
      frame(JSON.stringify({ jsonrpc: "2.0", id, result })),
    );
  };

  const respondError = (id: number | string, code: number, message: string): void => {
    options.send(
      frame(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } })),
    );
  };

  const notify = (method: string, params: unknown): void => {
    options.send(frame(JSON.stringify({ jsonrpc: "2.0", method, params })));
  };

  const toRange = (position: LspSourcePosition | undefined): {
    start: { line: number; character: number };
    end: { line: number; character: number };
  } => {
    const line = Math.max(0, (position?.line ?? 1) - 1);
    const character = Math.max(0, (position?.column ?? 1) - 1);
    return { start: { line, character }, end: { line, character } };
  };

  const publish = (uri: string, result: LspAnalyzeResult): void => {
    const diagnostics = result.ok
      ? result.diagnostics.map((finding) => ({
          range: toRange(finding.position),
          severity: LSP_SEVERITY[finding.severity],
          code: finding.ruleId,
          source: "ankaa",
          message: finding.message,
        }))
      : [
          {
            range: toRange(undefined),
            severity: 1,
            code: "PARSE",
            source: "ankaa",
            message: result.parseError ?? "cannot parse document",
          },
        ];
    notify("textDocument/publishDiagnostics", { uri, diagnostics });
  };

  const runAnalysis = async (uri: string): Promise<void> => {
    const doc = documents.get(uri);
    if (doc === undefined) return;
    if (doc.analyzedContent === doc.content) return;
    const content = doc.content;
    try {
      const result = await options.analyze(content, doc.languageId, uri);
      const current = documents.get(uri);
      if (current === undefined || current.content !== content) return;
      current.analyzedContent = content;
      publish(uri, result);
    } catch (err) {
      options.onError?.(err);
    }
  };

  const scheduleAnalysis = (uri: string, immediate: boolean): void => {
    const doc = documents.get(uri);
    if (doc === undefined) return;
    if (doc.timer !== undefined) clearTimeout(doc.timer);
    if (immediate) {
      doc.timer = undefined;
      void runAnalysis(uri);
      return;
    }
    doc.timer = setTimeout(() => {
      doc.timer = undefined;
      void runAnalysis(uri);
    }, debounceMs);
  };

  const handleRequest = (message: JsonRpcMessage): void => {
    if (message.id === undefined) return;
    if (message.method === "initialize") {
      shutdownSeen = false;
      respond(message.id, {
        capabilities: {
          positionEncoding: "utf-16",
          textDocumentSync: { openClose: true, change: 1, save: true },
        },
        serverInfo: { name: "ankaa" },
      });
      return;
    }
    if (message.method === "shutdown") {
      shutdownSeen = true;
      respond(message.id, null);
      return;
    }
    respondError(message.id, -32601, `method not found: ${message.method ?? "(none)"}`);
  };

  const handleNotification = (message: JsonRpcMessage): void => {
    if (message.method === "initialized") return;
    if (message.method === "exit") {
      options.onExit?.(shutdownSeen ? 0 : 1);
      return;
    }
    if (message.method === "textDocument/didOpen") {
      const params = isRecord(message.params) ? (message.params.textDocument as unknown) : undefined;
      if (!isRecord(params) || typeof params.uri !== "string") return;
      const uri = params.uri;
      documents.set(uri, {
        languageId: typeof params.languageId === "string" ? params.languageId : "yaml",
        content: typeof params.text === "string" ? params.text : "",
        timer: undefined,
        analyzedContent: undefined,
      });
      scheduleAnalysis(uri, true);
      return;
    }
    if (message.method === "textDocument/didChange") {
      const params = isRecord(message.params) ? message.params : {};
      const textDocument = isRecord(params.textDocument) ? (params.textDocument as TextDocumentIdentifier) : undefined;
      if (textDocument?.uri === undefined || typeof textDocument.uri !== "string") return;
      const changes = Array.isArray(params.contentChanges) ? params.contentChanges : [];
      const last = changes.length > 0 ? changes[changes.length - 1] : undefined;
      if (!isRecord(last) || typeof last.text !== "string") return;
      const doc = documents.get(textDocument.uri);
      if (doc === undefined) return;
      doc.content = last.text;
      scheduleAnalysis(textDocument.uri, false);
      return;
    }
    if (message.method === "textDocument/didSave") {
      const params = isRecord(message.params) ? message.params : {};
      const textDocument = isRecord(params.textDocument) ? (params.textDocument as TextDocumentIdentifier) : undefined;
      if (textDocument?.uri === undefined || typeof textDocument.uri !== "string") return;
      if (typeof params.text === "string") {
        const doc = documents.get(textDocument.uri);
        if (doc !== undefined) doc.content = params.text;
      }
      scheduleAnalysis(textDocument.uri, true);
      return;
    }
    if (message.method === "textDocument/didClose") {
      const params = isRecord(message.params) ? message.params : {};
      const textDocument = isRecord(params.textDocument) ? (params.textDocument as TextDocumentIdentifier) : undefined;
      if (textDocument?.uri === undefined || typeof textDocument.uri !== "string") return;
      const doc = documents.get(textDocument.uri);
      if (doc?.timer !== undefined) clearTimeout(doc.timer);
      documents.delete(textDocument.uri);
      notify("textDocument/publishDiagnostics", {
        uri: textDocument.uri,
        diagnostics: [],
      });
    }
  };

  return {
    handle(chunk: Uint8Array | string): void {
      if (disposed) return;
      const bytes = typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk;
      const merged = new Uint8Array(buffer.length + bytes.length);
      merged.set(buffer, 0);
      merged.set(bytes, buffer.length);
      buffer = merged;
      const { messages, rest } = parseFrames(buffer);
      buffer = rest;
      for (const message of messages) {
        if (message.method !== undefined) {
          if (message.id !== undefined) {
            handleRequest(message);
          } else {
            handleNotification(message);
          }
        }
        // responses from the client are ignored (we issue no requests)
      }
    },
    dispose(): void {
      disposed = true;
      for (const doc of documents.values()) {
        if (doc.timer !== undefined) clearTimeout(doc.timer);
      }
      documents.clear();
    },
  };
}

export { frame };
