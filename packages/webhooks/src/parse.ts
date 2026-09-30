import type {
  ComponentIndex,
  Operation,
  Parameter,
  ParseWarning,
  Response,
  SchemaNode,
  Spec,
} from "@ankaa/core";
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

function asBool(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

export function looksLikeWebhooks(input: Uint8Array | string): boolean {
  const text = typeof input === "string" ? input : new TextDecoder().decode(input);
  const head = text.slice(0, 4096);
  if (/(^|\n)\s{0,4}["']?openapi["']?\s*:/.test(head)) return false;
  if (/(^|\n)\s{0,4}["']?swagger["']?\s*:/.test(head)) return false;
  if (/(^|\n)\s{0,4}["']?asyncapi["']?\s*:/.test(head)) return false;
  return /(^|\n)\s{0,4}["']?webhooks["']?\s*:/.test(head);
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
    (!ref.startsWith("#") &&
      (ref.includes(".json") || ref.includes(".yaml") || ref.includes(".yml")))
  );
}

function resolveLocalPointer(doc: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
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

function headerParams(headers: unknown, pointer: string): Parameter[] {
  if (!Array.isArray(headers)) return [];
  const out: Parameter[] = [];
  for (let i = 0; i < headers.length; i++) {
    const entry = headers[i];
    if (!isRecord(entry)) continue;
    const name = asString(entry["name"]);
    if (name === undefined || name.length === 0) continue;
    out.push({
      name,
      in: "header",
      required: asBool(entry["required"]) ?? false,
      description: asString(entry["description"]),
      schema: undefined,
      jsonPointer: `${pointer}/headers/${i}`,
    });
  }
  return out;
}

function eventPath(eventType: string): string {
  const slashed = eventType.split(".").join("/");
  return slashed.startsWith("/") ? slashed : `/${slashed}`;
}

export function parseWebhooks(input: Uint8Array | string, opts: ParseOptions): ParseResult {
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
        {
          message: `SYNTAX: ${message}`,
          ...(line === undefined ? {} : { line: Number(line) }),
        },
      ],
    };
  }
  if (!isRecord(doc)) {
    return {
      ok: false,
      errors: [{ message: "NOT_AN_OBJECT: webhooks document must be an object" }],
    };
  }
  const rawWebhooks = doc["webhooks"];
  if (rawWebhooks === undefined) {
    const warnings: ParseWarning[] = [
      {
        code: "webhooks-no-events",
        message: "No webhooks events found; nothing to analyze.",
      },
    ];
    return {
      ok: true,
      spec: emptySpec(doc, inputHash, opts.sourceLabel, bytes.byteLength, warnings),
    };
  }
  if (!isRecord(rawWebhooks)) {
    return {
      ok: false,
      errors: [{ message: "NOT_AN_OBJECT: webhooks must be a map of event type to definition" }],
    };
  }
  const entries = Object.entries(rawWebhooks);
  if (entries.length === 0) {
    const warnings: ParseWarning[] = [
      {
        code: "webhooks-no-events",
        message: "No webhooks events found; nothing to analyze.",
      },
    ];
    return {
      ok: true,
      spec: emptySpec(doc, inputHash, opts.sourceLabel, bytes.byteLength, warnings),
    };
  }

  const index: RefIndex = { doc, seenRemote: false };
  const schemaNodes: Record<string, SchemaNode> = {};
  const operations: Operation[] = [];
  const sorted = [...entries].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  for (const [eventType, raw] of sorted) {
    if (!isRecord(raw)) continue;
    const pointer = `#/webhooks/${eventType}`;
    const description = asString(raw["description"]) ?? asString(raw["summary"]);
    const summary = asString(raw["summary"]);
    const deprecated = asBool(raw["deprecated"]) ?? false;

    let payloadNode: SchemaNode | undefined;
    const payloadRaw = raw["payload"];
    if (payloadRaw !== undefined) {
      const resolvedPayload =
        isRecord(payloadRaw) && asString(payloadRaw["$ref"]) !== undefined
          ? resolveRef(index, payloadRaw["$ref"] as string)
          : payloadRaw;
      if (resolvedPayload !== undefined) {
        if (isRecord(payloadRaw) && asString(payloadRaw["$ref"]) !== undefined) {
          const target = resolvedPayload;
          if (isRecord(target)) {
            const name = refName(payloadRaw["$ref"] as string);
            if (schemaNodes[name] === undefined) {
              schemaNodes[name] = {};
              schemaNodes[name] = toSchemaNode(target, index, schemaNodes, 0);
            }
            payloadNode = { ref: `#/components/schemas/${name}` };
          } else {
            payloadNode = { ref: `#/components/schemas/${refName(payloadRaw["$ref"] as string)}` };
          }
        } else {
          payloadNode = toSchemaNode(payloadRaw, index, schemaNodes, 0);
        }
      }
    }

    const parameters = headerParams(raw["headers"], pointer);
    const responses: Response[] = [
      {
        status: "200",
        description: "Webhook receipt acknowledgement (2xx semantics).",
        content: [],
        headers: [],
        jsonPointer: `${pointer}/ack`,
      },
    ];

    operations.push({
      method: "post",
      path: eventPath(eventType),
      operationId: eventType,
      summary,
      description,
      tags: [],
      deprecated,
      parameters,
      requestBody:
        payloadNode !== undefined
          ? {
              required: true,
              content: [{ mediaType: "application/json", schema: payloadNode }],
              jsonPointer: `${pointer}/requestBody`,
            }
          : undefined,
      responses,
      security: undefined,
      extensions: {},
      externalDocs: undefined,
      jsonPointer: pointer,
    });
  }

  if (index.seenRemote) {
    return {
      ok: false,
      errors: [{ message: "REMOTE_REF: remote $refs are not supported (offline-first)" }],
    };
  }

  const info = isRecord(doc["info"]) ? (doc["info"] as Json) : {};
  const servers = collectServers(doc["servers"]);
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
      openapiVersion: "webhooks",
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
      parseWarnings: [],
      ...(servers.length > 0 ? { servers } : {}),
    },
  };
}

function collectServers(raw: unknown): Array<{ url: string; description?: string }> {
  if (Array.isArray(raw)) {
    return raw
      .filter(isRecord)
      .map((s) => ({
        url: asString(s["url"]) ?? "",
        description: asString(s["description"]),
      }))
      .filter((s) => s.url.length > 0);
  }
  if (isRecord(raw)) {
    return Object.values(raw)
      .filter(isRecord)
      .map((s) => ({
        url: asString((s as Json)["url"]) ?? "",
        description: asString((s as Json)["description"]),
      }))
      .filter((s) => s.url.length > 0);
  }
  return [];
}

function emptySpec(
  doc: Json,
  inputHash: string,
  sourceLabel: string,
  inputBytes: number,
  warnings: ParseWarning[],
): Spec {
  const info = isRecord(doc["info"]) ? (doc["info"] as Json) : {};
  const servers = collectServers(doc["servers"]);
  return {
    inputHash,
    openapiVersion: "webhooks",
    sourceLabel,
    info: {
      title: asString(info["title"]),
      version: asString(info["version"]),
      description: asString(info["description"]),
    },
    extensions: {},
    rootTags: [],
    security: undefined,
    inputBytes,
    operations: [],
    components: {
      schemas: [],
      responses: [],
      parameters: [],
      securitySchemes: [],
      schemaNodes: {},
    },
    parseWarnings: warnings,
    ...(servers.length > 0 ? { servers } : {}),
  };
}
