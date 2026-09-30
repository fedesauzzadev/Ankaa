import { describe, expect, it } from "vitest";
import type { Finding } from "@ankaa/core";
import { buildIntegrationExport, type ExportableReport } from "../src/export.js";

const first: Finding = {
  fingerprint: "a".repeat(64),
  ruleId: "NAMING-001",
  severity: "warning",
  category: "naming",
  message: "Use plural resource names.",
  location: "openapi.yaml#/paths/~1user/get",
  apiLocation: "GET /user",
  packId: "elite",
  packVersion: "2026.09.1",
};

const report: ExportableReport = {
  tool: { name: "ankaa", version: "1.0.0" },
  input: [{ path: "openapi.yaml", sha256: "b".repeat(64) }],
  findings: [first],
};

describe("buildIntegrationExport", () => {
  it("groups findings by owner and marks new/repeated fingerprints", () => {
    const output = buildIntegrationExport(
      report,
      { ...report, findings: [first] },
      {
        "openapi.yaml": "payments",
      },
    );
    expect(output.groups).toHaveLength(1);
    expect(output.schemaVersion).toBe(1);
    expect(output.groups[0]?.name).toBe("payments");
    expect(output.groups[0]?.findings[0]).toMatchObject({
      ruleId: "NAMING-001",
      owner: "payments",
      trend: "repeated",
    });
    expect(output.summary).toEqual({
      error: 0,
      warning: 1,
      info: 0,
      total: 1,
      new: 0,
      repeated: 1,
    });
  });

  it("defaults to ungrouped and is deterministic without a baseline", () => {
    const once = buildIntegrationExport(report, undefined, undefined);
    expect(once.groups[0]?.name).toBe("ungrouped");
    expect(once.groups[0]?.findings[0]?.trend).toBe("new");
    expect(JSON.stringify(once)).toBe(
      JSON.stringify(buildIntegrationExport(report, undefined, undefined)),
    );
  });
});
