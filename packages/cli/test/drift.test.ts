import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  buildShapeMessages,
  buildSpecSkeleton,
  buildSweepMessages,
  compareEndpoints,
  parseShapeResponse,
  parseSweepResponse,
} from "../src/drift.js";
import type { DetectedRoute as Route } from "../src/route-signatures.js";

function route(method: string, path: string, file = "a.js"): Route {
  return { method, path, file, framework: "test" };
}

describe("compareEndpoints (AC-DR.3 parcial)", () => {
  const specOps = [
    { method: "get", path: "/pets" },
    { method: "post", path: "/pets" },
    { method: "get", path: "/gone" },
    { method: "get", path: "/both" },
    { method: "post", path: "/both" },
  ];
  const code: Route[] = [
    route("GET", "/pets"),
    route("POST", "/pets"),
    route("DELETE", "/extra"),
    route("GET", "/both"),
  ];

  it("finds missing, removed and changed endpoints", () => {
    const report = compareEndpoints(specOps, code);
    expect(report.missing).toEqual([{ method: "GET", path: "/gone" }]);
    expect(report.removed).toEqual([{ method: "DELETE", path: "/extra" }]);
    expect(report.changed).toEqual([
      { path: "/both", specMethods: ["GET", "POST"], codeMethods: ["GET"] },
    ]);
    expect(report.shapeNotes).toEqual([]);
  });

  it("wildcard code methods match any spec method", () => {
    const report = compareEndpoints(
      [{ method: "get", path: "/pets" }],
      [route("*", "/pets")],
    );
    expect(report.missing).toEqual([]);
    expect(report.removed).toEqual([]);
    expect(report.changed).toEqual([]);
  });

  it("identical surfaces produce an empty report", () => {
    const report = compareEndpoints(
      [
        { method: "get", path: "/pets" },
        { method: "post", path: "/pets" },
      ],
      [route("GET", "/pets"), route("POST", "/pets")],
    );
    expect(report).toEqual({ missing: [], removed: [], changed: [], shapeNotes: [] });
  });

  it("output is sorted and stable", () => {
    const report = compareEndpoints(
      [
        { method: "get", path: "/z" },
        { method: "get", path: "/a" },
      ],
      [],
    );
    expect(report.missing.map((e) => e.path)).toEqual(["/a", "/z"]);
    const again = compareEndpoints(
      [
        { method: "get", path: "/z" },
        { method: "get", path: "/a" },
      ],
      [],
    );
    expect(again).toEqual(report);
  });
});

describe("buildSpecSkeleton (AC-DR.7 parcial)", () => {
  it("emits a parseable openapi 3.1.0 skeleton with derived operationIds", () => {
    const yaml = buildSpecSkeleton(
      [route("GET", "/pets"), route("GET", "/pets/{petId}"), route("*", "/x")],
      "demo",
    );
    expect(yaml).toContain("openapi: 3.1.0");
    expect(yaml).toContain("Drafted by apigovscan drift from demo");
    const doc = parseYaml(yaml) as {
      paths: Record<string, Record<string, { operationId: string; responses: unknown }>>;
    };
    expect(doc.paths["/pets"]?.get).toMatchObject({ operationId: "getPets" });
    expect(doc.paths["/pets/{petId}"]?.get).toMatchObject({
      operationId: "getPetsByPetId",
    });
    expect(doc.paths["/x"]).toBeUndefined();
  });

  it("empty routes still produce a valid skeleton", () => {
    const doc = parseYaml(buildSpecSkeleton([], "demo")) as {
      paths: Record<string, unknown>;
    };
    expect(doc.paths).toEqual({});
  });
});

describe("parseSweepResponse", () => {
  it("parses fenced arrays and coerces entries", () => {
    const text =
      '```json\n[{"method": "get", "path": "/pets", "confidence": "high", "file": "a.js"},' +
      '{"method": "", "path": "/bad"}, {"method": "POST", "path": "no-slash"},' +
      '{"method": "DELETE", "path": "/x", "confidence": "bogus"}, "junk"]\n```';
    expect(parseSweepResponse(text)).toEqual([
      { method: "GET", path: "/pets", file: "a.js", framework: "llm-sweep" },
      { method: "DELETE", path: "/x", file: "unknown", framework: "llm-sweep" },
    ]);
  });

  it("garbage yields an empty list", () => {
    expect(parseSweepResponse("not json at all")).toEqual([]);
    expect(parseSweepResponse('{"not": "an array"}')).toEqual([]);
  });
});

describe("parseShapeResponse", () => {
  it("parses notes and coerces confidence", () => {
    const text = JSON.stringify([
      { op: "GET /pets", outputChanged: true, confidence: "high", note: "Adds a field." },
      { op: "POST /pets", outputChanged: false, confidence: "maybe", note: "" },
      { op: "", outputChanged: true, confidence: "high", note: "x" },
    ]);
    expect(parseShapeResponse(text)).toEqual([
      { op: "GET /pets", outputChanged: true, confidence: "high", note: "Adds a field." },
      { op: "POST /pets", outputChanged: false, confidence: "low", note: "" },
    ]);
  });

  it("garbage yields an empty list", () => {
    expect(parseShapeResponse("nope")).toEqual([]);
  });
});

describe("message builders redact", () => {
  it("buildSweepMessages only carries file paths", () => {
    const [system, user] = buildSweepMessages(["a.js", "b.py"]);
    expect(system!.role).toBe("system");
    expect(user!.content).toContain("a.js");
  });

  it("buildShapeMessages redacts secrets in fragments", () => {
    const [system, user] = buildShapeMessages([
      {
        op: "GET /pets",
        specFragment: '{"key": "AKIAIOSFODNN7EXAMPLE"}',
        codeFragment: "const x = 1;",
      },
    ]);
    expect(system!.role).toBe("system");
    expect(user!.content).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
});
