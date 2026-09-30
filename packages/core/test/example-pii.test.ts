import { describe, expect, it } from "vitest";
import { evaluate } from "../src/index.js";
import type { Rule, Spec } from "../src/index.js";

function specWithExample(example: unknown): Spec {
  return {
    inputHash: "abc",
    openapiVersion: "3.1.0",
    sourceLabel: "test.yaml",
    info: { title: "API", version: "1.0.0" },
    servers: [],
    extensions: {},
    operations: [
      {
        method: "get",
        path: "/users",
        operationId: "listUsers",
        summary: "List users",
        description: "Returns users",
        deprecated: false,
        parameters: [],
        responses: [
          {
            status: "200",
            description: "OK",
            content: [
              {
                mediaType: "application/json",
                schema: { type: "object", example },
              },
            ],
            headers: [],
            jsonPointer: "/paths/~1users/get/responses/200",
          },
        ],
        security: undefined,
        extensions: {},
        jsonPointer: "/paths/~1users/get",
      },
    ],
  };
}

const PRIV_RULE: Rule = {
  id: "PRIV-001",
  category: "security",
  severity: "warning",
  message: "Examples must not contain obvious PII.",
  when: { op: "examplePii" },
  packId: "elite",
  packVersion: "test",
};

function findingsFor(example: unknown): number {
  const result = evaluate({
    specs: [specWithExample(example)],
    packs: [{ id: "elite", version: "test", rules: [PRIV_RULE] }],
  });
  expect(result.errors).toEqual([]);
  return result.findings.length;
}

describe("examplePii (f17-compliance-pack)", () => {
  it("flags real-looking emails, E.164 phones and card numbers", () => {
    expect(findingsFor({ email: "jane.doe@acme-corp.com" })).toBe(1);
    expect(findingsFor({ support: "help@bigbank.com.ar" })).toBe(1);
    expect(findingsFor({ phone: "+5491155550123" })).toBe(1);
    expect(findingsFor({ card: "4111 1111 1111 1111" })).toBe(1);
    expect(findingsFor({ card: "5500005555555559" })).toBe(1);
  });

  it("does not flag placeholders or clean values", () => {
    expect(findingsFor({ email: "user@example.com" })).toBe(0);
    expect(findingsFor({ email: "user@example.org" })).toBe(0);
    expect(findingsFor({ email: "string" })).toBe(0);
    expect(findingsFor({ phone: "+1-555-0100" })).toBe(0);
    expect(findingsFor({ card: "0000 0000 0000 0000" })).toBe(0);
    expect(findingsFor({ id: 42, name: "Ada" })).toBe(0);
  });

  it("is deterministic: same example ⇒ same fingerprint", () => {
    const run = () =>
      evaluate({
        specs: [specWithExample({ email: "a@corp.io" })],
        packs: [{ id: "elite", version: "test", rules: [PRIV_RULE] }],
      });
    expect(run().findings[0]!.fingerprint).toBe(run().findings[0]!.fingerprint);
  });
});
