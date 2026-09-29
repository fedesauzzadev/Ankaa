import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { looksLikeWebhooks, parseWebhooks } from "../src/index.js";

const fixturesDir = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "fixtures",
  "webhooks",
);

function readFixture(name: string): string {
  return readFileSync(join(fixturesDir, name), "utf8");
}

describe("parseWebhooks (f8-webhooks)", () => {
  it("AC-WH.1 maps events to post operations with slashed paths", () => {
    const parsed = parseWebhooks(readFixture("valid.yaml"), {
      sourceLabel: "valid.yaml",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const { spec } = parsed;
    expect(spec.openapiVersion).toBe("webhooks");
    expect(spec.info.title).toBe("Billing webhooks");
    const byId = new Map(spec.operations.map((op) => [op.operationId, op]));
    expect(byId.get("user.created")?.method).toBe("post");
    expect(byId.get("user.created")?.path).toBe("/user/created");
    expect(byId.get("user.created")?.description).toContain("signs up");
    expect(byId.get("invoice.paid.v2") ?? byId.get("order.created")).toBeDefined();
    expect(byId.get("order.created")?.path).toBe("/order/created");
    expect(spec.operations).toHaveLength(3);
  });

  it("AC-WH.2 maps payloads and headers, resolves local refs", () => {
    const parsed = parseWebhooks(readFixture("valid.yaml"), {
      sourceLabel: "valid.yaml",
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const byId = new Map(parsed.spec.operations.map((op) => [op.operationId, op]));
    const good = byId.get("user.created");
    expect(good?.requestBody?.content[0]?.mediaType).toBe("application/json");
    expect(good?.requestBody?.content[0]?.schema?.properties?.["userId"]).toEqual({
      type: "string",
      description: "Identifier of the user.",
    });
    const headerNames = (good?.parameters ?? []).map((p) => p.name);
    expect(headerNames).toEqual(["webhook-signature"]);
    expect(good?.responses[0]?.status).toBe("200");
  });

  it("AC-WH.2 rejects remote refs honestly", () => {
    const doc = `version: "1"\ninfo:\n  title: T\n  version: "1"\nwebhooks:\n  user.created:\n    description: A sufficiently long description here.\n    payload:\n      $ref: https://example.com/schema.json\n`;
    const parsed = parseWebhooks(doc, { sourceLabel: "remote.yaml" });
    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;
    expect(parsed.errors[0]?.message).toMatch("REMOTE_REF");
  });

  it("AC-WH.3 rejects invalid roots and warns on empty", () => {
    const broken = parseWebhooks(readFixture("invalid.yaml"), {
      sourceLabel: "invalid.yaml",
    });
    expect(broken.ok).toBe(false);
    const empty = parseWebhooks(readFixture("no-events.yaml"), {
      sourceLabel: "no-events.yaml",
    });
    expect(empty.ok).toBe(true);
    if (!empty.ok) return;
    expect(empty.spec.parseWarnings.map((w) => w.code)).toEqual(["webhooks-no-events"]);
    const big = parseWebhooks("xx", {
      sourceLabel: "big.yaml",
      limits: { maxBytes: 1 },
    });
    expect(big.ok).toBe(false);
    if (big.ok) return;
    expect(big.errors[0]?.message).toMatch("SIZE_LIMIT");
  });

  it("sniff is conservative against OpenAPI and AsyncAPI", () => {
    expect(looksLikeWebhooks(readFixture("valid.yaml"))).toBe(true);
    expect(looksLikeWebhooks(readFixture("openapi-3.1-with-webhooks.yaml"))).toBe(false);
    expect(looksLikeWebhooks("openapi: 3.0.0\ninfo:\n  title: T\n")).toBe(false);
    expect(looksLikeWebhooks('asyncapi: "2.6.0"\ninfo:\n  title: T\n')).toBe(false);
  });
});
