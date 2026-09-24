import { describe, expect, it } from "vitest";
import { parseAnalyzeArgs } from "../src/args.js";

describe("parseAnalyzeArgs", () => {
  it("parses path and defaults", () => {
    const result = parseAnalyzeArgs(["./openapi.yaml"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.path).toBe("./openapi.yaml");
    expect(result.args.format).toBe("console");
    expect(result.args.noColor).toBe(false);
    expect(result.args.debug).toBe(false);
    expect(result.args.failOn).toBeUndefined();
  });

  it("parses all supported flags", () => {
    const result = parseAnalyzeArgs([
      "spec.yaml",
      "--format",
      "json",
      "--output",
      "r.json",
      "--fail-on",
      "warning",
      "--rules",
      "custom.yaml",
      "--rule",
      "{}",
      "--config",
      "cfg.yaml",
      "--no-color",
      "--debug",
    ]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args).toMatchObject({
      path: "spec.yaml",
      format: "json",
      output: "r.json",
      failOn: "warning",
      rulesFile: "custom.yaml",
      ruleInline: "{}",
      config: "cfg.yaml",
      noColor: true,
      debug: true,
    });
  });

  it("accepts stdin path", () => {
    const result = parseAnalyzeArgs(["-"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.path).toBe("-");
  });

  it("rejects missing path", () => {
    const result = parseAnalyzeArgs([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("missing required argument");
  });

  it("rejects unknown flags", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--baseline", "x"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unknown option");
  });

  it("rejects invalid --format", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--format", "yaml"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid --format");
  });

  it("rejects invalid --fail-on", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--fail-on", "fatal"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("invalid --fail-on");
  });

  it("rejects extra positional args", () => {
    const result = parseAnalyzeArgs(["a.yaml", "b.yaml"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("unexpected argument");
  });

  it("rejects flag missing its value", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--output"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("--output requires");
  });
});
