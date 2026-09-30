import { computeFingerprint, sortFindings } from "./finding.js";
import type { Operation, SchemaNode, SecurityRequirement, Spec } from "./spec.js";
import type { Finding, SourceRef } from "./rule.js";

export const DIFF_PACK_ID = "diff";

export interface DiffOptions {
  /** Label for locations of nodes that only exist in the old spec. */
  oldLabel: string;
  /** Label for locations of nodes in the new spec. */
  newLabel: string;
  /** Stamped on findings; excluded from fingerprints. */
  packVersion: string;
}

export interface DiffResult {
  findings: Finding[];
}

interface BreakCheck {
  id: string;
  fix: string;
  source: SourceRef;
}

const SEMVER_SOURCE: SourceRef = {
  title: "Semantic Versioning 2.0.0",
  url: "https://semver.org/",
  section: "Major version X (X.y.z | X > 0)",
};

const OAS = "https://spec.openapis.org/oas/v3.1.0";

const CHECKS: Record<string, BreakCheck> = {
  "BRK-001": {
    id: "BRK-001",
    fix: "Restore the operation or ship the removal as a major version with migration notes.",
    source: SEMVER_SOURCE,
  },
  "BRK-002": {
    id: "BRK-002",
    fix: "Make the new parameter optional or ship it as a major version.",
    source: { title: "OpenAPI Specification", url: OAS, section: "Parameter Object" },
  },
  "BRK-003": {
    id: "BRK-003",
    fix: "Keep the request body optional (or present) or ship a major version.",
    source: { title: "OpenAPI Specification", url: OAS, section: "Request Body Object" },
  },
  "BRK-004": {
    id: "BRK-004",
    fix: "Make the new properties optional or ship a major version.",
    source: { title: "OpenAPI Specification", url: OAS, section: "Schema Object" },
  },
  "BRK-005": {
    id: "BRK-005",
    fix: "Restore the response status or ship the removal as a major version.",
    source: { title: "OpenAPI Specification", url: OAS, section: "Responses Object" },
  },
  "BRK-006": {
    id: "BRK-006",
    fix: "Restore the removed enum values or ship a major version.",
    source: { title: "OpenAPI Specification", url: OAS, section: "Schema Object" },
  },
  "BRK-007": {
    id: "BRK-007",
    fix: "Restore the previous type/format or ship a major version.",
    source: { title: "OpenAPI Specification", url: OAS, section: "Schema Object" },
  },
  "BRK-008": {
    id: "BRK-008",
    fix: "Keep the operation accessible without the new auth requirement or ship a major version.",
    source: { title: "OpenAPI Specification", url: OAS, section: "Security Requirement Object" },
  },
};

function opKey(method: string, path: string): string {
  return `${method.toUpperCase()} ${path}`;
}

function indexOps(spec: Spec): Map<string, Operation> {
  const map = new Map<string, Operation>();
  for (const op of spec.operations) {
    const key = opKey(op.method, op.path);
    if (!map.has(key)) map.set(key, op);
  }
  return map;
}

function resolveSchemaRef(ref: string, spec: Spec): SchemaNode | undefined {
  const m = /^#\/components\/schemas\/(.+)$/.exec(ref);
  if (m === null) return undefined;
  const name = m[1]!.replace(/~1/g, "/").replace(/~0/g, "~");
  return spec.components.schemaNodes?.[name];
}

interface SchemaSlot {
  label: string;
  node: SchemaNode;
}

function collectSlots(
  node: SchemaNode | undefined,
  spec: Spec,
  stack: string[],
  out: SchemaSlot[],
  label: string,
): void {
  if (node === undefined) return;
  let current = node;
  const pushed: string[] = [];
  while (current.ref !== undefined) {
    if (stack.includes(current.ref)) {
      for (const r of pushed) stack.splice(stack.indexOf(r), 1);
      return;
    }
    stack.push(current.ref);
    pushed.push(current.ref);
    const next = resolveSchemaRef(current.ref, spec);
    if (next === undefined) {
      for (const r of pushed) stack.splice(stack.indexOf(r), 1);
      return;
    }
    current = next;
  }
  out.push({ label, node: current });
  if (current.properties !== undefined) {
    for (const name of Object.keys(current.properties).sort()) {
      collectSlots(current.properties[name], spec, stack, out, `${label}.${name}`);
    }
  }
  if (current.items !== undefined) {
    collectSlots(current.items, spec, stack, out, `${label}[]`);
  }
  for (const r of pushed) stack.splice(stack.indexOf(r), 1);
}

function enumKey(value: unknown): string {
  return `${typeof value}:${JSON.stringify(value) ?? "undefined"}`;
}

function typeKey(node: SchemaNode): string {
  const type = Array.isArray(node.type) ? [...node.type].sort().join("|") : (node.type ?? "");
  return `${type}#${node.format ?? ""}`;
}

function effectiveSecurity(op: Operation, spec: Spec): SecurityRequirement[] {
  return op.security ?? spec.security ?? [];
}

interface DiffContext {
  oldSpec: Spec;
  newSpec: Spec;
  opts: DiffOptions;
  findings: Finding[];
}

function pushFinding(
  ctx: DiffContext,
  checkId: string,
  message: string,
  location: string,
  apiLocation: string,
): void {
  const check = CHECKS[checkId]!;
  const base = {
    ruleId: check.id,
    severity: "error" as const,
    category: "versioning" as const,
    message,
    location,
    apiLocation,
    fix: check.fix,
    source: check.source,
    packId: DIFF_PACK_ID,
    packVersion: ctx.opts.packVersion,
  };
  ctx.findings.push({ ...base, fingerprint: computeFingerprint(base) });
}

function checkRemovedOperations(ctx: DiffContext): void {
  const oldOps = indexOps(ctx.oldSpec);
  const newOps = indexOps(ctx.newSpec);
  for (const [key, op] of [...oldOps.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    if (!newOps.has(key)) {
      pushFinding(
        ctx,
        "BRK-001",
        `Operation removed: ${key}.`,
        `${ctx.opts.oldLabel}#${op.jsonPointer}`,
        key,
      );
    }
  }
}

function checkParameters(ctx: DiffContext, oldOp: Operation, newOp: Operation, key: string): void {
  const oldParams = new Map(oldOp.parameters.map((p) => [`${p.in} ${p.name}`, p]));
  for (const param of newOp.parameters) {
    const id = `${param.in} ${param.name}`;
    const old = oldParams.get(id);
    const where = `${ctx.opts.newLabel}#${param.jsonPointer}`;
    if (old === undefined) {
      if (param.required && param.in !== "path") {
        pushFinding(
          ctx,
          "BRK-002",
          `Required ${param.in} parameter "${param.name}" added to ${key}.`,
          where,
          key,
        );
      }
      continue;
    }
    if (!old.required && param.required) {
      pushFinding(
        ctx,
        "BRK-002",
        `${param.in} parameter "${param.name}" became required in ${key}.`,
        where,
        key,
      );
    }
  }
}

function checkRequestBody(ctx: DiffContext, oldOp: Operation, newOp: Operation, key: string): void {
  const oldBody = oldOp.requestBody;
  const newBody = newOp.requestBody;
  const oldRequired = oldBody?.required === true;
  const newRequired = newBody?.required === true;
  if (oldRequired && newBody === undefined) {
    pushFinding(
      ctx,
      "BRK-003",
      `Required request body removed from ${key}.`,
      `${ctx.opts.oldLabel}#${oldBody!.jsonPointer}`,
      key,
    );
    return;
  }
  if (!oldRequired && newRequired && newBody !== undefined) {
    pushFinding(
      ctx,
      "BRK-003",
      `Request body became required in ${key}.`,
      `${ctx.opts.newLabel}#${newBody.jsonPointer}`,
      key,
    );
  }
}

function requestSlots(
  op: Operation,
  spec: Spec,
): Array<{ label: string; slots: SchemaSlot[]; pointer: string }> {
  const out: Array<{ label: string; slots: SchemaSlot[]; pointer: string }> = [];
  const body = op.requestBody;
  if (body === undefined) return out;
  for (const media of body.content) {
    if (media.schema === undefined) continue;
    const slots: SchemaSlot[] = [];
    collectSlots(media.schema, spec, [], slots, `request body (${media.mediaType})`);
    out.push({ label: media.mediaType, slots, pointer: body.jsonPointer });
  }
  return out;
}

function responseSlots(
  op: Operation,
  spec: Spec,
): Map<string, { slots: SchemaSlot[]; pointer: string }> {
  const out = new Map<string, { slots: SchemaSlot[]; pointer: string }>();
  for (const response of op.responses) {
    const slots: SchemaSlot[] = [];
    for (const media of response.content) {
      if (media.schema === undefined) continue;
      collectSlots(media.schema, spec, [], slots, `response ${response.status} (${media.mediaType})`);
    }
    out.set(response.status, { slots, pointer: response.jsonPointer });
  }
  return out;
}

function paramSlots(
  op: Operation,
  spec: Spec,
): Map<string, { slots: SchemaSlot[]; pointer: string }> {
  const out = new Map<string, { slots: SchemaSlot[]; pointer: string }>();
  for (const param of op.parameters) {
    if (param.schema === undefined) continue;
    const slots: SchemaSlot[] = [];
    collectSlots(param.schema, spec, [], slots, `parameter "${param.name}" in ${param.in}`);
    out.set(`${param.in} ${param.name}`, { slots, pointer: param.jsonPointer });
  }
  return out;
}

function slotsByLabel(
  slots: SchemaSlot[],
): Map<string, SchemaNode> {
  const map = new Map<string, SchemaNode>();
  for (const slot of slots) {
    if (!map.has(slot.label)) map.set(slot.label, slot.node);
  }
  return map;
}

function checkRequiredProperties(
  ctx: DiffContext,
  key: string,
  oldGroups: Array<{ slots: SchemaSlot[]; pointer: string }>,
  newGroups: Array<{ slots: SchemaSlot[]; pointer: string }>,
  whereLabel: string,
): void {
  const oldByLabel = new Map<string, SchemaNode>();
  for (const group of oldGroups) {
    for (const [label, node] of slotsByLabel(group.slots)) {
      if (!oldByLabel.has(label)) oldByLabel.set(label, node);
    }
  }
  for (const group of newGroups) {
    for (const [label, node] of slotsByLabel(group.slots)) {
      const old = oldByLabel.get(label);
      if (old === undefined) continue;
      const oldRequired = new Set(old.required ?? []);
      const added = (node.required ?? []).filter((name) => !oldRequired.has(name)).sort();
      if (added.length > 0) {
        pushFinding(
          ctx,
          "BRK-004",
          `Required request properties added to ${label} in ${key}: ${added.map((n) => `"${n}"`).join(", ")}.`,
          `${whereLabel}#${group.pointer}`,
          key,
        );
      }
    }
  }
}

function checkEnumAndType(
  ctx: DiffContext,
  key: string,
  oldSlots: SchemaSlot[],
  newSlots: SchemaSlot[],
  whereLabel: string,
  pointer: string,
): void {
  const oldByLabel = slotsByLabel(oldSlots);
  for (const [label, node] of slotsByLabel(newSlots)) {
    const old = oldByLabel.get(label);
    if (old === undefined) continue;
    const newValues = new Set((node.enum ?? []).map(enumKey));
    const gone = (old.enum ?? []).filter((v) => !newValues.has(enumKey(v)));
    if (gone.length > 0) {
      pushFinding(
        ctx,
        "BRK-006",
        `Enum values removed from ${label} in ${key}: ${gone.map((v) => JSON.stringify(v) ?? String(v)).join(", ")}.`,
        `${whereLabel}#${pointer}`,
        key,
      );
    }
    if (typeKey(old) !== typeKey(node)) {
      const describe = (n: SchemaNode): string => {
        const type = Array.isArray(n.type) ? n.type.join("|") : (n.type ?? "any");
        return n.format !== undefined ? `${type} (${n.format})` : type;
      };
      pushFinding(
        ctx,
        "BRK-007",
        `Schema type changed for ${label} in ${key}: ${describe(old)} → ${describe(node)}.`,
        `${whereLabel}#${pointer}`,
        key,
      );
    }
  }
}

function checkResponses(ctx: DiffContext, oldOp: Operation, newOp: Operation, key: string): void {
  const newStatuses = new Set(newOp.responses.map((r) => r.status));
  for (const response of oldOp.responses) {
    if (!newStatuses.has(response.status)) {
      pushFinding(
        ctx,
        "BRK-005",
        `Response status "${response.status}" removed from ${key}.`,
        `${ctx.opts.oldLabel}#${response.jsonPointer}`,
        key,
      );
    }
  }
}

function checkSecurity(ctx: DiffContext, oldOp: Operation, newOp: Operation, key: string): void {
  const oldEff = effectiveSecurity(oldOp, ctx.oldSpec);
  const newEff = effectiveSecurity(newOp, ctx.newSpec);
  const where = `${ctx.opts.newLabel}#${newOp.jsonPointer}`;
  if (oldEff.length === 0 && newEff.length > 0) {
    pushFinding(ctx, "BRK-008", `Operation ${key} now requires authentication.`, where, key);
    return;
  }
  const oldByName = new Map(oldEff.map((s) => [s.name, new Set(s.scopes)]));
  for (const scheme of newEff) {
    const oldScopes = oldByName.get(scheme.name);
    if (oldScopes === undefined) {
      pushFinding(
        ctx,
        "BRK-008",
        `Operation ${key} gained security requirement "${scheme.name}".`,
        where,
        key,
      );
      continue;
    }
    const added = scheme.scopes.filter((s) => !oldScopes.has(s)).sort();
    if (added.length > 0) {
      pushFinding(
        ctx,
        "BRK-008",
        `Operation ${key} gained scopes for "${scheme.name}": ${added.join(", ")}.`,
        where,
        key,
      );
    }
  }
}

function checkOperationPair(ctx: DiffContext, key: string, oldOp: Operation, newOp: Operation): void {
  checkParameters(ctx, oldOp, newOp, key);
  checkRequestBody(ctx, oldOp, newOp, key);
  checkResponses(ctx, oldOp, newOp, key);
  checkSecurity(ctx, oldOp, newOp, key);

  const oldReq = requestSlots(oldOp, ctx.oldSpec);
  const newReq = requestSlots(newOp, ctx.newSpec);
  const oldByMedia = new Map(oldReq.map((g) => [g.label, g]));
  const newByMedia = new Map(newReq.map((g) => [g.label, g]));
  for (const [media, group] of newByMedia) {
    const old = oldByMedia.get(media);
    if (old === undefined) continue;
    checkRequiredProperties(ctx, key, [old], [group], ctx.opts.newLabel);
    checkEnumAndType(ctx, key, old.slots, group.slots, ctx.opts.newLabel, group.pointer);
  }

  const oldResp = responseSlots(oldOp, ctx.oldSpec);
  const newResp = responseSlots(newOp, ctx.newSpec);
  for (const [status, group] of newResp) {
    const old = oldResp.get(status);
    if (old === undefined) continue;
    checkEnumAndType(ctx, key, old.slots, group.slots, ctx.opts.newLabel, group.pointer);
  }

  const oldParams = paramSlots(oldOp, ctx.oldSpec);
  const newParams = paramSlots(newOp, ctx.newSpec);
  for (const [id, group] of newParams) {
    const old = oldParams.get(id);
    if (old === undefined) continue;
    checkEnumAndType(ctx, key, old.slots, group.slots, ctx.opts.newLabel, group.pointer);
  }
}

export function diffSpecs(oldSpec: Spec, newSpec: Spec, opts: DiffOptions): DiffResult {
  const ctx: DiffContext = { oldSpec, newSpec, opts, findings: [] };
  checkRemovedOperations(ctx);
  const newOps = indexOps(newSpec);
  for (const [key, oldOp] of [...indexOps(oldSpec).entries()].sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0,
  )) {
    const newOp = newOps.get(key);
    if (newOp !== undefined) checkOperationPair(ctx, key, oldOp, newOp);
  }
  return { findings: sortFindings(ctx.findings) };
}
