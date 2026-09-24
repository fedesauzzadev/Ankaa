import type {
  ComponentIndex,
  ContentMedia,
  Operation,
  Parameter,
  ParseWarning,
  RequestBody,
  Response,
  SchemaNode,
  SecurityRequirement,
  SecuritySchemeDef,
  Spec,
} from "@apigovscan/core";
import { createHash } from "node:crypto";
import { parse as parseYaml } from "yaml";

const HTTP_METHODS = new Set([
  "get",
  "put",
  "post",
  "delete",
  "options",
  "head",
  "patch",
  "trace",
]);

const PARAM_LOCATIONS = new Set(["path", "query", "header", "cookie"]);

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
  allowOutsideRoot?: false;
}

export const DEFAULT_LIMITS: ParseLimits = {
  maxBytes: 10_000_000,
  maxDepth: 100,
  maxAliases: 1000,
};

export function parseSpec(
  input: Uint8Array | string,
  opts: ParseOptions,
): ParseResult {
  const limits: ParseLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const errors: ParseError[] = [];
  const warnings: ParseWarning[] = [];

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
  } catch {
    return {
      ok: false,
      errors: [{ message: "INVALID_UTF8: input is not valid UTF-8" }],
    };
  }

  const raw = parseDocumentToUnknown(text, limits, errors);
  if (raw === undefined) {
    return {
      ok: false,
      errors: errors.length > 0 ? errors : [{ message: "PARSE_FAILED" }],
    };
  }

  if (checkDepth(raw, limits.maxDepth)) {
    return {
      ok: false,
      errors: [
        {
          message: `DEPTH_LIMIT: nesting exceeds maxDepth ${limits.maxDepth}`,
        },
      ],
    };
  }

  if (!isRecord(raw)) {
    return {
      ok: false,
      errors: [
        { message: "NOT_AN_OBJECT: OpenAPI document must be an object" },
      ],
    };
  }

  if (typeof raw.swagger === "string" && raw.swagger.startsWith("2.")) {
    return {
      ok: false,
      errors: [
        {
          message: `SWAGGER_20: Swagger ${raw.swagger} is not supported yet (see specs/f1-openapi.md §7)`,
        },
      ],
    };
  }

  const openapiVersion =
    typeof raw.openapi === "string" ? raw.openapi : undefined;
  if (!openapiVersion) {
    return {
      ok: false,
      errors: [
        {
          message: "MISSING_OPENAPI: document must declare an `openapi` version field",
        },
      ],
    };
  }
  if (!openapiVersion.startsWith("3.")) {
    return {
      ok: false,
      errors: [
        {
          message: `UNSUPPORTED_VERSION: only OpenAPI 3.x is supported (got ${openapiVersion})`,
        },
      ],
    };
  }

  const paths = raw.paths;
  if (paths !== undefined && !isRecord(paths)) {
    return {
      ok: false,
      errors: [{ message: "INVALID_PATHS: `paths` must be an object" }],
    };
  }

  errors.push(...validateRefs(raw));
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const infoRaw = isRecord(raw.info) ? raw.info : {};
  const info: Spec["info"] = {};
  if (typeof infoRaw.title === "string") info.title = infoRaw.title;
  if (typeof infoRaw.version === "string") info.version = infoRaw.version;
  if (typeof infoRaw.description === "string") {
    info.description = infoRaw.description;
  }

  const operations = collectOperations(raw, warnings, errors);
  if (errors.length > 0) {
    return { ok: false, errors };
  }

  detectRefCycles(raw, warnings);

  operations.sort(compareOperations);

  const components = buildComponentIndex(raw);
  const servers = parseServers(raw.servers);
  const extensions = pickExtensions(raw);
  const rootTags = Array.isArray(raw.tags)
    ? raw.tags
        .filter((t): t is Record<string, unknown> => isRecord(t))
        .map((t) => (typeof t.name === "string" ? t.name : ""))
        .filter((n) => n.length > 0)
        .sort()
    : undefined;
  const security =
    raw.security !== undefined ? parseSecurity(raw.security) : undefined;
  const inputBytes = bytes.byteLength;

  return {
    ok: true,
    spec: {
      inputHash,
      openapiVersion,
      sourceLabel: opts.sourceLabel,
      info,
      operations,
      components,
      parseWarnings: warnings,
      ...(servers ? { servers } : {}),
      ...(Object.keys(extensions).length > 0 ? { extensions } : {}),
      ...(rootTags && rootTags.length > 0 ? { rootTags } : {}),
      ...(security && security.length > 0 ? { security } : {}),
      inputBytes,
    },
  };
}

function parseServers(
  value: unknown,
): Array<{ url: string; description?: string }> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<{ url: string; description?: string }> = [];
  for (const item of value) {
    if (!isRecord(item) || typeof item.url !== "string") continue;
    const server: { url: string; description?: string } = { url: item.url };
    if (typeof item.description === "string") {
      server.description = item.description;
    }
    out.push(server);
  }
  return out.length > 0 ? out : undefined;
}

function parseDocumentToUnknown(
  text: string,
  limits: ParseLimits,
  errors: ParseError[],
): unknown {
  const trimmed = text.replace(/^\uFEFF/, "").trimStart();
  const looksJson = trimmed.startsWith("{") || trimmed.startsWith("[");

  if (looksJson) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      errors.push({
        message: `JSON_PARSE: ${err instanceof Error ? err.message : String(err)}`,
      });
      return undefined;
    }
  }

  try {
    return parseYaml(text, {
      maxAliasCount: limits.maxAliases,
      prettyErrors: true,
      uniqueKeys: true,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/alias/i.test(msg)) {
      errors.push({ message: `YAML_ALIAS_LIMIT: ${msg}` });
    } else if (/tag/i.test(msg)) {
      errors.push({ message: `YAML_TAG_FORBIDDEN: ${msg}` });
    } else {
      errors.push({ message: `YAML_PARSE: ${msg}` });
    }
    return undefined;
  }
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function checkDepth(value: unknown, maxDepth: number, depth = 0): boolean {
  if (depth > maxDepth) return true;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (checkDepth(item, maxDepth, depth + 1)) return true;
    }
    return false;
  }
  if (isRecord(value)) {
    for (const child of Object.values(value)) {
      if (checkDepth(child, maxDepth, depth + 1)) return true;
    }
  }
  return false;
}

function collectOperations(
  doc: Record<string, unknown>,
  warnings: ParseWarning[],
  errors: ParseError[],
): Operation[] {
  const operations: Operation[] = [];
  const paths = isRecord(doc.paths) ? doc.paths : {};

  for (const [path, pathItemRaw] of Object.entries(paths)) {
    if (!path.startsWith("/")) {
      warnings.push({
        code: "PATH_NO_LEADING_SLASH",
        message: `Path "${path}" does not start with "/"`,
        jsonPointer: `/paths/${escapePointer(path)}`,
      });
    }
    if (!isRecord(pathItemRaw)) continue;
    const pathItem = pathItemRaw;
    const pathLevelParams = parseParameters(
      pathItem.parameters,
      `/paths/${escapePointer(path)}/parameters`,
      errors,
    );

    for (const [key, opRaw] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(key.toLowerCase())) continue;
      if (!isRecord(opRaw)) continue;
      const opBase = `/paths/${escapePointer(path)}/${key.toLowerCase()}`;
      const opParams = parseParameters(
        opRaw.parameters,
        `${opBase}/parameters`,
        errors,
      );
      const merged = mergeParameters(pathLevelParams, opParams);

      const security: SecurityRequirement[] | undefined =
        opRaw.security !== undefined ? parseSecurity(opRaw.security) : undefined;

      const operation: Operation = {
        method: key.toLowerCase(),
        path,
        tags: Array.isArray(opRaw.tags)
          ? opRaw.tags.filter((t): t is string => typeof t === "string")
          : [],
        deprecated: opRaw.deprecated === true,
        parameters: merged,
        responses: parseResponses(opRaw.responses, `${opBase}/responses`, errors),
        security,
        extensions: pickExtensions(opRaw),
        jsonPointer: opBase,
      };
      if (typeof opRaw.operationId === "string") {
        operation.operationId = opRaw.operationId;
      }
      if (typeof opRaw.summary === "string") operation.summary = opRaw.summary;
      if (typeof opRaw.description === "string") {
        operation.description = opRaw.description;
      }
      if (isRecord(opRaw.externalDocs)) {
        operation.externalDocs = {};
        if (typeof opRaw.externalDocs.url === "string") {
          operation.externalDocs.url = opRaw.externalDocs.url;
        }
        if (typeof opRaw.externalDocs.description === "string") {
          operation.externalDocs.description = opRaw.externalDocs.description;
        }
      }
      if (isRecord(opRaw.requestBody)) {
        operation.requestBody = parseRequestBody(
          opRaw.requestBody,
          `${opBase}/requestBody`,
        );
      }
      operations.push(operation);
    }
  }

  return operations;
}

function parseSecurity(value: unknown): SecurityRequirement[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: SecurityRequirement[] = [];
  for (const item of value) {
    if (!isRecord(item)) continue;
    for (const [name, scopes] of Object.entries(item)) {
      out.push({
        name,
        scopes: Array.isArray(scopes)
          ? scopes.filter((s): s is string => typeof s === "string")
          : [],
      });
    }
  }
  return out;
}

function parseParameters(
  value: unknown,
  pointer: string,
  errors: ParseError[],
): Parameter[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    errors.push({
      message: "INVALID_PARAMETERS: parameters must be an array",
      jsonPointer: pointer,
    });
    return [];
  }
  const out: Parameter[] = [];
  value.forEach((raw, index) => {
    const itemPointer = `${pointer}/${index}`;
    if (!isRecord(raw)) {
      errors.push({
        message: "INVALID_PARAMETER: parameter must be an object",
        jsonPointer: itemPointer,
      });
      return;
    }
    if (typeof raw.$ref === "string") {
      return;
    }
    const name = typeof raw.name === "string" ? raw.name : undefined;
    const loc = typeof raw.in === "string" ? raw.in : undefined;
    if (!name || !loc || !PARAM_LOCATIONS.has(loc)) {
      errors.push({
        message:
          "INVALID_PARAMETER: requires name and in ∈ {path,query,header,cookie}",
        jsonPointer: itemPointer,
      });
      return;
    }
    const p: Parameter = {
      name,
      in: loc as Parameter["in"],
      required: raw.required === true,
      jsonPointer: itemPointer,
    };
    if (raw.deprecated === true) p.deprecated = true;
    if (typeof raw.description === "string") p.description = raw.description;
    if (typeof raw.style === "string") p.style = raw.style;
    if (typeof raw.explode === "boolean") p.explode = raw.explode;
    if (isRecord(raw.schema)) {
      p.schema = toSchemaNode(raw.schema);
    }
    out.push(p);
  });
  return out;
}

function mergeParameters(
  pathLevel: Parameter[],
  opLevel: Parameter[],
): Parameter[] {
  const map = new Map<string, Parameter>();
  for (const p of pathLevel) map.set(`${p.in}:${p.name}`, p);
  for (const p of opLevel) map.set(`${p.in}:${p.name}`, p);
  return [...map.values()].sort((a, b) =>
    a.in === b.in ? a.name.localeCompare(b.name) : a.in.localeCompare(b.in),
  );
}

function parseResponses(
  value: unknown,
  pointer: string,
  errors: ParseError[],
): Response[] {
  if (!isRecord(value)) {
    errors.push({
      message: "INVALID_RESPONSES: responses must be an object",
      jsonPointer: pointer,
    });
    return [];
  }
  const out: Response[] = [];
  for (const [status, raw] of Object.entries(value)) {
    const rPointer = `${pointer}/${escapePointer(status)}`;
    if (!isRecord(raw)) {
      errors.push({
        message: "INVALID_RESPONSE: response must be an object",
        jsonPointer: rPointer,
      });
      continue;
    }
    const response: Response = {
      status,
      content: [],
      headers: [],
      jsonPointer: rPointer,
    };
    if (typeof raw.description === "string") response.description = raw.description;
    if (isRecord(raw.content)) {
      response.content = parseContent(raw.content, `${rPointer}/content`);
    }
    if (isRecord(raw.headers)) {
      response.headers = Object.keys(raw.headers).sort();
    }
    out.push(response);
  }
  out.sort((a, b) => a.status.localeCompare(b.status));
  return out;
}

function parseRequestBody(
  raw: Record<string, unknown>,
  pointer: string,
): RequestBody {
  const body: RequestBody = {
    required: raw.required === true,
    content: [],
    jsonPointer: pointer,
  };
  if (typeof raw.description === "string") body.description = raw.description;
  if (isRecord(raw.content)) {
    body.content = parseContent(raw.content, `${pointer}/content`);
  }
  return body;
}

function parseContent(
  value: Record<string, unknown>,
  _pointer: string,
): ContentMedia[] {
  const out: ContentMedia[] = [];
  for (const [mediaType, raw] of Object.entries(value)) {
    const media: ContentMedia = { mediaType };
    if (isRecord(raw) && isRecord(raw.schema)) {
      media.schema = toSchemaNode(raw.schema);
    }
    out.push(media);
  }
  out.sort((a, b) => a.mediaType.localeCompare(b.mediaType));
  return out;
}

function toSchemaNode(raw: Record<string, unknown>): SchemaNode {
  const node: SchemaNode = {};
  if (typeof raw.type === "string") node.type = raw.type;
  else if (Array.isArray(raw.type)) {
    node.type = raw.type.filter((t): t is string => typeof t === "string");
  }
  if (typeof raw.format === "string") node.format = raw.format;
  if (typeof raw.$ref === "string") node.ref = raw.$ref;
  if (Array.isArray(raw.enum)) node.enum = raw.enum;
  if (isRecord(raw.properties)) {
    node.properties = {};
    for (const [key, prop] of Object.entries(raw.properties)) {
      if (isRecord(prop)) node.properties[key] = toSchemaNode(prop);
    }
  }
  if (Array.isArray(raw.required)) {
    node.required = raw.required.filter((r): r is string => typeof r === "string");
  }
  if (typeof raw.maxLength === "number") node.maxLength = raw.maxLength;
  if (typeof raw.maximum === "number") node.maximum = raw.maximum;
  if (typeof raw.description === "string") node.description = raw.description;
  if (typeof raw.additionalProperties === "boolean") {
    node.additionalProperties = raw.additionalProperties;
  }
  if (isRecord(raw.items)) node.items = toSchemaNode(raw.items);
  if ("example" in raw) node.example = raw.example;
  return node;
}

function isRemoteRef(ref: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(ref) || ref.startsWith("//");
}

function isOutsideRootRef(ref: string): boolean {
  if (ref.startsWith("#")) return false;
  if (isRemoteRef(ref)) return false;
  return true;
}

function pickExtensions(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.startsWith("x-")) out[key] = value;
  }
  return out;
}

function buildComponentIndex(doc: Record<string, unknown>): ComponentIndex {
  const components = isRecord(doc.components) ? doc.components : {};
  const schemas = isRecord(components.schemas)
    ? Object.keys(components.schemas).sort()
    : [];
  const responses = isRecord(components.responses)
    ? Object.keys(components.responses).sort()
    : [];
  const parameters = isRecord(components.parameters)
    ? Object.keys(components.parameters).sort()
    : [];
  const securitySchemes = isRecord(components.securitySchemes)
    ? Object.keys(components.securitySchemes).sort()
    : [];

  const schemaNodes: Record<string, SchemaNode> = {};
  if (isRecord(components.schemas)) {
    for (const name of Object.keys(components.schemas).sort()) {
      const node = components.schemas[name];
      if (isRecord(node)) schemaNodes[name] = toSchemaNode(node);
    }
  }

  const securitySchemeDefs: SecuritySchemeDef[] = [];
  if (isRecord(components.securitySchemes)) {
    for (const name of Object.keys(components.securitySchemes).sort()) {
      const raw = components.securitySchemes[name];
      if (!isRecord(raw)) continue;
      const def: SecuritySchemeDef = {
        name,
        type: typeof raw.type === "string" ? raw.type : "unknown",
      };
      if (typeof raw.scheme === "string") def.scheme = raw.scheme;
      if (typeof raw.in === "string") def.in = raw.in;
      if (typeof raw.name === "string") def.paramName = raw.name;
      securitySchemeDefs.push(def);
    }
  }

  return {
    schemas,
    responses,
    parameters,
    securitySchemes,
    schemaNodes,
    securitySchemeDefs,
  };
}

function escapePointer(segment: string): string {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}

function compareOperations(a: Operation, b: Operation): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  if (a.method !== b.method) return a.method < b.method ? -1 : 1;
  return 0;
}

export function validateRefs(doc: unknown): ParseError[] {
  const errors: ParseError[] = [];
  walkRefs(doc, "", errors);
  return errors;
}

function walkRefs(value: unknown, pointer: string, errors: ParseError[]): void {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walkRefs(item, `${pointer}/${i}`, errors));
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.$ref === "string") {
    const ref = value.$ref;
    if (isRemoteRef(ref)) {
      errors.push({
        message: `REF_REMOTE_FORBIDDEN: remote $ref is not allowed: ${ref}`,
        jsonPointer: pointer,
      });
    } else if (isOutsideRootRef(ref)) {
      errors.push({
        message: `REF_OUTSIDE_ROOT: $ref escapes document root: ${ref}`,
        jsonPointer: pointer,
      });
    }
  }
  for (const [key, child] of Object.entries(value)) {
    walkRefs(child, `${pointer}/${escapePointer(key)}`, errors);
  }
}

function detectRefCycles(
  doc: Record<string, unknown>,
  warnings: ParseWarning[],
): void {
  const components = isRecord(doc.components) ? doc.components : {};
  const schemas = isRecord(components.schemas) ? components.schemas : {};
  const seen = new Set<string>();
  const stack = new Set<string>();

  function visit(name: string, pointer: string): void {
    if (stack.has(name)) {
      if (!seen.has(name)) {
        seen.add(name);
        warnings.push({
          code: "REF_CYCLE",
          message: `Circular $ref detected at #/components/schemas/${name} (left unexpanded)`,
          jsonPointer: pointer,
        });
      }
      return;
    }
    const node = schemas[name];
    if (!isRecord(node)) return;
    stack.add(name);
    walkSchemaRefs(node, `/components/schemas/${escapePointer(name)}`, visit);
    stack.delete(name);
  }

  for (const name of Object.keys(schemas)) {
    visit(name, `/components/schemas/${escapePointer(name)}`);
  }

  function walkSchemaRefs(
    node: Record<string, unknown>,
    pointer: string,
    onRef: (schemaName: string, pointer: string) => void,
  ): void {
    if (typeof node.$ref === "string") {
      const ref = node.$ref;
      if (ref.startsWith("#/components/schemas/")) {
        const schemaName = decodeURIComponent(
          ref.slice("#/components/schemas/".length),
        );
        onRef(schemaName, pointer);
      }
      return;
    }
    if (isRecord(node.properties)) {
      for (const [key, prop] of Object.entries(node.properties)) {
        if (isRecord(prop)) {
          walkSchemaRefs(
            prop,
            `${pointer}/properties/${escapePointer(key)}`,
            onRef,
          );
        }
      }
    }
    if (isRecord(node.items)) {
      walkSchemaRefs(node.items, `${pointer}/items`, onRef);
    }
    if (Array.isArray(node.allOf)) {
      node.allOf.forEach((s, i) => {
        if (isRecord(s)) walkSchemaRefs(s, `${pointer}/allOf/${i}`, onRef);
      });
    }
    if (Array.isArray(node.anyOf)) {
      node.anyOf.forEach((s, i) => {
        if (isRecord(s)) walkSchemaRefs(s, `${pointer}/anyOf/${i}`, onRef);
      });
    }
    if (Array.isArray(node.oneOf)) {
      node.oneOf.forEach((s, i) => {
        if (isRecord(s)) walkSchemaRefs(s, `${pointer}/oneOf/${i}`, onRef);
      });
    }
  }
}
