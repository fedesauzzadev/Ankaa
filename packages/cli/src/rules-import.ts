import { extname } from "node:path";
import { createRequire } from "node:module";
import { stringify as stringifyYaml } from "yaml";
import mammoth from "mammoth";
import { redactText } from "@ankaa/reporters";
import { validateRule, type Rule } from "@ankaa/core";
import type { ChatMessage } from "./llm.js";

// pdf-parse v1 runs a file-system self-test when imported as ESM
// (module.parent is undefined), so load it through createRequire.
const cjsRequire = createRequire(import.meta.url);
const pdfParse = cjsRequire("pdf-parse") as (data: Uint8Array) => Promise<{
  text: string;
}>;

export const MAX_CHUNK_CHARS = 8000;

export const SUPPORTED_IMPORT_EXTENSIONS = [
  ".md",
  ".txt",
  ".yaml",
  ".yml",
  ".pdf",
  ".docx",
] as const;

export type SupportedImportExtension = (typeof SUPPORTED_IMPORT_EXTENSIONS)[number];

export async function extractText(
  file: string,
  bytes: Buffer,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ext = extname(file).toLowerCase();
  if (ext === ".md" || ext === ".txt" || ext === ".yaml" || ext === ".yml") {
    const text = bytes.toString("utf8").trim();
    if (text === "") {
      return { ok: false, error: "could not extract text (empty document)" };
    }
    return { ok: true, text };
  }
  if (ext === ".pdf") {
    let text: string;
    try {
      // Fresh copy: readFileSync returns pooled Buffers (byteOffset != 0),
      // which the bundled pdf.js misreads as a corrupt xref table.
      const data = await pdfParse(new Uint8Array(bytes));
      text = data.text.trim();
    } catch (err) {
      return {
        ok: false,
        error: `could not extract text: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (text === "") {
      return {
        ok: false,
        error: "could not extract text (scanned PDFs are not supported)",
      };
    }
    return { ok: true, text };
  }
  if (ext === ".docx") {
    let text: string;
    try {
      const result = await mammoth.extractRawText({ buffer: bytes });
      text = result.value.trim();
    } catch (err) {
      return {
        ok: false,
        error: `could not extract text: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
    if (text === "") {
      return { ok: false, error: "could not extract text (empty document)" };
    }
    return { ok: true, text };
  }
  return {
    ok: false,
    error: `unsupported import extension "${ext || "(none)"}" (supported: ${SUPPORTED_IMPORT_EXTENSIONS.join(", ")})`,
  };
}

export function chunkGuideline(text: string, maxChars: number = MAX_CHUNK_CHARS): string[] {
  const paras = text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const chunks: string[] = [];
  let current = "";
  const push = (): void => {
    if (current !== "") {
      chunks.push(current);
      current = "";
    }
  };
  for (const para of paras) {
    if (para.length > maxChars) {
      push();
      for (let i = 0; i < para.length; i += maxChars) {
        chunks.push(para.slice(i, i + maxChars));
      }
      continue;
    }
    const candidate = current === "" ? para : `${current}\n\n${para}`;
    if (candidate.length > maxChars) {
      push();
      current = para;
    } else {
      current = candidate;
    }
  }
  push();
  return chunks;
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:json)?[ \t]*\r?\n?/gim, "")
    .replace(/```[ \t]*$/gm, "")
    .trim();
}

export function parseRulesEnvelope(text: string): unknown[] {
  const cleaned = stripFences(text);
  const startBracket = cleaned.indexOf("[");
  const startBrace = cleaned.indexOf("{");
  let start = -1;
  if (startBracket >= 0 && (startBrace < 0 || startBracket < startBrace)) {
    const end = cleaned.lastIndexOf("]");
    if (end > startBracket) start = startBracket;
    if (start >= 0) {
      try {
        const parsed: unknown = JSON.parse(cleaned.slice(start, end + 1));
        if (Array.isArray(parsed)) return parsed;
      } catch {
        // fall through to object form
      }
    }
  }
  if (startBrace >= 0) {
    const end = cleaned.lastIndexOf("}");
    if (end > startBrace) {
      try {
        const parsed: unknown = JSON.parse(cleaned.slice(startBrace, end + 1));
        if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
          return [parsed];
        }
      } catch {
        // not parseable
      }
    }
  }
  return [];
}

const CATEGORIES = [
  "naming",
  "structure",
  "docs",
  "errors",
  "security",
  "versioning",
  "pagination",
  "parameters",
  "schemas",
  "deprecation",
  "consistency",
  "performance",
  "custom",
].join(", ");

const DSL_EXAMPLE = JSON.stringify(
  {
    id: "TEAM-001",
    category: "custom",
    severity: "error",
    message: "Every operation must accept x-request-id.",
    fix: "Add a required header parameter named x-request-id.",
    when: { not: { op: "headerRequired", name: "x-request-id" } },
  },
  null,
  2,
);

export function buildImportMessages(chunk: string): ChatMessage[] {
  const system: ChatMessage = {
    role: "system",
    content: [
      "You draft API governance rules from an internal design guideline.",
      'Respond with ONLY a valid JSON array of rule objects: [{"id", "category", "severity", "message", "fix?", "when?"}].',
      "Rules: id matches PREFIX-NNN in capitals using the TEAM- prefix (e.g. TEAM-101); " +
        `category is one of: ${CATEGORIES}; severity is error, warning or info; ` +
        "message is one sentence in English.",
      "when is optional; when present it must use only these matcher ops: " +
        "method, pathMatches, responseMissing, responsePresent, headerRequired, missingField, " +
        "presentField, securityMissing, exampleRequired, docFieldMissing.",
      "Only propose a when clause when the guideline states a checkable condition; otherwise omit when.",
      "Example of one valid rule:",
      DSL_EXAMPLE,
      "Skip anything in the guideline that is not an enforceable rule. Never invent rule ids outside TEAM-NNN.",
    ].join("\n"),
  };
  return [
    system,
    {
      role: "user",
      content: `Guideline (redacted):\n${redactText(chunk)}`,
    },
  ];
}

export interface DraftOutcome {
  valid: Rule[];
  rejected: Array<{ index: number; issues: string[] }>;
}

export function validateDrafts(
  entries: readonly unknown[],
  toolVersion: string,
  eliteRuleIds?: ReadonlySet<string>,
): DraftOutcome {
  const valid: Rule[] = [];
  const rejected: Array<{ index: number; issues: string[] }> = [];
  const seen = new Set<string>();
  for (let index = 0; index < entries.length; index++) {
    const entry = entries[index];
    const stamped =
      entry !== null && typeof entry === "object" && !Array.isArray(entry)
        ? {
            ...(entry as Record<string, unknown>),
            packId: "custom",
            packVersion: toolVersion,
          }
        : entry;
    const result = validateRule(stamped);
    if (!result.ok) {
      rejected.push({ index: index + 1, issues: result.issues });
      continue;
    }
    if (seen.has(result.rule.id)) {
      rejected.push({ index: index + 1, issues: ["duplicate id skipped"] });
      continue;
    }
    if (eliteRuleIds?.has(result.rule.id) === true) {
      rejected.push({
        index: index + 1,
        issues: [
          `rule id ${result.rule.id} already exists in pack elite; use config rules: overrides or a new id`,
        ],
      });
      continue;
    }
    seen.add(result.rule.id);
    valid.push(result.rule);
  }
  return { valid, rejected };
}

function draftEntry(rule: Rule): Record<string, unknown> {
  const entry: Record<string, unknown> = {
    id: rule.id,
    category: rule.category,
    severity: rule.severity,
    message: rule.message,
  };
  if (rule.fix !== undefined) {
    entry.fix = rule.fix;
  }
  if (rule.source !== undefined) {
    entry.source = rule.source;
  }
  if (rule.enabledByDefault !== undefined) {
    entry.enabledByDefault = rule.enabledByDefault;
  }
  if (rule.deprecated !== undefined) {
    entry.deprecated = rule.deprecated;
  }
  entry.when = rule.when;
  return entry;
}

export function serializeRulesDrafts(rules: readonly Rule[]): string {
  return `${stringifyYaml(rules.map(draftEntry))}`;
}
