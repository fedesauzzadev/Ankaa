import { parse as parseYaml } from "yaml";
import { describe, expect, it } from "vitest";
import {
  MAX_CHUNK_CHARS,
  SUPPORTED_IMPORT_EXTENSIONS,
  buildImportMessages,
  chunkGuideline,
  extractText,
  parseRulesEnvelope,
  serializeRulesDrafts,
  validateDrafts,
} from "../src/rules-import.js";

const VALID_A = {
  id: "TEAM-101",
  category: "custom",
  severity: "error",
  message: "Every operation must accept x-request-id.",
  fix: "Add a required header parameter named x-request-id.",
  when: { not: { op: "headerRequired", name: "x-request-id" } },
};

const VALID_B = {
  id: "TEAM-102",
  category: "docs",
  severity: "warning",
  message: "Write operations must document a 400 response.",
  when: { op: "responseMissing", status: "400" },
};

describe("extractText", () => {
  it("AC-RI.1 passes md/txt/yaml through as plain text", async () => {
    for (const ext of [".md", ".txt", ".yaml", ".yml"]) {
      const result = await extractText(`guide${ext}`, Buffer.from("hello\n", "utf8"));
      expect(result).toEqual({ ok: true, text: "hello" });
    }
  });

  it("AC-RI.1 rejects unsupported extensions with the supported list", async () => {
    const result = await extractText("notes.exe", Buffer.from("x", "utf8"));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toContain("unsupported import extension");
      for (const ext of SUPPORTED_IMPORT_EXTENSIONS) {
        expect(result.error).toContain(ext);
      }
    }
  });

  it("rejects empty documents", async () => {
    const result = await extractText("empty.md", Buffer.from("  \n ", "utf8"));
    expect(result).toEqual({
      ok: false,
      error: "could not extract text (empty document)",
    });
  });
});

describe("chunkGuideline", () => {
  it("short text stays in one chunk", () => {
    expect(chunkGuideline("a\n\nb")).toEqual(["a\n\nb"]);
  });

  it("AC-RI.3 long docs split into bounded chunks that rejoin", () => {
    const paras = Array.from(
      { length: 30 },
      (_, i) => `Section ${i}\n${"x".repeat(500)}`,
    );
    const text = paras.join("\n\n");
    expect(text.length).toBeGreaterThan(MAX_CHUNK_CHARS);
    const chunks = chunkGuideline(text);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    }
    expect(chunks.join("\n\n")).toBe(text);
  });

  it("hard-splits a single over-long paragraph", () => {
    const chunks = chunkGuideline("y".repeat(MAX_CHUNK_CHARS + 10));
    expect(chunks).toHaveLength(2);
    expect(chunks.join("")).toBe("y".repeat(MAX_CHUNK_CHARS + 10));
  });
});

describe("parseRulesEnvelope", () => {
  it("AC-RI.4 parses fenced arrays and embedded JSON", () => {
    const fenced = `\`\`\`json\n${JSON.stringify([VALID_A])}\n\`\`\``;
    expect(parseRulesEnvelope(fenced)).toEqual([VALID_A]);
    const embedded = `Here you go:\n${JSON.stringify([VALID_A, VALID_B])}\nDone.`;
    expect(parseRulesEnvelope(embedded)).toEqual([VALID_A, VALID_B]);
  });

  it("AC-RI.4 keeps non-objects for the validator to reject", () => {
    expect(parseRulesEnvelope(JSON.stringify([VALID_A, "nope", 42]))).toEqual([
      VALID_A,
      "nope",
      42,
    ]);
    expect(parseRulesEnvelope("no json here")).toEqual([]);
  });
});

describe("buildImportMessages", () => {
  it("redacts the chunk and documents the DSL contract", () => {
    const messages = buildImportMessages(
      "key AKIAIOSFODNN7EXAMPLE must stay out",
    );
    expect(messages).toHaveLength(2);
    const body = messages.map((m) => m.content).join("\n");
    expect(body).not.toContain("AKIAIOSFODNN7EXAMPLE");
    expect(body).toContain("TEAM-");
    expect(body).toContain("headerRequired");
  });
});

describe("validateDrafts", () => {
  it("AC-RI.5 keeps valid, rejects invalid, skips duplicates", () => {
    const outcome = validateDrafts(
      [
        VALID_A,
        { id: "bad id!!", category: "custom", severity: "error", message: "x", when: { op: "securityMissing" } },
        VALID_B,
        "just a string",
        { ...VALID_A },
        {
          id: "TEAM-999",
          category: "custom",
          severity: "critical",
          message: "x",
          when: { op: "securityMissing" },
        },
        { id: "TEAM-104", category: "custom", severity: "error", message: "x", when: { op: "frobnicate" } },
      ],
      "0.0.0-dev",
      new Set(["TEAM-102"]),
    );
    expect(outcome.valid.map((r) => r.id)).toEqual(["TEAM-101"]);
    expect(outcome.rejected.map((r) => r.index)).toEqual([2, 3, 4, 5, 6, 7]);
    expect(outcome.rejected[1]!.issues.join(" ")).toContain(
      "already exists in pack elite",
    );
    expect(outcome.rejected[3]!.issues).toEqual(["duplicate id skipped"]);
  });
});

describe("serializeRulesDrafts", () => {
  it("emits team-rules.yaml-shaped YAML without pack stamping", () => {
    const outcome = validateDrafts([VALID_A, VALID_B], "0.0.0-dev");
    expect(outcome.rejected).toEqual([]);
    const text = serializeRulesDrafts(outcome.valid);
    const parsed = parseYaml(text) as Array<Record<string, unknown>>;
    expect(parsed).toHaveLength(2);
    expect(parsed[0]).toEqual(VALID_A);
    expect(parsed[1]).toEqual(VALID_B);
    expect("packId" in parsed[0]!).toBe(false);
  });
});
