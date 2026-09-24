import { describe, expect, it } from "vitest";
import { VERSION, isSeverity, packageVersion } from "../src/index.js";

describe("@apigovscan/core", () => {
  it("exposes a dev version", () => {
    expect(VERSION).toBe("0.0.0-dev");
    expect(packageVersion()).toBe(VERSION);
  });

  it("validates severity literals", () => {
    expect(isSeverity("error")).toBe(true);
    expect(isSeverity("warning")).toBe(true);
    expect(isSeverity("info")).toBe(true);
    expect(isSeverity("fatal")).toBe(false);
    expect(isSeverity(42)).toBe(false);
  });
});
