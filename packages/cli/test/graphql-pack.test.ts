import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import { evaluate, flattenRuleLists, loadPack } from "@apigovscan/core";
import { parseGraphQL } from "@apigovscan/graphql";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const packDir = join(repoRoot, "packs", "graphql");

function loadGraphqlPack() {
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

const loaded = loadGraphqlPack();
if (!loaded.ok) {
  throw new Error(`graphql pack failed to load: ${JSON.stringify(loaded.errors)}`);
}

function fires(ruleId: string, sdl: string): boolean {
  const parsed = parseGraphQL(sdl, { sourceLabel: "inline.graphql" });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return false;
  const result = evaluate({ specs: [parsed.spec], packs: [loaded.pack] });
  expect(result.errors).toEqual([]);
  return result.findings.some((f) => f.ruleId === ruleId);
}

function doc(body: string): string {
  return `type Query { noop: String }\n${body}`;
}

const EXPECTED: Array<{ id: string; severity: "warning" | "info" }> = [
  { id: "GQL-001", severity: "warning" },
  { id: "GQL-002", severity: "warning" },
  { id: "GQL-003", severity: "info" },
  { id: "GQL-004", severity: "warning" },
  { id: "GQL-005", severity: "warning" },
  { id: "GQL-006", severity: "warning" },
  { id: "GQL-007", severity: "warning" },
  { id: "GQL-008", severity: "info" },
];

describe("graphql pack inventory (M8.6)", () => {
  it("holds 8 active rules", () => {
    expect(loaded.pack.rules).toHaveLength(8);
  });

  it("contains every rule id with the expected severity", () => {
    const byId = new Map(loaded.pack.rules.map((r) => [r.id, r.severity]));
    for (const { id, severity } of EXPECTED) {
      expect(byId.get(id)).toBe(severity);
    }
  });

  it("GQL-001 fires on non camelCase fields", () => {
    expect(fires("GQL-001", `type Query { "Ok field here." okField: String }`)).toBe(false);
    expect(fires("GQL-001", `type Query { Bad_Field: String }`)).toBe(true);
  });

  it("GQL-002 fires on missing descriptions", () => {
    expect(fires("GQL-002", `type Query { "Long enough description here." a: String }`)).toBe(
      false,
    );
    expect(fires("GQL-002", `type Query { b: String }`)).toBe(true);
  });

  it("GQL-003 fires on short descriptions", () => {
    expect(fires("GQL-003", `type Query { "A sufficiently long description." a: String }`)).toBe(
      false,
    );
    expect(fires("GQL-003", `type Query { "Too short." b: String }`)).toBe(true);
  });

  it("GQL-004 fires on @deprecated without reason", () => {
    expect(fires("GQL-004", `type Query { a: String @deprecated(reason: "Use b.") }`)).toBe(false);
    expect(fires("GQL-004", `type Query { b: String @deprecated }`)).toBe(true);
  });

  it("GQL-005 fires on non-verb mutations", () => {
    const good = `type Mutation { "Create thing with words." createThing: String }`;
    expect(fires("GQL-005", doc(good))).toBe(false);
    const bad = `type Mutation { "Thing payload here now." thing: String }`;
    expect(fires("GQL-005", doc(bad))).toBe(true);
  });

  it("GQL-006 fires on verb-first queries", () => {
    expect(fires("GQL-006", `type Query { "List all the pets now." pets: String }`)).toBe(false);
    expect(fires("GQL-006", `type Query { "Fetch all the pets now here." getPets: String }`)).toBe(
      true,
    );
  });

  it("GQL-007 fires on snake_case arguments", () => {
    expect(
      fires("GQL-007", `type Query { "Long description for this field." a(petId: ID): String }`),
    ).toBe(false);
    expect(
      fires("GQL-007", `type Query { "Long description for this field." b(pet_id: ID): String }`),
    ).toBe(true);
  });

  it("GQL-008 fires on TODO placeholders", () => {
    expect(fires("GQL-008", `type Query { "A proper description here." a: String }`)).toBe(false);
    expect(fires("GQL-008", `type Query { "TODO: document this field." b: String }`)).toBe(true);
  });
});
