import { describe, expect, it } from "vitest";
import { openapiPackageId } from "../src/index.js";

describe("@ankaa/openapi", () => {
  it("exposes package id", () => {
    expect(openapiPackageId()).toBe("@ankaa/openapi");
  });
});
