import { describe, expect, it } from "vitest";
import { resolveFingerprint } from "../src/fix.js";

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
