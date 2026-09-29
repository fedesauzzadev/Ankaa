import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSpec } from "../src/index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures");

function fixture(rel: string): string {
  return readFileSync(join(fixturesDir, rel), "utf8");
}

describe("legacy convert (f8-legacy-convert)", () => {
  it("AC-LG.1 converts Swagger 2.0 minimal", () => {
    const result = parseSpec(fixture("swagger2-minimal.yaml"), {
      sourceLabel: "swagger2-minimal.yaml",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.openapiVersion).toBe("3.0.0-converted");
    expect(result.spec.operations).toHaveLength(1);
    expect(result.spec.operations[0]?.method).toBe("get");
    expect(result.spec.operations[0]?.path).toBe("/legacy");
    expect(result.spec.parseWarnings.map((w) => w.code)).toContain("SWAGGER_CONVERTED");
  });

  it("AC-LG.2 converts Swagger 1.2 minimal", () => {
    const result = parseSpec(fixture("swagger1-minimal.yaml"), {
      sourceLabel: "swagger1-minimal.yaml",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.openapiVersion).toBe("3.0.0-converted");
    const op = result.spec.operations[0];
    expect(op?.operationId).toBe("getPetById");
    expect(op?.description).toContain("single pet");
    expect(op?.method).toBe("get");
    expect(op?.path).toBe("/pets/{id}");
    expect(result.spec.components.schemas).toContain("Pet");
    expect(result.spec.parseWarnings.map((w) => w.code)).toContain("SWAGGER_CONVERTED");
  });

  it("AC-LG.2 deterministic across runs", () => {
    const first = parseSpec(fixture("swagger1-minimal.yaml"), {
      sourceLabel: "swagger1-minimal.yaml",
    });
    const second = parseSpec(fixture("swagger1-minimal.yaml"), {
      sourceLabel: "swagger1-minimal.yaml",
    });
    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (!first.ok || !second.ok) return;
    expect(first.spec.inputHash).toBe(second.spec.inputHash);
    expect(JSON.stringify(first.spec.operations)).toBe(JSON.stringify(second.spec.operations));
  });

  it("AC-LG.3 lists dropped fields without failing", () => {
    const doc = `swagger: "2.0"
info:
  title: T
  version: "1"
basePath: /v1
paths:
  /upload:
    post:
      operationId: uploadThing
      description: Uploads a thing with enough detail here.
      parameters:
        - name: file
          in: formData
          type: file
      responses:
        "200":
          description: OK
`;
    const result = parseSpec(doc, { sourceLabel: "form.yaml" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const warning = result.spec.parseWarnings.find((w) => w.code === "SWAGGER_CONVERTED");
    expect(warning?.message).toContain("formData");
  });

  it("AC-LG.4 rejects remote refs in legacy", () => {
    const doc = `swagger: "2.0"
info:
  title: T
  version: "1"
paths:
  /x:
    get:
      responses:
        "200":
          description: OK
          schema:
            $ref: https://example.com/schema.json
`;
    const result = parseSpec(doc, { sourceLabel: "remote.yaml" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]?.message).toMatch("REF_REMOTE_FORBIDDEN");
  });
});
