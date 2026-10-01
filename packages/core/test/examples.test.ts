import { describe, expect, it } from "vitest";
import { validateExamples, EXAMPLES_PACK_ID } from "../src/index.js";
import type { Finding, SchemaNode, Spec } from "../src/index.js";

function specWith(schema: SchemaNode, example: unknown, components?: Record<string, SchemaNode>): Spec {
  return {
    inputHash: "abc",
    openapiVersion: "3.1.0",
    sourceLabel: "test.yaml",
    info: { title: "API", version: "1.0.0" },
    servers: [],
    extensions: {},
    operations: [
      {
        method: "get",
        path: "/users",
        operationId: "listUsers",
        summary: "List users",
        description: "Returns users",
        deprecated: false,
        parameters: [],
        responses: [
          {
            status: "200",
            description: "OK",
            content: [
              {
                mediaType: "application/json",
                schema: { ...schema, example },
              },
            ],
            headers: [],
            jsonPointer: "/paths/~1users/get/responses/200",
          },
        ],
        security: undefined,
        extensions: {},
        jsonPointer: "/paths/~1users/get",
      },
    ],
    components: { schemas: [], responses: [], parameters: [], securitySchemes: [], schemaNodes: components },
    parseWarnings: [],
  };
}

function run(schema: SchemaNode, example: unknown, components?: Record<string, SchemaNode>) {
  return validateExamples(specWith(schema, example, components), { packVersion: "test" });
}

describe("validateExamples subset (AC-MV.1/2)", () => {
  it("type mismatch is invalid with a reproducible pointer", () => {
    const { findings, summary } = run({ type: "string" }, 42);
    expect(summary).toMatchObject({ checked: 1, invalid: 1, valid: 0 });
    expect(findings).toHaveLength(1);
    const finding = findings[0]!;
    expect(finding.ruleId).toBe("EXVAL-001");
    expect(finding.location).toBe("/paths/~1users/get/responses/200/content/0/schema/example");
    expect(finding.message).toContain("expected string, got number");
  });

  it("3.1 type unions accept any of the listed types", () => {
    expect(run({ type: ["string", "null"] }, "x").summary.invalid).toBe(0);
    expect(run({ type: ["string", "null"] }, null).summary.invalid).toBe(0);
    expect(run({ type: ["string", "null"] }, 7).summary.invalid).toBe(1);
  });

  it("enum membership, required properties and nesting", () => {
    expect(run({ type: "string", enum: ["a", "b"] }, "c").summary.invalid).toBe(1);
    expect(run({ type: "string", enum: ["a", "b"] }, "a").summary.valid).toBe(1);

    const object = {
      type: "object",
      required: ["email"],
      properties: { email: { type: "string" }, age: { type: "integer" } },
    } satisfies SchemaNode;
    expect(run(object, { email: "x@y.z", age: 3 }).summary.valid).toBe(1);
    expect(run(object, { age: 3 }).findings[0]!.message).toContain('missing required property "email"');
    expect(run(object, { email: "x@y.z", age: 1.5 }).findings[0]!.message).toContain("expected integer, got number");
  });

  it("items, maxLength and maximum", () => {
    expect(run({ type: "array", items: { type: "string" } }, ["a", 2]).summary.invalid).toBe(1);
    expect(run({ type: "string", maxLength: 3 }, "abcd").findings[0]!.message).toContain("maxLength 3");
    expect(run({ type: "number", maximum: 10 }, 11).findings[0]!.message).toContain("maximum 10");
  });

  it("unsupported validation keywords mark partial, never silent valid (AC-MV.3)", () => {
    const { summary } = run({ type: "string", additionalProperties: false }, "ok");
    expect(summary.partial).toBe(1);
    expect(summary.valid).toBe(0);
    expect(summary.invalid).toBe(0);
  });
});

describe("validateExamples refs (AC-MV.3)", () => {
  it("resolves local $ref and validates against the component", () => {
    const { summary, findings } = run(
      { ref: "#/components/schemas/User" },
      { email: 42 },
      { User: { type: "object", properties: { email: { type: "string" } } } },
    );
    expect(summary.invalid).toBe(1);
    expect(findings[0]!.message).toContain("expected string, got number");
  });

  it("remote $ref is an explicit skip finding (EXVAL-002)", () => {
    const { findings, summary } = run({ ref: "https://schemas.example.com/user" }, { a: 1 });
    expect(summary.skipped).toBe(1);
    expect(findings[0]!.ruleId).toBe("EXVAL-002");
    expect(findings[0]!.message).toContain("unsupported $ref target");
  });

  it("unresolvable local $ref is an explicit skip", () => {
    const { findings } = run({ ref: "#/components/schemas/Ghost" }, { a: 1 });
    expect(findings[0]!.message).toContain("unresolvable $ref");
  });

  it("cycles are explicit skips, no hang (AC-MV.4)", () => {
    const node: SchemaNode = { type: "object", properties: {} };
    node.properties!.self = { ref: "#/components/schemas/Node" };
    const { summary } = run({ ref: "#/components/schemas/Node" }, { self: {} }, { Node: node });
    expect(summary.skipped).toBe(1);
  });
});

describe("validateExamples budgets and determinism (AC-MV.4/5)", () => {
  it("oversized examples skip with a reason", () => {
    const big = { data: "x".repeat(120_000) };
    const { summary, findings } = run({ type: "object" }, big);
    expect(summary.skipped).toBe(1);
    expect(findings[0]!.message).toContain("size budget");
  });

  it("same input twice yields identical findings and order", () => {
    const schema: SchemaNode = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "integer" } },
    };
    const first = run(schema, { a: 1, b: "x" });
    const second = run(schema, { a: 1, b: "x" });
    expect(JSON.stringify(first.findings.map((f: Finding) => f.fingerprint))).toBe(
      JSON.stringify(second.findings.map((f: Finding) => f.fingerprint)),
    );
  });

  it("findings carry the examples pack id and source", () => {
    const { findings } = run({ type: "string" }, 1);
    expect(findings[0]!.packId).toBe(EXAMPLES_PACK_ID);
    expect(findings[0]!.source?.url).toContain("spec.openapis.org");
    expect(findings[0]!.apiLocation).toBe("GET /users");
  });
});
