import { describe, expect, it } from "vitest";
import type { EvaluationResult, Finding } from "@apigovscan/core";
import {
  buildReport,
  formatAnnotations,
  formatMarkdown,
  formatSarif,
} from "../src/index.js";

interface SarifRule {
  id: string;
  help?: { text: string };
  helpUri?: string;
  properties: Record<string, string>;
}

interface SarifResult {
  ruleId: string;
  level: string;
  message: { text: string };
  locations: Array<{
    physicalLocation: {
      artifactLocation: { uri: string };
      region?: unknown;
    };
  }>;
  partialFingerprints: Record<string, string>;
}

interface SarifDoc {
  $schema: string;
  version: string;
  runs: Array<{
    tool: { driver: { name: string; version: string; rules: SarifRule[] } };
    results: SarifResult[];
    properties?: Record<string, unknown>;
  }>;
}

function finding(partial: Partial<Finding> = {}): Finding {
  return {
    fingerprint: "a".repeat(64),
    ruleId: "NAMING-001",
    severity: "error",
    category: "naming",
    message: "Resource path segments should be plural nouns.",
    location: "/paths/~1user/get",
    apiLocation: "GET /user",
    fix: "Rename user to users.",
    source: {
      title: "Microsoft REST API Guidelines",
      url: "https://github.com/microsoft/api-guidelines",
    },
    packId: "elite",
    packVersion: "2026.09.1",
    ...partial,
  };
}

function result(findings: Finding[]): EvaluationResult {
  return { findings, errors: [] };
}

function makeReport(
  overrides: Partial<Parameters<typeof buildReport>[0]> = {},
) {
  return buildReport({
    results: [result([finding()])],
    inputs: [{ path: "openapi.yaml", sha256: "sha256:9f3a" }],
    packs: [{ id: "elite", version: "2026.09.1" }],
    toolVersion: "0.0.0-dev",
    ...overrides,
  });
}

function sarifOf(report: ReturnType<typeof makeReport>): SarifDoc {
  return JSON.parse(formatSarif(report)) as SarifDoc;
}

describe("formatSarif (AC-SARIF.*)", () => {
  it("AC-SARIF.1 emits valid SARIF 2.1.0 skeleton", () => {
    const sarif = sarifOf(makeReport());
    expect(sarif.$schema).toBe("https://json.schemastore.org/sarif-2.1.0.json");
    expect(sarif.version).toBe("2.1.0");
    expect(sarif.runs).toHaveLength(1);
    expect(sarif.runs[0].tool.driver.name).toBe("apigovscan");
    expect(sarif.runs[0].tool.driver.version).toBe("0.0.0-dev");
  });

  it("AC-S.6 carries governance score in run properties", () => {
    const sarif = sarifOf(makeReport());
    expect(sarif.runs[0].properties).toEqual({
      "apigovscan/score": 92,
      "apigovscan/grade": "A",
    });
  });

  it("AC-SARIF.2 maps severities to error/warning/note", () => {
    const report = makeReport({
      results: [
        result([
          finding(),
          finding({ severity: "warning", fingerprint: "b".repeat(64) }),
          finding({ severity: "info", fingerprint: "c".repeat(64) }),
        ]),
      ],
    });
    const levels = sarifOf(report).runs[0].results.map((r) => r.level);
    expect(levels).toEqual(["error", "warning", "note"]);
  });

  it("AC-SARIF.3 uri is the label before # and there is no region", () => {
    const multi = makeReport({
      inputs: [
        { path: "a.yaml", sha256: "sha256:aa" },
        { path: "b.yaml", sha256: "sha256:bb" },
      ],
      results: [result([finding({ location: "a.yaml#/paths/~1user/get" })])],
    });
    const multiText = formatSarif(multi);
    const multiLocation =
      sarifOf(multi).runs[0].results[0].locations[0].physicalLocation;
    expect(multiLocation.artifactLocation.uri).toBe("a.yaml");
    expect(multiLocation.region).toBeUndefined();
    expect(multiText).not.toContain('"region"');

    const singleLocation =
      sarifOf(makeReport()).runs[0].results[0].locations[0].physicalLocation;
    expect(singleLocation.artifactLocation.uri).toBe("openapi.yaml");
    expect(singleLocation.region).toBeUndefined();
  });

  it("AC-SARIF.4 deterministic and free of meta/timestamps", () => {
    const report = makeReport({
      meta: { durationMs: 1234, startedAt: "2026-09-24T00:00:00.000Z" },
    });
    const a = formatSarif(report);
    const b = formatSarif(report);
    expect(a).toBe(b);
    expect(a).not.toContain("startedAt");
    expect(a).not.toContain("durationMs");
    expect(a).not.toContain("2026-09-24");
  });

  it("AC-SARIF.5 rules deduped, sorted, helpUri/help only when present", () => {
    const report = makeReport({
      results: [
        result([
          finding({
            ruleId: "ZETA-001",
            fingerprint: "b".repeat(64),
            source: undefined,
            fix: undefined,
          }),
          finding({ fingerprint: "c".repeat(64) }),
          finding({ ruleId: "ALPHA-001", fingerprint: "d".repeat(64) }),
        ]),
      ],
    });
    const rules = sarifOf(report).runs[0].tool.driver.rules;
    expect(rules.map((r) => r.id)).toEqual([
      "ALPHA-001",
      "NAMING-001",
      "ZETA-001",
    ]);
    const zeta = rules.find((r) => r.id === "ZETA-001")!;
    expect(zeta.helpUri).toBeUndefined();
    expect(zeta.help).toBeUndefined();
    const naming = rules.find((r) => r.id === "NAMING-001")!;
    expect(naming.helpUri).toBe("https://github.com/microsoft/api-guidelines");
    expect(naming.help?.text).toBe("Rename user to users.");
    expect(naming.properties["apigovscan/pack"]).toBe("elite@2026.09.1");
    expect(naming.properties["apigovscan/severity"]).toBe("error");
  });

  it("AC-SARIF.6 carries the finding fingerprint", () => {
    const sarif = sarifOf(makeReport());
    expect(sarif.runs[0].results[0].partialFingerprints).toEqual({
      apigovscanFingerprint: "a".repeat(64),
    });
  });

  it("AC-SARIF.7 one rule per unique ruleId, one result per finding", () => {
    const report = makeReport({
      results: [
        result([
          finding(),
          finding({ fingerprint: "b".repeat(64) }),
          finding({ ruleId: "ERR-001", fingerprint: "c".repeat(64) }),
        ]),
      ],
    });
    const sarif = sarifOf(report);
    expect(sarif.runs[0].tool.driver.rules).toHaveLength(2);
    expect(sarif.runs[0].results).toHaveLength(3);
  });

  it("pretty option indents (default pretty)", () => {
    const report = makeReport();
    expect(formatSarif(report)).toContain("\n  ");
    expect(formatSarif(report, { pretty: false })).not.toContain("\n  ");
  });
});

describe("formatMarkdown (AC-MD.*)", () => {
  it("AC-MD.1 includes counts, reportHash and no ANSI", () => {
    const out = formatMarkdown(makeReport());
    expect(out).toContain("# ApiGovScan report");
    expect(out).toContain("1 error · 0 warnings · 0 info");
    expect(out).toContain("reportHash");
    expect(out).toContain("| Tool | apigovscan 0.0.0-dev |");
    expect(out).toContain("| Score | **92/100 (A)** |");
    expect(out.includes(String.fromCharCode(27))).toBe(false);
  });

  it("AC-MD.2 deterministic", () => {
    const report = makeReport({ meta: { durationMs: 5 } });
    expect(formatMarkdown(report)).toBe(formatMarkdown(report));
  });

  it("AC-MD.3 escapes pipes and newlines in cells", () => {
    const report = makeReport({
      results: [
        result([
          finding({
            message: "bad | table\nsecond line",
            fix: undefined,
          }),
        ]),
      ],
    });
    const out = formatMarkdown(report);
    expect(out).toContain("bad \\| table<br>second line");
    expect(out).not.toContain("bad | table");
  });

  it("renders _(none)_ for empty severities and missing fix", () => {
    const out = formatMarkdown(
      makeReport({ results: [result([finding({ fix: undefined })])] }),
    );
    expect(out).toContain("### warning\n\n_(none)_");
    expect(out).toContain("| _(none)_ |");
  });

  it("shows suppression notes when present", () => {
    const out = formatMarkdown(
      makeReport({ suppressed: 3, skillsSuppressed: 2 }),
    );
    expect(out).toContain("(baseline: 3 suppressed)");
    expect(out).toContain("(skills: 2 suppressed)");
  });
});

describe("formatAnnotations (AC-ANN.*)", () => {
  it("AC-ANN.1 one command per finding with mapped level", () => {
    const report = makeReport({
      results: [
        result([
          finding(),
          finding({ severity: "warning", fingerprint: "b".repeat(64) }),
          finding({ severity: "info", fingerprint: "c".repeat(64) }),
        ]),
      ],
    });
    const lines = formatAnnotations(report).trimEnd().split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[0]).toMatch(/^::error file=openapi\.yaml,title=NAMING-001::/);
    expect(lines[1].startsWith("::warning ")).toBe(true);
    expect(lines[2].startsWith("::notice ")).toBe(true);
  });

  it("AC-ANN.2 escapes data and property characters", () => {
    const report = makeReport({
      inputs: [
        { path: "dir/a,b.yaml", sha256: "sha256:aa" },
        { path: "b.yaml", sha256: "sha256:bb" },
      ],
      results: [
        result([
          finding({
            location: "dir/a,b.yaml#/paths/~1x/get",
            message: "100% broken\nsecond",
          }),
        ]),
      ],
    });
    const line = formatAnnotations(report).trimEnd();
    expect(line).not.toContain("\n");
    expect(line).toContain("file=dir/a%2Cb.yaml");
    expect(line).toContain("title=NAMING-001");
    expect(line).toContain("100%25 broken%0Asecond");
  });

  it("AC-ANN.3 empty report yields empty output", () => {
    expect(formatAnnotations(makeReport({ results: [result([])] }))).toBe("");
  });

  it("omits file property when the uri cannot be resolved", () => {
    const report = makeReport({
      inputs: [
        { path: "a.yaml", sha256: "sha256:aa" },
        { path: "b.yaml", sha256: "sha256:bb" },
      ],
      results: [result([finding({ location: "/paths/~1user/get" })])],
    });
    const line = formatAnnotations(report).trimEnd();
    expect(line.startsWith("::error title=NAMING-001::")).toBe(true);
  });
});

describe("redaction in new formats (AC-RED.1)", () => {
  const report = makeReport({
    results: [
      result([
        finding({
          message:
            "Example leaks: -----BEGIN PRIVATE KEY-----\nsecretmaterial\n-----END PRIVATE KEY-----",
        }),
      ]),
    ],
  });

  it("sarif has no raw secret", () => {
    expect(formatSarif(report)).not.toContain("secretmaterial");
    expect(formatSarif(report)).toContain("***REDACTED***");
  });

  it("markdown has no raw secret", () => {
    expect(formatMarkdown(report)).not.toContain("secretmaterial");
    expect(formatMarkdown(report)).toContain("***REDACTED***");
  });

  it("annotations have no raw secret", () => {
    expect(formatAnnotations(report)).not.toContain("secretmaterial");
    expect(formatAnnotations(report)).toContain("***REDACTED***");
  });
});
