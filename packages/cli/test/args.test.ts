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
    expect(result.args.writeBaseline).toBe(false);
    expect(result.args.baseline).toBe(false);
    expect(result.args.force).toBe(false);
    expect(result.args.strictHash).toBe(false);
    expect(result.args.baselineIgnoreHash).toBe(false);
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
      "--write-baseline",
      "--baseline-path",
      ".apigovscan/baseline.json",
      "--force",
      "--strict-hash",
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
      rulesFiles: ["custom.yaml"],
      ruleInline: "{}",
      config: "cfg.yaml",
      writeBaseline: true,
      baselinePath: ".apigovscan/baseline.json",
      force: true,
      strictHash: true,
      noColor: true,
      debug: true,
    });
  });

  it("parses --baseline read flag", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--baseline"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.baseline).toBe(true);
  });

  it("rejects --write-baseline with --baseline", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--write-baseline", "--baseline"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("mutually exclusive");
  });

  it("rejects --strict-hash with --baseline-ignore-hash", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--strict-hash", "--baseline-ignore-hash"]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("mutually exclusive");
  });

  it("rejects missing path", () => {
    const result = parseAnalyzeArgs([]);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("missing required argument");
  });

  it("accepts repeated --rules flags", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--rules", "a.yaml", "--rules", "b.yaml"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.rulesFiles).toEqual(["a.yaml", "b.yaml"]);
  });

  it("accepts stdin path", () => {
    const result = parseAnalyzeArgs(["-"]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.args.path).toBe("-");
  });

  it("rejects unknown flags", () => {
    const result = parseAnalyzeArgs(["spec.yaml", "--nope", "x"]);
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
