import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSpec } from "../src/index.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "fixtures",
);

function fixture(rel: string): string {
  return readFileSync(join(fixturesDir, rel), "utf8");
}

function fixtureBytes(rel: string): Uint8Array {
  return new Uint8Array(readFileSync(join(fixturesDir, rel)));
}

describe("parseSpec · AC-O.1 petstore mini 3.1", () => {
  it("parses petstore-mini.yaml", () => {
    const result = parseSpec(fixture("petstore-mini.yaml"), {
      sourceLabel: "petstore-mini.yaml",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.openapiVersion).toBe("3.1.0");
    expect(result.spec.info.title).toBe("Petstore Mini");
    expect(result.spec.operations.map((o) => `${o.method} ${o.path}`)).toEqual([
      "get /pets",
      "post /pets",
      "get /pets/{petId}",
    ]);
    expect(result.spec.components.schemas).toEqual(["Error", "Pet", "Pets"]);
    expect(result.spec.components.securitySchemes).toEqual([]);
    expect(result.spec.servers).toEqual([
      { url: "https://api.example.com/v1" },
    ]);
    expect(result.spec.inputHash).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("parseSpec · AC-O.2 spec 3.0.3", () => {
  it("parses v303-minimal.yaml", () => {
    const result = parseSpec(fixture("v303-minimal.yaml"), {
      sourceLabel: "v303-minimal.yaml",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.openapiVersion).toBe("3.0.3");
    expect(result.spec.operations).toHaveLength(1);
  });
});

describe("parseSpec · AC-O.3 JSON equals YAML", () => {
  it("produces deep-equal Spec (except inputHash)", () => {
    const yamlResult = parseSpec(fixture("petstore-mini.yaml"), {
      sourceLabel: "petstore-mini.yaml",
    });
    const jsonResult = parseSpec(fixture("petstore-mini.json"), {
      sourceLabel: "petstore-mini.json",
    });
    expect(yamlResult.ok).toBe(true);
    expect(jsonResult.ok).toBe(true);
    if (!yamlResult.ok || !jsonResult.ok) return;
    const { inputHash: _yh, sourceLabel: _sl, ...yamlSpec } = yamlResult.spec;
    const { inputHash: _jh, sourceLabel: _jl, ...jsonSpec } = jsonResult.spec;
    expect(jsonSpec).toEqual(yamlSpec);
  });
});

describe("parseSpec · AC-O.4 YAML alias bomb", () => {
  it("rejects with YAML_ALIAS_LIMIT", () => {
    const bomb = [
      "openapi: 3.1.0",
      "info:",
      "  title: Alias Bomb",
      "  version: 1.0.0",
      "x-seed: &seed value",
      ...Array.from(
        { length: 200 },
        (_, i) => `x-pad-${i}: *seed`,
      ),
      "paths:",
      "  /bomb:",
      "    get:",
      '      responses:',
      '        "200":',
      "          description: OK",
    ].join("\n");
    const result = parseSpec(bomb, {
      sourceLabel: "alias-bomb.yaml",
      limits: { maxAliases: 50 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain("YAML_ALIAS_LIMIT");
  });
});

describe("parseSpec · AC-O.5 size limit", () => {
  it("rejects with SIZE_LIMIT before parsing", () => {
    const bytes = fixtureBytes("petstore-mini.yaml");
    const result = parseSpec(bytes, {
      sourceLabel: "petstore-mini.yaml",
      limits: { maxBytes: 10 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain("SIZE_LIMIT");
  });
});

describe("parseSpec · AC-O.6 remote $ref", () => {
  it("rejects with REF_REMOTE_FORBIDDEN", () => {
    const result = parseSpec(fixture("attack/remote-ref.yaml"), {
      sourceLabel: "remote-ref.yaml",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("REF_REMOTE_FORBIDDEN"))).toBe(true);
  });
});

describe("parseSpec · AC-O.7 outside-root $ref", () => {
  it("rejects with REF_OUTSIDE_ROOT", () => {
    const result = parseSpec(fixture("attack/outside-root.yaml"), {
      sourceLabel: "outside-root.yaml",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.some((e) => e.message.includes("REF_OUTSIDE_ROOT"))).toBe(true);
  });
});

describe("parseSpec · AC-O.8 circular $ref", () => {
  it("does not crash; emits REF_CYCLE warning", () => {
    const result = parseSpec(fixture("refs-cycle.yaml"), {
      sourceLabel: "refs-cycle.yaml",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.parseWarnings.some((w) => w.code === "REF_CYCLE")).toBe(true);
  });
});

describe("parseSpec · AC-O.9 depth limit", () => {
  it("rejects with DEPTH_LIMIT", () => {
    const result = parseSpec(fixture("attack/deep-nesting.yaml"), {
      sourceLabel: "deep-nesting.yaml",
      limits: { maxDepth: 20 },
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain("DEPTH_LIMIT");
  });
});

describe("parseSpec · AC-O.10 inputHash stability", () => {
  it("same bytes → same hash; one byte change → different hash", () => {
    const a = fixtureBytes("petstore-mini.yaml");
    const b = fixtureBytes("petstore-mini.yaml");
    const r1 = parseSpec(a, { sourceLabel: "a" });
    const r2 = parseSpec(b, { sourceLabel: "b" });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (!r1.ok || !r2.ok) return;
    expect(r1.spec.inputHash).toBe(r2.spec.inputHash);

    const modified = fixture("petstore-mini.yaml").replace(
      "Petstore Mini",
      "Petstore Mini2",
    );
    const r3 = parseSpec(modified, { sourceLabel: "c" });
    expect(r3.ok).toBe(true);
    if (!r3.ok) return;
    expect(r3.spec.inputHash).not.toBe(r1.spec.inputHash);
  });
});

describe("parseSpec · AC-O.11 deterministic operation order", () => {
  it("unsorted-paths fixture → sorted by (path, method)", () => {
    const result = parseSpec(fixture("unsorted-paths.yaml"), {
      sourceLabel: "unsorted-paths.yaml",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.operations.map((o) => `${o.method} ${o.path}`)).toEqual([
      "post /apple",
      "get /mango",
      "get /zebra",
    ]);
  });
});

describe("parseSpec · AC-O.12 Swagger 2.0", () => {
  it("rejects with SWAGGER_20", () => {
    const result = parseSpec(fixture("swagger2-minimal.yaml"), {
      sourceLabel: "swagger2-minimal.yaml",
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toContain("SWAGGER_20");
  });
});

describe("parseSpec · AC-O.13 path-level parameter merge", () => {
  it("merges path-level into operations and op-level wins", () => {
    const yaml = `
openapi: 3.1.0
info:
  title: Merge
  version: 1.0.0
paths:
  /users/{id}:
    parameters:
      - name: id
        in: path
        required: true
        schema:
          type: string
      - name: verbose
        in: query
        schema:
          type: boolean
    get:
      parameters:
        - name: verbose
          in: query
          description: op-level wins
          schema:
            type: boolean
      responses:
        "200":
          description: OK
`;
    const result = parseSpec(yaml, { sourceLabel: "merge" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.spec.operations[0]!;
    expect(op.parameters.map((p) => `${p.in}:${p.name}`).sort()).toEqual([
      "path:id",
      "query:verbose",
    ]);
    const verbose = op.parameters.find((p) => p.name === "verbose")!;
    expect(verbose.description).toBe("op-level wins");
  });
});

describe("parseSpec · AC-O.14 x-* extensions", () => {
  it("copies x-sunset and other x-* from operation", () => {
    const yaml = `
openapi: 3.1.0
info:
  title: Ext
  version: 1.0.0
paths:
  /old:
    get:
      operationId: getOld
      x-sunset: "2027-01-01"
      x-team: platform
      responses:
        "200":
          description: OK
`;
    const result = parseSpec(yaml, { sourceLabel: "ext" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.spec.operations[0]!;
    expect(op.extensions["x-sunset"]).toBe("2027-01-01");
    expect(op.extensions["x-team"]).toBe("platform");
  });
});

describe("parseSpec · malformed fixture", () => {
  it("returns ok:false for malformed.yaml", () => {
    const result = parseSpec(fixture("malformed.yaml"), {
      sourceLabel: "malformed.yaml",
    });
    expect(result.ok).toBe(false);
  });
});

describe("parseSpec · JSON pointer correctness", () => {
  it("operation jsonPointer points into original document", () => {
    const result = parseSpec(fixture("petstore-mini.yaml"), {
      sourceLabel: "petstore-mini.yaml",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const op = result.spec.operations.find(
      (o) => o.method === "get" && o.path === "/pets",
    )!;
    expect(op.jsonPointer).toBe("/paths/~1pets/get");
  });
});
