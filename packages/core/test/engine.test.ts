import { describe, expect, it } from "vitest";
import {
  computeCoverage,
  computeFingerprint,
  dedupeFindings,
  evaluate,
  explainRule,
  isRuleActive,
  mergeCoverages,
  messageKey,
  severityRank,
  sortFindings,
  validateRule,
} from "../src/index.js";
import type { Finding, Rule, Spec } from "../src/index.js";

function makeSpec(overrides?: Partial<Spec>): Spec {
  const base: Spec = {
    inputHash: "abc",
    openapiVersion: "3.1.0",
    sourceLabel: "test.yaml",
    info: { title: "API", version: "1.0.0" },
    servers: [{ url: "https://api.example.com" }],
    extensions: {},
    operations: [
      {
        method: "get",
        path: "/users",
        operationId: "listUsers",
        summary: "List users",
        description: "Returns a list of users",
        tags: ["users"],
        deprecated: false,
        parameters: [
          {
            name: "limit",
            in: "query",
            required: false,
            jsonPointer: "/paths/~1users/get/parameters/0",
          },
        ],
        responses: [
          {
            status: "200",
            description: "OK",
            content: [],
            headers: [],
            jsonPointer: "/paths/~1users/get/responses/200",
          },
        ],
        security: undefined,
        extensions: {},
        jsonPointer: "/paths/~1users/get",
      },
      {
        method: "post",
        path: "/users",
        operationId: "createUser",
        summary: "Create a user",
        description: "Creates a new user account",
        tags: ["users"],
        deprecated: false,
        parameters: [],
        requestBody: {
          required: true,
          content: [],
          jsonPointer: "/paths/~1users/post/requestBody",
        },
        responses: [
          {
            status: "201",
            description: "Created",
            content: [],
            headers: [],
            jsonPointer: "/paths/~1users/post/responses/201",
          },
        ],
        security: [{ name: "bearerAuth", scopes: [] }],
        extensions: {},
        jsonPointer: "/paths/~1users/post",
      },
    ],
    components: {
      schemas: [],
      responses: [],
      parameters: [],
      securitySchemes: [],
    },
    parseWarnings: [],
  };
  return { ...base, ...overrides };
}

function makeRule(partial?: Partial<Rule>): Rule {
  return {
    id: "STRUCT-001",
    category: "structure",
    severity: "error",
    message: "Operation must document a description",
    when: { op: "missingField", field: "description" },
    packId: "elite",
    packVersion: "2026.09.1",
    ...partial,
  };
}

describe("AC-E.1 golden fingerprint", () => {
  it("emits exactly 1 finding with expected fingerprint", () => {
    const spec = makeSpec();
    const rule = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["get"] },
      message: "GET operations require documentation",
    });
    const result = evaluate({
      specs: [spec],
      packs: [{ id: "elite", version: "2026.09.1", rules: [rule] }],
    });
    expect(result.errors).toEqual([]);
    expect(result.findings).toHaveLength(1);
    const f = result.findings[0]!;
    expect(f.ruleId).toBe("STRUCT-001");
    expect(f.apiLocation).toBe("GET /users");
    const expectedBase = {
      ruleId: "STRUCT-001",
      severity: "error",
      category: "structure",
      message: "GET operations require documentation",
      location: "/paths/~1users/get",
      apiLocation: "GET /users",
      fix: undefined,
      source: undefined,
      packId: "elite",
      packVersion: "2026.09.1",
    };
    expect(f.fingerprint).toBe(computeFingerprint(expectedBase));
    expect(f.fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("AC-E.2 AC-E.3 determinism", () => {
  it("same rule twice + sort yields deep-equal findings", () => {
    const spec = makeSpec();
    const rules = [
      makeRule({ id: "STRUCT-001", when: { op: "method", in: ["get"] } }),
      makeRule({
        id: "DOCS-001",
        category: "docs",
        when: { op: "descriptionMinLength", target: "description", min: 10 },
      }),
    ];
    const pack = { id: "elite", version: "2026.09.1", rules };
    const a = evaluate({ specs: [spec], packs: [pack] });
    const b = evaluate({ specs: [spec], packs: [pack] });
    expect(a.findings).toEqual(b.findings);
    expect(a.findings).toEqual(sortFindings(a.findings));
  });

  it("inverted pack/rule order yields same sorted findings", () => {
    const spec = makeSpec();
    const r1 = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["get"] },
    });
    const r2 = makeRule({
      id: "DOCS-001",
      category: "docs",
      when: { op: "descriptionMinLength", target: "description", min: 10 },
    });
    const a = evaluate({
      specs: [spec],
      packs: [{ id: "elite", version: "2026.09.1", rules: [r1, r2] }],
    });
    const b = evaluate({
      specs: [spec],
      packs: [{ id: "elite", version: "2026.09.1", rules: [r2, r1] }],
    });
    expect(a.findings).toEqual(b.findings);
  });
});

describe("AC-E.4 invalid rule", () => {
  it("unknown op yields issue and is excluded from findings", () => {
    const result = validateRule({
      id: "BAD-001",
      category: "structure",
      severity: "error",
      message: "x",
      when: { op: "notARealAtom" },
      packId: "elite",
      packVersion: "1.0.0",
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0);
  });

  it("evaluate excludes invalid rules and reports errors", () => {
    const spec = makeSpec();
    const bad = {
      id: "BAD-001",
      category: "structure",
      severity: "error",
      message: "x",
      when: { op: "totallyUnknown" },
      packId: "elite",
      packVersion: "1.0.0",
    };
    const good = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["get"] },
    });
    const result = evaluate({
      specs: [spec],
      packs: [{ id: "elite", version: "1.0.0", rules: [good, bad as unknown as Rule] }],
    });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.ruleId).toBe("BAD-001");
    expect(result.findings.every((f) => f.ruleId !== "BAD-001")).toBe(true);
    expect(result.findings.some((f) => f.ruleId === "STRUCT-001")).toBe(true);
  });
});

describe("AC-E.5 severityOverrides", () => {
  it("changes severity but not fingerprint", () => {
    const spec = makeSpec();
    const rule = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["get"] },
      severity: "error",
    });
    const pack = { id: "elite", version: "2026.09.1", rules: [rule] };
    const a = evaluate({ specs: [spec], packs: [pack] });
    const b = evaluate({
      specs: [spec],
      packs: [pack],
      severityOverrides: new Map([["STRUCT-001", "info" as const]]),
    });
    expect(a.findings[0]!.severity).toBe("error");
    expect(b.findings[0]!.severity).toBe("info");
    expect(b.findings[0]!.fingerprint).toBe(a.findings[0]!.fingerprint);
  });
});

describe("AC-E.6 disabledRuleIds", () => {
  it("emits 0 findings for disabled rule", () => {
    const spec = makeSpec();
    const rule = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["get"] },
    });
    const result = evaluate({
      specs: [spec],
      packs: [{ id: "elite", version: "1.0.0", rules: [rule] }],
      disabledRuleIds: new Set(["STRUCT-001"]),
    });
    expect(result.findings).toEqual([]);
  });
});

describe("AC-E.7 unsafe regex", () => {
  it("rejects nested quantifier pattern", () => {
    const result = validateRule(
      makeRule({
        id: "SEC-001",
        when: { op: "pathMatches", pattern: "(a+)+" },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("UNSAFE_PATTERN"))).toBe(true);
    }
  });
});

describe("AC-E.9 combinators", () => {
  it("all/any/not nested 3 levels", () => {
    const spec = makeSpec();
    const rule = makeRule({
      id: "STRUCT-002",
      when: {
        all: [
          { op: "method", in: ["get", "post"] },
          {
            any: [
              { not: { op: "securityMissing" } },
              {
                all: [
                  { op: "pathHasPrefix", prefix: "/users" },
                  { not: { op: "descriptionMatches", target: "summary", pattern: "^$" } },
                ],
              },
            ],
          },
        ],
      },
    });
    const result = evaluate({
      specs: [spec],
      packs: [{ id: "elite", version: "1.0.0", rules: [rule] }],
    });
    expect(result.findings.map((f) => f.apiLocation).sort()).toEqual(["GET /users", "POST /users"]);
  });
});

describe("AC-E.10 per-operation location", () => {
  it("only matches operation A with correct apiLocation", () => {
    const spec = makeSpec();
    const rule = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["post"] },
    });
    const result = evaluate({
      specs: [spec],
      packs: [{ id: "elite", version: "1.0.0", rules: [rule] }],
    });
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]!.apiLocation).toBe("POST /users");
    expect(result.findings[0]!.location).toBe("/paths/~1users/post");
  });
});

describe("atoms batch 1", () => {
  it("pathSegmentPlural / pathHasPrefix / missingField / securityMissing", () => {
    const spec = makeSpec();
    const checks: Array<[string, Rule["when"], string[]]> = [
      [
        "plural on /users",
        { op: "pathSegmentPlural", segmentIndex: -1 },
        ["GET /users", "POST /users"],
      ],
      ["securityMissing on GET", { op: "securityMissing" }, ["GET /users"]],
      ["missing description none", { op: "missingField", field: "description" }, []],
      [
        "responseMissing 404",
        { op: "responseMissing", status: "404" },
        ["GET /users", "POST /users"],
      ],
      ["responsePresent 200", { op: "responsePresent", status: "200" }, ["GET /users"]],
      ["operationIdRequired all", { op: "operationIdRequired" }, ["GET /users", "POST /users"]],
      [
        "descriptionMinLength desc>=10",
        { op: "descriptionMinLength", target: "description", min: 10 },
        ["GET /users", "POST /users"],
      ],
      [
        "pathHasPrefix /users",
        { op: "pathHasPrefix", prefix: "/users" },
        ["GET /users", "POST /users"],
      ],
    ];
    for (const [label, when, expected] of checks) {
      const result = evaluate({
        specs: [spec],
        packs: [
          {
            id: "elite",
            version: "1.0.0",
            rules: [
              makeRule({
                id: "STRUCT-003",
                message: label,
                when,
              }),
            ],
          },
        ],
      });
      expect(result.findings.map((f) => f.apiLocation).sort(), label).toEqual([...expected].sort());
    }
  });
});

describe("sort order", () => {
  it("sorts by severity, ruleId, apiLocation, location, message, fingerprint", () => {
    const findings: Finding[] = [
      {
        fingerprint: "b",
        ruleId: "STRUCT-001",
        severity: "info",
        category: "structure",
        message: "m",
        location: "/l",
        packId: "elite",
        packVersion: "1",
      },
      {
        fingerprint: "a",
        ruleId: "STRUCT-001",
        severity: "error",
        category: "structure",
        message: "m",
        location: "/l",
        packId: "elite",
        packVersion: "1",
      },
    ];
    const sorted = sortFindings(findings);
    expect(sorted.map((f) => f.severity)).toEqual(["error", "info"]);
    expect(severityRank("error")).toBe(0);
    expect(severityRank("warning")).toBe(1);
    expect(severityRank("info")).toBe(2);
  });

  it("messageKey strips placeholders and collapses whitespace", () => {
    expect(messageKey("Found {count} issues   in  op")).toBe("Found issues in op");
  });

  it("dedupe keeps higher severity on same fingerprint", () => {
    const base = {
      ruleId: "X-001",
      severity: "warning" as const,
      category: "structure" as const,
      message: "m",
      location: "/l",
      packId: "elite",
      packVersion: "1",
      fingerprint: "same",
    };
    const worse: Finding = { ...base, severity: "info" };
    const better: Finding = { ...base, severity: "warning" };
    const out = dedupeFindings([worse, better]);
    expect(out).toHaveLength(1);
    expect(out[0]!.severity).toBe("warning");
  });
});

describe("AC-E.11 performance smoke", () => {
  it("500 ops x 50 rules < 500ms", () => {
    const ops = Array.from({ length: 500 }, (_, i) => ({
      method: i % 2 === 0 ? "get" : "post",
      path: `/resource${i}`,
      operationId: `op${i}`,
      summary: `Summary ${i}`,
      description: "A sufficiently long description for the operation",
      tags: ["t"],
      deprecated: false,
      parameters: [],
      responses: [
        {
          status: "200",
          description: "OK",
          content: [],
          headers: [],
          jsonPointer: `/paths/~1resource${i}/get/responses/200`,
        },
      ],
      security: undefined,
      extensions: {},
      jsonPointer: `/paths/~1resource${i}/get`,
    }));
    const spec = makeSpec({ operations: ops as Spec["operations"] });
    const rules = Array.from({ length: 50 }, (_, i) =>
      makeRule({
        id: `STRUCT-${String(i + 1).padStart(3, "0")}`,
        message: `Rule ${i} violation`,
        when:
          i % 3 === 0
            ? ({ op: "method", in: ["get"] } as const)
            : i % 3 === 1
              ? ({ op: "pathSegmentPlural", segmentIndex: -1 } as const)
              : ({
                  op: "descriptionMinLength",
                  target: "description",
                  min: 9999,
                } as const),
      }),
    );
    const pack = { id: "elite", version: "1.0.0", rules };
    const runOnce = () => {
      const start = performance.now();
      const result = evaluate({ specs: [spec], packs: [pack] });
      return { elapsed: performance.now() - start, result };
    };
    runOnce();
    const samples = [runOnce(), runOnce(), runOnce()];
    const best = Math.min(...samples.map((s) => s.elapsed));
    for (const s of samples) expect(s.result.errors).toEqual([]);
    expect(best).toBeLessThan(500);
  });
});

describe("MIXED_SCOPE", () => {
  it("rejects rules that mix doc and operation atoms", () => {
    const result = validateRule(
      makeRule({
        id: "STRUCT-004",
        when: {
          all: [
            { op: "docFieldMissing", field: "info.title" },
            { op: "method", in: ["get"] },
          ],
        },
      }),
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.issues.some((i) => i.includes("MIXED_SCOPE"))).toBe(true);
    }
  });
});

describe("AC-E.13 rule examples", () => {
  it("accepts valid examples (bad and/or good)", () => {
    const both = validateRule(
      makeRule({
        id: "NAMING-001",
        examples: { bad: "paths:\n  /user:", good: "paths:\n  /users:" },
      }),
    );
    expect(both.ok).toBe(true);
    const onlyBad = validateRule(makeRule({ id: "NAMING-002", examples: { bad: "x" } }));
    expect(onlyBad.ok).toBe(true);
    const onlyGood = validateRule(makeRule({ id: "NAMING-003", examples: { good: "x" } }));
    expect(onlyGood.ok).toBe(true);
  });

  it("rejects empty examples and unknown keys", () => {
    const empty = validateRule(makeRule({ id: "NAMING-004", examples: {} }));
    expect(empty.ok).toBe(false);
    if (!empty.ok) {
      expect(empty.issues.some((i) => i.includes("bad|good"))).toBe(true);
    }
    const unknown = validateRule(
      makeRule({ id: "NAMING-005", examples: { bad: "x", nope: "y" } as never }),
    );
    expect(unknown.ok).toBe(false);
  });

  it("rejects examples over 1000 chars", () => {
    const big = `x${"y".repeat(1000)}`;
    const over = validateRule(makeRule({ id: "NAMING-006", examples: { bad: big } }));
    expect(over.ok).toBe(false);
  });

  it("propagates examples to findings without changing fingerprints (INV-2/INV-5)", () => {
    const spec = makeSpec();
    const withEx = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["get"] },
      message: "GET operations require documentation",
      examples: { bad: "get without docs", good: "get with docs" },
    });
    const withoutEx = makeRule({
      id: "STRUCT-001",
      when: { op: "method", in: ["get"] },
      message: "GET operations require documentation",
    });
    const pack = { id: "elite", version: "1.0.0", rules: [withEx] };
    const plainPack = { id: "elite", version: "1.0.0", rules: [withoutEx] };
    const a = evaluate({ specs: [spec], packs: [pack] });
    const b = evaluate({ specs: [spec], packs: [plainPack] });
    expect(a.errors).toEqual([]);
    expect(a.findings).toHaveLength(b.findings.length);
    expect(a.findings[0]!.examples).toEqual({ bad: "get without docs", good: "get with docs" });
    expect(a.findings.map((f) => f.fingerprint)).toEqual(
      b.findings.map((f) => f.fingerprint),
    );
    const rerun = evaluate({ specs: [spec], packs: [pack] });
    expect(JSON.stringify(rerun)).toBe(JSON.stringify(a));
  });

  it("explainRule includes examples when present", () => {
    const pack = {
      id: "elite",
      version: "1.0.0",
      rules: [makeRule({ id: "STRUCT-001", examples: { good: "g" } })],
    };
    const explanation = explainRule(pack.rules, "STRUCT-001");
    expect(explanation?.examples).toEqual({ good: "g" });
    const plain = explainRule([makeRule({ id: "STRUCT-002" })], "STRUCT-002");
    expect(plain?.examples).toBeUndefined();
  });
});

describe("validateRule strictSource", () => {
  it("fails when source missing and strictSource", () => {
    const result = validateRule(makeRule({ source: undefined }), {
      strictSource: true,
    });
    expect(result.ok).toBe(false);
  });
});

describe("AC-CV.1/2 coverage", () => {
  const namingPack = {
    id: "elite",
    version: "2026.09.1",
    rules: [makeRule({ id: "NAMING-004", when: { op: "method", in: ["get"] } })],
  };
  const specWithSchemas = () =>
    makeSpec({
      components: { schemas: ["Pet", "Owner"], responses: [], parameters: [], securitySchemes: [] },
    });

  it("naming-only pack covers operations, leaves response/schema blind (AC-CV.1)", () => {
    const cov = computeCoverage([specWithSchemas()], [namingPack]);
    // 2 ops + 1 param + 1 body + 2 responses + 2 schemas + 6 doc = 14
    expect(cov.total).toBe(14);
    expect(cov.inspected).toBe(2);
    expect(cov.pct).toBe(Math.round((100 * 2) / 14));
    expect(cov.byClass.operation).toEqual({ total: 2, inspected: 2 });
    expect(cov.byClass.response).toEqual({ total: 2, inspected: 0 });
    expect(cov.byClass.schema).toEqual({ total: 2, inspected: 0 });
    expect(cov.byClass.parameter).toEqual({ total: 1, inspected: 0 });
    expect(cov.byClass.requestBody).toEqual({ total: 1, inspected: 0 });
    expect(cov.byClass.doc).toEqual({ total: 6, inspected: 0 });
  });

  it("doc + response + schema rules cover their classes", () => {
    const pack = {
      id: "elite",
      version: "2026.09.1",
      rules: [
        makeRule({ id: "STRUCT-002", when: { op: "docFieldMissing", field: "info.title" } }),
        makeRule({ id: "RESP-001", when: { op: "responseMissing", status: "2xx" } }),
        makeRule({ id: "NAMING-007", when: { op: "schemaNameNotMatching", pattern: "^[A-Z]" } }),
      ],
    };
    const cov = computeCoverage([specWithSchemas()], [pack]);
    expect(cov.byClass.doc).toEqual({ total: 6, inspected: 6 });
    expect(cov.byClass.response).toEqual({ total: 2, inspected: 2 });
    expect(cov.byClass.schema).toEqual({ total: 2, inspected: 2 });
    expect(cov.byClass.operation).toEqual({ total: 2, inspected: 0 });
    expect(cov.inspected).toBe(10);
    expect(cov.pct).toBe(Math.round((100 * 10) / 14));
  });

  it("field-dependent atoms map by field/target", () => {
    const pack = {
      id: "elite",
      version: "2026.09.1",
      rules: [
        makeRule({ id: "STRUCT-010", when: { op: "presentField", field: "requestBody" } }),
        makeRule({
          id: "RESP-010",
          when: { op: "descriptionMinLength", target: "response", min: 5 },
        }),
      ],
    };
    const cov = computeCoverage([makeSpec()], [pack]);
    expect(cov.byClass.requestBody).toEqual({ total: 1, inspected: 1 });
    expect(cov.byClass.response).toEqual({ total: 2, inspected: 2 });
    expect(cov.byClass.operation).toEqual({ total: 2, inspected: 0 });
  });

  it("disabled/deprecated/opt-in rules do not count (AC-CV.2)", () => {
    const rule = makeRule({ id: "NAMING-004", when: { op: "method", in: ["get"] } });
    const pack = { id: "elite", version: "2026.09.1", rules: [rule] };
    const spec = [makeSpec()];
    expect(
      computeCoverage(spec, [pack], { disabledRuleIds: new Set(["NAMING-004"]) }).inspected,
    ).toBe(0);
    const deprecated = { id: "elite", version: "1", rules: [{ ...rule, deprecated: true }] };
    expect(computeCoverage(spec, [deprecated]).inspected).toBe(0);
    const optIn = { id: "x", version: "1", rules: [{ ...rule, enabledByDefault: false }] };
    expect(computeCoverage(spec, [optIn]).inspected).toBe(0);
    expect(
      computeCoverage(spec, [optIn], { customRules: [{ ...rule, enabledByDefault: false }] })
        .inspected,
    ).toBe(2);
  });

  it("invalid rules are skipped, same input is deep-equal (INV-2)", () => {
    const pack = {
      id: "elite",
      version: "2026.09.1",
      rules: [
        makeRule({ id: "NAMING-004", when: { op: "method", in: ["get"] } }),
        makeRule({ id: "X-001", when: { op: "nope" } as never }),
      ],
    };
    const a = computeCoverage([makeSpec()], [pack]);
    expect(a.inspected).toBe(2);
    const b = computeCoverage([makeSpec()], [pack]);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it("mergeCoverages adds totals and keeps per-input class attribution", () => {
    const namingPack = {
      id: "elite",
      version: "2026.09.1",
      rules: [makeRule({ id: "NAMING-004", when: { op: "method", in: ["get"] } })],
    };
    const docPack = {
      id: "elite",
      version: "2026.09.1",
      rules: [makeRule({ id: "STRUCT-002", when: { op: "docFieldMissing", field: "info.title" } })],
    };
    const a = computeCoverage([makeSpec()], [namingPack]);
    const b = computeCoverage([makeSpec()], [docPack]);
    const merged = mergeCoverages([a, b]);
    expect(merged.total).toBe(a.total + b.total);
    expect(merged.byClass.operation).toEqual({ total: 4, inspected: 2 });
    expect(merged.byClass.doc).toEqual({ total: 12, inspected: 6 });
    expect(merged.byClass.response).toEqual({ total: 4, inspected: 0 });
    expect(merged.inspected).toBe(8);
    expect(merged.pct).toBe(Math.round((100 * 8) / merged.total));
    expect(mergeCoverages([])).toEqual({
      total: 0,
      inspected: 0,
      pct: 100,
      byClass: {
        operation: { total: 0, inspected: 0 },
        parameter: { total: 0, inspected: 0 },
        requestBody: { total: 0, inspected: 0 },
        response: { total: 0, inspected: 0 },
        schema: { total: 0, inspected: 0 },
        doc: { total: 0, inspected: 0 },
      },
    });
  });

  it("isRuleActive mirrors engine activation", () => {
    const base = makeRule({ id: "A-001" });
    expect(isRuleActive(base, new Set())).toBe(true);
    expect(isRuleActive(base, new Set(), new Set(["A-001"]))).toBe(false);
    expect(isRuleActive({ ...base, deprecated: true }, new Set())).toBe(false);
    expect(isRuleActive({ ...base, enabledByDefault: false }, new Set())).toBe(false);
    expect(isRuleActive({ ...base, enabledByDefault: false }, new Set(["A-001"]))).toBe(true);
  });
});
