import type {
  ComponentIndex,
  Operation,
  ParseWarning,
  Response,
  SchemaNode,
  Spec,
} from "@ankaa/core";
import { createHash } from "node:crypto";

export interface ParseLimits {
  maxBytes: number;
  maxDepth: number;
  maxAliases: number;
}

export interface ParseError {
  message: string;
  jsonPointer?: string;
  line?: number;
}

export type ParseResult = { ok: true; spec: Spec } | { ok: false; errors: ParseError[] };

export interface ParseOptions {
  sourceLabel: string;
  limits?: Partial<ParseLimits>;
}

export const DEFAULT_LIMITS: ParseLimits = {
  maxBytes: 10_000_000,
  maxDepth: 100,
  maxAliases: 1000,
};

interface Token {
  kind: "ident" | "string" | "number" | "symbol";
  value: string;
  line: number;
  leading: string[];
}

interface ProtoField {
  name: string;
  typeName: string;
  repeated: boolean;
  isMap: boolean;
  description?: string;
}

interface ProtoMessage {
  fullName: string;
  description?: string;
  fields: ProtoField[];
}

interface ProtoEnum {
  fullName: string;
  description?: string;
  values: string[];
}

interface ProtoRpc {
  name: string;
  description?: string;
  deprecated: boolean;
  clientStreaming: boolean;
  serverStreaming: boolean;
  inputType: string;
  outputType: string;
}

interface ProtoService {
  name: string;
  description?: string;
  rpcs: ProtoRpc[];
}

interface ProtoFile {
  pkg: string;
  messages: ProtoMessage[];
  enums: ProtoEnum[];
  services: ProtoService[];
}

const SCALAR_MAP: Record<string, string> = {
  double: "number",
  float: "number",
  int32: "integer",
  int64: "integer",
  uint32: "integer",
  uint64: "integer",
  sint32: "integer",
  sint64: "integer",
  fixed32: "integer",
  fixed64: "integer",
  sfixed32: "integer",
  sfixed64: "integer",
  bool: "boolean",
  string: "string",
  bytes: "string",
};

const FIELD_LABELS = new Set(["repeated", "optional", "required"]);

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function syntaxError(message: string, line: number): Error {
  return new Error(`${message} (line ${line})`);
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const pending: string[] = [];
  let line = 1;
  let i = 0;
  const takePending = (): string[] => {
    const out = [...pending];
    pending.length = 0;
    return out;
  };
  while (i < input.length) {
    const ch = input[i];
    if (ch === "\n") {
      line += 1;
      i += 1;
      continue;
    }
    if (ch === " " || ch === "\t" || ch === "\r" || ch === "\f" || ch === "\v") {
      i += 1;
      continue;
    }
    if (ch === "/" && input[i + 1] === "/") {
      let j = i + 2;
      while (j < input.length && input[j] !== "\n") j += 1;
      const text = input.slice(i + 2, j).trim();
      if (text.length > 0) pending.push(text);
      i = j;
      continue;
    }
    if (ch === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      const raw = end === -1 ? input.slice(i + 2) : input.slice(i + 2, end);
      for (const part of raw.split("\n")) {
        const text = part.replace(/^\s*\*?\s*/, "").trim();
        if (text.length > 0) pending.push(text);
      }
      line += raw.split("\n").length - 1;
      i = end === -1 ? input.length : end + 2;
      continue;
    }
    if (ch === '"' || ch === "'") {
      let j = i + 1;
      let value = "";
      while (j < input.length && input[j] !== ch) {
        if (input[j] === "\\" && j + 1 < input.length) {
          value += input[j + 1];
          j += 2;
        } else {
          if (input[j] === "\n") line += 1;
          value += input[j];
          j += 1;
        }
      }
      if (j >= input.length) throw syntaxError("Unterminated string literal", line);
      tokens.push({ kind: "string", value, line, leading: takePending() });
      i = j + 1;
      continue;
    }
    const rest = input.slice(i);
    const numMatch = /^[+-]?([0-9][0-9A-Za-z_]*|0[xX][0-9A-Fa-f]+)/.exec(rest);
    if (numMatch && /[0-9]/.test(ch ?? "")) {
      tokens.push({ kind: "number", value: numMatch[0], line, leading: takePending() });
      i += numMatch[0].length;
      continue;
    }
    const identMatch = /^[A-Za-z_][A-Za-z0-9_]*/.exec(rest);
    if (identMatch) {
      tokens.push({ kind: "ident", value: identMatch[0], line, leading: takePending() });
      i += identMatch[0].length;
      continue;
    }
    if ("{}[]()=;,.<>:".includes(ch ?? "")) {
      tokens.push({ kind: "symbol", value: ch ?? "", line, leading: takePending() });
      i += 1;
      continue;
    }
    throw syntaxError(`Unexpected character ${JSON.stringify(ch)}`, line);
  }
  return tokens;
}

class Parser {
  private pos = 0;
  readonly file: ProtoFile = { pkg: "", messages: [], enums: [], services: [] };

  constructor(private readonly tokens: Token[]) {}

  parse(): ProtoFile {
    while (!this.eof()) {
      if (this.peekIs(";")) {
        this.next();
        continue;
      }
      const keyword = this.expectIdent("top-level statement");
      switch (keyword.value) {
        case "syntax":
          this.parseSyntax();
          break;
        case "package":
          this.file.pkg = this.parseDotted();
          this.expectSymbol(";");
          break;
        case "import":
          this.parseImport();
          break;
        case "option":
          this.parseOption();
          break;
        case "message":
          this.parseMessage("", keyword.leading);
          break;
        case "enum":
          this.parseEnum("", keyword.leading);
          break;
        case "service":
          this.file.services.push(this.parseService(keyword.leading));
          break;
        case "extend":
          this.skipExtend();
          break;
        default:
          throw this.fail(`Unexpected top-level keyword "${keyword.value}"`, keyword);
      }
    }
    return this.file;
  }

  private eof(): boolean {
    return this.pos >= this.tokens.length;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private peekIs(value: string): boolean {
    return this.peek()?.value === value;
  }

  private next(): Token {
    const token = this.tokens[this.pos];
    if (!token) throw syntaxError("Unexpected end of input", 0);
    this.pos += 1;
    return token;
  }

  private fail(message: string, token?: Token): Error {
    const line = token?.line ?? this.peek()?.line ?? 0;
    return syntaxError(message, line);
  }

  private expectIdent(what: string): Token {
    const token = this.next();
    if (token.kind !== "ident") throw this.fail(`Expected identifier for ${what}`, token);
    return token;
  }

  private expectSymbol(value: string): Token {
    const token = this.next();
    if (token.value !== value) {
      throw this.fail(`Expected "${value}" but found "${token.value}"`, token);
    }
    return token;
  }

  private parseDotted(): string {
    const parts = [this.expectIdent("dotted name").value];
    while (this.peekIs(".")) {
      this.next();
      parts.push(this.expectIdent("dotted name").value);
    }
    return parts.join(".");
  }

  private parseSyntax(): void {
    this.expectSymbol("=");
    const value = this.next();
    if (value.kind !== "string" || (value.value !== "proto2" && value.value !== "proto3")) {
      throw this.fail('Expected "proto2" or "proto3"', value);
    }
    this.expectSymbol(";");
  }

  private parseImport(): void {
    const modifier = this.peek();
    if (modifier?.kind === "ident" && (modifier.value === "weak" || modifier.value === "public")) {
      this.next();
    }
    const path = this.next();
    if (path.kind !== "string") throw this.fail("Expected import path string", path);
    this.expectSymbol(";");
  }

  private skipBalanced(open: string, close: string): void {
    this.expectSymbol(open);
    this.skipBalancedRest(1, open, close);
  }

  private skipBalancedRest(depth: number, open: string, close: string): void {
    let level = depth;
    while (level > 0) {
      const token = this.next();
      if (token.value === open) level += 1;
      if (token.value === close) level -= 1;
    }
  }

  private parseOption(): boolean {
    let name: string;
    if (this.peekIs("(")) {
      this.skipBalanced("(", ")");
      name = "(custom)";
      if (this.peek()?.kind === "ident") name = `${name}.${this.parseDotted()}`;
    } else {
      name = this.parseDotted();
    }
    this.expectSymbol("=");
    let raw = "";
    const first = this.peek();
    if (first?.value === "[") {
      this.skipBalanced("[", "]");
      raw = "[]";
    } else if (first?.value === "{") {
      this.skipBalanced("{", "}");
      raw = "{}";
    } else {
      const value = this.next();
      raw = value.kind === "string" ? JSON.stringify(value.value) : value.value;
    }
    this.expectSymbol(";");
    return name === "deprecated" && raw === "true";
  }

  private skipToSemicolon(): void {
    for (;;) {
      const token = this.next();
      if (token.value === ";") return;
      if (token.value === "{") this.skipBalancedRest(1, "{", "}");
      if (token.value === "[") this.skipBalancedRest(1, "[", "]");
    }
  }

  private parseMessage(scope: string, leading: string[]): void {
    const nameToken = this.expectIdent("message name");
    const fullName = scope ? `${scope}.${nameToken.value}` : nameToken.value;
    const description = [...leading, ...nameToken.leading].join("\n") || undefined;
    this.expectSymbol("{");
    const message: ProtoMessage = { fullName, description, fields: [] };
    this.file.messages.push(message);
    while (!this.peekIs("}")) {
      if (this.eof()) throw this.fail(`Unterminated message "${fullName}"`);
      if (this.peekIs(";")) {
        this.next();
        continue;
      }
      if (this.peekIs("option")) {
        this.next();
        this.parseOption();
        continue;
      }
      const keyword = this.expectIdent("message member");
      switch (keyword.value) {
        case "message":
          this.parseMessage(fullName, keyword.leading);
          break;
        case "enum":
          this.parseEnum(fullName, keyword.leading);
          break;
        case "oneof":
          this.parseOneof(message, fullName);
          break;
        case "reserved":
        case "extensions":
        case "extension":
          this.skipToSemicolon();
          break;
        case "extend":
          this.skipExtend();
          break;
        case "group":
          this.parseGroup(message, fullName, keyword);
          break;
        case "map":
          message.fields.push(this.parseMapField(keyword));
          break;
        default:
          message.fields.push(this.parseField(keyword));
          break;
      }
    }
    this.expectSymbol("}");
  }

  private parseOneof(message: ProtoMessage, fullName: string): void {
    const oneofName = this.expectIdent("oneof name").value;
    this.expectSymbol("{");
    while (!this.peekIs("}")) {
      if (this.eof()) throw this.fail(`Unterminated oneof "${oneofName}" in "${fullName}"`);
      if (this.peekIs(";")) {
        this.next();
        continue;
      }
      if (this.peekIs("option")) {
        this.next();
        this.parseOption();
        continue;
      }
      message.fields.push(this.parseField(this.expectIdent("oneof member")));
    }
    this.expectSymbol("}");
  }

  private parseGroup(message: ProtoMessage, fullName: string, keyword: Token): void {
    const groupName = this.expectIdent("group name").value;
    this.expectSymbol("=");
    this.next();
    if (this.peekIs("[")) this.skipBalanced("[", "]");
    this.expectSymbol("{");
    const group: ProtoMessage = {
      fullName: `${fullName}.${groupName}`,
      description: keyword.leading.join("\n") || undefined,
      fields: [],
    };
    while (!this.peekIs("}")) {
      if (this.eof()) throw this.fail(`Unterminated group "${groupName}"`);
      if (this.peekIs(";")) {
        this.next();
        continue;
      }
      if (this.peekIs("option")) {
        this.next();
        this.parseOption();
        continue;
      }
      const member = this.expectIdent("group member");
      if (member.value === "map") group.fields.push(this.parseMapField(member));
      else group.fields.push(this.parseField(member));
    }
    this.expectSymbol("}");
    this.expectSymbol(";");
    this.file.messages.push(group);
    void message;
  }

  private parseEnum(scope: string, leading: string[]): void {
    const nameToken = this.expectIdent("enum name");
    const fullName = scope ? `${scope}.${nameToken.value}` : nameToken.value;
    const description = [...leading, ...nameToken.leading].join("\n") || undefined;
    this.expectSymbol("{");
    const values: string[] = [];
    while (!this.peekIs("}")) {
      if (this.eof()) throw this.fail(`Unterminated enum "${fullName}"`);
      if (this.peekIs(";")) {
        this.next();
        continue;
      }
      if (this.peekIs("option") || this.peekIs("reserved")) {
        const kind = this.next().value;
        if (kind === "option") this.parseOption();
        else this.skipToSemicolon();
        continue;
      }
      const valueName = this.expectIdent("enum value");
      this.expectSymbol("=");
      const num = this.next();
      if (num.kind !== "number") throw this.fail("Expected enum value number", num);
      if (this.peekIs("[")) this.skipBalanced("[", "]");
      this.expectSymbol(";");
      values.push(valueName.value);
    }
    this.expectSymbol("}");
    this.file.enums.push({ fullName, description, values });
  }

  private parseField(first: Token): ProtoField {
    let label = "";
    let typeToken = first;
    if (FIELD_LABELS.has(first.value)) {
      label = first.value;
      typeToken = this.expectIdent("field type");
    }
    let typeName = typeToken.value;
    while (this.peekIs(".")) {
      this.next();
      typeName += `.${this.expectIdent("field type").value}`;
    }
    const name = this.expectIdent("field name").value;
    this.expectSymbol("=");
    const num = this.next();
    if (num.kind !== "number") throw this.fail("Expected field number", num);
    if (this.peekIs("[")) this.skipBalanced("[", "]");
    this.expectSymbol(";");
    return {
      name,
      typeName,
      repeated: label === "repeated",
      isMap: false,
      description: first.leading.join("\n") || undefined,
    };
  }

  private parseMapField(first: Token): ProtoField {
    this.expectSymbol("<");
    this.expectIdent("map key type");
    this.expectSymbol(",");
    let value = this.expectIdent("map value type").value;
    while (this.peekIs(".")) {
      this.next();
      value += `.${this.expectIdent("map value type").value}`;
    }
    this.expectSymbol(">");
    const name = this.expectIdent("map field name").value;
    this.expectSymbol("=");
    const num = this.next();
    if (num.kind !== "number") throw this.fail("Expected field number", num);
    if (this.peekIs("[")) this.skipBalanced("[", "]");
    this.expectSymbol(";");
    return {
      name,
      typeName: value,
      repeated: false,
      isMap: true,
      description: first.leading.join("\n") || undefined,
    };
  }

  private skipExtend(): void {
    if (this.peek()?.kind === "ident") this.parseDotted();
    if (this.peekIs("{")) this.skipBalanced("{", "}");
    else this.skipToSemicolon();
  }

  private parseService(leading: string[]): ProtoService {
    const nameToken = this.expectIdent("service name");
    const description = [...leading, ...nameToken.leading].join("\n") || undefined;
    this.expectSymbol("{");
    const service: ProtoService = { name: nameToken.value, description, rpcs: [] };
    while (!this.peekIs("}")) {
      if (this.eof()) throw this.fail(`Unterminated service "${service.name}"`);
      if (this.peekIs(";")) {
        this.next();
        continue;
      }
      if (this.peekIs("option")) {
        this.next();
        this.parseOption();
        continue;
      }
      const keyword = this.expectIdent("service member");
      if (keyword.value !== "rpc") {
        throw this.fail(`Unexpected service member "${keyword.value}"`, keyword);
      }
      service.rpcs.push(this.parseRpc(keyword.leading));
    }
    this.expectSymbol("}");
    return service;
  }

  private parseRpc(leading: string[]): ProtoRpc {
    const nameToken = this.expectIdent("rpc name");
    const description = [...leading, ...nameToken.leading].join("\n") || undefined;
    this.expectSymbol("(");
    let clientStreaming = false;
    if (this.peekIs("stream")) {
      this.next();
      clientStreaming = true;
    }
    const inputType = this.parseDotted();
    this.expectSymbol(")");
    const returns = this.expectIdent("returns keyword");
    if (returns.value !== "returns") throw this.fail('Expected "returns"', returns);
    this.expectSymbol("(");
    let serverStreaming = false;
    if (this.peekIs("stream")) {
      this.next();
      serverStreaming = true;
    }
    const outputType = this.parseDotted();
    this.expectSymbol(")");
    let deprecated = false;
    if (this.peekIs("{")) {
      this.next();
      while (!this.peekIs("}")) {
        if (this.eof()) throw this.fail(`Unterminated rpc "${nameToken.value}"`);
        if (this.peekIs(";")) {
          this.next();
          continue;
        }
        const member = this.expectIdent("rpc member");
        if (member.value !== "option") {
          throw this.fail(`Unexpected rpc member "${member.value}"`, member);
        }
        if (this.parseOption()) deprecated = true;
      }
      this.expectSymbol("}");
    } else {
      this.expectSymbol(";");
    }
    return {
      name: nameToken.value,
      description,
      deprecated,
      clientStreaming,
      serverStreaming,
      inputType,
      outputType,
    };
  }
}

function refOf(name: string): SchemaNode {
  return { ref: `#/components/schemas/${name}` };
}

interface TypeIndex {
  resolve: (name: string) => string | undefined;
  messages: Map<string, ProtoMessage>;
  enums: Map<string, ProtoEnum>;
  order: string[];
}

function buildIndex(file: ProtoFile): TypeIndex {
  const messages = new Map<string, ProtoMessage>();
  const enums = new Map<string, ProtoEnum>();
  const order: string[] = [];
  const prefix = file.pkg ? `${file.pkg}.` : "";
  for (const message of file.messages) {
    const qualified = message.fullName.includes(".")
      ? message.fullName
      : `${prefix}${message.fullName}`;
    if (!messages.has(qualified)) {
      messages.set(qualified, message);
      order.push(qualified);
    }
    const simple = message.fullName.split(".").at(-1) ?? message.fullName;
    if (!messages.has(simple)) messages.set(simple, message);
  }
  for (const e of file.enums) {
    const qualified = e.fullName.includes(".") ? e.fullName : `${prefix}${e.fullName}`;
    if (!enums.has(qualified)) {
      enums.set(qualified, e);
      order.push(qualified);
    }
    const simple = e.fullName.split(".").at(-1) ?? e.fullName;
    if (!enums.has(simple)) enums.set(simple, e);
  }
  const keys = [...messages.keys(), ...enums.keys()].sort();
  const resolve = (name: string): string | undefined => {
    const clean = name.startsWith(".") ? name.slice(1) : name;
    if (messages.has(clean) || enums.has(clean)) return clean;
    const suffix = `.${clean}`;
    const hit = keys.find((k) => k.endsWith(suffix));
    return hit;
  };
  return { resolve, messages, enums, order };
}

function typeToSchema(typeName: string, index: TypeIndex, unresolved: Set<string>): SchemaNode {
  const clean = typeName.startsWith(".") ? typeName.slice(1) : typeName;
  const scalar = SCALAR_MAP[clean];
  if (scalar !== undefined) return { type: scalar };
  const resolved = index.resolve(clean);
  if (resolved !== undefined) {
    const canonical = index.messages.has(resolved)
      ? canonicalName(resolved, index.messages)
      : canonicalName(resolved, index.enums);
    return refOf(canonical ?? resolved);
  }
  unresolved.add(clean);
  return refOf(clean);
}

function canonicalName(key: string, map: Map<string, { fullName: string }>): string | undefined {
  const entry = map.get(key);
  if (!entry) return undefined;
  for (const [k, v] of map) {
    if (v === entry && k.includes(".")) return k;
  }
  return key;
}

function fieldToSchema(field: ProtoField, index: TypeIndex, unresolved: Set<string>): SchemaNode {
  let node: SchemaNode;
  if (field.isMap) {
    node = { type: "object" };
  } else {
    node = typeToSchema(field.typeName, index, unresolved);
  }
  if (field.repeated) node = { type: "array", items: node };
  if (field.description !== undefined) return { ...node, description: field.description };
  return node;
}

function messageSchema(
  message: ProtoMessage,
  index: TypeIndex,
  unresolved: Set<string>,
): SchemaNode {
  const properties: Record<string, SchemaNode> = {};
  for (const field of message.fields) {
    properties[field.name] = fieldToSchema(field, index, unresolved);
  }
  return { type: "object", properties };
}

function toSpec(
  file: ProtoFile,
  index: TypeIndex,
  inputHash: string,
  inputBytes: number,
  sourceLabel: string,
  unresolved: Set<string>,
): Spec {
  const operations: Operation[] = [];
  for (const service of file.services) {
    for (const rpc of service.rpcs) {
      const base = file.pkg ? `${file.pkg}.${service.name}` : service.name;
      const path = `/${base}/${rpc.name}`;
      const pointer = `#/${service.name}/${rpc.name}`;
      const inputSchema = typeToSchema(rpc.inputType, index, unresolved);
      const outputSchema = typeToSchema(rpc.outputType, index, unresolved);
      const responses: Response[] = [
        {
          status: "data",
          description: `Data payload of ${path}.`,
          content: [{ mediaType: "application/protobuf", schema: outputSchema }],
          headers: [],
          jsonPointer: `${pointer}/data`,
        },
      ];
      const streaming =
        rpc.clientStreaming && rpc.serverStreaming
          ? "bidi"
          : rpc.clientStreaming
            ? "client"
            : rpc.serverStreaming
              ? "server"
              : undefined;
      operations.push({
        method: "rpc",
        path,
        operationId: `${service.name}.${rpc.name}`,
        description: rpc.description,
        tags: [],
        deprecated: rpc.deprecated,
        parameters: [],
        requestBody: {
          required: false,
          content: [{ mediaType: "application/protobuf", schema: inputSchema }],
          jsonPointer: `${pointer}/requestBody`,
        },
        responses,
        security: undefined,
        extensions: streaming ? { "x-grpc-streaming": streaming } : {},
        jsonPointer: pointer,
      });
    }
  }
  const schemaNodes: Record<string, SchemaNode> = {};
  for (const name of index.order) {
    const message = index.messages.get(name);
    if (message && schemaNodes[name] === undefined) {
      schemaNodes[name] = messageSchema(message, index, unresolved);
    }
    const e = index.enums.get(name);
    if (e && schemaNodes[name] === undefined) {
      schemaNodes[name] = {
        type: "string",
        enum: [...e.values],
        ...(e.description ? { description: e.description } : {}),
      };
    }
  }
  const warnings: ParseWarning[] = [];
  if (operations.length === 0) {
    warnings.push({
      code: "proto-no-services",
      message: "No services found; nothing to analyze.",
    });
  }
  if (unresolved.size > 0) {
    const names = [...unresolved].sort();
    const shown = names.slice(0, 10).join(", ");
    warnings.push({
      code: "proto-unresolved-refs",
      message:
        names.length > 10
          ? `Unresolved types (likely imports): ${shown} (+${names.length - 10} more).`
          : `Unresolved types (likely imports): ${shown}.`,
    });
  }
  const components: ComponentIndex = {
    schemas: Object.keys(schemaNodes).sort(),
    responses: [],
    parameters: [],
    securitySchemes: [],
    schemaNodes,
  };
  return {
    inputHash,
    openapiVersion: "grpc",
    sourceLabel,
    info: {},
    extensions: {},
    rootTags: [],
    security: undefined,
    inputBytes,
    operations,
    components,
    parseWarnings: warnings,
  };
}

export function parseProto(input: Uint8Array | string, opts: ParseOptions): ParseResult {
  const limits: ParseLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  const inputHash = sha256Hex(bytes);
  if (bytes.byteLength > limits.maxBytes) {
    return {
      ok: false,
      errors: [
        {
          message: `SIZE_LIMIT: input is ${bytes.byteLength} bytes (max ${limits.maxBytes})`,
        },
      ],
    };
  }
  let file: ProtoFile;
  try {
    const text = new TextDecoder().decode(bytes);
    const tokens = tokenize(text);
    file = new Parser(tokens).parse();
  } catch (error) {
    if (error instanceof Error) {
      const line = /\(line (\d+)\)/.exec(error.message)?.[1];
      return {
        ok: false,
        errors: [
          {
            message: `SYNTAX: ${error.message}`,
            ...(line === undefined ? {} : { line: Number(line) }),
          },
        ],
      };
    }
    throw error;
  }
  const index = buildIndex(file);
  const unresolved = new Set<string>();
  return {
    ok: true,
    spec: toSpec(file, index, inputHash, bytes.byteLength, opts.sourceLabel, unresolved),
  };
}
