import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseProto } from "../src/index.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "fixtures",
  "grpc",
);

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("parseProto (f8-grpc)", () => {
  it("AC-GR.1 maps services and rpcs to operations", () => {
    const parsed = parseProto(readFixture("pet.proto"), { sourceLabel: "pet.proto" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { spec } = parsed;
    expect(spec.openapiVersion).toBe("grpc");
    const byId = new Map(spec.operations.map((op) => [op.operationId, op]));
    expect(byId.get("PetService.ListPets")?.method).toBe("rpc");
    expect(byId.get("PetService.ListPets")?.path).toBe("/pet.v1.PetService/ListPets");
    expect(byId.get("PetService.ListPets")?.description).toContain("pagination");
    expect(byId.get("PetService.WatchPets")?.extensions).toEqual({
      "x-grpc-streaming": "server",
    });
    expect(byId.get("PetService.ListPets")?.extensions).toEqual({});
    expect(spec.operations).toHaveLength(8);
  });

  it("AC-GR.1 preserves comments and @deprecated", () => {
    const parsed = parseProto(readFixture("pet.proto"), { sourceLabel: "pet.proto" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.spec.operations.map((op) => [op.operationId, op]));
    expect(byId.get("PetService.LookupPet")?.deprecated).toBe(true);
    expect(byId.get("PetService.GetPet")?.deprecated).toBe(false);
    expect(byId.get("PetService.Ping")?.description).toBeUndefined();
  });

  it("AC-GR.2 maps request/response messages with refs", () => {
    const parsed = parseProto(readFixture("pet.proto"), { sourceLabel: "pet.proto" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.spec.operations.map((op) => [op.operationId, op]));
    const body = byId.get("PetService.ListPets")?.requestBody?.content[0]?.schema;
    expect(body).toEqual({ ref: "#/components/schemas/pet.v1.ListPetsRequest" });
    const nodes = parsed.spec.components.schemaNodes ?? {};
    expect(nodes["pet.v1.ListPetsRequest"]?.properties?.["page_size"]).toEqual({
      type: "integer",
      description: "Page size, capped server-side.",
    });
    expect(nodes["pet.v1.ListPetsRequest"]?.properties?.["status"]).toEqual({
      ref: "#/components/schemas/pet.v1.Status",
    });
    const data = byId.get("PetService.GetPet")?.responses.find((r) => r.status === "data");
    expect(data?.content[0]?.schema).toEqual({
      ref: "#/components/schemas/pet.v1.Pet",
    });
    const create = nodes["pet.v1.CreatePetRequest"];
    expect(create?.properties?.["labels"]).toEqual({ type: "object" });
    expect(create?.properties?.["email"]).toEqual({ type: "string" });
    expect(nodes["pet.v1.Pet"]?.properties?.["created_at"]).toEqual({
      ref: "#/components/schemas/google.protobuf.Timestamp",
    });
  });

  it("AC-GR.2 warns on unresolved import types without failing", () => {
    const parsed = parseProto(readFixture("pet.proto"), { sourceLabel: "pet.proto" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.parseWarnings.map((w) => w.code)).toContain(
      "proto-unresolved-refs",
    );
  });

  it("AC-GR.3 rejects invalid proto with line info", () => {
    const parsed = parseProto(readFixture("invalid.proto"), {
      sourceLabel: "invalid.proto",
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors.length).toBeGreaterThan(0);
    expect(parsed.errors[0]?.message).toContain("SYNTAX");
    expect(parsed.errors[0]?.line).toBe(7);
  });

  it("AC-GR.3 accepts size limits", () => {
    const parsed = parseProto("syntax = \"proto3\";", {
      sourceLabel: "tiny.proto",
      limits: { maxBytes: 5 },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.message).toContain("SIZE_LIMIT");
  });

  it("AC-GR.3 warns without failing when no services exist", () => {
    const parsed = parseProto(readFixture("no-services.proto"), {
      sourceLabel: "no-services.proto",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.operations).toEqual([]);
    expect(parsed.spec.parseWarnings.map((w) => w.code)).toContain("proto-no-services");
  });

  it("is deterministic across runs", () => {
    const first = parseProto(readFixture("pet.proto"), { sourceLabel: "pet.proto" });
    const second = parseProto(readFixture("pet.proto"), { sourceLabel: "pet.proto" });
    expect(second).toEqual(first);
  });
});
