import { describe, expect, it } from "vitest";
import { attachPositions, computeFingerprint, sortFindings } from "../src/index.js";
import type { Finding, Spec } from "../src/index.js";

function specWithPositions(): Spec {
  return {
    inputHash: "abc",
    openapiVersion: "3.1.0",
    sourceLabel: "t.yaml",
    info: {},
    servers: [],
    extensions: {},
    operations: [],
    components: { schemas: [], responses: [], parameters: [], securitySchemes: [] },
    parseWarnings: [],
    positions: {
      "/paths/~1users/get": { line: 12, column: 5 },
      "/info": { line: 2, column: 1 },
    },
  };
}

function findingAt(location: string): Finding {
  const base = {
    ruleId: "NAMING-001",
    severity: "warning" as const,
    category: "naming" as const,
    message: "Resource path segments should be plural nouns.",
    location,
    fix: "Rename.",
    packId: "elite",
    packVersion: "1",
  };
  return { ...base, fingerprint: computeFingerprint(base) };
}

describe("attachPositions (M17.8a)", () => {
  it("enriches exact pointer matches and leaves misses untouched", () => {
    const spec = specWithPositions();
    const hit = findingAt("/paths/~1users/get");
    const miss = findingAt("/paths/~1orders/get");
    const [enrichedHit, enrichedMiss] = attachPositions([hit, miss], spec);
    expect(enrichedHit.position).toEqual({ line: 12, column: 5 });
    expect(enrichedMiss.position).toBeUndefined();
  });

  it("never changes fingerprints or canonical order", () => {
    const spec = specWithPositions();
    const findings = sortFindings([findingAt("/paths/~1users/get")]);
    const before = findings.map((f) => f.fingerprint);
    const after = attachPositions(findings, spec).map((f) => f.fingerprint);
    expect(after).toEqual(before);
  });

  it("specs without positions return the same findings", () => {
    const spec = specWithPositions();
    spec.positions = undefined;
    const findings = [findingAt("/paths/~1users/get")];
    expect(attachPositions(findings, spec)).toBe(findings);
  });
});
