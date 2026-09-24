import { describe, expect, it } from "vitest";
import { mcpPackageId } from "../src/index.js";

describe("@apigovscan/mcp", () => {
  it("exposes package id", () => {
    expect(mcpPackageId()).toBe("@apigovscan/mcp");
  });
});
