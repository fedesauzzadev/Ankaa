import { describe, expect, it } from "vitest";
import { buildFixMessages, resolveFingerprint } from "../src/fix.js";

const FPS = ["a".repeat(64), "ab" + "c".repeat(62), "b".repeat(64)];

describe("resolveFingerprint (short unique prefixes)", () => {
  it("resolves the full fingerprint", () => {
    expect(resolveFingerprint(FPS, "a".repeat(64))).toEqual({
      ok: true,
      fingerprint: "a".repeat(64),
    });
  });

  it("resolves a unique short prefix", () => {
    expect(resolveFingerprint(FPS, "b".repeat(8))).toEqual({
      ok: true,
      fingerprint: "b".repeat(64),
    });
  });

  it("reports unknown fingerprints honestly", () => {
    const out = resolveFingerprint(FPS, "f".repeat(12));
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("finding not found");
  });

  it("reports ambiguous prefixes honestly", () => {
    const out = resolveFingerprint(FPS, "a");
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error).toContain("ambiguous fingerprint prefix");
  });
});

describe("buildFixMessages (rule examples)", () => {
  const base = {
    fileLabel: "spec.yaml",
    ruleId: "NAMING-001",
    severity: "error",
    message: "Resource path segments should be plural nouns.",
    location: "/paths",
    fragment: "{}",
  };

  it("includes bad/good examples in the user prompt when present", () => {
    const [system, user] = buildFixMessages({
      ...base,
      examples: { bad: "paths:\n  /user:", good: "paths:\n  /users:" },
    });
    expect(system).toBeDefined();
    expect(user.content).toContain("bad example:\npaths:\n  /user:");
    expect(user.content).toContain("good example:\npaths:\n  /users:");
  });

  it("omits example lines when the rule has no examples", () => {
    const [, user] = buildFixMessages(base);
    expect(user.content).not.toContain("bad example:");
    expect(user.content).not.toContain("good example:");
  });

  it("includes only the sides the rule defines", () => {
    const [, user] = buildFixMessages({ ...base, examples: { good: "paths:\n  /users:" } });
    expect(user.content).not.toContain("bad example:");
    expect(user.content).toContain("good example:\npaths:\n  /users:");
  });
});
