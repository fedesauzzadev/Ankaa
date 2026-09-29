import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { looksLikeAsyncApi, parseAsyncAPI } from "../src/index.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "fixtures",
  "asyncapi",
);

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("parseAsyncAPI (f8-asyncapi)", () => {
  it("AC-AS.1 maps v2 publish/subscribe to operations", () => {
    const parsed = parseAsyncAPI(readFixture("v2.yaml"), { sourceLabel: "v2.yaml" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { spec } = parsed;
    expect(spec.openapiVersion).toBe("asyncapi");
    expect(spec.info.title).toBe("Pet Events API");
    const byId = new Map(spec.operations.map((op) => [op.operationId, op]));
    expect(byId.get("publishPetCreated")?.method).toBe("publish");
    expect(byId.get("publishPetCreated")?.path).toBe("/pet/created");
    expect(byId.get("onPetAdopted")?.method).toBe("subscribe");
    expect(byId.get("publishPetCreated")?.tags).toEqual(["pets"]);
    expect(byId.get("publishPetCreated")?.summary).toBe("Publish pet created");
    expect(spec.operations).toHaveLength(3);
  });

  it("AC-AS.2 maps payloads, headers and channel params", () => {
    const parsed = parseAsyncAPI(readFixture("v2.yaml"), { sourceLabel: "v2.yaml" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.spec.operations.map((op) => [op.operationId, op]));
    const publish = byId.get("publishPetCreated");
    const body = publish?.requestBody?.content[0]?.schema;
    expect(body?.properties?.["petId"]).toEqual({
      type: "string",
      description: "Identifier of the pet.",
    });
    expect(body?.properties?.["status"]).toEqual({
      ref: "#/components/schemas/Status",
    });
    expect(body?.required).toEqual(["petId"]);
    const headerNames = (publish?.parameters ?? [])
      .filter((p) => p.in === "header")
      .map((p) => p.name);
    expect(headerNames).toEqual(["ceType"]);
    const pathNames = (publish?.parameters ?? []).filter((p) => p.in === "path").map((p) => p.name);
    expect(pathNames).toEqual(["shelterId"]);
    const subscribe = byId.get("onPetAdopted");
    expect(subscribe?.requestBody).toBeUndefined();
    const data = subscribe?.responses.find((r) => r.status === "data");
    expect(data?.content[0]?.schema).toEqual({
      ref: "#/components/schemas/PetAdopted",
    });
    const nodes = parsed.spec.components.schemaNodes ?? {};
    expect(nodes["Status"]).toEqual({ type: "string", enum: ["AVAILABLE", "ADOPTED"] });
    expect(nodes["CloudHeaders"]?.properties?.["ceSource"]).toEqual({ type: "string" });
  });

  it("AC-AS.1 maps v3 send/receive to operations", () => {
    const parsed = parseAsyncAPI(readFixture("v3.yaml"), { sourceLabel: "v3.yaml" });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.spec.operations.map((op) => [op.operationId, op]));
    expect(byId.get("sendPetCreated")?.method).toBe("send");
    expect(byId.get("sendPetCreated")?.path).toBe("/pet/created");
    expect(byId.get("receivePetAdopted")?.method).toBe("receive");
    expect(byId.get("receivePetAdopted")?.path).toBe("/pet/adopted");
    const body = byId.get("sendPetCreated")?.requestBody?.content[0]?.schema;
    expect(body).toEqual({ ref: "#/components/schemas/PetCreated" });
    const nodes = parsed.spec.components.schemaNodes ?? {};
    expect(nodes["PetCreated"]?.properties?.["petId"]).toEqual({
      type: "string",
      description: "Identifier of the pet.",
    });
    const data = byId.get("receivePetAdopted")?.responses.find((r) => r.status === "data");
    expect(data?.content[0]?.schema).toEqual({
      ref: "#/components/schemas/PetAdopted",
    });
    expect(parsed.spec.operations).toHaveLength(2);
  });

  it("AC-AS.3 rejects invalid documents with honest errors", () => {
    const broken = parseAsyncAPI(readFixture("invalid.yaml"), {
      sourceLabel: "invalid.yaml",
    });
    expect(broken.ok).toBe(false);
    const legacy = parseAsyncAPI('asyncapi: "1.2.0"\ninfo:\n  title: T\n  version: "1"\n', {
      sourceLabel: "legacy.yaml",
    });
    expect(legacy.ok).toBe(false);
    if (legacy.ok) return;
    expect(legacy.errors[0]?.message).toContain("UNSUPPORTED_VERSION");
    const remote = parseAsyncAPI(
      'asyncapi: "2.6.0"\ninfo:\n  title: T\n  version: "1"\nchannels:\n  c:\n    publish:\n      message:\n        $ref: "https://example.com/m.json"\n',
      { sourceLabel: "remote.yaml" },
    );
    expect(remote.ok).toBe(false);
    if (remote.ok) return;
    expect(remote.errors[0]?.message).toContain("REMOTE_REF");
  });

  it("AC-AS.3 accepts size limits", () => {
    const parsed = parseAsyncAPI('asyncapi: "2.6.0"', {
      sourceLabel: "tiny.yaml",
      limits: { maxBytes: 5 },
    });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.message).toContain("SIZE_LIMIT");
  });

  it("AC-AS.3 warns without failing when no operations exist", () => {
    const parsed = parseAsyncAPI(readFixture("no-ops.yaml"), {
      sourceLabel: "no-ops.yaml",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.spec.operations).toEqual([]);
    expect(parsed.spec.parseWarnings.map((w) => w.code)).toContain("asyncapi-no-operations");
  });

  it("looksLikeAsyncApi sniffs the root key only", () => {
    expect(looksLikeAsyncApi(readFixture("v2.yaml"))).toBe(true);
    expect(looksLikeAsyncApi('{\n  "asyncapi": "3.0.0",\n  "info": {}\n}')).toBe(true);
    expect(looksLikeAsyncApi('openapi: 3.1.0\ninfo:\n  title: T\n  version: "1"\n')).toBe(false);
    expect(looksLikeAsyncApi("just some text")).toBe(false);
  });

  it("is deterministic across runs", () => {
    const first = parseAsyncAPI(readFixture("v2.yaml"), { sourceLabel: "v2.yaml" });
    const second = parseAsyncAPI(readFixture("v2.yaml"), { sourceLabel: "v2.yaml" });
    expect(second).toEqual(first);
  });
});
