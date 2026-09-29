import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGraphQL } from "../src/index.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "fixtures",
  "graphql",
);

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("parseGraphQL (f8-graphql)", () => {
  it("AC-GQL.1 maps Query/Mutation/Subscription roots to operations", () => {
    const parsed = parseGraphQL(readFixture("schema.graphql"), {
      sourceLabel: "schema.graphql",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { spec } = parsed;
    expect(spec.openapiVersion).toBe("graphql");
    const byId = new Map(spec.operations.map((op) => [op.operationId, op]));
    expect(byId.get("Query.pets")?.method).toBe("query");
    expect(byId.get("Query.pets")?.path).toBe("/Query.pets");
    expect(byId.get("Mutation.createPet")?.method).toBe("mutation");
    expect(byId.get("Subscription.petCreated")?.method).toBe("subscription");
    expect(byId.has("Query.petCount")).toBe(true);
    expect(byId.has("QueryExtra.ping")).toBe(false);
    expect(spec.parseWarnings.map((w) => w.code)).toContain("gql-directives-ignored");
  });

  it("AC-GQL.1 preserves descriptions and @deprecated", () => {
    const parsed = parseGraphQL(readFixture("schema.graphql"), {
      sourceLabel: "schema.graphql",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.spec.operations.map((op) => [op.operationId, op]));
    expect(byId.get("Query.pets")?.description).toContain("List all pets");
    const legacy = byId.get("Query.legacySearch");
    expect(legacy?.deprecated).toBe(true);
    expect(legacy?.description).toContain("Use pets instead.");
    expect(byId.get("Query.pets")?.deprecated).toBe(false);
  });

  it("AC-GQL.2 maps args to requestBody and return type to data response", () => {
    const parsed = parseGraphQL(readFixture("schema.graphql"), {
      sourceLabel: "schema.graphql",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.spec.operations.map((op) => [op.operationId, op]));
    const pets = byId.get("Query.pets");
    const bodySchema = pets?.requestBody?.content[0]?.schema;
    expect(bodySchema?.type).toBe("object");
    expect(bodySchema?.properties?.["status"]).toEqual({
      ref: "#/components/schemas/Status",
    });
    expect(bodySchema?.properties?.["limit"]).toEqual({ type: "integer" });
    expect(bodySchema?.required).toBeUndefined();
    const byIdOp = byId.get("Query.petById");
    expect(byIdOp?.requestBody?.required).toBe(true);
    expect(byIdOp?.requestBody?.content[0]?.schema?.properties?.["petId"]).toEqual({
      type: "string",
    });
    const data = pets?.responses.find((r) => r.status === "data");
    expect(data?.content.length).toBeGreaterThan(0);
    const count = byId.get("Query.petCount");
    expect(count?.requestBody).toBeUndefined();
  });

  it("AC-GQL.2 registers named types in components", () => {
    const parsed = parseGraphQL(readFixture("schema.graphql"), {
      sourceLabel: "schema.graphql",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.components.schemas).toContain("Pet");
    expect(parsed.spec.components.schemas).toContain("PetInput");
    expect(parsed.spec.components.schemas).toContain("Status");
    expect(parsed.spec.components.schemaNodes?.["Pet"]?.type).toBe("object");
    expect(parsed.spec.components.schemaNodes?.["Pet"]?.properties?.["owner"]).toEqual({
      ref: "#/components/schemas/Owner",
    });
  });

  it("AC-GQL.3 rejects invalid SDL with line info", () => {
    const parsed = parseGraphQL(readFixture("invalid.graphql"), {
      sourceLabel: "invalid.graphql",
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0]?.message).toContain("SYNTAX");
    expect(parsed.errors[0]?.line).toBe(4);
  });

  it("AC-GQL.3 accepts size limits", () => {
    const parsed = parseGraphQL("type Query { a: String }", {
      sourceLabel: "tiny.graphql",
      limits: { maxBytes: 5 },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.message).toContain("SIZE_LIMIT");
  });

  it("AC-GQL.3 warns without failing when no roots exist", () => {
    for (const name of ["no-roots.graphql", "client-fragment.graphql"]) {
      const parsed = parseGraphQL(readFixture(name), { sourceLabel: name });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) continue;
      expect(parsed.spec.operations).toEqual([]);
      expect(parsed.spec.parseWarnings.map((w) => w.code)).toContain("gql-no-roots");
    }
  });

  it("is deterministic across runs", () => {
    const first = parseGraphQL(readFixture("schema.graphql"), {
      sourceLabel: "schema.graphql",
    });
    const second = parseGraphQL(readFixture("schema.graphql"), {
      sourceLabel: "schema.graphql",
    });
    expect(second).toEqual(first);
  });
});
