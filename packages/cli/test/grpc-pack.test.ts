import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { evaluate, flattenRuleLists, loadPack } from "@ankaa/core";
import { parseProto } from "@ankaa/grpc";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packDir = join(repoRoot, "packs", "grpc");

function loadGrpcPack() {
  const meta = parseYaml(readFileSync(join(packDir, "pack.yaml"), "utf8")) as {
    id: string;
    version: string;
    strictSource?: boolean;
  };
  const rulesDir = join(packDir, "rules");
  const files = readdirSync(rulesDir)
    .filter((f) => f.endsWith(".yaml") || f.endsWith(".yml"))
    .sort();
  const lists = files.map((f) => {
    const parsed = parseYaml(readFileSync(join(rulesDir, f), "utf8"));
    if (!Array.isArray(parsed)) {
      throw new Error(`rules/${f} must be a YAML array of rules`);
    }
    return parsed;
  });
  return loadPack(
    {
      id: meta.id,
      version: meta.version,
      strictSource: meta.strictSource === true,
    },
    flattenRuleLists(lists),
  );
}

const loaded = loadGrpcPack();
if (!loaded.ok) {
  throw new Error(`grpc pack failed to load: ${JSON.stringify(loaded.errors)}`);
}

function fires(ruleId: string, proto: string): boolean {
  const parsed = parseProto(proto, { sourceLabel: "inline.proto" });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return false;
  const result = evaluate({ specs: [parsed.spec], packs: [loaded.pack] });
  expect(result.errors).toEqual([]);
  return result.findings.some((f) => f.ruleId === ruleId);
}

function svc(body: string, pkg = "package test.v1;"): string {
  return `syntax = "proto3";\n${pkg}\nservice Svc {\n${body}\n}\nmessage Req {}\nmessage Res {}\n`;
}

const EXPECTED: Array<{ id: string; severity: "warning" | "info" }> = [
  { id: "GRPC-001", severity: "warning" },
  { id: "GRPC-002", severity: "warning" },
  { id: "GRPC-003", severity: "warning" },
  { id: "GRPC-004", severity: "info" },
  { id: "GRPC-005", severity: "info" },
  { id: "GRPC-006", severity: "info" },
  { id: "GRPC-007", severity: "warning" },
];

describe("grpc pack inventory (M8.7)", () => {
  it("holds 7 active rules", () => {
    expect(loaded.pack.rules).toHaveLength(7);
  });

  it("contains every rule id with the expected severity", () => {
    const byId = new Map(loaded.pack.rules.map((r) => [r.id, r.severity]));
    for (const { id, severity } of EXPECTED) {
      expect(byId.get(id)).toBe(severity);
    }
  });

  it("GRPC-001 fires on non-PascalCase services and methods", () => {
    expect(
      fires("GRPC-001", svc("// Get a thing with words.\nrpc GetThing(Req) returns (Res);")),
    ).toBe(false);
    expect(
      fires("GRPC-001", svc("// Bad method name here now.\nrpc get_thing(Req) returns (Res);")),
    ).toBe(true);
  });

  it("GRPC-002 fires on non-snake_case fields", () => {
    const good = `syntax = "proto3";\npackage test.v1;\nmessage M {\n string pet_id = 1;\n}\nservice Svc {\n // Get a thing with words.\n rpc GetThing(M) returns (M);\n}`;
    expect(fires("GRPC-002", good)).toBe(false);
    const bad = `syntax = "proto3";\npackage test.v1;\nmessage M {\n string petId = 1;\n}\nservice Svc {\n // Get a thing with words.\n rpc GetThing(M) returns (M);\n}`;
    expect(fires("GRPC-002", bad)).toBe(true);
  });

  it("GRPC-003 fires on missing rpc descriptions", () => {
    expect(
      fires("GRPC-003", svc("// Get a thing with words.\nrpc GetThing(Req) returns (Res);")),
    ).toBe(false);
    expect(fires("GRPC-003", svc("rpc GetThing(Req) returns (Res);"))).toBe(true);
  });

  it("GRPC-004 fires on short rpc descriptions", () => {
    expect(
      fires(
        "GRPC-004",
        svc("// Get a thing with enough words here.\nrpc GetThing(Req) returns (Res);"),
      ),
    ).toBe(false);
    expect(fires("GRPC-004", svc("// Too short.\nrpc GetThing(Req) returns (Res);"))).toBe(true);
  });

  it("GRPC-005 fires on TODO placeholders", () => {
    expect(
      fires("GRPC-005", svc("// Get a thing with words here.\nrpc GetThing(Req) returns (Res);")),
    ).toBe(false);
    expect(
      fires("GRPC-005", svc("// TODO: document this method.\nrpc GetThing(Req) returns (Res);")),
    ).toBe(true);
  });

  it("GRPC-006 fires on non-standard verbs", () => {
    expect(
      fires(
        "GRPC-006",
        svc("// List all the things now here.\nrpc ListThings(Req) returns (Res);"),
      ),
    ).toBe(false);
    expect(
      fires(
        "GRPC-006",
        svc("// Activate the thing right now here.\nrpc ActivateThing(Req) returns (Res);"),
      ),
    ).toBe(true);
  });

  it("GRPC-007 fires when package is missing", () => {
    expect(
      fires("GRPC-007", svc("// Get a thing with words.\nrpc GetThing(Req) returns (Res);")),
    ).toBe(false);
    expect(
      fires("GRPC-007", svc("// Get a thing with words.\nrpc GetThing(Req) returns (Res);", "")),
    ).toBe(true);
  });
});
