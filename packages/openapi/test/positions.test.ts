import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseSpec } from "../src/index.js";

const fixturesDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures");

const PETSTORE_YAML = readFileSync(join(fixturesDir, "petstore-mini.yaml"), "utf8");
const PETSTORE_JSON = readFileSync(join(fixturesDir, "petstore-mini.json"), "utf8");

describe("spec.positions (f1-openapi rule 5b, M17.8a)", () => {
  it("maps pointers to the line of their mapping key", () => {
    const result = parseSpec(PETSTORE_YAML, { sourceLabel: "petstore-mini.yaml" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const positions = result.spec.positions;
    expect(positions).toBeDefined();
    expect(positions?.["/paths"]).toEqual({ line: 10, column: 1 });
    expect(positions?.["/paths/~1pets"]).toEqual({ line: 11, column: 3 });
    expect(positions?.["/paths/~1pets/get"]).toEqual({ line: 12, column: 5 });
    expect(positions?.["/paths/~1pets/get/operationId"]).toEqual({ line: 13, column: 7 });
    expect(positions?.["/paths/~1pets/get/responses/200"]).toEqual({ line: 27, column: 9 });
  });

  it("sequence items point at the item start", () => {
    const result = parseSpec(PETSTORE_YAML, { sourceLabel: "petstore-mini.yaml" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.positions?.["/paths/~1pets/get/parameters/0"]).toEqual({
      line: 18,
      column: 11,
    });
  });

  it("JSON inputs have no positions (fallback path)", () => {
    const result = parseSpec(PETSTORE_JSON, { sourceLabel: "petstore-mini.json" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.positions).toBeUndefined();
  });

  it("is deterministic across parses", () => {
    const first = parseSpec(PETSTORE_YAML, { sourceLabel: "a.yaml" });
    const second = parseSpec(PETSTORE_YAML, { sourceLabel: "a.yaml" });
    expect(first.ok && second.ok).toBe(true);
    expect(JSON.stringify(first.ok ? first.spec.positions : null)).toBe(
      JSON.stringify(second.ok ? second.spec.positions : null),
    );
  });

  it("aliases register only the first definition site", () => {
    const doc = [
      "openapi: 3.1.0",
      "info: { title: T, version: 1.0.0 }",
      "x-anchor: &a",
      "  type: string",
      "paths:",
      "  /ping:",
      "    get:",
      "      summary: ping",
      "      description: pong",
      "      responses:",
      '        "200":',
      "          description: ok",
      "x-uses: *a",
      "",
    ].join("\n");
    const result = parseSpec(doc, { sourceLabel: "alias.yaml" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.spec.positions?.["/x-anchor/type"]).toEqual({ line: 4, column: 3 });
    expect(result.spec.positions?.["/x-uses"]).toBeDefined();
  });
});
