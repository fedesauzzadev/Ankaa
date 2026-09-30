import { describe, expect, it } from "vitest";
import { reportersPackageId } from "../src/index.js";

describe("@ankaa/reporters", () => {
  it("exposes package id", () => {
    expect(reportersPackageId()).toBe("@ankaa/reporters");
  });
});
