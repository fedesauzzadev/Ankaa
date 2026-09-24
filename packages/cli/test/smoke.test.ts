import { describe, expect, it } from "vitest";
import { getHelp, getVersion, run } from "../src/index.js";

describe("@apigovscan/cli", () => {
  it("reports dev version", () => {
    expect(getVersion()).toBe("0.0.0-dev");
  });

  it("prints help text with usage", () => {
    expect(getHelp()).toContain("apigovscan");
    expect(getHelp()).toContain("--version");
  });

  it("returns 0 for --version", () => {
    expect(run(["node", "cli", "--version"])).toBe(0);
  });

  it("returns 0 for --help", () => {
    expect(run(["node", "cli", "--help"])).toBe(0);
  });

  it("returns 2 for unknown command", () => {
    expect(run(["node", "cli", "frobnicate"])).toBe(2);
  });

  it("returns 2 for analyze until M1.4", () => {
    expect(run(["node", "cli", "analyze", "./x.yaml"])).toBe(2);
  });
});
