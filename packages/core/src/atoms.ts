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
  if (field === "servers") return (spec.servers?.length ?? 0) > 0;
  if (field === "components.schemas") {
    return (spec.components?.schemas?.length ?? 0) > 0;
  }
  return false;
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

function hasAnyExample(content: Array<{ schema?: SchemaNode }>): boolean {
  return content.some(
    (c) =>
      c.schema?.example !== undefined ||
      (c as { example?: unknown }).example !== undefined,
  );
}

export function evaluateAtom(
  atom: AtomMatcher,
  op: Operation | undefined,
  spec: Spec,
): boolean {
  if (atom.op === "docFieldMissing") {
    return !docFieldPresent(spec, atom.field);
  }

  if (!op) return false;

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
