import { describe, expect, it } from "vitest";
import { diffSpecs, type DiffResult } from "../src/index.js";
import type { Operation, Parameter, Response, SchemaNode, Spec } from "../src/index.js";

const OPTS = { oldLabel: "base.yaml", newLabel: "head.yaml", packVersion: "1.0.0" };

function op(partial: Partial<Operation> = {}): Operation {
  return {
    method: "get",
    path: "/users",
    tags: [],
    deprecated: false,
    parameters: [],
    responses: [],
    security: undefined,
    extensions: {},
    jsonPointer: "/paths/~1users/get",
    ...partial,
  };
}

function spec(ops: Operation[], extra?: Partial<Spec>): Spec {
  return {
    inputHash: "x",
    openapiVersion: "3.1.0",
    sourceLabel: "t.yaml",
    info: { title: "T", version: "1.0.0" },
    operations: ops,
    components: { schemas: [], responses: [], parameters: [], securitySchemes: [] },
    parseWarnings: [],
    ...extra,
  };
}

function param(name: string, required: boolean, schema?: SchemaNode): Parameter {
  return {
    name,
    in: "query",
    required,
    ...(schema !== undefined ? { schema } : {}),
    jsonPointer: `/paths/~1users/get/parameters/${name}`,
  };
}

function resp(status: string, schema?: SchemaNode): Response {
  return {
    status,
    description: "x",
    content: schema !== undefined ? [{ mediaType: "application/json", schema }] : [],
    headers: [],
    jsonPointer: `/paths/~1users/get/responses/${status}`,
  };
}

function ruleIds(result: DiffResult): string[] {
  return result.findings.map((f) => f.ruleId);
}

describe("BRK-001 operation removed", () => {
  it("flags a removed operation with an old-label location", () => {
    const result = diffSpecs(spec([op()]), spec([]), OPTS);
    expect(ruleIds(result)).toEqual(["BRK-001"]);
    const f = result.findings[0]!;
    expect(f.location).toBe("base.yaml#/paths/~1users/get");
    expect(f.apiLocation).toBe("GET /users");
    expect(f.severity).toBe("error");
    expect(f.packId).toBe("diff");
    expect(f.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is silent when the operation stays", () => {
    expect(ruleIds(diffSpecs(spec([op()]), spec([op()]), OPTS))).toEqual([]);
  });
});

describe("BRK-002 required parameter", () => {
  const base = op({ parameters: [param("verbose", false)] });
  it("flags an added required parameter", () => {
    const head = op({ parameters: [param("verbose", false), param("limit", true)] });
    const result = diffSpecs(spec([base]), spec([head]), OPTS);
    expect(ruleIds(result)).toEqual(["BRK-002"]);
    expect(result.findings[0]!.location).toContain("head.yaml#");
  });

  it("flags optional turned required", () => {
    const head = op({ parameters: [param("verbose", true)] });
    expect(ruleIds(diffSpecs(spec([base]), spec([head]), OPTS))).toEqual(["BRK-002"]);
  });

  it("ignores added optional parameters", () => {
    const head = op({ parameters: [param("verbose", false), param("trace", false)] });
    expect(ruleIds(diffSpecs(spec([base]), spec([head]), OPTS))).toEqual([]);
  });
});

describe("BRK-003 request body", () => {
  const body = (required: boolean) => ({
    required,
    content: [],
    jsonPointer: "/paths/~1users/get/requestBody",
  });
  it("flags optional turned required and added required bodies", () => {
    expect(
      ruleIds(diffSpecs(spec([op({ requestBody: body(false) })]), spec([op({ requestBody: body(true) })]), OPTS)),
    ).toEqual(["BRK-003"]);
    expect(
      ruleIds(diffSpecs(spec([op()]), spec([op({ requestBody: body(true) })]), OPTS)),
    ).toEqual(["BRK-003"]);
  });

  it("flags a removed required body, ignores relaxations", () => {
    expect(
      ruleIds(diffSpecs(spec([op({ requestBody: body(true) })]), spec([op()]), OPTS)),
    ).toEqual(["BRK-003"]);
    expect(
      ruleIds(diffSpecs(spec([op({ requestBody: body(true) })]), spec([op({ requestBody: body(false) })]), OPTS)),
    ).toEqual([]);
  });
});

describe("BRK-004 required request properties", () => {
  const schema = (required: string[]): SchemaNode => ({
    type: "object",
    properties: { a: { type: "string" }, b: { type: "string" } },
    required,
  });
  const withBody = (required: string[]) =>
    op({
      requestBody: {
        required: true,
        content: [{ mediaType: "application/json", schema: schema(required) }],
        jsonPointer: "/paths/~1users/get/requestBody",
      },
    });
  it("flags added required properties", () => {
    const result = diffSpecs(spec([withBody([])]), spec([withBody(["a"])]), OPTS);
    expect(ruleIds(result)).toEqual(["BRK-004"]);
    expect(result.findings[0]!.message).toContain('"a"');
  });

  it("is silent without required changes", () => {
    expect(ruleIds(diffSpecs(spec([withBody(["a"])]), spec([withBody(["a"])]), OPTS))).toEqual([]);
  });
});

describe("BRK-005 response removed", () => {
  it("flags a removed status, ignores additions", () => {
    const oldOp = op({ responses: [resp("200"), resp("404")] });
    const head = op({ responses: [resp("200"), resp("422")] });
    const result = diffSpecs(spec([oldOp]), spec([head]), OPTS);
    expect(ruleIds(result)).toEqual(["BRK-005"]);
    expect(result.findings[0]!.location).toBe("base.yaml#/paths/~1users/get/responses/404");
    expect(ruleIds(diffSpecs(spec([head]), spec([head]), OPTS))).toEqual([]);
  });
});

describe("BRK-006 enum values removed", () => {
  const enumSchema = (values: string[]): SchemaNode => ({ type: "string", enum: values });
  it("flags removed values, ignores additions", () => {
    const oldOp = op({ responses: [resp("200", enumSchema(["a", "b"]))] });
    const head = op({ responses: [resp("200", enumSchema(["a"]))] });
    expect(ruleIds(diffSpecs(spec([oldOp]), spec([head]), OPTS))).toEqual(["BRK-006"]);
    const grown = op({ responses: [resp("200", enumSchema(["a", "b", "c"]))] });
    expect(ruleIds(diffSpecs(spec([oldOp]), spec([grown]), OPTS))).toEqual([]);
  });
});

describe("BRK-007 type/format changed", () => {
  it("flags type and format changes", () => {
    const oldOp = op({ responses: [resp("200", { type: "string" })] });
    const typed = op({ responses: [resp("200", { type: "integer" })] });
    expect(ruleIds(diffSpecs(spec([oldOp]), spec([typed]), OPTS))).toEqual(["BRK-007"]);
    const formatted = op({ responses: [resp("200", { type: "string", format: "date-time" })] });
    const plain = op({ responses: [resp("200", { type: "string" })] });
    expect(ruleIds(diffSpecs(spec([plain]), spec([formatted]), OPTS))).toEqual(["BRK-007"]);
    expect(ruleIds(diffSpecs(spec([plain]), spec([plain]), OPTS))).toEqual([]);
  });
});

describe("BRK-008 security increased", () => {
  const bearer = [{ name: "bearerAuth", scopes: [] as string[] }];
  it("flags none-to-some and added scopes", () => {
    expect(ruleIds(diffSpecs(spec([op()]), spec([op({ security: bearer })]), OPTS))).toEqual([
      "BRK-008",
    ]);
    const scoped = [{ name: "oauth", scopes: ["read"] }];
    const wider = [{ name: "oauth", scopes: ["read", "write"] }];
    expect(
      ruleIds(diffSpecs(spec([op({ security: scoped })]), spec([op({ security: wider })]), OPTS)),
    ).toEqual(["BRK-008"]);
  });

  it("ignores unchanged security and relaxations", () => {
    expect(
      ruleIds(diffSpecs(spec([op({ security: bearer })]), spec([op({ security: bearer })]), OPTS)),
    ).toEqual([]);
    expect(ruleIds(diffSpecs(spec([op({ security: bearer })]), spec([op()]), OPTS))).toEqual([]);
  });

  it("compares effective security against doc defaults", () => {
    const oldSpec = spec([op()], { security: bearer });
    const newSpec = spec([op()], { security: bearer });
    expect(ruleIds(diffSpecs(oldSpec, newSpec, OPTS))).toEqual([]);
    const relaxed = spec([op({ security: [] })], { security: bearer });
    expect(ruleIds(diffSpecs(oldSpec, relaxed, OPTS))).toEqual([]);
  });
});

describe("diff determinism and refs (AC-BK.2/3)", () => {
  it("identical specs yield zero findings; reruns are byte-identical", () => {
    const oldOp = op({ responses: [resp("200", { type: "string", enum: ["a"] })] });
    const first = diffSpecs(spec([oldOp]), spec([op()]), OPTS);
    expect(first.findings.length).toBeGreaterThan(0);
    const second = diffSpecs(spec([oldOp]), spec([op()]), OPTS);
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    expect(ruleIds(diffSpecs(spec([oldOp]), spec([oldOp]), OPTS))).toEqual([]);
  });

  it("packVersion does not affect fingerprints (INV-5)", () => {
    const a = diffSpecs(spec([op()]), spec([]), OPTS);
    const b = diffSpecs(spec([op()]), spec([]), { ...OPTS, packVersion: "9.9.9" });
    expect(a.findings.map((f) => f.fingerprint)).toEqual(b.findings.map((f) => f.fingerprint));
  });

  it("follows $ref chains and survives cycles", () => {
    const pet = (required: string[]): SchemaNode => ({
      type: "object",
      properties: { name: { type: "string" } },
      required,
    });
    const refBody = () => ({
      required: true,
      content: [{ mediaType: "application/json", schema: { ref: "#/components/schemas/Pet" } }],
      jsonPointer: "/paths/~1users/get/requestBody",
    });
    const oldSpec = spec([op({ requestBody: refBody() })], {
      components: {
        schemas: ["Pet"],
        responses: [],
        parameters: [],
        securitySchemes: [],
        schemaNodes: { Pet: pet([]) },
      },
    });
    const newSpec = spec([op({ requestBody: refBody() })], {
      components: {
        schemas: ["Pet"],
        responses: [],
        parameters: [],
        securitySchemes: [],
        schemaNodes: { Pet: pet(["name"]) },
      },
    });
    expect(ruleIds(diffSpecs(oldSpec, newSpec, OPTS))).toEqual(["BRK-004"]);

    const cyclic = (name: string): Spec =>
      spec(
        [
          op({
            responses: [
              resp("200", { ref: `#/components/schemas/${name}` }),
            ],
          }),
        ],
        {
          components: {
            schemas: [name],
            responses: [],
            parameters: [],
            securitySchemes: [],
            schemaNodes: { [name]: { ref: `#/components/schemas/${name}` } },
          },
        },
      );
    expect(ruleIds(diffSpecs(cyclic("A"), cyclic("A"), OPTS))).toEqual([]);
  });
});
