import { describe, expect, it } from "vitest";
import { openapiPackageId } from "../src/index.js";

describe("@apigovscan/openapi", () => {
  it("exposes package id", () => {
    expect(openapiPackageId()).toBe("@apigovscan/openapi");
  });
});
