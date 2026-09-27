import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  evaluate,
  flattenRuleLists,
  loadPack,
} from "@apigovscan/core";
import { parseSpec } from "@apigovscan/openapi";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const packDir = join(repoRoot, "packs", "elite");

function loadElitePack() {
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

const loaded = loadElitePack();
if (!loaded.ok) {
  throw new Error(`elite pack failed to load: ${JSON.stringify(loaded.errors)}`);
}

type Json = Record<string, unknown>;

function resp(
  description: string,
  extra: Json = {},
): Json {
  return { description, ...extra };
}

function jsonContent(schema: Json, extra: Json = {}): Json {
  return { "application/json": { schema, ...extra } };
}

function opBase(over: Json = {}): Json {
  const { responses, ...rest } = over;
  return {
    operationId: "op1",
    summary: "Do the thing",
    description: "Does the thing in detail with enough words to pass length gates.",
    ...rest,
    responses: (responses ?? {
      "200": resp("The successful operation result payload here.", {
        content: jsonContent({ type: "object" }),
      }),
    }) as Json,
  };
}

function doc(paths: Json, openapi = "3.1.0"): string {
  return JSON.stringify({
    openapi,
    info: {
      title: "T",
      version: "1.0.0",
      description: "Inline fixture spec with a proper description.",
    },
    paths,
  });
}

function fires(ruleId: string, body: string): boolean {
  const parsed = parseSpec(body, { sourceLabel: "inline.json" });
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) return false;
  const result = evaluate({ specs: [parsed.spec], packs: [loaded.pack] });
  expect(result.errors).toEqual([]);
  return result.findings.some((f) => f.ruleId === ruleId);
}

function bodyWith(content: Json): Json {
  return { content };
}

const NEW_RULES: Array<{ id: string; severity: "warning" | "info" }> = [
  { id: "RESP-006", severity: "warning" },
  { id: "RESP-007", severity: "warning" },
  { id: "RESP-008", severity: "warning" },
  { id: "RESP-009", severity: "warning" },
  { id: "RESP-010", severity: "warning" },
  { id: "RESP-011", severity: "warning" },
  { id: "RESP-012", severity: "warning" },
  { id: "RESP-013", severity: "warning" },
  { id: "RESP-014", severity: "warning" },
  { id: "RESP-015", severity: "warning" },
  { id: "RESP-016", severity: "warning" },
  { id: "ERR-007", severity: "warning" },
  { id: "ERR-008", severity: "warning" },
  { id: "ERR-009", severity: "warning" },
  { id: "AUTH-006", severity: "warning" },
  { id: "NAMING-011", severity: "warning" },
  { id: "PARAM-008", severity: "warning" },
  { id: "PARAM-009", severity: "warning" },
  { id: "DOCS-007", severity: "info" },
  { id: "DOCS-008", severity: "info" },
  { id: "SCHEMA-006", severity: "warning" },
  { id: "STRUCT-007", severity: "info" },
  { id: "DEPR-003", severity: "warning" },
];

describe("elite-100 inventory (M8.5)", () => {
  it("holds 88 active rules (65 + 23)", () => {
    expect(loaded.pack.rules).toHaveLength(88);
  });

  it("contains every new rule id with the expected severity", () => {
    const byId = new Map(loaded.pack.rules.map((r) => [r.id, r.severity]));
    for (const { id, severity } of NEW_RULES) {
      expect(byId.get(id)).toBe(severity);
    }
  });
});

describe("RESP new rules", () => {
  it("RESP-006 fires on GET with requestBody", () => {
    const bad = doc({
      "/pets": {
        get: opBase({ requestBody: bodyWith(jsonContent({ type: "object" })) }),
      },
    });
    expect(fires("RESP-006", bad)).toBe(true);
    expect(fires("RESP-006", doc({ "/pets": { get: opBase() } }))).toBe(false);
  });

  it("RESP-007 fires on POST without 201", () => {
    const bad = doc({ "/pets": { post: opBase() } });
    const good = doc({
      "/pets": {
        post: opBase({
          responses: {
            "201": resp("The created pet resource.", {
              content: jsonContent({ type: "object" }),
            }),
          },
        }),
      },
    });
    expect(fires("RESP-007", bad)).toBe(true);
    expect(fires("RESP-007", good)).toBe(false);
  });

  it("RESP-008 fires on GET 200 without content", () => {
    const bad = doc({
      "/pets": { get: opBase({ responses: { "200": resp("A list of pets.") } }) },
    });
    expect(fires("RESP-008", bad)).toBe(true);
    expect(fires("RESP-008", doc({ "/pets": { get: opBase() } }))).toBe(false);
  });

  it("RESP-009 fires on PUT 200 without content", () => {
    const bad = doc({
      "/pets/1": {
        put: opBase({ responses: { "200": resp("The updated pet.") } }),
      },
    });
    expect(fires("RESP-009", bad)).toBe(true);
    expect(
      fires("RESP-009", doc({ "/pets/1": { put: opBase() } })),
    ).toBe(false);
  });

  it("RESP-010 fires on PUT without 404", () => {
    const bad = doc({ "/pets/1": { put: opBase() } });
    const good = doc({
      "/pets/1": {
        put: opBase({
          responses: {
            "200": resp("The updated pet resource payload.", {
              content: jsonContent({ type: "object" }),
            }),
            "404": resp("No pet exists with that identifier."),
          },
        }),
      },
    });
    expect(fires("RESP-010", bad)).toBe(true);
    expect(fires("RESP-010", good)).toBe(false);
  });

  it("RESP-011 fires on 405 without Allow header", () => {
    const bad = doc({
      "/pets": {
        get: opBase({ responses: { "405": resp("Method not allowed here.") } }),
      },
    });
    const good = doc({
      "/pets": {
        get: opBase({
          responses: {
            "405": resp("Method not allowed here.", {
              headers: { Allow: resp("Supported methods.") },
            }),
          },
        }),
      },
    });
    expect(fires("RESP-011", bad)).toBe(true);
    expect(fires("RESP-011", good)).toBe(false);
  });

  it("RESP-012 fires on 202 without Location header", () => {
    const bad = doc({
      "/jobs": {
        post: opBase({ responses: { "202": resp("Job accepted for processing.") } }),
      },
    });
    const good = doc({
      "/jobs": {
        post: opBase({
          responses: {
            "202": resp("Job accepted for processing.", {
              headers: { Location: resp("Status monitor URL.") },
            }),
          },
        }),
      },
    });
    expect(fires("RESP-012", bad)).toBe(true);
    expect(fires("RESP-012", good)).toBe(false);
  });

  it("RESP-013 fires on POST with body but no 400", () => {
    const bad = doc({
      "/pets": {
        post: opBase({ requestBody: bodyWith(jsonContent({ type: "object" })) }),
      },
    });
    const good = doc({
      "/pets": {
        post: opBase({
          requestBody: bodyWith(jsonContent({ type: "object" })),
          responses: {
            "200": resp("The created pet resource payload.", {
              content: jsonContent({ type: "object" }),
            }),
            "201": resp("The created pet.", {
              content: jsonContent({ type: "object" }),
            }),
            "400": resp("The request body was malformed."),
          },
        }),
      },
    });
    expect(fires("RESP-013", bad)).toBe(true);
    expect(fires("RESP-013", good)).toBe(false);
  });

  it("RESP-014 fires on POST 200 without content", () => {
    const bad = doc({
      "/pets": {
        post: opBase({ responses: { "200": resp("The created pet.") } }),
      },
    });
    const good = doc({ "/pets": { post: opBase() } });
    expect(fires("RESP-014", bad)).toBe(true);
    expect(fires("RESP-014", good)).toBe(false);
  });

  it("RESP-015 fires on PUT without requestBody", () => {
    const bad = doc({ "/pets/1": { put: opBase() } });
    const good = doc({
      "/pets/1": {
        put: opBase({ requestBody: bodyWith(jsonContent({ type: "object" })) }),
      },
    });
    expect(fires("RESP-015", bad)).toBe(true);
    expect(fires("RESP-015", good)).toBe(false);
  });

  it("RESP-016 fires on OPTIONS with requestBody", () => {
    const bad = doc({
      "/pets": {
        options: opBase({
          requestBody: bodyWith(jsonContent({ type: "object" })),
        }),
      },
    });
    expect(fires("RESP-016", bad)).toBe(true);
    expect(
      fires("RESP-016", doc({ "/pets": { options: opBase() } })),
    ).toBe(false);
  });
});

describe("ERR new rules", () => {
  it("ERR-007 fires on 429 without Retry-After", () => {
    const bad = doc({
      "/pets": {
        get: opBase({ responses: { "429": resp("Too many requests.") } }),
      },
    });
    const good = doc({
      "/pets": {
        get: opBase({
          responses: {
            "429": resp("Too many requests.", {
              headers: { "Retry-After": resp("Seconds to wait.") },
            }),
          },
        }),
      },
    });
    expect(fires("ERR-007", bad)).toBe(true);
    expect(fires("ERR-007", good)).toBe(false);
  });

  it("ERR-008 fires on 401 without WWW-Authenticate", () => {
    const bad = doc({
      "/pets": {
        get: opBase({ responses: { "401": resp("Missing credentials.") } }),
      },
    });
    const good = doc({
      "/pets": {
        get: opBase({
          responses: {
            "401": resp("Missing credentials.", {
              headers: { "WWW-Authenticate": resp("Auth challenge.") },
            }),
          },
        }),
      },
    });
    expect(fires("ERR-008", bad)).toBe(true);
    expect(fires("ERR-008", good)).toBe(false);
  });

  it("ERR-009 fires on 407 without Proxy-Authenticate", () => {
    const bad = doc({
      "/pets": {
        get: opBase({ responses: { "407": resp("Proxy auth required.") } }),
      },
    });
    const good = doc({
      "/pets": {
        get: opBase({
          responses: {
            "407": resp("Proxy auth required.", {
              headers: { "Proxy-Authenticate": resp("Proxy challenge.") },
            }),
          },
        }),
      },
    });
    expect(fires("ERR-009", bad)).toBe(true);
    expect(fires("ERR-009", good)).toBe(false);
  });
});

describe("AUTH/NAMING/PARAM new rules", () => {
  it("AUTH-006 fires on credential query params", () => {
    const bad = doc({
      "/pets": {
        get: opBase({
          parameters: [
            { name: "api_key", in: "query", schema: { type: "string" } },
          ],
        }),
      },
    });
    const good = doc({
      "/pets": {
        get: opBase({
          parameters: [
            { name: "verbose", in: "query", schema: { type: "boolean" } },
          ],
        }),
      },
    });
    expect(fires("AUTH-006", bad)).toBe(true);
    expect(fires("AUTH-006", good)).toBe(false);
  });

  it("NAMING-011 fires on paths with query strings", () => {
    const bad = doc({ "/pets?active=true": { get: opBase() } });
    expect(fires("NAMING-011", bad)).toBe(true);
    expect(fires("NAMING-011", doc({ "/pets": { get: opBase() } }))).toBe(
      false,
    );
  });

  it("PARAM-008 fires on snake_case path params", () => {
    const bad = doc({
      "/pets/{pet_id}": {
        get: opBase({
          parameters: [
            {
              name: "pet_id",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
        }),
      },
    });
    const good = doc({
      "/pets/{petId}": {
        get: opBase({
          parameters: [
            {
              name: "petId",
              in: "path",
              required: true,
              schema: { type: "string" },
            },
          ],
        }),
      },
    });
    expect(fires("PARAM-008", bad)).toBe(true);
    expect(fires("PARAM-008", good)).toBe(false);
  });

  it("PARAM-009 fires on snake_case cookie params", () => {
    const bad = doc({
      "/pets": {
        get: opBase({
          parameters: [
            { name: "session_id", in: "cookie", schema: { type: "string" } },
          ],
        }),
      },
    });
    const good = doc({
      "/pets": {
        get: opBase({
          parameters: [
            { name: "sessionId", in: "cookie", schema: { type: "string" } },
          ],
        }),
      },
    });
    expect(fires("PARAM-009", bad)).toBe(true);
    expect(fires("PARAM-009", good)).toBe(false);
  });
});

describe("DOCS/SCHEMA/STRUCT/DEPR new rules", () => {
  it("DOCS-007 fires on TODO placeholders in descriptions", () => {
    const bad = doc({
      "/pets": {
        get: opBase({ description: "TODO: document this properly." }),
      },
    });
    expect(fires("DOCS-007", bad)).toBe(true);
    expect(fires("DOCS-007", doc({ "/pets": { get: opBase() } }))).toBe(false);
  });

  it("DOCS-008 fires on short response descriptions", () => {
    const bad = doc({
      "/pets": { get: opBase({ responses: { "200": resp("ok") } }) },
    });
    expect(fires("DOCS-008", bad)).toBe(true);
    expect(fires("DOCS-008", doc({ "/pets": { get: opBase() } }))).toBe(false);
  });

  it("SCHEMA-006 fires on nesting deeper than 3", () => {
    const deep = { type: "object", properties: {} as Json };
    let cursor = deep;
    for (let i = 0; i < 4; i += 1) {
      const next: Json = { type: "object", properties: {} };
      (cursor.properties as Json)[`l${i}`] = next;
      cursor = next as { type: string; properties: Json };
    }
    const bad = doc({
      "/pets": {
        get: opBase({
          responses: {
            "200": resp("The successful operation result payload here.", {
              content: jsonContent(deep),
            }),
          },
        }),
      },
    });
    expect(fires("SCHEMA-006", bad)).toBe(true);
    expect(fires("SCHEMA-006", doc({ "/pets": { get: opBase() } }))).toBe(
      false,
    );
  });

  it("STRUCT-007 fires on OpenAPI 3.0 documents", () => {
    const bad = doc({ "/pets": { get: opBase() } }, "3.0.3");
    expect(fires("STRUCT-007", bad)).toBe(true);
    expect(
      fires("STRUCT-007", doc({ "/pets": { get: opBase() } }, "3.1.0")),
    ).toBe(false);
  });

  it("DEPR-003 fires on deprecated ops without Sunset/Deprecation", () => {
    const bad = doc({ "/pets": { get: opBase({ deprecated: true }) } });
    const good = doc({
      "/pets": {
        get: opBase({
          deprecated: true,
          responses: {
            "200": resp("The successful operation result payload here.", {
              content: jsonContent({ type: "object" }),
              headers: { Sunset: resp("Retirement date.") },
            }),
          },
        }),
      },
    });
    expect(fires("DEPR-003", bad)).toBe(true);
    expect(fires("DEPR-003", good)).toBe(false);
  });
});
