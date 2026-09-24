import type { AtomMatcher, Matcher, OperationField } from "./rule.js";
import type { Operation, SchemaNode, Spec } from "./spec.js";

function getPathSegments(op: Operation): string[] {
  return op.path.split("/").filter((s) => s.length > 0);
}

function isTemplate(seg: string): boolean {
  return seg.startsWith("{") && seg.endsWith("}");
}

function resolveSegmentIndex(
  segments: string[],
  index: number | "last" | undefined,
): string | undefined {
  if (index === undefined || index === "last" || index === -1) {
    for (let i = segments.length - 1; i >= 0; i--) {
      const seg = segments[i]!;
      if (!isTemplate(seg)) return seg;
    }
    return undefined;
  }
  if (index < 0 || index >= segments.length) return undefined;
  return segments[index];
}

function isPlural(segment: string): boolean {
  const s = segment.toLowerCase();
  if (s.length <= 1) return false;
  if (/(ss|us|is)$/.test(s)) return false;
  if (/s$/.test(s)) return true;
  if (/[^aeiou]es$/.test(s)) return true;
  return false;
}

function matchesStatus(actual: string, wanted: string): boolean {
  const a = actual.toLowerCase();
  const w = wanted.toLowerCase();
  if (a === w) return true;
  if (/^\dxx$/.test(w)) return a[0] === w[0];
  return false;
}

function hasResponse(op: Operation, status: string): boolean {
  return op.responses.some((r) => matchesStatus(r.status, status));
}

function getField(op: Operation, field: OperationField): unknown {
  switch (field) {
    case "operationId":
      return op.operationId;
    case "summary":
      return op.summary;
    case "description":
      return op.description;
    case "tags":
      return op.tags.length > 0 ? op.tags : undefined;
    case "requestBody":
      return op.requestBody;
    case "security":
      return op.security;
    case "deprecated":
      return op.deprecated ? true : undefined;
    case "extensions":
      return Object.keys(op.extensions ?? {}).length > 0
        ? op.extensions
        : undefined;
  }
}

function getDescriptionText(
  op: Operation,
  target: "summary" | "description" | "response",
): string | undefined {
  if (target === "summary") return op.summary;
  if (target === "description") return op.description;
  for (const r of op.responses) {
    if (r.description && r.description.length > 0) return r.description;
  }
  return undefined;
}

function docFieldPresent(spec: Spec, field: string): boolean {
  if (field === "info.title") return Boolean(spec.info?.title);
  if (field === "info.version") return Boolean(spec.info?.version);
  if (field === "info.description") return Boolean(spec.info?.description);
  if (field === "servers") return (spec.servers?.length ?? 0) > 0;
  if (field === "tags") return (spec.rootTags?.length ?? 0) > 0;
  if (field === "components.schemas") {
    return (spec.components?.schemas?.length ?? 0) > 0;
  }
  return false;
}

function safeRegex(pattern: string): RegExp | undefined {
  if (pattern.length > 200) return undefined;
  try {
    return new RegExp(pattern);
  } catch {
    return undefined;
  }
}

function matchesParamIn(
  p: { in: string },
  wanted: string | undefined,
): boolean {
  return wanted === undefined || wanted === "any" || p.in === wanted;
}

function collectOpSchemas(op: Operation): SchemaNode[] {
  const out: SchemaNode[] = [];
  for (const c of op.requestBody?.content ?? []) {
    if (c.schema) out.push(c.schema);
  }
  for (const r of op.responses) {
    for (const c of r.content) {
      if (c.schema) out.push(c.schema);
    }
  }
  return out;
}

function walkSchemaProps(
  node: SchemaNode | undefined,
  visit: (prop: string, schema: SchemaNode) => void,
  depth = 0,
): void {
  if (!node || depth > 40) return;
  if (node.properties) {
    for (const [key, child] of Object.entries(node.properties)) {
      visit(key, child);
      walkSchemaProps(child, visit, depth + 1);
    }
  }
  if (node.items) walkSchemaProps(node.items, visit, depth + 1);
}

function resolveSchemaRef(spec: Spec, ref: string | undefined): SchemaNode | undefined {
  if (!ref || !ref.startsWith("#/components/schemas/")) return undefined;
  const name = decodeURIComponent(ref.slice("#/components/schemas/".length));
  return spec.components.schemaNodes?.[name];
}

function deepResolve(spec: Spec, node: SchemaNode | undefined, depth = 0): SchemaNode | undefined {
  if (!node || depth > 20) return node;
  if (node.ref) {
    const target = resolveSchemaRef(spec, node.ref);
    if (target) return deepResolve(spec, target, depth + 1);
  }
  return node;
}

function allDocSchemas(spec: Spec): Array<{ name: string; schema: SchemaNode }> {
  const nodes = spec.components.schemaNodes ?? {};
  return Object.entries(nodes)
    .map(([name, schema]) => ({ name, schema }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function isListCollectionPath(path: string): boolean {
  const segs = getPathSegments({ path } as Operation);
  if (segs.length === 0) return false;
  const last = segs[segs.length - 1]!;
  if (isTemplate(last)) return false;
  return isPlural(last);
}

const PAGINATION_PARAM_RE =
  /^(page|pageSize|per_page|perPage|limit|offset|cursor|start|after|before|size|max)$/i;
const TOTAL_FIELD_RE = /^(total|totalCount|total_count|count|numberOfResults|totalItems)$/i;
const SENSITIVE_FIELD_RE = /(password|passwd|secret|token|apiKey|api_key|creditCard|credit_card|ssn|privateKey)/i;
const PROBLEM_MEDIA = "application/problem+json";

function schemaHasTotal(spec: Spec, op: Operation): boolean {
  for (const raw of op.responses) {
    for (const c of raw.content) {
      const resolved = deepResolve(spec, c.schema);
      if (!resolved) continue;
      if (resolved.properties) {
        for (const key of Object.keys(resolved.properties)) {
          if (TOTAL_FIELD_RE.test(key)) return true;
        }
      }
      if (resolved.ref) {
        const target = resolveSchemaRef(spec, resolved.ref);
        if (target?.properties) {
          for (const key of Object.keys(target.properties)) {
            if (TOTAL_FIELD_RE.test(key)) return true;
          }
        }
      }
    }
  }
  return false;
}

function hasSensitiveResponseField(spec: Spec, op: Operation): boolean {
  for (const r of op.responses) {
    if (!/^2/.test(r.status) && !/^2xx$/i.test(r.status)) continue;
    for (const c of r.content) {
      const resolved = deepResolve(spec, c.schema);
      if (!resolved) continue;
      let found = false;
      walkSchemaProps(resolved, (prop) => {
        if (SENSITIVE_FIELD_RE.test(prop)) found = true;
      });
      if (found) return true;
      if (resolved.properties) {
        for (const key of Object.keys(resolved.properties)) {
          if (SENSITIVE_FIELD_RE.test(key)) return true;
        }
      }
    }
  }
  return false;
}

function objectSchemasInline(spec: Spec, op: Operation): boolean {
  for (const raw of collectOpSchemas(op)) {
    const resolved = deepResolve(spec, raw);
    if (resolved?.type === "object" && !resolved.ref && resolved.properties) {
      return true;
    }
  }
  return false;
}

function isEmptyObjectSchema(node: SchemaNode): boolean {
  return (
    node.type === "object" &&
    !node.ref &&
    (node.properties === undefined || Object.keys(node.properties).length === 0) &&
    node.additionalProperties === undefined &&
    node.enum === undefined
  );
}

function isAmbiguousSchema(node: SchemaNode): boolean {
  return (
    node.type === undefined &&
    node.ref === undefined &&
    node.enum === undefined &&
    (node.properties === undefined || Object.keys(node.properties).length === 0) &&
    node.items === undefined
  );
}

function isNonStandardDateTimeFormat(node: SchemaNode): boolean {
  if (node.format === undefined) return false;
  const f = node.format.toLowerCase();
  if (f === "date-time" || f === "date") return false;
  return f === "datetime" || f === "iso8601" || f === "iso-8601" || f === "rfc3339";
}

function enumValuesCasing(values: unknown[]): "mixed" | "consistent" | "na" {
  const strings = values.filter((v): v is string => typeof v === "string");
  if (strings.length < 2) return "na";
  const styles = new Set<string>();
  for (const v of strings) {
    if (/^[a-z][a-z0-9]*$/.test(v)) styles.add("lower");
    else if (/^[A-Z][A-Z0-9]*$/.test(v)) styles.add("upper");
    else if (/^[a-z]+([A-Z][a-z0-9]*)+$/.test(v)) styles.add("camel");
    else if (/^[A-Za-z0-9]+(-[A-Za-z0-9]+)+$/.test(v)) styles.add("kebab");
    else if (/^[A-Za-z0-9]+(_[A-Za-z0-9]+)+$/.test(v)) styles.add("snake");
    else styles.add("other");
  }
  return styles.size > 1 ? "mixed" : "consistent";
}

function errorResponses(op: Operation): typeof op.responses {
  return op.responses.filter((r) => /^[45]/.test(r.status));
}

function schemaDepth(node: SchemaNode | undefined, depth = 0): number {
  if (!node || depth > 50) return depth;
  let max = depth;
  if (node.properties) {
    for (const child of Object.values(node.properties)) {
      max = Math.max(max, schemaDepth(child, depth + 1));
    }
  }
  return max;
}

function isLocalHostname(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h === "[::1]";
}

function isInsecureServerUrl(url: string): boolean {
  if (url.startsWith("https://")) return false;
  if (url.startsWith("http://")) {
    try {
      return !isLocalHostname(new URL(url).hostname);
    } catch {
      return true;
    }
  }
  return false;
}

function hasAnyExample(content: Array<{ schema?: SchemaNode }>): boolean {
  return content.some(
    (c) =>
      c.schema?.example !== undefined ||
      (c as { example?: unknown }).example !== undefined,
  );
}

function getPathParamNames(path: string): string[] {
  const out: string[] = [];
  for (const match of path.matchAll(/\{([^}]+)\}/g)) {
    const name = match[1];
    if (name !== undefined && name.length > 0) out.push(name);
  }
  return out;
}

export function evaluateAtom(
  atom: AtomMatcher,
  op: Operation | undefined,
  spec: Spec,
): boolean {
  if (atom.op === "docFieldMissing") {
    return !docFieldPresent(spec, atom.field);
  }
  if (atom.op === "openapiVersionMismatch") {
    try {
      return !new RegExp(atom.pattern).test(spec.openapiVersion);
    } catch {
      return false;
    }
  }
  if (atom.op === "serverInsecure") {
    return (spec.servers ?? []).some((server) => isInsecureServerUrl(server.url));
  }
  if (!op) return evaluateDocAtom(atom, spec);

  switch (atom.op) {
    case "method":
      return atom.in.map((m) => m.toLowerCase()).includes(op.method);
    case "pathHasPrefix":
      return op.path.startsWith(atom.prefix);
    case "pathMatches": {
      const segments = getPathSegments(op);
      const target =
        atom.segmentIndex !== undefined
          ? resolveSegmentIndex(segments, atom.segmentIndex)
          : op.path;
      if (target === undefined) return false;
      try {
        return new RegExp(atom.pattern).test(target);
      } catch {
        return false;
      }
    }
    case "pathSegmentPlural": {
      const segments = getPathSegments(op);
      const target = resolveSegmentIndex(segments, atom.segmentIndex);
      if (target === undefined) return false;
      return isPlural(target);
    }
    case "presentField":
      return getField(op, atom.field) !== undefined;
    case "missingField":
      return getField(op, atom.field) === undefined;
    case "responseMissing":
      return !hasResponse(op, atom.status);
    case "responsePresent":
      return hasResponse(op, atom.status);
    case "descriptionMinLength": {
      const text = getDescriptionText(op, atom.target);
      if (text === undefined) return false;
      return text.length >= atom.min;
    }
    case "descriptionMatches": {
      const text = atom.target === "summary" ? op.summary : op.description;
      if (text === undefined) return false;
      try {
        return new RegExp(atom.pattern).test(text);
      } catch {
        return false;
      }
    }
    case "operationIdRequired":
      return op.operationId !== undefined && op.operationId.length > 0;
    case "operationIdPattern": {
      if (op.operationId === undefined) return false;
      try {
        return new RegExp(atom.pattern).test(op.operationId);
      } catch {
        return false;
      }
    }
    case "securityMissing":
      return !op.security || op.security.length === 0;
    case "parameterNamingPattern": {
      const params = op.parameters.filter(
        (p) =>
          atom.in === undefined || atom.in === "any" || p.in === atom.in,
      );
      if (params.length === 0) return false;
      try {
        const re = new RegExp(atom.pattern);
        return params.every((p) => re.test(p.name));
      } catch {
        return false;
      }
    }
    case "exampleRequired": {
      if (atom.target === "operation") {
        const rb = op.requestBody;
        if (!rb) return false;
        return hasAnyExample(rb.content);
      }
      const wanted = atom.status;
      const responses =
        wanted !== undefined
          ? op.responses.filter((r) => matchesStatus(r.status, wanted))
          : op.responses;
      if (responses.length === 0) return false;
      return responses.every((r) => hasAnyExample(r.content));
    }
    case "sensitiveExample": {
      const text = JSON.stringify(op);
      return /(password|secret|token|api[_-]?key)\s*[:=]\s*["'][^"']+["']/i.test(
        text,
      );
    }
    case "deprecatedWithoutSunset": {
      if (!op.deprecated) return false;
      const sunset = op.extensions?.["x-sunset"];
      return sunset === undefined;
    }
    case "specExtensionPresent":
      return (
        op.extensions?.[atom.name] !== undefined ||
        spec.extensions?.[atom.name] !== undefined
      );
    case "schemaInlineDepthMax": {
      const bodyDepth = op.requestBody
        ? schemaDepth(op.requestBody.content[0]?.schema)
        : 0;
      const respDepths = op.responses.map((r) =>
        r.content[0]?.schema ? schemaDepth(r.content[0].schema) : 0,
      );
      return bodyDepth > atom.max || respDepths.some((d) => d > atom.max);
    }
    case "headerRequired": {
      if (atom.in === "response") {
        return op.responses.some((r) =>
          (r.headers ?? []).some(
            (h) => h.toLowerCase() === atom.name.toLowerCase(),
          ),
        );
      }
      return op.parameters.some(
        (p) =>
          p.in === "header" &&
          p.name.toLowerCase() === atom.name.toLowerCase(),
      );
    }
    case "pathParamUndeclared": {
      const names = getPathParamNames(op.path);
      if (names.length === 0) return false;
      const declared = new Set(
        op.parameters.filter((p) => p.in === "path").map((p) => p.name),
      );
      return names.some((n) => !declared.has(n));
    }
    case "pathParamNotRequired": {
      const pathParams = op.parameters.filter((p) => p.in === "path");
      if (pathParams.length === 0) return false;
      return pathParams.some((p) => !p.required);
    }
    case "responseDescriptionMissing":
      return op.responses.some(
        (r) => r.description === undefined || r.description.length === 0,
      );
    case "operationIdDuplicate": {
      if (op.operationId === undefined || op.operationId.length === 0) {
        return false;
      }
      return (
        spec.operations.filter((o) => o.operationId === op.operationId)
          .length > 1
      );
    }
    case "securitySchemeMissing": {
      if (!op.security || op.security.length === 0) return false;
      const known = new Set(spec.components.securitySchemes ?? []);
      return op.security.some((req) => !known.has(req.name));
    }
    case "parameterNamingViolation": {
      const params = op.parameters.filter((p) => matchesParamIn(p, atom.in));
      if (params.length === 0) return false;
      const re = safeRegex(atom.pattern);
      if (!re) return false;
      return params.some((p) => !re.test(p.name));
    }
    case "parameterDuplicate": {
      const seen = new Set<string>();
      for (const p of op.parameters) {
        const key = `${p.in}:${p.name}`;
        if (seen.has(key)) return true;
        seen.add(key);
      }
      return false;
    }
    case "booleanParamNotTyped": {
      return op.parameters.some(
        (p) =>
          p.in === "query" &&
          p.schema?.type === "boolean" &&
          (p.description === undefined || p.description.length === 0),
      );
    }
    case "arrayParamNotExploded": {
      return op.parameters.some((p) => {
        const t = p.schema?.type;
        const isArray =
          t === "array" || (Array.isArray(t) && t.includes("array"));
        return isArray && p.explode === false;
      });
    }
    case "pageParamWithoutMax": {
      return op.parameters.some((p) => {
        if (p.in !== "query") return false;
        if (!PAGINATION_PARAM_RE.test(p.name)) return false;
        const schema = p.schema;
        return (
          schema !== undefined &&
          schema.maximum === undefined &&
          schema.ref === undefined
        );
      });
    }
    case "paginationParamMissing": {
      if (op.method !== "get") return false;
      if (!isListCollectionPath(op.path)) return false;
      return !op.parameters.some(
        (p) => p.in === "query" && PAGINATION_PARAM_RE.test(p.name),
      );
    }
    case "paginationTotalMissing": {
      if (op.method !== "get") return false;
      if (!isListCollectionPath(op.path)) return false;
      return !schemaHasTotal(spec, op);
    }
    case "collectionGetNonArrayResponse": {
      if (op.method !== "get") return false;
      if (!isListCollectionPath(op.path)) return false;
      const ok = op.responses.some((r) => {
        if (!/^2/.test(r.status)) return false;
        if (r.content.length === 0) return false;
        return r.content.some((c) => {
          const resolved = deepResolve(spec, c.schema);
          if (!resolved) return false;
          return (
            resolved.type === "array" ||
            resolved.items !== undefined ||
            (resolved.properties !== undefined &&
              Object.keys(resolved.properties).some((k) =>
                /^(items|data|results|records)$/i.test(k),
              ))
          );
        });
      });
      return !ok;
    }
    case "responseHasContent": {
      return op.responses.some(
        (r) => matchesStatus(r.status, atom.status) && r.content.length > 0,
      );
    }
    case "redirectMissingLocation": {
      const redirects = op.responses.filter((r) => /^3\d{2}$/.test(r.status));
      if (redirects.length === 0) return false;
      return redirects.some(
        (r) =>
          !(r.headers ?? []).some((h) => h.toLowerCase() === "location"),
      );
    }
    case "securityEmptyOverride": {
      return Array.isArray(op.security) && op.security.length === 0;
    }
    case "errorUsesJsonNotProblem": {
      return errorResponses(op).some((r) =>
        r.content.some(
          (c) =>
            c.mediaType === "application/json" &&
            !r.content.some((x) => x.mediaType === PROBLEM_MEDIA),
        ),
      );
    }
    case "errorSchemaMissingTitle": {
      for (const r of errorResponses(op)) {
        for (const c of r.content) {
          const resolved = deepResolve(spec, c.schema);
          if (!resolved?.properties) continue;
          const keys = Object.keys(resolved.properties);
          if (keys.length === 0) continue;
          if (!keys.includes("title")) return true;
        }
      }
      return false;
    }
    case "objectSchemaNotRef": {
      return objectSchemasInline(spec, op);
    }
    case "emptyObjectSchema": {
      return collectOpSchemas(op).some((n) => {
        const resolved = deepResolve(spec, n);
        return resolved !== undefined && isEmptyObjectSchema(resolved);
      });
    }
    case "schemaTypeAmbiguous": {
      return collectOpSchemas(op).some((n) => {
        const resolved = deepResolve(spec, n);
        return resolved !== undefined && isAmbiguousSchema(resolved);
      });
    }
    case "enumWithoutDescription": {
      return collectOpSchemas(op).some((n) => {
        const resolved = deepResolve(spec, n);
        if (!resolved?.enum || resolved.enum.length === 0) return false;
        if (resolved.description) return false;
        if (resolved.ref) {
          const target = resolveSchemaRef(spec, resolved.ref);
          return !target?.description;
        }
        return true;
      });
    }
    case "additionalPropertiesAbsent": {
      return collectOpSchemas(op).some((n) => {
        const resolved = deepResolve(spec, n);
        if (resolved?.type !== "object") return false;
        return resolved.additionalProperties === undefined;
      });
    }
    case "enumCasingInconsistent": {
      return collectOpSchemas(op).some((n) => {
        const resolved = deepResolve(spec, n);
        if (!resolved?.enum) return false;
        return enumValuesCasing(resolved.enum) === "mixed";
      });
    }
    case "nonStandardDateTimeFormat": {
      return collectOpSchemas(op).some((n) => {
        const resolved = deepResolve(spec, n);
        if (!resolved) return false;
        if (isNonStandardDateTimeFormat(resolved)) return true;
        if (resolved.properties) {
          return Object.values(resolved.properties).some(
            isNonStandardDateTimeFormat,
          );
        }
        return false;
      });
    }
    case "sensitiveFieldInResponse": {
      return hasSensitiveResponseField(spec, op);
    }
    case "propertyNamingViolation": {
      const re = safeRegex(atom.pattern);
      if (!re) return false;
      for (const schema of collectOpSchemas(op)) {
        const resolved = deepResolve(spec, schema);
        let violation = false;
        walkSchemaProps(resolved, (prop) => {
          if (!re.test(prop)) violation = true;
        });
        if (violation) return true;
      }
      return false;
    }
    case "externalDocsMissingUrl": {
      if (!op.externalDocs) return false;
      return !op.externalDocs.url || op.externalDocs.url.length === 0;
    }
    default:
      return evaluateDocAtom(atom, spec);
  }
}

function evaluateDocAtom(atom: AtomMatcher, spec: Spec): boolean {
  switch (atom.op) {
    case "operationTagsWithoutRootTags": {
      const hasRoot = (spec.rootTags?.length ?? 0) > 0;
      if (hasRoot) return false;
      return spec.operations.some((op) => op.tags.length > 0);
    }
    case "schemaNameNotMatching": {
      const re = safeRegex(atom.pattern);
      if (!re) return false;
      return allDocSchemas(spec).some(({ name }) => !re.test(name));
    }
    case "errorMediaTypeInconsistent": {
      const media = new Set<string>();
      for (const op of spec.operations) {
        for (const r of op.responses) {
          if (!/^[45]/.test(r.status)) continue;
          for (const c of r.content) media.add(c.mediaType);
        }
      }
      return media.size > 1;
    }
    case "missingAny5xx": {
      return !spec.operations.some((op) =>
        op.responses.some(
          (r) => /^5\d{2}$/.test(r.status) || r.status === "5xx",
        ),
      );
    }
    case "securityDeclaredNowhere": {
      const global = spec.security !== undefined && spec.security.length > 0;
      if (global) return false;
      return !spec.operations.some(
        (op) => op.security !== undefined && op.security.length > 0,
      );
    }
    case "apiKeySchemeInQuery": {
      return (spec.components.securitySchemeDefs ?? []).some(
        (s) => s.type === "apiKey" && (s.in ?? "").toLowerCase() === "query",
      );
    }
    case "bearerSchemeWithoutAuthHeader": {
      const hasBearer = (spec.components.securitySchemeDefs ?? []).some(
        (s) =>
          s.type === "http" && (s.scheme ?? "").toLowerCase() === "bearer",
      );
      if (!hasBearer) return false;
      return !spec.operations.some((op) =>
        op.parameters.some(
          (p) =>
            p.in === "header" && p.name.toLowerCase() === "authorization",
        ),
      );
    }
    case "versionStyleInconsistent": {
      const styles = new Set<string>();
      for (const server of spec.servers ?? []) {
        if (/(^|\/)v\d+/.test(server.url)) styles.add("server-path");
        if (/[?&]version=/.test(server.url)) styles.add("server-query");
      }
      for (const op of spec.operations) {
        if (/(^|\/)v\d+/.test(op.path)) styles.add("path");
        if (
          op.parameters.some(
            (p) => p.in === "header" && /api[-_]?version/i.test(p.name),
          )
        ) {
          styles.add("header");
        }
        if (
          op.parameters.some(
            (p) =>
              p.in === "query" && /^(version|apiVersion)$/i.test(p.name),
          )
        ) {
          styles.add("query");
        }
      }
      return styles.size > 1;
    }
    case "breakingChangePolicyUndocumented": {
      const desc = (spec.info.description ?? "").toLowerCase();
      const hasPolicy =
        /breaking\s*change|deprecation\s*policy|compatibility\s*polic/.test(
          desc,
        ) ||
        Object.keys(spec.extensions ?? {}).some((k) =>
          /breaking|deprecat|versioning/i.test(k),
        );
      return !hasPolicy;
    }
    case "infoVersionNotMatching": {
      const version = spec.info.version;
      if (!version) return true;
      const re = safeRegex(atom.pattern);
      if (!re) return false;
      return !re.test(version);
    }
    case "inputSizeExceeds": {
      return (spec.inputBytes ?? 0) > atom.maxBytes;
    }
    case "paginationNamingInconsistent": {
      const families = new Set<string>();
      for (const op of spec.operations) {
        if (op.method !== "get") continue;
        if (!isListCollectionPath(op.path)) continue;
        for (const p of op.parameters) {
          if (p.in !== "query" || !PAGINATION_PARAM_RE.test(p.name)) {
            continue;
          }
          const lower = p.name.toLowerCase().replace(/[_-]/g, "");
          if (/page|offset|cursor|after|before|start/.test(lower)) {
            families.add(
              lower.includes("cursor")
                ? "cursor"
                : lower.includes("page")
                  ? "page"
                  : "offset",
            );
          } else if (/limit|size|max/.test(lower)) {
            families.add("limit");
          }
        }
      }
      const pagingFamilies = new Set(
        [...families].filter((f) => f !== "limit"),
      );
      return pagingFamilies.size > 1;
    }
    default:
      return false;
  }
}

export function evaluateMatcher(
  m: Matcher,
  op: Operation | undefined,
  spec: Spec,
): boolean {
  if ("all" in m) return m.all.every((c) => evaluateMatcher(c, op, spec));
  if ("any" in m) return m.any.some((c) => evaluateMatcher(c, op, spec));
  if ("not" in m) return !evaluateMatcher(m.not, op, spec);
  return evaluateAtom(m, op, spec);
}
