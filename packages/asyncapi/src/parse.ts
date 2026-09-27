import type {
  ComponentIndex,
  Operation,
  Parameter,
  ParseWarning,
  Response,
  SchemaNode,
  Spec,
} from "@apigovscan/core";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";

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

export type ParseResult =
  | { ok: true; spec: Spec }
  | { ok: false; errors: ParseError[] };

export interface ParseOptions {
  sourceLabel: string;
  limits?: Partial<ParseLimits>;
}

export const DEFAULT_LIMITS: ParseLimits = {
  maxBytes: 10_000_000,
  maxDepth: 100,
  maxAliases: 1000,
};

type Json = Record<string, unknown>;

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Json {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

export function looksLikeAsyncApi(input: Uint8Array | string): boolean {
  const text = typeof input === "string" ? input : new TextDecoder().decode(input);
  const head = text.slice(0, 4096);
  return /(^|\n)\s{0,4}["']?asyncapi["']?\s*:/.test(head);
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new Error("INVALID_UTF8: input is not valid UTF-8 (line 0)");
  }
}

function isRemoteRef(ref: string): boolean {
  return (
    ref.startsWith("http://") ||
    ref.startsWith("https://") ||
    ref.startsWith("./") ||
    ref.startsWith("../") ||
    (!ref.startsWith("#") && (ref.includes(".json") || ref.includes(".yaml") || ref.includes(".yml")))
  );
}

function resolveLocalPointer(doc: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref.slice(2).split("/").map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let current: unknown = doc;
  for (const part of parts) {
    const key = decodeURIComponent(part);
    if (isRecord(current) && key in current) current = current[key];
    else if (Array.isArray(current) && /^\d+$/.test(key)) current = current[Number(key)];
    else return undefined;
  }
  return current;
}

interface RefIndex {
  doc: unknown;
  seenRemote: boolean;
}

function resolveRef(index: RefIndex, ref: string): unknown {
  if (isRemoteRef(ref)) {
    index.seenRemote = true;
    return undefined;
  }
  return resolveLocalPointer(index.doc, ref);
}

function refName(ref: string): string {
  const parts = ref.split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? ref);
}

function toSchemaNode(
  schema: unknown,
  index: RefIndex,
  schemaNodes: Record<string, SchemaNode>,
  depth: number,
): SchemaNode {
  if (depth > 25) return { type: "object" };
  if (!isRecord(schema)) return {};
  const ref = asString(schema["$ref"]);
  if (ref !== undefined) {
    const target = resolveRef(index, ref);
    if (!isRecord(target)) return { ref: `#/components/schemas/${refName(ref)}` };
    if (isRecord(target) && asString(target["$ref"]) !== undefined) {
      return toSchemaNode(target, index, schemaNodes, depth + 1);
    }
    const name = refName(ref);
    if (schemaNodes[name] === undefined) {
      schemaNodes[name] = {};
      schemaNodes[name] = toSchemaNode(target, index, schemaNodes, depth + 1);
    }
    return { ref: `#/components/schemas/${name}` };
  }
  const node: SchemaNode = {};
  const rawType = schema["type"];
  const type = Array.isArray(rawType)
    ? rawType.filter((t): t is string => typeof t === "string" && t !== "null")[0]
    : asString(rawType);
  if (type !== undefined) node.type = type;
  const format = asString(schema["format"]);
  if (format !== undefined) node.format = format;
  const description = asString(schema["description"]);
  if (description !== undefined) node.description = description;
  if (Array.isArray(schema["enum"])) node.enum = [...(schema["enum"] as unknown[])];
  const properties = schema["properties"];
  if (isRecord(properties)) {
    node.properties = {};
    for (const [key, value] of Object.entries(properties)) {
      node.properties[key] = toSchemaNode(value, index, schemaNodes, depth + 1);
    }
  }
  const required = schema["required"];
  if (Array.isArray(required)) {
    const names = required.filter((r): r is string => typeof r === "string");
    if (names.length > 0) node.required = names;
  }
  if (schema["items"] !== undefined) {
    const items = schema["items"];
    node.items = Array.isArray(items)
      ? toSchemaNode(items[0], index, schemaNodes, depth + 1)
      : toSchemaNode(items, index, schemaNodes, depth + 1);
  }
  if (typeof schema["additionalProperties"] === "boolean") {
    node.additionalProperties = schema["additionalProperties"];
  }
  const example = schema["example"];
  if (example !== undefined) node.example = example as SchemaNode["example"];
  return node;
}

interface ResolvedMessage {
  payload?: SchemaNode;
  headerParams: Parameter[];
  description?: string;
  refName?: string;
}

function messageRefName(message: unknown): string | undefined {
  if (!isRecord(message)) return undefined;
  const ref = asString(message["$ref"]);
  if (ref === undefined) return undefined;
  const match = /^#\/components\/messages\/([^/]+)$/.exec(ref);
  return match?.[1] !== undefined ? decodeURIComponent(match[1]) : undefined;
}

function resolveMessage(
  message: unknown,
  index: RefIndex,
  schemaNodes: Record<string, SchemaNode>,
  pointer: string,
): ResolvedMessage | undefined {
  const node = isRecord(message) && asString(message["$ref"]) !== undefined
    ? resolveRef(index, message["$ref"] as string)
    : message;
  if (!isRecord(node)) return undefined;
  const description = asString(node["description"]) ?? asString(node["summary"]);
  const payloadRaw = node["payload"];
  const payload =
    payloadRaw !== undefined
      ? toSchemaNode(payloadRaw, index, schemaNodes, 0)
      : undefined;
  const headerParams: Parameter[] = [];
  const headersRaw = node["headers"];
  const headers =
    isRecord(headersRaw) && asString(headersRaw["$ref"]) !== undefined
      ? resolveRef(index, headersRaw["$ref"] as string)
      : headersRaw;
  if (isRecord(headers) && isRecord(headers["properties"])) {
    for (const [name, prop] of Object.entries(headers["properties"] as Json)) {
      headerParams.push({
        name,
        in: "header",
        required: false,
        description: isRecord(prop) ? asString(prop["description"]) : undefined,
        schema: isRecord(prop) ? toSchemaNode(prop, index, schemaNodes, 0) : undefined,
        jsonPointer: `${pointer}/headers/${name}`,
      });
    }
  }
  return { payload, headerParams, description, refName: messageRefName(message) };
}

function contentSchema(resolved: ResolvedMessage | undefined): SchemaNode | undefined {
  if (resolved === undefined) return undefined;
  if (resolved.refName !== undefined) return { ref: `#/components/schemas/${resolved.refName}` };
  return resolved.payload;
}
function channelParams(
  params: unknown,
  index: RefIndex,
  schemaNodes: Record<string, SchemaNode>,
  pointer: string,
): Parameter[] {
  if (!isRecord(params)) return [];
  const out: Parameter[] = [];
  for (const [name, def] of Object.entries(params)) {
    const node = isRecord(def) && asString(def["$ref"]) !== undefined
      ? resolveRef(index, def["$ref"] as string)
      : def;
    out.push({
      name,
      in: "path",
      required: true,
      description: isRecord(node) ? asString(node["description"]) : undefined,
      schema: isRecord(node) ? toSchemaNode(node, index, schemaNodes, 0) : undefined,
      jsonPointer: `${pointer}/${name}`,
    });
  }
  return out;
}

function tagsOf(op: unknown): string[] {
  if (!isRecord(op)) return [];
  const tags = op["tags"];
  if (!Array.isArray(tags)) return [];
  return tags
    .map((t) => (isRecord(t) ? asString(t["name"]) : asString(t)))
    .filter((t): t is string => t !== undefined);
}

function externalDocsOf(op: unknown): { url?: string; description?: string } | undefined {
  if (!isRecord(op) || !isRecord(op["externalDocs"])) return undefined;
  return {
    url: asString(op["externalDocs"]["url"]),
    description: asString(op["externalDocs"]["description"]),
  };
}

function buildOperation(
  opts: {
    method: string;
    path: string;
    pointer: string;
    operationId?: string;
    summary?: string;
    description?: string;
    tags: string[];
    externalDocs?: { url?: string; description?: string };
    parameters: Parameter[];
    payload?: SchemaNode;
    outgoing: boolean;
  },
): Operation {
  const responses: Response[] = [];
  let requestBody: Operation["requestBody"];
  if (opts.payload !== undefined) {
    if (opts.outgoing) {
      requestBody = {
        required: false,
        content: [{ mediaType: "application/json", schema: opts.payload }],
        jsonPointer: `${opts.pointer}/requestBody`,
      };
    } else {
      responses.push({
        status: "data",
        description: `Data payload of ${opts.path}.`,
        content: [{ mediaType: "application/json", schema: opts.payload }],
        headers: [],
        jsonPointer: `${opts.pointer}/data`,
      });
    }
  }
  return {
    method: opts.method,
    path: opts.path,
    operationId: opts.operationId,
    summary: opts.summary,
    description: opts.description,
    tags: opts.tags,
    deprecated: false,
    parameters: opts.parameters,
    requestBody,
    responses,
    security: undefined,
    extensions: {},
    externalDocs: opts.externalDocs,
    jsonPointer: opts.pointer,
  };
}

function parseV2(
  doc: Json,
  index: RefIndex,
  schemaNodes: Record<string, SchemaNode>,
): Operation[] {
  const operations: Operation[] = [];
  const channels = doc["channels"];
  if (!isRecord(channels)) return operations;
  for (const [channelName, channel] of Object.entries(channels)) {
    if (!isRecord(channel)) continue;
    const path = channelName.startsWith("/") ? channelName : `/${channelName}`;
    const params = channelParams(
      channel["parameters"],
      index,
      schemaNodes,
      `#/channels/${channelName}/parameters`,
    );
    for (const [direction, outgoing] of [["publish", true], ["subscribe", false]] as const) {
      const op = channel[direction];
      if (!isRecord(op)) continue;
      const pointer = `#/channels/${channelName}/${direction}`;
      const rawMessage = op["message"];
      const first = Array.isArray(rawMessage) ? rawMessage.find((m) => isRecord(m) || typeof m === "string") : rawMessage;
      const resolved =
        first !== undefined
          ? resolveMessage(first, index, schemaNodes, `${pointer}/message`)
          : undefined;
      operations.push(
        buildOperation({
          method: direction,
          path,
          pointer,
          operationId: asString(op["operationId"]),
          summary: asString(op["summary"]),
          description: asString(op["description"]),
          tags: tagsOf(op),
          externalDocs: externalDocsOf(op),
          parameters: [...params, ...(resolved?.headerParams ?? [])],
          payload: contentSchema(resolved),
          outgoing,
        }),
      );
    }
  }
  return operations;
}

function parseV3(
  doc: Json,
  index: RefIndex,
  schemaNodes: Record<string, SchemaNode>,
): Operation[] {
  const operations: Operation[] = [];
  const ops = doc["operations"];
  if (!isRecord(ops)) return operations;
  for (const [opKey, op] of Object.entries(ops)) {
    if (!isRecord(op)) continue;
    const action = asString(op["action"]);
    if (action !== "send" && action !== "receive") continue;
    const channelRef = isRecord(op["channel"]) ? asString(op["channel"]["$ref"]) : undefined;
    let channelName = opKey;
    let address: string | undefined;
    if (channelRef !== undefined) {
      const channel = resolveRef(index, channelRef);
      if (isRecord(channel)) {
        channelName = refName(channelRef);
        address = asString(channel["address"]) ?? channelName;
      }
    }
    const path = (address ?? channelName).startsWith("/")
      ? (address ?? channelName)
      : `/${address ?? channelName}`;
    const pointer = `#/operations/${opKey}`;
    const rawMessages = op["messages"];
    const list = Array.isArray(rawMessages) ? rawMessages : rawMessages !== undefined ? [rawMessages] : [];
    const first = list[0];
    const resolved =
      first !== undefined
        ? resolveMessage(first, index, schemaNodes, `${pointer}/messages/0`)
        : undefined;
    const channelParamsList: Parameter[] = [];
    if (channelRef !== undefined) {
      const channel = resolveRef(index, channelRef);
      if (isRecord(channel)) {
        channelParamsList.push(
          ...channelParams(channel["parameters"], index, schemaNodes, `#/channels/${channelName}/parameters`),
        );
      }
    }
    operations.push(
      buildOperation({
        method: action,
        path,
        pointer,
        operationId: opKey,
        summary: asString(op["summary"]),
        description: asString(op["description"]),
        tags: [],
        externalDocs: externalDocsOf(op),
        parameters: [...channelParamsList, ...(resolved?.headerParams ?? [])],
        payload: contentSchema(resolved),
        outgoing: action === "send",
      }),
    );
  }
  return operations;
}

function registerComponentSchemas(
  doc: Json,
  index: RefIndex,
  schemaNodes: Record<string, SchemaNode>,
): void {
  const components = isRecord(doc["components"]) ? (doc["components"] as Json) : {};
  const schemas = isRecord(components["schemas"]) ? (components["schemas"] as Json) : {};
  for (const [name, schema] of Object.entries(schemas)) {
    if (schemaNodes[name] === undefined && isRecord(schema)) {
      schemaNodes[name] = {};
      schemaNodes[name] = toSchemaNode(schema, index, schemaNodes, 0);
    }
  }
  const messages = isRecord(components["messages"]) ? (components["messages"] as Json) : {};
  for (const [name, message] of Object.entries(messages)) {
    if (schemaNodes[name] !== undefined) continue;
    const resolved = resolveMessage(message, index, schemaNodes, `#/components/messages/${name}`);
    if (resolved?.payload !== undefined) schemaNodes[name] = resolved.payload;
  }
}

export function parseAsyncAPI(
  input: Uint8Array | string,
  opts: ParseOptions,
): ParseResult {
  const limits: ParseLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
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
  let text: string;
  try {
    text = decodeUtf8(bytes);
  } catch (error) {
    return {
      ok: false,
      errors: [{ message: error instanceof Error ? error.message : String(error) }],
    };
  }
  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const line = /line (\d+)/.exec(message)?.[1];
    return {
      ok: false,
      errors: [
        { message: `SYNTAX: ${message}`, ...(line === undefined ? {} : { line: Number(line) }) },
      ],
    };
  }
  if (!isRecord(doc)) {
    return { ok: false, errors: [{ message: "NOT_AN_OBJECT: AsyncAPI document must be an object" }] };
  }
  const version = asString(doc["asyncapi"]);
  const major = version?.split(".")[0];
  if (major !== "2" && major !== "3") {
    return {
      ok: false,
      errors: [
        {
          message: `UNSUPPORTED_VERSION: asyncapi field must declare 2.x or 3.x (found ${JSON.stringify(version) ?? "none"})`,
        },
      ],
    };
  }
  const index: RefIndex = { doc, seenRemote: false };
  const schemaNodes: Record<string, SchemaNode> = {};
  registerComponentSchemas(doc, index, schemaNodes);
  const operations = major === "2" ? parseV2(doc, index, schemaNodes) : parseV3(doc, index, schemaNodes);
  if (index.seenRemote) {
    return {
      ok: false,
      errors: [{ message: "REMOTE_REF: remote $refs are not supported (offline-first)" }],
    };
  }
  const warnings: ParseWarning[] = [];
  if (operations.length === 0) {
    warnings.push({
      code: "asyncapi-no-operations",
      message: "No channel operations found; nothing to analyze.",
    });
  }
  const info = isRecord(doc["info"]) ? (doc["info"] as Json) : {};
  const serversRaw = isRecord(doc["servers"]) ? (doc["servers"] as Json) : {};
  const servers = Object.values(serversRaw)
    .filter(isRecord)
    .map((s) => ({
      url: asString(s["url"]) ?? asString(s["host"]) ?? "",
      description: asString(s["description"]) ?? asString(s["protocol"]),
    }));
  const components: ComponentIndex = {
    schemas: Object.keys(schemaNodes).sort(),
    responses: [],
    parameters: [],
    securitySchemes: [],
    schemaNodes,
  };
  return {
    ok: true,
    spec: {
      inputHash,
      openapiVersion: "asyncapi",
      sourceLabel: opts.sourceLabel,
      info: {
        title: asString(info["title"]),
        version: asString(info["version"]),
        description: asString(info["description"]),
      },
      extensions: {},
      rootTags: [],
      security: undefined,
      inputBytes: bytes.byteLength,
      operations,
      components,
      parseWarnings: warnings,
      ...(servers.length > 0 ? { servers } : {}),
    },
  };
}
