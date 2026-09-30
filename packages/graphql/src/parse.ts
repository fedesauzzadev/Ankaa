import type {
  ComponentIndex,
  Operation,
  ParseWarning,
  Response,
  SchemaNode,
  Spec,
} from "@ankaa/core";
import { createHash } from "node:crypto";
import {
  GraphQLError,
  Kind,
  parse as parseSDL,
  type DirectiveNode,
  type DocumentNode,
  type FieldDefinitionNode,
  type NamedTypeNode,
  type ObjectTypeDefinitionNode,
  type ObjectTypeExtensionNode,
  type TypeNode,
} from "graphql";

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

const SCALAR_MAP: Record<string, string> = {
  String: "string",
  ID: "string",
  Int: "integer",
  Float: "number",
  Boolean: "boolean",
};

const BUILTIN_DIRECTIVES = new Set(["deprecated", "skip", "include", "specifiedBy", "oneOf"]);

const ROOT_OPERATIONS = ["query", "mutation", "subscription"] as const;
type RootOperation = (typeof ROOT_OPERATIONS)[number];

interface TypeBucket {
  definition?: ObjectTypeDefinitionNode;
  extensions: ObjectTypeExtensionNode[];
}

function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function descriptionOf(node: { description?: { value: string } | undefined }): string | undefined {
  return node.description?.value;
}

function deprecationOf(directives: ReadonlyArray<DirectiveNode> | undefined): {
  deprecated: boolean;
  reason?: string;
} {
  const directive = directives?.find((d) => d.name.value === "deprecated");
  if (!directive) return { deprecated: false };
  const reason = directive.arguments?.find((a) => a.name.value === "reason");
  if (reason?.value.kind === Kind.STRING) {
    return { deprecated: true, reason: reason.value.value };
  }
  return { deprecated: true };
}

interface TypeContext {
  objects: Map<string, TypeBucket>;
  enums: Map<string, string[]>;
  inputs: Map<string, readonly FieldLike[]>;
  interfaces: Map<string, readonly FieldLike[]>;
  unions: Set<string>;
  customScalars: Set<string>;
}

interface FieldLike {
  name: string;
  description?: string;
  type: TypeNode;
}

interface NamedDescribedTyped {
  readonly name: { readonly value: string };
  readonly description?: { readonly value: string } | undefined;
  readonly type: TypeNode;
}

function fieldLikesOf(fields: ReadonlyArray<NamedDescribedTyped> | undefined): FieldLike[] {
  return (fields ?? []).map((f) => ({
    name: f.name.value,
    description: descriptionOf(f),
    type: f.type,
  }));
}

function collectTypes(doc: DocumentNode): TypeContext {
  const ctx: TypeContext = {
    objects: new Map(),
    enums: new Map(),
    inputs: new Map(),
    interfaces: new Map(),
    unions: new Set(),
    customScalars: new Set(),
  };
  for (const def of doc.definitions) {
    switch (def.kind) {
      case Kind.OBJECT_TYPE_DEFINITION: {
        const bucket = ctx.objects.get(def.name.value) ?? { extensions: [] };
        bucket.definition = def;
        ctx.objects.set(def.name.value, bucket);
        break;
      }
      case Kind.OBJECT_TYPE_EXTENSION: {
        const bucket = ctx.objects.get(def.name.value) ?? { extensions: [] };
        bucket.extensions.push(def);
        ctx.objects.set(def.name.value, bucket);
        break;
      }
      case Kind.ENUM_TYPE_DEFINITION: {
        ctx.enums.set(
          def.name.value,
          (def.values ?? []).map((v) => v.name.value),
        );
        break;
      }
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
      case Kind.INPUT_OBJECT_TYPE_EXTENSION: {
        const prev = ctx.inputs.get(def.name.value) ?? [];
        ctx.inputs.set(def.name.value, [...prev, ...fieldLikesOf(def.fields)]);
        break;
      }
      case Kind.INTERFACE_TYPE_DEFINITION:
      case Kind.INTERFACE_TYPE_EXTENSION: {
        const prev = ctx.interfaces.get(def.name.value) ?? [];
        ctx.interfaces.set(def.name.value, [...prev, ...fieldLikesOf(def.fields)]);
        break;
      }
      case Kind.UNION_TYPE_DEFINITION:
      case Kind.UNION_TYPE_EXTENSION: {
        ctx.unions.add(def.name.value);
        break;
      }
      case Kind.SCALAR_TYPE_DEFINITION:
      case Kind.SCALAR_TYPE_EXTENSION: {
        if (SCALAR_MAP[def.name.value] === undefined) {
          ctx.customScalars.add(def.name.value);
        }
        break;
      }
      default:
        break;
    }
  }
  return ctx;
}

function resolveRoots(doc: DocumentNode): Record<RootOperation, string | undefined> {
  const roots: Record<RootOperation, string | undefined> = {
    query: "Query",
    mutation: "Mutation",
    subscription: "Subscription",
  };
  for (const def of doc.definitions) {
    if (def.kind !== Kind.SCHEMA_DEFINITION && def.kind !== Kind.SCHEMA_EXTENSION) {
      continue;
    }
    for (const op of def.operationTypes ?? []) {
      const kind = op.operation;
      if (kind === "query" || kind === "mutation" || kind === "subscription") {
        roots[kind] = op.type.name.value;
      }
    }
  }
  return roots;
}

function refOf(name: string): SchemaNode {
  return { ref: `#/components/schemas/${name}` };
}

function namedSchema(name: string, ctx: TypeContext): SchemaNode {
  if (SCALAR_MAP[name] !== undefined) return { type: SCALAR_MAP[name] };
  if (ctx.customScalars.has(name)) return { type: "string" };
  return refOf(name);
}

function typeToSchema(type: TypeNode, ctx: TypeContext): { node: SchemaNode; required: boolean } {
  if (type.kind === Kind.NON_NULL_TYPE) {
    const inner = typeToSchema(type.type, ctx);
    return { node: inner.node, required: true };
  }
  if (type.kind === Kind.LIST_TYPE) {
    const inner = typeToSchema(type.type, ctx);
    return { node: { type: "array", items: inner.node }, required: false };
  }
  return { node: namedSchema((type as NamedTypeNode).name.value, ctx), required: false };
}

function buildSchemaNodes(ctx: TypeContext): Record<string, SchemaNode> {
  const nodes: Record<string, SchemaNode> = {};
  const building = new Set<string>();
  const ref = (name: string): SchemaNode => {
    if (nodes[name] !== undefined || building.has(name)) return refOf(name);
    building.add(name);
    const bucket = ctx.objects.get(name);
    const fields: FieldLike[] = [
      ...fieldLikesOf(bucket?.definition?.fields),
      ...(bucket?.extensions.flatMap((e) => fieldLikesOf(e.fields)) ?? []),
    ];
    if (bucket !== undefined && fields.length > 0) {
      const properties: Record<string, SchemaNode> = {};
      const required: string[] = [];
      for (const f of fields) {
        const converted = typeToSchema(f.type, ctx);
        const prop: SchemaNode = { ...converted.node };
        if (f.description !== undefined) prop.description = f.description;
        properties[f.name] = prop;
        if (converted.required) required.push(f.name);
      }
      const node: SchemaNode = {
        type: "object",
        description: descriptionOf(bucket.definition ?? { description: undefined }),
        properties,
      };
      if (required.length > 0) node.required = required;
      nodes[name] = node;
    } else {
      const inputFields = ctx.inputs.get(name);
      const ifaceFields = ctx.interfaces.get(name);
      const members = inputFields ?? ifaceFields;
      if (members !== undefined) {
        const properties: Record<string, SchemaNode> = {};
        const required: string[] = [];
        for (const f of members) {
          const converted = typeToSchema(f.type, ctx);
          const prop: SchemaNode = { ...converted.node };
          if (f.description !== undefined) prop.description = f.description;
          properties[f.name] = prop;
          if (converted.required) required.push(f.name);
        }
        const node: SchemaNode = { type: "object", properties };
        if (required.length > 0) node.required = required;
        nodes[name] = node;
      } else if (ctx.enums.get(name) !== undefined) {
        nodes[name] = { type: "string", enum: [...(ctx.enums.get(name) ?? [])] };
      } else if (ctx.unions.has(name)) {
        nodes[name] = {};
      }
    }
    building.delete(name);
    return refOf(name);
  };
  for (const name of ctx.objects.keys()) ref(name);
  for (const name of ctx.inputs.keys()) ref(name);
  for (const name of ctx.interfaces.keys()) ref(name);
  for (const name of ctx.enums.keys()) ref(name);
  for (const name of ctx.unions) ref(name);
  return nodes;
}

function ignoredDirectives(doc: DocumentNode): string[] {
  const names = new Set<string>();
  const visit = (directives: ReadonlyArray<DirectiveNode> | undefined): void => {
    for (const d of directives ?? []) {
      if (!BUILTIN_DIRECTIVES.has(d.name.value)) names.add(d.name.value);
    }
  };
  const visitFields = (
    fields:
      | ReadonlyArray<{
          readonly directives?: ReadonlyArray<DirectiveNode> | undefined;
          readonly arguments?:
            | ReadonlyArray<{
                readonly directives?: ReadonlyArray<DirectiveNode> | undefined;
              }>
            | undefined;
        }>
      | undefined,
  ): void => {
    for (const f of fields ?? []) {
      visit(f.directives);
      for (const a of f.arguments ?? []) visit(a.directives);
    }
  };
  for (const def of doc.definitions) {
    const node = def as {
      directives?: ReadonlyArray<DirectiveNode>;
      fields?: ReadonlyArray<FieldDefinitionNode>;
    };
    visit(node.directives);
    visitFields(node.fields);
  }
  return [...names].sort();
}

function operationFromField(
  root: RootOperation,
  rootType: string,
  field: FieldDefinitionNode,
  ctx: TypeContext,
): Operation {
  const name = field.name.value;
  const path = `/${rootType}.${name}`;
  const pointer = `#/${rootType}/${name}`;
  const { deprecated, reason } = deprecationOf(field.directives);
  let description = descriptionOf(field);
  if (description === undefined && reason !== undefined) {
    description = `Deprecated: ${reason}`;
  }
  const properties: Record<string, SchemaNode> = {};
  const requiredArgs: string[] = [];
  for (const arg of field.arguments ?? []) {
    const converted = typeToSchema(arg.type, ctx);
    const prop: SchemaNode = { ...converted.node };
    const argDescription = descriptionOf(arg);
    if (argDescription !== undefined) prop.description = argDescription;
    properties[arg.name.value] = prop;
    if (converted.required) requiredArgs.push(arg.name.value);
  }
  const argNames = Object.keys(properties);
  const returnSchema = typeToSchema(field.type, ctx).node;
  const responses: Response[] = [
    {
      status: "data",
      description: `Data payload of ${path}.`,
      content: [{ mediaType: "application/json", schema: returnSchema }],
      headers: [],
      jsonPointer: `${pointer}/data`,
    },
  ];
  const operation: Operation = {
    method: root,
    path,
    operationId: `${rootType}.${name}`,
    description,
    tags: [],
    deprecated,
    parameters: [],
    responses,
    security: undefined,
    extensions: {},
    jsonPointer: pointer,
  };
  if (argNames.length > 0) {
    operation.requestBody = {
      required: requiredArgs.length > 0,
      content: [
        {
          mediaType: "application/json",
          schema: {
            type: "object",
            properties,
            ...(requiredArgs.length > 0 ? { required: requiredArgs } : {}),
          },
        },
      ],
      jsonPointer: `${pointer}/requestBody`,
    };
  }
  return operation;
}

export function parseGraphQL(input: Uint8Array | string, opts: ParseOptions): ParseResult {
  const limits: ParseLimits = { ...DEFAULT_LIMITS, ...opts.limits };
  const warnings: ParseWarning[] = [];
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
  let doc: DocumentNode;
  try {
    doc = parseSDL(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error instanceof GraphQLError) {
      const line = error.locations?.[0]?.line;
      return {
        ok: false,
        errors: [{ message: `SYNTAX: ${error.message}`, ...(line === undefined ? {} : { line }) }],
      };
    }
    throw error;
  }
  const ctx = collectTypes(doc);
  const roots = resolveRoots(doc);
  const operations: Operation[] = [];
  for (const root of ROOT_OPERATIONS) {
    const rootType = roots[root];
    if (rootType === undefined) continue;
    const bucket = ctx.objects.get(rootType);
    if (bucket === undefined) continue;
    const fields: FieldDefinitionNode[] = [
      ...(bucket.definition?.fields ?? []),
      ...bucket.extensions.flatMap((e) => [...(e.fields ?? [])]),
    ];
    for (const field of fields) {
      operations.push(operationFromField(root, rootType, field, ctx));
    }
  }
  if (operations.length === 0) {
    warnings.push({
      code: "gql-no-roots",
      message: "No Query/Mutation/Subscription root fields found; nothing to analyze.",
    });
  }
  const ignored = ignoredDirectives(doc);
  if (ignored.length > 0) {
    warnings.push({
      code: "gql-directives-ignored",
      message: `Custom directives ignored: ${ignored.join(", ")}.`,
    });
  }
  const schemaNodes = buildSchemaNodes(ctx);
  const schemaNames = [
    ...ctx.objects.keys(),
    ...ctx.inputs.keys(),
    ...ctx.interfaces.keys(),
    ...ctx.enums.keys(),
    ...ctx.unions,
    ...ctx.customScalars,
  ].sort();
  const components: ComponentIndex = {
    schemas: schemaNames,
    responses: [],
    parameters: [],
    securitySchemes: [],
    schemaNodes,
  };
  return {
    ok: true,
    spec: {
      inputHash,
      openapiVersion: "graphql",
      sourceLabel: opts.sourceLabel,
      info: {},
      extensions: {},
      rootTags: [],
      security: undefined,
      inputBytes: bytes.byteLength,
      operations,
      components,
      parseWarnings: warnings,
    },
  };
}
