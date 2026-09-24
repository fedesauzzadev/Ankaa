import { describe, expect, it } from "vitest";
import { reportersPackageId } from "../src/index.js";

describe("@apigovscan/reporters", () => {
  it("exposes package id", () => {
    expect(reportersPackageId()).toBe("@apigovscan/reporters");
  });
});
